import crypto from "node:crypto";

function getKey(): Buffer {
  const hex = process.env.FP_ENC_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("FP_ENC_KEY must be set to 64 hex characters (32 bytes). See .env.example");
  }
  return Buffer.from(hex, "hex");
}

/** AES-256-GCM. Output layout: iv(12) | authTag(16) | ciphertext */
export function encrypt(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

export function decrypt(blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** Fails fast at startup if the key is missing or malformed. */
export function assertKey(): void {
  getKey();
}
