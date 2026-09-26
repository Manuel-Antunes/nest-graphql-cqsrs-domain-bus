import type { BlurhashOptions } from '../../domain/converter/converter';
import type { LocalInput } from '../../domain/file/local-input';
import { OptionalPackage } from '../../domain/file/optional-package';
import { Sharp } from './sharp';

const SAMPLE_SIZE = 64;

/** A [blurhash](https://blurha.sh) of an image, computed from a small copy of it. */
export class Blurhash {
  static readonly DEFAULTS: BlurhashOptions = { componentX: 4, componentY: 4 };

  static async encode(
    input: LocalInput,
    options: BlurhashOptions = Blurhash.DEFAULTS,
  ): Promise<string> {
    const sharp = await Sharp.load();
    const { encode } = await OptionalPackage.load(
      'blurhash',
      () => import('blurhash'),
    );
    const { data, info } = await sharp(input)
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    return encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      options.componentX,
      options.componentY,
    );
  }
}
