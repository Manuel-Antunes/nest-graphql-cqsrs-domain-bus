/**
 * The failures of this library, one class each, as `@jrmc/adonis-attachment`'s `errors` are one code
 * each. The code is kept on `code`, so a caller can branch on it without importing the class.
 */
export abstract class AttachmentException extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** An optional package a feature needs is not installed: `sharp` for an image converter, say. */
export class MissingPackageException extends AttachmentException {
  readonly code = 'E_MISSING_PACKAGE';

  constructor(
    readonly packageName: string,
    options?: ErrorOptions,
  ) {
    super(`Missing package, please install "${packageName}"`, options);
  }
}

/** A stored value lacks an attribute every attachment has. */
export class CannotCreateAttachmentException extends AttachmentException {
  readonly code = 'E_CANNOT_CREATE_ATTACHMENT';

  constructor(
    readonly attribute: string,
    options?: ErrorOptions,
  ) {
    super(
      `Cannot create attachment from database response. Missing attribute "${attribute}"`,
      options,
    );
  }
}

/** A converter failed, or produced nothing a variant can be made of. */
export class CannotCreateVariantException extends AttachmentException {
  readonly code = 'E_CANNOT_CREATE_VARIANT';

  constructor(reason: string, options?: ErrorOptions) {
    super(`Cannot create variant. "${reason}"`, options);
  }
}

/** A variant was asked for by a name no converter is registered under. */
export class UnknownConverterException extends AttachmentException {
  readonly code = 'E_UNKNOWN_CONVERTER';

  constructor(readonly key: string) {
    super(`No converter is registered as "${key}"`);
  }
}

export class NotABufferException extends AttachmentException {
  readonly code = 'E_ISNOT_BUFFER';

  constructor() {
    super('Is not a Buffer');
  }
}

export class NotBase64Exception extends AttachmentException {
  readonly code = 'E_ISNOT_BASE64';

  constructor() {
    super('Is not a Base64');
  }
}

/** A local file an attachment was asked to be made of does not exist. */
export class FileNotFoundException extends AttachmentException {
  readonly code = 'ENOENT';

  constructor(
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`File not found: ${path}`, options);
  }
}

/** A temporary copy of a stream or a download could not be written. */
export class CannotGenerateTempFileException extends AttachmentException {
  readonly code = 'E_CANNOT_GENERATE_TEMP_FILE';

  constructor(reason: string, options?: ErrorOptions) {
    super(`Cannot generate temp file "${reason}"`, options);
  }
}

/** An asset was read, or asked for a URL, before anything bound it to the disk it lives on. */
export class DiskNotBoundException extends AttachmentException {
  readonly code = 'E_DISK_NOT_BOUND';

  constructor(path: string) {
    super(
      `The asset "${path}" is not bound to a disk: load it through its entity, or bind it with AttachmentManager.bind`,
    );
  }
}

/** An asset that is already stored was asked to be stored again. */
export class AssetAlreadyStoredException extends AttachmentException {
  readonly code = 'E_ALREADY_STORED';

  constructor(path: string) {
    super(`The asset "${path}" is already stored`);
  }
}

/** An external program a converter runs is missing, failed, or ran out of time. */
export class CommandFailedException extends AttachmentException {
  readonly code = 'E_COMMAND_FAILED';

  constructor(
    readonly command: string,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(`"${command}" failed: ${reason}`, options);
  }
}
