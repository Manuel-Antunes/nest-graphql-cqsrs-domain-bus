import { Button } from '@nestposts/ui/components/ui/button';
import { ArrowLeftIcon, FileQuestionIcon } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { PostEditor } from '@/features/edit-post/components/post-editor';
import { usePostEditor } from '@/features/edit-post/hooks/use-post-editor';

export default function EditPostRoute() {
  const { postId = '' } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const cameFromList = useLocation().key !== 'default';
  const { data, loading, error } = usePostEditor(postId);

  if (loading) return <LoadingState label="Opening the post…" />;
  if (error) {
    return <ErrorState title="The post did not open" message={error.message} />;
  }
  if (!data?.post) {
    return (
      <EmptyState
        icon={FileQuestionIcon}
        title="Post not found"
        description="No post has this id: it never existed, or it was deleted."
      />
    );
  }

  return (
    <div>
      {cameFromList ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mx-4 mt-3"
          onClick={() => void navigate(-1)}
        >
          <ArrowLeftIcon />
          All my posts
        </Button>
      ) : null}
      <PostEditor key={data.post.id} post={data.post} />
    </div>
  );
}
