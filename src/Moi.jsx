import { useState } from 'react';
import { Plus, ArrowDownCircle } from 'lucide-react';
import { useApp, useOperations } from './contexte.jsx';
import { NavPeriode, Progress } from './ui.jsx';
import ListeOps from './ListeOps.jsx';
import { periodeMois, decaler, eur } from './format.js';
import { fichePersonne } from './calculs.js';

export default function Moi({ ouvrir }) {
  const { profil } = useApp();
  const [ref, setRef] = useState(new Date());
  const p = periodeMois(ref);
  const { ops } = useOperations(p.debut, p.fin);
  const fiche = fichePersonne(ops, profil.id, p);
  const mesOps = ops.filter((o) => o.espace === 'perso' && o.proprietaire === profil.id);

  return (
    <div className="page">
      <section className="bandeau">
        <NavPeriode label={p.label} onPrec={() => setRef(decaler(ref, 'mois', -1))} onSuiv={() => setRef(decaler(ref, 'mois', 1))} />
        <p className="bandeau-label">Mes dépenses ce mois</p>
        <p className="bandeau-chiffre">{eur(fiche.total)}</p>
        <Progress parts={[{ valeur: fiche.depensesPerso, couleur: 'var(--encours)' }, { valeur: fiche.partCommune, couleur: 'var(--info)' }]} />
        <div className="legende">
          <span><i style={{ background: 'var(--encours)' }} />Perso {eur(fiche.depensesPerso)}</span>
          <span><i style={{ background: 'var(--info)' }} />Ma part commune {eur(fiche.partCommune)}</span>
          <span><i style={{ background: 'var(--succes)' }} />Rentrées {eur(fiche.rentrees)}</span>
        </div>
      </section>

      <div className="actions2">
        <button className="btn btn-primaire btn-grand" onClick={() => ouvrir({ espace: 'perso', sens: 'depense' })}><Plus size={22} /> Dépense</button>
        <button className="btn btn-second btn-grand" onClick={() => ouvrir({ espace: 'perso', sens: 'rentree' })}><ArrowDownCircle size={22} /> Rentrée</button>
      </div>

      <h3 className="titre-section">Mes dépenses et rentrées perso</h3>
      <ListeOps ops={mesOps} onOuvrir={ouvrir} vide="Rien ce mois-ci. Touchez « Dépense » pour commencer." />
    </div>
  );
}
