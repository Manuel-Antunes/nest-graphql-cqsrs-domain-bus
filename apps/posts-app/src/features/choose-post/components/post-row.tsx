import { Badge } from '@nestposts/ui/components/ui/badge';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@nestposts/ui/components/ui/item';
import { ChevronRightIcon } from 'lucide-react';

import { Dates } from '@/components/dates';
import { type FragmentType, getFragmentData, gql } from '@/graphql/__gen__';

export const PostRow_post = gql(`
  fragment PostRow_post on Post {
    title
    updatedAt
    tags(first: 3) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`);

export function PostRow({
  post: postFragment,
  onSelect,
}: {
  post: FragmentType<typeof PostRow_post>;
  onSelect: () => void;
}) {
  const post = getFragmentData(PostRow_post, postFragment);
  return (
    <Item
      variant="outline"
      size="sm"
      render={<button type="button" onClick={onSelect} />}
      className="w-full cursor-pointer text-left hover:bg-muted/50"
    >
      <ItemContent>
        <ItemTitle>{post.title}</ItemTitle>
        <ItemDescription>
          updated {Dates.relative(post.updatedAt)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {post.tags.edges.map(({ node }) => (
          <Badge key={node.id} variant="secondary">
            {node.name}
          </Badge>
        ))}
        <ChevronRightIcon className="text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}
