import { useState } from 'react'
import { decode } from 'cbor-x' // DO NOT use cbor2. It is buggy.


const randomStringFromServer = '42'

async function download() {
  const ticketId = crypto.randomUUID()

  const ticketDisplay = 'Your Ticket'

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge: Uint8Array.from(
      randomStringFromServer, c => c.charCodeAt(0)),
    rp: {
      // item name in Bitwarden
      name: ticketDisplay,
      /* if wrong:
         Uncaught (in promise) SecurityError: The relying party ID is not a registrable domain suffix of, nor equal to the current domain. Subsequently, an attempt to fetch the .well-known/webauthn resource of the claimed RP ID failed.
      */
      id: window.location.hostname,
    },
    user: {
      // ???
      id: Uint8Array.from(
        ticketId, c => c.charCodeAt(0)),
      // this is shown in google password detail page
      name: ticketDisplay,
      // not shown on authenticator
      displayName: ticketDisplay,
    },
    pubKeyCredParams: [{alg: -7, type: "public-key"}],
    authenticatorSelection: {
      authenticatorAttachment: "cross-platform",
    },
    timeout: -1,
    attestation: "direct"
  };

  const credential = await navigator.credentials.create({
    publicKey: publicKeyCredentialCreationOptions
  });

  if (!(credential instanceof PublicKeyCredential) ||
      !(credential.response instanceof AuthenticatorAttestationResponse)) {
    throw new Error('No registration credential was returned. Please try again.')
  }

  const decodedAttestationObject = decode(new Uint8Array(credential.response.attestationObject))

  const {authData} = decodedAttestationObject;

  // get the length of the credential ID
  const dataView = new DataView(
    new ArrayBuffer(2));
  const idLenBytes = authData.slice(53, 55);
  idLenBytes.forEach(
    (value: number, index: number) => dataView.setUint8(
      index, value));
  const credentialIdLength = dataView.getUint16(0);

  // get the public key object
  const publicKeyBytes = authData.slice(
    55 + credentialIdLength);

  const publicKeyHex = Array.from(publicKeyBytes as Uint8Array,
    byte => byte.toString(16).padStart(2, '0')).join('')
  const response = await fetch('/bindTicket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, credentialId: credential.id, publicKey: publicKeyHex }),
  })
  if (!response.ok) {
    throw new Error('Could not save your ticket. Please try again.')
  }
  return ticketId
}

export default function App() {
  const [pending, setPending] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setPending(true)
    setError(null)
    try {
      setTicketId(await download())
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not download your ticket.')
    } finally {
      setPending(false)
    }
  }

  return <div>
    You have purchased a ticket. Click the button and scan the popup QR code:
    <button onClick={handleDownload} disabled={pending || ticketId !== null}>
      {pending ? 'Saving ticket…' : 'Download ticket to your phone'}
    </button>
    {ticketId && <p role="status">Ticket saved successfully. Ticket ID: {ticketId}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
