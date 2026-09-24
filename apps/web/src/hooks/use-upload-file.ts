import { useMutation } from '@apollo/client/react';

import { graphql } from '@/gql';

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
  const [generatePresignedUrl] = useMutation(GeneratePresignedUrlMutation);

  return async function uploadFile(file: File): Promise<UploadedFile> {
    const mimeType = file.type || UNKNOWN_MIME_TYPE;
    const { data } = await generatePresignedUrl({
      variables: { input: { mimeType } },
    });
    const upload = data?.generatePresignedUrl;
    if (!upload) {
      throw new Error('generatePresignedUrl answered without an upload URL');
    }

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
