import { useState } from 'react';
import { Plus, ArrowDownCircle, Download, Copy, FileUp } from 'lucide-react';
import { useApp, useOperations } from './contexte.jsx';
import { NavPeriode, Tuile, useFlash } from './ui.jsx';
import ListeOps from './ListeOps.jsx';
import { periodeMois, decaler, eur, AVEC_IVA } from './format.js';
import { bilanPro } from './calculs.js';

const csvCellule = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const nombreCsv = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');

export default function Pro({ ouvrir }) {
  const { activites, toutesActivites, membres, aller } = useApp();
  const flash = useFlash();
  const [ref, setRef] = useState(new Date());
  const [act, setAct] = useState('');
  const p = periodeMois(ref);
  const { ops } = useOperations(p.debut, p.fin);
  const b = bilanPro(ops, p, act || null);
  const nomAct = (id) => toutesActivites.find((a) => a.id === id)?.nom || '';

  function exporter() {
    const tete = AVEC_IVA
      ? ['Date', 'Activité', 'Type', 'Motif', 'Description', 'Client/Fournisseur', 'NIF', 'TTC', 'Taux IVA', 'IVA', 'HT', 'Payé en', 'Justificatif']
      : ['Date', 'Activité', 'Type', 'Motif', 'Description', 'Client/Fournisseur', 'Montant', 'Payé en', 'Justificatif'];
    const lignes = [...b.ops].sort((x, y) => x.date_op.localeCompare(y.date_op)).map((o) => [
      o.date_op, nomAct(o.activite_id), o.sens === 'rentree' ? 'Recette' : 'Frais', o.categorie, o.libelle, o.fournisseur,
      ...(AVEC_IVA ? [o.nif, nombreCsv(o.montant), o.iva_taux ?? '', nombreCsv(o.iva_montant), nombreCsv(o.montant - (o.iva_montant || 0))] : [nombreCsv(o.montant)]),
      o.moyen === 'especes' ? 'Espèces' : o.moyen === 'virement' ? 'Virement' : o.moyen === 'carte' ? 'Carte' : '', o.justificatif ? 'oui' : 'NON',
    ]);
    const csv = '\uFEFF' + [tete, ...lignes].map((l) => l.map(csvCellule).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `pro-${p.debut.slice(0, 7)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    flash('Fichier téléchargé.');
  }

  async function copierCompteRendu() {
    const t = [
      `Compte rendu pro — ${p.label}${act ? ' — ' + nomAct(act) : ''}`,
      '',
      `Recettes : ${eur(b.recettes)}`,
      `Commissions des plateformes : ${eur(b.commissions)}`,
      `Autres frais : ${eur(b.frais)}`,
      ...(AVEC_IVA ? [`IVA collectée : ${eur(b.ivaCollectee)}`, `IVA déductible : ${eur(b.ivaDeductible)}`, `IVA à reverser : ${eur(b.ivaAPayer)}`, `Résultat hors IVA : ${eur(b.resultatHT)}`] : [`Résultat : ${eur(b.resultatHT)}`]),
      '',
      `${b.ops.length} opération(s), dont ${b.sansJustif.length} sans justificatif.`,
      ...b.sansJustif.map((o) => `  - ${o.date_op} ${o.libelle || o.categorie} ${eur(o.montant)}`),
      '',
      `Préparé par ${membres.map((m) => m.prenom).join(' et ')} avec Budget Famille. À vérifier avec le contabilista.`,
    ].join('\n');
    try { await navigator.clipboard.writeText(t); flash('Compte rendu copié. Collez-le dans un e-mail.'); }
    catch { flash('Copie impossible sur cet appareil.', 'erreur'); }
  }

  return (
    <div className="page">
      <section className="bandeau">
        <NavPeriode label={p.label} onPrec={() => setRef(decaler(ref, 'mois', -1))} onSuiv={() => setRef(decaler(ref, 'mois', 1))} />
        <p className="bandeau-label">{AVEC_IVA ? 'Résultat hors IVA' : 'Résultat du mois'}</p>
        <p className="bandeau-chiffre">{eur(b.resultatHT)}</p>
        {activites.length > 1 && (
          <select className="select-bandeau" value={act} onChange={(e) => setAct(e.target.value)}>
            <option value="">Toutes les activités</option>
            {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        )}
      </section>

      <div className="actions2">
        <button className="btn btn-primaire btn-grand" onClick={() => ouvrir({ espace: 'pro', sens: 'rentree', activite_id: act || undefined })}><ArrowDownCircle size={22} /> Recette</button>
        <button className="btn btn-second btn-grand" onClick={() => ouvrir({ espace: 'pro', sens: 'depense', activite_id: act || undefined })}><Plus size={22} /> Frais</button>
      </div>

      <button className="btn btn-second btn-plein" onClick={() => aller('releve')}><FileUp size={18} /> Importer un relevé bancaire</button>

      <div className="tuiles">
        <Tuile label="Recettes" valeur={eur(b.recettes)} ton="succes" />
        <Tuile label="Commissions" valeur={eur(b.commissions)} ton="encours" />
        <Tuile label="Autres frais" valeur={eur(b.frais)} ton="encours" />
        {AVEC_IVA ? <Tuile label="IVA à reverser" valeur={eur(b.ivaAPayer)} ton="info" sous={`${eur(b.ivaCollectee)} collectée, ${eur(b.ivaDeductible)} déductible`} />
          : <Tuile label="Résultat" valeur={eur(b.resultatHT)} ton={b.resultatHT >= 0 ? 'succes' : 'erreur'} />}
      </div>

      {b.sansJustif.length > 0 && (
        <p className="point ton-alerte">{b.sansJustif.length} opération(s) sans justificatif. Ajoutez la photo ou le PDF de la facture.</p>
      )}

      <div className="actions2">
        <button className="btn btn-second" onClick={exporter} disabled={!b.ops.length}><Download size={18} /> Exporter (Excel)</button>
        <button className="btn btn-second" onClick={copierCompteRendu}><Copy size={18} /> Copier le compte rendu</button>
      </div>

      <h3 className="titre-section">Opérations du mois</h3>
      <ListeOps ops={b.ops} onOuvrir={ouvrir} vide="Aucune opération pro ce mois-ci. Pour Airbnb, notez le montant brut de la réservation en recette, et la commission en frais." />
      <p className="texte-doux petit note">Astuce Airbnb : notez le prix total payé par le voyageur en recette, puis la commission Airbnb en frais « Commission plateforme ». Le versement reçu sur le compte est la différence.</p>
    </div>
  );
}
