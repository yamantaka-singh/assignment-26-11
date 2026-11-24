// No 0/O/1/I/L: references get read aloud at the gate. Modulo bias is irrelevant for a label.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

// ponytail: no retry on a reference collision (~1 in 10^9 per pair); the unique index turns it into a 500
// and the client's retry with the same idempotency key succeeds. Add a retry loop if volume ever matters.
export function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return `SU26-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}
