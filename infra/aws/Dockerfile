# Image de NomadRide pour AWS Lambda : le serveur Next.js autonome (.next/standalone) tel quel, grâce à
# l'adaptateur web de Lambda embarqué dans l'image.
# Contexte de construction : la racine du dépôt (voir infra/aws/deployer.sh).
#   docker build -f infra/aws/Dockerfile -t nomadride .

FROM node:22-bookworm-slim AS dependances
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS construction
WORKDIR /app
COPY --from=dependances /app/node_modules node_modules
COPY . .
# L'adresse publique est lue à la construction (origines admises pour les actions serveur, next.config.ts).
ARG APP_BASE_URL
ENV APP_BASE_URL=$APP_BASE_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
# Adaptateur web de Lambda : dans une fonction, il confie les requêtes au serveur HTTP ; ailleurs, il ne fait rien.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
COPY --from=construction /app/.next/standalone ./
# Les fichiers de /public sont servis par le serveur ; ceux de /_next/static partent dans S3 (deployer.sh),
# ils ne sont copiés ici que pour que l'image fonctionne aussi seule, hors AWS.
COPY --from=construction /app/public ./public
COPY --from=construction /app/.next/static ./.next/static
# Dans une fonction, seul /tmp est inscriptible : le cache de Next y est renvoyé.
RUN rm -rf .next/cache && ln -s /tmp/next-cache .next/cache
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOME=/tmp HOSTNAME=0.0.0.0 PORT=3000
CMD ["node", "server.js"]
