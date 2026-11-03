import { useEffect, useState } from 'react';
import { UserPlus, LogOut, Trash2, Pencil, X, Plus, Send } from 'lucide-react';
import { useApp } from './contexte.jsx';
import { Champ, Pastille, Confirmer, Vide, useFlash } from './ui.jsx';
import { supabase, messageClair } from './api.js';
import { LIB_ROLE } from './format.js';

export default function Famille() {
  const { profil, membres, tousMembres, estGestionnaire, rafraichir, activites, toutesActivites } = useApp();
  const archivees = toutesActivites.filter((a) => a.archive);
  const [editAct, setEditAct] = useState(null);
  const flash = useFlash();
  const [prenom, setPrenom] = useState(profil.prenom);
  const [invits, setInvits] = useState([]);
  const [inv, setInv] = useState({ email: '', prenom: '', role: 'membre' });
  const [nouvelleAct, setNouvelleAct] = useState('');
  const [confirm, setConfirm] = useState(null);

  const chargerInvits = () => estGestionnaire && supabase.from('invitations').select('*').order('cree_le').then(({ data }) => setInvits(data || []));
  useEffect(() => { chargerInvits(); /* eslint-disable-next-line */ }, [estGestionnaire]);

  const total = membres.length + invits.length;

  async function action(promesse, ok) {
    const { error } = await promesse;
    if (error) flash(messageClair(error), 'erreur'); else { flash(ok); rafraichir(); chargerInvits(); }
    return !error;
  }

  // L'application n'envoie pas d'e-mail : on partage le lien par WhatsApp, SMS ou e-mail
  async function partagerInvitation(i) {
    const texte = `Bonjour ${i.prenom} ! Je t'invite dans notre application Budget Famille.\n1. Ouvre ce lien : ${location.origin}\n2. Touche « Créer un compte » avec cette adresse : ${i.email}\n3. Confirme ton compte avec l'e-mail reçu, puis connecte-toi.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Budget Famille', text: texte });
      else { await navigator.clipboard.writeText(texte); flash('Message copié. Collez-le dans WhatsApp, un SMS ou un e-mail.'); }
    } catch (e) { if (e?.name !== 'AbortError') flash('Partage impossible sur cet appareil.', 'erreur'); }
  }

  async function inviter() {
    if (!/^\S+@\S+\.\S+$/.test(inv.email.trim())) return flash('Indiquez une adresse e-mail valide.', 'erreur');
    if (!inv.prenom.trim()) return flash('Indiquez le prénom.', 'erreur');
    if (await action(supabase.from('invitations').insert({ email: inv.email.trim().toLowerCase(), prenom: inv.prenom.trim(), role: inv.role }),
      `Invitation prête. Touchez « Envoyer » pour transmettre le lien à ${inv.prenom.trim()}.`)) setInv({ email: '', prenom: '', role: 'membre' });
  }

  return (
    <div className="page">
      <h2 className="titre-page">Famille</h2>

      <div className="carte">
        <Champ label="Mon prénom">
          <div className="ligne-champ">
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            <button className="btn btn-second" disabled={!prenom.trim() || prenom === profil.prenom}
              onClick={() => action(supabase.from('profils').update({ prenom: prenom.trim() }).eq('id', profil.id), 'Prénom enregistré.')}>Enregistrer</button>
          </div>
        </Champ>
        <p className="texte-doux petit">{profil.email}, {LIB_ROLE[profil.role].toLowerCase()}</p>
      </div>

      <h3 className="titre-section">Membres ({membres.length} / 6)</h3>
      <ul className="liste">
        {tousMembres.map((m) => (
          <li key={m.id} className={`ligne ligne-fixe ${m.actif ? '' : 'inactif'}`}>
            <span className="ligne-texte"><strong>{m.prenom}{m.id === profil.id ? ' (moi)' : ''}</strong><small>{m.email}</small></span>
            {estGestionnaire && m.id !== profil.id ? (
              <>
                <select className="select-petit" value={m.role} onChange={(e) => action(supabase.from('profils').update({ role: e.target.value }).eq('id', m.id), 'Rôle changé.')}>
                  <option value="gestionnaire">Gestionnaire</option><option value="membre">Membre</option>
                </select>
                {m.actif
                  ? <button className="btn btn-petit btn-second" onClick={() => setConfirm({ texte: `Retirer ${m.prenom} de la famille ? Ses saisies restent enregistrées.`, faire: () => action(supabase.from('profils').update({ actif: false }).eq('id', m.id), `${m.prenom} a été retiré(e).`) })}>Retirer</button>
                  : <button className="btn btn-petit btn-second" onClick={() => action(supabase.from('profils').update({ actif: true }).eq('id', m.id), `${m.prenom} est de retour.`)}>Réactiver</button>}
              </>
            ) : <Pastille ton={m.role === 'gestionnaire' ? 'succes' : 'info'}>{LIB_ROLE[m.role]}</Pastille>}
          </li>
        ))}
      </ul>
      {!estGestionnaire && <p className="texte-doux petit">Les gestionnaires voient toutes les dépenses. Les membres voient leurs dépenses perso et les dépenses communes, jamais la partie pro.</p>}

      {estGestionnaire && <>
        <h3 className="titre-section">Inviter quelqu'un</h3>
        {total >= 6 ? <p className="carte texte-doux">La famille est complète (6 personnes maximum, invitations comprises).</p> : (
          <div className="carte">
            <Champ label="Prénom"><input value={inv.prenom} onChange={(e) => setInv({ ...inv, prenom: e.target.value })} /></Champ>
            <Champ label="Adresse e-mail"><input type="email" inputMode="email" autoCapitalize="none" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Champ>
            <Champ label="Rôle" aide="Gestionnaire : voit tout, y compris le pro. Membre : voit son perso et le commun.">
              <select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>
                <option value="gestionnaire">Gestionnaire</option><option value="membre">Membre</option>
              </select>
            </Champ>
            <button className="btn btn-primaire btn-plein" onClick={inviter}><UserPlus size={18} /> Inviter</button>
          </div>
        )}
        {invits.length > 0 && <ul className="liste">
          {invits.map((i) => (
            <li key={i.email} className="ligne ligne-fixe">
              <span className="ligne-texte"><strong>{i.prenom}</strong><small>{i.email}, en attente</small></span>
              <Pastille ton="encours">{LIB_ROLE[i.role]}</Pastille>
              <button className="btn btn-petit btn-primaire" onClick={() => partagerInvitation(i)}><Send size={16} /> Envoyer</button>
              <button className="btn-icone" aria-label="Annuler l'invitation" onClick={() => setConfirm({ texte: `Annuler l'invitation de ${i.prenom} ?`, faire: () => action(supabase.from('invitations').delete().eq('email', i.email), 'Invitation annulée.') })}><Trash2 size={18} /></button>
            </li>
          ))}
        </ul>}

        <h3 className="titre-section">Activités pro</h3>
        <p className="texte-doux petit">Une activité par logement ou par travail (Airbnb, 2e logement, chantier…). Chaque recette ou frais pro est rangé dans une activité.</p>
        {activites.length === 0 ? <Vide>Aucune activité. Ajoutez-en une ci-dessous.</Vide> : (
          <ul className="liste">
            {activites.map((a) => editAct?.id === a.id ? (
              <li key={a.id} className="carte ligne-champ">
                <input autoFocus value={editAct.nom} onChange={(e) => setEditAct({ ...editAct, nom: e.target.value })} aria-label="Nouveau nom" />
                <button className="btn btn-primaire" disabled={!editAct.nom.trim()} onClick={async () => { if (await action(supabase.from('activites').update({ nom: editAct.nom.trim() }).eq('id', a.id), 'Activité renommée.')) setEditAct(null); }}>Enregistrer</button>
                <button className="btn-icone" aria-label="Annuler" onClick={() => setEditAct(null)}><X size={18} /></button>
              </li>
            ) : (
              <li key={a.id} className="ligne ligne-fixe">
                <span className="ligne-texte"><strong>{a.nom}</strong></span>
                <button className="btn-icone" aria-label={`Renommer ${a.nom}`} onClick={() => setEditAct({ id: a.id, nom: a.nom })}><Pencil size={18} /></button>
                <button className="btn-icone" aria-label={`Supprimer ${a.nom}`} onClick={() => setConfirm({ texte: `Supprimer l'activité « ${a.nom} » ? Elle ne sera plus proposée. Les recettes et frais déjà enregistrés restent dans les bilans.`, faire: () => action(supabase.from('activites').update({ archive: true }).eq('id', a.id), 'Activité supprimée.') })}><Trash2 size={18} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="carte ligne-champ">
          <input placeholder="Nouvelle activité, ex. : 2e logement" value={nouvelleAct} onChange={(e) => setNouvelleAct(e.target.value)} aria-label="Nouvelle activité" />
          <button className="btn btn-primaire" disabled={!nouvelleAct.trim()} onClick={async () => { if (await action(supabase.from('activites').insert({ nom: nouvelleAct.trim() }), 'Activité ajoutée.')) setNouvelleAct(''); }}><Plus size={18} /> Ajouter</button>
        </div>
        {archivees.length > 0 && (
          <details className="carte">
            <summary className="texte-doux">Activités supprimées ({archivees.length})</summary>
            <ul className="liste mt">
              {archivees.map((a) => (
                <li key={a.id} className="ligne ligne-fixe inactif-doux">
                  <span className="ligne-texte"><strong>{a.nom}</strong></span>
                  <button className="btn btn-petit btn-second" onClick={() => action(supabase.from('activites').update({ archive: false }).eq('id', a.id), `${a.nom} est de retour.`)}>Remettre</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </>}

      <button className="btn btn-second btn-plein deconnexion" onClick={() => supabase.auth.signOut()}><LogOut size={18} /> Se déconnecter</button>
      {confirm && <Confirmer texte={confirm.texte} danger action="Confirmer" onOui={() => { confirm.faire(); setConfirm(null); }} onNon={() => setConfirm(null)} />}
    </div>
  );
}
