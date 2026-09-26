import { graphql } from '../../../gql';

export const CreatePost = graphql(`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
    }
  }
`);

export const RetitlePost = graphql(`
  mutation RetitlePost($input: UpdatePostInput!) {
    updatePost(input: $input) {
      id
      version
    }
  }
`);

export const PostById = graphql(`
  query PostById($id: ID!) {
    post(id: $id) {
      id
    }
  }
`);

export const PostCompletion = graphql(`
  query PostCompletion($id: ID!) {
    post(id: $id) {
      version
      author {
        id
      }
      tags(first: 1) {
        edges {
          node {
            name
          }
        }
      }
    }
  }
`);

export const FeedTotalCount = graphql(`
  query FeedTotalCount {
    posts(first: 1) {
      totalCount
    }
  }
`);

export const OnPostUpdated = graphql(`
  subscription OnPostUpdated($postId: ID) {
    onPostUpdated(postId: $postId) {
      id
      title
    }
  }
`);
