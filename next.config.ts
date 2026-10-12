import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) for the container image
  // deployed on AWS Lambda — see infra/aws/Dockerfile.
  output: 'standalone',
  serverExternalPackages: ['sharp'],
  experimental: {
    serverActions: {
      // Behind CloudFront the app sees the Lambda function URL as its host,
      // not the public domain the browser sends as Origin; without this the
      // Payload admin's server functions are rejected as cross-origin.
      allowedOrigins: process.env.APP_BASE_URL ? [new URL(process.env.APP_BASE_URL).host] : [],
    },
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
        ],
      },
    ];
  },
};

export default withPayload(nextConfig);
