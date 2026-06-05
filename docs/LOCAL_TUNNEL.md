# Local Tunnel Workflow

Use this when you need a temporary public HTTPS URL for someone to check the current local Hum UI and flow without a production deploy.

## Detected Local Setup

- Framework: Next.js
- Local dev command: `npm run dev`
- Tunnel-friendly dev command: `npm run dev:host`
- Local port: `3000`
- Local URL: `http://localhost:3000`
- Host binding: `npm run dev:host` explicitly starts Next with `-H 0.0.0.0 -p 3000`.

Hum currently uses the Next.js app and its local API routes, including `/api/music/recommend`, on the same dev server. There is no separate frontend dev server port in the current setup.

## Quick Start

### Step 1: Start the local dev server

In terminal 1:

```bash
npm run dev:host
```

### Step 2: Start a tunnel in a second terminal

Recommended option: Cloudflare Tunnel quick tunnel.

In terminal 2:

```bash
npm run tunnel:cf
```

Alternative with ngrok:

```bash
npm run tunnel:ngrok
```

Fallback with localtunnel:

```bash
npm run tunnel:lt
```

### Step 3: Copy the generated public HTTPS URL

The tunnel command prints a public URL. Use the HTTPS URL, not a plain HTTP URL.

### Step 4: Share it for checking

Share the URL only with the intended tester.

### Step 5: Stop the tunnel when done

Press `Ctrl+C` in the tunnel terminal. Stop the dev server too if you no longer need it.

## Safety Warnings

- This exposes your local dev server to the internet temporarily.
- Do not share the tunnel URL publicly.
- Do not run the tunnel while logged into sensitive local admin screens.
- Do not expose API keys, local worker dashboards, ops consoles, or internal endpoints.
- Stop the tunnel immediately after checking.
- If the app uses `localStorage` data, testers may see only their own browser session data unless the app is backed by a shared remote backend.
- Do not tunnel Redis, databases, backend admin tools, or local LLM worker ports.

## Environment Notes

The current app calls its own Next.js API routes by relative URL, so the tunnel URL should carry both the UI and same-app API requests through the single frontend tunnel.

If a future version calls a separate backend with `NEXT_PUBLIC_API_URL`, `VITE_API_URL`, or `EXPO_PUBLIC_API_URL`, prefer pointing that variable at an existing deployed development backend for simple UI checking.

If both frontend and backend are local, use a two-tunnel setup:

```text
Terminal 1: frontend dev server, for example npm run dev:host
Terminal 2: backend dev server
Terminal 3: tunnel frontend, for example npm run tunnel:cf
Terminal 4: tunnel backend, if the tester's browser must call it directly
```

Then set the frontend API URL to the backend's HTTPS tunnel URL before starting the frontend dev server. Do not expose backend admin tools or internal worker ports.

## CORS And Allowed Origins

Hum's same-app Next API routes do not need a separate CORS allowance when accessed through the frontend tunnel.

If a separate backend blocks the tunnel origin, temporarily allow the exact tunnel HTTPS origin in development only. Do not use `*` for credentialed requests, do not weaken production CORS, and remove the temporary origin after checking.

## Mobile And Microphone Testing

For Android or phone checking:

- Open the HTTPS tunnel URL in Chrome.
- If microphone permissions are needed, HTTPS should allow `getUserMedia`.
- If recording fails, check Chrome's microphone permission and site settings for the tunnel URL.
- Keep the phone awake during testing.
- If audio capture requires a secure context, use the HTTPS tunnel URL, not plain HTTP.

## Troubleshooting

- Tunnel opens but app is blank: check that the dev server is running and that the tunnel uses port `3000`.
- `502` or bad gateway: the tunnel is pointing to the wrong port, or the dev server crashed.
- Mic not working: use the HTTPS tunnel URL, grant microphone permission, and test in Chrome.
- API calls fail: a backend URL may still be `localhost` from the tester's device. Use a deployed backend or tunnel the backend too.
- Hot reload disconnects: refresh the page or restart the tunnel.
- localtunnel asks for a password: follow the displayed tunnel password/IP instructions or switch to Cloudflare Tunnel/ngrok.

## Checklist

Before sharing:

- [ ] Dev server running
- [ ] Tunnel URL opens on my phone
- [ ] Mic permission works
- [ ] No private admin screens exposed
- [ ] Backend/API calls work
- [ ] URL shared only with intended tester

After checking:

- [ ] Stop tunnel
- [ ] Stop dev server if not needed
- [ ] Remove any temporary CORS allowance
