import { useEffect, useState } from 'react';
import { useApp } from './contexte.jsx';
import { supabase, messageClair } from './api.js';
import { Vide } from './ui.jsx';
import { dateHeure, eur, LIB_CHAMPS, LIB_ESPACE, LIB_ROLE } from './format.js';

const QUOI = { operations: 'opération', fixes: 'charge fixe', profils: 'membre', activites: 'activité', projets: 'projet', projet_participants: 'participant', projet_operations: 'opération de projet' };
const IGNORES = new Set(['id', 'cree_le', 'modifie_le', 'cree_par', 'mois_fixe', 'fixe_id', 'proprietaire']);

function valeurLisible(k, v, nom) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'montant' || k === 'iva_montant') return eur(v);
  if (k === 'espace') return LIB_ESPACE[v] || v;
  if (k === 'role') return LIB_ROLE[v] || v;
  if (k === 'paye_par') return nom(v);
  if (k === 'partage') return (v || []).map(nom).join(', ');
  if (k === 'justificatif') return 'fichier';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  return String(v);
}

export function decrire(h, nom) {
  const ligne = h.apres || h.avant || {};
  const titre = ligne.libelle || ligne.prenom || ligne.nom || ligne.categorie || QUOI[h.table_nom];
  if (h.action === 'INSERT') return { texte: `a ajouté ${QUOI[h.table_nom] || h.table_nom} « ${titre} »${ligne.montant ? ' de ' + eur(ligne.montant) : ''}`, details: [] };
  if (h.action === 'DELETE') return { texte: `a supprimé « ${titre} »`, details: [] };
  if (h.apres?.archive && !h.avant?.archive) return { texte: `a archivé « ${titre} »`, details: [] };
  if (h.table_nom === 'fixes' && h.avant?.actif && !h.apres?.actif) return { texte: `a arrêté la charge fixe « ${titre} »`, details: [] };
  const details = Object.keys(h.apres || {}).filter((k) => !IGNORES.has(k) && JSON.stringify(h.avant?.[k]) !== JSON.stringify(h.apres[k]))
    .map((k) => `${LIB_CHAMPS[k] || k} : ${valeurLisible(k, h.avant?.[k], nom)} → ${valeurLisible(k, h.apres[k], nom)}`);
  return { texte: `a modifié « ${titre} »`, details };
}

export default function Historique() {
  const { tousMembres } = useApp();
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState(null);
  const nom = (id) => tousMembres.find((m) => m.id === id)?.prenom || 'Quelqu\'un';
  useEffect(() => {
    supabase.from('historique').select('*').order('quand', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) setErreur(messageClair(error)); setLignes(data || []); });
  }, []);
  return (
    <div className="page">
      <h2 className="titre-page">Historique</h2>
      <p className="texte-doux petit">Chaque ajout ou modification est noté ici. Rien ne peut être effacé.</p>
      {erreur && <p className="point ton-alerte">{erreur}</p>}
      {lignes === null ? <Vide>Chargement…</Vide> : lignes.length === 0 ? <Vide>Aucune modification pour l'instant.</Vide> : (
        <ul className="liste histo">
          {lignes.map((h) => {
            const d = decrire(h, nom);
            if (!d.details.length && d.texte.startsWith('a modifié')) return null;
            return (
              <li key={h.id} className="histo-ligne">
                <p><strong>{nom(h.auteur)}</strong> {d.texte}</p>
                {d.details.map((x, i) => <p key={i} className="histo-detail">{x}</p>)}
                <small>{dateHeure(h.quand)}</small>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
