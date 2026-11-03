# Budget Famille — V1.0.0

Application web installable (PWA) : dépenses perso, communes et pro (Airbnb) d'une famille de 6 personnes maximum.
Même modèle que FORÇA+ : React + Vite, Supabase, Netlify, tout le code dans `src/` sans sous-dossiers.

À envoyer sur GitHub : les fichiers de la racine, ceux de `src/` et ceux de `public/`.
À coller dans Supabase > SQL Editor : les fichiers du dossier `supabase/`, dans l'ordre 00, 01, 02.
Variables Netlify : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé publique « anon », jamais « service_role »).

Tests : `tests/droits.test.mjs` (droits sur un vrai PostgreSQL) et `tests/parcours_test.py` (parcours complet sur téléphone).
