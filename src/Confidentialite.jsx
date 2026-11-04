import { Shield } from 'lucide-react';

export function TexteConfidentialite() {
  return (
    <div className="texte-legal">
      <p><strong>Ce que l'application garde :</strong> votre adresse e-mail, votre prénom, et ce que vous saisissez (dépenses, rentrées, charges fixes, espèces, projets, justificatifs, règles du relevé bancaire).</p>
      <p><strong>Qui peut le voir :</strong> seulement votre famille, selon les rôles. Les gestionnaires voient tout ; les membres voient leurs dépenses perso et les dépenses communes, jamais la partie pro. Une autre famille ne voit jamais vos données. Dans un projet partagé, les participants voient seulement les opérations du projet.</p>
      <p><strong>Où :</strong> chez Supabase, en Irlande (Union européenne). Le mot de passe est chiffré : personne ne peut le lire.</p>
      <p><strong>Pourquoi :</strong> uniquement pour faire fonctionner l'application. Rien n'est vendu, ni utilisé pour de la publicité.</p>
      <p><strong>Vos droits :</strong> vous pouvez demander à voir, corriger ou supprimer vos données en écrivant à la responsable de l'application. Les relevés bancaires importés ne sont pas gardés : seules les lignes que vous enregistrez le sont.</p>
    </div>
  );
}

export default function Confidentialite() {
  return (
    <div className="page">
      <h2 className="titre-page"><Shield size={24} /> Confidentialité</h2>
      <div className="carte"><TexteConfidentialite /></div>
    </div>
  );
}
