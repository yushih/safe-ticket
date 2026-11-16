function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== '/bindTicket') {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Use POST to bind a ticket.' }, 405, { Allow: 'POST' });
    }
    if (request.headers.get('Origin') && request.headers.get('Origin') !== new URL(request.url).origin) {
      return json({ error: 'Cross-origin requests are not allowed.' }, 403);
    }
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
    const { ticketId, credentialId, publicKey } = body as Record<string, unknown>;
    if (typeof ticketId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId) ||
        typeof credentialId !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(credentialId) ||
        typeof publicKey !== 'string' || !/^(?:[0-9a-f]{2}){1,4096}$/i.test(publicKey)) {
      return json({ error: 'Invalid ticket binding.' }, 400);
    }
    try {
      await env.TICKETS.put(`ticket:${ticketId}`, JSON.stringify({ ticketId, credentialId, publicKey }));
      return json({ ticketId }, 201);
    } catch (error) {
      console.error('Failed to save ticket binding', error);
      return json({ error: 'Could not save ticket.' }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
