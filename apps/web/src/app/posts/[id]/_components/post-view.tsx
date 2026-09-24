'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@nestposts/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nestposts/ui/components/ui/card';
import { FileQuestionIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/app/_components/empty-state';
import { ErrorNotice } from '@/app/_components/error-notice';
import { PostArticle } from '@/app/_components/post-article';
import { useSession } from '@/app/_providers/session-provider';
import { cn, errorShownByHookState } from '@/lib/utils';

import { usePost } from '../_hooks/use-post';
import { PostEditor } from './post-editor';

export function PostView({ id }: { id: string }) {
  const { post, error, update, remove } = usePost(id);
  const { session, isAuthor } = useSession();
  const router = useRouter();

  if (error)
    return <ErrorNotice title="Não foi possível ler o post" error={error} />;

  if (!post) {
    return (
      <EmptyState
        icon={FileQuestionIcon}
        title="Post não encontrado"
        description="post(id:) respondeu null: o id não existe, ou o post foi apagado logicamente — a exclusão é lógica, e a linha some das consultas sem sair do banco."
        action={
          <Link
            href="/feed"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Voltar ao feed
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <PostArticle post={post} />

      {session && isAuthor ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Editar</CardTitle>
            <CardDescription>
              Ser autor autoriza a escrever, não a escrever no alheio — quem
              decide é o agregado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <PostEditor post={post} update={update} />
            {remove.error ? (
              <ErrorNotice title="deletePost falhou" error={remove.error} />
            ) : null}
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.loading}
              onClick={() => {
                void remove
                  .run()
                  .then(() => {
                    toast.success('Post excluído', {
                      description: 'O anexo foi apagado do bucket.',
                    });
                    router.push('/feed');
                  })
                  .catch(errorShownByHookState);
              }}
            >
              {remove.loading ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <Trash2Icon />
              )}
              Excluir post
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
