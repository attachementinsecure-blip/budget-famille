// Bilan Excel : résumé + une feuille par secteur choisi
import * as XLSX from 'xlsx';
import { parseIso, moisDe, dansPeriode, arrondi, LIB_MOYEN } from './format.js';
import { fichePersonne, bilanPro, reservationsDe, partDe, porteur, mouvementEspeces } from './calculs.js';

export const SECTEURS = [
  ['perso', 'Perso'], ['commun', 'Commun'], ['pro', 'Pro'], ['especes', 'Espèces'], ['projets', 'Projets'],
];
const EUR = '#,##0.00 "€";-#,##0.00 "€"';
const actives = (ops) => ops.filter((o) => !o.archive);
const somme = (arr, f) => arrondi(arr.reduce((s, x) => s + f(x), 0));

// Cellules
const n = (v) => ({ t: 'n', v: arrondi(v || 0), z: EUR });
const vide = (v) => (v ? n(v) : null);
const d = (iso) => ({ t: 'd', v: parseIso(iso), z: 'dd/mm/yyyy' });
const col = (i) => XLSX.utils.encode_col(i);
const total = (c, de, a, v) => ({ t: 'n', f: `SUM(${col(c)}${de}:${col(c)}${a})`, v: arrondi(v), z: EUR });

// Feuille avec en-tête, lignes, ligne de total (formules) et largeurs de colonnes
function feuille(titre, entete, lignes, colsTotal = [], largeurs = []) {
  const aoa = [[titre], [], entete, ...lignes];
  const premiere = 4, derniere = 3 + lignes.length;
  if (lignes.length && colsTotal.length) {
    const t = entete.map((_, i) => (i === 0 ? 'Total' : null));
    for (const c of colsTotal) t[c] = total(c, premiere, derniere, lignes.reduce((s, l) => s + (Number(l[c]?.v) || 0), 0));
    aoa.push([], t);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws['!cols'] = entete.map((h, i) => ({ wch: largeurs[i] || Math.max(10, String(h).length + 2) }));
  ws['!autofilter'] = lignes.length ? { ref: `A3:${col(entete.length - 1)}${derniere}` } : undefined;
  return ws;
}

export function construireBilan({ periode, mode, secteurs, ops, projets = [], projetOps = [], membres, famille, activites = [], estGestionnaire, profil }) {
  const wb = XLSX.utils.book_new();
  const o = actives(ops).filter((x) => dansPeriode(x, periode));
  const nom = (id) => membres.find((m) => m.id === id)?.prenom || '—';
  const nomAct = (id) => activites.find((a) => a.id === id)?.nom || '';
  const avec = (s) => secteurs.includes(s);
  const persos = o.filter((x) => x.espace === 'perso' && x.sens !== 'retrait' && (estGestionnaire || x.proprietaire === profil.id));
  const communs = o.filter((x) => x.espace === 'commun');
  const pros = o.filter((x) => x.espace === 'pro');
  const especes = o.filter((x) => mouvementEspeces(x) !== 0 && (estGestionnaire || porteur(x) === profil.id));
  const pOps = actives(projetOps).filter((x) => dansPeriode(x, periode));
  const dep = (arr) => somme(arr.filter((x) => x.sens === 'depense'), (x) => Number(x.montant));
  const ren = (arr) => somme(arr.filter((x) => x.sens === 'rentree' || x.sens === 'recette'), (x) => Number(x.montant));

  // ---------- Résumé ----------
  const r = [
    [`Bilan ${famille?.nom ? '— ' + famille.nom : ''}`], [periode.label], [`Exporté le ${new Date().toLocaleDateString('fr-FR')}`], [],
    ['Par secteur', 'Dépenses', 'Rentrées / recettes', 'Solde'],
  ];
  const ligneSecteur = (label, a, b) => r.push([label, n(a), n(b), n(b - a)]);
  if (avec('perso')) ligneSecteur('Perso', dep(persos), ren(persos));
  if (avec('commun')) ligneSecteur('Commun', dep(communs), ren(communs));
  if (avec('pro')) { const b = bilanPro(o, periode); ligneSecteur('Pro', arrondi(b.commissions + b.frais), b.recettes); }
  if (avec('especes')) ligneSecteur('Espèces (porte-monnaie)', somme(especes.filter((x) => mouvementEspeces(x) < 0), (x) => -mouvementEspeces(x)), somme(especes.filter((x) => mouvementEspeces(x) > 0), mouvementEspeces));
  if (avec('projets')) ligneSecteur('Projets partagés', dep(pOps), ren(pOps));

  if (mode !== 'mois' && mode !== 'semaine') {
    r.push([], ['Mois par mois']);
    const tete = ['Mois'];
    if (avec('perso')) tete.push('Perso dépenses', 'Perso rentrées');
    if (avec('commun')) tete.push('Commun dépenses');
    if (avec('pro')) tete.push('Pro recettes', 'Pro frais', 'Pro résultat');
    if (avec('projets')) tete.push('Projets dépenses', 'Projets recettes');
    r.push(tete);
    for (const pm of moisDe(periode)) {
      const l = [pm.label];
      const om = o.filter((x) => dansPeriode(x, pm));
      if (avec('perso')) { const pp = persos.filter((x) => dansPeriode(x, pm)); l.push(n(dep(pp)), n(ren(pp))); }
      if (avec('commun')) l.push(n(dep(communs.filter((x) => dansPeriode(x, pm)))));
      if (avec('pro')) { const b = bilanPro(om, pm); l.push(n(b.recettes), n(b.commissions + b.frais), n(b.resultatHT)); }
      if (avec('projets')) { const pp = pOps.filter((x) => dansPeriode(x, pm)); l.push(n(dep(pp)), n(ren(pp))); }
      r.push(l);
    }
  }
  if (avec('perso') || avec('commun')) {
    r.push([], ['Par personne', 'Dépenses perso', 'Part commune', 'Payé pour le foyer', 'Rentrées', 'Total dépensé']);
    for (const m of (estGestionnaire ? membres : membres.filter((x) => x.id === profil.id))) {
      const f = fichePersonne(o, m.id, periode);
      r.push([m.prenom, n(f.depensesPerso), n(f.partCommune), n(f.payePourFoyer), n(f.rentrees), n(f.total)]);
    }
  }
  const wsR = XLSX.utils.aoa_to_sheet(r);
  wsR['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsR, 'Résumé');

  // ---------- Perso ----------
  if (avec('perso')) {
    const l = persos.map((x) => [d(x.date_op), nom(x.proprietaire), x.sens === 'rentree' ? 'Rentrée' : 'Dépense', x.categorie, x.libelle, LIB_MOYEN[x.moyen] || '',
      vide(x.sens === 'depense' && x.montant), vide(x.sens === 'rentree' && x.montant)]);
    XLSX.utils.book_append_sheet(wb, feuille(`Perso — ${periode.label}`, ['Date', 'Personne', 'Type', 'Motif', 'Description', 'Payé en', 'Dépense', 'Rentrée'], l, [6, 7], [12, 12, 10, 18, 34, 10, 12, 12]), 'Perso');
  }
  // ---------- Commun ----------
  if (avec('commun')) {
    const l = communs.map((x) => [d(x.date_op), x.sens === 'rentree' ? 'Rentrée' : 'Dépense', x.categorie, x.libelle, nom(x.paye_par), (x.partage || []).map(nom).join(', '),
      LIB_MOYEN[x.moyen] || '', n(x.montant), ...membres.map((m) => vide(x.sens === 'depense' && partDe(x, m.id)))]);
    const tete = ['Date', 'Type', 'Motif', 'Description', 'Payé par', 'Partagé entre', 'Payé en', 'Montant', ...membres.map((m) => `Part ${m.prenom}`)];
    XLSX.utils.book_append_sheet(wb, feuille(`Commun — ${periode.label}`, tete, l, tete.map((_, i) => i).filter((i) => i >= 7), [12, 10, 18, 30, 12, 24, 10, 12]), 'Commun');
  }
  // ---------- Pro + Réservations ----------
  if (avec('pro')) {
    const l = [...pros].sort((a, b) => a.date_op.localeCompare(b.date_op)).map((x) => [d(x.date_op), nomAct(x.activite_id), x.sens === 'rentree' ? 'Recette' : 'Frais', x.categorie, x.libelle,
      x.fournisseur || '', x.voyageur || '', x.ref_resa || '', LIB_MOYEN[x.moyen] || '',
      vide(x.sens === 'rentree' && x.montant), vide(x.sens === 'rentree' && Number(x.frais_plateforme)), vide(x.sens === 'depense' && x.montant), x.justificatif ? 'oui' : 'NON']);
    const ws = feuille(`Pro — ${periode.label}`, ['Date', 'Activité', 'Type', 'Motif', 'Description', 'Client / fournisseur', 'Voyageur', 'Réf. réservation', 'Payé en', 'Recette', 'Frais plateforme', 'Autres frais', 'Justificatif'],
      l, [9, 10, 11], [12, 14, 9, 22, 28, 18, 20, 16, 10, 12, 14, 12, 11]);
    const b = bilanPro(o, periode);
    XLSX.utils.sheet_add_aoa(ws, [[], ['Recettes', n(b.recettes)], ['Frais des plateformes', n(b.commissions)], ['Autres frais', n(b.frais)], ['Résultat', n(b.resultatHT)]], { origin: -1 });
    XLSX.utils.book_append_sheet(wb, ws, 'Pro');

    const resas = reservationsDe(pros);
    const lr = resas.map((x) => [d(x.date_op), nomAct(x.activite_id), x.fournisseur || x.categorie, x.voyageur || '', x.ref_resa || '', n(x.brut), n(x.fraisP), n(x.net), LIB_MOYEN[x.moyen] || '']);
    XLSX.utils.book_append_sheet(wb, feuille(`Réservations — ${periode.label}`, ['Date', 'Activité', 'Plateforme / client', 'Voyageur', 'Réf. réservation', 'Montant total', 'Frais plateforme', 'Net reçu', 'Reçu en'],
      lr, [5, 6, 7], [12, 14, 20, 24, 18, 14, 16, 12, 10]), 'Réservations');
  }
  // ---------- Espèces ----------
  if (avec('especes')) {
    const l = especes.map((x) => { const m = mouvementEspeces(x); return [d(x.date_op), nom(porteur(x)), x.sens === 'retrait' ? 'Retrait' : m > 0 ? 'Reçu' : 'Dépense', x.categorie, x.libelle, vide(m > 0 && m), vide(m < 0 && -m)]; });
    XLSX.utils.book_append_sheet(wb, feuille(`Espèces — ${periode.label}`, ['Date', 'Personne', 'Mouvement', 'Motif', 'Description', 'Entrée', 'Sortie'], l, [5, 6], [12, 12, 11, 18, 32, 12, 12]), 'Espèces');
  }
  // ---------- Projets ----------
  if (avec('projets')) {
    const nomP = (id) => projets.find((p) => p.id === id)?.nom || '';
    const nomPart = (id) => projets.flatMap((p) => p.projet_participants || []).find((p) => p.id === id)?.nom || '?';
    const l = [...pOps].sort((a, b) => a.date_op.localeCompare(b.date_op)).map((x) => [nomP(x.projet_id), d(x.date_op), x.sens === 'recette' ? 'Recette' : 'Dépense', x.categorie, x.libelle,
      (x.parts || []).map((p) => `${nomPart(p.participant_id)} ${String(p.montant).replace('.', ',')} €`).join(', '), vide(x.sens === 'depense' && x.montant), vide(x.sens === 'recette' && x.montant)]);
    XLSX.utils.book_append_sheet(wb, feuille(`Projets — ${periode.label}`, ['Projet', 'Date', 'Type', 'Motif', 'Description', 'Payé / reçu par', 'Dépense', 'Recette'], l, [6, 7], [20, 12, 10, 18, 28, 34, 12, 12]), 'Projets');
  }
  return wb;
}

export function nomFichier(periode, secteurs) {
  const s = secteurs.length === SECTEURS.length ? 'tout' : secteurs.join('-');
  return `bilan-${periode.debut.slice(0, 7)}-${periode.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${s}.xlsx`;
}
export const telecharger = (wb, fichier) => XLSX.writeFile(wb, fichier, { compression: true });
