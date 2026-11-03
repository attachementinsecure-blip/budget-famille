import { useMemo, useState } from 'react';
import { AlertTriangle, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useApp, useOperations, useFixes } from './contexte.jsx';
import { NavPeriode, Tabs, Tuile } from './ui.jsx';
import { periodeMois, periodeSemaine, decaler, eur, aujourdhui, moisCle } from './format.js';
import { fichePersonne, totauxFamille, projectionMois, pointsAttention, evolution, bilanPro } from './calculs.js';

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export default function Bilan() {
  const { profil, membres, estGestionnaire } = useApp();
  const [mode, setMode] = useState('mois');
  const [ref, setRef] = useState(new Date());
  const per = mode === 'mois' ? periodeMois : periodeSemaine;
  const p = per(ref), avant = per(decaler(ref, mode, -1));
  const debutCharge = periodeMois(decaler(ref, 'mois', -5)).debut;
  const { ops } = useOperations(debutCharge < avant.debut ? debutCharge : avant.debut, p.fin);
  const fixes = useFixes();

  const actuel = totauxFamille(ops, p), precedent = totauxFamille(ops, avant);
  const moi = fichePersonne(ops, profil.id, p), moiAvant = fichePersonne(ops, profil.id, avant);
  const mois = moisCle(ref);
  const pointes = new Set(ops.filter((o) => o.fixe_id && o.mois_fixe === mois).map((o) => o.fixe_id));
  const pts = pointsAttention({ actuel, precedent, membres, ops, periode: p, fixes: mode === 'mois' ? fixes : [], pointes, estGestionnaire });

  const total = estGestionnaire ? actuel.depenses : moi.total;
  const totalAvant = estGestionnaire ? precedent.depenses : moiAvant.total;
  const delta = evolution(total, totalAvant);
  const projection = mode === 'mois' ? projectionMois(total, p, aujourdhui()) : null;

  const tendance = useMemo(() => {
    if (mode !== 'mois') return [];
    return [5, 4, 3, 2, 1, 0].map((n) => {
      const d = decaler(ref, 'mois', -n), pm = periodeMois(d);
      return { nom: MOIS_COURTS[d.getMonth()], valeur: estGestionnaire ? totauxFamille(ops, pm).depenses : fichePersonne(ops, profil.id, pm).total, actuel: n === 0 };
    });
  }, [ops, ref, mode, estGestionnaire, profil.id]);

  const cats = Object.entries(estGestionnaire ? actuel.parCat : Object.fromEntries(moi.topCats)).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));
  const personnes = estGestionnaire ? membres : membres.filter((m) => m.id === profil.id);
  const pro = estGestionnaire ? bilanPro(ops, p) : null, proAvant = estGestionnaire ? bilanPro(ops, avant) : null;

  return (
    <div className="page">
      <Tabs valeur={mode} onChange={setMode} options={[['semaine', 'Semaine'], ['mois', 'Mois']]} />
      <section className="bandeau">
        <NavPeriode label={p.label} onPrec={() => setRef(decaler(ref, mode, -1))} onSuiv={() => setRef(decaler(ref, mode, 1))} />
        <p className="bandeau-label">{estGestionnaire ? 'Dépenses de la famille' : 'Mes dépenses'}</p>
        <p className="bandeau-chiffre">{eur(total)}</p>
        <p className="bandeau-sous">
          {delta === null ? 'Pas de comparaison possible' : <>
            {delta > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />} {delta > 0 ? '+' : ''}{delta} % par rapport à la période précédente
          </>}
        </p>
        {projection !== null && <p className="bandeau-sous">À ce rythme : environ {eur(projection)} à la fin du mois</p>}
      </section>

      {pts.length > 0 && <>
        <h3 className="titre-section">Points d'attention</h3>
        <ul className="points">
          {pts.map((x, i) => <li key={i} className={`point ton-${x.niveau}`}>{x.niveau === 'alerte' ? <AlertTriangle size={18} /> : <Info size={18} />}<span>{x.texte}</span></li>)}
        </ul>
      </>}

      {tendance.length > 0 && <>
        <h3 className="titre-section">Les 6 derniers mois</h3>
        <div className="carte graphe">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={tendance} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <XAxis dataKey="nom" tick={{ fill: '#9fb0c6', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9fb0c6', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} formatter={(v) => eur(v)} contentStyle={{ background: '#1b2940', border: '1px solid #29374c', borderRadius: 12, color: '#f4f7fb' }} />
              <Bar dataKey="valeur" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {tendance.map((t, i) => <Cell key={i} fill={t.actuel ? '#d9fc59' : '#29374c'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>}

      <h3 className="titre-section">{estGestionnaire ? 'Par personne' : 'Mon détail'}</h3>
      <div className="fiches">
        {personnes.map((m) => {
          const fi = fichePersonne(ops, m.id, p);
          return (
            <div key={m.id} className="carte fiche">
              <div className="fiche-tete"><strong>{m.prenom}</strong><span>{eur(fi.total)}</span></div>
              <dl>
                <dt>Perso</dt><dd>{eur(fi.depensesPerso)}</dd>
                <dt>Part commune</dt><dd>{eur(fi.partCommune)}</dd>
                <dt>Payé pour le foyer</dt><dd>{eur(fi.payePourFoyer)}</dd>
                <dt>Rentrées</dt><dd className="positif">{eur(fi.rentrees)}</dd>
                <dt>Saisies</dt><dd>{fi.saisies}</dd>
              </dl>
              {fi.topCats.length > 0 && <p className="texte-doux petit">Surtout : {fi.topCats.map((c) => c[0]).join(', ')}</p>}
            </div>
          );
        })}
      </div>

      <h3 className="titre-section">Par catégorie</h3>
      {cats.length === 0 ? <p className="carte texte-doux">Aucune dépense sur cette période.</p> : (
        <div className="carte barres">
          {cats.map(([c, v]) => {
            const ev = estGestionnaire ? evolution(v, precedent.parCat[c]) : null;
            return (
              <div key={c} className="barre">
                <div className="barre-tete"><span>{c}</span><span>{eur(v)}{ev !== null && <em className={ev > 0 ? 'hausse' : 'baisse'}> {ev > 0 ? '+' : ''}{ev} %</em>}</span></div>
                <div className="barre-fond"><span style={{ width: `${(v / maxCat) * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}

      {pro && pro.ops.length > 0 && <>
        <h3 className="titre-section">Activité pro</h3>
        <div className="tuiles">
          <Tuile label="Recettes" valeur={eur(pro.recettes)} ton="succes" sous={proAvant.recettes ? `${evolution(pro.recettes, proAvant.recettes)} % vs avant` : null} />
          <Tuile label="Résultat HT" valeur={eur(pro.resultatHT)} ton={pro.resultatHT >= 0 ? 'succes' : 'erreur'} />
        </div>
      </>}
    </div>
  );
}
