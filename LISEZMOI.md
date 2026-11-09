# Budget Famille — V3.1.0

Application web installable (PWA) : plusieurs familles séparées (6 personnes maximum chacune), dépenses perso et communes (avec une case par enfant),
espèces, relevés bancaires, et projets (locations saisonnières avec réservations Airbnb / Booking / direct, options, frais de plateforme,
factures d'IVA ; projets à plusieurs avec versements entre associés, comptes communs comme une SCI, abonnements). Bilans PDF et Excel.
Même modèle que FORÇA+ : React + Vite, Supabase, Netlify, tout le code dans `src/` sans sous-dossiers.

À envoyer sur GitHub : les fichiers de la racine, ceux de `src/` et ceux de `public/`.
À coller dans Supabase > SQL Editor, dans l'ordre : `V1_01_COPIE_SECURITE.sql`, `V1_02_MIGRATION.sql`, `V2_00_FAMILLES_PROJETS.sql`,
`V2_01_RESERVATIONS.sql`, `V3_00_PROJETS_PRO.sql`, `V3_01_COMPTES_ESPECES.sql`. Tout est rejouable.
Variables Netlify : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé publique, jamais la clé secrète).

Tests : `tests/v3.test.mjs`, `tests/familles.test.mjs`, `tests/droits.test.mjs` (droits sur un vrai PostgreSQL), `tests/projets.test.mjs`,
`tests/releve.test.mjs`, `tests/export.test.mjs`, `tests/pdf.test.mjs`, `tests/especes.test.mjs`, `tests/especes.test.mjs`, `tests/parcours_test.py` (parcours complet sur téléphone).
