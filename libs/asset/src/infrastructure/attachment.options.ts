import type { StorageSignedUrlRequest } from '@nestjs/storage';

import type { BinPaths, Converter } from '../domain/converter/converter';
import type { VariantLayout } from '../domain/options/attachment-path';
import type { AttachmentLock } from './locking/attachment-lock';

/** Where `AttachmentModule`'s options are provided. */
export const ATTACHMENT_OPTIONS = 'ATTACHMENT_OPTIONS';

/**
 * `AttachmentModule`'s options — `@jrmc/adonis-attachment`'s `config/attachment.ts`. Every column
 * option set here is the default of every `attachment()` that does not set its own.
 */
export interface AttachmentModuleOptions {
  /**
   * The converters variants are made with, by the name a column's `variants` and the route's
   * `?variant=` use.
   *
   * ```ts
   * converters: {
   *   thumbnail: ImageConverter.resize(300).blurhash(),
   *   preview: AutodetectConverter.resize(720),
   * }
   * ```
   */
  converters?: Readonly<Record<string, Converter>>;

  /** `uploads` unless told otherwise. */
  folder?: string;
  /** `true` — a random UUID — unless told otherwise. */
  rename?: boolean | string;
  /** Off unless told otherwise. */
  preComputeUrl?: boolean;
  /** Off unless told otherwise. */
  meta?: boolean;
  /** Off unless told otherwise. */
  keepSource?: boolean;

  /** How signed URLs are made when {@link preComputeUrl} computes one. */
  signedUrl?: StorageSignedUrlRequest;

  /** Where `ffmpeg`, `ffprobe`, `pdftoppm`, `pdfinfo` and `soffice` are, when not on the `PATH`. */
  bin?: BinPaths;
  /** Milliseconds an external program may run. 30 000 unless told otherwise. */
  timeout?: number;
  /** How many attachments have their variants generated at once. 1 unless told otherwise. */
  queue?: { concurrency?: number };
  /** Where variants are stored, relative to their attachment. */
  variant?: VariantLayout;

  /**
   * What key ids are sealed with. Without it attachments have no `keyId` and the attachments route
   * serves nothing.
   */
  secret?: string;

  /** A lock shared by every process that may generate the same variants. One per process otherwise. */
  lock?: AttachmentLock;
}

/** Where the attachments route is served, and what else decorates its controller. */
export interface AttachmentRoute {
  /** `attachments` unless told otherwise: `GET /attachments/:key/:name?variant=thumbnail`. */
  path?: string;
  /**
   * Decorators for the controller — what lets a key id through a global guard, since the key id is
   * the capability: `decorators: [AllowAnonymous()]`.
   */
  decorators?: (ClassDecorator | MethodDecorator | PropertyDecorator)[];
}

export interface AttachmentModuleExtras {
  /** Makes the module global, which it is unless told otherwise. */
  isGlobal: boolean;
  /**
   * Opens the ambient `AttachmentContext` on every HTTP request and every handler call, reading the
   * tenant off the `x-tenant` header. On unless told otherwise.
   */
  context: boolean;
  /** Serves attachments and their variants by key id, generating a missing variant on demand. */
  route: AttachmentRoute | false;
}
