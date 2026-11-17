# Secure Ticketing

Yesterday, while having supper, I heard on the news that Hong Kong Disneyland had been hacked and ticket QR codes had been stolen ([news report](https://www.zaobao.com.sg/en/news/china/hong-kong-disneyland-reports-theft-17000-e-tickets-suspends-online-sales?ref=sidebar-realtime)).

So I put my solution architect hat on and thought about how we could protect such a lovely place from bad actors.

Of course, SecOps is important, but security is not only about plugging all the holes in your server; it is also about architecting systems to resist hacking by design.

The key problem here is that tickets in the form of QR codes are equivalent to plaintext passwords stored in a database, which is a security anti-pattern. I explored the solution space a little bit:

## 1. Google Wallet / Apple Wallet

This is almost the ideal solution, except it is not perfect. What a surprise!

The [Google Wallet documentation](https://developers.google.com/wallet/tickets/events/overview/add-to-google-wallet-flow#how-its-done) says you have to sign the JWT (which represents your ticket) with your private key. What if that key is stolen? An attacker could not steal already issued tickets stored in users' mobile wallets, but they could create new tickets. This is only slightly better than the current Disneyland scenario.

I used the Google Wallet API as an example here, but things work the same way on the Apple side.

## 2. WebAuthn

Cryptographically, this is the correct solution: the credential that proves ownership of the ticket is the private key on the user's phone. The server only stores the public key. As long as those public keys are not tampered with, the system is safe. Defending a system against tampering is easier than defending it against data leakage because the former is more noticeable.

But WebAuthn is not designed for ticketing. I wrote a proof-of-concept (POC) system in [webauthn](./webauthn/) and discovered the following problems:

- Authenticators (such as Google Password Manager) associate credentials with domain names, which means you can have only one ticket per domain name. To allow users to hold multiple tickets, you have to put the ticket ID in the domain name.
- The UI is confusing and full of friction because it is designed for a different purpose. I reckon only half of the users could finish the ticket download process.

  To check the ticket, someone has to click a button. Then the user has to scan a QR code with their phone and select the **correct** options. Ideally, we still want the user to only have to show a QR code without clicking anything.

- The whole ecosystem is immature. I'm using a Samsung phone, but I can't even initialize the Samsung password manager. The registration process breaks.

Reference: [webauthn.wtf](https://webauthn.wtf/)

## 3. Public-Key Cryptography with a Custom Keyholder Front End

By "front end," I mean the component that runs on the user's mobile device, generates and holds the private key, and signs the challenge to prove ownership when the ticket is checked. This is the role played by authenticators in the WebAuthn architecture. Because it is custom-made, the UX could be fine-tuned to a satisfactory level.

Here is an example of using the mobile browser as the keyholder front end.

### Ticket Purchase

During the ticket purchase flow, the keyholder front end generates a key pair, stores the private key in its local storage (Credential Management API), and uploads the public key as part of the purchase flow. How the integration happens depends on where the purchase takes place:

1. **In a mobile browser:** We are good to go.
2. **In a desktop browser:** We need to direct the user to open a URL carrying a session ID in their mobile browser, using a QR code or a link sent by email or SMS. This additional step is a potential source of confusion and failure.
3. **In an app:** The app itself should serve as the keyholder front end.

When the purchase protocol finishes, the back-end server associates the ticket with the public key.

### Ticket Verification

When checking in, the user must open the verification page in the same mobile browser. The page answers the cryptographic challenge using its stored private key. After verifying the response, the back end hands a secret token to the page. The page displays the token as a QR code. A scanner reads the QR code, verifies the authenticity of the token, opens the gate, and notifies the back end to mark the ticket as used.

This is not the only possible approach. Essentially, any process that lets the page convince the gate controller that it has the private key works.

### Implementation Challenges

Implementing the keyholder front end in a mobile browser presents the following issues.

#### 1. Key Loss

The only proof that the user owns the ticket is in the local storage of a mobile browser. A number of events could lead to the loss or unavailability of that proof:

- The user has multiple phones and brings the wrong one.
- The mobile browser is reinstalled and its storage is wiped.
- The phone is lost.

How can we let the user securely and conveniently back up the private key? There are several plausible approaches:

- Use Chrome Sync's bookmark synchronization, though this is limited to Chrome users.
- Back up the key by email, which raises the question of how to prevent key leakage—the very problem we started with.

#### 2. Lack of Hardware Security Module (HSM) Support
