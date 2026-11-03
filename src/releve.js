// Lecture d'un relevé bancaire (CSV ou Excel) et classement automatique, sans IA.
import { isoDate, arrondi } from './format.js';

export const normaliser = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// ---------- Nombres et dates ----------
export function lireMontant(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').replace(/[\s\u00a0\u202f€EUR]/gi, '').trim();
  if (!s) return null;
  let negatif = false;
  if (/^\(.*\)$/.test(s)) { negatif = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negatif = true; s = s.slice(0, -1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) { negatif = !negatif; s = s.slice(1); }
  const p = s.lastIndexOf('.'), c = s.lastIndexOf(',');
  if (p >= 0 && c >= 0) s = p > c ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  else if (c >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return negatif ? -n : n;
}

export function lireDate(v) {
  if (v instanceof Date && !isNaN(v)) return isoDate(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) { // date Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return isoDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valide(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return valide(y, +m[2], +m[1]); }
  return null;
}
function valide(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(y, mo - 1, d);
  return dt.getMonth() === mo - 1 ? isoDate(dt) : null;
}

// ---------- Fichier texte (CSV) ----------
export function decoderTexte(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '');
  return new TextDecoder('windows-1252').decode(buffer);
}

export function lireCsv(texte) {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim());
  const echantillon = lignes.slice(0, 40).join('\n');
  const sep = [';', '\t', ','].map((c) => [c, (echantillon.match(new RegExp(c === '\t' ? '\t' : '\\' + c, 'g')) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0];
  return lignes.map((l) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

// ---------- Colonnes ----------
const RE = {
  date: /^DATA( (DE )?(MOV|LANC|OPER|TRANS|CONTAB)\w*)?$|^DATE|^DT\.? ?MOV|^DATA MOVIMENTO/,
  dateValeur: /VALOR|VALEUR/,
  libelle: /DESCRI|DESIGNA|MOVIMENTO|LIBELL|DETALHE|HISTORICO|DESCRITIVO|REFERENCIA|^OPERA/,
  montant: /^(MONTANTE|VALOR|IMPORTANCIA|QUANTIA|AMOUNT|MONTANT)\b/,
  debit: /DEBITO|DEBIT|SAIDA|LEVANTAMENTO/,
  credit: /CREDITO|CREDIT|ENTRADA|DEPOSITO/,
  solde: /SALDO|SOLDE|BALANCE/,
};

export function detecterColonnes(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i].map(normaliser);
    const trouve = (re, exclure) => h.findIndex((x) => re.test(x) && !(exclure && exclure.test(x)) && !RE.solde.test(x));
    let date = trouve(RE.date, RE.dateValeur);
    if (date < 0) date = h.findIndex((x) => /^DATA|^DATE/.test(x));
    const libelle = trouve(RE.libelle, /^DATA/);
    const debit = trouve(RE.debit), credit = trouve(RE.credit);
    let montant = trouve(RE.montant, /^DATA/);
    if (montant >= 0 && (montant === debit || montant === credit)) montant = -1;
    if (date >= 0 && libelle >= 0 && (montant >= 0 || debit >= 0 || credit >= 0)) {
      return { entete: i, date, libelle, montant, debit, credit, noms: rows[i] };
    }
  }
  // Sans en-tête : on devine sur les données
  const r = rows.find((x) => x.some((c) => lireDate(c)));
  if (!r) return null;
  const date = r.findIndex((c) => lireDate(c));
  const montant = r.findIndex((c, j) => j !== date && lireMontant(c) !== null && /[.,]\d{2}$|^-?\d+$/.test(String(c).trim()) && !lireDate(c));
  const libelle = r.reduce((best, c, j) => (String(c).length > String(r[best] ?? '').length && j !== date && j !== montant ? j : best), date === 0 ? 1 : 0);
  return { entete: -1, date, libelle, montant, debit: -1, credit: -1, noms: r.map((_, j) => `Colonne ${j + 1}`) };
}

export function extraireLignes(rows, col) {
  const out = [];
  for (let i = col.entete + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = lireDate(r[col.date]);
    if (!date) continue;
    let m = null;
    if (col.montant >= 0) m = lireMontant(r[col.montant]);
    if (m === null && (col.debit >= 0 || col.credit >= 0)) {
      const d = col.debit >= 0 ? lireMontant(r[col.debit]) : null;
      const c = col.credit >= 0 ? lireMontant(r[col.credit]) : null;
      if (c) m = Math.abs(c); else if (d) m = -Math.abs(d);
    }
    if (!m) continue;
    const libelle = String(r[col.libelle] ?? '').replace(/\s+/g, ' ').trim();
    out.push({ n: out.length, date, libelle, montant: arrondi(Math.abs(m)), sens: m < 0 ? 'depense' : 'rentree' });
  }
  return out;
}

// ---------- Classement ----------
const BRUIT = new Set(['COMPRA', 'COMPRAS', 'PAG', 'PAGAMENTO', 'PAGAM', 'PAGTO', 'DD', 'TRF', 'TRANSF', 'TRANSFERENCIA', 'MB', 'WAY', 'MBWAY', 'CARTAO', 'CART', 'LEV', 'LEVANTAMENTO', 'DEB', 'DEBITO', 'DIRECTO', 'DIRETO', 'SEPA', 'P2P', 'CONTACTLESS', 'POS', 'TPA', 'PAYPAL', 'DE', 'DO', 'DA', 'EM', 'A', 'O', 'NUM', 'REF', 'IMED', 'IMEDIATA', 'CRED', 'CREDITO', 'TRANSFER', 'CARD', 'VISA', 'MASTERCARD', 'NAC', 'INT', 'ELECTRONICA', 'ELETRONICA', 'COMPRAS.']);
export function cleRegle(libelle) {
  const mots = normaliser(libelle).replace(/[^A-Z ]/g, ' ').split(' ').filter((w) => w.length > 1 && !BRUIT.has(w));
  return mots.slice(0, 2).join(' ') || normaliser(libelle).slice(0, 20);
}

// [motif, espace, catégorie, sens éventuel]
const MOTS = [
  [/LEVANTAMENTO|\bLEV\b|\bATM\b|CASH ?WITHDRAW|RETRAIT/, 'retrait', 'Retrait espèces', 'depense'],
  [/AIRBNB/, 'pro', 'Réservation Airbnb', 'rentree'],
  [/AIRBNB/, 'pro', 'Commission plateforme', 'depense'],
  [/STRIPE/, 'pro', 'Paiement Stripe', 'rentree'],
  [/STRIPE/, 'pro', 'Commission plateforme', 'depense'],
  [/BOOKING/, 'pro', 'Réservation directe', 'rentree'],
  [/BOOKING/, 'pro', 'Commission plateforme', 'depense'],
  [/VENCIMENTO|ORDENADO|SALARIO|SALAIRE/, 'perso', 'Salaire', 'rentree'],
  [/ABONO|PRESTACOES FAMILIARES|SEG\.? ?SOCIAL|SEGURANCA SOCIAL|CAF /, 'perso', 'Allocations', 'rentree'],
  [/REEMBOLSO|DEVOLUCAO|ESTORNO/, 'perso', 'Remboursement', 'rentree'],
  [/CONTINENTE|PINGO DOCE|LIDL|ALDI|MERCADONA|INTERMARCHE|MINIPRECO|AUCHAN|JUMBO|LECLERC|MEU SUPER|SPAR|COVIRAN|FROIZ|AMANHECER|SUPERMERCADO|TALHO|PADARIA/, 'commun', 'Alimentation'],
  [/GALP ENERGIA|EDP|ENDESA|IBERDROLA|GOLDENERGY|LUZBOA|AGUAS|SMAS|ELECTRICIDADE|ELETRICIDADE|GAS NATURAL|PORTGAS/, 'commun', 'Énergie et eau'],
  [/\bMEO\b|\bNOS\b|VODAFONE|NOWO|\bDIGI\b|NETFLIX|SPOTIFY|DISNEY|HBO|PRIME VIDEO|APPLE\.COM|GOOGLE ?\*|YOUTUBE/, 'commun', 'Abonnements'],
  [/RENDA|CONDOMINIO|PRESTACAO HAB|CREDITO HAB|HABITACAO/, 'commun', 'Logement'],
  [/FIDELIDADE|TRANQUILIDADE|ALLIANZ|ZURICH|AGEAS|GENERALI|LIBERTY|SEGURO|OCIDENTAL|LOGO SEGUROS/, 'commun', 'Assurances'],
  [/AUTORIDADE TRIBUTARIA|\bAT\b|FINANCAS|\bIMI\b|\bIUC\b|PORTAL DAS FINANCAS/, 'commun', 'Impôts'],
  [/ESCOLA|COLEGIO|CRECHE|\bATL\b|AGRUPAMENTO/, 'commun', 'École'],
  [/FARMACIA|CLINICA|HOSPITAL|\bCUF\b|LUZ SAUDE|LUSIADAS|DENTIST|MEDIC|SAUDE/, 'perso', 'Santé'],
  [/GALP|\bBP\b|REPSOL|CEPSA|\bPRIO\b|COMBUSTIV|GASOLEO|GASOLINA/, 'perso', 'Carburant'],
  [/VIA VERDE|BRISA|PORTAGEM|\bCP\b|CARRIS|METRO|UBER|BOLT|PARQUE|ESTACIONAMENTO|EMEL/, 'perso', 'Transport'],
  [/ZARA|PRIMARK|\bH ?& ?M\b|PULL ?& ?BEAR|BERSHKA|MANGO|SPRINGFIELD|KIABI|SHOEBY|SAPATARIA/, 'perso', 'Vêtements'],
  [/LEROY MERLIN|IKEA|\bAKI\b|BRICOMARCHE|WORTEN|FNAC|MAXMAT|CASA\b/, 'commun', 'Maison'],
  [/TABACARIA|TABACO|TABAC/, 'perso', 'Cigarettes'],
  [/RESTAURANTE|RESTAURANT|MCDONALD|BURGER KING|TELEPIZZA|PIZZA HUT|\bKFC\b|GLOVO|UBER ?EATS|BOLT FOOD|TASCA|CHURRASQUEIRA|MARISQUEIRA|SNACK/, 'perso', 'Restaurant'],
  [/\bCAFE\b|CAFETARIA|PASTELARIA|STARBUCKS|DELTA CAFES/, 'perso', 'Café'],
  [/DECATHLON|CINEMA|LUSOMUNDO|GINASIO|FITNESS/, 'perso', 'Loisirs'],
];

export function proposer(ligne, regles, estGestionnaire) {
  const cle = cleRegle(ligne.libelle);
  const r = regles[cle];
  if (r && (r.espace !== 'pro' || estGestionnaire) && (!r.sens || r.sens === ligne.sens)) {
    return { espace: r.espace, categorie: r.categorie, activite_id: r.activite_id, origine: 'appris', cle };
  }
  const t = normaliser(ligne.libelle);
  for (const [re, espace, categorie, sens] of MOTS) {
    if (sens && sens !== ligne.sens) continue;
    if (!re.test(t)) continue;
    if (espace === 'pro' && !estGestionnaire) continue;
    let cat = categorie;
    if (!sens && ligne.sens === 'rentree') cat = 'Remboursement';
    return { espace, categorie: cat, origine: 'propose', cle };
  }
  return { espace: 'perso', categorie: 'Autre', origine: 'inconnu', cle };
}

// Doublons : même date, même montant, même sens qu'une opération déjà enregistrée
export function marquerDoublons(lignes, existantes) {
  const pris = new Map();
  for (const o of existantes) {
    const k = `${o.date_op}|${Number(o.montant).toFixed(2)}|${o.sens === 'retrait' ? 'depense' : o.sens}`;
    pris.set(k, (pris.get(k) || 0) + 1);
  }
  return lignes.map((l) => {
    const k = `${l.date}|${l.montant.toFixed(2)}|${l.sens}`;
    const n = pris.get(k) || 0;
    if (n > 0) { pris.set(k, n - 1); return { ...l, doublon: true }; }
    return { ...l, doublon: false };
  });
}
