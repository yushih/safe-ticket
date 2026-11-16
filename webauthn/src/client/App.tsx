import { decode } from 'cbor2'


/**
 * Extracts credentialId and COSE public key from an attestationObject
 * @param {Buffer|Uint8Array} attestationObjectBuffer - Raw bytes from response.attestationObject
 */
function parseAttestationObject(attestationObjectBuffer) {
  // 1. Decode the top-level CBOR map
  const attestationObject = decode(attestationObjectBuffer);
  const authData = attestationObject.authData;

  // 2. Verify the Attested Credential Data flag (bit 6 / 0x40) is set
  const flags = authData[32];
  const hasAttestedCredentialData = (flags & 0x40) !== 0;
  if (!hasAttestedCredentialData) {
    throw new Error('Attested credential data not present in authData');
  }

  // 3. Read the 2-byte big-endian credentialId length at offset 53
  const dataView = new DataView(
    authData.buffer,
    authData.byteOffset,
    authData.byteLength
  );
  const credentialIdLength = dataView.getUint16(53, false); // false = big-endian

  // 4. Slice the credentialId starting at offset 55
  const credentialIdEnd = 55 + credentialIdLength;
  const credentialId = authData.subarray(55, credentialIdEnd);

  // 5. Remaining bytes form the CBOR-encoded COSE public key
  const credentialPublicKeyBytes = authData.subarray(credentialIdEnd);
  const cosePublicKey = decode(credentialPublicKeyBytes);

  return {
    credentialId: Buffer.from(credentialId).toString('base64url'),
    credentialPublicKey: Buffer.from(credentialPublicKeyBytes), // Store raw COSE bytes in DB
    cosePublicKeyMap: cosePublicKey, // Decoded COSE map (kty, alg, crv, x, y, etc.)
  };
}

export default function App() {
  const randomStringFromServer = '42'
  async function register() {
    const publicKeyCredentialCreationOptions = {
      challenge: Uint8Array.from(
        randomStringFromServer, c => c.charCodeAt(0)),
      rp: {
        // item name in Bitwarden
        name: "Duo Security",
        /* if wrong:
           Uncaught (in promise) SecurityError: The relying party ID is not a registrable domain suffix of, nor equal to the current domain. Subsequently, an attempt to fetch the .well-known/webauthn resource of the claimed RP ID failed.
        */
        id: window.location.hostname,
      },
      user: {
        id: Uint8Array.from(
          "UZSL85T9AFC", c => c.charCodeAt(0)),
        // this is shown in google password detail page
        name: "lee@webauthn.guide",
        // not shown on authenticator
        displayName: "Lee",
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

    console.log(credential)
    console.log('JSON:')
    console.log(JSON.stringify(credential, null, 2))
    /*
    {
      "authenticatorAttachment": "cross-platform",
      "clientExtensionResults": {},
      "id": "d0vwi-SfQy72MryTvl_ygA",
      "rawId": "d0vwi-SfQy72MryTvl_ygA",
      "response": {
        "attestationObject": "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViU-xkf3Tj_qtAZoJW5jN6wLbxu2MLn4zqQs5V2mDBoriZdAAAAAOqbjWZNAR0hPOS2tIy1ddQAEHdL8Ivkn0Mu9jK8k75f8oClAQIDJiABIVggHgMdliPVxqzXEYVIZ1XIE_P3LMafhasI-m6TwSA0PuEiWCCFb6qqa2S9vDKwsyYq8ktwyWR4Ysg3A3yIYzO5nmVl5A",
        "authenticatorData": "-xkf3Tj_qtAZoJW5jN6wLbxu2MLn4zqQs5V2mDBoriZdAAAAAOqbjWZNAR0hPOS2tIy1ddQAEHdL8Ivkn0Mu9jK8k75f8oClAQIDJiABIVggHgMdliPVxqzXEYVIZ1XIE_P3LMafhasI-m6TwSA0PuEiWCCFb6qqa2S9vDKwsyYq8ktwyWR4Ysg3A3yIYzO5nmVl5A",
        "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiTkRJIiwib3JpZ2luIjoiaHR0cHM6Ly9zZXJ2aW5nLXN0dW5uaW5nLXBlcm1pdHMtdGhlbS50cnljbG91ZGZsYXJlLmNvbSIsImNyb3NzT3JpZ2luIjpmYWxzZX0",
        "publicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHgMdliPVxqzXEYVIZ1XIE_P3LMafhasI-m6TwSA0PuGFb6qqa2S9vDKwsyYq8ktwyWR4Ysg3A3yIYzO5nmVl5A",
        "publicKeyAlgorithm": -7,
        "transports": [
          "hybrid",
          "internal"
        ]
      },
      "type": "public-key"
    }
    */
    const x = parseAttestationObject(
      credential.response.attestationObject
    );

    console.log(x)

    const spkiPublicKey = credential.getPublicKey();
    console.log('pub key:', spkiPublicKey);
  }

  async function authenticate() {
    const randomStringFromServer = '42'
    const publicKeyCredentialRequestOptions = {
      challenge: Uint8Array.from(
        randomStringFromServer, c => c.charCodeAt(0)),
      allowCredentials: [],
      timeout: -1,
    }

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions
    });
    console.log('assertion')
    console.log(assertion)
    console.log('assertion JSON')
    console.log(JSON.stringify(assertion, null, 2))
    /*
    {
      "authenticatorAttachment": "cross-platform",
      "clientExtensionResults": {},
      "id": "GjJbSzlgtzSB3bvDuvF52A",
      "rawId": "GjJbSzlgtzSB3bvDuvF52A",
      "response": {
        "authenticatorData": "-xkf3Tj_qtAZoJW5jN6wLbxu2MLn4zqQs5V2mDBoriYdAAAAAA",
        "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiTkRJIiwib3JpZ2luIjoiaHR0cHM6Ly9zZXJ2aW5nLXN0dW5uaW5nLXBlcm1pdHMtdGhlbS50cnljbG91ZGZsYXJlLmNvbSIsImNyb3NzT3JpZ2luIjpmYWxzZX0",
        "signature": "MEYCIQC0jCA-1Ae5RXAunW_voaWiDc8laE6mRb2tUCqqcPsaVgIhAPFxLgGm5vrLuX5Zxn9DhAmTcDCSAPKybxZljder5AQ5",
        "userHandle": "VVpTTDg1VDlBRkM"
      },
      "type": "public-key"
    }
    */

  }

  return <div>
    <button onClick={register}>Register</button>
    <button onClick={authenticate}>Authenticate</button>
  </div>
}

// https://share.google/aimode/BXQGCgXKNeZyJXcAF
