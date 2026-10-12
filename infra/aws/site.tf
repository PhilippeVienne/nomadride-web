# CloudFront : la seule porte d'entrée. Il sert les fichiers statiques de Next depuis S3 et relaie tout
# le reste à la fonction, sans rien garder en cache.

resource "aws_s3_bucket" "static" {
  bucket = "${local.name}-static-${var.compte}"
}

resource "aws_s3_bucket_public_access_block" "static" {
  bucket                  = aws_s3_bucket.static.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "static" {
  name                              = "${local.name}-static"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "static" {
  bucket = aws_s3_bucket.static.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "CloudFront"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.static.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.site.arn } }
    }]
  })
}

resource "aws_acm_certificate" "site" {
  provider          = aws.virginie
  domain_name       = var.domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

data "aws_cloudfront_cache_policy" "aucun" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "statique" {
  name = "Managed-CachingOptimized"
}

# tout ce que le navigateur envoie, sauf l'en-tête Host : la fonction n'accepte que le sien
data "aws_cloudfront_origin_request_policy" "sans_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "site" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = local.name
  price_class     = "PriceClass_100"
  http_version    = "http2and3"
  aliases         = var.certificate_ready ? [var.domain] : []

  origin {
    origin_id   = "service"
    domain_name = trimsuffix(trimprefix(aws_lambda_function_url.service.function_url, "https://"), "/")
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # délai entre deux envois de la fonction : la synchronisation donne des nouvelles bien plus souvent
      origin_read_timeout = 60
    }
    custom_header {
      name  = "x-origin-verify"
      value = random_password.origine.result
    }
  }

  origin {
    origin_id                = "static"
    domain_name              = aws_s3_bucket.static.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.static.id
  }

  default_cache_behavior {
    target_origin_id         = "service"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.aucun.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.sans_host.id
  }

  # fichiers au nom unique par construction : gardés en cache sans limite
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "static"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.statique.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !var.certificate_ready
    acm_certificate_arn            = var.certificate_ready ? aws_acm_certificate.site.arn : null
    ssl_support_method             = var.certificate_ready ? "sni-only" : null
    minimum_protocol_version       = var.certificate_ready ? "TLSv1.2_2021" : null
  }
}
