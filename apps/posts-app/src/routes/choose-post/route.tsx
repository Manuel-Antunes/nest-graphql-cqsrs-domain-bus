import { FileTextIcon } from 'lucide-react';
import { useNavigate } from 'react-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { PostList } from '@/features/choose-post/components/post-list';
import { useMyPosts } from '@/features/choose-post/hooks/use-my-posts';

export default function ChoosePostRoute() {
  const navigate = useNavigate();
  const { data, loading, error } = useMyPosts();

  if (loading) return <LoadingState label="Loading your posts…" />;
  if (error) {
    return (
      <ErrorState title="Your posts did not load" message={error.message} />
    );
  }

  const me = data?.me;
  if (me?.__typename !== 'Author') {
    return (
      <EmptyState
        icon={FileTextIcon}
        title="You have no posts"
        description="Only an author writes posts. Subscribe to a plan on the blog to become one."
      />
    );
  }
  if (me.posts.edges.length === 0) {
    return (
      <EmptyState
        icon={FileTextIcon}
        title="You have not written a post yet"
        description="Ask for a draft and it will be previewed here before anything is published."
      />
    );
  }

  return (
    <PostList
      totalCount={me.posts.totalCount ?? me.posts.edges.length}
      posts={me.posts.edges.map(({ node }) => ({
        id: node.id,
        title: node.title,
        row: node,
      }))}
      onSelect={(postId) =>
        void navigate(`/posts/${encodeURIComponent(postId)}`)
      }
    />
  );
}
