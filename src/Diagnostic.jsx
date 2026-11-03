import { useEffect, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import { supabase, VERSION, VERSION_BASE_ATTENDUE, attente, forcerMiseAJour } from './api.js';
import { Pastille, useFlash } from './ui.jsx';
import { useApp } from './contexte.jsx';

export default function Diagnostic() {
  const { rafraichir } = useApp();
  const flash = useFlash();
  const [base, setBase] = useState(null);
  const [connecte, setConnecte] = useState(navigator.onLine);
  const [nb, setNb] = useState(attente.liste().length);

  useEffect(() => {
    supabase.from('app_info').select('valeur').eq('cle', 'version_base').maybeSingle()
      .then(({ data, error }) => setBase(error ? { erreur: true } : { version: data?.valeur || null }));
    const maj = () => setNb(attente.liste().length);
    window.addEventListener('bf-attente', maj);
    const on = () => setConnecte(navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', on);
    return () => { window.removeEventListener('bf-attente', maj); window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);

  const baseOk = base?.version === VERSION_BASE_ATTENDUE;
  async function renvoyer() {
    const r = await attente.renvoyer();
    flash(r.reste ? `${r.reste} opération(s) toujours en attente.` : `${r.envoyes} opération(s) envoyée(s).`, r.reste ? 'erreur' : 'succes');
    rafraichir();
  }

  return (
    <div className="page">
      <h2 className="titre-page">Diagnostic</h2>
      <ul className="liste">
        <li className="ligne ligne-fixe"><span className="ligne-texte"><strong>Version de l'application</strong></span><Pastille ton="info">{VERSION}</Pastille></li>
        <li className="ligne ligne-fixe"><span className="ligne-texte"><strong>Internet</strong></span><Pastille ton={connecte ? 'succes' : 'erreur'}>{connecte ? 'Connecté' : 'Hors ligne'}</Pastille></li>
        <li className="ligne ligne-fixe">
          <span className="ligne-texte"><strong>Base de données</strong><small>{base === null ? 'Vérification…' : base.erreur ? 'Non installée ou inaccessible' : `Version ${base.version || 'inconnue'}, attendue ${VERSION_BASE_ATTENDUE}`}</small></span>
          {base && <Pastille ton={baseOk ? 'succes' : 'erreur'}>{baseOk ? 'À jour' : 'À mettre à jour'}</Pastille>}
        </li>
        <li className="ligne ligne-fixe">
          <span className="ligne-texte"><strong>En attente d'envoi</strong><small>{nb ? 'Saisies gardées sur ce téléphone' : 'Tout est envoyé'}</small></span>
          {nb > 0 ? <button className="btn btn-petit btn-primaire" onClick={renvoyer}><Send size={16} /> Réessayer ({nb})</button> : <Pastille ton="succes">0</Pastille>}
        </li>
      </ul>
      {!baseOk && base && <p className="point ton-alerte">La base n'est pas à jour : relancez le fichier V1_02_MIGRATION.sql dans Supabase.</p>}
      <button className="btn btn-second btn-plein" onClick={forcerMiseAJour}><RefreshCw size={18} /> Forcer la mise à jour</button>
      <p className="texte-doux petit">Si l'application affiche une ancienne version, ce bouton vide la mémoire du téléphone et recharge tout. Vos données ne sont pas effacées.</p>
    </div>
  );
}
