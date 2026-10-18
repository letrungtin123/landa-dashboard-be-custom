// UUID v4 for idempotency and job keys. No imports: node tests load this file
// directly.

type SecureRandomSource = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>;

/**
 * UUID v4 from the browser's cryptographic random source, or null when there
 * is none. `crypto.randomUUID` exists only in secure contexts (https,
 * localhost); customers also open the admin on plain http addresses, where
 * `crypto.getRandomValues` still works. Never timestamps or Math.random: a
 * duplicate key could merge two separate jobs.
 */
export function secureRandomUuidOrNull(
  secureRandom: SecureRandomSource | null | undefined = globalThis.crypto,
): string | null {
  if (typeof secureRandom?.randomUUID === 'function') return secureRandom.randomUUID();
  if (typeof secureRandom?.getRandomValues !== 'function') return null;
  const bytes = new Uint8Array(16);
  secureRandom.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Same as secureRandomUuidOrNull, but throws when the browser has no secure random source. */
export function secureRandomUuid(
  secureRandom: SecureRandomSource | null | undefined = globalThis.crypto,
): string {
  const id = secureRandomUuidOrNull(secureRandom);
  if (id === null) throw new Error('Secure browser randomness is unavailable.');
  return id;
}
