import { defineConfig } from '@apollo/client-ai-apps/config';

export default defineConfig({
  name: 'posts',
  description: 'Opens the interactive posts app on screen.',
  csp: {
    baseUriDomains: [],
    connectDomains: [],
    frameDomains: [],
    redirectDomains: [],
    resourceDomains: [],
  },
  widgetSettings: {
    prefersBorder: false,
    description:
      'Your posts: pick one, edit it with a live preview, or approve a draft before it is published.',
  },
});
