# Déploiement de NomadRide sur AWS, région de Stockholm, sans serveur à entretenir :
#   service.tf  l'application Next.js + Payload en fonction Lambda (image de conteneur, adaptateur web de
#               Lambda), jointe par une adresse de fonction en flux continu
#   site.tf     CloudFront devant la fonction, les fichiers statiques dans S3, le certificat du domaine
#   cron.tf     le préchauffage quotidien du cache des stations, déclenché par EventBridge Scheduler
#
# La base n'est pas créée ici : c'est le cluster Aurora PostgreSQL commun du compte (« commun-pg »,
# partagé avec bike360), dans lequel NomadRide a sa base et son rôle. Voir docs/agents/DEPLOYMENT.md.
#
# Tout passe par infra/aws/deployer.sh. Les secrets ne sont ni ici ni dans l'état : infra/aws/secrets.sh
# les range dans Parameter Store, l'application les lit au démarrage (src/instrumentation.ts).

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6"
    }
  }
  # compartiment et clé donnés par infra/aws/deployer.sh
  backend "s3" {
    region       = "eu-north-1"
    encrypt      = true
    use_lockfile = true
  }
}

variable "env" {
  description = "Nom de l'environnement."
  type        = string
  default     = "prod"
}

variable "compte" {
  description = "Numéro du compte AWS : il rend uniques les noms des compartiments. Donné par deployer.sh."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.compte))
    error_message = "Douze chiffres attendus."
  }
}

variable "region" {
  type    = string
  default = "eu-north-1"
}

variable "domain" {
  description = "Nom de domaine public de l'application."
  type        = string
  default     = "ride.vienne.me"
}

variable "certificate_ready" {
  description = "Passer à true une fois les enregistrements de validation du certificat créés chez Cloudflare, pour rattacher le domaine à CloudFront."
  type        = bool
  default     = false
}

variable "image_tag" {
  description = "Étiquette de l'image dans le dépôt d'images. Donnée par deployer.sh."
  type        = string
}

variable "db_cluster" {
  description = "Identifiant du cluster Aurora PostgreSQL commun du compte."
  type        = string
  default     = "commun-pg"
}

variable "db_name" {
  type    = string
  default = "nomadride"
}

variable "db_user" {
  description = "Rôle Postgres de l'application (membre de rds_iam : il se connecte par jeton IAM, sans mot de passe)."
  type        = string
  default     = "nomadride_app"
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { projet = "nomadride", environnement = var.env }
  }
}

# CloudFront ne lit ses certificats que dans la région de Virginie du Nord.
provider "aws" {
  alias  = "virginie"
  region = "us-east-1"
  default_tags {
    tags = { projet = "nomadride", environnement = var.env }
  }
}

data "aws_rds_cluster" "commun" {
  cluster_identifier = var.db_cluster
}

locals {
  name = "nomadride-${var.env}"
  # l'adresse publique reste celle du domaine même avant son rattachement : c'est elle que Google connaît
  site = "https://${var.domain}"
  # chemin de Parameter Store où secrets.sh range les secrets de cet environnement
  secrets = "/nomadride/${var.env}/"
}

output "site" {
  description = "Adresse publique de l'application."
  value       = local.site
}

output "cloudfront" {
  description = "Adresse que CloudFront donne à la distribution (cible de l'enregistrement DNS du domaine)."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "distribution" {
  value = aws_cloudfront_distribution.site.id
}

output "static_bucket" {
  value = aws_s3_bucket.static.id
}

output "image_repository" {
  value = aws_ecr_repository.service.repository_url
}

output "secrets_path" {
  value = local.secrets
}

output "dns" {
  description = "Enregistrements à créer chez Cloudflare (en « DNS seulement », sans le proxy)."
  value = concat(
    [for o in aws_acm_certificate.site.domain_validation_options : { nom = o.resource_record_name, type = o.resource_record_type, valeur = o.resource_record_value, role = "validation du certificat" }],
    [{ nom = var.domain, type = "CNAME", valeur = aws_cloudfront_distribution.site.domain_name, role = "site" }],
  )
}
