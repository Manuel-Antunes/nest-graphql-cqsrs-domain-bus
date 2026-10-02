import { useState } from 'react';
import { useToolInfo } from '@apollo/client-ai-apps/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { useHostTheme } from './mcp/host';
import { Openings, routes } from './routes/routes';

export function App() {
  useHostTheme();
  const toolInfo = useToolInfo();
  const [router] = useState(() =>
    createMemoryRouter(routes, { initialEntries: [Openings.for(toolInfo)] }),
  );
  return <RouterProvider router={router} />;
}
