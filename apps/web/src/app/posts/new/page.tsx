import { CreatePostForm } from './_components/create-post-form';

export default function NewPostPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Escrever</h1>
        <p className="text-muted-foreground text-sm">
          A mutation responde a versão 1 — sem tag. A versão 2 chega depois, por
          outro serviço.
        </p>
      </div>
      <CreatePostForm />
    </div>
  );
}
