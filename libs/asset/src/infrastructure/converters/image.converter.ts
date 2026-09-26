import type { ConverterInput } from '../../domain/converter/converter';
import { ImageOutputConverter } from './image-output.converter';

/** An image, resized and re-encoded by `sharp`: `ImageConverter.resize(300)`. */
export class ImageConverter extends ImageOutputConverter {
  handle(input: ConverterInput): Promise<Buffer> {
    return this.toImage(input);
  }
}
