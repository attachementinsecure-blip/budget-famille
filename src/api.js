import { createClient } from '@supabase/supabase-js';

export const VERSION = '3.1.0';
export const VERSION_BASE_ATTENDUE = '3.1.0';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configOk = Boolean(url && key);
export const supabase = configOk ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

// Messages d'erreur en langage simple
export function messageClair(err) {
  const m = String(err?.message || err || '');
  if (!navigator.onLine || /Failed to fetch|NetworkError|network/i.test(m)) return 'Pas de connexion internet. Vos données sont gardées sur le téléphone.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Confirmez d\'abord votre e-mail : ouvrez le message reçu et touchez le lien.';
  if (/User already registered/i.test(m)) return 'Ce compte existe déjà. Touchez « Se connecter ».';
  if (/Password should be at least/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/row-level security|permission denied|violates row-level/i.test(m)) return 'Vous n\'avez pas le droit de faire cette action.';
  if (/rate limit/i.test(m)) return 'Trop d\'essais. Attendez quelques minutes.';
  if (/JWT|session/i.test(m)) return 'Votre session a expiré. Reconnectez-vous.';
  if (err?.code === 'P0001' || /6 membres|gestionnaire|fait déjà partie/i.test(m)) return m;
  if (/duplicate key/i.test(m)) return 'Cet élément existe déjà.';
  if (/does not exist|schema cache/i.test(m)) return 'La base n\'est pas à jour. Ouvrez l\'écran Diagnostic.';
  return 'Une erreur est survenue. Réessayez dans un instant.';
}
export const estErreurReseau = (err) => !navigator.onLine || /Failed to fetch|NetworkError|network/i.test(String(err?.message || err));

// Stockage local
export const local = {
  get(k, def = null) { try { const v = localStorage.getItem('bf:' + k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem('bf:' + k, JSON.stringify(v)); } catch { /* plein */ } },
  del(k) { try { localStorage.removeItem('bf:' + k); } catch { /* rien */ } },
};

// File d'attente hors ligne
const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export { nouvelId };

export const attente = {
  liste: () => local.get('attente', []),
  ajouter(table, ligne) {
    const l = attente.liste().filter((x) => !(x.table === table && x.ligne.id === ligne.id));
    l.push({ table, ligne }); local.set('attente', l);
    window.dispatchEvent(new Event('bf-attente'));
  },
  async renvoyer() {
    const l = attente.liste(); const reste = [];
    for (const x of l) {
      const { error } = await supabase.from(x.table).upsert(x.ligne);
      if (error) reste.push(x);
    }
    local.set('attente', reste);
    window.dispatchEvent(new Event('bf-attente'));
    return { envoyes: l.length - reste.length, reste: reste.length };
  },
};

// Enregistrer une ligne (avec repli hors ligne)
export async function enregistrer(table, ligne) {
  const { data, error } = await supabase.from(table).upsert(ligne).select().single();
  if (error) {
    if (estErreurReseau(error)) { attente.ajouter(table, ligne); return { horsLigne: true, data: ligne }; }
    throw error;
  }
  return { data };
}

// Justificatifs
export async function envoyerJustificatif(file, espace, proprietaire) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const chemin = `${espace}/${proprietaire}/${nouvelId()}.${ext}`;
  const { error } = await supabase.storage.from('justificatifs').upload(chemin, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return chemin;
}
export async function lienJustificatif(chemin) {
  const { data, error } = await supabase.storage.from('justificatifs').createSignedUrl(chemin, 600);
  if (error) throw error;
  return data.signedUrl;
}

export async function forcerMiseAJour() {
  try {
    if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  } finally { location.reload(); }
}
