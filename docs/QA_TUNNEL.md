# Local QA Tunnel for Hum

For external QA, do not tunnel `next dev`. Tunnel the local production server instead.

## Why

`next dev` uses development-only HMR and websocket paths such as `/_next/webpack-hmr`. Quick tunnels can behave weirdly with those dev server connections, especially with Turbopack/HMR state. A local production server from `next build` plus `next start` is closer to what testers should see and avoids exposing dev HMR over the public tunnel.

## Recommended Workflow

Use two PowerShell terminals.

Terminal 1:

```powershell
cd C:\Users\Kafka\Documents\hum
npm run qa:build
npm run qa:start
```

Terminal 2:

```powershell
cd C:\Users\Kafka\Documents\hum
npm run qa:check
npm run qa:tunnel:cf
```

Copy the `https://...trycloudflare.com` URL from the Cloudflare Tunnel output and share it with testers.

`qa:start` serves the built app on `http://localhost:3001`. `qa:tunnel:cf` exposes that production server through Cloudflare Tunnel. The older `tunnel:cf` script still points at port `3000` for the dev server path, but `qa:tunnel:cf` is preferred for external QA.

## Browser State

The tunnel URL and localhost are different browser origins.

These do not share `localStorage`:

- `http://localhost:3000`
- `http://localhost:3001`
- `https://something.trycloudflare.com`

Because storage is domain-specific, testers may see:

- no hum history
- fresh baseline
- different thread
- different read state
- different saved feedback
- different filters

This does not mean the code or UI is different. It means the browser storage belongs to a different origin.

For realistic external testing, ask testers to create fresh hums, use an existing dev-only demo seed if one already exists, or manually run the app flow from scratch on the tunnel. Do not add demo seeding just for this tunnel workflow unless it is explicitly requested.

## PWA And Cache Troubleshooting

If the tunnel shows old UI:

- Open Chrome DevTools > Application > Storage > Clear site data.
- Unregister the service worker if one is present.
- Hard reload the page.
- On a phone, open Chrome site settings and clear data for the tunnel URL.

Quick Tunnel URLs change every time the tunnel restarts. After restarting the tunnel, use the new `trycloudflare.com` URL.

## Microphone QA Notes

- Use the HTTPS `trycloudflare.com` URL for microphone access.
- Open in Chrome on Android for best testing.
- Grant microphone permission when prompted.
- If the microphone fails, check site permissions for the tunnel URL and reload.
- Do not use plain HTTP public links for microphone QA.

## Safety Notes

- This exposes the local app temporarily to the internet.
- Share the tunnel URL only with intended testers.
- Do not expose local admin dashboards, ops consoles, Redis, databases, backend worker ports, or local LLM ports.
- Stop the tunnel with `Ctrl+C` after QA.
- Do not use account-less quick tunnels for production.
- Do not add permissive production CORS just for this.

## Troubleshooting

Problem: tunnel URL is blank or returns 502.

Fix:

- Ensure `npm run qa:start` is running in Terminal 1.
- Ensure `qa:tunnel:cf` points to port `3001`.
- Run `npm run qa:check`.

Problem: tunnel UI differs from localhost.

Fix:

- Remember that `localStorage` differs by origin.
- Clear tunnel site data.
- Confirm the production server was rebuilt after the latest UI changes.

Problem: latest UI changes are not visible.

Fix:

- Stop `qa:start`.
- Rerun `npm run qa:build`.
- Rerun `npm run qa:start`.
- Restart the tunnel and use the new URL.

Problem: `/_next/webpack-hmr` errors appear.

Fix:

- You are tunneling `next dev`.
- Use `qa:start` on port `3001` instead.

Problem: `ngrok` is not recognized.

Fix:

- `ngrok` is not installed.
- Use `npm run qa:tunnel:cf`.
