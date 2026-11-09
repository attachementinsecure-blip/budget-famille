import { useMemo, useState } from 'react';
import { Archive, Paperclip, Eye, Minus, Plus } from 'lucide-react';
import { useApp } from './contexte.jsx';
import { Modal, Champ, Confirmer, Tabs, useFlash } from './ui.jsx';
import { supabase, messageClair, nouvelId, envoyerJustificatif, lienJustificatif } from './api.js';
import { eur, num, arrondi, aujourdhui } from './format.js';
import { optionsTotal } from './calculs.js';
import { LIB_PLATEFORME } from './pdfbilan.js';
import ChoixCategorie from './Categorie.jsx';

const TITRES = { reservation: 'Réservation', depense: 'Dépense', recette: 'Recette', versement: 'Versement' };
const UNITE = { jour: 'par jour', personne: 'par personne', unite: '', libre: 'prix libre' };
const v = (x) => (x === null || x === undefined ? '' : String(x).replace('.', ','));

// Fichier joint (justificatif ou facture d'IVA)
function PieceJointe({ label, chemin, fichier, setFichier }) {
  const flash = useFlash();
  async function voir() { try { window.open(await lienJustificatif(chemin), '_blank'); } catch (e) { flash(messageClair(e), 'erreur'); } }
  return (
    <Champ label={label}>
      <div className="justif">
        <label className="btn btn-second"><Paperclip size={18} /> {fichier ? fichier.name.slice(0, 22) : chemin ? 'Remplacer' : 'Ajouter'}
          <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFichier(e.target.files?.[0] || null)} />
        </label>
        {chemin && !fichier && <button type="button" className="btn btn-second" onClick={voir}><Eye size={18} /> Voir</button>}
      </div>
    </Champ>
  );
}

// « Payé par » / « Reçu par » : un ou plusieurs participants, avec le montant de chacun
function QuiCombien({ label, participants, qui, setQui, total }) {
  const choisis = Object.keys(qui);
  const plusieurs = choisis.length > 1;
  const reste = arrondi(total - choisis.reduce((s, id) => s + num(qui[id]), 0));
  if (participants.length === 1) return null;
  function basculer(id) { setQui((q) => { const n = { ...q }; if (id in n) delete n[id]; else n[id] = ''; return n; }); }
  function egal() {
    if (!choisis.length || !(total > 0)) return;
    const base = Math.floor((total / choisis.length) * 100) / 100;
    const n = {}; choisis.forEach((id, i) => { n[id] = v(i === 0 ? arrondi(total - base * (choisis.length - 1)) : base); });
    setQui(n);
  }
  return (
    <>
      <Champ groupe label={label} aide={plusieurs ? 'Tapez le montant de chacun.' : 'Touchez plusieurs noms si l\'argent a été partagé.'}>
        <div className="choixpers">
          {participants.map((p) => <button type="button" key={p.id} className={p.id in qui ? 'actif' : ''} aria-pressed={p.id in qui} onClick={() => basculer(p.id)}>{p.nom}</button>)}
        </div>
      </Champ>
      {plusieurs && (
        <div className="carte parts">
          {choisis.map((id) => {
            const n = participants.find((p) => p.id === id)?.nom;
            return <Champ key={id} label={n}><input inputMode="decimal" placeholder="0,00" aria-label={`Montant de ${n}`} value={qui[id]} onChange={(e) => setQui({ ...qui, [id]: e.target.value.replace(/[^0-9,.]/g, '') })} /></Champ>;
          })}
          <div className="parts-pied">
            <span className={Math.abs(reste) > 0.009 ? 'negatif' : 'positif'}>{Math.abs(reste) > 0.009 ? `Reste à répartir : ${eur(reste)}` : 'Tout est réparti ✓'}</span>
            <button type="button" className="btn btn-petit btn-second" onClick={egal}>Parts égales</button>
          </div>
        </div>
      )}
    </>
  );
}

export default function SaisieProjet({ projet, participants, moi, type: typeInitial, initial, onClose }) {
  const { profil, rafraichir } = useApp();
  const flash = useFlash();
  const existant = Boolean(initial);
  const [type, setType] = useState(typeInitial);
  const parDefaut = moi?.id || participants[0]?.id;
  const [f, setF] = useState(() => existant ? {
    ...initial, montant: v(initial.montant), frais_plateforme: v(initial.frais_plateforme),
    net: v(arrondi(Number(initial.montant) - (Number(initial.frais_plateforme) || 0) - optionsTotal(initial.options, true))),
  } : {
    id: nouvelId(), date_op: aujourdhui(), montant: '', libelle: '', categorie: typeInitial === 'recette' ? 'Autre recette' : 'Autre frais',
    plateforme: 'airbnb', voyageur: '', ref_resa: '', date_arrivee: '', date_depart: '', net: '', frais_plateforme: '', options: [],
    de_participant: participants.find((p) => p.id !== parDefaut)?.id || '', vers_participant: parDefaut, justificatif: null, facture_iva: null,
  });
  const [qui, setQui] = useState(() => existant && initial.parts?.length
    ? Object.fromEntries(initial.parts.map((x) => [x.participant_id, v(x.montant)])) : { [parDefaut]: '' });
  const [opts, setOpts] = useState(() => {
    const deja = existant ? initial.options || [] : [];
    const catalogue = (projet.options || []).map((o) => {
      const d = deja.find((x) => x.nom === o.nom);
      return { nom: o.nom, unite: o.unite, prix: v(d ? d.prix : o.prix), quantite: d ? Number(d.quantite) : 0, sur_place: d ? Boolean(d.sur_place) : false };
    });
    return [...catalogue, ...deja.filter((d) => !catalogue.some((c) => c.nom === d.nom)).map((d) => ({ ...d, prix: v(d.prix) }))];
  });
  const [fichier, setFichier] = useState(null);
  const [facture, setFacture] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const maj = (k, x) => setF((y) => ({ ...y, [k]: x }));
  const direct = f.plateforme === 'direct';

  // Réservation : facturé = net versé + frais de la plateforme + options payées sur place
  const optsPropres = opts.filter((o) => Number(o.quantite) > 0).map((o) => ({ nom: o.nom, unite: o.unite, prix: arrondi(num(o.prix)), quantite: Number(o.quantite), sur_place: Boolean(o.sur_place) }));
  const surPlace = optionsTotal(optsPropres, true), viaPlateforme = optionsTotal(optsPropres, false);
  const fraisP = direct ? 0 : arrondi(num(f.frais_plateforme));
  const facture$ = type === 'reservation' ? arrondi(num(f.net) + fraisP + surPlace) : arrondi(num(f.montant));
  const recu = type === 'reservation' ? arrondi(num(f.net) + surPlace) : facture$;
  const nuits = useMemo(() => (f.date_arrivee && f.date_depart ? Math.max(0, Math.round((new Date(f.date_depart) - new Date(f.date_arrivee)) / 86400000)) : 0), [f.date_arrivee, f.date_depart]);

  function changerQuantite(i, delta) {
    setOpts((os) => os.map((o, j) => {
      if (j !== i) return o;
      const q = Math.max(0, Number(o.quantite) + delta);
      return { ...o, quantite: q, sur_place: o.quantite === 0 && q > 0 ? direct : o.sur_place };
    }));
  }

  async function valider() {
    const montant = type === 'reservation' ? facture$ : arrondi(num(f.montant));
    if (!(montant > 0)) return flash(type === 'reservation' ? 'Indiquez le montant net reçu.' : 'Indiquez un montant.', 'erreur');
    let ligne;
    if (type === 'versement') {
      if (!f.de_participant || !f.vers_participant || f.de_participant === f.vers_participant) return flash('Choisissez qui a versé et à qui.', 'erreur');
      ligne = { id: f.id, projet_id: projet.id, sens: 'versement', montant, date_op: f.date_op, categorie: 'Versement', libelle: (f.libelle || '').trim(), de_participant: f.de_participant, vers_participant: f.vers_participant, parts: [] };
    } else {
      const choisis = Object.keys(qui);
      if (!choisis.length) return flash(type === 'depense' ? 'Indiquez qui a payé.' : 'Indiquez qui a reçu l\'argent.', 'erreur');
      const parts = choisis.map((id) => ({ participant_id: id, montant: choisis.length > 1 ? arrondi(num(qui[id])) : recu }));
      if (choisis.length > 1 && Math.abs(parts.reduce((s, x) => s + x.montant, 0) - recu) > 0.009) return flash(`Le total des parts doit faire ${eur(recu)}.`, 'erreur');
      if (type !== 'reservation' && !String(f.categorie || '').trim()) return flash('Choisissez ou écrivez un motif.', 'erreur');
      ligne = {
        id: f.id, projet_id: projet.id, sens: type === 'depense' ? 'depense' : 'recette', montant, date_op: f.date_op, parts, libelle: (f.libelle || '').trim(),
        categorie: type === 'reservation' ? 'Réservation' : String(f.categorie).trim(),
        ...(type === 'reservation' ? {
          plateforme: f.plateforme, voyageur: f.voyageur.trim() || null, ref_resa: f.ref_resa.trim().toUpperCase() || null,
          date_arrivee: f.date_arrivee || null, date_depart: f.date_depart || null, frais_plateforme: fraisP || null, options: optsPropres,
        } : { plateforme: null, voyageur: null, ref_resa: null, frais_plateforme: null, options: [] }),
      };
    }
    setEnvoi(true);
    try {
      if (fichier) ligne.justificatif = await envoyerJustificatif(fichier, 'projet', projet.id);
      if (facture) ligne.facture_iva = await envoyerJustificatif(facture, 'projet', projet.id);
      if (!existant) ligne.cree_par = profil.id;
      const { error } = await supabase.from('projet_operations').upsert(ligne);
      if (error) throw error;
      flash(existant ? 'Modification enregistrée.' : type === 'versement' ? 'Versement ajouté.' : `${TITRES[type]} ajoutée.`); rafraichir(); onClose();
    } catch (e) { flash(messageClair(e), 'erreur'); }
    finally { setEnvoi(false); }
  }
  async function archiver() {
    setConfirm(false);
    const { error } = await supabase.from('projet_operations').update({ archive: true }).eq('id', f.id);
    if (error) return flash(messageClair(error), 'erreur');
    flash('Opération archivée.'); rafraichir(); onClose();
  }

  const types = [...(projet.type === 'location' || type === 'reservation' ? [['reservation', 'Réservation']] : []), ['depense', 'Dépense'], ['recette', 'Recette'], ...(participants.length > 1 ? [['versement', 'Versement']] : [])];
  return (
    <Modal titre={`${existant ? 'Modifier : ' : ''}${TITRES[type]}`} onClose={onClose} pied={<>
      {existant && <button className="btn btn-second" onClick={() => setConfirm(true)}><Archive size={18} /> Archiver</button>}
      <button className="btn btn-primaire" disabled={envoi} onClick={valider}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
    </>}>
      <p className="texte-doux petit">{projet.nom}</p>
      {!existant && types.length > 1 && <Tabs valeur={type} onChange={(t) => { setType(t); maj('categorie', t === 'recette' ? 'Autre recette' : 'Autre frais'); }} options={types} />}

      {type === 'reservation' && <>
        <Champ groupe label="Plateforme">
          <div className="choixpers">{Object.entries(LIB_PLATEFORME).map(([k, l]) => <button type="button" key={k} className={f.plateforme === k ? 'actif' : ''} aria-pressed={f.plateforme === k} onClick={() => maj('plateforme', k)}>{l}</button>)}</div>
        </Champ>
        <div className="grille2">
          <Champ label="Voyageur"><input value={f.voyageur} placeholder="Nom" onChange={(e) => maj('voyageur', e.target.value)} /></Champ>
          <Champ label="Réf. réservation"><input value={f.ref_resa} autoCapitalize="characters" placeholder={direct ? 'Facultatif' : 'Ex. : HMABC123'} onChange={(e) => maj('ref_resa', e.target.value)} /></Champ>
        </div>
        <div className="grille2">
          <Champ label="Arrivée"><input type="date" value={f.date_arrivee || ''} onChange={(e) => { maj('date_arrivee', e.target.value); if (!existant) maj('date_op', e.target.value || aujourdhui()); }} /></Champ>
          <Champ label="Départ" aide={nuits ? `${nuits} nuit${nuits > 1 ? 's' : ''}` : null}><input type="date" value={f.date_depart || ''} onChange={(e) => maj('date_depart', e.target.value)} /></Champ>
        </div>
        <div className="grille2">
          <Champ label={direct ? 'Montant payé par le voyageur (€)' : 'Net versé par la plateforme (€)'}><input className="input-montant petit-montant" inputMode="decimal" placeholder="0,00" value={f.net} onChange={(e) => maj('net', e.target.value.replace(/[^0-9,.]/g, ''))} /></Champ>
          {!direct && <Champ label="Frais de la plateforme (€)"><input className="input-montant petit-montant" inputMode="decimal" placeholder="0,00" value={f.frais_plateforme} onChange={(e) => maj('frais_plateforme', e.target.value.replace(/[^0-9,.]/g, ''))} /></Champ>}
        </div>

        {opts.length > 0 && (
          <Champ groupe label="Options">
            <div className="options-liste">
              {opts.map((o, i) => (
                <div key={o.nom} className={`option ${o.quantite > 0 ? 'active' : ''}`}>
                  <div className="option-haut">
                    <span className="option-nom">{o.nom}</span>
                    <div className="option-qte">
                      <button type="button" className="btn-icone" aria-label={`Moins de ${o.nom}`} onClick={() => changerQuantite(i, -1)}><Minus size={16} /></button>
                      <span aria-label={`Quantité ${o.nom}`}>{o.quantite}</span>
                      <button type="button" className="btn-icone" aria-label={`Plus de ${o.nom}`} onClick={() => changerQuantite(i, 1)}><Plus size={16} /></button>
                    </div>
                  </div>
                  {o.quantite > 0 && (
                    <div className="option-bas">
                      <input inputMode="decimal" aria-label={`Prix ${o.nom}`} value={o.prix} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, prix: e.target.value.replace(/[^0-9,.]/g, '') } : x)))} />
                      <span className="texte-doux petit">{UNITE[o.unite] || ''} = {eur(num(o.prix) * o.quantite)}</span>
                      <div className="mini-choix">
                        <button type="button" className={!o.sur_place ? 'actif' : ''} onClick={() => setOpts(opts.map((x, j) => (j === i ? { ...x, sur_place: false } : x)))}>{direct ? 'Compris' : 'Plateforme'}</button>
                        <button type="button" className={o.sur_place ? 'actif' : ''} onClick={() => setOpts(opts.map((x, j) => (j === i ? { ...x, sur_place: true } : x)))}>Sur place</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Champ>
        )}

        <div className="carte recap-resa">
          {!direct && <p><span>Net versé</span><strong>{eur(num(f.net))}</strong></p>}
          {!direct && <p><span>Frais de la plateforme (dépense)</span><strong className="negatif">{eur(fraisP)}</strong></p>}
          {direct && <p><span>Payé par le voyageur</span><strong>{eur(num(f.net))}</strong></p>}
          {surPlace > 0 && <p><span>Options payées sur place</span><strong>{eur(surPlace)}</strong></p>}
          {viaPlateforme > 0 && <p className="texte-doux petit"><span>dont options comprises dans le versement</span><span>{eur(viaPlateforme)}</span></p>}
          <p className="recap-total"><span>Montant de la facture</span><strong>{eur(facture$)}</strong></p>
          <p className="positif"><span>Rentrée (net reçu)</span><strong>{eur(recu)}</strong></p>
        </div>
        <QuiCombien label="Reçu par" participants={participants} qui={qui} setQui={setQui} total={recu} />
        <PieceJointe label="Facture d'IVA (fatura)" chemin={f.facture_iva} fichier={facture} setFichier={setFacture} />
      </>}

      {type !== 'reservation' && <>
        <Champ label="Montant (€)"><input className="input-montant" inputMode="decimal" placeholder="0,00" autoFocus={!existant} value={f.montant} onChange={(e) => maj('montant', e.target.value.replace(/[^0-9,.]/g, ''))} /></Champ>
        <div className="grille2">
          <Champ label="Date"><input type="date" value={f.date_op} onChange={(e) => maj('date_op', e.target.value)} /></Champ>
          {type !== 'versement' && <Champ label="Motif"><ChoixCategorie key={type} espace="pro" sens={type === 'recette' ? 'rentree' : 'depense'} valeur={f.categorie} onChange={(c) => maj('categorie', c)} /></Champ>}
        </div>
        {type === 'versement' ? <>
          <Champ groupe label="De"><div className="choixpers">{participants.map((p) => <button type="button" key={p.id} className={f.de_participant === p.id ? 'actif' : ''} aria-pressed={f.de_participant === p.id} onClick={() => maj('de_participant', p.id)}>{p.nom}</button>)}</div></Champ>
          <Champ groupe label="À"><div className="choixpers">{participants.map((p) => <button type="button" key={p.id} className={f.vers_participant === p.id ? 'actif' : ''} aria-pressed={f.vers_participant === p.id} onClick={() => maj('vers_participant', p.id)}>{p.nom}</button>)}</div></Champ>
        </> : <QuiCombien label={type === 'recette' ? 'Reçu par' : 'Payé par'} participants={participants} qui={qui} setQui={setQui} total={arrondi(num(f.montant))} />}
      </>}
      {type === 'reservation' && <Champ label="Date du versement"><input type="date" value={f.date_op} onChange={(e) => maj('date_op', e.target.value)} /></Champ>}
      <Champ label={type === 'versement' ? 'Note' : 'Description'}><input value={f.libelle || ''} placeholder={type === 'versement' ? 'Ex. : part de novembre' : type === 'reservation' ? 'Facultatif' : 'Ex. : alvará, notaire, ménage…'} onChange={(e) => maj('libelle', e.target.value)} /></Champ>
      <PieceJointe label="Justificatif (photo ou PDF)" chemin={f.justificatif} fichier={fichier} setFichier={setFichier} />
      {confirm && <Confirmer texte="Archiver cette opération ? Elle ne comptera plus, mais reste dans l'historique." action="Archiver" danger onOui={archiver} onNon={() => setConfirm(false)} />}
    </Modal>
  );
}
