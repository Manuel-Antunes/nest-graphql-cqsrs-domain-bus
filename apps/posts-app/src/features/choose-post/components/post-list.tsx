import { useMemo, useState } from 'react';
import { Input } from '@nestposts/ui/components/ui/input';
import { SearchIcon } from 'lucide-react';

import type { FragmentType } from '@/graphql/__gen__';

import { PostRow, type PostRow_post } from './post-row';

export interface PostListEntry {
  id: string;
  title: string;
  row: FragmentType<typeof PostRow_post>;
}

export function PostList({
  posts,
  totalCount,
  onSelect,
}: {
  posts: readonly PostListEntry[];
  totalCount: number;
  onSelect: (postId: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const wanted = filter.trim().toLowerCase();
    return wanted
      ? posts.filter((post) => post.title.toLowerCase().includes(wanted))
      : posts;
  }, [filter, posts]);

  return (
    <section aria-label="Your posts" className="space-y-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-base">
            Which post do you want to edit?
          </h2>
          <p className="text-muted-foreground text-xs">
            {totalCount > posts.length
              ? `Your ${posts.length} latest of ${totalCount} posts.`
              : `${totalCount} ${totalCount === 1 ? 'post' : 'posts'}, newest first.`}
          </p>
        </div>
        <div className="relative w-full sm:w-56">
          <SearchIcon className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
          <Input
            aria-label="Filter by title"
            placeholder="Filter by title"
            className="pl-8"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      </header>
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No post has “{filter.trim()}” in its title.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((post) => (
            <li key={post.id}>
              <PostRow post={post.row} onSelect={() => onSelect(post.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
