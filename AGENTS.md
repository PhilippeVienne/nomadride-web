<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Déploiement

L'app tourne sur **AWS** (Lambda + CloudFront + Aurora PostgreSQL serverless, profil `bike360`), pas sur Coolify ni sur Vercel. Voir [docs/agents/DEPLOYMENT.md](docs/agents/DEPLOYMENT.md) pour l'architecture, le script de déploiement, les secrets et la base.
