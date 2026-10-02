import { FileQuestionIcon } from 'lucide-react';
import { useLocation } from 'react-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { DraftPreview } from '@/features/preview-post/components/draft-preview';
import { Drafts } from '@/features/preview-post/draft';
import {
  useCurrentPost,
  useDraftAuthor,
} from '@/features/preview-post/hooks/use-draft-preview';

export default function PreviewPostRoute() {
  const state: unknown = useLocation().state;
  const draft = Drafts.isDraft(state) ? state : Drafts.from(state);
  const author = useDraftAuthor();
  const current = useCurrentPost(draft.postId);

  if (author.loading || current.loading) {
    return <LoadingState label="Preparing the preview…" />;
  }
  const error = author.error ?? current.error;
  if (error) {
    return (
      <ErrorState title="The preview did not load" message={error.message} />
    );
  }
  if (draft.postId && !current.data?.post) {
    return (
      <EmptyState
        icon={FileQuestionIcon}
        title="The post to change was not found"
        description="This preview changes a post that no longer exists."
      />
    );
  }

  return (
    <DraftPreview
      draft={draft}
      author={author.data?.me.name}
      current={current.data?.post}
    />
  );
}
