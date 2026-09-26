import { stat } from 'node:fs/promises';

import type { AssetMeta } from '../../domain/asset/schemas/asset-meta.schema';
import type { ConverterContext } from '../../domain/converter/converter';
import { CannotCreateVariantException } from '../../domain/errors/attachment.exceptions';
import { TemporaryFile } from '../../domain/file/temporary-file';
import { Command } from './command';

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}

interface ProbeOutput {
  streams?: ProbeStream[];
  format?: { duration?: string };
}

/** `ffmpeg` and `ffprobe`: a frame of a video, and what the video is. */
export class FFmpeg {
  /** Writes the frame at `seconds` to a temporary JPEG and answers with its path. */
  static async screenshot(
    input: string,
    seconds: number,
    context: ConverterContext,
  ): Promise<string> {
    const output = TemporaryFile.path('jpg');
    const { stderr } = await Command.run(
      context.bin.ffmpeg ?? 'ffmpeg',
      [
        '-y',
        '-ss',
        String(seconds),
        '-i',
        input,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        output,
      ],
      context.timeout,
    );
    if (!(await FFmpeg.wrote(output))) {
      await TemporaryFile.remove(output);
      const duration = /Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/.exec(stderr)?.[1];
      throw new CannotCreateVariantException(
        duration
          ? `the video lasts ${duration}, which is shorter than ${seconds}s`
          : `ffmpeg wrote no frame at ${seconds}s`,
      );
    }
    return output;
  }

  static async probe(
    input: string,
    context: ConverterContext,
  ): Promise<AssetMeta | undefined> {
    const { stdout } = await Command.run(
      context.bin.ffprobe ?? 'ffprobe',
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        input,
      ],
      context.timeout,
    );
    const probe = JSON.parse(stdout) as ProbeOutput;
    const video = probe.streams?.find(
      (stream) => stream.codec_type === 'video',
    );
    const audio = probe.streams?.find(
      (stream) => stream.codec_type === 'audio',
    );
    if (!video?.width || !video.height) {
      return undefined;
    }
    return {
      dimension: { width: video.width, height: video.height },
      duration: Number(probe.format?.duration) || undefined,
      videoCodec: video.codec_name,
      audioCodec: audio?.codec_name,
    };
  }

  private static async wrote(path: string): Promise<boolean> {
    const stats = await stat(path).catch(() => undefined);
    return (stats?.size ?? 0) > 0;
  }
}
