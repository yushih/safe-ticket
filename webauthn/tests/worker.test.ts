import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';

const binding = {
  ticketId: '12345678-1234-4123-8123-123456789abc',
  credentialId: 'credential_123',
  publicKey: 'a5010203262001215820',
};
function setup(fail = false) {
  const records = new Map<string, string>();
  const env = {
    TICKETS: { async put(key: string, value: string) {
      if (fail) throw new Error('Storage unavailable');
      records.set(key, value);
    } },
    ASSETS: { async fetch() { return new Response('asset'); } },
  } as unknown as Env;
  const send = (body: unknown = binding, headers = { 'Content-Type': 'application/json' }) =>
    worker.fetch(new Request('https://tickets.example/bindTicket', {
      method: 'POST', headers, body: JSON.stringify(body),
    }), env);
  return { records, env, send };
}
test('persists the three binding fields before confirming success', async () => {
  const { send, records } = setup();
  const response = await send({ ...binding, ignored: true });
  assert.equal(response.status, 201);
  assert.deepEqual(JSON.parse(records.get(`ticket:${binding.ticketId}`)!), binding);
  assert.deepEqual(await response.json(), { ticketId: binding.ticketId });
});
test('rejects invalid bindings without writing', async () => {
  const { send, records } = setup();
  for (const body of [null, {}, { ...binding, ticketId: '' }, { ...binding, credentialId: 'a/b' }, { ...binding, publicKey: 'abc' }]) {
    assert.equal((await send(body)).status, 400);
  }
  assert.equal(records.size, 0);
});
test('handles method, content type, malformed JSON and asset fallback', async () => {
  const { env, send } = setup();
  assert.equal((await worker.fetch(new Request('https://tickets.example/bindTicket'), env)).status, 405);
  assert.equal((await send(binding, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await worker.fetch(new Request('https://tickets.example/bindTicket', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  }), env)).status, 400);
  assert.equal(await (await worker.fetch(new Request('https://tickets.example/'), env)).text(), 'asset');
});
test('does not report success when KV fails', async () => {
  assert.equal((await setup(true).send()).status, 503);
});
