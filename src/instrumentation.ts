/**
 * Runs once when the Next.js server starts, before it handles any request.
 *
 * On AWS the secrets (Google OAuth client, session and Payload secrets, API
 * keys) live in SSM Parameter Store under SECRETS_PATH rather than in the
 * Lambda configuration or the Terraform state. They are copied into
 * process.env here, so the rest of the code keeps reading plain environment
 * variables whatever the hosting platform. Without SECRETS_PATH (local dev,
 * any other host) this does nothing.
 */
export async function register() {
  const path = process.env.SECRETS_PATH;
  if (!path || process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { SSMClient, GetParametersByPathCommand } = await import('@aws-sdk/client-ssm');
  const client = new SSMClient({});

  let nextToken: string | undefined;
  let loaded = 0;
  do {
    const page = await client.send(
      new GetParametersByPathCommand({ Path: path, WithDecryption: true, NextToken: nextToken })
    );
    for (const parameter of page.Parameters ?? []) {
      const name = parameter.Name?.slice(path.length);
      if (name && parameter.Value !== undefined) {
        process.env[name] = parameter.Value;
        loaded++;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  console.log(`[Secrets] ${loaded} parameters loaded from ${path}`);
}
