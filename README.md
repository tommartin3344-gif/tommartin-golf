# tommartin-golf.fr

Site de Tom Martin, golfeur amateur de compétition (Golf de La Prée La Rochelle).
Site statique (HTML, CSS, JS) sans étape de build, hébergé sur Cloudflare Pages.

- `index.html`, `mentions-legales.html` : les pages
- `assets/` : styles, script, polices hébergées sur le site, images, `config.js` (Supabase)
- `data/merite.json` : classement et résultats, **mis à jour automatiquement** le 10 de chaque mois par `.github/workflows/merite.yml` → `scripts/update-merite.mjs`
- `data/saison-2027.json`, `data/partenaires.json` : à modifier à la main
- `supabase/schema.sql` : table du formulaire « Devenir partenaire »

Mise à jour manuelle du Mérite : `node scripts/update-merite.mjs` (Node 18+).
Guide complet : `06_SITE_WEB/Guide-mise-en-ligne.md` dans le dossier GOLF.
