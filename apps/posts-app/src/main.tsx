import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ApolloProvider } from '@apollo/client-ai-apps/react';

import { App } from './app';
import { LoadingState } from './components/states';
import { PostsClient } from './graphql/posts-client';
import './index.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Suspense fallback={<LoadingState />}>
        <ApolloProvider client={PostsClient.instance()}>
          <App />
        </ApolloProvider>
      </Suspense>
    </StrictMode>,
  );
}
