/**
 * SHA-256 of a string as lowercase hex (WebCrypto).
 *
 * nest-server expects every password to arrive SHA-256 hashed (it re-hashes server-side). The auth service applies
 * this to each credential field; use it yourself only for custom endpoints that follow the same rule. Because the
 * hash hides the length, enforce password rules in the form, not on the server.
 */
export async function ltSha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Encode bytes as base64url without padding (WebAuthn). */
export function ltArrayBufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode base64url (with or without padding) into bytes (WebAuthn). */
export function ltBase64UrlToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
