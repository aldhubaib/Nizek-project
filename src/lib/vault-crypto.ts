import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Encrypts vault secrets at rest with AES-256-GCM.
 *
 * Format stored in the DB: `ivHex:tagHex:ciphertextHex`.
 * Key comes from VAULT_ENCRYPTION_KEY (any passphrase; derived via scrypt).
 */

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;

function getKey(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "VAULT_ENCRYPTION_KEY is not set. Add it to .env before using the Vault.",
    );
  }
  // Fixed salt so the same passphrase always yields the same key across deploys.
  return scryptSync(raw, "nizek-vault-v1", KEY_LEN);
}

export function encryptVaultSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptVaultSecret(payload: string): string {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid vault ciphertext");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Mask for history / list UI — never echo the real secret. */
export const SECRET_MASK = "••••••••";
