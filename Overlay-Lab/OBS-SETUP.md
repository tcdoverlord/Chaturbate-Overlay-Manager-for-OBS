# OBS Overlay Setup

## Test the design first

1. Open `overlays/obsidian-overlay.html` in Chrome using a local web server (recommended) or use OBS Browser Source's **Local file** option.
2. Add `?demo=1` to the URL to show sample data without contacting StimTake Studio.
3. Add the page to OBS as a Browser Source, set width to `1920`, height to `1080`, and enable browser-source transparency (the page background is transparent).
4. Disable demo mode for the live scene.

## Live StimTake mode

The overlay must be served by the existing StimTake local server so relative API calls resolve against `127.0.0.1:8787`:

`http://127.0.0.1:8787/overlays/obsidian-overlay.html`

That URL will only work after the files are placed under the server's served web root. The currently published V6 payload may serve its own `index.html` instead; don't overwrite that existing payload blindly. Merge these three overlay files into the served web root and confirm static-file routing before using the URL.

Expected API routes:

- `GET http://127.0.0.1:8787/api/studio-status`
- `GET http://127.0.0.1:8787/api/event`

Open each in a normal browser first. The status route should return a JSON object containing supporter totals (ideally `supporters` or `session_support`), `last_username`, and `last_amount`. The event route is polled for action trigger events. If the API response shape differs, adjust `normalizeStatus()` in `overlay.js` rather than guessing or hardcoding data.

## Query-string options

- `?demo=1` — safe demonstration data; never sends data to the backend.
- `?theme=gold` — luxury gold theme. Default is electric purple.
- `?theme=blue` — blue theme.
- `?top=5` — render 3–10 ranked supporters.
- `?compact=1` — hide session stat tiles.
- `?status=0` — hide the connection badge once you have validated the live source.
- `?goal=500` — show a target progress bar. `goal` must be a positive integer.

Options can be combined, e.g. `?theme=gold&top=5&goal=500`.

## Live acceptance checklist

- [ ] Demo mode looks correct at 1920×1080 with transparent background.
- [ ] Status endpoint opens and returns JSON.
- [ ] Event endpoint opens and returns JSON (or an empty/no-event response the current backend considers valid).
- [ ] Overlay shows connected state when the API is reachable.
- [ ] A test event changes only the expected overlay fields.
- [ ] A real, low-value tip is observed exactly once before enabling any automatic show actions.
- [ ] Overlay behaves correctly after Studio restarts or temporarily stops.
- [ ] Correct OBS scene/source is visible in the final program output.

Keep an untouched copy of your current working Studio directory. Do not test integration changes for the first time while live.
