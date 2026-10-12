#!/bin/sh
# Range dans Parameter Store les secrets de NomadRide (chiffrés), sous /nomadride/prod/.
#   sh infra/aws/secrets.sh [fichier.env]
# Lus dans le fichier donné (.env.local par défaut) : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et, s'il y
# est, TANKERKOENIG_API_KEY. Tirés au hasard s'ils n'existent pas encore, jamais remplacés ensuite :
# SESSION_SECRET, PAYLOAD_SECRET (il chiffre les identifiants GeoRide en base) et CRON_SECRET.
# Aucune valeur n'est affichée. L'application les lit au démarrage (src/instrumentation.ts).
set -eu
repo=$(cd "$(dirname "$0")/../.." && pwd)
file=${1:-$repo/.env.local}
env=prod
export AWS_PROFILE=${AWS_PROFILE:-bike360-deploiement} AWS_DEFAULT_REGION=eu-north-1 AWS_PAGER=""
[ -f "$file" ] || { echo "fichier introuvable : $file" >&2; exit 1; }

value() { sed -n "s/^$1=//p" "$file" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"; }
exists() { aws ssm get-parameter --name "/nomadride/$env/$1" >/dev/null 2>&1; }
put() { aws ssm put-parameter --name "/nomadride/$env/$1" --type SecureString --overwrite --value "$2" >/dev/null; }

for name in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TANKERKOENIG_API_KEY; do
    v=$(value "$name")
    if [ -n "$v" ]; then put "$name" "$v"; echo "   ✓ $name rangé"
    elif exists "$name"; then echo "   ✓ $name déjà rangé (absent de $(basename "$file"), laissé tel quel)"
    else echo "   ? $name absent de $(basename "$file") : non rangé"; fi
done
for name in SESSION_SECRET PAYLOAD_SECRET CRON_SECRET; do
    if exists "$name"; then echo "   ✓ $name déjà rangé (gardé)"
    else put "$name" "$(openssl rand -hex 32)"; echo "   ✓ $name tiré au hasard et rangé"; fi
done
