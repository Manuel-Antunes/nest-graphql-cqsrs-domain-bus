import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from '@copilotkit/runtime/v2';

import { TheoAgent } from '@/lib/agents/theo-agent.server';
import { WebAuth } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const copilotRuntime = createCopilotRuntimeHandler({
  runtime: new CopilotRuntime({
    agents: async () => {
      const identity = await WebAuth.identity();
      if (!identity) throw new Error('Nobody is signed in to talk to Theo.');
      return { [TheoAgent.ID]: TheoAgent.for(identity) };
    },
  }),
  basePath: '/api/copilotkit',
});

async function handle(request: Request): Promise<Response> {
  if (!(await WebAuth.identity())) {
    return Response.json(
      { error: 'Sign in to talk to Theo.' },
      { status: 401 },
    );
  }
  return copilotRuntime(request);
}

export { handle as DELETE, handle as GET, handle as PATCH, handle as POST };
