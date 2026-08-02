import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const DEFAULT_LOCAL_PAYLOAD_SECRET = 'a_very_secure_local_secret_key_for_payload_development_95';

/**
 * Returns the Payload secret used across the app for signing and for
 * encrypting/decrypting GeoRide credentials. Centralized here so the
 * local-dev fallback only needs to live in one place.
 */
export function getPayloadSecret(): string {
  return process.env.PAYLOAD_SECRET || DEFAULT_LOCAL_PAYLOAD_SECRET;
}

/**
 * Generates an unguessable random password. Used to provision the Payload
 * `users` record backing an Auth0 identity — that password field is never
 * used to log in (auth is handled by Auth0), so it must not be a shared,
 * hardcoded value.
 */
export function generateRandomPassword(): string {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Encrypts a string using AES-256-GCM and a custom secret key.
 * Output format: iv_hex:auth_tag_hex:ciphertext_hex
 */
export function encrypt(text: string, secretKey: string): string {
  if (!text) return '';
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string formatted as iv_hex:auth_tag_hex:ciphertext_hex.
 * Returns the original string. Falls back to returning the text if format is invalid.
 */
export function decrypt(cipherText: string, secretKey: string): string {
  if (!cipherText) return '';
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    return cipherText;
  }
  try {
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return cipherText; // return raw if decryption fails (e.g. key mismatch)
  }
}

/**
 * Checks if a string matches the AES-256-GCM output pattern.
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;
  const parts = text.split(':');
  if (parts.length !== 3) return false;
  const [ivHex, authTagHex] = parts;
  return ivHex.length === IV_LENGTH * 2 && authTagHex.length === 32;
}
