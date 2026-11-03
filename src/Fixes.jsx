import { useState } from 'react';
import { Plus, Check, Pencil } from 'lucide-react';
import { useApp, useOperations, useFixes } from './contexte.jsx';
import { NavPeriode, Modal, Champ, Tabs, ChoixPersonnes, Pastille, Vide, useFlash, Confirmer } from './ui.jsx';
import { supabase, enregistrer, messageClair, nouvelId } from './api.js';
import { periodeMois, decaler, eur, moisCle, isoDate, categoriesPour, num, arrondi, LIB_ESPACE } from './format.js';

export default function Fixes() {
  const { profil, membres, estGestionnaire, rafraichir, activites } = useApp();
  const flash = useFlash();
  const [ref, setRef] = useState(new Date());
  const [edit, setEdit] = useState(null);
  const p = periodeMois(ref);
  const mois = moisCle(ref);
  const { ops } = useOperations(p.debut, p.fin);
  const fixes = useFixes().filter((f) => f.actif);
  const pointes = new Map(ops.filter((o) => o.fixe_id && o.mois_fixe === mois).map((o) => [o.fixe_id, o]));
  const totalPrevu = fixes.filter((f) => f.sens === 'depense').reduce((s, f) => s + Number(f.montant), 0);
  const totalFait = fixes.filter((f) => f.sens === 'depense' && pointes.has(f.id)).reduce((s, f) => s + Number(pointes.get(f.id).montant), 0);

  async function ajouterAuMois(f) {
    const jour = Math.min(f.jour || 1, p.jours);
    const ligne = {
      id: nouvelId(), espace: f.espace, sens: f.sens, montant: f.montant, categorie: f.categorie, libelle: f.libelle,
      date_op: isoDate(new Date(ref.getFullYear(), ref.getMonth(), jour)),
      proprietaire: f.espace === 'perso' ? f.proprietaire : (f.espace === 'pro' ? profil.id : null),
      paye_par: f.espace === 'commun' ? f.paye_par : null, partage: f.espace === 'commun' ? f.partage : null,
      activite_id: f.espace === 'pro' ? f.activite_id : null, fixe_id: f.id, mois_fixe: mois, cree_par: profil.id,
    };
    try { const r = await enregistrer('operations', ligne); flash(r.horsLigne ? 'Gardé sur le téléphone.' : `${f.libelle} ajouté à ${p.label.toLowerCase()}.`); rafraichir(); }
    catch (e) { flash(messageClair(e), 'erreur'); }
  }

  return (
    <div className="page">
      <section className="bandeau">
        <NavPeriode label={p.label} onPrec={() => setRef(decaler(ref, 'mois', -1))} onSuiv={() => setRef(decaler(ref, 'mois', 1))} />
        <p className="bandeau-label">Charges fixes enregistrées</p>
        <p className="bandeau-chiffre">{eur(totalFait)}</p>
        <p className="bandeau-sous">sur {eur(totalPrevu)} prévues ({pointes.size} / {fixes.length})</p>
      </section>

      <button className="btn btn-primaire btn-grand btn-plein" onClick={() => setEdit({})}><Plus size={22} /> Nouvelle charge fixe</button>

      {fixes.length === 0 ? <Vide>Notez ici ce qui revient chaque mois : loyer ou crédit, électricité, internet, assurances, école, abonnements, salaire.</Vide> : (
        <ul className="liste">
          {fixes.map((f) => {
            const fait = pointes.get(f.id);
            return (
              <li key={f.id} className="ligne ligne-fixe">
                <span className="ligne-texte">
                  <strong>{f.libelle}</strong>
                  <small>{LIB_ESPACE[f.espace]}{f.jour ? `, le ${f.jour}` : ''}, {f.sens === 'rentree' ? '+' : ''}{eur(f.montant)}</small>
                </span>
                {fait ? <Pastille ton="succes"><Check size={14} /> Enregistré</Pastille>
                      : <button className="btn btn-petit btn-primaire" onClick={() => ajouterAuMois(f)}>Ajouter au mois</button>}
                <button className="btn-icone" onClick={() => setEdit(f)} aria-label={`Modifier ${f.libelle}`}><Pencil size={18} /></button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <EditFixe initial={edit} onClose={() => setEdit(null)} profil={profil} membres={membres} estGestionnaire={estGestionnaire} activites={activites} rafraichir={rafraichir} flash={flash} />}
    </div>
  );
}

function EditFixe({ initial, onClose, profil, membres, estGestionnaire, activites, rafraichir, flash }) {
  const existant = Boolean(initial.id);
  const [f, setF] = useState(() => existant ? { ...initial, montant: String(initial.montant).replace('.', ',') } : {
    id: nouvelId(), espace: 'commun', sens: 'depense', libelle: '', montant: '', categorie: 'Logement', jour: 1,
    proprietaire: null, paye_par: profil.id, partage: membres.map((m) => m.id), activite_id: activites[0]?.id || null,
  });
  const [confirm, setConfirm] = useState(false);
  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const espaces = estGestionnaire ? ['perso', 'commun', 'pro'] : ['perso', 'commun'];

  async function valider() {
    const montant = arrondi(num(f.montant));
    if (!f.libelle.trim()) return flash('Donnez un nom à cette charge.', 'erreur');
    if (!(montant > 0)) return flash('Indiquez un montant.', 'erreur');
    const ligne = {
      id: f.id, espace: f.espace, sens: f.sens, libelle: f.libelle.trim(), montant, categorie: f.categorie, jour: f.jour ? Number(f.jour) : null,
      proprietaire: f.espace === 'perso' ? (f.proprietaire || profil.id) : null,
      paye_par: f.espace === 'commun' ? f.paye_par : null, partage: f.espace === 'commun' ? f.partage : null,
      activite_id: f.espace === 'pro' ? f.activite_id : null, actif: true,
    };
    try { await enregistrer('fixes', ligne); flash('Charge fixe enregistrée.'); rafraichir(); onClose(); }
    catch (e) { flash(messageClair(e), 'erreur'); }
  }
  async function arreter() {
    setConfirm(false);
    const { error } = await supabase.from('fixes').update({ actif: false }).eq('id', f.id);
    if (error) return flash(messageClair(error), 'erreur');
    flash('Charge fixe arrêtée. Les mois passés restent enregistrés.'); rafraichir(); onClose();
  }

  return (
    <Modal titre={existant ? 'Modifier la charge fixe' : 'Nouvelle charge fixe'} onClose={onClose} pied={<>
      {existant && <button className="btn btn-second" onClick={() => setConfirm(true)}>Arrêter</button>}
      <button className="btn btn-primaire" onClick={valider}>Enregistrer</button>
    </>}>
      {!existant && <Tabs valeur={f.espace} onChange={(v) => setF((x) => ({ ...x, espace: v, categorie: categoriesPour(v, x.sens)[0] }))} options={espaces.map((e) => [e, LIB_ESPACE[e]])} />}
      <Tabs valeur={f.sens} onChange={(v) => setF((x) => ({ ...x, sens: v, categorie: categoriesPour(x.espace, v)[0] }))} options={[['depense', 'Dépense'], ['rentree', 'Rentrée']]} />
      <Champ label="Nom"><input value={f.libelle} placeholder="Ex. : électricité EDP" onChange={(e) => maj('libelle', e.target.value)} /></Champ>
      <div className="grille2">
        <Champ label="Montant habituel (€)"><input inputMode="decimal" value={f.montant} onChange={(e) => maj('montant', e.target.value.replace(/[^0-9,.]/g, ''))} /></Champ>
        <Champ label="Jour du mois"><input type="number" min="1" max="31" value={f.jour ?? ''} onChange={(e) => maj('jour', e.target.value)} /></Champ>
      </div>
      <Champ label="Catégorie">
        <select value={f.categorie} onChange={(e) => maj('categorie', e.target.value)}>
          {categoriesPour(f.espace, f.sens).map((c) => <option key={c}>{c}</option>)}
        </select>
      </Champ>
      {f.espace === 'commun' && <>
        <Champ label="Payé par"><ChoixPersonnes membres={membres} valeur={f.paye_par} onChange={(v) => maj('paye_par', v)} /></Champ>
        <Champ label="Partagé entre"><ChoixPersonnes membres={membres} valeur={f.partage} multiple onChange={(v) => maj('partage', v)} /></Champ>
      </>}
      {f.espace === 'pro' && activites.length > 1 && (
        <Champ label="Activité"><select value={f.activite_id || ''} onChange={(e) => maj('activite_id', e.target.value)}>{activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></Champ>
      )}
      <p className="texte-doux petit">Chaque mois, touchez « Ajouter au mois » quand la charge est payée. Si le montant change, modifiez l'opération dans la liste du mois.</p>
      {confirm && <Confirmer texte="Arrêter cette charge fixe ? Elle ne sera plus proposée, mais les mois passés restent enregistrés." action="Arrêter" danger onOui={arreter} onNon={() => setConfirm(false)} />}
    </Modal>
  );
}
