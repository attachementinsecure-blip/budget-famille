// Bilan PDF d'un projet : des phrases simples, de gros chiffres, puis le détail
import { jsPDF } from 'jspdf';
import * as AT from 'jspdf-autotable';

// Selon l'environnement, la fonction est exportée directement ou dans « default »
const autoTable = [AT.default, AT.default?.default, AT.autoTable].find((f) => typeof f === 'function');
import { eur as eurBrut, dansPeriode, dateCourte } from './format.js';
import { bilanProjet, optionsTotal } from './calculs.js';

const BLEU = [31, 45, 90], VERT = [30, 123, 52], ROUGE = [180, 35, 24], GRIS = [102, 112, 133], FOND = [240, 244, 250];
export const LIB_PLATEFORME = { airbnb: 'Airbnb', booking: 'Booking', direct: 'Direct', autre: 'Autre' };

// Les polices du PDF ne connaissent que les lettres latines : on nettoie le texte
const txt = (s) => String(s ?? '').normalize('NFC').replace(/[\u202f\u00a0]/g, ' ').replace(/[\u2212\u2013\u2014]/g, '-')
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, '...').replace(/[^\x20-\xFF\u20AC\n]/g, '').trim();
const eur = (v) => txt(eurBrut(v));
const dateFr = (iso) => iso.split('-').reverse().join('/');
export const estReservation = (o) => o.sens === 'recette' && Boolean(o.plateforme || o.voyageur || o.ref_resa || Number(o.frais_plateforme) > 0);

export function construirePdfProjet({ projet, participants, ops, periode, famille, profil }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, M = 16, W = L - 2 * M;
  const nomP = (id) => txt(participants.find((p) => p.id === id)?.nom || '?');
  const toutes = ops.filter((o) => !o.archive);
  const po = periode ? toutes.filter((o) => dansPeriode(o, periode)) : toutes;
  const b = bilanProjet(po, participants);
  const bt = bilanProjet(toutes, participants);
  const moi = participants.find((p) => (p.type === 'famille' && p.famille_id === profil?.famille_id) || (p.type === 'personne' && p.profil_id === profil?.id));
  let y = 0;

  // ---------- En-tête ----------
  doc.setFillColor(...BLEU); doc.rect(0, 0, L, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('BILAN DU PROJET', M, 12);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text(txt(projet.nom), M, 23);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(txt(periode ? `${periode.label} (du ${dateFr(periode.debut)} au ${dateFr(periode.fin)})` : 'Depuis le début du projet'), M, 31);
  y = 47;
  doc.setTextColor(...GRIS); doc.setFontSize(10);
  const qui = participants.map((p) => `${txt(p.nom)}${p.type === 'compte' ? ' (compte commun)' : ''}`).join(', ');
  doc.text(doc.splitTextToSize(`Participants : ${qui}`, W), M, y); y += 9;

  // ---------- Gros chiffres ----------
  const tuiles = projet.type === 'location' || b.nbResa
    ? [['Facturé', b.facture, BLEU], ['Frais plateformes', -b.fraisP, ROUGE], ['Autres dépenses', -b.autresDepenses, ROUGE], ['Résultat', b.resultat, b.resultat >= 0 ? VERT : ROUGE]]
    : [['Recettes', b.facture, BLEU], ['Dépenses', -b.autresDepenses, ROUGE], ['Résultat', b.resultat, b.resultat >= 0 ? VERT : ROUGE]];
  const tw = (W - (tuiles.length - 1) * 4) / tuiles.length;
  tuiles.forEach(([lib, v, c], i) => {
    const x = M + i * (tw + 4);
    doc.setFillColor(...FOND); doc.roundedRect(x, y, tw, 22, 3, 3, 'F');
    doc.setTextColor(...GRIS); doc.setFontSize(9); doc.text(txt(lib), x + 4, y + 7);
    doc.setTextColor(...c); doc.setFont('helvetica', 'bold'); doc.setFontSize(tuiles.length > 3 ? 13 : 15); doc.text(eur(v), x + 4, y + 17);
    doc.setFont('helvetica', 'normal');
  });
  y += 31;

  // ---------- En quelques mots ----------
  const phrases = [];
  if (b.nbResa) phrases.push(`Sur cette période, il y a eu ${b.nbResa} réservation${b.nbResa > 1 ? 's' : ''}, pour ${eur(b.facture)} facturés.`);
  else if (b.facture) phrases.push(`Sur cette période, le projet a reçu ${eur(b.facture)}.`);
  if (b.fraisP) phrases.push(`Les plateformes ont pris ${eur(b.fraisP)} de frais : le net reçu est de ${eur(b.netRecu)}.`);
  if (b.autresDepenses) phrases.push(`Les autres dépenses s'élèvent à ${eur(b.autresDepenses)}.`);
  if (!b.nb) phrases.push('Aucune opération sur cette période.');
  else phrases.push(b.resultat >= 0 ? `Il reste un bénéfice de ${eur(b.resultat)}.` : `Le projet a coûté ${eur(-b.resultat)} sur cette période.`);
  if (b.versements) phrases.push(`${eur(b.versements)} ont été versés entre les participants.`);
  doc.setTextColor(30, 30, 30); doc.setFontSize(12);
  doc.setFont('helvetica', 'bold'); doc.text('En quelques mots', M, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  for (const p of phrases) { const l = doc.splitTextToSize(txt(p), W); doc.text(l, M, y); y += l.length * 5.6; }
  y += 3;

  // ---------- Qui doit combien ----------
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Qui doit combien (depuis le début du projet)', M, y); y += 7;
  doc.setFontSize(11);
  if (!bt.virements.length) { doc.setTextColor(...VERT); doc.text('Tout le monde est à égalité.', M, y); y += 6; }
  for (const v of bt.virements) {
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal');
    const phrase = `${nomP(v.de)} doit ${eur(v.montant)} à ${nomP(v.a)}.`;
    doc.text(phrase, M, y); y += 6;
  }
  if (moi && participants.length > 1) {
    const s = bt.par[moi.id]?.solde || 0;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...(s > 0.004 ? VERT : s < -0.004 ? ROUGE : GRIS));
    doc.text(txt(s > 0.004 ? `Pour vous : on vous doit ${eur(s)}.` : s < -0.004 ? `Pour vous : vous devez ${eur(-s)}.` : 'Pour vous : vous êtes à égalité.'), M, y); y += 6;
  }
  doc.setFont('helvetica', 'normal'); y += 4;

  // ---------- Tableaux ----------
  const tableau = (titre, head, body, opts = {}) => {
    if (!body.length) return;
    if (y > 250) { doc.addPage(); y = 18; }
    doc.setTextColor(...BLEU); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(txt(titre), M, y); y += 3;
    autoTable(doc, {
      startY: y, head: [head.map(txt)], body: body.map((r) => r.map((c) => (typeof c === 'string' ? txt(c) : c))),
      margin: { left: M, right: M }, theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: [30, 30, 30] },
      headStyles: { fillColor: BLEU, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      footStyles: { fillColor: [226, 240, 210], textColor: [20, 20, 20], fontStyle: 'bold' },
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 9;
  };
  const droite = (cols) => Object.fromEntries(cols.map((c) => [c, { halign: 'right' }]));
  const tri = (a, c) => a.date_op.localeCompare(c.date_op);
  const partsTxt = (o) => (o.parts || []).map((x) => `${nomP(x.participant_id)}${(o.parts || []).length > 1 ? ' ' + eur(x.montant) : ''}`).join(', ');

  if (participants.length > 1) {
    tableau('Par participant', ['Participant', 'A payé', 'A reçu', 'Part', 'Solde (depuis le début)'],
      participants.map((p) => [`${txt(p.nom)}${p.type === 'compte' ? ' (compte)' : ''}${moi?.id === p.id ? ' (vous)' : ''}`, eur(b.par[p.id].paye), eur(b.par[p.id].recu),
        p.type === 'compte' ? '-' : `${Math.round(b.par[p.id].quote * 100)} %`, p.type === 'compte' ? '-' : eur(bt.par[p.id].solde)]),
      { columnStyles: droite([1, 2, 3, 4]) });
  }
  const resas = po.filter(estReservation).sort(tri);
  tableau('Réservations', ['Date', 'Voyageur', 'Réf.', 'Plateforme', 'Facturé', 'Frais', 'Net reçu', 'Options', 'Reçu par', 'Fact. IVA'],
    resas.map((o) => [dateCourte(o.date_op), o.voyageur || '', o.ref_resa || '', LIB_PLATEFORME[o.plateforme] || '', eur(o.montant), eur(o.frais_plateforme || 0),
      eur(Number(o.montant) - (Number(o.frais_plateforme) || 0)), optionsTotal(o.options) ? eur(optionsTotal(o.options)) : '', partsTxt(o), o.facture_iva ? 'oui' : 'NON']),
    { columnStyles: droite([4, 5, 6, 7]), foot: [['Total', '', '', '', eur(b.facture - po.filter((o) => o.sens === 'recette' && !estReservation(o)).reduce((s, o) => s + Number(o.montant), 0)), eur(b.fraisP), '', '', '', '']] });
  const autresRec = po.filter((o) => o.sens === 'recette' && !estReservation(o)).sort(tri);
  tableau('Autres recettes', ['Date', 'Motif', 'Description', 'Reçu par', 'Montant'],
    autresRec.map((o) => [dateCourte(o.date_op), o.categorie, o.libelle, partsTxt(o), eur(o.montant)]),
    { columnStyles: droite([4]), foot: [['Total', '', '', '', eur(autresRec.reduce((s, o) => s + Number(o.montant), 0))]] });
  const deps = po.filter((o) => o.sens === 'depense').sort(tri);
  const fraisLignes = resas.filter((o) => Number(o.frais_plateforme) > 0).map((o) => [dateCourte(o.date_op), 'Frais plateforme', `${LIB_PLATEFORME[o.plateforme] || ''} - ${o.voyageur || ''}`, 'déduit du versement', eur(o.frais_plateforme)]);
  tableau('Dépenses', ['Date', 'Motif', 'Description', 'Payé par', 'Montant'],
    [...deps.map((o) => [dateCourte(o.date_op), o.categorie, o.libelle, partsTxt(o), eur(o.montant)]), ...fraisLignes],
    { columnStyles: droite([4]), foot: [['Total', '', '', '', eur(b.depenses)]] });
  const vers = po.filter((o) => o.sens === 'versement').sort(tri);
  tableau('Versements entre participants', ['Date', 'De', 'À', 'Description', 'Montant'],
    vers.map((o) => [dateCourte(o.date_op), nomP(o.de_participant), nomP(o.vers_participant), o.libelle, eur(o.montant)]), { columnStyles: droite([4]) });

  // ---------- Pied de page ----------
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal');
    doc.text(txt(`${famille?.nom ? famille.nom + ' - ' : ''}Budget Famille - exporté le ${new Date().toLocaleDateString('fr-FR')}`), M, 290);
    doc.text(`page ${i} / ${n}`, L - M, 290, { align: 'right' });
  }
  return doc;
}

export function nomPdf(projet, periode) {
  const propre = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `bilan-${propre(projet.nom)}-${periode ? propre(periode.label) : 'depuis-le-debut'}.pdf`;
}
