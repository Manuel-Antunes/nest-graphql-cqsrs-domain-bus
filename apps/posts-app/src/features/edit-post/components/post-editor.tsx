import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
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
  SaveIcon,
  Undo2Icon,
} from 'lucide-react';

import { Dates } from '@/components/dates';
import { PostBody } from '@/components/post-body';
import { type FragmentType, getFragmentData, gql } from '@/graphql/__gen__';
import { Blog, useConversation } from '@/mcp/host';

import { useSavePost } from '../hooks/use-post-editor';

export const PostEditor_post = gql(`
  fragment PostEditor_post on Post {
    id
    title
    content
    updatedAt
    version
    author {
      id
      name
    }
    tags(first: 10) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`);

export const TITLE_MAX_LENGTH = 200;

export function PostEditor({
  post: postFragment,
}: {
  post: FragmentType<typeof PostEditor_post>;
}) {
  const post = getFragmentData(PostEditor_post, postFragment);
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [save, { loading, error, data }] = useSavePost();
  const { tell, open } = useConversation();

  const changed = title !== post.title || content !== post.content;
  const valid = title.trim() !== '' && content.trim() !== '';
  const saved = data?.updatePost && !changed ? data.updatePost : undefined;
  const link = Blog.postUrl(post.id);

  const submit = async () => {
    const { data: answer } = await save({
      variables: {
        id: post.id,
        title: title === post.title ? null : title,
        content: content === post.content ? null : content,
      },
    });
    if (answer?.updatePost) {
      tell(
        `I saved my changes to the post “${answer.updatePost.title}” (id ${answer.updatePost.id}) in the posts app; it is now at version ${answer.updatePost.version}.`,
      );
    }
  };

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit().catch(() => undefined);
      }}
    >
      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="post-title">Title</Label>
            <Input
              id="post-title"
              value={title}
              maxLength={TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-content">Content</Label>
            <Textarea
              id="post-content"
              rows={10}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </TabsContent>
        <TabsContent value="preview" className="pt-2">
          <PostBody
            title={title}
            content={content}
            author={post.author.name}
            when={
              changed
                ? 'unsaved changes'
                : `updated ${Dates.relative(post.updatedAt)}`
            }
            tags={post.tags.edges.map(({ node }) => node.name)}
          />
        </TabsContent>
      </Tabs>

      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>The post was not saved</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
      {saved ? (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>
            The post is at version {saved.version}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!changed || !valid || loading}>
          <SaveIcon />
          {loading ? 'Saving…' : 'Save changes'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!changed || loading}
          onClick={() => {
            setTitle(post.title);
            setContent(post.content);
          }}
        >
          <Undo2Icon />
          Discard changes
        </Button>
        {link ? (
          <Button
            type="button"
            variant="link"
            className="ms-auto"
            onClick={() => open(link)}
          >
            <ExternalLinkIcon />
            Open on the blog
          </Button>
        ) : null}
      </div>
    </form>
  );
}
