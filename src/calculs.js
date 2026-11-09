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
  const fraisResa = somme(rec, (x) => Number(x.frais_plateforme) || 0);
  const recettes = somme(rec), commissions = arrondi(somme(dep.filter(estCommission)) + fraisResa), frais = somme(dep.filter((x) => !estCommission(x)));
  const ivaCollectee = somme(rec, iva), ivaDeductible = somme(dep, iva);
  const resultatHT = arrondi((recettes - ivaCollectee) - (commissions + frais - ivaDeductible));
  const sansJustif = o.filter((x) => !x.justificatif);
  const reservations = reservationsDe(o);
  return { ops: o, recettes, commissions, frais, ivaCollectee, ivaDeductible, ivaAPayer: arrondi(ivaCollectee - ivaDeductible), resultatHT, sansJustif, reservations, netRecu: arrondi(recettes - fraisResa) };
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

// Espèces : qui a l'argent liquide en main
export const porteur = (o) => (o.espace === 'commun' ? o.paye_par : o.proprietaire || o.cree_par);
export function mouvementEspeces(o) {
  if (o.archive) return 0;
  if (o.sens === 'retrait') return Number(o.montant);
  if (o.moyen !== 'especes') return 0;
  return o.sens === 'rentree' ? Number(o.montant) : -Number(o.montant);
}
// Effet d'une opération sur le porte-monnaie d'une personne (les dons passent d'une poche à l'autre)
export function effetEspeces(o, uid) {
  if (o.archive) return 0;
  if (o.sens === 'transfert') return (o.paye_par === uid ? -Number(o.montant) : 0) + (o.beneficiaire === uid ? Number(o.montant) : 0);
  return porteur(o) === uid ? mouvementEspeces(o) : 0;
}
export function soldeEspeces(ops, uid) {
  return arrondi(ops.reduce((s, o) => s + effetEspeces(o, uid), 0));
}
// Sorties d'argent par compte du foyer (dépenses perso et communes)
export function sortiesParCompte(ops, periode) {
  const out = {};
  for (const o of ops) {
    if (o.archive || !dansPeriode(o, periode)) continue;
    if (o.sens === 'retrait' && o.compte) { out[o.compte] = (out[o.compte] || 0) + Number(o.montant); continue; }
    if (o.sens !== 'depense' || o.espace === 'pro') continue;
    const k = o.moyen === 'especes' ? 'Espèces' : (o.compte || 'Compte non précisé');
    out[k] = (out[k] || 0) + Number(o.montant);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, arrondi(v)]).sort((a, b) => b[1] - a[1]));
}

// Projets : qui a payé, qui a reçu, qui doit combien à qui
// - réservation : « montant » = facturé (net + frais + options payées sur place), les frais sont une dépense,
//   les parts = ce que chacun a réellement reçu (facturé − frais)
// - versement : argent passé d'un participant à un autre (ne change pas le résultat)
// - compte commun (SCI…) : son argent appartient aux associés selon leur part
export const estCompte = (p) => p.type === 'compte';
export function quotesProjet(participants) {
  const pers = participants.filter((p) => !estCompte(p));
  const q = pers.map((p) => (p.quote === null || p.quote === undefined ? null : Number(p.quote)));
  const perso = pers.length > 0 && q.every((x) => x !== null) && Math.abs(q.reduce((s, x) => s + x, 0) - 100) < 0.01;
  const out = Object.fromEntries(participants.map((p) => [p.id, 0]));
  pers.forEach((p, i) => { out[p.id] = perso ? q[i] / 100 : 1 / pers.length; });
  return out;
}
export const optionsTotal = (opts, surPlace) => arrondi((opts || []).filter((x) => surPlace === undefined || Boolean(x.sur_place) === surPlace)
  .reduce((s, x) => s + Number(x.prix || 0) * Number(x.quantite || 0), 0));
export function bilanProjet(ops, participants) {
  const o = ops.filter((x) => !x.archive);
  const quotes = quotesProjet(participants);
  const par = Object.fromEntries(participants.map((p) => [p.id, { paye: 0, recu: 0, quote: quotes[p.id], compte: estCompte(p) }]));
  let facture = 0, fraisP = 0, depenses = 0, versements = 0, nbResa = 0;
  for (const x of o) {
    const m = Number(x.montant);
    if (x.sens === 'versement') {
      versements += m;
      if (par[x.de_participant]) par[x.de_participant].paye += m;
      if (par[x.vers_participant]) par[x.vers_participant].recu += m;
      continue;
    }
    if (x.sens === 'depense') depenses += m;
    else { facture += m; fraisP += Number(x.frais_plateforme) || 0; if (x.voyageur || x.plateforme || x.ref_resa) nbResa++; }
    for (const pt of x.parts || []) {
      if (!par[pt.participant_id]) continue;
      if (x.sens === 'depense') par[pt.participant_id].paye += Number(pt.montant); else par[pt.participant_id].recu += Number(pt.montant);
    }
  }
  // L'argent d'un compte commun est réparti entre les associés selon leur part
  const eff = Object.fromEntries(Object.entries(par).map(([id, v]) => [id, { paye: v.compte ? 0 : v.paye, recu: v.compte ? 0 : v.recu }]));
  for (const [, v] of Object.entries(par).filter(([, v]) => v.compte)) {
    for (const [pid, w] of Object.entries(par)) if (!w.compte) { eff[pid].paye += v.paye * w.quote; eff[pid].recu += v.recu * w.quote; }
  }
  const resultat = arrondi(facture - fraisP - depenses);
  const net = {};
  for (const [id, v] of Object.entries(par)) {
    v.paye = arrondi(v.paye); v.recu = arrondi(v.recu);
    if (v.compte) { v.part = 0; v.solde = 0; continue; }
    v.part = arrondi(resultat * v.quote);
    v.solde = arrondi(v.part - (eff[id].recu - eff[id].paye)); // > 0 : on lui doit de l'argent
    net[id] = v.solde;
  }
  const deb = [], cred = [];
  for (const [id, v] of Object.entries(net)) { if (v < -0.004) deb.push({ id, v: -v }); else if (v > 0.004) cred.push({ id, v }); }
  deb.sort((a, b) => b.v - a.v); cred.sort((a, b) => b.v - a.v);
  const virements = []; let i = 0, j = 0;
  while (i < deb.length && j < cred.length) {
    const m = arrondi(Math.min(deb[i].v, cred[j].v));
    if (m > 0) virements.push({ de: deb[i].id, a: cred[j].id, montant: m });
    deb[i].v = arrondi(deb[i].v - m); cred[j].v = arrondi(cred[j].v - m);
    if (deb[i].v <= 0.004) i++; if (cred[j].v <= 0.004) j++;
  }
  return {
    facture: arrondi(facture), fraisP: arrondi(fraisP), netRecu: arrondi(facture - fraisP), autresDepenses: arrondi(depenses),
    depenses: arrondi(depenses + fraisP), recettes: arrondi(facture), resultat, versements: arrondi(versements), nbResa,
    par, virements, nb: o.length,
  };
}

// Réservations (ancien pro) : recettes avec voyageur, référence, frais et net reçu
export function reservationsDe(ops) {
  return ops.filter((x) => !x.archive && x.espace === 'pro' && x.sens === 'rentree')
    .map((x) => {
      const brut = Number(x.montant), fraisP = Number(x.frais_plateforme) || 0;
      return { ...x, brut: arrondi(brut), fraisP: arrondi(fraisP), net: arrondi(brut - fraisP) };
    })
    .sort((a, b) => a.date_op.localeCompare(b.date_op));
}
