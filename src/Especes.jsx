import { useEffect, useState } from 'react';
import { Banknote, Minus, Plus, Scale, HandCoins } from 'lucide-react';
import { useApp, useOperations } from './contexte.jsx';
import { Modal, Champ, Vide, NavPeriode, useFlash } from './ui.jsx';
import { supabase, enregistrer, messageClair, nouvelId, local } from './api.js';
import { eur, num, arrondi, aujourdhui, dateCourte, periodeMois, decaler } from './format.js';
import { soldeEspeces, effetEspeces, sortiesParCompte } from './calculs.js';

// Tous les mouvements d'espèces visibles (le porte-monnaie est un cumul depuis le début)
function useMouvementsEspeces() {
  const { rev } = useApp();
  const [ops, setOps] = useState(() => local.get('especes', []));
  useEffect(() => {
    supabase.from('operations').select('*').eq('archive', false).or('sens.eq.retrait,sens.eq.transfert,moyen.eq.especes')
      .order('date_op', { ascending: false }).order('cree_le', { ascending: false }).limit(2000)
      .then(({ data }) => { if (data) { setOps(data); local.set('especes', data); } });
  }, [rev]);
  return ops;
}
export function useSoldeEspeces(uid) { return soldeEspeces(useMouvementsEspeces(), uid); }

// Petites puces de choix
function Puces({ label, options, valeur, onChange }) {
  return (
    <Champ groupe label={label}>
      <div className="choixpers">
        {options.map(([k, l]) => <button type="button" key={k} className={valeur === k ? 'actif' : ''} aria-pressed={valeur === k} onClick={() => onChange(k)}>{l}</button>)}
      </div>
    </Champ>
  );
}

export default function Especes({ ouvrir }) {
  const { profil, membres, famille, estGestionnaire, rafraichir } = useApp();
  const flash = useFlash();
  const ops = useMouvementsEspeces();
  const [qui, setQui] = useState(profil.id);
  const [compte, setCompte] = useState(null);
  const [retrait, setRetrait] = useState(null);
  const [don, setDon] = useState(null);
  const [ref, setRef] = useState(new Date());
  const p = periodeMois(ref);
  const { ops: opsMois } = useOperations(p.debut, p.fin);
  const comptes = famille?.comptes?.length ? famille.comptes : ['Compte commun'];
  const enfants = famille?.enfants || [];
  const solde = soldeEspeces(ops, qui);
  const miens = ops.filter((o) => effetEspeces(o, qui) !== 0);
  const nom = (id) => membres.find((m) => m.id === id)?.prenom || '?';
  const personnes = estGestionnaire ? membres : membres.filter((m) => m.id === profil.id);
  const sorties = sortiesParCompte(opsMois, p);
  const retraitsMois = opsMois.filter((o) => o.sens === 'retrait' && !o.archive);

  async function ecrire(ligne, message) {
    try { const r = await enregistrer('operations', { id: nouvelId(), cree_par: profil.id, date_op: aujourdhui(), ...ligne }); flash(r.horsLigne ? 'Gardé sur le téléphone.' : message); rafraichir(); return true; }
    catch (e) { flash(messageClair(e), 'erreur'); return false; }
  }
  async function validerRetrait() {
    const m = arrondi(num(retrait.montant));
    if (!(m > 0)) return flash('Indiquez un montant.', 'erreur');
    if (await ecrire({ espace: 'perso', sens: 'retrait', montant: m, date_op: retrait.date, categorie: 'Retrait espèces', moyen: 'especes', compte: retrait.compte,
      proprietaire: retrait.qui, libelle: retrait.note.trim() || `Retrait ${retrait.compte}` }, `Retrait de ${eur(m)} noté pour ${nom(retrait.qui)}.`)) setRetrait(null);
  }
  async function validerDon() {
    const m = arrondi(num(don.montant));
    if (!(m > 0)) return flash('Indiquez un montant.', 'erreur');
    if (!don.a) return flash('Choisissez à qui.', 'erreur');
    const aEnfant = don.a.startsWith('enfant:');
    const ligne = aEnfant
      ? { espace: 'commun', sens: 'depense', montant: m, date_op: don.date, categorie: 'Argent de poche', libelle: don.note.trim() || `Argent de poche ${don.a.slice(7)}`,
          pour: don.a.slice(7), moyen: 'especes', paye_par: don.de, partage: membres.map((x) => x.id) }
      : { espace: 'commun', sens: 'transfert', montant: m, date_op: don.date, categorie: 'Don d\'espèces', libelle: don.note.trim() || `${nom(don.de)} → ${nom(don.a)}`,
          moyen: 'especes', paye_par: don.de, beneficiaire: don.a };
    if (await ecrire(ligne, `${eur(m)} donnés à ${aEnfant ? don.a.slice(7) : nom(don.a)}.`)) setDon(null);
  }
  async function recompter() {
    const reel = arrondi(num(compte)); const ecart = arrondi(reel - solde);
    setCompte(null);
    if (Math.abs(ecart) < 0.01) return flash('Le compte est juste, rien à corriger.');
    await ecrire({ espace: 'perso', sens: ecart < 0 ? 'depense' : 'rentree', montant: Math.abs(ecart), categorie: 'Autre', moyen: 'especes', proprietaire: profil.id,
      libelle: ecart < 0 ? 'Espèces dépensées non notées' : 'Espèces retrouvées' }, `Porte-monnaie corrigé : ${ecart < 0 ? '−' : '+'}${eur(Math.abs(ecart))}.`);
  }
  const libelleMouvement = (o) => {
    if (o.sens === 'transfert') return o.beneficiaire === qui ? `Donné par ${nom(o.paye_par)}` : `Donné à ${nom(o.beneficiaire)}`;
    if (o.sens === 'retrait') return `Retrait${o.compte ? ' ' + o.compte : ''}`;
    return `${o.categorie}${o.pour ? ' pour ' + o.pour : ''}${o.espace === 'commun' ? ', commun' : ''}`;
  };

  return (
    <div className="page">
      <section className="bandeau">
        <p className="bandeau-label">{qui === profil.id ? 'Mon porte-monnaie' : `Porte-monnaie de ${nom(qui)}`}</p>
        <p className={`bandeau-chiffre ${solde < 0 ? 'negatif' : ''}`}>{eur(solde)}</p>
        <p className="bandeau-sous">Retraits et espèces reçues, moins les espèces dépensées ou données.</p>
        {personnes.length > 1 && (
          <div className="choixpers sur-bandeau">
            {personnes.map((m) => <button type="button" key={m.id} className={qui === m.id ? 'actif' : ''} aria-pressed={qui === m.id} onClick={() => setQui(m.id)}>{m.id === profil.id ? 'Moi' : m.prenom} {eur(soldeEspeces(ops, m.id))}</button>)}
          </div>
        )}
      </section>

      <div className="actions2">
        <button className="btn btn-primaire btn-grand" onClick={() => setRetrait({ qui, compte: comptes[0], montant: '', date: aujourdhui(), note: '' })}><Banknote size={20} /> Retrait</button>
        <button className="btn btn-second btn-grand" onClick={() => setDon({ de: qui, a: membres.find((m) => m.id !== qui)?.id || (enfants[0] ? 'enfant:' + enfants[0] : ''), montant: '', date: aujourdhui(), note: '' })}><HandCoins size={20} /> Donner à…</button>
      </div>
      {qui === profil.id && (
        <div className="actions2">
          <button className="btn btn-second" onClick={() => ouvrir({ espace: 'perso', sens: 'depense', moyen: 'especes' })}><Minus size={18} /> Dépense</button>
          <button className="btn btn-second" onClick={() => ouvrir({ espace: 'perso', sens: 'rentree', moyen: 'especes' })}><Plus size={18} /> Reçu</button>
        </div>
      )}
      {qui === profil.id && <button className="btn btn-second btn-plein" onClick={() => setCompte(String(Math.max(0, solde)).replace('.', ','))}><Scale size={18} /> Recompter mon porte-monnaie</button>}

      <h3 className="titre-section">Le mois</h3>
      <section className="carte">
        <NavPeriode label={p.label} onPrec={() => setRef(decaler(ref, 'mois', -1))} onSuiv={() => setRef(decaler(ref, 'mois', 1))} />
        <p className="texte-doux petit">Argent sorti, compte par compte (dépenses et retraits) :</p>
        {Object.keys(sorties).length === 0 ? <p className="texte-doux">Rien ce mois-ci.</p> : Object.entries(sorties).map(([k, v]) => <p key={k} className="ligne-resume"><span>{k}</span><strong>{eur(v)}</strong></p>)}
        {retraitsMois.length > 0 && <>
          <p className="texte-doux petit">Espèces retirées ce mois-ci :</p>
          {membres.map((m) => { const v = retraitsMois.filter((o) => o.proprietaire === m.id).reduce((s, o) => s + Number(o.montant), 0); return v ? <p key={m.id} className="ligne-resume"><span>{m.prenom}</span><strong>{eur(v)}</strong></p> : null; })}
        </>}
      </section>

      <h3 className="titre-section">Mouvements d'espèces{qui !== profil.id ? ` de ${nom(qui)}` : ''}</h3>
      {miens.length === 0 ? <Vide>Notez les retraits, puis choisissez « Espèces » quand vous payez en liquide.</Vide> : (
        <ul className="liste">
          {miens.slice(0, 150).map((o) => {
            const m = effetEspeces(o, qui);
            return (
              <li key={o.id}>
                <button className="ligne" onClick={() => (o.sens === 'transfert' ? null : ouvrir(o))}>
                  <span className="ligne-date">{dateCourte(o.date_op)}</span>
                  <span className="ligne-texte"><strong>{o.libelle || o.categorie}</strong><small>{libelleMouvement(o)}</small></span>
                  <span className={`ligne-montant ${m > 0 ? 'positif' : ''}`}>{m > 0 ? '+' : '−'}{eur(Math.abs(m))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {retrait && (
        <Modal titre="Retrait d'espèces" onClose={() => setRetrait(null)} pied={<button className="btn btn-primaire" onClick={validerRetrait}>Enregistrer</button>}>
          <Champ label="Montant (€)"><input className="input-montant" inputMode="decimal" autoFocus placeholder="0,00" value={retrait.montant} onChange={(e) => setRetrait({ ...retrait, montant: e.target.value.replace(/[^0-9,.]/g, '') })} /></Champ>
          {personnes.length > 1 && <Puces label="Qui a retiré (et garde l'argent)" options={personnes.map((m) => [m.id, m.prenom])} valeur={retrait.qui} onChange={(v) => setRetrait({ ...retrait, qui: v })} />}
          <Puces label="Depuis le compte" options={comptes.map((c) => [c, c])} valeur={retrait.compte} onChange={(v) => setRetrait({ ...retrait, compte: v })} />
          <div className="grille2">
            <Champ label="Date"><input type="date" value={retrait.date} onChange={(e) => setRetrait({ ...retrait, date: e.target.value })} /></Champ>
            <Champ label="Note"><input value={retrait.note} placeholder="Facultatif" onChange={(e) => setRetrait({ ...retrait, note: e.target.value })} /></Champ>
          </div>
          <p className="texte-doux petit">Ce n'est pas une dépense : l'argent passe du compte au porte-monnaie. La dépense sera comptée quand l'argent sera dépensé.</p>
        </Modal>
      )}
      {don && (
        <Modal titre="Donner des espèces" onClose={() => setDon(null)} pied={<button className="btn btn-primaire" onClick={validerDon}>Enregistrer</button>}>
          <Champ label="Montant (€)"><input className="input-montant" inputMode="decimal" autoFocus placeholder="0,00" value={don.montant} onChange={(e) => setDon({ ...don, montant: e.target.value.replace(/[^0-9,.]/g, '') })} /></Champ>
          {personnes.length > 1 && <Puces label="De (porte-monnaie)" options={personnes.map((m) => [m.id, m.prenom])} valeur={don.de} onChange={(v) => setDon({ ...don, de: v, a: don.a === v ? '' : don.a })} />}
          <Puces label="À" options={[...membres.filter((m) => m.id !== don.de).map((m) => [m.id, m.prenom]), ...enfants.map((e) => ['enfant:' + e, e])]} valeur={don.a} onChange={(v) => setDon({ ...don, a: v })} />
          <div className="grille2">
            <Champ label="Date"><input type="date" value={don.date} onChange={(e) => setDon({ ...don, date: e.target.value })} /></Champ>
            <Champ label="Note"><input value={don.note} placeholder="Facultatif" onChange={(e) => setDon({ ...don, note: e.target.value })} /></Champ>
          </div>
          <p className="texte-doux petit">{don.a?.startsWith('enfant:') ? 'Noté dans Commun, case de l\'enfant, avec le motif « Argent de poche ».' : 'L\'argent passe d\'un porte-monnaie à l\'autre : ce n\'est pas une dépense.'}</p>
        </Modal>
      )}
      {compte !== null && (
        <Modal titre="Recompter les espèces" onClose={() => setCompte(null)} pied={<>
          <button className="btn btn-second" onClick={() => setCompte(null)}>Annuler</button>
          <button className="btn btn-primaire" onClick={recompter}>Corriger</button>
        </>}>
          <p>L'application calcule <strong>{eur(solde)}</strong>. Combien avez-vous vraiment dans le porte-monnaie ?</p>
          <Champ label="J'ai compté (€)"><input className="input-montant" inputMode="decimal" autoFocus value={compte} onChange={(e) => setCompte(e.target.value.replace(/[^0-9,.]/g, ''))} /></Champ>
          <p className="texte-doux petit">S'il manque de l'argent, la différence est notée comme « espèces dépensées non notées ».</p>
        </Modal>
      )}
    </div>
  );
}
