import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { Button } from '@nestposts/ui/components/ui/button';
import { Input } from '@nestposts/ui/components/ui/input';
import { Label } from '@nestposts/ui/components/ui/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@nestposts/ui/components/ui/tabs';
import { Textarea } from '@nestposts/ui/components/ui/textarea';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
} from 'lucide-react';

import { Dates } from '@/components/dates';
import { PostBody } from '@/components/post-body';
import { type FragmentType, getFragmentData } from '@/graphql/__gen__';
import { Blog, useConversation } from '@/mcp/host';

import {
  PostEditor_post,
  TITLE_MAX_LENGTH,
} from '../../edit-post/components/post-editor';
import { useSavePost } from '../../edit-post/hooks/use-post-editor';
import type { Draft } from '../draft';
import { usePublishPost } from '../hooks/use-draft-preview';

type Outcome =
  | { kind: 'published'; id: string; title: string }
  | { kind: 'applied'; id: string; title: string; version: number }
  | { kind: 'discarded' };

export function DraftPreview({
  draft: proposed,
  author,
  current: currentFragment,
}: {
  draft: Draft;
  author?: string;
  current?: FragmentType<typeof PostEditor_post> | null;
}) {
  const current = currentFragment
    ? getFragmentData(PostEditor_post, currentFragment)
    : undefined;
  const [draft, setDraft] = useState(proposed);
  const [adjusting, setAdjusting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();
  const [publish, publishing] = usePublishPost();
  const [apply, applying] = useSavePost();
  const { tell, open } = useConversation();

  const busy = publishing.loading || applying.loading;
  const failure = publishing.error ?? applying.error;
  const valid = draft.title.trim() !== '' && draft.content.trim() !== '';
  const adjusted =
    draft.title !== proposed.title || draft.content !== proposed.content;

  const accept = async () => {
    if (current) {
      const { data } = await apply({
        variables: {
          id: current.id,
          title: draft.title,
          content: draft.content,
        },
      });
      if (!data?.updatePost) return;
      setOutcome({ kind: 'applied', ...data.updatePost });
      tell(
        `I approved the preview and applied the change to the post “${data.updatePost.title}” (id ${data.updatePost.id})${adjusted ? ', after adjusting the text myself' : ''}.`,
      );
      return;
    }
    const { data } = await publish({
      variables: { title: draft.title, content: draft.content },
    });
    if (!data?.createPost) return;
    setOutcome({ kind: 'published', ...data.createPost });
    tell(
      `I approved the preview and published the post “${data.createPost.title}” (id ${data.createPost.id})${adjusted ? ', after adjusting the text myself' : ''}.`,
    );
  };

  const discard = () => {
    setOutcome({ kind: 'discarded' });
    tell(
      `I discarded the preview of “${draft.title.trim() || 'the draft'}”: nothing was ${current ? 'changed' : 'published'}.`,
    );
  };

  if (outcome) return <Settled outcome={outcome} onOpen={open} />;

  const body = (
    <PostBody
      title={draft.title}
      content={draft.content}
      author={author}
      when={current ? 'proposed change' : 'not published yet'}
      tags={current?.tags.edges.map(({ node }) => node.name)}
    />
  );

  return (
    <section aria-label="Post preview" className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-base">
          {current ? `A change to “${current.title}”` : 'A new post'}
        </h2>
        <Badge variant="outline">preview</Badge>
        {adjusted ? <Badge variant="secondary">adjusted by you</Badge> : null}
      </header>

      {adjusting ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="draft-title">Title</Label>
            <Input
              id="draft-title"
              value={draft.title}
              maxLength={TITLE_MAX_LENGTH}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-content">Content</Label>
            <Textarea
              id="draft-content"
              rows={8}
              value={draft.content}
              onChange={(event) =>
                setDraft({ ...draft, content: event.target.value })
              }
            />
          </div>
        </div>
      ) : null}

      {current ? (
        <Tabs defaultValue="proposed">
          <TabsList>
            <TabsTrigger value="proposed">Proposed</TabsTrigger>
            <TabsTrigger value="current">Current</TabsTrigger>
          </TabsList>
          <TabsContent value="proposed" className="pt-2">
            {body}
          </TabsContent>
          <TabsContent value="current" className="pt-2">
            <PostBody
              title={current.title}
              content={current.content}
              author={current.author.name}
              when={`updated ${Dates.relative(current.updatedAt)}`}
              tags={current.tags.edges.map(({ node }) => node.name)}
            />
          </TabsContent>
        </Tabs>
      ) : (
        body
      )}

      {failure ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>
            {current
              ? 'The change was not applied'
              : 'The post was not published'}
          </AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!valid || busy}
          onClick={() => void accept().catch(() => undefined)}
        >
          <SendIcon />
          {busy
            ? current
              ? 'Applying…'
              : 'Publishing…'
            : current
              ? 'Apply change'
              : 'Publish'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setAdjusting((open) => !open)}
        >
          <PencilIcon />
          {adjusting ? 'Done adjusting' : 'Adjust text'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={discard}>
          <Trash2Icon />
          Discard
        </Button>
      </div>
    </section>
  );
}

function Settled({
  outcome,
  onOpen,
}: {
  outcome: Outcome;
  onOpen: (url: string) => void;
}) {
  if (outcome.kind === 'discarded') {
    return (
      <Alert className="m-4 w-auto">
        <Trash2Icon />
        <AlertTitle>Discarded</AlertTitle>
        <AlertDescription>
          Nothing was saved. Ask for another version whenever you like.
        </AlertDescription>
      </Alert>
    );
  }
  const link = Blog.postUrl(outcome.id);
  return (
    <Alert className="m-4 w-auto">
      <CircleCheckIcon />
      <AlertTitle>
        {outcome.kind === 'published' ? 'Published' : 'Change applied'}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          “{outcome.title}”
          {outcome.kind === 'applied'
            ? ` is now at version ${outcome.version}.`
            : ' is on the blog; its tags arrive in a moment.'}
        </p>
        {link ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => onOpen(link)}
          >
            <ExternalLinkIcon />
            Open on the blog
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
