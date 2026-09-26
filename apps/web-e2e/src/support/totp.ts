import { createHmac } from 'node:crypto';

/**
 * The code an authenticator app would show for `secret` right now — RFC 6238, the SHA-1, 30 second,
 * six digit variant every authenticator agrees on. It is what lets a test finish ENROLLING in two
 * factor the way a person does, by proving it holds the secret.
 */
export class Totp {
  private static readonly BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  private static readonly STEP_SECONDS = 30;
  private static readonly DIGITS = 6;

  static now(secret: string, at = Date.now()): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / Totp.STEP_SECONDS)));
    const digest = createHmac('sha1', Totp.decode(secret))
      .update(counter)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** Totp.DIGITS;
    return code.toString().padStart(Totp.DIGITS, '0');
  }

  private static decode(secret: string): Buffer {
    const bits = [...secret.replace(/=+$/, '').toUpperCase()]
      .map((character) =>
        Totp.BASE32.indexOf(character).toString(2).padStart(5, '0'),
      )
      .join('');
    const bytes: number[] = [];
    for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
      bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
    }
    return Buffer.from(bytes);
  }
}
