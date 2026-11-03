import { useCallback, useEffect, useMemo, useState } from 'react';
import { User, Users, BarChart3, Briefcase, Repeat, Home, History, Stethoscope, MoreHorizontal, CloudOff, Wallet } from 'lucide-react';
import { supabase, configOk, messageClair, attente, VERSION, local } from './api.js';
import { AppCtx } from './contexte.jsx';
import { FlashProvider, Modal, Champ, useFlash } from './ui.jsx';
import Moi from './Moi.jsx';
import Commun from './Commun.jsx';
import Bilan from './Bilan.jsx';
import Pro from './Pro.jsx';
import Fixes from './Fixes.jsx';
import Famille from './Famille.jsx';
import Historique from './Historique.jsx';
import Diagnostic from './Diagnostic.jsx';
import Saisie from './Saisie.jsx';

const PAGES = {
  moi: { label: 'Moi', icone: User, C: Moi },
  commun: { label: 'Commun', icone: Users, C: Commun },
  bilan: { label: 'Bilan', icone: BarChart3, C: Bilan },
  pro: { label: 'Pro', icone: Briefcase, C: Pro, gestion: true },
  fixes: { label: 'Fixes', icone: Repeat, C: Fixes },
  famille: { label: 'Famille', icone: Home, C: Famille },
  historique: { label: 'Historique', icone: History, C: Historique },
  diagnostic: { label: 'Diagnostic', icone: Stethoscope, C: Diagnostic },
};

export default function App() {
  return <FlashProvider><Racine /></FlashProvider>;
}

function Racine() {
  const [session, setSession] = useState(undefined);
  const [recuperation, setRecuperation] = useState(false);
  useEffect(() => {
    if (!configOk) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      if (evt === 'PASSWORD_RECOVERY') setRecuperation(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configOk) return <Ecran titre="Configuration manquante"><p>Les variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ne sont pas réglées dans Netlify.</p></Ecran>;
  if (session === undefined) return <Ecran titre="Budget Famille"><p className="texte-doux">Chargement…</p></Ecran>;
  if (!session) return <Connexion />;
  return <>
    <Espace session={session} />
    {recuperation && <NouveauMotDePasse onFini={() => setRecuperation(false)} />}
  </>;
}

function Ecran({ titre, children }) {
  return (
    <div className="ecran-centre">
      <div className="logo"><Wallet size={30} /></div>
      <h1>{titre}</h1>
      {children}
    </div>
  );
}

function Connexion() {
  const flash = useFlash();
  const [mode, setMode] = useState('connexion');
  const [email, setEmail] = useState(local.get('email', ''));
  const [mdp, setMdp] = useState('');
  const [envoi, setEnvoi] = useState(false);
  async function valider(e) {
    e.preventDefault(); setEnvoi(true);
    try {
      local.set('email', email.trim());
      if (mode === 'oubli') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin });
        if (error) throw error;
        flash('E-mail envoyé. Ouvrez-le et touchez le lien pour choisir un nouveau mot de passe.');
        setMode('connexion');
      } else if (mode === 'creation') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: mdp, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) flash('Compte créé. Ouvrez l\'e-mail reçu et touchez le lien pour le confirmer, puis revenez ici.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: mdp });
        if (error) throw error;
      }
    } catch (err) { flash(messageClair(err), 'erreur'); }
    finally { setEnvoi(false); }
  }
  return (
    <Ecran titre="Budget Famille">
      <p className="texte-doux">{mode === 'creation' ? 'Créez votre compte avec l\'adresse à laquelle vous avez été invité(e).' : mode === 'oubli' ? 'Indiquez votre e-mail pour recevoir un lien.' : 'Les dépenses de la maison, ensemble.'}</p>
      <form className="carte form-connexion" onSubmit={valider}>
        <Champ label="E-mail"><input type="email" inputMode="email" autoCapitalize="none" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Champ>
        {mode !== 'oubli' && <Champ label="Mot de passe" aide={mode === 'creation' ? '6 caractères minimum' : null}>
          <input type="password" required minLength={6} autoComplete={mode === 'creation' ? 'new-password' : 'current-password'} value={mdp} onChange={(e) => setMdp(e.target.value)} />
        </Champ>}
        <button className="btn btn-primaire btn-plein btn-grand" disabled={envoi}>
          {envoi ? 'Un instant…' : mode === 'creation' ? 'Créer mon compte' : mode === 'oubli' ? 'Recevoir le lien' : 'Se connecter'}
        </button>
      </form>
      <div className="liens-connexion">
        {mode !== 'connexion' && <button className="lien" onClick={() => setMode('connexion')}>J'ai déjà un compte</button>}
        {mode !== 'creation' && <button className="lien" onClick={() => setMode('creation')}>Créer un compte</button>}
        {mode === 'connexion' && <button className="lien" onClick={() => setMode('oubli')}>Mot de passe oublié</button>}
      </div>
    </Ecran>
  );
}

function NouveauMotDePasse({ onFini }) {
  const flash = useFlash();
  const [mdp, setMdp] = useState('');
  async function valider() {
    const { error } = await supabase.auth.updateUser({ password: mdp });
    if (error) return flash(messageClair(error), 'erreur');
    flash('Nouveau mot de passe enregistré.'); onFini();
  }
  return (
    <Modal titre="Nouveau mot de passe" onClose={onFini} pied={<button className="btn btn-primaire" disabled={mdp.length < 6} onClick={valider}>Enregistrer</button>}>
      <Champ label="Nouveau mot de passe" aide="6 caractères minimum"><input type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} /></Champ>
    </Modal>
  );
}

function Espace({ session }) {
  const flash = useFlash();
  const [profil, setProfil] = useState(() => local.get('profil'));
  const [refuse, setRefuse] = useState(false);
  const [tousMembres, setTousMembres] = useState(() => local.get('membres', []));
  const [activites, setActivites] = useState(() => local.get('activites', []));
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState('moi');
  const [plus, setPlus] = useState(false);
  const [saisie, setSaisie] = useState(null);
  const [nbAttente, setNbAttente] = useState(attente.liste().length);
  const rafraichir = useCallback(() => setRev((r) => r + 1), []);

  // Rejoindre la famille puis charger membres et activités
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('rejoindre');
      if (error) { if (!profil) flash(messageClair(error), 'erreur'); return; }
      if (!data || !data.id) { setRefuse(true); setProfil(null); local.del('profil'); return; }
      if (!data.actif) { setRefuse(true); return; }
      setRefuse(false); setProfil(data); local.set('profil', data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id, rev]);

  useEffect(() => {
    if (!profil) return;
    supabase.from('profils').select('*').order('cree_le').then(({ data }) => { if (data) { setTousMembres(data); local.set('membres', data); } });
    if (profil.role === 'gestionnaire') supabase.from('activites').select('*').eq('archive', false).order('cree_le').then(({ data }) => { if (data) { setActivites(data); local.set('activites', data); } });
  }, [profil, rev]);

  // Envoi automatique des saisies en attente au retour du réseau
  useEffect(() => {
    const maj = () => setNbAttente(attente.liste().length);
    const enLigne = async () => { if (attente.liste().length) { const r = await attente.renvoyer(); if (r.envoyes) { flash(`${r.envoyes} saisie(s) envoyée(s).`); rafraichir(); } } };
    window.addEventListener('bf-attente', maj); window.addEventListener('online', enLigne);
    enLigne();
    return () => { window.removeEventListener('bf-attente', maj); window.removeEventListener('online', enLigne); };
  }, [flash, rafraichir]);

  const estGestionnaire = profil?.role === 'gestionnaire';
  const membres = useMemo(() => tousMembres.filter((m) => m.actif), [tousMembres]);
  const ctx = useMemo(() => ({ session, profil, membres, tousMembres, activites, estGestionnaire, rev, rafraichir }),
    [session, profil, membres, tousMembres, activites, estGestionnaire, rev, rafraichir]);

  if (refuse) return (
    <Ecran titre="Pas encore invité(e)">
      <p className="texte-doux">Le compte <strong>{session.user.email}</strong> ne fait pas encore partie de la famille. Demandez à un gestionnaire de vous inviter avec cette adresse dans l'écran Famille, puis touchez « Réessayer ».</p>
      <button className="btn btn-primaire btn-grand" onClick={rafraichir}>Réessayer</button>
      <button className="lien" onClick={() => supabase.auth.signOut()}>Changer de compte</button>
    </Ecran>
  );
  if (!profil) return <Ecran titre="Budget Famille"><p className="texte-doux">Chargement…</p></Ecran>;

  const visibles = Object.entries(PAGES).filter(([, p]) => !p.gestion || estGestionnaire).map(([k]) => k);
  const barre = estGestionnaire ? ['moi', 'commun', 'bilan', 'pro'] : ['moi', 'commun', 'bilan', 'fixes'];
  const autres = visibles.filter((k) => !barre.includes(k));
  const pageSure = visibles.includes(page) ? page : 'moi';
  const Page = PAGES[pageSure].C;
  const aller = (k) => { setPage(k); setPlus(false); window.scrollTo(0, 0); };

  return (
    <AppCtx.Provider value={ctx}>
      <div className="appli">
        <aside className="menu-cote">
          <div className="menu-marque"><Wallet size={22} /> Budget Famille</div>
          <nav>{visibles.map((k) => { const I = PAGES[k].icone; return <button key={k} className={pageSure === k ? 'actif' : ''} onClick={() => aller(k)}><I size={20} /> {PAGES[k].label}</button>; })}</nav>
          <div className="menu-pied">{profil.prenom}<br /><span>Version {VERSION}</span></div>
        </aside>

        <main className="contenu">
          <header className="entete">
            <span className="entete-titre">{PAGES[pageSure].label}</span>
            <span className="entete-qui">{profil.prenom}</span>
          </header>
          {nbAttente > 0 && (
            <div className="bandeau-attente"><CloudOff size={18} /> {nbAttente} saisie(s) pas encore envoyée(s).
              <button className="btn btn-petit btn-primaire" onClick={async () => { const r = await attente.renvoyer(); flash(r.reste ? 'Toujours pas de réseau.' : 'Tout est envoyé.', r.reste ? 'erreur' : 'succes'); rafraichir(); }}>Réessayer</button>
            </div>
          )}
          <Page ouvrir={(op) => setSaisie(op)} />
        </main>

        <nav className="barre-bas">
          {barre.map((k) => { const I = PAGES[k].icone; return <button key={k} className={pageSure === k ? 'actif' : ''} onClick={() => aller(k)}><I size={22} /><span>{PAGES[k].label}</span></button>; })}
          <button className={autres.includes(pageSure) ? 'actif' : ''} onClick={() => setPlus(true)}><MoreHorizontal size={22} /><span>Plus</span></button>
        </nav>

        {plus && (
          <Modal titre="Plus" onClose={() => setPlus(false)}>
            <div className="feuille-plus">
              {autres.map((k) => { const I = PAGES[k].icone; return <button key={k} className="btn btn-second btn-grand" onClick={() => aller(k)}><I size={20} /> {PAGES[k].label}</button>; })}
            </div>
            <p className="texte-doux petit centre">Version {VERSION}</p>
          </Modal>
        )}
        {saisie && <Saisie initial={saisie} onClose={() => setSaisie(null)} />}
      </div>
    </AppCtx.Provider>
  );
}
