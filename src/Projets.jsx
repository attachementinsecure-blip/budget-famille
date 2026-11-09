import { useEffect, useMemo, useState } from 'react';
import { Plus, ArrowDownCircle, ArrowLeft, ArrowRight, UserPlus, Users, User, Landmark, FileSpreadsheet, FileText, Paperclip, Archive, Send, Percent, BedDouble, Repeat, Settings2, Trash2, ArrowLeftRight, Check } from 'lucide-react';
import { useApp } from './contexte.jsx';
import { Modal, Champ, Confirmer, Pastille, Tabs, Vide, NavPeriode, useFlash } from './ui.jsx';
import { supabase, messageClair, nouvelId } from './api.js';
import { eur, num, arrondi, dateCourte, PERIODES, decaler, moisCle } from './format.js';
import { bilanProjet, quotesProjet, estCompte } from './calculs.js';
import { construirePdfProjet, nomPdf, estReservation, LIB_PLATEFORME } from './pdfbilan.js';
import { construireBilan, nomFichier, telecharger } from './export.js';
import SaisieProjet from './SaisieProjet.jsx';

function useProjets() {
  const { rev } = useApp();
  const [etat, setEtat] = useState({ projets: null, ops: [], fixes: [] });
  useEffect(() => {
    Promise.all([
      supabase.from('projets').select('*, projet_participants(*)').eq('archive', false).order('cree_le'),
      supabase.from('projet_operations').select('*').eq('archive', false).order('date_op', { ascending: false }).order('cree_le', { ascending: false }),
      supabase.from('projet_fixes').select('*').eq('actif', true).order('libelle'),
    ]).then(([p, o, f]) => setEtat({ projets: (p.data || []).map((x) => ({ ...x, projet_participants: [...(x.projet_participants || [])].sort((a, b) => a.cree_le.localeCompare(b.cree_le)) })), ops: o.data || [], fixes: f.data || [] }));
  }, [rev]);
  return etat;
}

export const moiDans = (participants, profil) => participants.find((p) => (p.type === 'personne' && p.profil_id === profil.id))
  || participants.find((p) => p.type === 'famille' && p.famille_id === profil.famille_id);
const icone = (p) => (p.type === 'compte' ? <Landmark size={16} /> : p.type === 'famille' ? <Users size={16} /> : <User size={16} />);

export default function Projets({ params }) {
  const { profil, estGestionnaire, rafraichir } = useApp();
  const flash = useFlash();
  const { projets, ops, fixes } = useProjets();
  const [choisi, setChoisi] = useState(params?.projet || null);
  const [nouveau, setNouveau] = useState(null);

  async function creer() {
    if (!nouveau.nom.trim()) return flash('Donnez un nom au projet.', 'erreur');
    const { data, error } = await supabase.from('projets').insert({ nom: nouveau.nom.trim(), description: nouveau.description.trim(), type: nouveau.type }).select().single();
    if (error) return flash(messageClair(error), 'erreur');
    flash('Projet créé.'); setNouveau(null); setChoisi(data.id); rafraichir();
  }

  const projet = projets?.find((p) => p.id === choisi);
  if (projet) return <DetailProjet projet={projet} ops={ops.filter((o) => o.projet_id === projet.id)} fixes={fixes.filter((f) => f.projet_id === projet.id)} retour={() => setChoisi(null)} />;

  return (
    <div className="page">
      <h2 className="titre-page">Projets</h2>
      <p className="texte-doux petit">Vos locations, vos affaires pro, vos projets à plusieurs. Chaque participant voit seulement le projet, jamais le reste de votre budget.</p>
      {estGestionnaire && <button className="btn btn-primaire btn-grand btn-plein" onClick={() => setNouveau({ nom: '', description: '', type: 'location' })}><Plus size={22} /> Nouveau projet</button>}
      {projets === null ? <Vide>Chargement…</Vide> : projets.length === 0 ? (
        <Vide>{estGestionnaire ? 'Aucun projet pour l\'instant. Créez-en un, par exemple « Location Cabane » ou « Casa Mila ».' : 'Aucun projet partagé avec vous pour l\'instant.'}</Vide>
      ) : (
        <ul className="liste">
          {projets.map((p) => {
            const parts = p.projet_participants || [];
            const b = bilanProjet(ops.filter((o) => o.projet_id === p.id), parts);
            const m = moiDans(parts, profil);
            const solde = m && parts.length > 1 ? b.par[m.id]?.solde || 0 : 0;
            return (
              <li key={p.id}>
                <button className="ligne" onClick={() => setChoisi(p.id)}>
                  {p.type === 'location' ? <BedDouble size={20} className="icone-accent" /> : <Users size={20} className="icone-accent" />}
                  <span className="ligne-texte"><strong>{p.nom}</strong><small>{parts.length > 1 ? parts.map((x) => x.nom).join(', ') : (p.type === 'location' ? 'Location' : 'Projet')}{b.nbResa ? `, ${b.nbResa} réservation(s)` : ''}</small></span>
                  <span className="ligne-solde">
                    <span className={`ligne-montant ${b.resultat >= 0 ? 'positif' : 'negatif'}`}>{eur(b.resultat)}</span>
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
          <Tabs valeur={nouveau.type} onChange={(v) => setNouveau({ ...nouveau, type: v })} options={[['location', 'Location saisonnière'], ['general', 'Autre projet']]} />
          <p className="texte-doux petit">{nouveau.type === 'location' ? 'Avec des réservations (Airbnb, Booking, direct), les frais des plateformes et vos options.' : 'Dépenses et recettes : location à l\'année, construction, achat de terrain, abonnements…'}</p>
          <Champ label="Nom du projet"><input autoFocus value={nouveau.nom} placeholder={nouveau.type === 'location' ? 'Ex. : Location Cabane' : 'Ex. : Casa Mila'} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} /></Champ>
          <Champ label="Description (facultatif)"><input value={nouveau.description} onChange={(e) => setNouveau({ ...nouveau, description: e.target.value })} /></Champ>
          <p className="texte-doux petit">Votre famille fait partie du projet. Vous pourrez ensuite inviter quelqu'un, ajouter un compte commun (SCI…), ou mettre seulement des personnes (par exemple vous et Jorge).</p>
        </Modal>
      )}
    </div>
  );
}

function DetailProjet({ projet, ops, fixes, retour }) {
  const { profil, famille, membres, rafraichir } = useApp();
  const flash = useFlash();
  const parts = projet.projet_participants || [];
  const gere = projet.famille_id === profil.famille_id && profil.role === 'gestionnaire';
  const b = useMemo(() => bilanProjet(ops, parts), [ops, parts]);
  const m = moiDans(parts, profil);
  const nom = (id) => parts.find((p) => p.id === id)?.nom || '?';
  const [saisie, setSaisie] = useState(null);
  const [invit, setInvit] = useState(null);
  const [repartition, setRepartition] = useState(null);
  const [abo, setAbo] = useState(null);
  const [options, setOptions] = useState(null);
  const [bilan, setBilan] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const location = projet.type === 'location';

  async function inviter() {
    const email = invit.email.trim().toLowerCase();
    if (!invit.nom.trim()) return flash('Indiquez le nom à afficher.', 'erreur');
    if (invit.type !== 'compte' && !/^\S+@\S+\.\S+$/.test(email)) return flash('Indiquez une adresse e-mail valide.', 'erreur');
    const { data, error } = await supabase.from('projet_participants').insert({ projet_id: projet.id, type: invit.type, nom: invit.nom.trim(), email: invit.type === 'compte' ? null : email }).select().single();
    if (error) return flash(messageClair(error), 'erreur');
    setInvit(null); rafraichir();
    flash(invit.type === 'compte' ? `${data.nom} ajouté.` : (data.famille_id || data.profil_id) ? `${data.nom} voit maintenant le projet.` : `${data.nom} verra le projet dès qu'il ou elle aura créé son compte.`);
  }
  async function retirer(p) {
    const { error } = await supabase.from('projet_participants').delete().eq('id', p.id);
    if (error) return flash(messageClair(error), 'erreur');
    flash(`${p.nom} a été retiré du projet.`); rafraichir();
  }
  async function partager(p) {
    const texte = `Bonjour ! Je t'invite au projet « ${projet.nom} » dans Budget Famille.\n1. Ouvre ce lien : ${window.location.origin}\n2. Crée ton compte avec cette adresse : ${p.email}\n3. Le projet apparaîtra dans « Projets ».`;
    try {
      if (navigator.share) await navigator.share({ title: projet.nom, text: texte });
      else { await navigator.clipboard.writeText(texte); flash('Message copié. Collez-le dans WhatsApp, un SMS ou un e-mail.'); }
    } catch (e) { if (e?.name !== 'AbortError') flash('Partage impossible sur cet appareil.', 'erreur'); }
  }
  async function archiver() {
    const { error } = await supabase.from('projets').update({ archive: true }).eq('id', projet.id);
    if (error) return flash(messageClair(error), 'erreur');
    flash('Projet archivé.'); retour(); rafraichir();
  }
  // Abonnements : déjà ajoutés pour la période en cours ?
  const cleAbo = (f) => (f.frequence === 'an' ? String(new Date().getFullYear()) : moisCle(new Date()));
  const faitAbo = (f) => ops.some((o) => o.fixe_id === f.id && o.periode_fixe === cleAbo(f));
  async function ajouterAbo(f) {
    const payeur = f.payeur || m?.id || parts[0]?.id;
    const ligne = { id: nouvelId(), projet_id: projet.id, sens: 'depense', montant: f.montant, date_op: new Date().toISOString().slice(0, 10), categorie: f.categorie, libelle: f.libelle,
      parts: [{ participant_id: payeur, montant: Number(f.montant) }], fixe_id: f.id, periode_fixe: cleAbo(f), cree_par: profil.id };
    const { error } = await supabase.from('projet_operations').insert(ligne);
    if (error) return flash(messageClair(error), 'erreur');
    flash(`${f.libelle} ajouté.`); rafraichir();
  }

  const libOp = (o) => {
    if (o.sens === 'versement') return { titre: `${nom(o.de_participant)} → ${nom(o.vers_participant)}`, sous: o.libelle || 'Versement' };
    if (estReservation(o)) return { titre: o.voyageur || 'Réservation', sous: [LIB_PLATEFORME[o.plateforme], o.ref_resa, `facture ${eur(o.montant)}`, Number(o.frais_plateforme) ? `frais ${eur(o.frais_plateforme)}` : null, parts.length > 1 ? `reçu par ${(o.parts || []).map((x) => nom(x.participant_id)).join(', ')}` : null].filter(Boolean).join(', ') };
    return { titre: o.libelle || o.categorie, sous: `${o.libelle ? o.categorie + ', ' : ''}${o.sens === 'recette' ? 'reçu par ' : 'payé par '}${(o.parts || []).map((x) => `${nom(x.participant_id)}${(o.parts || []).length > 1 ? ` (${eur(x.montant)})` : ''}`).join(', ')}` };
  };

  return (
    <div className="page">
      <button className="lien retour" onClick={retour}><ArrowLeft size={18} /> Tous les projets</button>
      <section className="bandeau">
        <p className="bandeau-label">{projet.nom}{projet.description ? ` — ${projet.description}` : ''}</p>
        <p className={`bandeau-chiffre ${b.resultat < 0 ? 'negatif' : ''}`}>{eur(b.resultat)}</p>
        <p className="bandeau-sous">{location || b.fraisP
          ? `Depuis le début : ${eur(b.facture)} facturés, ${eur(b.fraisP)} de frais de plateformes, ${eur(b.autresDepenses)} d'autres dépenses`
          : `Depuis le début : ${eur(b.facture)} de recettes, ${eur(b.autresDepenses)} de dépenses`}</p>
      </section>

      <div className="actions-projet">
        {location && <button className="btn btn-primaire btn-grand" onClick={() => setSaisie({ type: 'reservation' })}><BedDouble size={20} /> Réservation</button>}
        <button className={`btn btn-grand ${location ? 'btn-second' : 'btn-primaire'}`} onClick={() => setSaisie({ type: 'depense' })}><Plus size={20} /> Dépense</button>
        <button className="btn btn-second btn-grand" onClick={() => setSaisie({ type: 'recette' })}><ArrowDownCircle size={20} /> Recette</button>
        {parts.length > 1 && <button className="btn btn-second btn-grand" onClick={() => setSaisie({ type: 'versement' })}><ArrowLeftRight size={20} /> Versement</button>}
      </div>

      <div className="actions2">
        <button className="btn btn-second" onClick={() => setBilan({ format: 'pdf', mode: 'mois', ref: new Date() })}><FileText size={18} /> Bilan PDF</button>
        <button className="btn btn-second" onClick={() => setBilan({ format: 'excel', mode: 'annee', ref: new Date() })}><FileSpreadsheet size={18} /> Excel comptable</button>
      </div>

      {parts.length > 1 && <>
        <h3 className="titre-section">Pour être à égalité</h3>
        {b.virements.length === 0 ? <p className="carte texte-doux">{b.nb ? 'Tout le monde est à égalité.' : 'Rien à équilibrer pour l\'instant.'}</p>
          : <div className="carte">{b.virements.map((v, i) => (
            <p key={i} className="virement"><strong>{nom(v.de)}</strong> <ArrowRight size={16} /> <strong>{nom(v.a)}</strong><span>{eur(v.montant)}</span></p>
          ))}</div>}
      </>}

      <h3 className="titre-section">Participants</h3>
      <div className="fiches">
        {parts.map((p) => {
          const v = b.par[p.id];
          const enAttente = p.type !== 'compte' && !p.famille_id && !p.profil_id;
          return (
            <div key={p.id} className="carte fiche">
              <div className="fiche-tete">
                <strong>{icone(p)} {p.nom}</strong>
                {m?.id === p.id ? <Pastille ton="succes">Vous</Pastille> : p.type === 'compte' ? <Pastille ton="info">Compte commun</Pastille> : enAttente ? <Pastille ton="encours">Invité</Pastille> : null}
              </div>
              <dl>
                <dt>A payé</dt><dd>{eur(v.paye)}</dd>
                <dt>A reçu</dt><dd className="positif">{eur(v.recu)}</dd>
                {!estCompte(p) && parts.length > 1 && <><dt>Sa part ({Math.round(v.quote * 100)} %)</dt><dd>{eur(v.part)}</dd>
                  <dt>Solde</dt><dd className={v.solde > 0.004 ? 'positif' : v.solde < -0.004 ? 'negatif' : ''}>{v.solde > 0.004 ? `+${eur(v.solde)}` : eur(v.solde)}</dd></>}
              </dl>
              <div className="fiche-actions">
                {gere && enAttente && p.email && <button className="btn btn-petit btn-primaire" onClick={() => partager(p)}><Send size={16} /> Envoyer le lien</button>}
                {gere && parts.length > 1 && <button className="btn-icone" aria-label={`Retirer ${p.nom}`} onClick={() => setConfirm({ texte: `Retirer ${p.nom} du projet ? (Possible seulement s'il n'a aucune opération.)`, faire: () => retirer(p) })}><Trash2 size={18} /></button>}
              </div>
            </div>
          );
        })}
      </div>
      {gere && (
        <div className="actions2">
          <button className="btn btn-second" onClick={() => setInvit({ type: 'personne', nom: '', email: '' })}><UserPlus size={18} /> Ajouter</button>
          {parts.filter((p) => !estCompte(p)).length > 1 && <button className="btn btn-second" onClick={() => setRepartition(Object.fromEntries(parts.filter((p) => !estCompte(p)).map((p) => [p.id, String(Math.round(quotesProjet(parts)[p.id] * 1000) / 10).replace('.', ',')])))}><Percent size={18} /> Répartition</button>}
        </div>
      )}

      <h3 className="titre-section">Abonnements et charges régulières</h3>
      {fixes.length === 0 ? <p className="carte texte-doux petit">Par exemple : Suno 11,05 € par mois, Distrokid 23,99 € par an, une assurance… Ajoutez-les une fois, puis en un clic chaque mois ou chaque année.</p> : (
        <ul className="liste">
          {fixes.map((f) => (
            <li key={f.id} className="ligne ligne-fixe">
              <span className="ligne-texte"><strong>{f.libelle}</strong><small>{eur(f.montant)} par {f.frequence === 'an' ? 'an' : 'mois'}{f.payeur ? `, payé par ${nom(f.payeur)}` : ''}</small></span>
              {faitAbo(f) ? <Pastille ton="succes"><Check size={14} /> {f.frequence === 'an' ? 'Cette année' : 'Ce mois-ci'}</Pastille>
                : <button className="btn btn-petit btn-primaire" onClick={() => ajouterAbo(f)}>Ajouter {f.frequence === 'an' ? 'cette année' : 'ce mois-ci'}</button>}
              <button className="btn-icone" aria-label={`Modifier ${f.libelle}`} onClick={() => setAbo({ ...f, montant: String(f.montant).replace('.', ',') })}><Settings2 size={18} /></button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-second btn-plein" onClick={() => setAbo({ libelle: '', montant: '', frequence: 'mois', categorie: 'Abonnement', payeur: m?.id || parts[0]?.id })}><Repeat size={18} /> Ajouter un abonnement</button>

      <h3 className="titre-section">Opérations</h3>
      {ops.length === 0 ? <Vide>Aucune opération. Touchez {location ? '« Réservation » ou ' : ''}« Dépense ».</Vide> : (
        <ul className="liste">
          {ops.map((o) => {
            const l = libOp(o);
            const signe = o.sens === 'versement' ? '' : o.sens === 'recette' ? '+' : '−';
            return (
              <li key={o.id}>
                <button className="ligne" onClick={() => setSaisie({ type: o.sens === 'versement' ? 'versement' : estReservation(o) ? 'reservation' : o.sens, op: o })}>
                  <span className="ligne-date">{dateCourte(o.date_op)}</span>
                  <span className="ligne-texte"><strong>{l.titre}</strong><small>{l.sous}</small></span>
                  <span className="ligne-icones">{(o.justificatif || o.facture_iva) && <Paperclip size={14} aria-label="Pièce jointe" />}{o.fixe_id && <Repeat size={14} aria-label="Abonnement" />}</span>
                  <span className={`ligne-montant ${o.sens === 'recette' ? 'positif' : o.sens === 'versement' ? 'neutre' : ''}`}>{signe}{eur(Number(o.montant) - (o.sens === 'recette' ? Number(o.frais_plateforme) || 0 : 0))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {gere && (
        <div className="actions2">
          {location && <button className="btn btn-second" onClick={() => setOptions((projet.options || []).map((x) => ({ ...x, prix: String(x.prix).replace('.', ',') })))}><Settings2 size={18} /> Options et prix</button>}
          <button className="btn btn-second" onClick={() => setConfirm({ texte: `Archiver « ${projet.nom} » ? Il disparaît de la liste pour tout le monde, mais rien n'est effacé.`, faire: archiver })}><Archive size={18} /> Archiver</button>
        </div>
      )}
      {!gere && <p className="texte-doux petit">Ce projet a été créé par {famille && projet.famille_id === profil.famille_id ? 'votre famille' : 'une autre famille'}. Vous voyez seulement ce qui concerne le projet.</p>}

      {saisie && <SaisieProjet projet={projet} participants={parts} moi={m} type={saisie.type} initial={saisie.op} onClose={() => setSaisie(null)} />}
      {invit && (
        <Modal titre="Ajouter au projet" onClose={() => setInvit(null)} pied={<button className="btn btn-primaire" onClick={inviter}>Ajouter</button>}>
          <Tabs valeur={invit.type} onChange={(v) => setInvit({ ...invit, type: v })} options={[['personne', 'Une personne'], ['famille', 'Une famille'], ['compte', 'Un compte']]} />
          <p className="texte-doux petit">{invit.type === 'famille' ? 'Les gestionnaires de cette famille verront le projet. Indiquez l\'e-mail de l\'un d\'eux.'
            : invit.type === 'compte' ? 'Un compte commun (SCI, compte Lydia…) : il peut payer ou recevoir. Son argent appartient aux associés selon leur part.'
            : 'Seule cette personne verra le projet. Elle peut être de votre famille (par exemple Jorge) ou d\'ailleurs (par exemple Nela).'}</p>
          <Champ label="Nom affiché"><input value={invit.nom} placeholder={invit.type === 'compte' ? 'Ex. : Compte SCI' : invit.type === 'famille' ? 'Ex. : Famille Machado' : 'Ex. : Nela'} onChange={(e) => setInvit({ ...invit, nom: e.target.value })} /></Champ>
          {invit.type === 'personne' && membres.length > 0 && (
            <div className="choixpers">{membres.filter((x) => !parts.some((p) => p.profil_id === x.id)).map((x) => <button type="button" key={x.id} onClick={() => setInvit({ ...invit, nom: x.prenom, email: x.email })}>{x.prenom}</button>)}</div>
          )}
          {invit.type !== 'compte' && <Champ label="Adresse e-mail"><input type="email" inputMode="email" autoCapitalize="none" value={invit.email} onChange={(e) => setInvit({ ...invit, email: e.target.value })} /></Champ>}
        </Modal>
      )}
      {repartition && <Repartition parts={parts.filter((p) => !estCompte(p))} valeurs={repartition} setValeurs={setRepartition} />}
      {abo && <Abonnement projet={projet} parts={parts} abo={abo} setAbo={setAbo} />}
      {options && <Options projet={projet} options={options} setOptions={setOptions} />}
      {bilan && <Bilan projet={projet} parts={parts} ops={ops} reglage={bilan} setReglage={setBilan} />}
      {confirm && <Confirmer texte={confirm.texte} action="Confirmer" danger onOui={() => { confirm.faire(); setConfirm(null); }} onNon={() => setConfirm(null)} />}
    </div>
  );
}

function Bilan({ projet, parts, ops, reglage, setReglage }) {
  const { profil, famille, membres } = useApp();
  const flash = useFlash();
  const p = reglage.mode === 'tout' ? null : PERIODES[reglage.mode](reglage.ref);
  function telechargerBilan() {
    try {
      if (reglage.format === 'pdf') {
        construirePdfProjet({ projet, participants: parts, ops, periode: p, famille, profil }).save(nomPdf(projet, p));
      } else {
        const per = p || { debut: '2000-01-01', fin: '2100-12-31', label: 'Depuis le début', jours: 0 };
        const wb = construireBilan({ periode: per, mode: reglage.mode === 'tout' ? 'tout' : reglage.mode, secteurs: ['projets'], ops: [], projets: [{ ...projet, projet_participants: parts }], projetOps: ops, projetOpsTout: ops, membres, famille, projetsChoisis: [projet.id], estGestionnaire: true, profil });
        telecharger(wb, nomFichier(per, ['projets'], projet.nom));
      }
      flash('Bilan téléchargé.'); setReglage(null);
    } catch (e) { console.error(e); flash('Le fichier n\'a pas pu être créé. Réessayez.', 'erreur'); }
  }
  return (
    <Modal titre={reglage.format === 'pdf' ? 'Bilan PDF' : 'Excel pour le comptable'} onClose={() => setReglage(null)} pied={<button className="btn btn-primaire" onClick={telechargerBilan}>{reglage.format === 'pdf' ? <FileText size={18} /> : <FileSpreadsheet size={18} />} Télécharger</button>}>
      <p className="texte-doux">{projet.nom}</p>
      <Tabs valeur={reglage.mode} onChange={(v) => setReglage({ ...reglage, mode: v })} options={[['mois', 'Mois'], ['trimestre', 'Trimestre'], ['annee', 'Année'], ['tout', 'Tout']]} />
      {p ? <NavPeriode label={p.label} onPrec={() => setReglage({ ...reglage, ref: decaler(reglage.ref, reglage.mode, -1) })} onSuiv={() => setReglage({ ...reglage, ref: decaler(reglage.ref, reglage.mode, 1) })} />
        : <p className="centre"><strong>Depuis le début du projet</strong></p>}
      <p className="texte-doux petit">{reglage.format === 'pdf' ? 'Un document simple à lire : les gros chiffres, des phrases, qui doit combien, puis le détail des réservations, dépenses et versements.' : 'Un fichier Excel avec toutes les lignes, à envoyer au comptable.'}</p>
    </Modal>
  );
}

function Repartition({ parts, valeurs, setValeurs }) {
  const { rafraichir } = useApp();
  const flash = useFlash();
  const total = arrondi(Object.values(valeurs).reduce((s, v) => s + num(v), 0));
  async function maj(q) {
    for (const p of parts) { const { error } = await supabase.from('projet_participants').update({ quote: q(p) }).eq('id', p.id); if (error) return flash(messageClair(error), 'erreur'); }
    flash('Répartition enregistrée.'); setValeurs(null); rafraichir();
  }
  return (
    <Modal titre="Répartition du résultat" onClose={() => setValeurs(null)} pied={<>
      <button className="btn btn-second" onClick={() => maj(() => null)}>Parts égales</button>
      <button className="btn btn-primaire" onClick={() => (Math.abs(total - 100) > 0.01 ? flash('Le total doit faire 100 %.', 'erreur') : maj((p) => arrondi(num(valeurs[p.id]))))}>Enregistrer</button>
    </>}>
      <p className="texte-doux">Quelle part du bénéfice (ou des frais) revient à chacun ? Exemple : 50 % et 50 %.</p>
      {parts.map((p) => (
        <Champ key={p.id} label={`${p.nom} (%)`}><input inputMode="decimal" value={valeurs[p.id]} onChange={(e) => setValeurs({ ...valeurs, [p.id]: e.target.value.replace(/[^0-9,.]/g, '') })} /></Champ>
      ))}
      <p className={Math.abs(total - 100) > 0.01 ? 'negatif' : 'positif'}>Total : {String(total).replace('.', ',')} %</p>
    </Modal>
  );
}

function Abonnement({ projet, parts, abo, setAbo }) {
  const { rafraichir } = useApp();
  const flash = useFlash();
  const existant = Boolean(abo.id);
  async function enregistrer() {
    const montant = arrondi(num(abo.montant));
    if (!abo.libelle.trim()) return flash('Donnez un nom.', 'erreur');
    if (!(montant > 0)) return flash('Indiquez un montant.', 'erreur');
    const ligne = { projet_id: projet.id, libelle: abo.libelle.trim(), montant, frequence: abo.frequence, categorie: abo.categorie || 'Abonnement', payeur: abo.payeur || null, actif: true };
    const r = existant ? await supabase.from('projet_fixes').update(ligne).eq('id', abo.id) : await supabase.from('projet_fixes').insert(ligne);
    if (r.error) return flash(messageClair(r.error), 'erreur');
    flash('Abonnement enregistré.'); setAbo(null); rafraichir();
  }
  async function arreter() {
    const { error } = await supabase.from('projet_fixes').update({ actif: false }).eq('id', abo.id);
    if (error) return flash(messageClair(error), 'erreur');
    flash('Abonnement arrêté. Les paiements passés restent enregistrés.'); setAbo(null); rafraichir();
  }
  return (
    <Modal titre={existant ? 'Modifier l\'abonnement' : 'Nouvel abonnement'} onClose={() => setAbo(null)} pied={<>
      {existant && <button className="btn btn-second" onClick={arreter}>Arrêter</button>}
      <button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button>
    </>}>
      <Champ label="Nom"><input autoFocus={!existant} value={abo.libelle} placeholder="Ex. : Suno" onChange={(e) => setAbo({ ...abo, libelle: e.target.value })} /></Champ>
      <div className="grille2">
        <Champ label="Montant (€)"><input inputMode="decimal" value={abo.montant} onChange={(e) => setAbo({ ...abo, montant: e.target.value.replace(/[^0-9,.]/g, '') })} /></Champ>
        <Champ label="Tous les"><select value={abo.frequence} onChange={(e) => setAbo({ ...abo, frequence: e.target.value })}><option value="mois">mois</option><option value="an">ans</option></select></Champ>
      </div>
      {parts.length > 1 && <Champ groupe label="Payé par"><div className="choixpers">{parts.map((p) => <button type="button" key={p.id} className={abo.payeur === p.id ? 'actif' : ''} onClick={() => setAbo({ ...abo, payeur: p.id })}>{p.nom}</button>)}</div></Champ>}
    </Modal>
  );
}

function Options({ projet, options, setOptions }) {
  const { rafraichir } = useApp();
  const flash = useFlash();
  const maj = (i, k, v) => setOptions(options.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  async function enregistrer() {
    const propre = options.filter((o) => o.nom.trim()).map((o) => ({ nom: o.nom.trim(), prix: arrondi(num(o.prix)), unite: o.unite || 'unite' }));
    const { error } = await supabase.from('projets').update({ options: propre }).eq('id', projet.id);
    if (error) return flash(messageClair(error), 'erreur');
    flash('Options enregistrées.'); setOptions(null); rafraichir();
  }
  return (
    <Modal titre="Options et prix" onClose={() => setOptions(null)} pied={<button className="btn btn-primaire" onClick={enregistrer}>Enregistrer</button>}>
      <p className="texte-doux petit">Ces options sont proposées à chaque réservation. Le prix est modifiable à chaque fois.</p>
      {options.map((o, i) => (
        <div key={i} className="carte option-edit">
          <input aria-label="Nom de l'option" value={o.nom} onChange={(e) => maj(i, 'nom', e.target.value)} />
          <div className="grille2">
            <input aria-label="Prix" inputMode="decimal" value={o.prix} onChange={(e) => maj(i, 'prix', e.target.value.replace(/[^0-9,.]/g, ''))} />
            <select aria-label="Par" value={o.unite} onChange={(e) => maj(i, 'unite', e.target.value)}>
              <option value="jour">par jour</option><option value="personne">par personne</option><option value="unite">l'unité</option><option value="libre">prix libre</option>
            </select>
          </div>
          <button type="button" className="lien" onClick={() => setOptions(options.filter((_, j) => j !== i))}>Retirer</button>
        </div>
      ))}
      <button type="button" className="btn btn-second" onClick={() => setOptions([...options, { nom: '', prix: '', unite: 'unite' }])}><Plus size={18} /> Ajouter une option</button>
    </Modal>
  );
}
