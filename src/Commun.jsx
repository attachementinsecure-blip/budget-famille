import { useState } from 'react';
import { Plus, ArrowRight } from 'lucide-react';
import { useApp, useOperations } from './contexte.jsx';
import { NavPeriode } from './ui.jsx';
import ListeOps from './ListeOps.jsx';
import { periodeMois, decaler, eur } from './format.js';
import { equilibre, partDe } from './calculs.js';

export default function Commun({ ouvrir }) {
  const { profil, membres } = useApp();
  const [ref, setRef] = useState(new Date());
  const p = periodeMois(ref);
  const { ops } = useOperations(p.debut, p.fin);
  const communs = ops.filter((o) => o.espace === 'commun');
  const total = communs.filter((o) => o.sens === 'depense').reduce((s, o) => s + Number(o.montant), 0);
  const maPart = communs.filter((o) => o.sens === 'depense').reduce((s, o) => s + partDe(o, profil.id), 0);
  const { virements } = equilibre(communs, membres);
  const nom = (id) => membres.find((m) => m.id === id)?.prenom || '?';

  return (
    <div className="page">
      <section className="bandeau">
        <NavPeriode label={p.label} onPrec={() => setRef(decaler(ref, 'mois', -1))} onSuiv={() => setRef(decaler(ref, 'mois', 1))} />
        <p className="bandeau-label">Dépenses communes du foyer</p>
        <p className="bandeau-chiffre">{eur(total)}</p>
        <p className="bandeau-sous">Ma part : {eur(maPart)}</p>
      </section>

      <button className="btn btn-primaire btn-grand btn-plein" onClick={() => ouvrir({ espace: 'commun', sens: 'depense' })}><Plus size={22} /> Dépense commune</button>

      <h3 className="titre-section">Pour être à égalité</h3>
      {virements.length === 0
        ? <p className="carte texte-doux">Tout le monde est à égalité ce mois-ci.</p>
        : <div className="carte">{virements.map((v, i) => (
            <p key={i} className="virement"><strong>{nom(v.de)}</strong> <ArrowRight size={16} /> <strong>{nom(v.a)}</strong><span>{eur(v.montant)}</span></p>
          ))}</div>}

      <h3 className="titre-section">Toutes les dépenses communes</h3>
      <ListeOps ops={communs} onOuvrir={ouvrir} montrerPayeur vide="Aucune dépense commune ce mois-ci. Les courses, le loyer ou l'électricité vont ici." />
    </div>
  );
}
