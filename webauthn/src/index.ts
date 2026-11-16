import { base64url, verifyTicket, relyingPartyUrl } from './verify'

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

type Handler = (request: Request, env: Env) => Promise<Response>;
type JsonHandler = (body: Record<string, unknown>, request: Request, env: Env) => Promise<Response>;

function withJsonBody(handler: JsonHandler): Handler {
  return async (request, env) => {
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return json({ error: 'Expected application/json.' }, 415);
    }
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 16_384) return json({ error: 'Request too large.' }, 413);
      body = JSON.parse(text);
    } catch {
      return json({ error: 'Invalid JSON.' }, 400);
    }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid ticket binding.' }, 400);
    return handler(body as Record<string, unknown>, request, env);
  };
}

async function handleBindTicket(body: Record<string, unknown>, _request: Request, env: Env): Promise<Response> {
  const { ticketId, credentialId, publicKey } = body;
  if (typeof ticketId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId) ||
      typeof credentialId !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(credentialId) ||
      typeof publicKey !== 'string' || !/^(?:[0-9a-f]{2}){1,4096}$/i.test(publicKey)) {
    return json({ error: 'Invalid ticket binding.' }, 400);
  }
  try {
    if (await env.TICKETS.get(`ticket:${ticketId}`)) return json({ error: 'Ticket already exists.' }, 409);
    await env.TICKETS.put(`ticket:${ticketId}`, JSON.stringify({ ticketId, credentialId, publicKey }));
    return json({ ticketId }, 201);
  } catch (error) {
    console.error('Failed to save ticket binding', error);
    return json({ error: 'Could not save ticket.' }, 503);
  }
}

async function handleVerifyTicket(body: Record<string, unknown>, request: Request, env: Env): Promise<Response> {
  try {
    return await verifyTicket(body, request, env);
  } catch (error) {
    console.error('Failed to verify ticket', error);
    return json({ error: 'Could not check in. Please try again.' }, 503);
  }
}

async function handleChallenge(_request: Request, env: Env): Promise<Response> {
  const challenge = base64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.TICKETS.put(`challenge:${challenge}`, String(Date.now() + 300_000), { expirationTtl: 300 });
  return json({ challenge });
}

const routes = new Map<string, Handler>([
  ['/bindTicket', withJsonBody(handleBindTicket)],
  ['/verify-ticket', withJsonBody(handleVerifyTicket)],
  ['/verify-ticket/challenge', handleChallenge],
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const handler = routes.get(url.pathname);
    if (!handler) return env.ASSETS.fetch(request);
    if (request.method !== 'POST') {
      return json({ error: 'Use POST for this endpoint.' }, 405, { Allow: 'POST' });
    }
    // !!! SECURITY WARNING: HTTP Origin validation is DISABLED.
    // !!! Restore before production use; cross-origin requests are currently accepted.
    // if (request.headers.get('Origin') && request.headers.get('Origin') !== relyingPartyUrl(request, env).origin) {
    //   return json({ error: 'Cross-origin requests are not allowed.' }, 403);
    // }
    return handler(request, env);
  },
} satisfies ExportedHandler<Env>;
