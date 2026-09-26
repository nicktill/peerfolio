import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

let cachedKey: Buffer | null = null

/**
 * 32-byte key from ENCRYPTION_KEY (64 hex chars). Generate one with:
 *   openssl rand -hex 32
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey

  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`.")
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).")
  }

  cachedKey = Buffer.from(raw, "hex")
  return cachedKey
}

/**
 * Encrypts a Plaid access token for storage.
 *
 * Output is `iv:authTag:ciphertext`, all base64. The IV is random per call, so
 * encrypting the same token twice produces different ciphertext.
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":")
}

/** Reverses {@link encrypt}. Throws if the value was tampered with. */
export function decrypt(payload: string): string {
  const parts = payload.split(":")
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext: expected iv:authTag:ciphertext")
  }

  const [ivB64, authTagB64, dataB64] = parts as [string, string, string]
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Malformed ciphertext: bad iv or auth tag length")
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8")
}

/**
 * Invite codes and similar user-facing tokens. Avoids vowels (no accidental
 * words) and the 0/O, 1/I pairs so codes survive being read aloud.
 */
const CODE_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ"

export function generateInviteCode(length = 8): string {
  const bytes = crypto.randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  }
  return out
}
