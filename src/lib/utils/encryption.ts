import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES-GCM
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Derives a 32-byte encryption key from BETTER_AUTH_SECRET
 * Uses the first 32 bytes of the secret (ensures consistent length)
 */
function getEncryptionKey(): Buffer {
  const secret = env.BETTER_AUTH_SECRET;
  // Ensure we have exactly 32 bytes for AES-256
  const key = Buffer.from(secret.padEnd(KEY_LENGTH, "0")).subarray(0, KEY_LENGTH);
  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 * Returns: base64url encoded string in format: iv.encryptedData.authTag
 * 
 * @param plaintext - The secret to encrypt (e.g., webhook signing secret)
 * @returns Encrypted string that can be safely stored in database
 */
export function encryptSecret(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    
    const cipher = createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, "utf8", "base64url");
    encrypted += cipher.final("base64url");
    
    const authTag = cipher.getAuthTag().toString("base64url");
    
    // Format: iv.encryptedData.authTag
    return `${iv.toString("base64url")}.${encrypted}.${authTag}`;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt secret");
  }
}

/**
 * Decrypts a ciphertext string using AES-256-GCM
 * Expects format: iv.encryptedData.authTag (base64url encoded)
 * 
 * @param ciphertext - The encrypted string from database
 * @returns Decrypted plaintext secret
 * @throws Error if decryption fails or format is invalid
 */
export function decryptSecret(ciphertext: string): string {
  try {
    const parts = ciphertext.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted secret format");
    }
    
    const [ivStr, encryptedStr, authTagStr] = parts;
    
    const key = getEncryptionKey();
    const iv = Buffer.from(ivStr, "base64url");
    const encrypted = Buffer.from(encryptedStr, "base64url");
    const authTag = Buffer.from(authTagStr, "base64url");
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt secret");
  }
}

/**
 * Generates a random webhook signing secret
 * Format: whsec_{base64url_random_bytes}
 * 
 * @returns A new webhook secret (plaintext)
 */
export function generateWebhookSecret(): string {
  const bytes = randomBytes(32);
  return `whsec_${bytes.toString("base64url")}`;
}

/**
 * Generates a random webhook endpoint ID
 * Format: wh_{hex_random_bytes}
 * 
 * @returns A new webhook endpoint ID
 */
export function generateWebhookId(): string {
  const bytes = randomBytes(16);
  return `wh_${bytes.toString("hex")}`;
}

/**
 * Generates a random webhook event ID
 * Format: evt_{hex_random_bytes}
 * 
 * @returns A new webhook event ID
 */
export function generateWebhookEventId(): string {
  const bytes = randomBytes(16);
  return `evt_${bytes.toString("hex")}`;
}

/**
 * Generates a random webhook delivery ID
 * Format: del_{hex_random_bytes}
 * 
 * @returns A new webhook delivery ID
 */
export function generateWebhookDeliveryId(): string {
  const bytes = randomBytes(16);
  return `del_${bytes.toString("hex")}`;
}
