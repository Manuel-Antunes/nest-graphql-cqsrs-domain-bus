import { Skill } from '@nestposts/ai/domain/skill.entity';

export const PUBLISH_POSTS = Skill.create({
  name: 'publish-posts',
  description:
    'Drafts and publishes a post signed by the caller, who must be an author. Use it whenever the person asks to write, publish or post something new.',
  tags: ['posts', 'write'],
  examples: ['Publish a post titled "Hello" saying that we are live.'],
  body: `# publish-posts

1. Only an author may publish. When you do not know whether the person is one, call \`WhoAmI\`: a reader gets no \`posts\` field and cannot write — say so instead of trying.
2. Draft the title (at most 200 characters) and the content from what the person asked.
3. When you have \`PreviewPost\`, call it with the title and the content: the person sees the post exactly as it will look on the blog, and publishes it, adjusts it or discards it with the app's buttons. The app publishes it, so never call \`CreatePost\` for that text; answer in one sentence that the preview is on screen.
4. Without \`PreviewPost\`, unless the person dictated both word for word, show the title and the content and ask whether to publish them; publish with \`CreatePost\` only after they agree, in a later message, then answer with the title and the id of the post.
5. The post is tagged automatically a moment after it is published, so its tags may still be empty: do not promise any tag.
`,
});
