import type { Register, ToolInfo } from '@apollo/client-ai-apps';
import type { InitialEntry, RouteObject } from 'react-router';

import { Drafts } from '@/features/preview-post/draft';

import ChoosePostRoute from './choose-post/route';
import EditPostRoute from './edit-post/route';
import NotFoundRoute from './not-found/route';
import PreviewPostRoute from './preview-post/route';

export const routes: RouteObject[] = [
  { path: '/posts', Component: ChoosePostRoute },
  { path: '/posts/:postId', Component: EditPostRoute },
  { path: '/preview', Component: PreviewPostRoute },
  { path: '*', Component: NotFoundRoute },
];

type ToolInputs = Register extends { toolInputs: infer Inputs }
  ? Inputs
  : never;

type Opening = {
  [Tool in keyof ToolInputs]: (input: ToolInputs[Tool]) => InitialEntry;
};

export class Openings {
  private static readonly BY_TOOL: Opening = {
    ChoosePostToEdit: () => '/posts',
    EditPost: ({ id }) => Openings.post(id),
    PreviewPost: (input) => ({
      pathname: '/preview',
      state: Drafts.from(input),
    }),
    SavePost: ({ id }) => Openings.post(id),
    PublishPost: () => '/posts',
  };

  static for(toolInfo: ToolInfo | undefined): InitialEntry {
    if (!toolInfo) return '/';
    const opening = (
      Openings.BY_TOOL as Record<
        string,
        ((input: unknown) => InitialEntry) | undefined
      >
    )[toolInfo.toolName];
    return opening ? opening(toolInfo.toolInput ?? {}) : '/';
  }

  private static post(id: string | number): string {
    return `/posts/${encodeURIComponent(String(id))}`;
  }
}
