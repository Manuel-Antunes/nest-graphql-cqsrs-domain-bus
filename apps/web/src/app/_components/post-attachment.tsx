import Image from 'next/image';
import { PaperclipIcon } from 'lucide-react';

import type { FragmentType } from '@/gql';
import { getFragmentData, graphql } from '@/gql';

export const PostAttachment_asset = graphql(`
  fragment PostAttachment_asset on Asset {
    name
    url
    mimeType
    size
  }
`);

const sizeOf = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function PostAttachment({
  asset,
}: {
  asset: FragmentType<typeof PostAttachment_asset>;
}) {
  const data = getFragmentData(PostAttachment_asset, asset);
  if (!data.url) {
    return null;
  }

  return (
    <figure className="space-y-2">
      {data.mimeType.startsWith('image/') ? (
        <Image
          src={data.url}
          alt="Anexo do post"
          width={1200}
          height={800}
          unoptimized
          className="h-auto max-h-96 w-auto rounded-lg border object-contain"
        />
      ) : null}
      <figcaption className="flex items-center gap-2 text-muted-foreground text-xs">
        <PaperclipIcon className="size-3.5" />
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Abrir o anexo
        </a>
        <span>
          {data.mimeType} · {sizeOf(data.size)}
        </span>
      </figcaption>
    </figure>
  );
}
