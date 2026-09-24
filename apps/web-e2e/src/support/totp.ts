import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

const decodeBase32 = (secret: string): Buffer => {
  const bits = [...secret.replace(/=+$/, '').toUpperCase()]
    .map((character) => BASE32.indexOf(character).toString(2).padStart(5, '0'))
    .join('');
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
};

/**
 * The code an authenticator app would show for `secret` right now — RFC 6238, the SHA-1, 30 second,
 * six digit variant every authenticator agrees on. It is what lets a test finish ENROLLING in two
 * factor the way a person does, by proving it holds the secret.
 */
export const totpNow = (secret: string, at = Date.now()): string => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / STEP_SECONDS)));
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, '0');
};
