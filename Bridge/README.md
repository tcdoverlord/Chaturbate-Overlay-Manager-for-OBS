# Chaturbate 20-Overlay Bridge — V1

A local-first starter build for OBS with:
- user-selectable Chaturbate room and explicit Lock/Unlock controls
- a local dashboard for 20 independently configurable overlay slots
- one persistent OBS Browser Source for the selected 20-action pack (`http://127.0.0.1:8788/index.html?pack=halloween` or `?pack=daily`)
- token-amount and optional tip-message triggers
- duplicate-event protection and room-lock validation
- a Chrome extension that recognizes the selected Chaturbate room and reports tab/room status without forcing the tab to the foreground
- an optional Chaturbate Events API polling bridge (not required for local tests)

## Important compatibility note
This is a new companion package. It does not overwrite or modify your existing StimTake Studio installation. The app can POST normalized tips to the existing StimTake platform-event endpoint, but confirm that endpoint is enabled in your installed build. The bridge uses `source: "chaturbate-browser"` and the locked room name to match the current StimTake event parser.

Live Chaturbate room DOM detection, Events API, and real OBS/StimTake runtime testing have not been performed in this environment. Use **Send Test Tip** first, then validate browser detection with a real tip. Never share your Events API token or commit it to Git.

## Start (Windows)
1. Install Node.js 20+ and Python 3.10+.
2. Run `START-WINDOWS.cmd`.
3. Open `http://127.0.0.1:8788`.
4. Enter the broadcaster's Chaturbate username and optional room URL, then click **Lock Model**.
5. Optional: paste a broadcaster Events API token and click **Connect optional API**. The API is not required for model locking, local test tips, or overlay configuration.
6. Configure any of the 20 overlay slots and click **Save Slot**.
7. In OBS, add the shared `/index.html?pack=halloween` URL once as a Browser Source. Use 1920×1080 or your canvas size. Every enabled action plays through this one source.
8. Click **Send Test Tip** to validate overlay activation before going live.

## Trigger behavior
- Minimum tokens: a tip with at least this many tokens activates the slot.
- Match text (optional): if set, the tip message must contain this text (case-insensitive).
- A tip can activate multiple slots if it matches multiple configured rules.
- Each slot has its own duration, animation, and enabled state.
- Slot 1–20 all play through the same persistent OBS Browser Source; no per-action source setup is needed.

## Security / reliability
- The local service binds to `127.0.0.1` only.
- The Events API token is never written to the config or logs.
- The saved config stores the selected room and overlay rules, not the token.
- The locked model is checked server-side for every incoming event.
- The bridge deduplicates by event ID in memory and on disk.
- The Chrome extension checks room identity and includes a best-effort fallback that watches newly added room-page text for explicit phrases like “username tipped 25 tokens.” Keep your own room tab open in Chrome. This detector depends on Chaturbate page text/DOM and may need adjustment if their site changes; validate with a real tip before relying on it. Events API is optional and may be used as a secondary source.
- If the Events API format or endpoint changes, the dashboard reports connection errors rather than fabricating tips.

## StimTake integration
The bridge attempts to forward accepted tips to `http://127.0.0.1:8787/api/platform-event` using the existing normalized contract:
```json
{
  "source": "chaturbate-browser",
  "type": "tip",
  "room": "locked_model_username",
  "username": "viewer_name",
  "amount": 25,
  "event_id": "stable-event-id",
  "timestamp": "ISO-8601"
}
```
If your installed StimTake build uses a different endpoint, update `STIMTAKE_EVENT_URL` in `server.js`. A rejected or unreachable StimTake endpoint is logged in dashboard status; overlay triggers can still run locally.

## Chrome extension
Load unpacked from the `extension` folder at `chrome://extensions` with Developer mode enabled. Open the chosen model's room and use the extension popup to lock/check that room. The extension only matches `https://chaturbate.com/*` and never changes the active tab or brings a tab to the foreground. The Events API connection remains the authoritative source of live tip events.

## Diagnostics
- Dashboard status: `/api/status`
- Local tip log: `data/tips.jsonl`
- Slot configuration: `data/config.json`
- Health: `http://127.0.0.1:8788/health`

This is V1: test it in a separate folder before replacing any existing working build.
