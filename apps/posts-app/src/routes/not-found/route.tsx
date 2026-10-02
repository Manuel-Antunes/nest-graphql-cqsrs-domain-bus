import { CompassIcon } from 'lucide-react';

import { EmptyState } from '@/components/states';

export default function NotFoundRoute() {
  return (
    <EmptyState
      icon={CompassIcon}
      title="Nothing to show"
      description="The posts app was opened by a tool it does not know."
    />
  );
}
