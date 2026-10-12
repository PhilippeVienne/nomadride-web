# Déploiement

L'application est hébergée sur **AWS** (profil `bike360`, région `eu-north-1`), sans serveur à entretenir.
Elle ne tourne plus sur Coolify/asgard (VM GCP arrêtée le 2026-10-11, facturation GCP fermée) ni sur Vercel — ignore toute doc/config qui y fait encore référence.

Le compte AWS héberge aussi le projet bike360 (dépôt `insta-build`). Tout ce qui appartient à NomadRide est préfixé `nomadride-` et étiqueté `projet=nomadride` ; ne touche à aucune ressource `bike360-*` depuis ce dépôt.

## Architecture

- **Application** : fonction Lambda `nomadride-prod-service`, image de conteneur (`infra/aws/Dockerfile`) qui lance le serveur Next.js autonome (`output: 'standalone'`) derrière l'[adaptateur web de Lambda](https://github.com/awslabs/aws-lambda-web-adapter). Elle est jointe par une adresse de fonction en flux continu (la synchronisation GeoRide diffuse sa progression et dépasse les 30 s d'API Gateway).
- **Entrée** : CloudFront (`https://ride.vienne.me`) est la seule porte. Il ajoute un en-tête secret `x-origin-verify` ; `src/proxy.ts` refuse (403) toute requête qui arrive sans lui, donc l'adresse brute de la fonction ne sert à rien.
- **Fichiers statiques** : `/_next/static/*` est servi depuis le compartiment S3 `nomadride-prod-static-<compte>`. Le reste (`/public` compris) passe par la fonction.
- **Base** : cluster Aurora PostgreSQL serverless **commun au compte**, `commun-pg` (configuration express : hors VPC, capacité 0 à 2 ACU, pause automatique après 5 min d'inactivité). NomadRide y a sa base `nomadride` et son rôle `nomadride_app`. Le cluster n'est **pas** dans le Terraform de ce dépôt (le provider ne sait pas créer une configuration express) : il a été créé par l'API RDS, avec protection contre la suppression.
- **Connexion à la base** : pas de mot de passe. Le cluster n'accepte que des jetons IAM de 15 minutes ; `payload.config.ts` en génère un à chaque nouvelle connexion quand `DATABASE_IAM_AUTH=true`. Le rôle IAM de la fonction n'a le droit de se connecter qu'en tant que `nomadride_app`.
- **Tâche planifiée** : EventBridge Scheduler `nomadride-prod-prechauffage` (07:00 UTC) appelle la fonction `nomadride-prod-cron` (même image, sans adresse publique). L'adaptateur transmet l'événement en POST à `/api/cron/prewarm-pitstops`, qui ne l'accepte que si `CRON_PASS_THROUGH=true`.
- **DNS** : zone `vienne.me` chez Cloudflare. `ride.vienne.me` est un CNAME **non proxifié** vers la distribution CloudFront ; un second CNAME `_…ride.vienne.me` valide le certificat ACM (à garder, il sert au renouvellement).

## Déployer

```bash
aws login --profile bike360        # si la session a expiré
sh infra/aws/deployer.sh           # image, infrastructure, fichiers statiques, contrôle
sh infra/aws/deployer.sh plan      # montre ce qui changerait, sans rien modifier
```

Le script utilise le profil `bike360-deploiement` (les mêmes identifiants, exposés d'une façon que Terraform et Docker savent lire). L'état Terraform est dans `s3://bike360-etat-<compte>/nomadride/prod/terraform.tfstate`.

Le déploiement modifie la production : en mode auto de Claude Code il peut être bloqué, c'est attendu, il doit être validé explicitement.

## Secrets et variables d'environnement

Les secrets sont dans Parameter Store sous `/nomadride/prod/` (chiffrés), ni dans la configuration des fonctions ni dans l'état Terraform. `src/instrumentation.ts` les copie dans `process.env` au démarrage du serveur (variable `SECRETS_PATH`).

```bash
sh infra/aws/secrets.sh [fichier.env]   # .env.local par défaut ; n'affiche aucune valeur
```

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — lus dans le fichier env (authentification, voir `src/lib/googleAuth.ts`).
- `TANKERKOENIG_API_KEY` — prix des carburants en Allemagne ; rangé seulement s'il est dans le fichier env.
- `SESSION_SECRET`, `PAYLOAD_SECRET`, `CRON_SECRET` — tirés au hasard au premier lancement, jamais remplacés ensuite (`PAYLOAD_SECRET` chiffre les identifiants GeoRide en base : le changer les rend illisibles).

Variables posées par Terraform sur les fonctions (`infra/aws/service.tf`) : `APP_BASE_URL` (origine publique, source de vérité du `redirect_uri` Google), `DATABASE_URI` (sans mot de passe), `DATABASE_IAM_AUTH`, `SECRETS_PATH`, `ORIGIN_VERIFY_SECRET`, et les réglages `AWS_LWA_*` de l'adaptateur.

Dans Google Cloud Console, la redirect URI `<APP_BASE_URL>/auth/callback` doit être enregistrée pour chaque domaine (prod, localhost en dev).

## Base de données

Se connecter à la main (jeton IAM, valable 15 min) :

```bash
H=$(aws rds describe-db-clusters --profile bike360 --db-cluster-identifier commun-pg --query 'DBClusters[0].Endpoint' --output text)
PGPASSWORD=$(aws rds generate-db-auth-token --profile bike360 --hostname "$H" --port 5432 --username nomadride_app) \
  psql "host=$H port=5432 dbname=nomadride user=nomadride_app sslmode=require"
```

Le schéma a été créé par le `push` de Payload en mode développement contre cette base ; en production `ensurePayloadSchema` (lancé à l'initialisation de Payload) ne fait que le vérifier. Il n'y a toujours pas de migrations Payload.

Le cluster est partagé : ajouter un projet = une base et un rôle membre de `rds_iam` (`CREATE ROLE … LOGIN; GRANT rds_iam TO …; CREATE DATABASE … OWNER …; REVOKE CONNECT ON DATABASE … FROM PUBLIC`), créés avec l'utilisateur maître `postgres`.

À savoir : après une pause, la première connexion attend le réveil du cluster (plusieurs secondes), d'où le délai de connexion de 30 s en mode IAM.

## Journaux

```bash
aws logs tail /aws/lambda/nomadride-prod-service --profile bike360 --follow
aws logs tail /aws/lambda/nomadride-prod-cron --profile bike360 --since 1d
```

## Déploiement automatique

Il n'y en a pas : le déploiement se lance à la main avec `infra/aws/deployer.sh`.

La voie normale (un rôle IAM que GitHub Actions assume par OIDC) est fermée sur ce compte : la politique de l'organisation AWS refuse explicitement `iam:CreateOpenIDConnectProvider` (vérifié le 2026-10-12 avec le simulateur de politiques IAM). Ne contourne pas ce garde-fou avec des clés d'accès longue durée rangées dans les secrets GitHub (le dépôt est public) sans décision explicite ; la solution propre est de demander à l'administrateur de l'organisation d'autoriser le fournisseur OIDC de GitHub.

L'ancien workflow (`deploy.yml`, Coolify via Tailscale) a été supprimé avec l'arrêt d'asgard.
