import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, local, attente } from './api.js';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// Opérations d'un intervalle de dates (rechargées après chaque enregistrement)
export function useOperations(debut, fin) {
  const { rev } = useApp();
  const cle = `ops:${debut}:${fin}`;
  const [ops, setOps] = useState(() => local.get(cle, null));
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    let annule = false;
    (async () => {
      const { data, error } = await supabase.from('operations').select('*')
        .gte('date_op', debut).lte('date_op', fin).eq('archive', false)
        .order('date_op', { ascending: false }).order('cree_le', { ascending: false });
      if (annule) return;
      if (error) { setErreur(error); if (!ops) setOps([]); return; }
      // ajoute les saisies en attente d'envoi
      const enAttente = attente.liste().filter((x) => x.table === 'operations').map((x) => ({ ...x.ligne, _attente: true }))
        .filter((o) => o.date_op >= debut && o.date_op <= fin && !o.archive);
      const ids = new Set(enAttente.map((o) => o.id));
      const tout = [...enAttente, ...data.filter((o) => !ids.has(o.id))];
      setErreur(null); setOps(tout); local.set(cle, tout);
    })();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debut, fin, rev]);
  return { ops: ops || [], chargement: ops === null, erreur };
}

export function useFixes() {
  const { rev } = useApp();
  const [fixes, setFixes] = useState(() => local.get('fixes', []));
  useEffect(() => {
    supabase.from('fixes').select('*').order('libelle').then(({ data }) => { if (data) { setFixes(data); local.set('fixes', data); } });
  }, [rev]);
  return fixes;
}
