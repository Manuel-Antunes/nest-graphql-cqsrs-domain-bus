import type SharpFactory from 'sharp';

import { OptionalPackage } from '../../domain/file/optional-package';

export type SharpFunction = typeof SharpFactory;

/** `sharp`, loaded the first time an image is converted — and named, when it is not installed. */
export class Sharp {
  static async load(): Promise<SharpFunction> {
    return OptionalPackage.defaultOf(
      await OptionalPackage.load('sharp', () => import('sharp')),
    );
  }
}
