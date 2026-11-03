import { Paperclip, CloudOff, Repeat } from 'lucide-react';
import { eur, dateCourte } from './format.js';
import { useApp } from './contexte.jsx';
import { Vide } from './ui.jsx';

export default function ListeOps({ ops, onOuvrir, vide, montrerPayeur }) {
  const { membres } = useApp();
  const nom = (id) => membres.find((m) => m.id === id)?.prenom || '—';
  if (!ops.length) return <Vide>{vide}</Vide>;
  return (
    <ul className="liste">
      {ops.map((o) => (
        <li key={o.id}>
          <button className="ligne" onClick={() => onOuvrir(o)}>
            <span className="ligne-date">{dateCourte(o.date_op)}</span>
            <span className="ligne-texte">
              <strong>{o.libelle || o.categorie}</strong>
              <small>
                {o.libelle ? o.categorie : ''}
                {montrerPayeur && o.paye_par ? `${o.libelle ? ' · ' : ''}payé par ${nom(o.paye_par)}` : ''}
              </small>
            </span>
            <span className="ligne-icones">
              {o.fixe_id && <Repeat size={14} aria-label="Charge fixe" />}
              {o.justificatif && <Paperclip size={14} aria-label="Justificatif" />}
              {o._attente && <CloudOff size={14} aria-label="En attente d'envoi" />}
            </span>
            <span className={`ligne-montant ${o.sens === 'rentree' ? 'positif' : ''}`}>
              {o.sens === 'rentree' ? '+' : '−'}{eur(o.montant)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
