import crypto from 'node:crypto';

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
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength });

  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;

  return {
    publicKeyPem,
    privateKeyPem,
  };
}

/**
 * Generates an Ed25519 KeyPair for backward compatibility
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const rawPublicKey = publicKeyDer.subarray(publicKeyDer.length - 32);
  const publicKeyBase64 = rawPublicKey.toString('base64');

  const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  const rawPrivateKey = privateKeyDer.subarray(16, 48);
  const privateKeyBase64 = rawPrivateKey.toString('base64');

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
export function signPayload(payloadString: string, privateKeyPem: string): string {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType === 'ed25519') {
    const signature = crypto.sign(null, Buffer.from(payloadString, 'utf-8'), privateKey);
    return signature.toString('base64');
  } else {
    // RSA with SHA-256
    const sign = crypto.createSign('SHA256');
    sign.update(payloadString, 'utf-8');
    sign.end();
    return sign.sign(privateKey, 'base64');
  }
}

/**
 * Verify payload signature with public key (Auto-detects RSA SHA-256 vs Ed25519)
 */
export function verifySignature(payloadString: string, signatureBase64: string, publicKeyPem: string): boolean {
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    if (publicKey.asymmetricKeyType === 'ed25519') {
      return crypto.verify(null, Buffer.from(payloadString, 'utf-8'), publicKey, Buffer.from(signatureBase64, 'base64'));
    } else {
      // RSA with SHA-256
      const verify = crypto.createVerify('SHA256');
      verify.update(payloadString, 'utf-8');
      verify.end();
      return verify.verify(publicKey, Buffer.from(signatureBase64, 'base64'));
    }
  } catch {
    return false;
  }
}

/**
 * Hash password with PBKDF2
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against stored salt:hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Generate a random license key formatted as PREFIX-XXXX-XXXX-XXXX
 */
export function generateLicenseKey(prefix = 'VCON', segments = 3, segmentLength = 4): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars (0, O, 1, I)
  const parts: string[] = [];
  if (prefix) parts.push(prefix.toUpperCase().trim());

  for (let s = 0; s < segments; s++) {
    let part = '';
    const bytes = crypto.randomBytes(segmentLength);
    for (let i = 0; i < segmentLength; i++) {
      part += chars[bytes[i] % chars.length];
    }
    parts.push(part);
  }

  return parts.join('-');
}

/**
 * Simple signed session token
 */
export function createSessionToken(payload: { username: string; exp: number }, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): { username: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;

    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (parsed.exp && parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
