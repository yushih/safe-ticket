import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encode } from 'cbor-x'
import { verifyTicket, base64url } from '../src/verify.ts'

test('verifies signatures and rejects tampering, expired challenges, and used tickets', async () => {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', key.publicKey)
  const ticketId = crypto.randomUUID()
  const challenge = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const publicKey = Buffer.from(encode(new Map([
    [1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')],
  ]))).toString('hex')
  const values = new Map([
    [`ticket:${ticketId}`, JSON.stringify({ ticketId, credentialId: 'credential', publicKey })],
    [`challenge:${challenge}`, String(Date.now() + 300000)],
  ])
  const env = { TICKETS: {
    async get(k: string, format?: string) { const v = values.get(k) ?? null; return v && format === 'json' ? JSON.parse(v) : v },
    async put(k: string, v: string) { values.set(k, v) },
    async delete(k: string) { values.delete(k) },
  } } as unknown as Env
  const client = Buffer.from(JSON.stringify({ type: 'webauthn.get', origin: 'https://tickets.example', challenge, crossOrigin: false }))
  const auth = Buffer.alloc(37)
  auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256', Buffer.from('tickets.example'))))
  auth[32] = 5
  const signed = Buffer.concat([auth, Buffer.from(await crypto.subtle.digest('SHA-256', client))])
  const raw = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, signed))
  const integers = [raw.subarray(0, 32), raw.subarray(32)].map(part => {
    while (part.length > 1 && part[0] === 0) part = part.subarray(1)
    if (part[0] & 128) part = Buffer.concat([Buffer.from([0]), part])
    return Buffer.concat([Buffer.from([2, part.length]), part])
  })
  const sequence = Buffer.concat(integers)
  const signature = Buffer.concat([Buffer.from([48, sequence.length]), sequence])
  const body = { credentialId: 'credential', userHandle: base64url(Buffer.from(ticketId)), clientDataJSON: base64url(client), authenticatorData: base64url(auth), signature: base64url(signature) }
  const request = new Request('https://tickets.example/verify-ticket', { method: 'POST' })
  const bad = Buffer.from(signature); bad[bad.length - 1] ^= 1
  assert.equal((await verifyTicket({ ...body, signature: base64url(bad) }, request, env)).status, 401)
  assert.equal(JSON.parse(values.get(`ticket:${ticketId}`)!).usedAt, undefined)
  values.set(`challenge:${challenge}`, '1')
  assert.equal((await verifyTicket(body, request, env)).status, 401)
  values.set(`challenge:${challenge}`, String(Date.now() + 300000))
  const proxiedRequest = new Request('http://localhost:8787/verify-ticket', { method: 'POST' })
  const mismatch = await verifyTicket(body, proxiedRequest, env)
  assert.equal(mismatch.status, 400)
  assert.deepEqual(await mismatch.json(), { error: 'Invalid authenticator data.' })
  const proxiedEnv = { ...env, WEBAUTHN_ORIGIN: 'http://tickets.example' }
  const response = await verifyTicket(body, proxiedRequest, proxiedEnv)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ticketId })
  assert.ok(JSON.parse(values.get(`ticket:${ticketId}`)!).usedAt)
  assert.equal(values.has(`challenge:${challenge}`), false)
  values.set(`challenge:${challenge}`, String(Date.now() + 300000))
  assert.equal((await verifyTicket(body, request, env)).status, 409)
})
