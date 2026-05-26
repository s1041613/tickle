/**
 * Room ID and host token generation.
 *
 * Design constraints (see openspec/changes/add-room-sync/design.md):
 *
 * - Room ID: 6 chars from a 31-char alphabet that excludes look-alikes
 *   (`0/O/1/l/I/o`). Search space ≈ 887M — enough to make collisions
 *   rare and to keep "kay-seven-em" style spelling out loud feasible.
 *
 * - Host token: `ht_` prefix + 16 chars from a wider 36-char alphabet
 *   (`a-z0-9`). ≈ 7.96 × 10^24 combos — uncrackable for our scale, and
 *   the prefix gives humans a visual cue this string is sensitive.
 *
 * Both use Web Crypto's `crypto.getRandomValues` so they're safe on
 * Cloudflare Workers (where `Math.random` is also OK these days but
 * crypto-random is the more conservative choice).
 */

/** 31-char alphabet, excludes 0/O/1/l/I/o for legibility */
const ROOM_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Full a–z + 0–9 = 36 chars, used for host tokens */
const HOST_TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

function randomChars(alphabet: string, length: number): string {
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < length; i++) {
    // buf[i] is 0..255; mod alphabet.length distributes uniformly enough
    // for our purposes. Alphabet lengths (31, 36) don't divide 256 evenly,
    // so there's a tiny bias toward early chars — irrelevant for collision
    // resistance at these search-space sizes.
    out += alphabet[buf[i] % alphabet.length]
  }
  return out
}

/** Generate a 6-char room id. Caller is responsible for collision retry. */
export function generateRoomId(): string {
  return randomChars(ROOM_ID_ALPHABET, 6)
}

/** Generate a host token of the form `ht_<16 chars>`. */
export function generateHostToken(): string {
  return `ht_${randomChars(HOST_TOKEN_ALPHABET, 16)}`
}
