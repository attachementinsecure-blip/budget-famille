import { useEffect, useState } from 'react';
import { UserPlus, LogOut, Trash2 } from 'lucide-react';
import { useApp } from './contexte.jsx';
import { Champ, Pastille, Confirmer, useFlash } from './ui.jsx';
import { supabase, messageClair } from './api.js';
import { LIB_ROLE } from './format.js';

export default function Famille() {
  const { profil, membres, tousMembres, estGestionnaire, rafraichir, activites } = useApp();
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

  async function inviter() {
    if (!/^\S+@\S+\.\S+$/.test(inv.email.trim())) return flash('Indiquez une adresse e-mail valide.', 'erreur');
    if (!inv.prenom.trim()) return flash('Indiquez le prénom.', 'erreur');
    if (await action(supabase.from('invitations').insert({ email: inv.email.trim().toLowerCase(), prenom: inv.prenom.trim(), role: inv.role }),
      `Invitation prête. Envoyez le lien de l'application à ${inv.prenom.trim()} : il ou elle crée son compte avec cette adresse.`)) setInv({ email: '', prenom: '', role: 'membre' });
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
              <button className="btn-icone" aria-label="Annuler l'invitation" onClick={() => setConfirm({ texte: `Annuler l'invitation de ${i.prenom} ?`, faire: () => action(supabase.from('invitations').delete().eq('email', i.email), 'Invitation annulée.') })}><Trash2 size={18} /></button>
            </li>
          ))}
        </ul>}

        <h3 className="titre-section">Activités pro</h3>
        <ul className="liste">
          {activites.map((a) => <li key={a.id} className="ligne ligne-fixe"><span className="ligne-texte"><strong>{a.nom}</strong></span></li>)}
        </ul>
        <div className="carte ligne-champ">
          <input placeholder="Ex. : 2e logement" value={nouvelleAct} onChange={(e) => setNouvelleAct(e.target.value)} />
          <button className="btn btn-second" disabled={!nouvelleAct.trim()} onClick={async () => { if (await action(supabase.from('activites').insert({ nom: nouvelleAct.trim() }), 'Activité ajoutée.')) setNouvelleAct(''); }}>Ajouter</button>
        </div>
      </>}

      <button className="btn btn-second btn-plein deconnexion" onClick={() => supabase.auth.signOut()}><LogOut size={18} /> Se déconnecter</button>
      {confirm && <Confirmer texte={confirm.texte} danger action="Confirmer" onOui={() => { confirm.faire(); setConfirm(null); }} onNon={() => setConfirm(null)} />}
    </div>
  );
}
