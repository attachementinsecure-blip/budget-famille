// Calculs purs (testés dans tests/calculs.test.mjs)
import { arrondi, dansPeriode } from './format.js';

const actives = (ops) => ops.filter((o) => !o.archive);
const somme = (arr, f = (o) => Number(o.montant)) => arrondi(arr.reduce((s, o) => s + f(o), 0));

export function partDe(op, uid) {
  const p = op.partage || [];
  if (!p.length || !p.includes(uid)) return 0;
  return Number(op.montant) / p.length;
}

// Qui doit combien à qui, pour les dépenses communes
export function equilibre(ops, membres) {
  const net = Object.fromEntries(membres.map((m) => [m.id, 0]));
  for (const o of actives(ops)) {
    if (o.espace !== 'commun' || o.sens !== 'depense') continue;
    if (o.paye_par && o.paye_par in net) net[o.paye_par] += Number(o.montant);
    for (const id of o.partage || []) if (id in net) net[id] -= partDe(o, id);
  }
  const deb = [], cred = [];
  for (const [id, v] of Object.entries(net)) {
    const r = arrondi(v);
    if (r < -0.004) deb.push({ id, v: -r }); else if (r > 0.004) cred.push({ id, v: r });
  }
  deb.sort((a, b) => b.v - a.v); cred.sort((a, b) => b.v - a.v);
  const virements = [];
  let i = 0, j = 0;
  while (i < deb.length && j < cred.length) {
    const m = arrondi(Math.min(deb[i].v, cred[j].v));
    if (m > 0) virements.push({ de: deb[i].id, a: cred[j].id, montant: m });
    deb[i].v = arrondi(deb[i].v - m); cred[j].v = arrondi(cred[j].v - m);
    if (deb[i].v <= 0.004) i++;
    if (cred[j].v <= 0.004) j++;
  }
  return { net, virements };
}

// Fiche d'une personne sur une période
export function fichePersonne(ops, uid, periode) {
  const o = actives(ops).filter((x) => dansPeriode(x, periode));
  const perso = o.filter((x) => x.espace === 'perso' && x.proprietaire === uid);
  const communs = o.filter((x) => x.espace === 'commun' && x.sens === 'depense');
  const depensesPerso = somme(perso.filter((x) => x.sens === 'depense'));
  const rentrees = somme(perso.filter((x) => x.sens === 'rentree'));
  const partCommune = arrondi(communs.reduce((s, x) => s + partDe(x, uid), 0));
  const payePourFoyer = somme(communs.filter((x) => x.paye_par === uid));
  const parCat = {};
  for (const x of perso.filter((y) => y.sens === 'depense')) parCat[x.categorie] = (parCat[x.categorie] || 0) + Number(x.montant);
  for (const x of communs) { const p = partDe(x, uid); if (p) parCat[x.categorie] = (parCat[x.categorie] || 0) + p; }
  const topCats = Object.entries(parCat).map(([c, v]) => [c, arrondi(v)]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const saisies = o.filter((x) => x.cree_par === uid).length;
  return { depensesPerso, rentrees, partCommune, payePourFoyer, total: arrondi(depensesPerso + partCommune), topCats, saisies };
}

// Totaux de la famille (hors pro) sur une période
export function totauxFamille(ops, periode) {
  const o = actives(ops).filter((x) => dansPeriode(x, periode) && x.espace !== 'pro');
  const dep = o.filter((x) => x.sens === 'depense');
  const parCat = {};
  for (const x of dep) parCat[x.categorie] = arrondi((parCat[x.categorie] || 0) + Number(x.montant));
  return { depenses: somme(dep), rentrees: somme(o.filter((x) => x.sens === 'rentree')), parCat };
}

export function projectionMois(totalADate, periode, aujourdhuiIso) {
  if (aujourdhuiIso < periode.debut || aujourdhuiIso > periode.fin) return null;
  const jour = Number(aujourdhuiIso.slice(8, 10));
  if (jour < 3) return null;
  return arrondi((totalADate / jour) * periode.jours);
}

// Activité pro
export const estCommission = (o) => o.categorie === 'Commission plateforme';
export function bilanPro(ops, periode, activiteId) {
  const o = actives(ops).filter((x) => x.espace === 'pro' && dansPeriode(x, periode) && (!activiteId || x.activite_id === activiteId));
  const rec = o.filter((x) => x.sens === 'rentree');
  const dep = o.filter((x) => x.sens === 'depense');
  const iva = (x) => Number(x.iva_montant) || 0;
  const recettes = somme(rec), commissions = somme(dep.filter(estCommission)), frais = somme(dep.filter((x) => !estCommission(x)));
  const ivaCollectee = somme(rec, iva), ivaDeductible = somme(dep, iva);
  const resultatHT = arrondi((recettes - ivaCollectee) - (commissions + frais - ivaDeductible));
  const sansJustif = o.filter((x) => !x.justificatif);
  return { ops: o, recettes, commissions, frais, ivaCollectee, ivaDeductible, ivaAPayer: arrondi(ivaCollectee - ivaDeductible), resultatHT, sansJustif };
}

export const ivaDepuisTTC = (ttc, taux) => (taux ? arrondi(Number(ttc) - Number(ttc) / (1 + Number(taux) / 100)) : 0);

// Points d'attention automatiques
export function pointsAttention({ actuel, precedent, membres, ops, periode, fixes, pointes, estGestionnaire }) {
  const pts = [];
  for (const [cat, v] of Object.entries(actuel.parCat)) {
    const avant = precedent.parCat[cat] || 0;
    if (v - avant > 20 && avant > 0 && v > avant * 1.25) pts.push({ niveau: 'alerte', texte: `${cat} : ${Math.round((v / avant - 1) * 100)} % de plus que la période précédente.` });
  }
  if (actuel.rentrees > 0 && actuel.depenses > actuel.rentrees) pts.push({ niveau: 'alerte', texte: 'Les dépenses dépassent les rentrées sur cette période.' });
  if (estGestionnaire) {
    const o = actives(ops).filter((x) => dansPeriode(x, periode));
    for (const m of membres) if (!o.some((x) => x.cree_par === m.id)) pts.push({ niveau: 'info', texte: `${m.prenom} n'a rien saisi sur cette période.` });
    const sj = o.filter((x) => x.espace === 'pro' && !x.justificatif).length;
    if (sj) pts.push({ niveau: 'info', texte: `${sj} opération(s) pro sans justificatif.` });
  }
  const nonPointes = (fixes || []).filter((f) => f.actif && !pointes.has(f.id)).length;
  if (nonPointes) pts.push({ niveau: 'info', texte: `${nonPointes} charge(s) fixe(s) pas encore enregistrée(s) ce mois-ci.` });
  return pts;
}

export function evolution(v, avant) {
  if (!avant) return null;
  return Math.round((v / avant - 1) * 100);
}
