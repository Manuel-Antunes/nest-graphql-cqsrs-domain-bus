import type {
  ConverterContext,
  ConverterInput,
} from '../../domain/converter/converter';
import { FFmpeg } from '../media/ffmpeg';
import type { ImageOutputOptions } from './image-output.converter';
import { ImageOutputConverter } from './image-output.converter';

export interface VideoThumbnailOptions extends ImageOutputOptions {
  /** The second the frame is taken at. 2 unless told otherwise. */
  startTime?: number;
}

/** A frame of a video, taken by `ffmpeg`: `VideoThumbnailConverter.at(2).resize(720)`. */
export class VideoThumbnailConverter extends ImageOutputConverter<VideoThumbnailOptions> {
  static at<T extends VideoThumbnailConverter>(
    this: new () => T,
    seconds: number,
  ): T {
    return new this().at(seconds);
  }

  at(seconds: number): this {
    return this.with({ startTime: seconds });
  }

  handle(input: ConverterInput, context: ConverterContext): Promise<Buffer> {
    return this.throughFile(input, context.file?.extname, async (path) =>
      this.fromRendered(
        await FFmpeg.screenshot(path, this.options.startTime ?? 2, context),
      ),
    );
  }
}
