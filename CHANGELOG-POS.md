# Luvia POS — increment 2 (flux de vente P0)

## À faire une seule fois
1. Supabase > SQL Editor : ré-exécuter `pos/schema.sql` (idempotent) — ajoute `order_items`, marge, source, agent.
2. Render : (optionnel) `POS_B2C_ORG_SLUG` = identifiant de l'agence « Luvia direct » qui reçoit les réservations du site B2C (défaut : `luvia-direct`). Créer cette agence depuis /pos/counter/ (« Créer mon agence »).
3. Redéployer.

## Ce qui change
- `POST /orders` : totaux calculés côté serveur, lignes (`order_items`), coût fournisseur, marge, une réservation « pending » par vol/hôtel.
- Devis accepté -> commande : copie les lignes, coûts compris.
- `GET /orders/:id` : lignes, réservations, paiements, factures.
- `GET /reports/sales?from=&to=` : CA, coût, marge, encaissé, impayés, par agent / service / canal (owner, admin, manager, accountant).
- Paiement refusé sur commande annulée/remboursée.
- Lien B2C -> POS : chaque réservation hôtel confirmée sur le site crée client + commande + paiement + réservation dans l'agence B2C (idempotent).
- Comptoir : envoie les vraies lignes (coût + prix de vente) ; champ « Coût fournisseur » sur les services manuels.
- Sécurité : le serveur ne logue plus les requêtes /api/pos (mots de passe, passeports) ; server.js, package.json et pos/*.js/sql ne sont plus servis publiquement.

## Nouvelle interface /pos (console de gestion)
Tableau de bord, dossiers (détail, paiements, suivi des réservations, facture, impression), devis (acceptation, création du dossier), clients, fournisseurs. Le bouton « Nouvelle vente » ouvre le comptoir (/pos/counter/). Correction CORS : le POS fonctionne depuis son propre domaine.

## Données de démonstration (agence existante)
DATABASE_URL=... node pos/seed-demo.js https://votre-site.onrender.com mon-agence owner@agence.com 'motdepasse'
Les références fournisseur sont préfixées DEMO- : ne pas les présenter comme de vraies réservations.

## Identité visuelle et installation (increment 4)
- Icône Luvia (L + vague du fleuve) : favicon, icônes 192/512 et maskable, `manifest.webmanifest`, `sw.js`. Dans Edge ou Chrome : menu > « Installer l'application » (ou icône d'installation dans la barre d'adresse). Aucun avertissement Windows, aucune signature nécessaire. Aucune donnée n'est mise en cache.
- Comptoir (`/pos/counter/`) habillé comme la console : même police (IBM Plex Sans), mêmes couleurs, textes plus lisibles, lien « Gestion », connexion partagée avec la console.
- Numérotation lisible et séquentielle par agence : D-2026-00001 (dossiers), DV-… (devis), F-… (factures). Ré-exécuter `pos/schema.sql`.


## Increment 5 — LuviaPlace OS workspace shell
- Reworked the POS console into the LuviaPlace OS workspace: translucent dark sidebar, grouped navigation, sticky topbar, global in-page search, responsive layouts and reduced-motion support.
- Added agency workspace modal with editable profile fields (name, country, default currency, contact details, address, website and logo URL).
- Added team overview, role assignment and protected role updates for Owner/Admin.
- Added balance overview, invoice list and organization activity history.
- Added API endpoints for organization profile and audit history, plus a safe-to-rerun schema extension for agency contact fields.
- Service areas for flights, hotels, experiences, cars, insurance, email, Luvia AI and support are currently navigation placeholders linking to the existing sales counter where relevant; their dedicated workflows remain future work.
- After deployment, re-run `pos/schema.sql` in Supabase SQL Editor so the organization profile fields exist.


## Increment 6 — Operations modules

- Replaced the flight and hotel navigation placeholders with LiteAPI rate-search forms and result cards.
- Added quote creation from a selected flight or hotel result, with an explicit agency selling price and CRM customer.
- Added experience, car/transfer and insurance request capture linked to CRM customers.
- Added a travel-request pipeline with role-gated status changes (Owner/Admin/Manager).
- Added an email composition handoff to the user's local mail client, an activity-based Luvia AI overview, and a support contact handoff. These are explicitly not presented as a native inbox, generative AI or ticketing system.
- Connected the top-bar activity shortcut to audit history.
- Added `npm test` syntax checks and a GitHub Actions workflow for POS JavaScript validation.
- Documented current provider boundaries: search is not booking, and provider confirmation workflows remain future work.
