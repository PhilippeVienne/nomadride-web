# L'application : une fonction Lambda qui fait tourner le serveur Next.js tel quel, grâce à l'adaptateur
# web de Lambda embarqué dans l'image. Rien ne tourne ni ne coûte quand personne ne s'en sert.

resource "aws_ecr_repository" "service" {
  name                 = local.name
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

# Les images anciennes ne sont pas gardées : seul le stockage des dix dernières est payé.
resource "aws_ecr_lifecycle_policy" "service" {
  repository = aws_ecr_repository.service.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "dix dernières images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# CloudFront joint ce secret à chaque requête qu'il relaie ; l'application refuse celles qui ne l'ont pas
# (src/proxy.ts), si bien que l'adresse de la fonction ne sert à rien sans passer par CloudFront.
resource "random_password" "origine" {
  length  = 48
  special = false
}

locals {
  image = "${aws_ecr_repository.service.repository_url}:${var.image_tag}"
  # réglages communs aux deux fonctions ; les secrets n'y sont pas, l'application les lit sous local.secrets
  service_env = {
    APP_BASE_URL      = local.site
    SECRETS_PATH      = local.secrets
    DATABASE_URI      = "postgres://${var.db_user}@${data.aws_rds_cluster.commun.endpoint}:5432/${var.db_name}"
    DATABASE_IAM_AUTH = "true"
    AWS_LWA_PORT      = "3000"
    # l'adaptateur attend que le serveur réponde avant de lui confier des requêtes
    AWS_LWA_READINESS_CHECK_PATH = "/manifest.webmanifest"
  }
}

data "aws_iam_policy_document" "lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "service" {
  name               = "${local.name}-service"
  assume_role_policy = data.aws_iam_policy_document.lambda.json
}

# Ce que l'application a le droit de faire, et rien d'autre.
data "aws_iam_policy_document" "service" {
  statement {
    sid     = "Base"
    actions = ["rds-db:connect"]
    # son rôle Postgres seulement : le cluster est partagé, les autres bases lui restent fermées
    resources = ["arn:aws:rds-db:${var.region}:${var.compte}:dbuser:${data.aws_rds_cluster.commun.cluster_resource_id}/${var.db_user}"]
  }
  statement {
    sid     = "Secrets"
    actions = ["ssm:GetParametersByPath"]
    # la lecture par chemin porte sur le chemin tel qu'il est demandé, barre finale comprise
    resources = ["arn:aws:ssm:${var.region}:${var.compte}:parameter${trimsuffix(local.secrets, "/")}", "arn:aws:ssm:${var.region}:${var.compte}:parameter${local.secrets}"]
  }
  statement {
    sid       = "Journaux"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.service.arn}:*", "${aws_cloudwatch_log_group.cron.arn}:*"]
  }
}

resource "aws_iam_role_policy" "service" {
  name   = "service"
  role   = aws_iam_role.service.id
  policy = data.aws_iam_policy_document.service.json
}

resource "aws_cloudwatch_log_group" "service" {
  name              = "/aws/lambda/${local.name}-service"
  retention_in_days = 90
}

resource "aws_lambda_function" "service" {
  function_name = "${local.name}-service"
  role          = aws_iam_role.service.arn
  package_type  = "Image"
  image_uri     = local.image
  architectures = ["x86_64"]
  memory_size   = 1024
  # la synchronisation GeoRide envoie sa progression au fil de l'eau et peut durer plusieurs minutes
  timeout = 900
  environment {
    variables = merge(local.service_env, {
      AWS_LWA_INVOKE_MODE  = "response_stream"
      ORIGIN_VERIFY_SECRET = random_password.origine.result
    })
  }
  depends_on = [aws_cloudwatch_log_group.service, aws_iam_role_policy.service]
}

# Adresse de la fonction, en flux continu (API Gateway couperait à 30 secondes et retiendrait la réponse
# entière). Elle est ouverte, mais l'application ne répond qu'aux requêtes relayées par CloudFront.
resource "aws_lambda_function_url" "service" {
  function_name      = aws_lambda_function.service.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"
}

resource "aws_lambda_permission" "adresse" {
  statement_id           = "adresse"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.service.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "adresse_appel" {
  statement_id             = "adresse-appel"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.service.function_name
  principal                = "*"
  invoked_via_function_url = true
}
