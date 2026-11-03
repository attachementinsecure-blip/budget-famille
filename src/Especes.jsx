import { useEffect, useState } from 'react';
import { Banknote, Minus, Plus, Scale } from 'lucide-react';
import { useApp } from './contexte.jsx';
import { Modal, Champ, Vide, useFlash } from './ui.jsx';
import { supabase, enregistrer, messageClair, nouvelId, local } from './api.js';
import { eur, num, arrondi, aujourdhui, dateCourte } from './format.js';
import { soldeEspeces, mouvementEspeces, porteur } from './calculs.js';

// Tous les mouvements d'espèces visibles (toutes dates : le porte-monnaie est un cumul)
function useMouvementsEspeces() {
  const { rev } = useApp();
  const [ops, setOps] = useState(() => local.get('especes', []));
  useEffect(() => {
    supabase.from('operations').select('*').eq('archive', false).or('sens.eq.retrait,moyen.eq.especes')
      .order('date_op', { ascending: false }).order('cree_le', { ascending: false }).limit(1000)
      .then(({ data }) => { if (data) { setOps(data); local.set('especes', data); } });
  }, [rev]);
  return ops;
}

export function useSoldeEspeces(uid) {
  return soldeEspeces(useMouvementsEspeces(), uid);
}

export default function Especes({ ouvrir }) {
  const { profil, membres, estGestionnaire, rafraichir } = useApp();
  const flash = useFlash();
  const ops = useMouvementsEspeces();
  const [qui, setQui] = useState(profil.id);
  const [compte, setCompte] = useState(null);
  const solde = soldeEspeces(ops, qui);
  const miens = ops.filter((o) => porteur(o) === qui && mouvementEspeces(o) !== 0);
  const nom = membres.find((m) => m.id === qui)?.prenom;

  async function recompter() {
    const reel = arrondi(num(compte));
    const ecart = arrondi(reel - solde);
    setCompte(null);
    if (Math.abs(ecart) < 0.01) return flash('Le compte est juste, rien à corriger.');
    const ligne = {
      id: nouvelId(), espace: 'perso', sens: ecart < 0 ? 'depense' : 'rentree', montant: Math.abs(ecart), date_op: aujourdhui(),
      categorie: 'Autre', libelle: ecart < 0 ? 'Espèces dépensées non notées' : 'Espèces retrouvées', moyen: 'especes',
      proprietaire: profil.id, cree_par: profil.id,
    };
    try { await enregistrer('operations', ligne); flash(`Porte-monnaie corrigé : ${ecart < 0 ? '−' : '+'}${eur(Math.abs(ecart))}.`); rafraichir(); }
    catch (e) { flash(messageClair(e), 'erreur'); }
  }

  return (
    <div className="page">
      <section className="bandeau">
        <p className="bandeau-label">{qui === profil.id ? 'Mon porte-monnaie' : `Porte-monnaie de ${nom}`}</p>
        <p className={`bandeau-chiffre ${solde < 0 ? 'negatif' : ''}`}>{eur(solde)}</p>
        <p className="bandeau-sous">Retraits et espèces reçues, moins les dépenses payées en espèces.</p>
        {estGestionnaire && membres.length > 1 && (
          <select className="select-bandeau" value={qui} onChange={(e) => setQui(e.target.value)} aria-label="Porte-monnaie de">
            {membres.map((m) => <option key={m.id} value={m.id}>{m.id === profil.id ? 'Moi' : m.prenom}</option>)}
          </select>
        )}
      </section>

      {qui === profil.id && <>
        <button className="btn btn-primaire btn-grand btn-plein" onClick={() => ouvrir({ espace: 'perso', sens: 'retrait' })}><Banknote size={22} /> Retrait au distributeur</button>
        <div className="actions2">
          <button className="btn btn-second btn-grand" onClick={() => ouvrir({ espace: 'perso', sens: 'depense', moyen: 'especes' })}><Minus size={20} /> Dépense</button>
          <button className="btn btn-second btn-grand" onClick={() => ouvrir({ espace: 'perso', sens: 'rentree', moyen: 'especes' })}><Plus size={20} /> Reçu</button>
        </div>
        <button className="btn btn-second btn-plein" onClick={() => setCompte(String(Math.max(0, solde)).replace('.', ','))}><Scale size={18} /> Recompter mon porte-monnaie</button>
      </>}

      <h3 className="titre-section">Mouvements d'espèces</h3>
      {miens.length === 0 ? <Vide>Notez vos retraits au distributeur, puis choisissez « Espèces » quand vous payez en liquide.</Vide> : (
        <ul className="liste">
          {miens.slice(0, 100).map((o) => {
            const m = mouvementEspeces(o);
            return (
              <li key={o.id}>
                <button className="ligne" onClick={() => ouvrir(o)}>
                  <span className="ligne-date">{dateCourte(o.date_op)}</span>
                  <span className="ligne-texte"><strong>{o.libelle || o.categorie}</strong><small>{o.sens === 'retrait' ? 'Retrait' : o.categorie}{o.espace === 'commun' ? ', commun' : o.espace === 'pro' ? ', pro' : ''}</small></span>
                  <span className={`ligne-montant ${m > 0 ? 'positif' : ''}`}>{m > 0 ? '+' : '−'}{eur(Math.abs(m))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {compte !== null && (
        <Modal titre="Recompter les espèces" onClose={() => setCompte(null)} pied={<>
          <button className="btn btn-second" onClick={() => setCompte(null)}>Annuler</button>
          <button className="btn btn-primaire" onClick={recompter}>Corriger</button>
        </>}>
          <p>L'application calcule <strong>{eur(solde)}</strong>. Combien avez-vous vraiment dans le porte-monnaie ?</p>
          <Champ label="J'ai compté (€)"><input className="input-montant" inputMode="decimal" autoFocus value={compte} onChange={(e) => setCompte(e.target.value.replace(/[^0-9,.]/g, ''))} /></Champ>
          <p className="texte-doux petit">S'il manque de l'argent, la différence est notée comme « espèces dépensées non notées ».</p>
        </Modal>
      )}
    </div>
  );
}
