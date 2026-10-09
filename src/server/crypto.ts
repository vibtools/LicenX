import crypto from "node:crypto";

export interface CryptoKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyBase64?: string;
  privateKeyBase64?: string;
}

export type Ed25519KeyPair = CryptoKeyPair;
export type RSAKeyPair = CryptoKeyPair;

/**
 * Generates an Enterprise RSA 2048-bit KeyPair
 * Private key is exported in PKCS#1 format (-----BEGIN RSA PRIVATE KEY-----)
 * Public key is exported in SPKI format (-----BEGIN PUBLIC KEY-----)
 */
export function generateRSAKeyPair(modulusLength = 2048): CryptoKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength,
  });

  const publicKeyPem = publicKey.export({
    type: "spki",
    format: "pem",
  }) as string;
  const privateKeyPem = privateKey.export({
    type: "pkcs1",
    format: "pem",
  }) as string;

  return {
    publicKeyPem,
    privateKeyPem,
  };
}

/**
 * Generates an Ed25519 KeyPair for backward compatibility
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

  const publicKeyPem = publicKey.export({
    type: "spki",
    format: "pem",
  }) as string;
  const privateKeyPem = privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;

  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  const rawPublicKey = publicKeyDer.subarray(publicKeyDer.length - 32);
  const publicKeyBase64 = rawPublicKey.toString("base64");

  const privateKeyDer = privateKey.export({ type: "pkcs8", format: "der" });
  const rawPrivateKey = privateKeyDer.subarray(16, 48);
  const privateKeyBase64 = rawPrivateKey.toString("base64");

  return {
    publicKeyPem,
    privateKeyPem,
    publicKeyBase64,
    privateKeyBase64,
  };
}

/**
 * Default keypair generator - uses strong enterprise RSA 2048-bit
 */
export function generateCryptoKeyPair(modulusLength = 2048): CryptoKeyPair {
  return generateRSAKeyPair(modulusLength);
}

/**
 * Deterministically serialize object for signing
 */
export function canonicalJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of keys) {
    sortedObj[k] = obj[k];
  }
  return JSON.stringify(sortedObj);
}

/**
 * Sign payload string with private key (Auto-detects RSA SHA-256 vs Ed25519)
 */
export function signPayload(
  payloadString: string,
  privateKeyPem: string,
): string {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType === "ed25519") {
    const signature = crypto.sign(
      null,
      Buffer.from(payloadString, "utf-8"),
      privateKey,
    );
    return signature.toString("base64");
  } else {
    // RSA with SHA-256
    const sign = crypto.createSign("SHA256");
    sign.update(payloadString, "utf-8");
    sign.end();
    return sign.sign(privateKey, "base64");
  }
}

function concatenateBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(length);

  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining >>= 8) {
    bytes.unshift(remaining & 0xff);
  }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

function encodeDerElement(tag: number, value: Uint8Array): Uint8Array {
  return concatenateBytes(
    Uint8Array.of(tag),
    encodeDerLength(value.length),
    value,
  );
}

function wrapRsaPkcs1AsPkcs8(pkcs1: Uint8Array): Uint8Array {
  const rsaEncryptionAlgorithm = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  );
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const privateKey = encodeDerElement(0x04, pkcs1);
  return encodeDerElement(
    0x30,
    concatenateBytes(version, rsaEncryptionAlgorithm, privateKey),
  );
}

function containsDerValue(der: Uint8Array, value: number[]): boolean {
  for (let offset = 0; offset <= der.length - value.length; offset++) {
    if (value.every((byte, index) => der[offset + index] === byte)) return true;
  }
  return false;
}

function decodePrivateKeyPem(privateKeyPem: string): {
  pkcs8: Uint8Array;
  algorithm: "rsa" | "ed25519";
} {
  const match = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(
    privateKeyPem,
  );
  if (!match) throw new Error("Invalid private key PEM");

  const binary = atob(match[2].replace(/\s/g, ""));
  const der = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (match[1] === "RSA PRIVATE KEY") {
    return { pkcs8: wrapRsaPkcs1AsPkcs8(der), algorithm: "rsa" };
  }
  if (match[1] !== "PRIVATE KEY") {
    throw new Error("Unsupported private key PEM format");
  }

  if (
    containsDerValue(
      der,
      [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01],
    )
  ) {
    return { pkcs8: der, algorithm: "rsa" };
  }
  if (containsDerValue(der, [0x06, 0x03, 0x2b, 0x65, 0x70])) {
    return { pkcs8: der, algorithm: "ed25519" };
  }
  throw new Error("Unsupported private key algorithm");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function signPayloadForCloudflare(
  payloadString: string,
  privateKeyPem: string,
): Promise<string> {
  const { pkcs8, algorithm } = decodePrivateKeyPem(privateKeyPem);
  const privateKey =
    algorithm === "rsa"
      ? await globalThis.crypto.subtle.importKey(
          "pkcs8",
          toArrayBuffer(pkcs8),
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["sign"],
        )
      : await globalThis.crypto.subtle.importKey(
          "pkcs8",
          toArrayBuffer(pkcs8),
          { name: "Ed25519" },
          false,
          ["sign"],
        );
  const data = toArrayBuffer(new TextEncoder().encode(payloadString));
  const signature =
    algorithm === "rsa"
      ? await globalThis.crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          privateKey,
          data,
        )
      : await globalThis.crypto.subtle.sign("Ed25519", privateKey, data);
  const signatureBytes = new Uint8Array(signature);
  let binarySignature = "";
  for (const byte of signatureBytes)
    binarySignature += String.fromCharCode(byte);
  return btoa(binarySignature);
}
/**
 * Verify payload signature with public key (Auto-detects RSA SHA-256 vs Ed25519)
 */
export function verifySignature(
  payloadString: string,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    if (publicKey.asymmetricKeyType === "ed25519") {
      return crypto.verify(
        null,
        Buffer.from(payloadString, "utf-8"),
        publicKey,
        Buffer.from(signatureBase64, "base64"),
      );
    } else {
      // RSA with SHA-256
      const verify = crypto.createVerify("SHA256");
      verify.update(payloadString, "utf-8");
      verify.end();
      return verify.verify(publicKey, Buffer.from(signatureBase64, "base64"));
    }
  } catch {
    return false;
  }
}

/**
 * Hash password with PBKDF2
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify password against stored salt:hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(":");
    if (!salt || !hash) return false;
    const testHash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, "sha512")
      .toString("hex");
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(testHash, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Generate a random license key formatted as PREFIX-XXXX-XXXX-XXXX
 */
export function generateLicenseKey(
  prefix = "VCON",
  segments = 3,
  segmentLength = 4,
): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Avoid ambiguous chars (0, O, 1, I)
  const parts: string[] = [];
  if (prefix) parts.push(prefix.toUpperCase().trim());

  for (let s = 0; s < segments; s++) {
    let part = "";
    const bytes = crypto.randomBytes(segmentLength);
    for (let i = 0; i < segmentLength; i++) {
      part += chars[bytes[i] % chars.length];
    }
    parts.push(part);
  }

  return parts.join("-");
}

export function generateLicensePin(): string {
  return crypto.randomInt(1000, 10000).toString();
}

/**
 * Simple signed session token
 */
export function createSessionToken(
  payload: { username: string; exp: number },
  secret: string,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
): { username: string; exp: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (signature !== expectedSig) return null;

    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (parsed.exp && parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
