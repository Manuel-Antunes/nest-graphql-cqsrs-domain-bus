import { Skill } from '@nestposts/ai/domain/skill.entity';

export const BROWSE_POSTS = Skill.create({
  name: 'browse-posts',
  description:
    'Lists the blog posts and reads any of them in full, with its author and tags. Use it to answer what was published, to find a post by its title or subject, and before acting on a post whose id the person did not give.',
  tags: ['posts', 'read'],
  examples: ['What was published lately?', 'Show me the post about A2A.'],
  body: `# browse-posts

1. \`ListPosts\` answers one page at a time, oldest first, without the content. Page with \`after\` = the previous page's \`pageInfo.endCursor\` while \`pageInfo.hasNextPage\` is true; the newest posts are on the last page.
2. To find a post by its title or subject, read the candidates with \`GetPost\`. Never invent a post id: a post you act on is one \`ListPosts\` or \`GetPost\` gave you in this conversation.
3. \`GetPost\` answers null for an id no post has: say there is no such post.
4. When you list posts, give one per line: title, author and date. When you show one, give its title, author, date, tags and content.
`,
});
