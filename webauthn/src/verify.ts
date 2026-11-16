import { decode } from 'cbor-x'


export const ticketIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function bytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding')
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}

// Authenticators return DER ECDSA signatures; Web Crypto expects two 32-byte integers.
function signatureBytes(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30 || der[1] !== der.length - 2) throw new Error('Invalid signature')
  let offset = 2
  const result = new Uint8Array(64)
  for (let i = 0; i < 2; i++) {
    if (der[offset++] !== 2) throw new Error('Invalid signature')
    const length = der[offset++]
    let integer = der.slice(offset, offset + length)
    offset += length
    if (!length || integer.length !== length || (integer[0] & 0x80)) throw new Error('Invalid signature')
    if (integer[0] === 0 && integer.length > 1) {
      if (!(integer[1] & 0x80)) throw new Error('Invalid signature')
      integer = integer.slice(1)
    }
    if (integer.length > 32) throw new Error('Invalid signature')
    result.set(integer, i * 32 + 32 - integer.length)
  }
  if (offset !== der.length) throw new Error('Invalid signature')
  return result
}

type Ticket = { ticketId: string; credentialId: string; publicKey: string; usedAt?: string }

export async function verifyTicket(body: Record<string, unknown>, request: Request, env: Env): Promise<Response> {
  const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
  let ticketId: string
  let clientData: Uint8Array<ArrayBuffer>
  let authData: Uint8Array<ArrayBuffer>
  let signature: Uint8Array<ArrayBuffer>
  let challenge: string
  const url = relyingPartyUrl(request, env)
  try {
    ticketId = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes(body.userHandle))
    if (!ticketIdPattern.test(ticketId) || typeof body.credentialId !== 'string') return fail('Invalid ticket assertion.')
    clientData = bytes(body.clientDataJSON)
    authData = bytes(body.authenticatorData)
    signature = signatureBytes(bytes(body.signature))
    const client = JSON.parse(new TextDecoder().decode(clientData))
    // !!! SECURITY WARNING: WebAuthn origin and cross-origin context checks are DISABLED.
    // !!! Restore before production use; the signed browser origin is currently unchecked.
    // if (client.origin !== url.origin ||
    //     (client.crossOrigin !== undefined && client.crossOrigin !== false) || client.topOrigin !== undefined) {
    //   return fail('Invalid authentication context.')
    // }
    if (client.type !== 'webauthn.get' ||
        typeof client.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(client.challenge)) return fail('Invalid authentication context.')
    challenge = client.challenge
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url.hostname)))
    if (authData.length < 37 || !(authData[32] & 1) || !(authData[32] & 4) ||
        !rpHash.every((byte, i) => authData[i] === byte)) return fail('Invalid authenticator data.')
  } catch {
    return fail('Invalid ticket assertion.')
  }
  const expires = await env.TICKETS.get(`challenge:${challenge}`)
  if (!expires || Number(expires) <= Date.now()) return fail('Check-in expired. Please try again.', 401)
  const ticket = await env.TICKETS.get<Ticket>(`ticket:${ticketId}`, 'json')
  if (!ticket || ticket.ticketId !== ticketId || ticket.credentialId !== body.credentialId) return fail('Ticket not found.', 404)
  if (ticket.usedAt) return fail('This ticket has already been used.', 409)
  try {
    const cose = decode(Uint8Array.from(ticket.publicKey.match(/.{2}/g)!, hex => parseInt(hex, 16)))
    const field = (key: number) => cose instanceof Map ? cose.get(key) : cose[key]
    if (field(1) !== 2 || field(3) !== -7 || field(-1) !== 1 ||
        !(field(-2) instanceof Uint8Array) || field(-2).length !== 32 ||
        !(field(-3) instanceof Uint8Array) || field(-3).length !== 32) throw new Error('Unsupported key')
    const key = await crypto.subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256', x: base64url(field(-2)), y: base64url(field(-3)), ext: true,
    }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientData))
    const signed = new Uint8Array(authData.length + hash.length)
    signed.set(authData)
    signed.set(hash, authData.length)
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signed)) return fail('Invalid ticket signature.', 401)
  } catch {
    return fail('Invalid ticket signature.', 401)
  }
  // KV has no atomic compare-and-set: concurrent redemption requires a transactional store.
  await env.TICKETS.put(`ticket:${ticketId}`, JSON.stringify({ ...ticket, usedAt: new Date().toISOString() }))
  await env.TICKETS.delete(`challenge:${challenge}`)
  return Response.json({ ticketId }, { headers: { 'Cache-Control': 'no-store' } })
}

// Configure this when a development proxy rewrites the public request URL.
// Never derive the expected WebAuthn origin from client-supplied assertion data.
export function relyingPartyUrl(request: Request, env: Env & { WEBAUTHN_ORIGIN?: string }): URL {
  return new URL(env.WEBAUTHN_ORIGIN || request.url)
}
