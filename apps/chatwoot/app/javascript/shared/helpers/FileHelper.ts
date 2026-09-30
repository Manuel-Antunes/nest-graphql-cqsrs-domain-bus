import { getAllowedFileTypesByChannel } from '@chatwoot/utils';
import { INBOX_TYPES } from 'dashboard/helper/inbox';

// `getAllowedFileTypesByChannel` types channelType as the internal `ChannelKey`
// union (not exported). Extract it from the signature so the runtime string we
// pass type-checks without reaching for `any`.
type ChannelType = NonNullable<
  Parameters<typeof getAllowedFileTypesByChannel>[0]
>['channelType'];

export const DEFAULT_MAXIMUM_FILE_UPLOAD_SIZE = 40;

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / k ** i).toFixed(dm)) + ' ' + sizes[i];
};

export const fileSizeInMegaBytes = (bytes: number): number => {
  return bytes / (1024 * 1024);
};

interface FileSizeShape {
  file?: { size?: number };
  size?: number;
}

export const checkFileSizeLimit = (
  file: FileSizeShape,
  maximumUploadLimit: number
): boolean => {
  const fileSize = (file?.file?.size || file?.size) as number;
  const fileSizeInMB = fileSizeInMegaBytes(fileSize);
  return fileSizeInMB <= maximumUploadLimit;
};

export const resolveMaximumFileUploadSize = (value: unknown): number => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_MAXIMUM_FILE_UPLOAD_SIZE;
  }

  return parsedValue;
};

interface FileTypeValidationOptions {
  channelType?: string;
  medium?: string;
  conversationType?: string;
  isInstagramChannel?: boolean;
  isOnPrivateNote?: boolean;
}

/**
 * Validates if a file type is allowed for a specific channel
 * @param file - The file to validate
 * @param options - Validation options
 * @returns True if file type is allowed, false otherwise
 */
export const isFileTypeAllowedForChannel = (
  file: File,
  options: FileTypeValidationOptions = {}
): boolean => {
  if (!file || file.size === 0) return false;

  const {
    channelType: originalChannelType,
    medium,
    conversationType,
    isInstagramChannel,
    isOnPrivateNote,
  } = options;

  const allowedFileTypes = isOnPrivateNote
    ? getAllowedFileTypesByChannel()
    : getAllowedFileTypesByChannel({
        channelType: (isInstagramChannel ||
        conversationType === 'instagram_direct_message'
          ? INBOX_TYPES.INSTAGRAM
          : originalChannelType) as ChannelType,
        medium,
      });

  // Convert to array and validate
  const allowedTypesArray = allowedFileTypes
    .split(',')
    .map((t: string) => t.trim());
  const fileExtension = `.${file.name.split('.').pop()}`;

  return allowedTypesArray.some((allowedType: string) => {
    // Check for exact file extension match
    if (allowedType === fileExtension) return true;

    // Check for wildcard MIME type (e.g., image/*)
    if (allowedType.endsWith('/*')) {
      const prefix = allowedType.slice(0, -2); // Remove '/*'
      return file.type.startsWith(prefix + '/');
    }

    // Check for exact MIME type match
    return allowedType === file.type;
  });
};
