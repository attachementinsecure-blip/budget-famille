// Bilan Excel détaillé, mis en forme : une feuille « Bilan » + une feuille par secteur, activité et projet
import XLSX from 'xlsx-js-style';
import { parseIso, moisDe, dansPeriode, arrondi, LIB_MOYEN } from './format.js';
import { fichePersonne, bilanPro, reservationsDe, partDe, porteur, mouvementEspeces, bilanProjet, optionsTotal } from './calculs.js';

const LIB_PLAT = { airbnb: 'Airbnb', booking: 'Booking', direct: 'Direct', autre: 'Autre' };
const estResa = (o) => o.sens === 'recette' && Boolean(o.plateforme || o.voyageur || o.ref_resa || Number(o.frais_plateforme) > 0);

export const SECTEURS = [
  ['perso', 'Perso'], ['commun', 'Commun'], ['especes', 'Espèces'], ['projets', 'Projets'],
];

// ---------- Styles ----------
const BLEU = '1F2D5A', BLEU_CLAIR = 'E8EEF9', VERT = '1E7B34', ROUGE = 'B42318', GRIS = '667085';
const EUR = '#,##0.00 "€";-#,##0.00 "€"';
const fin = { style: 'thin', color: { rgb: 'C9D3E6' } };
const ST = {
  titre: { font: { bold: true, sz: 18, color: { rgb: BLEU } } },
  sous: { font: { sz: 11, color: { rgb: GRIS } } },
  section: { font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: BLEU } } },
  entete: { font: { bold: true, color: { rgb: BLEU } }, fill: { fgColor: { rgb: BLEU_CLAIR } }, border: { bottom: fin }, alignment: { wrapText: true, vertical: 'center' } },
  texte: { border: { bottom: { style: 'hair', color: { rgb: 'E4E7EC' } } } },
  total: { font: { bold: true }, fill: { fgColor: { rgb: 'F2F7E6' } }, border: { top: { style: 'thin', color: { rgb: BLEU } } } },
  note: { font: { italic: true, sz: 10, color: { rgb: GRIS } } },
};

// ---------- Cellules ----------
const t = (v, s = ST.texte) => ({ t: 's', v: v == null ? '' : String(v), s });
const e = (v, s = ST.texte, couleur) => ({ t: 'n', v: arrondi(v || 0), z: EUR, s: { ...s, numFmt: EUR, font: { ...(s.font || {}), ...(couleur ? { color: { rgb: couleur } } : {}) } } });
const eS = (v, s = ST.texte) => e(v, s, v > 0.004 ? VERT : v < -0.004 ? ROUGE : undefined); // solde coloré
const ev = (v, s = ST.texte) => (v ? e(v, s) : t('', s));
const pct = (v, s = ST.texte) => ({ t: 'n', v: Math.round((v || 0) * 1000) / 1000, z: '0.0%', s: { ...s, numFmt: '0.0%' } });
const nb = (v) => ({ t: 'n', v, s: ST.texte });
const d = (iso, s = ST.texte) => ({ t: 'd', v: parseIso(iso), z: 'dd/mm/yyyy', s: { ...s, numFmt: 'dd/mm/yyyy' } });
const col = (i) => XLSX.utils.encode_col(i);

// ---------- Constructeur de feuille ----------
class Feuille {
  constructor(largeurs) { this.rows = []; this.merges = []; this.largeurs = largeurs; }
  get ligne() { return this.rows.length; }
  ajouter(cells = []) { this.rows.push(cells); return this.rows.length; }
  vide() { return this.ajouter([]); }
  titre(texte, sous) { this.ajouter([t(texte, ST.titre)]); for (const x of [].concat(sous || [])) this.ajouter([t(x, ST.sous)]); this.vide(); }
  section(texte, largeur = 6) {
    const r = this.ajouter([t(texte, ST.section), ...Array.from({ length: largeur - 1 }, () => t('', ST.section))]);
    if (largeur > 1) this.merges.push({ s: { r: r - 1, c: 0 }, e: { r: r - 1, c: largeur - 1 } });
  }
  note(texte) { this.ajouter([t(texte, ST.note)]); }
  // Tableau avec en-tête et ligne de total (formules SUM sur les colonnes demandées)
  tableau(entete, lignes, totaux = [], libelleTotal = 'Total') {
    this.ajouter(entete.map((h) => t(h, ST.entete)));
    const debut = this.ligne + 1;
    for (const l of lignes) this.ajouter(l);
    const finL = this.ligne;
    if (lignes.length && totaux.length) {
      const tot = entete.map((_, i) => t(i === 0 ? libelleTotal : '', ST.total));
      for (const c of totaux) {
        const v = lignes.reduce((s, l) => s + (Number(l[c]?.v) || 0), 0);
        tot[c] = { t: 'n', f: `SUM(${col(c)}${debut}:${col(c)}${finL})`, v: arrondi(v), z: EUR, s: { ...ST.total, numFmt: EUR } };
      }
      this.ajouter(tot);
    }
    if (!lignes.length) this.note('Aucune ligne sur cette période.');
    this.vide();
  }
  feuille() {
    const ws = XLSX.utils.aoa_to_sheet(this.rows, { cellDates: true });
    ws['!merges'] = this.merges;
    ws['!cols'] = this.largeurs.map((w) => ({ wch: w }));
    return ws;
  }
}

function nomsFeuilles() {
  const pris = new Set();
  return (n) => {
    const base = String(n).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Feuille';
    let x = base, i = 2;
    while (pris.has(x.toLowerCase())) { const suf = ` (${i++})`; x = base.slice(0, 31 - suf.length) + suf; }
    pris.add(x.toLowerCase());
    return x;
  };
}

const actives = (ops) => ops.filter((o) => !o.archive);
const somme = (arr, f = (x) => Number(x.montant)) => arrondi(arr.reduce((s, x) => s + f(x), 0));
const SANS = '__sans';
const dateFr = (iso) => iso.split('-').reverse().join('/');

export function construireBilan({
  periode, mode, secteurs, ops, projets = [], projetOps = [], projetOpsTout = null, membres, famille,
  activites = [], activitesChoisies = null, projetsChoisis = null, estGestionnaire, profil,
}) {
  const wb = XLSX.utils.book_new();
  const nomF = nomsFeuilles();
  const avec = (s) => secteurs.includes(s);
  const o = actives(ops).filter((x) => dansPeriode(x, periode));
  const nom = (id) => membres.find((m) => m.id === id)?.prenom || '—';
  const nomAct = (id) => (id && id !== SANS ? activites.find((a) => a.id === id)?.nom || 'Activité supprimée' : 'Sans activité');
  const persos = o.filter((x) => x.espace === 'perso' && x.sens !== 'retrait' && (estGestionnaire || x.proprietaire === profil.id));
  const communs = o.filter((x) => x.espace === 'commun');
  const especes = o.filter((x) => mouvementEspeces(x) !== 0 && (estGestionnaire || porteur(x) === profil.id));
  const dep = (arr) => somme(arr.filter((x) => x.sens === 'depense'));
  const ren = (arr) => somme(arr.filter((x) => x.sens === 'rentree' || x.sens === 'recette'));

  // Activités pro retenues : celles choisies, sinon toutes les activités actives + celles qui ont des opérations
  const prosTout = o.filter((x) => x.espace === 'pro');
  const actRetenues = activitesChoisies?.length ? activitesChoisies
    : [...new Set([...activites.filter((a) => !a.archive).map((a) => a.id), ...prosTout.map((x) => x.activite_id || SANS)])];
  const pros = prosTout.filter((x) => actRetenues.includes(x.activite_id || SANS));
  const opsAct = (id) => pros.filter((x) => (x.activite_id || SANS) === id);

  // Projets retenus : ceux choisis, sinon les projets actifs + ceux qui ont bougé sur la période
  const projRetenus = projets.filter((p) => (projetsChoisis?.length ? projetsChoisis.includes(p.id)
    : !p.archive || projetOps.some((x) => x.projet_id === p.id && !x.archive && dansPeriode(x, periode))));
  const pOps = actives(projetOps).filter((x) => dansPeriode(x, periode) && projRetenus.some((p) => p.id === x.projet_id));
  const pOpsTout = actives(projetOpsTout || projetOps);
  const moi = (parts) => parts.find((p) => (p.type === 'famille' && p.famille_id === profil.famille_id) || (p.type === 'personne' && p.profil_id === profil.id));

  // ================= Feuille « Bilan » =================
  const B = new Feuille([34, 16, 18, 16, 16, 16, 16, 16]);
  B.titre(`Bilan${famille?.nom ? ' — ' + famille.nom : ''}`, [
    `Période : ${periode.label} (du ${dateFr(periode.debut)} au ${dateFr(periode.fin)})`,
    `Secteurs : ${SECTEURS.filter(([k]) => avec(k)).map(([, l]) => l).join(', ')}`,
    `Exporté le ${new Date().toLocaleDateString('fr-FR')} avec Budget Famille`,
  ]);
  let n = 0;
  const num = () => `${++n}. `;

  B.section(num() + 'Synthèse par secteur', 4);
  const syn = [];
  if (avec('perso')) syn.push([t('Perso'), e(dep(persos)), e(ren(persos)), eS(ren(persos) - dep(persos))]);
  if (avec('commun')) syn.push([t('Commun (foyer)'), e(dep(communs)), e(ren(communs)), eS(ren(communs) - dep(communs))]);
  if (avec('pro')) for (const id of actRetenues) { const b = bilanPro(opsAct(id), periode); syn.push([t(`Pro — ${nomAct(id)}`), e(b.commissions + b.frais), e(b.recettes), eS(b.resultatHT)]); }
  if (avec('projets')) for (const p of projRetenus) { const b = bilanProjet(pOps.filter((x) => x.projet_id === p.id), p.projet_participants || []); syn.push([t(`Projet — ${p.nom}`), e(b.depenses), e(b.recettes), eS(b.resultat)]); }
  B.tableau(['Secteur', 'Dépenses', 'Rentrées / recettes', 'Solde'], syn, [1, 2, 3]);
  if (avec('especes')) {
    const s = somme(especes.filter((x) => mouvementEspeces(x) < 0), (x) => -mouvementEspeces(x)), en = somme(especes.filter((x) => mouvementEspeces(x) > 0), mouvementEspeces);
    B.tableau(['Espèces (porte-monnaie)', 'Sorties', 'Entrées (retraits, reçus)', 'Différence'], [[t('Argent liquide'), e(s), e(en), eS(en - s)]]);
    B.note('Les espèces sont à part : les dépenses payées en liquide sont déjà comptées dans leur secteur.');
    B.vide();
  }

  if (avec('pro')) {
    B.section(num() + 'Activités pro', 7);
    B.tableau(['Activité', 'Recettes (total voyageurs)', 'Frais plateformes', 'Autres frais', 'Résultat', 'Réservations', 'Net reçu'],
      actRetenues.map((id) => { const b = bilanPro(opsAct(id), periode); return [t(nomAct(id)), e(b.recettes), e(b.commissions), e(b.frais), eS(b.resultatHT), nb(b.reservations.length), e(b.netRecu)]; }),
      [1, 2, 3, 4, 6]);
    const cats = {};
    for (const x of pros.filter((y) => y.sens === 'depense')) cats[x.categorie] = (cats[x.categorie] || 0) + Number(x.montant);
    const fraisR = somme(pros.filter((x) => x.sens === 'rentree'), (x) => Number(x.frais_plateforme) || 0);
    if (fraisR) cats['Frais plateformes (sur les réservations)'] = (cats['Frais plateformes (sur les réservations)'] || 0) + fraisR;
    const totF = Object.values(cats).reduce((s, v) => s + v, 0);
    B.tableau(['Frais pro par motif', 'Montant', 'Part'], Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => [t(c), e(v), pct(totF ? v / totF : 0)]), [1]);
  }

  if (avec('projets')) {
    B.section(num() + 'Projets', 7);
    B.tableau(['Projet', 'Facturé / recettes', 'Frais plateformes', 'Autres dépenses', 'Résultat', 'Réservations', 'Net reçu'],
      projRetenus.map((p) => { const b = bilanProjet(pOps.filter((x) => x.projet_id === p.id), p.projet_participants || []); return [t(p.nom), e(b.facture), e(b.fraisP), e(b.autresDepenses), eS(b.resultat), nb(b.nbResa), e(b.netRecu)]; }),
      [1, 2, 3, 4, 6]);
    if (!projRetenus.length) { B.note('Aucun projet.'); B.vide(); }
    for (const p of projRetenus) {
      const parts = p.projet_participants || [];
      const bp = bilanProjet(pOps.filter((x) => x.projet_id === p.id), parts);
      const bt = bilanProjet(pOpsTout.filter((x) => x.projet_id === p.id), parts);
      const m = moi(parts);
      B.ajouter([t(p.nom, { font: { bold: true, sz: 12, color: { rgb: BLEU } } })]);
      B.ajouter([t('Résultat sur la période', ST.sous), eS(bp.resultat), t('Depuis le début', ST.sous), eS(bt.resultat), ...(m ? [t('Votre solde', ST.sous), eS(bt.par[m.id]?.solde || 0)] : [])]);
      B.tableau(['Participant', 'A payé (période)', 'A reçu (période)', 'Part du résultat', 'Solde depuis le début'],
        parts.map((x) => [t(x.nom + (m?.id === x.id ? ' (vous)' : '')), e(bp.par[x.id].paye), e(bp.par[x.id].recu), pct(bp.par[x.id].quote), eS(bt.par[x.id].solde)]), [1, 2]);
    }
  }

  if (avec('perso') || avec('commun')) {
    B.section(num() + 'Dépenses du foyer par catégorie', 5);
    const cats = {};
    const ajout = (x, i) => { cats[x.categorie] = cats[x.categorie] || [0, 0]; cats[x.categorie][i] += Number(x.montant); };
    if (avec('perso')) for (const x of persos.filter((y) => y.sens === 'depense')) ajout(x, 0);
    if (avec('commun')) for (const x of communs.filter((y) => y.sens === 'depense')) ajout(x, 1);
    const tot = Object.values(cats).reduce((s, v) => s + v[0] + v[1], 0);
    B.tableau(['Catégorie', 'Perso', 'Commun', 'Total', 'Part'],
      Object.entries(cats).sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1])).map(([c, v]) => [t(c), ev(v[0]), ev(v[1]), e(v[0] + v[1]), pct(tot ? (v[0] + v[1]) / tot : 0)]), [1, 2, 3]);

    B.section(num() + 'Par personne', 6);
    B.tableau(['Personne', 'Dépenses perso', 'Part des dépenses communes', 'A payé pour le foyer', 'Rentrées', 'Total dépensé'],
      (estGestionnaire ? membres : membres.filter((x) => x.id === profil.id)).map((mb) => { const f = fichePersonne(o, mb.id, periode); return [t(mb.prenom), e(f.depensesPerso), e(f.partCommune), e(f.payePourFoyer), e(f.rentrees), e(f.total)]; }),
      [1, 2, 3, 4, 5]);
  }

  if (mode === 'trimestre' || mode === 'annee') {
    const tete = ['Mois'];
    if (avec('perso')) tete.push('Perso dépenses', 'Perso rentrées');
    if (avec('commun')) tete.push('Commun dépenses');
    if (avec('pro')) tete.push('Pro recettes', 'Pro frais', 'Pro résultat');
    if (avec('projets')) tete.push('Projets facturé', 'Projets dépenses', 'Projets résultat');
    if (tete.length > 1) {
      B.section(num() + 'Mois par mois', tete.length);
      const lignes = moisDe(periode).map((pm) => {
        const l = [t(pm.label)];
        if (avec('perso')) { const pp = persos.filter((x) => dansPeriode(x, pm)); l.push(e(dep(pp)), e(ren(pp))); }
        if (avec('commun')) l.push(e(dep(communs.filter((x) => dansPeriode(x, pm)))));
        if (avec('pro')) { const b = bilanPro(pros.filter((x) => dansPeriode(x, pm)), pm); l.push(e(b.recettes), e(b.commissions + b.frais), eS(b.resultatHT)); }
        if (avec('projets')) { const pp = pOps.filter((x) => dansPeriode(x, pm) && x.sens !== 'versement'); const fr = pp.reduce((s, x) => s + (Number(x.frais_plateforme) || 0), 0); l.push(e(ren(pp)), e(dep(pp) + fr), eS(ren(pp) - dep(pp) - fr)); }
        return l;
      });
      B.tableau(tete, lignes, tete.map((_, i) => i).slice(1));
    }
  }
  XLSX.utils.book_append_sheet(wb, B.feuille(), nomF('Bilan'));

  // ================= Feuilles de détail =================
  const detail = (titre, entete, lignes, totaux, largeurs, apres) => {
    const F = new Feuille(largeurs);
    F.titre(titre, `${periode.label}${famille?.nom ? ' — ' + famille.nom : ''}`);
    F.tableau(entete, lignes, totaux);
    if (apres) apres(F);
    return F.feuille();
  };
  const parDate = (a, b) => a.date_op.localeCompare(b.date_op);

  if (avec('perso')) {
    const l = [...persos].sort(parDate).map((x) => [d(x.date_op), t(nom(x.proprietaire)), t(x.sens === 'rentree' ? 'Rentrée' : 'Dépense'), t(x.categorie), t(x.libelle), t(LIB_MOYEN[x.moyen] || ''), ev(x.sens === 'depense' && x.montant), ev(x.sens === 'rentree' && x.montant)]);
    XLSX.utils.book_append_sheet(wb, detail('Dépenses et rentrées perso', ['Date', 'Personne', 'Type', 'Motif', 'Description', 'Payé en', 'Dépense', 'Rentrée'], l, [6, 7], [12, 12, 10, 18, 34, 10, 13, 13]), nomF('Perso'));
  }
  if (avec('commun')) {
    const l = [...communs].sort(parDate).map((x) => [d(x.date_op), t(x.sens === 'rentree' ? 'Rentrée' : 'Dépense'), t(x.categorie), t(x.libelle), t(nom(x.paye_par)), t((x.partage || []).map(nom).join(', ')), t(LIB_MOYEN[x.moyen] || ''), e(x.montant), ...membres.map((m) => ev(x.sens === 'depense' && partDe(x, m.id)))]);
    const tete = ['Date', 'Type', 'Motif', 'Description', 'Payé par', 'Partagé entre', 'Payé en', 'Montant', ...membres.map((m) => `Part ${m.prenom}`)];
    XLSX.utils.book_append_sheet(wb, detail('Dépenses communes du foyer', tete, l, tete.map((_, i) => i).filter((i) => i >= 7), [12, 10, 18, 30, 12, 24, 10, 13, ...membres.map(() => 13)]), nomF('Commun'));
  }
  if (avec('pro')) {
    for (const id of actRetenues) {
      const ao = [...opsAct(id)].sort(parDate);
      const b = bilanPro(ao, periode);
      const l = ao.map((x) => [d(x.date_op), t(x.sens === 'rentree' ? 'Recette' : 'Frais'), t(x.categorie), t(x.libelle), t(x.fournisseur || ''), t(x.voyageur || ''), t(x.ref_resa || ''), t(LIB_MOYEN[x.moyen] || ''),
        ev(x.sens === 'rentree' && x.montant), ev(x.sens === 'rentree' && Number(x.frais_plateforme)), ev(x.sens === 'rentree' && (Number(x.montant) - (Number(x.frais_plateforme) || 0))), ev(x.sens === 'depense' && x.montant), t(x.justificatif ? 'oui' : 'NON')]);
      XLSX.utils.book_append_sheet(wb, detail(`Activité pro : ${nomAct(id)}`, ['Date', 'Type', 'Motif', 'Description', 'Plateforme / fournisseur', 'Voyageur', 'Réf. réservation', 'Payé en', 'Recette (total)', 'Frais plateforme', 'Net reçu', 'Autres frais', 'Justificatif'],
        l, [8, 9, 10, 11], [12, 9, 22, 26, 20, 20, 16, 10, 14, 14, 13, 13, 11], (F) => {
          F.section('Résultat de l\'activité', 2);
          F.ajouter([t('Recettes (total payé par les voyageurs)'), e(b.recettes)]);
          F.ajouter([t('Frais des plateformes'), e(b.commissions)]);
          F.ajouter([t('Autres frais'), e(b.frais)]);
          F.ajouter([t('Résultat', ST.total), eS(b.resultatHT, ST.total)]);
          F.ajouter([t('Net reçu des réservations'), e(b.netRecu)]);
          F.ajouter([t('Réservations'), nb(b.reservations.length)]);
          F.ajouter([t('Opérations sans justificatif'), nb(b.sansJustif.length)]);
        }), nomF(`Pro - ${nomAct(id)}`));
    }
    const resas = reservationsDe(pros);
    XLSX.utils.book_append_sheet(wb, detail('Réservations', ['Date', 'Activité', 'Plateforme / client', 'Voyageur', 'Réf. réservation', 'Montant total', 'Frais plateforme', 'Net reçu', 'Reçu en'],
      resas.map((x) => [d(x.date_op), t(nomAct(x.activite_id)), t(x.fournisseur || x.categorie), t(x.voyageur || ''), t(x.ref_resa || ''), e(x.brut), e(x.fraisP), e(x.net), t(LIB_MOYEN[x.moyen] || '')]),
      [5, 6, 7], [12, 16, 20, 24, 18, 14, 16, 13, 10]), nomF('Réservations'));
  }
  if (avec('especes')) {
    const l = [...especes].sort(parDate).map((x) => { const m = mouvementEspeces(x); return [d(x.date_op), t(nom(porteur(x))), t(x.sens === 'retrait' ? 'Retrait' : x.sens === 'transfert' ? 'Donné' : m > 0 ? 'Reçu' : 'Dépense'), t(x.categorie), t(x.libelle), ev(m > 0 && m), ev(m < 0 && -m)]; });
    XLSX.utils.book_append_sheet(wb, detail('Espèces (porte-monnaie)', ['Date', 'Personne', 'Mouvement', 'Motif', 'Description', 'Entrée', 'Sortie'], l, [5, 6], [12, 12, 11, 18, 32, 13, 13]), nomF('Espèces'));
  }
  if (avec('projets')) {
    const toutesResas = [];
    for (const p of projRetenus) {
      const parts = p.projet_participants || [];
      const po = pOps.filter((x) => x.projet_id === p.id).sort(parDate);
      const bp = bilanProjet(po, parts), bt = bilanProjet(pOpsTout.filter((x) => x.projet_id === p.id), parts);
      const nomPart = (id) => parts.find((x) => x.id === id)?.nom || '?';
      const partsTxt = (x) => (x.parts || []).map((y) => `${nomPart(y.participant_id)}${(x.parts || []).length > 1 ? ' ' + String(y.montant).replace('.', ',') + ' €' : ''}`).join(', ');
      const resas = po.filter(estResa);
      for (const x of resas) toutesResas.push([p, x]);
      const autres = po.filter((x) => !estResa(x) && x.sens !== 'versement');
      const vers = po.filter((x) => x.sens === 'versement');
      const F = new Feuille([12, 22, 16, 12, 13, 13, 13, 13, 18, 11, 11]);
      F.titre(`Projet : ${p.nom}`, [`${periode.label}${famille?.nom ? ' — ' + famille.nom : ''}`, `Participants : ${parts.map((x) => x.nom + (x.type === 'compte' ? ' (compte commun)' : '')).join(', ')}`]);
      F.section('En résumé', 4);
      F.tableau(['', 'Sur la période', 'Depuis le début', ''], [
        [t('Facturé / recettes'), e(bp.facture), e(bt.facture)], [t('Frais des plateformes'), e(bp.fraisP), e(bt.fraisP)],
        [t('Autres dépenses'), e(bp.autresDepenses), e(bt.autresDepenses)], [t('Résultat', ST.total), eS(bp.resultat, ST.total), eS(bt.resultat, ST.total)],
        [t('Net reçu'), e(bp.netRecu), e(bt.netRecu)], [t('Réservations'), nb(bp.nbResa), nb(bt.nbResa)]]);
      if (resas.length || p.type === 'location') {
        F.section('Réservations', 11);
        F.tableau(['Date', 'Voyageur', 'Réf. réservation', 'Plateforme', 'Facture', 'Frais plateforme', 'Net reçu', 'Options', 'Reçu par', 'Facture IVA', 'Arrivée'],
          resas.map((x) => [d(x.date_op), t(x.voyageur || ''), t(x.ref_resa || ''), t(LIB_PLAT[x.plateforme] || ''), e(x.montant), e(Number(x.frais_plateforme) || 0),
            e(Number(x.montant) - (Number(x.frais_plateforme) || 0)), ev(optionsTotal(x.options)), t(partsTxt(x)), t(x.facture_iva ? 'oui' : 'NON'), x.date_arrivee ? d(x.date_arrivee) : t('')]),
          [4, 5, 6, 7]);
        const optLignes = {};
        for (const x of resas) for (const o of x.options || []) { const k = o.nom; optLignes[k] = optLignes[k] || [0, 0, 0]; optLignes[k][0] += Number(o.quantite); optLignes[k][o.sur_place ? 2 : 1] += Number(o.prix) * Number(o.quantite); }
        if (Object.keys(optLignes).length) F.tableau(['Option', 'Quantité', 'Via la plateforme', 'Payé sur place'], Object.entries(optLignes).map(([k, v]) => [t(k), nb(v[0]), e(v[1]), e(v[2])]), [2, 3]);
      }
      F.section('Dépenses et autres recettes', 6);
      F.tableau(['Date', 'Motif', 'Description', 'Payé / reçu par', 'Dépense', 'Recette'],
        [...autres.map((x) => [d(x.date_op), t(x.categorie), t(x.libelle), t(partsTxt(x)), ev(x.sens === 'depense' && x.montant), ev(x.sens === 'recette' && x.montant)]),
          ...resas.filter((x) => Number(x.frais_plateforme) > 0).map((x) => [d(x.date_op), t('Frais plateforme'), t(`${LIB_PLAT[x.plateforme] || ''} ${x.voyageur || ''}`.trim()), t('déduit du versement'), e(x.frais_plateforme), t('')])],
        [4, 5]);
      if (vers.length) {
        F.section('Versements entre participants', 4);
        F.tableau(['Date', 'De', 'À', 'Montant'], vers.map((x) => [d(x.date_op), t(nomPart(x.de_participant)), t(nomPart(x.vers_participant)), e(x.montant)]), [3]);
      }
      if (parts.length > 1) {
        const bilanParts = (b) => parts.map((x) => [t(x.nom + (x.type === 'compte' ? ' (compte)' : '')), e(b.par[x.id].paye), e(b.par[x.id].recu), pct(b.par[x.id].quote), eS(b.par[x.id].part), eS(b.par[x.id].solde)]);
        F.section('Par participant — sur la période', 6);
        F.tableau(['Participant', 'A payé', 'A reçu', 'Part (%)', 'Part du résultat', 'Solde'], bilanParts(bp), [1, 2]);
        F.section('Par participant — depuis le début', 6);
        F.tableau(['Participant', 'A payé', 'A reçu', 'Part (%)', 'Part du résultat', 'Solde'], bilanParts(bt), [1, 2]);
        F.section('Pour être à égalité (depuis le début)', 3);
        if (!bt.virements.length) F.note('Tout le monde est à égalité.');
        for (const v of bt.virements) F.ajouter([t(nomPart(v.de)), t(`doit à ${nomPart(v.a)}`), e(v.montant)]);
        F.vide();
        F.note('Solde positif : on lui doit de l\'argent. Solde négatif : il ou elle doit de l\'argent. L\'argent d\'un compte commun appartient aux associés selon leur part.');
      }
      XLSX.utils.book_append_sheet(wb, F.feuille(), nomF(`Projet - ${p.nom}`));
    }
    if (toutesResas.length && projRetenus.length > 1) {
      XLSX.utils.book_append_sheet(wb, detail('Toutes les réservations', ['Date', 'Projet', 'Plateforme', 'Voyageur', 'Réf. réservation', 'Facture', 'Frais plateforme', 'Net reçu', 'Facture IVA'],
        toutesResas.sort((a, b) => parDate(a[1], b[1])).map(([p, x]) => [d(x.date_op), t(p.nom), t(LIB_PLAT[x.plateforme] || ''), t(x.voyageur || ''), t(x.ref_resa || ''), e(x.montant), e(Number(x.frais_plateforme) || 0), e(Number(x.montant) - (Number(x.frais_plateforme) || 0)), t(x.facture_iva ? 'oui' : 'NON')]),
        [5, 6, 7], [12, 20, 11, 22, 18, 13, 15, 13, 11]), nomF('Réservations'));
    }
  }
  return wb;
}

export function nomFichier(periode, secteurs, precision = '') {
  const s = secteurs.length === SECTEURS.length ? 'tout' : secteurs.join('-');
  const propre = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `bilan-${periode.debut.slice(0, 7)}-${propre(periode.label)}-${s}${precision ? '-' + propre(precision) : ''}.xlsx`;
}
export const telecharger = (wb, fichier) => XLSX.writeFile(wb, fichier, { compression: true });
