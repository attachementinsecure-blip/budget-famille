import { useEffect, useState } from 'react';
import { UserPlus, LogOut, Trash2, Plus, Send } from 'lucide-react';
import { useApp } from './contexte.jsx';
import { Champ, Pastille, Confirmer, useFlash } from './ui.jsx';
import { supabase, messageClair } from './api.js';
import { LIB_ROLE } from './format.js';

export default function Famille() {
  const { profil, membres, tousMembres, estGestionnaire, rafraichir, famille } = useApp();
  const [nomFamille, setNomFamille] = useState(famille?.nom || '');
  const [nouvelEnfant, setNouvelEnfant] = useState('');
  const [nouveauCompte, setNouveauCompte] = useState('');
  const comptesFoyer = famille?.comptes?.length ? famille.comptes : ['Compte commun'];
  const flash = useFlash();
  const [prenom, setPrenom] = useState(profil.prenom);
  const [invits, setInvits] = useState([]);
  const [inv, setInv] = useState({ email: '', prenom: '', role: 'membre' });
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
      <h2 className="titre-page">{famille?.nom || 'Famille'}</h2>
      {estGestionnaire && famille && (
        <div className="carte">
          <Champ label="Nom de la famille">
            <div className="ligne-champ">
              <input value={nomFamille} onChange={(e) => setNomFamille(e.target.value)} />
              <button className="btn btn-second" disabled={!nomFamille.trim() || nomFamille === famille.nom}
                onClick={() => action(supabase.from('familles').update({ nom: nomFamille.trim() }).eq('id', famille.id), 'Nom de la famille enregistré.')}>Enregistrer</button>
            </div>
          </Champ>
          <p className="texte-doux petit">Les autres familles ne voient jamais vos données, sauf les projets que vous partagez.</p>
        </div>
      )}

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

        <h3 className="titre-section">Comptes du foyer</h3>
        <p className="texte-doux petit">Ils apparaissent dans « Payé avec » pour savoir d'où sort l'argent (compte commun, Revolut, Sumeria…).</p>
        <div className="choixpers">
          {comptesFoyer.map((c) => (
            <button type="button" key={c} className="actif" onClick={() => comptesFoyer.length > 1 && setConfirm({ texte: `Retirer « ${c} » de la liste ? Les opérations déjà notées gardent ce nom.`, faire: () => action(supabase.from('familles').update({ comptes: comptesFoyer.filter((x) => x !== c) }).eq('id', famille.id), `« ${c} » retiré.`) })}>{c}{comptesFoyer.length > 1 ? ' ✕' : ''}</button>
          ))}
        </div>
        <div className="carte ligne-champ">
          <input placeholder="Ex. : Revolut" value={nouveauCompte} onChange={(e) => setNouveauCompte(e.target.value)} aria-label="Nom du compte" />
          <button className="btn btn-primaire" disabled={!nouveauCompte.trim() || comptesFoyer.includes(nouveauCompte.trim())}
            onClick={async () => { if (await action(supabase.from('familles').update({ comptes: [...comptesFoyer, nouveauCompte.trim()] }).eq('id', famille.id), `Compte « ${nouveauCompte.trim()} » ajouté.`)) setNouveauCompte(''); }}><Plus size={18} /> Ajouter</button>
        </div>
        <label className="carte case case-grande">
          <input type="checkbox" checked={Boolean(famille?.couple_commun)} onChange={(e) => action(supabase.from('familles').update({ couple_commun: e.target.checked }).eq('id', famille.id), e.target.checked ? 'Tout l\'argent du couple est commun : plus de calcul de dettes entre vous.' : 'Le calcul de « qui doit combien » est de retour.')} />
          <span><strong>Tout l'argent du couple est commun</strong><br /><small className="texte-doux">Plus de « qui doit combien » entre vous dans Commun. Les projets avec d'autres personnes ne changent pas.</small></span>
        </label>

        <h3 className="titre-section">Enfants</h3>
        <p className="texte-doux petit">Les enfants n'ont pas besoin de compte. Leur prénom ajoute une case dans « Commun » pour suivre leurs dépenses (école, vêtements, activités…).</p>
        {(famille?.enfants || []).length > 0 && (
          <div className="choixpers">
            {famille.enfants.map((e) => (
              <button type="button" key={e} className="actif" onClick={() => setConfirm({ texte: `Retirer la case « ${e} » ? Les dépenses déjà notées restent enregistrées.`, faire: () => action(supabase.from('familles').update({ enfants: famille.enfants.filter((x) => x !== e) }).eq('id', famille.id), `Case « ${e} » retirée.`) })}>{e} ✕</button>
            ))}
          </div>
        )}
        <div className="carte ligne-champ">
          <input placeholder="Prénom, ex. : Daniel" value={nouvelEnfant} onChange={(e) => setNouvelEnfant(e.target.value)} aria-label="Prénom de l'enfant" />
          <button className="btn btn-primaire" disabled={!nouvelEnfant.trim() || (famille?.enfants || []).includes(nouvelEnfant.trim())}
            onClick={async () => { if (await action(supabase.from('familles').update({ enfants: [...(famille?.enfants || []), nouvelEnfant.trim()] }).eq('id', famille.id), `Case « ${nouvelEnfant.trim()} » ajoutée dans Commun.`)) setNouvelEnfant(''); }}><Plus size={18} /> Ajouter</button>
        </div>
      </>}

      <button className="btn btn-second btn-plein deconnexion" onClick={() => supabase.auth.signOut()}><LogOut size={18} /> Se déconnecter</button>
      {confirm && <Confirmer texte={confirm.texte} danger action="Confirmer" onOui={() => { confirm.faire(); setConfirm(null); }} onNon={() => setConfirm(null)} />}
    </div>
  );
}
