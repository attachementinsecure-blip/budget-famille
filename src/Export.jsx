import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useApp, useOperations } from './contexte.jsx';
import { NavPeriode, Tabs, Tuile, useFlash } from './ui.jsx';
import { supabase } from './api.js';
import { PERIODES, decaler, eur, dansPeriode } from './format.js';
import { mouvementEspeces, porteur, bilanProjet } from './calculs.js';
import { SECTEURS, construireBilan, nomFichier, telecharger } from './export.js';

// Puces « Tous / un par un »
function Choix({ titre, options, valeur, onChange }) {
  const tous = !valeur.length;
  return (
    <>
      <h3 className="titre-section">{titre}</h3>
      <div className="choixpers">
        <button type="button" className={tous ? 'actif' : ''} aria-pressed={tous} onClick={() => onChange([])}>Tous</button>
        {options.map(([k, l]) => {
          const actif = !tous && valeur.includes(k);
          return <button type="button" key={k} className={actif ? 'actif' : ''} aria-pressed={actif}
            onClick={() => onChange(actif ? valeur.filter((x) => x !== k) : [...valeur, k])}>{l}</button>;
        })}
      </div>
    </>
  );
}

export default function Export({ params }) {
  const projRes = (po) => pj.projets.filter((x) => !projChoisis.length || projChoisis.includes(x.id)).reduce((s, x) => s + bilanProjet(po.filter((y) => y.projet_id === x.id), x.projet_participants || []).resultat, 0);
  const { profil, membres, famille, toutesActivites, activites, estGestionnaire, rev } = useApp();
  const flash = useFlash();
  const [mode, setMode] = useState(params?.mode || 'mois');
  const [ref, setRef] = useState(params?.ref ? new Date(params.ref) : new Date());
  const [pj, setPj] = useState({ projets: [], ops: [] });
  const pjVisibles = pj.projets.length > 0;
  const permis = SECTEURS.filter(([k]) => k !== 'projets' || estGestionnaire || pjVisibles);
  const [secteurs, setSecteurs] = useState(params?.secteurs || []);
  const [projChoisis, setProjChoisis] = useState(params?.projets || []);
  const secteursEff = secteurs.length ? secteurs : permis.map(([k]) => k);
  const p = PERIODES[mode](ref);
  const { ops, chargement } = useOperations(p.debut, p.fin);


  useEffect(() => {
    Promise.all([
      supabase.from('projets').select('*, projet_participants(*)').order('cree_le'),
      supabase.from('projet_operations').select('*').eq('archive', false),
    ]).then(([a, b]) => setPj({ projets: a.data || [], ops: b.data || [] }));
  }, [rev]);

  const lesProjets = pj.projets.filter((x) => !x.archive || pj.ops.some((y) => y.projet_id === x.id && dansPeriode(y, p)));
  const avec = (k) => secteursEff.includes(k);

  const apercu = useMemo(() => {
    const o = ops.filter((x) => !x.archive && dansPeriode(x, p));
    const po = pj.ops.filter((x) => dansPeriode(x, p) && (!projChoisis.length || projChoisis.includes(x.projet_id)));
    return {
      perso: o.filter((x) => x.espace === 'perso' && x.sens === 'depense' && (estGestionnaire || x.proprietaire === profil.id)).reduce((s, x) => s + Number(x.montant), 0),
      commun: o.filter((x) => x.espace === 'commun' && x.sens === 'depense').reduce((s, x) => s + Number(x.montant), 0),
      especes: o.filter((x) => mouvementEspeces(x) < 0 && (estGestionnaire || porteur(x) === profil.id)).reduce((s, x) => s - mouvementEspeces(x), 0),
      projets: projRes(po), nbProjOps: po.length,
    };
  }, [ops, p, pj, projChoisis, estGestionnaire, profil.id]);

  function exporter() {
    try {
      const ordre = permis.map(([k]) => k).filter((k) => secteursEff.includes(k));
      const wb = construireBilan({
        periode: p, mode, secteurs: ordre, ops, projets: pj.projets, projetOps: pj.ops, projetOpsTout: pj.ops, membres, famille,
        activites: toutesActivites || activites,
        projetsChoisis: avec('projets') && projChoisis.length ? projChoisis : null, estGestionnaire, profil,
      });
      const precision = [
        ...(avec('projets') && projChoisis.length ? projChoisis.map((id) => lesProjets.find((x) => x.id === id)?.nom) : []),
      ].filter(Boolean).join('-');
      telecharger(wb, nomFichier(p, ordre, precision));
      flash('Bilan téléchargé. Les onglets en bas du fichier donnent le détail.');
    } catch (e) { console.error(e); flash('Le fichier n\'a pas pu être créé. Réessayez.', 'erreur'); }
  }

  return (
    <div className="page">
      <h2 className="titre-page">Exporter un bilan</h2>
      <Tabs valeur={mode} onChange={setMode} options={[['mois', 'Mois'], ['trimestre', 'Trimestre'], ['annee', 'Année']]} />
      <section className="bandeau">
        <NavPeriode label={p.label} onPrec={() => setRef(decaler(ref, mode, -1))} onSuiv={() => setRef(decaler(ref, mode, 1))} />
      </section>

      <Choix titre="Secteurs" options={permis} valeur={secteurs} onChange={setSecteurs} />
      {avec('projets') && lesProjets.length > 0 && <Choix titre="Projets" options={lesProjets.map((x) => [x.id, x.nom])} valeur={projChoisis} onChange={setProjChoisis} />}

      <h3 className="titre-section">Aperçu</h3>
      <div className="tuiles">
        {avec('perso') && <Tuile label="Perso (dépenses)" valeur={eur(apercu.perso)} ton="encours" />}
        {avec('commun') && <Tuile label="Commun (dépenses)" valeur={eur(apercu.commun)} ton="info" />}
        {avec('especes') && <Tuile label="Espèces dépensées" valeur={eur(apercu.especes)} ton="encours" />}
        {avec('projets') && <Tuile label="Projets (résultat)" valeur={eur(apercu.projets)} ton={apercu.projets >= 0 ? 'succes' : 'erreur'} sous={`${apercu.nbProjOps} opération(s)`} />}
      </div>

      <button className="btn btn-primaire btn-grand btn-plein" disabled={chargement} onClick={exporter}><FileSpreadsheet size={22} /> Télécharger le bilan (Excel)</button>
      <div className="carte texte-doux petit">
        <p className="sans-marge"><strong>Dans le fichier :</strong> une feuille <strong>« Bilan »</strong> détaillée (synthèse, chaque projet avec ses réservations et les soldes de chacun, dépenses par catégorie, par personne{mode !== 'mois' ? ', mois par mois' : ''}), puis une feuille de détail par secteur et par projet. Pour un bilan simple à lire, utilisez le bouton « Bilan PDF » dans chaque projet. Les feuilles sont dans les <strong>onglets en bas</strong> du fichier.</p>
      </div>
    </div>
  );
}
