import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')
if (!root) throw new Error('Missing React root element')
createRoot(root).render(<StrictMode><App /></StrictMode>)

function App() {
  const [pending, setPending] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function checkIn() {
    setPending(true)
    setTicketId(null)
    setError(null)
    try {
      setTicketId(await authenticate())
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not check in.')
    } finally {
      setPending(false)
    }
  }
  return <div>
    <button onClick={checkIn} disabled={pending}>{pending ? 'Checking in…' : 'Check in'}</button>
    {ticketId && <p role="status">Check-in successful. Ticket ID: {ticketId}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}

function encode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function authenticate(): Promise<string> {
  const challengeResponse = await fetch('/verify-ticket/challenge', { method: 'POST' })
  if (!challengeResponse.ok) throw new Error('Could not start check-in. Please try again.')
  const { challenge } = await challengeResponse.json() as { challenge: string }
  const assertion = await navigator.credentials.get({ publicKey: {
    challenge: Uint8Array.from(atob(challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
    rpId: window.location.hostname,
    allowCredentials: [],
    userVerification: 'required',
    timeout: 120_000,
  } })
  if (!(assertion instanceof PublicKeyCredential) || !(assertion.response instanceof AuthenticatorAssertionResponse) || !assertion.response.userHandle) {
    throw new Error('No ticket credential was returned. Please try again.')
  }
  const response = await fetch('/verify-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentialId: assertion.id,
      userHandle: encode(assertion.response.userHandle),
      authenticatorData: encode(assertion.response.authenticatorData),
      clientDataJSON: encode(assertion.response.clientDataJSON),
      signature: encode(assertion.response.signature),
    }),
  })
  const result = await response.json() as { ticketId?: string; error?: string }
  if (!response.ok || !result.ticketId) throw new Error(result.error ?? 'Could not check in. Please try again.')
  return result.ticketId
}
