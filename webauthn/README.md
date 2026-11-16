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
Deployment requires Cloudflare authentication. No account, domain, or backend
service bindings have been configured.

## Setup status

Dependency installation was blocked by a registry DNS error in the setup
environment. The manifest uses `latest` until the installation commands above pin
exact versions and generate `bun.lock`. Build, type, and browser checks must be run
after installation.
