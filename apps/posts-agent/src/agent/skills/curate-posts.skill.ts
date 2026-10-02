import { Skill } from '@nestposts/ai/domain/skill.entity';

export const CURATE_POSTS = Skill.create({
  name: 'curate-posts',
  description:
    'Changes the title or the content of a post the caller wrote, or deletes it after an explicit confirmation. Use it whenever the person asks to edit, fix, rename, rewrite or delete a post.',
  tags: ['posts', 'write'],
  examples: [
    'Fix the typo in the title of my last post.',
    'Delete my post about the launch.',
  ],
  body: `# curate-posts

1. Find the post first: \`WhoAmI\` lists the person's own posts, newest first; any other post is found as \`browse-posts\` says. Only the post's author may change or delete it.
2. To change a post, call \`UpdatePost\` with its id and only the fields that change; a field left out keeps its current value. Answer with what changed.
3. To delete a post, name it — title and id — and ask for an explicit confirmation. Call \`DeletePost\` only after the person confirms, in a later message: it removes the post and its file, and cannot be undone.
`,
});
