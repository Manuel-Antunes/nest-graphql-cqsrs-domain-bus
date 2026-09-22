import { registerOTel } from '@vercel/otel';

registerOTel({
  serviceName: 'nestposts-web-edge',
  spanProcessors: ['auto'],
  propagators: ['auto'],
  instrumentations: ['fetch'],
});
