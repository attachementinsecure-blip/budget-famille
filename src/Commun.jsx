import { useState } from 'react';
import { Plus, ArrowRight } from 'lucide-react';
import { useApp, useOperations } from './contexte.jsx';
import { NavPeriode, Tabs } from './ui.jsx';
import ListeOps from './ListeOps.jsx';
import { periodeMois, decaler, eur } from './format.js';
import { equilibre, partDe } from './calculs.js';

export default function Commun({ ouvrir }) {
  const { profil, membres, famille } = useApp();
  const [ref, setRef] = useState(new Date());
  const [filtre, setFiltre] = useState('tout');
  const p = periodeMois(ref);
  const { ops } = useOperations(p.debut, p.fin);
  const enfants = famille?.enfants || [];
  const communs = ops.filter((o) => o.espace === 'commun');
  const dep = communs.filter((o) => o.sens === 'depense');
  const totalDe = (arr) => arr.reduce((s, o) => s + Number(o.montant), 0);
  const total = totalDe(dep);
  const maPart = dep.reduce((s, o) => s + partDe(o, profil.id), 0);
  const { virements } = equilibre(communs, membres);
  const nom = (id) => membres.find((m) => m.id === id)?.prenom || '?';
  const visibles = filtre === 'tout' ? communs : filtre === 'foyer' ? communs.filter((o) => !o.pour) : communs.filter((o) => o.pour === filtre);

  return (
    <div className="page">
      <section className="bandeau">
        <NavPeriode label={p.label} onPrec={() => setRef(decaler(ref, 'mois', -1))} onSuiv={() => setRef(decaler(ref, 'mois', 1))} />
        <p className="bandeau-label">Dépenses communes du foyer</p>
        <p className="bandeau-chiffre">{eur(total)}</p>
        {!famille?.couple_commun && <p className="bandeau-sous">Ma part : {eur(maPart)}</p>}
      </section>

      {enfants.length > 0 && (
        <div className="tuiles">
          <button className={`tuile tuile-bouton ${filtre === 'foyer' ? 'choisie' : ''}`} onClick={() => setFiltre(filtre === 'foyer' ? 'tout' : 'foyer')}>
            <span className="tuile-label">Le foyer</span><span className="tuile-valeur">{eur(totalDe(dep.filter((o) => !o.pour)))}</span>
          </button>
          {enfants.map((e) => (
            <button key={e} className={`tuile tuile-bouton ${filtre === e ? 'choisie' : ''}`} onClick={() => setFiltre(filtre === e ? 'tout' : e)}>
              <span className="tuile-label">Pour {e}</span><span className="tuile-valeur">{eur(totalDe(dep.filter((o) => o.pour === e)))}</span>
            </button>
          ))}
        </div>
      )}

      <button className="btn btn-primaire btn-grand btn-plein" onClick={() => ouvrir({ espace: 'commun', sens: 'depense', ...(enfants.includes(filtre) ? { pour: filtre } : {}) })}>
        <Plus size={22} /> {enfants.includes(filtre) ? `Dépense pour ${filtre}` : 'Dépense commune'}
      </button>

      {!famille?.couple_commun && virements.length > 0 && <>
        <h3 className="titre-section">Pour être à égalité</h3>
        <div className="carte">{virements.map((v, i) => (
          <p key={i} className="virement"><strong>{nom(v.de)}</strong> <ArrowRight size={16} /> <strong>{nom(v.a)}</strong><span>{eur(v.montant)}</span></p>
        ))}</div>
        <p className="texte-doux petit">Seules les dépenses payées par une personne (pas par le compte commun) comptent ici.</p>
      </>}

      <h3 className="titre-section">{filtre === 'tout' ? 'Toutes les dépenses communes' : filtre === 'foyer' ? 'Dépenses du foyer' : `Dépenses pour ${filtre}`}</h3>
      {enfants.length > 0 && <Tabs valeur={filtre} onChange={setFiltre} options={[['tout', 'Tout'], ['foyer', 'Foyer'], ...enfants.map((e) => [e, e])]} />}
      <ListeOps ops={visibles} onOuvrir={ouvrir} montrerPayeur vide={filtre === 'tout' ? 'Aucune dépense commune ce mois-ci. Les courses, le loyer ou l\'électricité vont ici.' : 'Rien ici ce mois-ci.'} />
    </div>
  );
}
