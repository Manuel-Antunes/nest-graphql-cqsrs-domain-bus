import { readFile } from 'node:fs/promises';

import type { AssetMeta } from '../../domain/asset/schemas/asset-meta.schema';
import type { ConverterContext } from '../../domain/converter/converter';
import type { LocalInput } from '../../domain/file/local-input';
import { OptionalPackage } from '../../domain/file/optional-package';
import { TemporaryFile } from '../../domain/file/temporary-file';
import { FFmpeg } from './ffmpeg';
import { Poppler } from './poppler';

interface Tag {
  value?: unknown;
  description?: string;
}

type TagGroup = Record<string, Tag | undefined>;

interface ExpandedTags {
  exif?: TagGroup;
  png?: TagGroup;
  pngFile?: TagGroup;
  file?: TagGroup;
  icc?: TagGroup;
  gps?: Record<string, number | undefined>;
}

/**
 * What a file says about itself — `@jrmc/adonis-attachment`'s `meta`: an image's EXIF (`exifreader`),
 * a video's dimensions, duration and codecs (`ffprobe`), a PDF's pages and version (`pdfinfo`).
 */
export class MediaMeta {
  static async read(
    input: LocalInput,
    mimeType: string,
    context: ConverterContext,
  ): Promise<AssetMeta | undefined> {
    const meta = await MediaMeta.readRaw(input, mimeType, context);
    return meta ? MediaMeta.compact(meta) : undefined;
  }

  private static readRaw(
    input: LocalInput,
    mimeType: string,
    context: ConverterContext,
  ): Promise<AssetMeta | undefined> {
    if (mimeType.startsWith('image/')) {
      return MediaMeta.ofImage(input);
    }
    if (mimeType.startsWith('video/')) {
      return MediaMeta.fromPath(input, (path) => FFmpeg.probe(path, context));
    }
    if (mimeType === 'application/pdf') {
      return MediaMeta.fromPath(input, (path) => Poppler.info(path, context));
    }
    return Promise.resolve(undefined);
  }

  private static compact<T>(value: T): T {
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, MediaMeta.compact(entry)]),
    ) as T;
  }

  private static async ofImage(
    input: LocalInput,
  ): Promise<AssetMeta | undefined> {
    const ExifReader = OptionalPackage.defaultOf(
      await OptionalPackage.load('exifreader', () => import('exifreader')),
    );
    const buffer = Buffer.isBuffer(input) ? input : await readFile(input);
    const tags = (await Promise.resolve(
      ExifReader.load(buffer, { expanded: true }),
    ).catch(() => undefined)) as ExpandedTags | undefined;
    if (!tags) {
      return undefined;
    }
    const meta: AssetMeta = {};
    MediaMeta.readExif(tags.exif, meta);
    MediaMeta.readGps(tags.gps, meta);
    MediaMeta.readPng(tags.png, meta);
    MediaMeta.readDimension(tags.pngFile, meta);
    MediaMeta.readDimension(tags.file, meta);
    MediaMeta.readIcc(tags.icc, meta);
    return Object.keys(meta).length > 0 ? meta : undefined;
  }

  private static readExif(exif: TagGroup | undefined, meta: AssetMeta): void {
    if (!exif) return;
    meta.date = exif.DateTime?.description ?? meta.date;
    meta.host = exif.Software?.description ?? meta.host;
    const width = MediaMeta.number(exif.PixelXDimension?.value);
    const height = MediaMeta.number(exif.PixelYDimension?.value);
    if (width && height) {
      meta.dimension = { width, height };
    }
    const orientation = MediaMeta.number(exif.Orientation?.value);
    if (orientation) {
      meta.orientation = {
        value: orientation,
        description: exif.Orientation?.description,
      };
    }
  }

  private static readGps(gps: ExpandedTags['gps'], meta: AssetMeta): void {
    if (gps?.Latitude === undefined && gps?.Longitude === undefined) return;
    meta.gps = {
      latitude: gps.Latitude,
      longitude: gps.Longitude,
      altitude: gps.Altitude,
    };
  }

  private static readPng(png: TagGroup | undefined, meta: AssetMeta): void {
    if (!png) return;
    MediaMeta.readDimension(png, meta);
    meta.host = png.Software?.description ?? meta.host;
    meta.date = png['Creation Time']?.description ?? meta.date;
  }

  private static readIcc(icc: TagGroup | undefined, meta: AssetMeta): void {
    if (!icc) return;
    meta.host = icc.Software?.description ?? meta.host;
    meta.date = icc['Creation Time']?.description ?? meta.date;
    MediaMeta.readDimension(icc, meta);
  }

  private static readDimension(
    group: TagGroup | undefined,
    meta: AssetMeta,
  ): void {
    const width = MediaMeta.number(group?.['Image Width']?.value);
    const height = MediaMeta.number(group?.['Image Height']?.value);
    if (width && height) {
      meta.dimension = { width, height };
    }
  }

  private static number(value: unknown): number | undefined {
    const parsed =
      typeof value === 'string' ? Number.parseInt(value, 10) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed)
      ? parsed
      : undefined;
  }

  private static async fromPath<T>(
    input: LocalInput,
    read: (path: string) => Promise<T>,
  ): Promise<T> {
    const path = await TemporaryFile.pathOf(input);
    try {
      return await read(path);
    } finally {
      if (path !== input) {
        await TemporaryFile.release(path);
      }
    }
  }
}
