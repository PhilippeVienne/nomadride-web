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
- `DATABASE_URI`, `DATABASE_SSL` — connexion Postgres. Base self-hosted sur Coolify (service `nomadride-postgis`, réseau interne Docker, pas de SSL) — pas Supabase, cf. [[project_google_oauth_coolify]].
- `PAYLOAD_SECRET` — secret interne PayloadCMS.
- `MOCK_GEORIDE` — active un mock GeoRide en dev/preview si nécessaire.

Les anciennes variables `AUTH0_*` et les variables Postgres/Supabase de l'ère Vercel (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_CA`, `NEXT_PUBLIC_SUPABASE_*`, etc.) sont obsolètes et ont été retirées du code comme de Coolify.

## Tâches planifiées

- `prewarm-pitstops` (`/api/cron/prewarm-pitstops`, quotidien) : préchauffe le cache OSM/Overpass pour les zones les plus demandées. Anciennement déclenché par Vercel Cron (`vercel.json`, supprimé) — repris via une tâche planifiée Coolify (`coolify app task list yb9orio9il6o2nrjy5gyywhg`, cron `0 7 * * *`).
- `keep-alive` : supprimé — c'était un ping anti-veille pour Supabase, inutile avec un Postgres self-hosted qui ne se met jamais en veille.

Pour configurer un nouvel environnement, voir aussi Google Cloud Console : la redirect URI `<APP_BASE_URL>/auth/callback` doit être enregistrée pour chaque domaine (prod, preview, localhost en dev).

## Déploiement automatique (GitHub Actions)

`asgard` résout vers un nom Tailscale (`asgard.felis-ionian.ts.net`) — Coolify n'est **pas** joignable depuis l'internet public, un webhook GitHub classique ne peut donc pas l'atteindre directement. À la place, [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml) se déclenche sur chaque push vers `main` (et manuellement via `workflow_dispatch`) :

1. Rejoint le tailnet via [tailscale/github-action](https://github.com/tailscale/github-action) avec une clé **éphémère** taguée `tag:ci` (le runner est retiré du tailnet automatiquement en fin de job).
2. Installe `coolify-cli` et déclenche `coolify deploy name nomadride-web`.
3. Attend la fin du déploiement (poll toutes les 10s, timeout 15 min) et affiche les logs de build dans les logs de l'action. Le job échoue si le déploiement échoue.

La clé Tailscale CI est provisionnée par Terraform (`yggdrasil/terraform/modules/tailscale-ci-key`), réutilisable, expiration 90 jours (max autorisé par Tailscale) — à régénérer via `terraform apply` dans `yggdrasil/terraform` avant expiration. Le tag `tag:ci` est déclaré dans `tagOwners` par `yggdrasil/terraform/modules/tailscale-setup`.

Secrets GitHub Actions du repo `nomadride-web` (créés avec `gh secret set`, valeurs jamais committées) :

- `TAILSCALE_AUTHKEY` — sortie `tailscale_ci_auth_key` du Terraform yggdrasil.
- `COOLIFY_URL` — `http://asgard:8000` (résolu via Tailscale MagicDNS une fois le runner connecté au tailnet).
- `COOLIFY_API_TOKEN` — token API Coolify (actuellement le token personnel du contexte `asgard` local ; à terme, remplacer par un token dédié à portée limitée créé dans Coolify → Keys & Tokens).
- `COOLIFY_APP_UUID` — `yb9orio9il6o2nrjy5gyywhg`.

Note : l'action `tailscale/github-action` avertit que `authkey` est deprecated au profit d'un OAuth client Tailscale (mint une clé éphémère par job automatiquement, sans rotation manuelle) — amélioration possible plus tard, non bloquante pour l'instant.
