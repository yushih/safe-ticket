# safe-tickets

A React hello world app with a TypeScript Cloudflare Worker backend.

- `src/client/App.tsx`: React page.
- `src/client/main.tsx`: browser entry point.
- `src/client/index.html`: HTML shell.
- `src/index.ts`: Worker entry point; add backend routes before the asset fallback.
- `vite.config.ts`: frontend build configuration.

Browser, Worker, and build configuration code have separate TypeScript configs.
Vite builds the frontend into `dist/client`; the Worker serves it through the
`ASSETS` binding. Requests run through the Worker first. Unmatched asset paths
return 404; no client-side router or SPA fallback is configured.

The Worker uses compatibility date `2026-11-16`.

## Install

From this directory, use npm to bootstrap Bun locally (requires Node.js and npm;
the repository's `.nvmrc` selects Node 26):

```sh
npm install --prefix .tools --no-package-lock --no-save bun@latest
export PATH="$PWD/.tools/node_modules/.bin:$PATH"
bun add --exact react@latest react-dom@latest
bun add --dev --exact wrangler@latest typescript@latest vite@latest @vitejs/plugin-react@latest @types/react@latest @types/react-dom@latest @types/node@latest
bun run cf-typegen
```

This installs Bun within the ignored `.tools` directory, pins the latest stable
development dependencies, and creates `bun.lock`. Commit the resulting manifest,
lockfile, and generated `worker-configuration.d.ts`. For subsequent installs, run
`bun install --frozen-lockfile`.

## Develop and check

With the local Bun directory on PATH:

```sh
bun run dev
```

Open the address printed by Vite. This provides frontend hot reload and does not
run the Worker backend.

To build the frontend and serve it through the local Worker:

```sh
bun run dev:worker
```

Open the address printed by Wrangler. Restart this command after frontend edits
to rebuild assets, or run `bun run build:client` in another terminal.

```sh
bun run check
bun run build
```

`check` generates Cloudflare runtime types and checks all three TypeScript configs.
`build` builds the React frontend and bundles the Worker into `dist/worker` without
deploying it. Regenerate types after changing Wrangler config.

## Deploy

```sh
bun run deploy
```

Wrangler's build hook builds the frontend before development or deployment.
Deployment requires Cloudflare authentication. The TICKETS KV binding is configured; no account or custom domain is configured.

## Ticket binding

The download button generates a cryptographically random UUID, registers a
WebAuthn credential, and posts `{ ticketId, credentialId, publicKey }` to
`POST /bindTicket`. The public key is hex-encoded COSE data. The Worker validates
the payload and awaits storage in `TICKETS` KV under `ticket:<ticketId>` before
confirming success. Errors are displayed on the page.

Use Node 26 (`nvm use`) and the existing npm lockfile:

```sh
npm ci
npm run dev:worker
```

For frontend hot reload, run `npm run dev` in another terminal. Vite proxies
`/bindTicket` to the Worker at port 8787. Local Wrangler development uses local
KV storage. The `TICKETS` binding omits a namespace ID so Wrangler can provision
a namespace on deployment; alternatively create one with
`npx wrangler kv namespace create TICKETS` and add its returned `id` to the
binding in `wrangler.jsonc`. Deployment requires Cloudflare authentication.
See [Cloudflare's Wrangler configuration documentation](https://developers.cloudflare.com/workers/wrangler/configuration/).

```sh
npm run check
node --test tests/worker.test.ts
npm run build
npm run deploy
```

This implements prototype storage, not ticket authorization or attestation
verification. The existing fixed WebAuthn challenge remains. The endpoint accepts
client-supplied bindings and writing the same ticket ID replaces its record.
Before production use, add purchase authorization and server-side WebAuthn
verification. KV is eventually consistent and does not provide atomic ticket
redemption or uniqueness enforcement.
