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

1. When you have the posts app's tools and the person wants to edit a post themselves: call \`ChoosePostToEdit\` when they did not say which one — they pick it, edit it with a live preview and save it in the app — or \`EditPost\` with its id when you know it.
2. When the person asks you to rewrite or fix a post and you have \`PreviewPost\`, write the new title and content and call it with the post's id: they see the change beside the current version and apply or discard it with the app's buttons. Never call \`UpdatePost\` for that text.
3. Without those tools, find the post first: \`WhoAmI\` lists the person's own posts, newest first; any other post is found as \`browse-posts\` says. Then call \`UpdatePost\` with its id and only the fields that change; a field left out keeps its current value. Answer with what changed. Only the post's author may change or delete it.
4. To delete a post, name it — title and id — and ask for an explicit confirmation. Call \`DeletePost\` only after the person confirms, in a later message: it removes the post and its file, and cannot be undone.
`,
});
