// Dates, nombres, libellés
const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const eur = (n) => eurFmt.format(Number(n) || 0);
export const num = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
export const arrondi = (n) => Math.round((Number(n) || 0) * 100) / 100;

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const aujourdhui = () => isoDate(new Date());
export const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const moisCle = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
export const nomMois = (d) => `${MOIS[d.getMonth()]} ${d.getFullYear()}`.replace(/^./, c => c.toUpperCase());
const MOIS_COURTS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
export const dateCourte = (s) => { const d = parseIso(s); return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`; };
export const heure = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dateHeure = (s) => { const d = new Date(s); return `${d.getDate()}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${heure(d)}`; };

// Périodes : { debut, fin } en ISO (fin incluse)
export function periodeMois(ref) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const f = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { debut: isoDate(d), fin: isoDate(f), label: nomMois(d), jours: f.getDate() };
}
export function periodeSemaine(ref) {
  const d = new Date(ref); const j = (d.getDay() + 6) % 7; d.setDate(d.getDate() - j);
  const f = new Date(d); f.setDate(d.getDate() + 6);
  return { debut: isoDate(d), fin: isoDate(f), label: `Semaine du ${d.getDate()} ${MOIS[d.getMonth()]}`, jours: 7 };
}
export function periodeTrimestre(ref) {
  const t = Math.floor(ref.getMonth() / 3);
  const d = new Date(ref.getFullYear(), t * 3, 1), f = new Date(ref.getFullYear(), t * 3 + 3, 0);
  return { debut: isoDate(d), fin: isoDate(f), label: `${t + 1}${t ? 'e' : 'er'} trimestre ${ref.getFullYear()}`, jours: Math.round((f - d) / 86400000) + 1 };
}
export function periodeAnnee(ref) {
  const y = ref.getFullYear();
  return { debut: `${y}-01-01`, fin: `${y}-12-31`, label: `Année ${y}`, jours: 365 };
}
export const PERIODES = { semaine: periodeSemaine, mois: periodeMois, trimestre: periodeTrimestre, annee: periodeAnnee };
export const decaler = (ref, mode, n) => {
  const d = new Date(ref);
  if (mode === 'semaine') d.setDate(d.getDate() + 7 * n);
  else if (mode === 'annee') { d.setDate(1); d.setFullYear(d.getFullYear() + n); }
  else { d.setDate(1); d.setMonth(d.getMonth() + (mode === 'trimestre' ? 3 : 1) * n); }
  return d;
};
// Mois contenus dans une période (pour le détail mois par mois)
export function moisDe(p) {
  const out = []; const d = parseIso(p.debut); d.setDate(1);
  while (isoDate(d) <= p.fin) { out.push(periodeMois(new Date(d))); d.setMonth(d.getMonth() + 1); }
  return out;
}
export const dansPeriode = (op, p) => op.date_op >= p.debut && op.date_op <= p.fin;

export const CAT_DEPENSE = ['Alimentation','Restaurant','Café','Cigarettes','Carburant','Logement','Énergie et eau','Transport','Santé','Enfants','École','Loisirs','Vêtements','Maison','Abonnements','Assurances','Impôts','Cadeaux','Autre'];
export const CAT_RENTREE = ['Salaire','Allocations','Remboursement','Vente','Autre'];
export const CAT_PRO_RECETTE = ['Réservation Airbnb','Réservation directe','Paiement Stripe','Autre recette'];
export const CAT_PRO_DEPENSE = ['Commission plateforme','Ménage','Linge','Entretien et réparations','Fournitures','Énergie et eau','Internet','Assurance','Taxes','Comptable','Carburant','Restaurant','Autre frais'];
export const TAUX_IVA = [0, 6, 13, 23];
// IVA désactivée pour l'instant : passer à true pour la réafficher partout
export const AVEC_IVA = false;
export const CATEGORIES_DE_BASE = new Set();

export const categoriesPour = (espace, sens) =>
  espace === 'pro' ? (sens === 'rentree' ? CAT_PRO_RECETTE : CAT_PRO_DEPENSE)
                   : (sens === 'rentree' ? CAT_RENTREE : CAT_DEPENSE);

export const LIB_ESPACE = { perso: 'Perso', commun: 'Commun', pro: 'Pro' };
export const LIB_SENS = { depense: 'Dépense', rentree: 'Rentrée', retrait: 'Retrait' };
export const MOYENS = [['carte', 'Carte'], ['especes', 'Espèces'], ['virement', 'Virement']];
export const LIB_MOYEN = Object.fromEntries(MOYENS);
export const LIB_ROLE = { gestionnaire: 'Gestionnaire', membre: 'Membre' };

export const LIB_CHAMPS = {
  montant: 'Montant', date_op: 'Date', categorie: 'Catégorie', libelle: 'Description', espace: 'Espace',
  sens: 'Type', archive: 'Archivée', paye_par: 'Payé par', partage: 'Partagé entre', iva_taux: 'Taux IVA',
  iva_montant: 'IVA', nif: 'NIF', fournisseur: 'Fournisseur', justificatif: 'Justificatif', prenom: 'Prénom',
  role: 'Rôle', actif: 'Actif', moyen: 'Payé en', voyageur: 'Voyageur', ref_resa: 'Réf. réservation', frais_plateforme: 'Frais de plateforme', libelle_fixe: 'Libellé', jour: 'Jour', nom: 'Nom', activite_id: 'Activité',
};

for (const l of [CAT_DEPENSE, CAT_RENTREE, CAT_PRO_RECETTE, CAT_PRO_DEPENSE]) for (const c of l) CATEGORIES_DE_BASE.add(c);
