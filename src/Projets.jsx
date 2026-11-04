import { useEffect, useMemo, useState } from 'react';
import { Plus, ArrowDownCircle, ArrowLeft, ArrowRight, UserPlus, Users, User, Download, Paperclip, Eye, Archive, Send, Percent } from 'lucide-react';
import { useApp } from './contexte.jsx';
import { Modal, Champ, Confirmer, Pastille, Tabs, Tuile, Vide, useFlash } from './ui.jsx';
import { supabase, messageClair, nouvelId, envoyerJustificatif, lienJustificatif } from './api.js';
import { eur, num, arrondi, aujourdhui, dateCourte } from './format.js';
import { bilanProjet, quotesProjet } from './calculs.js';
import ChoixCategorie from './Categorie.jsx';

// Les projets utilisent les catégories pro (frais / recettes)
const espacePro = (sens) => ({ espace: 'pro', sens: sens === 'recette' ? 'rentree' : 'depense' });

function useProjets() {
  const { rev } = useApp();
  const [etat, setEtat] = useState({ projets: null, ops: [] });
  useEffect(() => {
    Promise.all([
      supabase.from('projets').select('*, projet_participants(*)').eq('archive', false).order('cree_le', { ascending: false }),
      supabase.from('projet_operations').select('*').eq('archive', false).order('date_op', { ascending: false }).order('cree_le', { ascending: false }),
    ]).then(([p, o]) => setEtat({ projets: p.data || [], ops: o.data || [] }));
  }, [rev]);
  return etat;
}

const moi = (participants, profil) => participants.find((p) => (p.type === 'famille' && p.famille_id === profil.famille_id) || (p.type === 'personne' && p.profil_id === profil.id));

export default function Projets({ ouvrir: _ouvrir }) {
  const { profil, estGestionnaire, rafraichir } = useApp();
  const flash = useFlash();
  const { projets, ops } = useProjets();
  const [choisi, setChoisi] = useState(null);
  const [nouveau, setNouveau] = useState(null);

  async function creer() {
    if (!nouveau.nom.trim()) return flash('Donnez un nom au projet.', 'erreur');
    const { data, error } = await supabase.from('projets').insert({ nom: nouveau.nom.trim(), description: nouveau.description.trim() }).select().single();
    if (error) return flash(messageClair(error), 'erreur');
    flash('Projet créé. Invitez maintenant les autres participants.');
    setNouveau(null); setChoisi(data.id); rafraichir();
  }

  const projet = projets?.find((p) => p.id === choisi);
  if (projet) return <DetailProjet projet={projet} ops={ops.filter((o) => o.projet_id === projet.id)} retour={() => setChoisi(null)} />;

  return (
    <div className="page">
      <h2 className="titre-page">Projets partagés</h2>
      <p className="texte-doux petit">Un projet réunit plusieurs familles ou personnes. Chacun voit seulement les dépenses et recettes du projet, jamais le reste de votre budget.</p>
      {estGestionnaire && <button className="btn btn-primaire btn-grand btn-plein" onClick={() => setNouveau({ nom: '', description: '' })}><Plus size={22} /> Nouveau projet</button>}
      {projets === null ? <Vide>Chargement…</Vide> : projets.length === 0 ? (
        <Vide>{estGestionnaire ? 'Aucun projet pour l\'instant. Créez-en un, par exemple « Chantier » ou « Location partagée ».' : 'Aucun projet partagé avec vous pour l\'instant.'}</Vide>
      ) : (
        <ul className="liste">
          {projets.map((p) => {
            const parts = p.projet_participants || [];
            const b = bilanProjet(ops.filter((o) => o.projet_id === p.id), parts);
            const m = moi(parts, profil);
            const solde = m ? b.par[m.id]?.solde || 0 : 0;
            return (
              <li key={p.id}>
                <button className="ligne" onClick={() => setChoisi(p.id)}>
                  <Users size={20} className="icone-accent" />
                  <span className="ligne-texte"><strong>{p.nom}</strong><small>{parts.map((x) => x.nom).join(', ')}</small></span>
                  <span className="ligne-solde">
                    <span className={`ligne-montant ${b.resultat >= 0 ? 'positif' : ''}`}>{eur(b.resultat)}</span>
                    {Math.abs(solde) > 0.004 && <small className={solde > 0 ? 'positif' : 'negatif'}>{solde > 0 ? `On vous doit ${eur(solde)}` : `Vous devez ${eur(-solde)}`}</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {nouveau && (
        <Modal titre="Nouveau projet" onClose={() => setNouveau(null)} pied={<button className="btn btn-primaire" onClick={creer}>Créer le projet</button>}>
          <Champ label="Nom du projet"><input autoFocus value={nouveau.nom} placeholder="Ex. : Chantier Rua das Cancelas" onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} /></Champ>
          <Champ label="Description (facultatif)"><input value={nouveau.description} onChange={(e) => setNouveau({ ...nouveau, description: e.target.value })} /></Champ>
          <p className="texte-doux petit">Votre famille fait partie du projet automatiquement. Vous inviterez ensuite les autres.</p>
        </Modal>
      )}
    </div>
  );
}

function DetailProjet({ projet, ops, retour }) {
  const { profil, famille, rafraichir } = useApp();
  const flash = useFlash();
  const parts = projet.projet_participants || [];
  const gere = projet.famille_id === profil.famille_id && profil.role === 'gestionnaire';
  const b = useMemo(() => bilanProjet(ops, parts), [ops, parts]);
  const m = moi(parts, profil);
  const nom = (id) => parts.find((p) => p.id === id)?.nom || '?';
  const [saisie, setSaisie] = useState(null);
  const [invit, setInvit] = useState(null);
  const [repartition, setRepartition] = useState(null);
  const [confirm, setConfirm] = useState(false);

  async function inviter() {
    const email = invit.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return flash('Indiquez une adresse e-mail valide.', 'erreur');
    if (!invit.nom.trim()) return flash('Indiquez le nom à afficher.', 'erreur');
    const { data, error } = await supabase.from('projet_participants').insert({ projet_id: projet.id, type: invit.type, nom: invit.nom.trim(), email }).select().single();
    if (error) return flash(messageClair(error), 'erreur');
    setInvit(null); rafraichir();
    const inscrit = data.famille_id || data.profil_id;
    flash(inscrit ? `${data.nom} voit maintenant le projet.` : `${data.nom} verra le projet dès qu'il ou elle aura créé son compte.`);
  }

  async function partager(p) {
    const texte = `Bonjour ! Je t'invite au projet « ${projet.nom} » dans Budget Famille.\n1. Ouvre ce lien : ${location.origin}\n2. Crée ton compte avec cette adresse : ${p.email}\n3. Le projet apparaîtra dans « Projets ».`;
    try {
      if (navigator.share) await navigator.share({ title: projet.nom, text: texte });
      else { await navigator.clipboard.writeText(texte); flash('Message copié. Collez-le dans WhatsApp, un SMS ou un e-mail.'); }
    } catch (e) { if (e?.name !== 'AbortError') flash('Partage impossible sur cet appareil.', 'erreur'); }
  }

  function exporter() {
    const c = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const n2 = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');
    const tete = ['Date', 'Type', 'Motif', 'Description', 'Montant', ...parts.map((p) => p.nom), 'Justificatif'];
    const lignes = [...ops].sort((x, y) => x.date_op.localeCompare(y.date_op)).map((o) => [
      o.date_op, o.sens === 'recette' ? 'Recette' : 'Dépense', o.categorie, o.libelle, n2(o.montant),
      ...parts.map((p) => n2((o.parts || []).find((x) => x.participant_id === p.id)?.montant || 0)), o.justificatif ? 'oui' : 'NON',
    ]);
    const csv = '\uFEFF' + [tete, ...lignes].map((l) => l.map(c).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `projet-${projet.nom.replace(/[^\w-]+/g, '-').toLowerCase()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function archiver() {
    setConfirm(false);
    const { error } = await supabase.from('projets').update({ archive: true }).eq('id', projet.id);
    if (error) return flash(messageClair(error), 'erreur');
    flash('Projet archivé.'); retour(); rafraichir();
  }

  return (
    <div className="page">
      <button className="lien retour" onClick={retour}><ArrowLeft size={18} /> Tous les projets</button>
      <section className="bandeau">
        <p className="bandeau-label">{projet.nom}</p>
        <p className={`bandeau-chiffre ${b.resultat < 0 ? 'negatif' : ''}`}>{eur(b.resultat)}</p>
        <p className="bandeau-sous">Résultat du projet : {eur(b.recettes)} de recettes, {eur(b.depenses)} de dépenses</p>
        {projet.description && <p className="bandeau-sous">{projet.description}</p>}
      </section>

      <div className="actions2">
        <button className="btn btn-primaire btn-grand" onClick={() => setSaisie({ sens: 'depense' })}><Plus size={22} /> Dépense</button>
        <button className="btn btn-second btn-grand" onClick={() => setSaisie({ sens: 'recette' })}><ArrowDownCircle size={22} /> Recette</button>
      </div>

      <h3 className="titre-section">Pour être à égalité</h3>
      {b.virements.length === 0 ? <p className="carte texte-doux">{b.nb ? 'Tout le monde est à égalité.' : 'Rien à équilibrer pour l\'instant.'}</p>
        : <div className="carte">{b.virements.map((v, i) => (
          <p key={i} className="virement"><strong>{nom(v.de)}</strong> <ArrowRight size={16} /> <strong>{nom(v.a)}</strong><span>{eur(v.montant)}</span></p>
        ))}</div>}

      <h3 className="titre-section">Participants</h3>
      <div className="fiches">
        {parts.map((p) => {
          const v = b.par[p.id];
          const enAttente = !p.famille_id && !p.profil_id;
          return (
            <div key={p.id} className="carte fiche">
              <div className="fiche-tete">
                <strong>{p.type === 'famille' ? <Users size={16} /> : <User size={16} />} {p.nom}</strong>
                {m?.id === p.id ? <Pastille ton="succes">Vous</Pastille> : enAttente ? <Pastille ton="encours">Invitation envoyée</Pastille> : null}
              </div>
              <dl>
                <dt>A payé</dt><dd>{eur(v.paye)}</dd>
                <dt>A reçu</dt><dd className="positif">{eur(v.recu)}</dd>
                <dt>Sa part ({Math.round(v.quote * 100)} %)</dt><dd>{eur(v.part)}</dd>
                <dt>Solde</dt><dd className={v.solde > 0.004 ? 'positif' : v.solde < -0.004 ? 'negatif' : ''}>{v.solde > 0.004 ? `+${eur(v.solde)}` : eur(v.solde)}</dd>
              </dl>
              {gere && enAttente && p.email && <button className="btn btn-petit btn-primaire" onClick={() => partager(p)}><Send size={16} /> Envoyer le lien</button>}
            </div>
          );
        })}
      </div>
      {gere && (
        <div className="actions2">
          <button className="btn btn-second" onClick={() => setInvit({ type: 'famille', nom: '', email: '' })}><UserPlus size={18} /> Inviter</button>
          <button className="btn btn-second" onClick={() => setRepartition(Object.fromEntries(parts.map((p) => [p.id, String(Math.round(quotesProjet(parts)[p.id] * 1000) / 10).replace('.', ',')])))}><Percent size={18} /> Répartition</button>
        </div>
      )}

      <h3 className="titre-section">Dépenses et recettes</h3>
      {ops.length === 0 ? <Vide>Aucune opération. Touchez « Dépense » ou « Recette ».</Vide> : (
        <ul className="liste">
          {ops.map((o) => (
            <li key={o.id}>
              <button className="ligne" onClick={() => setSaisie(o)}>
                <span className="ligne-date">{dateCourte(o.date_op)}</span>
                <span className="ligne-texte">
                  <strong>{o.libelle || o.categorie}</strong>
                  <small>{o.sens === 'recette' ? 'Reçu par ' : 'Payé par '}{(o.parts || []).map((x) => `${nom(x.participant_id)}${(o.parts || []).length > 1 ? ` (${eur(x.montant)})` : ''}`).join(', ')}</small>
                </span>
                <span className="ligne-icones">{o.justificatif && <Paperclip size={14} aria-label="Justificatif" />}</span>
                <span className={`ligne-montant ${o.sens === 'recette' ? 'positif' : ''}`}>{o.sens === 'recette' ? '+' : '−'}{eur(o.montant)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="actions2">
        <button className="btn btn-second" disabled={!ops.length} onClick={exporter}><Download size={18} /> Exporter (Excel)</button>
        {gere && <button className="btn btn-second" onClick={() => setConfirm(true)}><Archive size={18} /> Archiver le projet</button>}
      </div>
      {famille && !gere && <p className="texte-doux petit">Ce projet a été créé par une autre famille. Vous voyez seulement ce qui concerne le projet.</p>}

      {saisie && <SaisieProjet projet={projet} participants={parts} moi={m} initial={saisie} onClose={() => setSaisie(null)} />}
      {invit && (
        <Modal titre="Inviter au projet" onClose={() => setInvit(null)} pied={<button className="btn btn-primaire" onClick={inviter}>Inviter</button>}>
          <Tabs valeur={invit.type} onChange={(v) => setInvit({ ...invit, type: v })} options={[['famille', 'Une famille'], ['personne', 'Une personne']]} />
          <p className="texte-doux petit">{invit.type === 'famille'
            ? 'Les gestionnaires de cette famille verront le projet. Indiquez l\'e-mail de l\'un d\'eux.'
            : 'Seule cette personne verra le projet, pas le reste de sa famille.'}</p>
          <Champ label="Nom affiché"><input value={invit.nom} placeholder={invit.type === 'famille' ? 'Ex. : Famille Machado' : 'Ex. : Pierre'} onChange={(e) => setInvit({ ...invit, nom: e.target.value })} /></Champ>
          <Champ label="Adresse e-mail"><input type="email" inputMode="email" autoCapitalize="none" value={invit.email} onChange={(e) => setInvit({ ...invit, email: e.target.value })} /></Champ>
        </Modal>
      )}
      {repartition && <Repartition parts={parts} valeurs={repartition} setValeurs={setRepartition} />}
      {confirm && <Confirmer texte={`Archiver « ${projet.nom} » ? Il disparaît de la liste pour tout le monde, mais rien n'est effacé.`} action="Archiver" danger onOui={archiver} onNon={() => setConfirm(false)} />}
    </div>
  );
}

function Repartition({ parts, valeurs, setValeurs }) {
  const { rafraichir } = useApp();
  const flash = useFlash();
  const total = arrondi(Object.values(valeurs).reduce((s, v) => s + num(v), 0));
  async function egal() {
    for (const p of parts) { const { error } = await supabase.from('projet_participants').update({ quote: null }).eq('id', p.id); if (error) return flash(messageClair(error), 'erreur'); }
    flash('Résultat partagé à parts égales.'); setValeurs(null); rafraichir();
  }
  async function enregistrer() {
    if (Math.abs(total - 100) > 0.01) return flash('Le total doit faire 100 %.', 'erreur');
    for (const p of parts) { const { error } = await supabase.from('projet_participants').update({ quote: arrondi(num(valeurs[p.id])) }).eq('id', p.id); if (error) return flash(messageClair(error), 'erreur'); }
    flash('Répartition enregistrée.'); setValeurs(null); rafraichir();
  }
  return (
    <Modal titre="Répartition du résultat" onClose={() => setValeurs(null)} pied={<>
      <button className="btn btn-second" onClick={egal}>Parts égales</button>
      <button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button>
    </>}>
      <p className="texte-doux">Quelle part du bénéfice (ou de la perte) revient à chacun ?</p>
      {parts.map((p) => (
        <Champ key={p.id} label={`${p.nom} (%)`}>
          <input inputMode="decimal" value={valeurs[p.id]} onChange={(e) => setValeurs({ ...valeurs, [p.id]: e.target.value.replace(/[^0-9,.]/g, '') })} />
        </Champ>
      ))}
      <p className={Math.abs(total - 100) > 0.01 ? 'negatif' : 'positif'}>Total : {String(total).replace('.', ',')} %</p>
    </Modal>
  );
}

function SaisieProjet({ projet, participants, moi: m, initial, onClose }) {
  const { profil, rafraichir } = useApp();
  const flash = useFlash();
  const existant = Boolean(initial.cree_le);
  const [f, setF] = useState(() => existant
    ? { ...initial, montant: String(initial.montant).replace('.', ',') }
    : { id: nouvelId(), sens: initial.sens, montant: '', date_op: aujourdhui(), categorie: initial.sens === 'recette' ? 'Autre recette' : 'Autre frais', libelle: '', justificatif: null });
  const [qui, setQui] = useState(() => existant
    ? Object.fromEntries((initial.parts || []).map((x) => [x.participant_id, String(x.montant).replace('.', ',')]))
    : (m ? { [m.id]: '' } : {}));
  const [fichier, setFichier] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const montant = arrondi(num(f.montant));
  const choisis = Object.keys(qui);
  const plusieurs = choisis.length > 1;
  const reparti = arrondi(choisis.reduce((s, id) => s + num(qui[id]), 0));
  const reste = arrondi(montant - reparti);

  function basculer(id) {
    setQui((q) => { const n = { ...q }; if (id in n) delete n[id]; else n[id] = ''; return n; });
  }
  function egal() {
    if (!choisis.length || !(montant > 0)) return;
    const base = Math.floor((montant / choisis.length) * 100) / 100;
    const n = {}; choisis.forEach((id, i) => { n[id] = String(i === 0 ? arrondi(montant - base * (choisis.length - 1)) : base).replace('.', ','); });
    setQui(n);
  }

  async function valider() {
    if (!(montant > 0)) return flash('Indiquez un montant.', 'erreur');
    if (!choisis.length) return flash(f.sens === 'recette' ? 'Indiquez qui a reçu l\'argent.' : 'Indiquez qui a payé.', 'erreur');
    if (!String(f.categorie || '').trim()) return flash('Choisissez ou écrivez un motif.', 'erreur');
    const partsOp = choisis.map((id) => ({ participant_id: id, montant: plusieurs ? arrondi(num(qui[id])) : montant }));
    if (plusieurs && Math.abs(reste) > 0.009) return flash(`Il reste ${eur(reste)} à répartir.`, 'erreur');
    setEnvoi(true);
    try {
      let justificatif = f.justificatif;
      if (fichier) justificatif = await envoyerJustificatif(fichier, 'projet', projet.id);
      const ligne = { id: f.id, projet_id: projet.id, sens: f.sens, montant, date_op: f.date_op, categorie: String(f.categorie).trim(), libelle: (f.libelle || '').trim(), parts: partsOp, justificatif };
      if (!existant) ligne.cree_par = profil.id;
      const { error } = await supabase.from('projet_operations').upsert(ligne);
      if (error) throw error;
      flash(existant ? 'Modification enregistrée.' : 'Opération ajoutée au projet.'); rafraichir(); onClose();
    } catch (e) { flash(messageClair(e), 'erreur'); }
    finally { setEnvoi(false); }
  }
  async function archiver() {
    setConfirm(false);
    const { error } = await supabase.from('projet_operations').update({ archive: true }).eq('id', f.id);
    if (error) return flash(messageClair(error), 'erreur');
    flash('Opération archivée.'); rafraichir(); onClose();
  }
  async function voir() { try { window.open(await lienJustificatif(f.justificatif), '_blank'); } catch (e) { flash(messageClair(e), 'erreur'); } }

  const titre = existant ? 'Modifier' : f.sens === 'recette' ? 'Recette du projet' : 'Dépense du projet';
  return (
    <Modal titre={titre} onClose={onClose} pied={<>
      {existant && <button className="btn btn-second" onClick={() => setConfirm(true)}><Archive size={18} /> Archiver</button>}
      <button className="btn btn-primaire" disabled={envoi} onClick={valider}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
    </>}>
      <p className="texte-doux petit">{projet.nom}</p>
      {!existant && <Tabs valeur={f.sens} onChange={(v) => { maj('sens', v); maj('categorie', v === 'recette' ? 'Autre recette' : 'Autre frais'); }} options={[['depense', 'Dépense'], ['recette', 'Recette']]} />}
      <Champ label="Montant (€)"><input className="input-montant" inputMode="decimal" placeholder="0,00" autoFocus={!existant} value={f.montant} onChange={(e) => maj('montant', e.target.value.replace(/[^0-9,.]/g, ''))} /></Champ>
      <div className="grille2">
        <Champ label="Date"><input type="date" value={f.date_op} onChange={(e) => maj('date_op', e.target.value)} /></Champ>
        <Champ label="Motif"><ChoixCategorie key={f.sens} {...espacePro(f.sens)} valeur={f.categorie} onChange={(c) => maj('categorie', c)} /></Champ>
      </div>
      <Champ label="Description"><input value={f.libelle} placeholder="Ex. : sacs de ciment" onChange={(e) => maj('libelle', e.target.value)} /></Champ>

      <Champ label={f.sens === 'recette' ? 'Reçu par' : 'Payé par'} aide={plusieurs ? 'Tapez le montant de chacun.' : 'Touchez plusieurs noms si vous avez payé ensemble.'}>
        <div className="choixpers">
          {participants.map((p) => <button type="button" key={p.id} className={p.id in qui ? 'actif' : ''} aria-pressed={p.id in qui} onClick={() => basculer(p.id)}>{p.nom}</button>)}
        </div>
      </Champ>
      {plusieurs && (
        <div className="carte parts">
          {choisis.map((id) => (
            <Champ key={id} label={participants.find((p) => p.id === id)?.nom}>
              <input inputMode="decimal" placeholder="0,00" aria-label={`Montant de ${participants.find((p) => p.id === id)?.nom}`} value={qui[id]} onChange={(e) => setQui({ ...qui, [id]: e.target.value.replace(/[^0-9,.]/g, '') })} />
            </Champ>
          ))}
          <div className="parts-pied">
            <span className={Math.abs(reste) > 0.009 ? 'negatif' : 'positif'}>{Math.abs(reste) > 0.009 ? `Reste à répartir : ${eur(reste)}` : 'Tout est réparti ✓'}</span>
            <button type="button" className="btn btn-petit btn-second" onClick={egal}>Parts égales</button>
          </div>
        </div>
      )}

      <Champ label="Justificatif (photo ou PDF)">
        <div className="justif">
          <label className="btn btn-second"><Paperclip size={18} /> {fichier ? fichier.name.slice(0, 24) : (f.justificatif ? 'Remplacer' : 'Ajouter')}
            <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFichier(e.target.files?.[0] || null)} />
          </label>
          {f.justificatif && !fichier && <button type="button" className="btn btn-second" onClick={voir}><Eye size={18} /> Voir</button>}
        </div>
      </Champ>
      {confirm && <Confirmer texte="Archiver cette opération ? Elle ne comptera plus, mais reste dans l'historique." action="Archiver" danger onOui={archiver} onNon={() => setConfirm(false)} />}
    </Modal>
  );
}
