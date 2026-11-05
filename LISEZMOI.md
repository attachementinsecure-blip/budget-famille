# Budget Famille — V2.1.0

Application web installable (PWA) : plusieurs familles séparées (6 personnes maximum chacune), dépenses perso, communes et pro, espèces, relevés bancaires, projets partagés entre familles ou personnes.
Même modèle que FORÇA+ : React + Vite, Supabase, Netlify, tout le code dans `src/` sans sous-dossiers.

À envoyer sur GitHub : les fichiers de la racine, ceux de `src/` et ceux de `public/`.
À coller dans Supabase > SQL Editor, dans l'ordre : `V1_01_COPIE_SECURITE.sql` (copie de sécurité), `V1_02_MIGRATION.sql`, puis `V2_00_FAMILLES_PROJETS.sql` et `V2_01_RESERVATIONS.sql`. Tout est rejouable.
Variables Netlify : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé publique, jamais la clé secrète).

Tests : `tests/familles.test.mjs` (isolement des familles et projets, vrai PostgreSQL), `tests/droits.test.mjs`, `tests/releve.test.mjs`, `tests/projets.test.mjs`, `tests/export.test.mjs`, `tests/parcours_test.py` (parcours complet sur téléphone).
