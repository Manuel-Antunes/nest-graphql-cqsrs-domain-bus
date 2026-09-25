import { useMutation } from '@tanstack/react-query';

import { graphql } from '@/gql';
import { gqlMutationOptions } from '@/lib/graphql/gqlpc';

const GeneratePresignedUrlMutation = graphql(`
  mutation GeneratePresignedUrl($input: GeneratePresignedUrlInput!) {
    generatePresignedUrl(input: $input) {
      url
      key
    }
  }
`);

export interface UploadedFile {
  name: string;
  size: number;
  extname: string;
  mimeType: string;
}

const UNKNOWN_MIME_TYPE = 'application/octet-stream';

const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : 'bin';
};

export function useUploadFile() {
  const { mutateAsync: generatePresignedUrl } = useMutation(
    gqlMutationOptions(GeneratePresignedUrlMutation),
  );

  return async function uploadFile(file: File): Promise<UploadedFile> {
    const mimeType = file.type || UNKNOWN_MIME_TYPE;
    const { generatePresignedUrl: upload } = await generatePresignedUrl({
      input: { mimeType },
    });

    const response = await fetch(upload.url, {
      method: 'PUT',
      headers: { 'content-type': mimeType },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`The storage refused the upload (${response.status})`);
    }

    return {
      name: upload.key,
      size: file.size,
      extname: extensionOf(file.name),
      mimeType,
    };
  };
}
