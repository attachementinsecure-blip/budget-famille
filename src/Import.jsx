import { useMemo, useState } from 'react';
import { FileUp, Check, AlertTriangle, Sparkles, Copy } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { useApp } from './contexte.jsx';
import { Champ, Pastille, Tabs, Vide, useFlash } from './ui.jsx';
import { supabase, messageClair, nouvelId } from './api.js';
import { eur, dateCourte, categoriesPour } from './format.js';
import ChoixCategorie from './Categorie.jsx';
import { decoderTexte, lireCsv, detecterColonnes, extraireLignes, proposer, marquerDoublons, cleRegle } from './releve.js';

const ESPACES = { perso: 'Perso', commun: 'Commun', retrait: 'Retrait espèces', ignorer: 'Ignorer' };
const estProjet = (e) => String(e).startsWith('projet:');
const idProjet = (e) => String(e).slice(7);

export default function Import() {
  const { profil, membres, estGestionnaire, rafraichir } = useApp();
  const [projets, setProjets] = useState([]);
  const flash = useFlash();
  const [fichier, setFichier] = useState(null);
  const [rows, setRows] = useState(null);
  const [col, setCol] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [filtre, setFiltre] = useState('garder');
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState(null);

  async function choisir(f) {
    if (!f) return;
    setFini(null); setFichier(f.name);
    try {
      const buf = await f.arrayBuffer();
      let r;
      if (/\.(csv|txt)$/i.test(f.name)) r = lireCsv(decoderTexte(buf));
      else {
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        r = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      }
      const c = detecterColonnes(r);
      setRows(r); setCol(c);
      if (!c) { setLignes([]); return flash('Je ne trouve pas de dates dans ce fichier. Exportez les mouvements en Excel ou CSV depuis le site de la banque.', 'erreur'); }
      await analyser(r, c);
    } catch (e) {
      setRows(null); flash('Ce fichier ne peut pas être lu. Essayez l\'export Excel ou CSV de la banque.', 'erreur');
    }
  }

  async function analyser(r, c) {
    const brut = extraireLignes(r, c);
    if (!brut.length) { setLignes([]); return; }
    const dates = brut.map((l) => l.date).sort();
    const [{ data: existantes }, { data: regles }, { data: projetsData }, { data: opsProjets }] = await Promise.all([
      supabase.from('operations').select('date_op,montant,sens').eq('archive', false).gte('date_op', dates[0]).lte('date_op', dates[dates.length - 1]),
      supabase.from('regles').select('*'),
      supabase.from('projets').select('*, projet_participants(*)').eq('archive', false).order('cree_le'),
      supabase.from('projet_operations').select('date_op,montant,frais_plateforme,sens').eq('archive', false).gte('date_op', dates[0]).lte('date_op', dates[dates.length - 1]),
    ]);
    const mesProjets = projetsData || [];
    setProjets(mesProjets);
    const parCle = Object.fromEntries((regles || []).map((x) => [x.cle, x]));
    // Les opérations des projets comptent aussi pour repérer les doublons (montant réellement reçu ou payé)
    const dejaProjets = (opsProjets || []).filter((o) => o.sens !== 'versement').map((o) => ({ date_op: o.date_op, montant: Number(o.montant) - (Number(o.frais_plateforme) || 0), sens: o.sens === 'recette' ? 'rentree' : 'depense' }));
    const location = mesProjets.find((p) => p.type === 'location') || mesProjets[0];
    const avec = marquerDoublons(brut, [...(existantes || []), ...dejaProjets]).map((l) => {
      const regle = parCle[cleRegle(l.libelle)];
      let p = proposer(l, parCle, estGestionnaire);
      if (regle?.espace === 'projet') p = mesProjets.some((x) => x.id === regle.projet_id) ? { ...p, espace: 'projet:' + regle.projet_id, categorie: regle.categorie, origine: 'appris' } : { ...p, espace: 'perso', categorie: 'Autre', origine: 'inconnu' };
      else if (p.espace === 'pro') p = location ? { ...p, espace: 'projet:' + location.id } : { ...p, espace: 'perso', categorie: 'Autre', origine: 'inconnu' };
      const espace = l.doublon ? 'ignorer' : p.espace;
      return { ...l, ...p, espace, espaceProp: p.espace };
    });
    setLignes(avec);
  }

  function changerCol(k, v) {
    const c = { ...col, [k]: Number(v) };
    setCol(c); analyser(rows, c);
  }
  const maj = (n, champs) => setLignes((ls) => ls.map((l) => (l.n === n ? { ...l, ...champs } : l)));
  function changerEspace(l, espace) {
    if (espace === 'ignorer' || espace === 'retrait') return maj(l.n, { espace, categorie: espace === 'retrait' ? 'Retrait espèces' : l.categorie });
    const cats = categoriesPour(estProjet(espace) ? 'pro' : espace, l.sens);
    maj(l.n, { espace, categorie: cats.includes(l.categorie) ? l.categorie : cats[cats.length - 1] });
  }

  const gardees = lignes.filter((l) => l.espace !== 'ignorer');
  const visibles = filtre === 'garder' ? gardees : filtre === 'ignorer' ? lignes.filter((l) => l.espace === 'ignorer') : lignes.filter((l) => l.origine === 'inconnu' && l.espace !== 'ignorer');
  const aVerifier = lignes.filter((l) => l.origine === 'inconnu' && l.espace !== 'ignorer').length;
  const periode = useMemo(() => {
    if (!lignes.length) return '';
    const d = lignes.map((l) => l.date).sort();
    return d[0] === d[d.length - 1] ? `le ${dateCourte(d[0]).replace(/\.$/, '')}` : `du ${dateCourte(d[0])} au ${dateCourte(d[d.length - 1]).replace(/\.$/, '')}`;
  }, [lignes]);

  async function enregistrer() {
    if (!gardees.length) return;
    setEnvoi(true);
    try {
      // Lignes vers un projet : payé ou reçu par moi dans ce projet
      const opsProjets = gardees.filter((l) => estProjet(l.espace)).map((l) => {
        const pr = projets.find((x) => x.id === idProjet(l.espace));
        const parts = pr?.projet_participants || [];
        const moi = parts.find((x) => x.type === 'personne' && x.profil_id === profil.id) || parts.find((x) => x.type === 'famille' && x.famille_id === profil.famille_id) || parts[0];
        return { id: nouvelId(), projet_id: pr.id, sens: l.sens === 'rentree' ? 'recette' : 'depense', montant: l.montant, date_op: l.date,
          categorie: String(l.categorie || 'Autre').trim() || 'Autre', libelle: l.libelle.slice(0, 200), parts: [{ participant_id: moi.id, montant: l.montant }], cree_par: profil.id };
      });
      for (const o of opsProjets) { const { error } = await supabase.from('projet_operations').insert(o); if (error) throw error; }
      const ops = gardees.filter((l) => !estProjet(l.espace)).map((l) => l.espace === 'retrait' ? ({
        id: nouvelId(), espace: 'perso', sens: 'retrait', montant: l.montant, date_op: l.date, categorie: 'Retrait espèces', libelle: l.libelle.slice(0, 200),
        proprietaire: profil.id, moyen: 'especes', cree_par: profil.id,
      }) : ({
        id: nouvelId(), espace: l.espace, sens: l.sens, montant: l.montant, date_op: l.date, categorie: String(l.categorie || 'Autre').trim() || 'Autre', libelle: l.libelle.slice(0, 200),
        proprietaire: l.espace === 'commun' ? null : profil.id,
        paye_par: null,
        partage: l.espace === 'commun' ? membres.map((m) => m.id) : null,
        cree_par: profil.id,
      }));
      for (let i = 0; i < ops.length; i += 200) {
        const { error } = await supabase.from('operations').insert(ops.slice(i, i + 200));
        if (error) throw error;
      }
      // Apprendre : la prochaine fois, la même description ira dans la même case
      const regles = {};
      for (const l of lignes) {
        if (l.doublon) continue;
        regles[l.cle] = { cle: l.cle, espace: estProjet(l.espace) ? 'projet' : l.espace, projet_id: estProjet(l.espace) ? idProjet(l.espace) : null, sens: l.sens,
          categorie: l.espace === 'ignorer' ? null : String(l.categorie || '').trim() || null, modifie_le: new Date().toISOString() };
      }
      await supabase.from('regles').upsert(Object.values(regles));
      setFini({ nb: ops.length + opsProjets.length, nbPro: opsProjets.length });
      setLignes([]); setRows(null); setFichier(null);
      rafraichir();
    } catch (e) { flash(messageClair(e), 'erreur'); }
    finally { setEnvoi(false); }
  }

  if (fini) return (
    <div className="page">
      <h2 className="titre-page">Relevé bancaire</h2>
      <div className="carte fin-import">
        <Check size={28} />
        <p><strong>{fini.nb} opération(s) enregistrée(s).</strong></p>
        <p className="texte-doux">Vos choix sont retenus : au prochain relevé, les mêmes lignes iront directement dans la bonne case.</p>
        {fini.nbPro > 0 && <p className="point ton-alerte">{fini.nbPro} opération(s) ajoutée(s) dans vos projets. Pour une réservation, ouvrez-la dans le projet pour ajouter le voyageur, les frais et la facture.</p>}
      </div>
      <button className="btn btn-primaire btn-grand btn-plein" onClick={() => setFini(null)}><FileUp size={20} /> Importer un autre relevé</button>
    </div>
  );

  return (
    <div className="page">
      <h2 className="titre-page">Relevé bancaire</h2>
      {!rows && (
        <div className="carte">
          <p>Sur le site ou l'appli de votre banque, téléchargez la liste des mouvements en <strong>Excel</strong> ou <strong>CSV</strong>, puis choisissez le fichier ici.</p>
          <p className="texte-doux petit">Chaque ligne est rangée automatiquement : courses dans Commun, Airbnb dans Pro, salaire dans Perso… Vous vérifiez avant d'enregistrer.</p>
        </div>
      )}
      <label className="btn btn-primaire btn-grand btn-plein">
        <FileUp size={20} /> {fichier ? 'Choisir un autre fichier' : 'Choisir le relevé (Excel ou CSV)'}
        <input type="file" accept=".csv,.txt,.xls,.xlsx,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { choisir(e.target.files?.[0]); e.target.value = ''; }} />
      </label>

      {rows && col && <>
        <details className="carte colonnes">
          <summary>Colonnes lues dans « {fichier} »</summary>
          <div className="grille2">
            {[['date', 'Date'], ['libelle', 'Description'], ['montant', 'Montant'], ['debit', 'Débit'], ['credit', 'Crédit']].map(([k, label]) => (
              <Champ key={k} label={label}>
                <select value={col[k]} onChange={(e) => changerCol(k, e.target.value)}>
                  <option value={-1}>Aucune</option>
                  {col.noms.map((n, j) => <option key={j} value={j}>{String(n || `Colonne ${j + 1}`).slice(0, 30)}</option>)}
                </select>
              </Champ>
            ))}
          </div>
          <p className="texte-doux petit">Changez une colonne si les montants ou les dates ne sont pas les bons.</p>
        </details>

        {lignes.length === 0 ? <Vide>Aucun mouvement trouvé. Vérifiez les colonnes ci-dessus.</Vide> : <>
          <p className="texte-doux">{lignes.length} mouvement(s) lu(s), {periode}. {lignes.filter((l) => l.doublon).length > 0 && `${lignes.filter((l) => l.doublon).length} déjà enregistré(s), mis de côté.`}</p>
          <Tabs valeur={filtre} onChange={setFiltre} options={[['garder', `À garder ${gardees.length}`], ['verifier', `À vérifier ${aVerifier}`], ['ignorer', `Ignorés ${lignes.length - gardees.length}`]]} />
          {visibles.length === 0 ? <Vide>Rien ici.</Vide> : (
            <ul className="liste">
              {visibles.map((l) => (
                <li key={l.n} className={`ligne-import ${l.espace === 'ignorer' ? 'ignoree' : ''}`}>
                  <div className="li-haut">
                    <span className="ligne-date">{dateCourte(l.date)}</span>
                    <span className="li-libelle">{l.libelle || '—'}</span>
                    <span className={`ligne-montant ${l.sens === 'rentree' ? 'positif' : ''}`}>{l.sens === 'rentree' ? '+' : '−'}{eur(l.montant)}</span>
                  </div>
                  <div className="li-choix">
                    <select aria-label="Case" value={l.espace} onChange={(e) => changerEspace(l, e.target.value)}>
                      {Object.entries(ESPACES).filter(([k]) => k !== 'retrait' || l.sens === 'depense').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      {projets.length > 0 && <optgroup label="Projets">{projets.map((x) => <option key={x.id} value={'projet:' + x.id}>{x.nom}</option>)}</optgroup>}
                    </select>
                    {l.espace !== 'ignorer' && l.espace !== 'retrait' && (
                      <ChoixCategorie key={l.espace} compact espace={estProjet(l.espace) ? 'pro' : l.espace} sens={l.sens} valeur={l.categorie} ariaLabel="Catégorie" onChange={(c) => maj(l.n, { categorie: c })} />
                    )}

                  </div>
                  <div className="li-etat">
                    {l.doublon ? <Pastille ton="info"><Copy size={12} /> Déjà enregistré</Pastille>
                      : l.origine === 'appris' ? <Pastille ton="succes"><Sparkles size={12} /> Comme la dernière fois</Pastille>
                      : l.origine === 'propose' ? <Pastille ton="succes"><Check size={12} /> Rangé automatiquement</Pastille>
                      : <Pastille ton="encours"><AlertTriangle size={12} /> À vérifier</Pastille>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="import-pied">
            <button className="btn btn-primaire btn-grand btn-plein" disabled={envoi || !gardees.length} onClick={enregistrer}>
              {envoi ? 'Enregistrement…' : `Enregistrer ${gardees.length} opération(s)`}
            </button>
          </div>
          <p className="texte-doux petit">Les dépenses communes sont notées comme payées par vous et partagées entre tous. Les virements Airbnb reçus sont le montant net : ajoutez la commission dans l'onglet Pro si besoin. Rien n'est enregistré avant de toucher le bouton.</p>
        </>}
      </>}
      {rows && !col && <Vide>Je ne trouve pas de dates dans ce fichier.</Vide>}
    </div>
  );
}
