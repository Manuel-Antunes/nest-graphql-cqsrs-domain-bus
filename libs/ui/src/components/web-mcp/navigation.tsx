'use client';

import { z } from 'zod';

import { useMcpTool } from './hooks';

export interface WebMcpNavigationProps {
  pathname: string;
  push: (path: string) => Promise<unknown> | void;
  pathParams?: Record<string, string>;
}

export function WebMcpNavigation({
  pathname,
  push,
  pathParams = {},
}: WebMcpNavigationProps) {
  useMcpTool({
    name: 'navigate_to_page',
    description:
      'Navigates to a specific page based on its contextual name or path. Use this tool if you are not on the correct page to perform an action.',
    input: z.object({
      path: z
        .string()
        .describe(
          'The target path to navigate to (e.g., /dashboard/team-1/exequentes).',
        ),
      params: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional()
        .describe(
          'Optional parameters to include in the navigation. These will be appended as query parameters.',
        ),
    }),
    handler: async (args) => {
      const finalPath = String(args.path).replace(
        /:([a-zA-Z0-9_]+)/g,
        (_m, key: string) => pathParams[key] ?? `:${key}`,
      );

      let pathWithParams = finalPath;
      const providedParams = args.params as Record<string, unknown> | undefined;
      if (providedParams && Object.keys(providedParams).length > 0) {
        const qp = Object.entries(providedParams)
          .flatMap(([k, v]): Array<[string, string]> => {
            if (v === undefined || v === null) return [];
            if (typeof v === 'object') return [[k, JSON.stringify(v)]];
            return [[k, String(v)]];
          })
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');
        if (qp) {
          pathWithParams = `${finalPath}${finalPath.includes('?') ? '&' : '?'}${qp}`;
        }
      }

      try {
        const navResult = push(pathWithParams);
        if (
          navResult &&
          typeof (navResult as Promise<unknown>).then === 'function'
        ) {
          await navResult;
        }
        return {
          content: [
            { type: 'text', text: `Navigated to ${pathWithParams}` },
            {
              type: 'text',
              text: `navigationParams: ${JSON.stringify(providedParams ?? {}, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to navigate to ${pathWithParams}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  });

  useMcpTool({
    name: 'get_navigation_context',
    description:
      'Retrieves the current page context and all available routes in the application.',
    input: z.object({}),
    readOnly: true,
    handler: async () => {
      try {
        const response = await fetch('/.well-known/web-mcp.json');
        const data = (await response.json()) as {
          pages?: Array<{ path?: string; [k: string]: unknown }>;
          [k: string]: unknown;
        };

        const resolvedSitemap = {
          ...data,
          pages: Array.isArray(data.pages)
            ? data.pages.map((p) => {
                const path = String(p.path ?? '');
                const resolvedPath = path.replace(
                  /:([a-zA-Z0-9_]+)/g,
                  (_m, key: string) => pathParams[key] ?? `:${key}`,
                );
                return { ...p, resolvedPath };
              })
            : data.pages,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { currentPath: pathname, sitemap: resolvedSitemap },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching navigation context: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  });

  return null;
}
