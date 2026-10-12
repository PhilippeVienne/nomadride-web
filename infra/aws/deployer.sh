#!/bin/sh
# Déploie NomadRide sur AWS, en une commande.
#   sh infra/aws/deployer.sh          déploie
#   sh infra/aws/deployer.sh plan     montre ce qui changerait, sans rien créer ni modifier
# Ce que fait un déploiement : état Terraform, image de l'application, infrastructure, puis fichiers
# statiques dans S3. Il se relance sans risque : seul ce qui a changé est touché.
# Avant la première fois : sh infra/aws/secrets.sh (voir docs/agents/DEPLOYMENT.md).
set -eu
action=${1:-deployer}
env=prod
repo=$(cd "$(dirname "$0")/../.." && pwd)
tf="$repo/infra/aws"
export AWS_PROFILE=${AWS_PROFILE:-bike360-deploiement} AWS_DEFAULT_REGION=eu-north-1 AWS_PAGER=""

for tool in aws terraform docker git; do
    command -v "$tool" >/dev/null || { echo "outil manquant : $tool" >&2; exit 1; }
done
account=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
    || { echo "pas d'identifiants AWS : aws login --profile bike360" >&2; exit 1; }
echo "== Compte AWS $account, région $AWS_DEFAULT_REGION"

echo "== État Terraform"
# le compartiment d'état du compte, commun aux projets qui y vivent (une clé par projet)
state="bike360-etat-$account"
aws s3api head-bucket --bucket "$state" >/dev/null 2>&1 || { echo "compartiment d'état $state introuvable" >&2; exit 1; }
terraform -chdir="$tf" init -input=false -reconfigure -backend-config="bucket=$state" -backend-config="key=nomadride/$env/terraform.tfstate" >/dev/null
# étiquette de l'image : la révision du code, et l'heure si l'arbre de travail a des changements non enregistrés
tag=$(git -C "$repo" rev-parse --short HEAD)
[ -z "$(git -C "$repo" status --porcelain -- . ':!infra/aws/*.tf' ':!infra/aws/*.tfvars' ':!infra/aws/*.sh' ':!docs' ':!*.md')" ] || tag="$tag-$(date +%Y%m%d%H%M%S)"
vars="-var-file=$tf/$env.tfvars -var compte=$account"

if [ "$action" = plan ]; then
    # shellcheck disable=SC2086
    terraform -chdir="$tf" plan -input=false $vars -var "image_tag=$tag"
    exit 0
fi

echo "== Secrets"
aws ssm get-parameter --name "/nomadride/$env/SESSION_SECRET" >/dev/null 2>&1 \
    || { echo "les secrets ne sont pas rangés : lancer d'abord  sh infra/aws/secrets.sh" >&2; exit 1; }
echo "   ✓ secrets rangés sous /nomadride/$env/"

echo "== Image de l'application ($tag)"
# shellcheck disable=SC2086
terraform -chdir="$tf" apply -input=false -auto-approve $vars -var "image_tag=$tag" -target=aws_ecr_repository.service >/dev/null
repository=$(terraform -chdir="$tf" output -raw image_repository)
# l'adresse publique est lue à la construction de l'image ; à ce stade l'état ne la connaît pas encore
site="https://$(sed -n 's/^domain *= *"\(.*\)"/\1/p' "$tf/$env.tfvars")"
# Le jeton du dépôt d'images (valable douze heures) est gardé dans un dossier de réglages jetable plutôt que
# dans le trousseau de la machine : celui-ci n'est pas toujours ouvert quand le script tourne sans écran.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/docker"; [ ! -d "${DOCKER_CONFIG:-$HOME/.docker}/contexts" ] || ln -s "${DOCKER_CONFIG:-$HOME/.docker}/contexts" "$tmp/docker/contexts"
printf '{"currentContext":"%s"}' "$(docker context show)" > "$tmp/docker/config.json"
registry() { DOCKER_CONFIG="$tmp/docker" docker "$@"; }
aws ecr get-login-password | registry login --username AWS --password-stdin "${repository%%/*}" >/dev/null 2>&1
if aws ecr describe-images --repository-name "nomadride-$env" --image-ids "imageTag=$tag" >/dev/null 2>&1; then
    echo "   ✓ image déjà dans le dépôt"
    docker image inspect "$repository:$tag" >/dev/null 2>&1 || registry pull -q "$repository:$tag" >/dev/null
else
    docker image inspect "$repository:$tag" >/dev/null 2>&1 \
        || docker build --platform linux/amd64 --provenance=false -f "$tf/Dockerfile" --build-arg "APP_BASE_URL=$site" -t "$repository:$tag" "$repo"
    registry push "$repository:$tag" >/dev/null
    echo "   ✓ image poussée"
fi

echo "== Infrastructure"
# shellcheck disable=SC2086
terraform -chdir="$tf" apply -input=false -auto-approve $vars -var "image_tag=$tag"

echo "== Fichiers statiques"
# sortis de l'image, pour être exactement ceux que le serveur référence ; les anciens sont gardés, un
# navigateur resté sur une page d'avant le déploiement les demande encore
bucket=$(terraform -chdir="$tf" output -raw static_bucket)
container=$(docker create "$repository:$tag")
docker cp "$container:/app/.next/static" "$tmp/static" >/dev/null; docker rm "$container" >/dev/null
aws s3 sync "$tmp/static/" "s3://$bucket/_next/static/" --cache-control "public,max-age=31536000,immutable" >/dev/null
echo "   ✓ fichiers déposés dans $bucket"

echo "== Contrôle"
front="https://$(terraform -chdir="$tf" output -raw cloudfront)"
code=000
for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -m 60 -w '%{http_code}' "$front/pitstop" || true)
    [ "$code" = 200 ] && break; sleep 10
done
[ "$code" = 200 ] && echo "   ✓ l'application répond : $front/pitstop" || echo "   ✗ l'application ne répond pas encore ($code) : voir les journaux /aws/lambda/nomadride-$env-service" >&2
code=$(curl -s -o /dev/null -m 60 -w '%{http_code}' "$site/pitstop" || true)
[ "$code" = 200 ] && echo "   ✓ le domaine répond : $site/pitstop" || { echo "   ? le domaine ne répond pas encore ($code). Enregistrements DNS attendus chez Cloudflare :"; terraform -chdir="$tf" output dns; }
echo "Déployé : $site"
