# Déploiement

L'application est hébergée sur **Coolify** (self-hosted, serveur "asgard"), **pas sur Vercel**.
Vercel n'est plus utilisé — ignore toute doc/config qui y fait encore référence (résidu de bootstrap `create-next-app`).

## App Coolify

- Nom : `nomadride-web`
- UUID : `yb9orio9il6o2nrjy5gyywhg`
- Domaine production : https://ride.vienne.me
- Repo Git : `PhilippeVienne/nomadride-web`, branche `main`
- Build pack : `nixpacks`
- Previews : générées par PR via webhook, sous-domaine `{{pr_id}}.ride.vienne.me`

## CLI Coolify

Le [coolify-cli](https://github.com/coollabsio/coolify-cli) est installé et loggué avec le context `asgard` (voir `coolify context list`). Consulte son `llms.txt` / `llms-full.txt` pour le catalogue complet de commandes.

Commandes courantes :

```bash
# lister les apps / variables d'env
coolify app list --format json
coolify app env list <app-uuid>

# ajouter/mettre à jour une variable d'env
coolify app env create <app-uuid> --key KEY --value "value"
coolify app env update <app-uuid> <env-uuid-or-key> --value "new-value"

# déployer
coolify deploy name nomadride-web
coolify app logs <app-uuid> --follow
```

Les commandes qui modifient l'environnement de prod (création/màj de variables, déploiement manuel) peuvent être bloquées par le mode auto de Claude Code — c'est attendu, elles doivent être validées explicitement.

## Variables d'environnement requises

- `APP_BASE_URL` — origine publique de cet environnement (ex: `https://ride.vienne.me`), utilisée pour construire le `redirect_uri` OIDC Google. Source de vérité unique, pas de dérivation dynamique par preview.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — credentials OAuth créés dans Google Cloud Console (authentification, voir `src/lib/googleAuth.ts`).
- `SESSION_SECRET` — secret de signature des JWT de session applicative (HS256). Une valeur dédiée par environnement, jamais réutilisée entre environnements.
- `DATABASE_URI`, `DATABASE_SSL` — connexion Postgres (Supabase).
- `PAYLOAD_SECRET` — secret interne PayloadCMS.
- `MOCK_GEORIDE` — active un mock GeoRide en dev/preview si nécessaire.

Les anciennes variables `AUTH0_*` sont obsolètes depuis le passage à l'auth Google OIDC native et peuvent être supprimées de Coolify.

Pour configurer un nouvel environnement, voir aussi Google Cloud Console : la redirect URI `<APP_BASE_URL>/auth/callback` doit être enregistrée pour chaque domaine (prod, preview, localhost en dev).
