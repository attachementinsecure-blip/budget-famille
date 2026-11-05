import { useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, Eye, Archive } from 'lucide-react';
import { Modal, Confirmer, SaveBadge, Tabs, ChoixPersonnes, Champ, useFlash } from './ui.jsx';
import { useApp } from './contexte.jsx';
import { supabase, enregistrer, envoyerJustificatif, lienJustificatif, local, messageClair, nouvelId } from './api.js';
import { aujourdhui, categoriesPour, num, arrondi, eur, TAUX_IVA, LIB_ESPACE, AVEC_IVA, MOYENS } from './format.js';
import ChoixCategorie from './Categorie.jsx';
import { ivaDepuisTTC } from './calculs.js';

const vierge = (espace, sens, profil, membres, activites) => ({
  id: nouvelId(), espace, sens, montant: '', date_op: aujourdhui(), categorie: categoriesPour(espace, sens)[0], libelle: '',
  proprietaire: espace === 'perso' ? profil.id : null,
  paye_par: espace === 'commun' ? profil.id : null,
  partage: espace === 'commun' ? membres.map((m) => m.id) : null,
  activite_id: espace === 'pro' ? activites[0]?.id || null : null,
  iva_taux: espace === 'pro' && AVEC_IVA ? (sens === 'rentree' ? 6 : 23) : null, iva_montant: null, nif: '', fournisseur: '', justificatif: null,
  moyen: sens === 'retrait' ? 'especes' : 'carte',
});

export default function Saisie({ initial, onClose }) {
  const { profil, membres, activites, rafraichir, estGestionnaire } = useApp();
  const flash = useFlash();
  const existant = Boolean(initial.cree_le);
  const cleBrouillon = `brouillon:${initial.espace}:${initial.sens || 'depense'}`;
  const estRetrait = initial.sens === 'retrait';
  const [f, setF] = useState(() => {
    if (existant) return { ...initial, montant: String(initial.montant).replace('.', ','), frais_plateforme: initial.frais_plateforme != null ? String(initial.frais_plateforme).replace('.', ',') : '' };
    const b = local.get(cleBrouillon);
    const base = vierge(initial.espace, initial.sens || 'depense', profil, membres, activites);
    return b ? { ...base, ...b, id: base.id } : { ...base, ...initial, id: base.id };
  });
  const [fichier, setFichier] = useState(null);
  const [etat, setEtat] = useState(null);
  const [quand, setQuand] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [ivaManuelle, setIvaManuelle] = useState(existant && initial.iva_montant != null);
  const premier = useRef(true);

  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const cats = categoriesPour(f.espace, f.sens);
  const espacesPermis = estGestionnaire ? ['perso', 'commun', 'pro'] : ['perso', 'commun'];

  // Brouillon gardé automatiquement 1,5 s après la saisie
  useEffect(() => {
    if (premier.current) { premier.current = false; return; }
    if (existant) return;
    const t = setTimeout(() => { local.set(cleBrouillon, { ...f, id: undefined }); setEtat('brouillon'); setQuand(new Date()); }, 1500);
    return () => clearTimeout(t);
  }, [f, existant, cleBrouillon]);

  const ivaAuto = useMemo(() => ivaDepuisTTC(num(f.montant), f.iva_taux), [f.montant, f.iva_taux]);
  const ivaAffichee = ivaManuelle ? f.iva_montant ?? '' : ivaAuto;

  function changerSens(sens) {
    setF((x) => ({ ...x, sens, categorie: categoriesPour(x.espace, sens)[0], iva_taux: x.espace === 'pro' && AVEC_IVA ? (sens === 'rentree' ? 6 : 23) : null }));
  }
  function changerEspace(espace) {
    setF((x) => ({ ...vierge(espace, x.sens, profil, membres, activites), id: x.id, montant: x.montant, date_op: x.date_op, libelle: x.libelle, moyen: x.moyen }));
  }

  async function valider() {
    const montant = arrondi(num(f.montant));
    if (!(montant > 0)) return flash('Indiquez un montant.', 'erreur');
    if (f.espace === 'commun' && (!f.partage || !f.partage.length)) return flash('Choisissez avec qui la dépense est partagée.', 'erreur');
    if (!estRetrait && !String(f.categorie || '').trim()) return flash('Choisissez ou écrivez un motif.', 'erreur');
    if (f.espace === 'pro' && f.sens === 'rentree' && num(f.frais_plateforme) > montant) return flash('Les frais ne peuvent pas dépasser le montant total.', 'erreur');
    setEnvoi(true); setEtat('encours');
    try {
      let justificatif = f.justificatif;
      if (fichier) justificatif = await envoyerJustificatif(fichier, f.espace, f.espace === 'perso' ? f.proprietaire : profil.id);
      const ligne = {
        id: f.id, espace: estRetrait ? 'perso' : f.espace, sens: f.sens, montant, date_op: f.date_op,
        categorie: estRetrait ? 'Retrait espèces' : String(f.categorie).trim(), libelle: (f.libelle || '').trim() || (estRetrait ? 'Retrait distributeur' : ''),
        moyen: estRetrait ? 'especes' : (f.moyen || null),
        proprietaire: f.espace === 'perso' ? f.proprietaire : (f.espace === 'commun' ? null : profil.id),
        paye_par: f.espace === 'commun' ? f.paye_par : null,
        partage: f.espace === 'commun' ? f.partage : null,
        activite_id: f.espace === 'pro' ? f.activite_id : null,
        iva_taux: f.espace === 'pro' && AVEC_IVA ? Number(f.iva_taux) : null,
        iva_montant: f.espace === 'pro' && AVEC_IVA ? arrondi(num(ivaAffichee)) : null,
        nif: f.espace === 'pro' ? (f.nif || '').trim() || null : null,
        fournisseur: f.espace === 'pro' ? (f.fournisseur || '').trim() || null : null,
        voyageur: f.espace === 'pro' && f.sens === 'rentree' ? (f.voyageur || '').trim() || null : null,
        ref_resa: f.espace === 'pro' && f.sens === 'rentree' ? (f.ref_resa || '').trim().toUpperCase() || null : null,
        frais_plateforme: f.espace === 'pro' && f.sens === 'rentree' && num(f.frais_plateforme) > 0 ? arrondi(num(f.frais_plateforme)) : null,
        justificatif, fixe_id: f.fixe_id || null, mois_fixe: f.mois_fixe || null,
      };
      if (!existant) ligne.cree_par = profil.id;
      const r = await enregistrer('operations', ligne);
      if (!existant) local.del(cleBrouillon);
      flash(r.horsLigne ? 'Gardé sur le téléphone. Envoi dès le retour du réseau.' : (existant ? 'Modification enregistrée.' : 'Opération enregistrée.'));
      rafraichir(); onClose();
    } catch (e) {
      setEtat(null); flash(messageClair(e), 'erreur');
    } finally { setEnvoi(false); }
  }

  async function archiver() {
    setConfirm(false);
    try {
      const { error } = await supabase.from('operations').update({ archive: true }).eq('id', f.id);
      if (error) throw error;
      flash('Opération archivée.'); rafraichir(); onClose();
    }
    catch (e) { flash(messageClair(e), 'erreur'); }
  }

  function effacerBrouillon() { local.del(cleBrouillon); setF(vierge(f.espace, f.sens, profil, membres, activites)); setEtat(null); }

  async function voir() { try { window.open(await lienJustificatif(f.justificatif), '_blank'); } catch (e) { flash(messageClair(e), 'erreur'); } }

  const titre = estRetrait ? (existant ? 'Modifier le retrait' : 'Retrait au distributeur') : existant ? 'Modifier' : (f.sens === 'rentree' ? 'Nouvelle rentrée' : 'Nouvelle dépense');
  return (
    <Modal titre={titre} onClose={onClose} pied={<>
      {existant && <button className="btn btn-second" onClick={() => setConfirm(true)}><Archive size={18} /> Archiver</button>}
      <button className="btn btn-primaire" onClick={valider} disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
    </>}>
      <div className="saisie-haut">
        <SaveBadge etat={etat} quand={quand} />
        {!existant && etat === 'brouillon' && <button className="lien" onClick={effacerBrouillon}>Tout effacer</button>}
      </div>

      {!existant && !estRetrait && espacesPermis.length > 1 && (
        <Tabs valeur={f.espace} onChange={changerEspace} options={espacesPermis.map((e) => [e, LIB_ESPACE[e]])} />
      )}
      {!estRetrait && <Tabs valeur={f.sens} onChange={changerSens} options={[['depense', f.espace === 'pro' ? 'Frais' : 'Dépense'], ['rentree', f.espace === 'pro' ? 'Recette' : 'Rentrée']]} />}

      <Champ label={f.espace === 'pro' && f.sens === 'rentree' ? 'Montant total payé par le voyageur (€)' : 'Montant (€)'}>
        <input className="input-montant" inputMode="decimal" placeholder="0,00" value={f.montant} autoFocus={!existant}
          onChange={(e) => maj('montant', e.target.value.replace(/[^0-9,.]/g, ''))} />
      </Champ>
      <div className="grille2">
        <Champ label="Date"><input type="date" value={f.date_op} onChange={(e) => maj('date_op', e.target.value)} /></Champ>
        {!estRetrait && <Champ label="Motif">
          <ChoixCategorie espace={f.espace} sens={f.sens} valeur={f.categorie}
            onChange={(c) => { setF((x) => ({ ...x, categorie: c, ...(c === 'Commission plateforme' ? { iva_taux: 0 } : {}) })); setIvaManuelle(false); }} />
        </Champ>}
      </div>
      <Champ label="Description"><input value={f.libelle} placeholder={estRetrait ? 'Ex. : distributeur Continente' : 'Ex. : courses Continente'} onChange={(e) => maj('libelle', e.target.value)} /></Champ>
      {!estRetrait && <Champ groupe label={f.sens === 'rentree' ? 'Reçu en' : 'Payé en'}>
        <div className="choixpers">
          {MOYENS.map(([k, l]) => <button type="button" key={k} className={f.moyen === k ? 'actif' : ''} aria-pressed={f.moyen === k} onClick={() => maj('moyen', k)}>{l}</button>)}
        </div>
      </Champ>}

      {f.espace === 'commun' && <>
        <Champ groupe label="Payé par"><ChoixPersonnes membres={membres} valeur={f.paye_par} onChange={(v) => maj('paye_par', v)} /></Champ>
        <Champ groupe label="Partagé entre" aide={f.partage?.length ? `${f.partage.length} personne(s), parts égales` : null}>
          <ChoixPersonnes membres={membres} valeur={f.partage} multiple onChange={(v) => maj('partage', v)} />
        </Champ>
      </>}

      {f.espace === 'pro' && <>
        {activites.length > 1 && (
          <Champ label="Activité">
            <select value={f.activite_id || ''} onChange={(e) => maj('activite_id', e.target.value)}>
              {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </Champ>
        )}
        {AVEC_IVA && <div className="grille2">
          <Champ label="Taux IVA">
            <select value={f.iva_taux ?? 0} onChange={(e) => { setIvaManuelle(false); maj('iva_taux', Number(e.target.value)); }}>
              {TAUX_IVA.map((t) => <option key={t} value={t}>{t} %</option>)}
            </select>
          </Champ>
          <Champ label="Dont IVA (€)" aide={ivaManuelle ? 'Modifiée à la main' : 'Calculée automatiquement'}>
            <input inputMode="decimal" value={String(ivaAffichee).replace('.', ',')}
              onChange={(e) => { setIvaManuelle(true); maj('iva_montant', e.target.value.replace(/[^0-9,.]/g, '')); }} />
          </Champ>
        </div>}
        <Champ label={f.sens === 'rentree' ? 'Plateforme ou client' : 'Fournisseur'}><input value={f.fournisseur || ''} placeholder={f.sens === 'rentree' ? 'Ex. : Airbnb, Booking, direct' : ''} onChange={(e) => maj('fournisseur', e.target.value)} /></Champ>
        {f.sens === 'rentree' && <>
          <div className="grille2">
            <Champ label="Voyageur"><input value={f.voyageur || ''} placeholder="Nom de la personne" onChange={(e) => maj('voyageur', e.target.value)} /></Champ>
            <Champ label="Réf. réservation"><input value={f.ref_resa || ''} autoCapitalize="characters" placeholder="Ex. : HMABC123" onChange={(e) => maj('ref_resa', e.target.value)} /></Champ>
          </div>
          <Champ label="Frais de la plateforme (€)" aide={num(f.montant) > 0 ? `Net reçu : ${eur(arrondi(num(f.montant) - num(f.frais_plateforme)))}` : 'Le montant total moins ces frais donne le net reçu.'}>
            <input inputMode="decimal" placeholder="0,00" value={f.frais_plateforme ?? ''} onChange={(e) => maj('frais_plateforme', e.target.value.replace(/[^0-9,.]/g, ''))} />
          </Champ>
        </>}
      </>}

      {!estRetrait && <Champ groupe label="Justificatif (photo ou PDF)" aide={f.espace === 'pro' ? 'À garder pour la comptabilité.' : null}>
        <div className="justif">
          <label className="btn btn-second">
            <Paperclip size={18} /> {fichier ? fichier.name.slice(0, 24) : (f.justificatif ? 'Remplacer' : 'Ajouter')}
            <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFichier(e.target.files?.[0] || null)} />
          </label>
          {f.justificatif && !fichier && <button type="button" className="btn btn-second" onClick={voir}><Eye size={18} /> Voir</button>}
        </div>
      </Champ>}

      {confirm && <Confirmer texte="Archiver cette opération ? Elle ne comptera plus dans les totaux, mais reste dans l'historique." action="Archiver" danger onOui={archiver} onNon={() => setConfirm(false)} />}
    </Modal>
  );
}
