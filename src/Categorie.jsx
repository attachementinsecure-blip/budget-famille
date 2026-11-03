import { useState } from 'react';
import { useApp } from './contexte.jsx';
import { categoriesPour } from './format.js';

const LIBRE = '__libre';

// Liste des catégories + les motifs déjà écrits par la famille + « écrire un autre motif »
export default function ChoixCategorie({ espace, sens, valeur, onChange, ariaLabel, compact }) {
  const { motifsPerso = [] } = useApp() || {};
  const base = categoriesPour(espace, sens);
  const perso = motifsPerso.filter((m) => !base.includes(m));
  const connu = base.includes(valeur) || perso.includes(valeur);
  const [libre, setLibre] = useState(!connu && Boolean(valeur));
  if (libre) {
    return (
      <div className="cat-libre">
        <input autoFocus={!compact} value={valeur || ''} placeholder="Écrivez le motif" aria-label={ariaLabel || 'Motif'} maxLength={40}
          onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="lien" onClick={() => { setLibre(false); onChange(base[0]); }}>Liste</button>
      </div>
    );
  }
  return (
    <select aria-label={ariaLabel || 'Catégorie'} value={connu ? valeur : base[0]} onChange={(e) => {
      if (e.target.value === LIBRE) { setLibre(true); onChange(''); } else onChange(e.target.value);
    }}>
      {base.map((c) => <option key={c}>{c}</option>)}
      {perso.length > 0 && <optgroup label="Vos motifs">{perso.map((c) => <option key={c}>{c}</option>)}</optgroup>}
      <option value={LIBRE}>✏️ Écrire un autre motif…</option>
    </select>
  );
}
