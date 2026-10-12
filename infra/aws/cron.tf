# Préchauffage quotidien du cache des stations (zones les plus demandées). La même image, sans adresse
# publique : seul le planificateur l'appelle, et l'adaptateur transmet l'événement à la route donnée.

resource "aws_cloudwatch_log_group" "cron" {
  name              = "/aws/lambda/${local.name}-cron"
  retention_in_days = 90
}

resource "aws_lambda_function" "cron" {
  function_name = "${local.name}-cron"
  role          = aws_iam_role.service.arn
  package_type  = "Image"
  image_uri     = local.image
  architectures = ["x86_64"]
  memory_size   = 1024
  timeout       = 900
  environment {
    variables = merge(local.service_env, {
      CRON_PASS_THROUGH         = "true"
      AWS_LWA_PASS_THROUGH_PATH = "/api/cron/prewarm-pitstops"
    })
  }
  depends_on = [aws_cloudwatch_log_group.cron, aws_iam_role_policy.service]
}

data "aws_iam_policy_document" "planificateur" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "planificateur" {
  name               = "${local.name}-planificateur"
  assume_role_policy = data.aws_iam_policy_document.planificateur.json
}

resource "aws_iam_role_policy" "planificateur" {
  name = "appel"
  role = aws_iam_role.planificateur.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "lambda:InvokeFunction", Resource = aws_lambda_function.cron.arn }]
  })
}

resource "aws_scheduler_schedule" "cron" {
  name                         = "${local.name}-prechauffage"
  description                  = "Préchauffage quotidien du cache des stations (Overpass)"
  schedule_expression          = "cron(0 7 * * ? *)"
  schedule_expression_timezone = "UTC"
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = aws_lambda_function.cron.arn
    role_arn = aws_iam_role.planificateur.arn
    retry_policy {
      maximum_retry_attempts = 1
    }
  }
}
