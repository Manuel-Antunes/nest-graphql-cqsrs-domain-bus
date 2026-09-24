'use client';

import { useState } from 'react';
import { Loader2Icon, SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorNotice } from '@/app/_components/error-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FragmentType } from '@/gql';
import { getFragmentData, graphql } from '@/gql';
import type { UploadedFile } from '@/hooks/use-upload-file';
import { useUploadFile } from '@/hooks/use-upload-file';
import { errorShownByHookState } from '@/lib/utils';

export const PostEditor_post = graphql(`
  fragment PostEditor_post on Post {
    id
    title
    content
  }
`);

interface UpdateRunner {
  run: (options: {
    variables: {
      input: {
        id: string;
        title?: string | null;
        content?: string | null;
        asset?: UploadedFile | null;
      };
    };
  }) => Promise<unknown>;
  loading: boolean;
  error?: unknown;
}

export function PostEditor({
  post,
  update,
}: {
  post: FragmentType<typeof PostEditor_post>;
  update: UpdateRunner;
}) {
  const current = getFragmentData(PostEditor_post, post);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileField, setFileField] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const uploadFile = useUploadFile();

  const nothingToSend =
    title.trim() === '' && content.trim() === '' && file === null;

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setUploadError(null);
        let asset: UploadedFile | null = null;
        if (file) {
          setUploading(true);
          try {
            asset = await uploadFile(file);
          } catch (failure) {
            setUploadError(failure);
            return;
          } finally {
            setUploading(false);
          }
        }
        void update
          .run({
            variables: {
              input: {
                id: current.id,
                title: title.trim() === '' ? null : title,
                content: content.trim() === '' ? null : content,
                asset,
              },
            },
          })
          .then(() => {
            toast.success('updatePost aceito', {
              description: asset
                ? 'O anexo foi trocado, e o anterior apagado do bucket.'
                : 'A versão do agregado subiu.',
            });
            setTitle('');
            setContent('');
            setFile(null);
            setFileField((field) => field + 1);
          })
          .catch(errorShownByHookState);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="new-title">Novo título</Label>
        <Input
          id="new-title"
          value={title}
          maxLength={200}
          placeholder={current.title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-content">Novo conteúdo</Label>
        <Textarea
          id="new-content"
          rows={5}
          value={content}
          placeholder={current.content.slice(0, 120)}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-attachment">Novo anexo</Label>
        <Input
          key={fileField}
          id="new-attachment"
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>

      {uploadError ? (
        <ErrorNotice title="O upload do anexo falhou" error={uploadError} />
      ) : null}
      {update.error ? (
        <ErrorNotice title="updatePost falhou" error={update.error} />
      ) : null}

      <Button
        type="submit"
        size="sm"
        disabled={update.loading || uploading || nothingToSend}
      >
        {update.loading || uploading ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <SaveIcon />
        )}
        Enviar o que foi preenchido
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Campos em branco não entram na mutation. Escrever no post de outro autor
        responde <span className="font-mono">FORBIDDEN</span> — a checagem está
        no domínio (<span className="font-mono">Post.assertWrittenBy</span>),
        não no resolver.
      </p>
    </form>
  );
}
