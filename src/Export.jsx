import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useApp, useOperations } from './contexte.jsx';
import { NavPeriode, Tabs, Tuile, useFlash } from './ui.jsx';
import { supabase } from './api.js';
import { PERIODES, decaler, eur, dansPeriode } from './format.js';
import { bilanPro, mouvementEspeces, porteur } from './calculs.js';
import { SECTEURS, construireBilan, nomFichier, telecharger } from './export.js';

export default function Export({ params }) {
  const { profil, membres, famille, activites, toutesActivites, estGestionnaire, rev } = useApp();
  const flash = useFlash();
  const [mode, setMode] = useState(params?.mode || 'mois');
  const [ref, setRef] = useState(params?.ref || new Date());
  const permis = SECTEURS.filter(([k]) => k !== 'pro' || estGestionnaire);
  const [secteurs, setSecteurs] = useState(params?.secteurs || permis.map(([k]) => k));
  const p = PERIODES[mode](ref);
  const { ops, chargement } = useOperations(p.debut, p.fin);
  const [projets, setProjets] = useState({ projets: [], ops: [] });

  useEffect(() => {
    Promise.all([
      supabase.from('projets').select('*, projet_participants(*)'),
      supabase.from('projet_operations').select('*').eq('archive', false).gte('date_op', p.debut).lte('date_op', p.fin),
    ]).then(([a, b]) => setProjets({ projets: a.data || [], ops: b.data || [] }));
  }, [p.debut, p.fin, rev]);

  const tous = secteurs.length === permis.length;
  const basculer = (k) => setSecteurs((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const apercu = useMemo(() => {
    const o = ops.filter((x) => !x.archive && dansPeriode(x, p));
    const b = bilanPro(o, p);
    return {
      perso: o.filter((x) => x.espace === 'perso' && x.sens === 'depense' && (estGestionnaire || x.proprietaire === profil.id)).reduce((s, x) => s + Number(x.montant), 0),
      commun: o.filter((x) => x.espace === 'commun' && x.sens === 'depense').reduce((s, x) => s + Number(x.montant), 0),
      pro: b, nbResa: b.reservations.length,
      especes: o.filter((x) => mouvementEspeces(x) < 0 && (estGestionnaire || porteur(x) === profil.id)).reduce((s, x) => s - mouvementEspeces(x), 0),
      projets: projets.ops.filter((x) => x.sens === 'depense').reduce((s, x) => s + Number(x.montant), 0),
    };
  }, [ops, p, projets, estGestionnaire, profil.id]);

  function exporter() {
    if (!secteurs.length) return flash('Choisissez au moins un secteur.', 'erreur');
    try {
      const ordre = permis.map(([k]) => k).filter((k) => secteurs.includes(k));
      const wb = construireBilan({ periode: p, mode, secteurs: ordre, ops, projets: projets.projets, projetOps: projets.ops, membres, famille, activites: toutesActivites || activites, estGestionnaire, profil });
      telecharger(wb, nomFichier(p, ordre.length === SECTEURS.length ? ordre : ordre));
      flash('Bilan téléchargé. Ouvrez-le avec Excel ou Google Sheets.');
    } catch (e) { flash('Le fichier n\'a pas pu être créé. Réessayez.', 'erreur'); }
  }

  return (
    <div className="page">
      <h2 className="titre-page">Exporter un bilan</h2>
      <Tabs valeur={mode} onChange={setMode} options={[['mois', 'Mois'], ['trimestre', 'Trimestre'], ['annee', 'Année']]} />
      <section className="bandeau">
        <NavPeriode label={p.label} onPrec={() => setRef(decaler(ref, mode, -1))} onSuiv={() => setRef(decaler(ref, mode, 1))} />
      </section>

      <h3 className="titre-section">Secteurs</h3>
      <div className="choixpers">
        <button type="button" className={tous ? 'actif' : ''} aria-pressed={tous} onClick={() => setSecteurs(tous ? [] : permis.map(([k]) => k))}>Tous</button>
        {permis.map(([k, l]) => <button type="button" key={k} className={secteurs.includes(k) ? 'actif' : ''} aria-pressed={secteurs.includes(k)} onClick={() => basculer(k)}>{l}</button>)}
      </div>

      <h3 className="titre-section">Aperçu</h3>
      <div className="tuiles">
        {secteurs.includes('perso') && <Tuile label="Perso (dépenses)" valeur={eur(apercu.perso)} ton="encours" />}
        {secteurs.includes('commun') && <Tuile label="Commun (dépenses)" valeur={eur(apercu.commun)} ton="info" />}
        {secteurs.includes('pro') && <Tuile label="Pro (résultat)" valeur={eur(apercu.pro.resultatHT)} ton={apercu.pro.resultatHT >= 0 ? 'succes' : 'erreur'} sous={`${apercu.nbResa} réservation(s), ${eur(apercu.pro.netRecu)} net reçu`} />}
        {secteurs.includes('especes') && <Tuile label="Espèces dépensées" valeur={eur(apercu.especes)} ton="encours" />}
        {secteurs.includes('projets') && <Tuile label="Projets (dépenses)" valeur={eur(apercu.projets)} ton="info" />}
      </div>

      <button className="btn btn-primaire btn-grand btn-plein" disabled={chargement || !secteurs.length} onClick={exporter}><FileSpreadsheet size={22} /> Télécharger le bilan (Excel)</button>
      <p className="texte-doux petit">Le fichier contient un résumé{mode !== 'mois' ? ' mois par mois' : ''}, puis une feuille par secteur avec toutes les lignes.{secteurs.includes('pro') ? ' La feuille « Réservations » donne pour chaque séjour le voyageur, la référence, le montant total, les frais de la plateforme et le net reçu.' : ''}</p>
    </div>
  );
}
