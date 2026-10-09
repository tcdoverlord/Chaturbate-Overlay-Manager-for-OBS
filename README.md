# Chaturbate 20-Overlay Studio — Halloween 2026

**Recommended model-friendly workflow:** run `BUILD-EXE.cmd` on Windows to create a portable EXE and installer, then models can use the EXE without a visible backend console. Read `DESKTOP-QUICK-START.md` for the short guide.

The desktop app includes 20 Halloween 2026 actions and 20 Daily Pack actions, a per-action token start/end range, local HTML file replacement, restore-to-pack controls, a dedicated test button for each action, and the existing Chrome room detector. Halloween is preselected.

The first EXE build requires Node.js LTS and an internet connection to fetch Electron build tools. A built portable EXE does not require Node.js to run. Live tip detection must still be tested in the model's own Chaturbate room.

---

# Chaturbate OBS Tip Tracker — Standalone Build

This is a separate project for a local Chaturbate-to-OBS overlay workflow. It does **not** download or rebuild the entire upstream StimTake repository.

## Included

- Local dashboard for 20 configurable overlay slots.
- Local Node.js bridge, room lock, test-tip endpoint, duplicate-event protection, and JSONL event log.
- Two included 20-action HTML packs: Halloween 2026 (preselected) and Daily Pack — August 2026.
- Chrome room-lock/status extension.
- One persistent OBS Browser Source URL for all 20 actions: `http://127.0.0.1:8788/index.html?pack=halloween` or `http://127.0.0.1:8788/index.html?pack=daily`.
- Standalone overlay-lab assets and smoke test.
- Windows launch, syntax-check, and extension-install helper scripts.

## Requirements

- Windows 10/11.
- Node.js 20 or newer.
- Google Chrome for the optional extension.
- OBS Studio for overlays.

The bridge uses Node's built-in modules and does not require `npm install`.

## Quick start

1. Extract this ZIP to a folder such as `C:\Chaturbate-OBS-Tip-Tracker-Standalone`.
2. Double-click `BUILD-AND-TEST.cmd` to run local syntax and smoke checks.
3. Double-click `START-APP.cmd`.
4. Open `http://127.0.0.1:8788` if it does not open automatically.
5. Enter the model username or room URL, click **Set Model**, then click **Lock Model**. Both standard and `/b/username/` room URLs are supported.
6. Halloween 2026 is preselected. Choose an action pack and click **Apply action names to 20 slots** if you want its names copied into the slot settings.
7. Enable the slots you want, choose their token thresholds, and save them.
8. Add the single shared OBS URL shown in the dashboard as one Browser Source. All enabled actions play in this source; do not add a source for each action.
9. Run `INSTALL-CHROME-EXTENSION.cmd` or load the `Bridge\extension` folder in `chrome://extensions`.

Keep the service console open while using the app. Press Ctrl+C in that window to stop it.

## Configure slots

All 20 checkboxes start checked/enabled by default. Slots can still be disabled manually, and each supports a token range, optional case-insensitive message match, custom HTML, animation, accent color, and duration. Use Test Run on a slot to trigger that action through the shared OBS Browser Source.

## Live tip events (no API token required)

The OBS page `index.html?pack=...` listens for action events and displays the matching included or custom HTML. Events API remains optional. For live tips, keep your own Chaturbate room open in Chrome and install/reload the included extension. Browser page detection is best-effort; local smoke tests do not prove that every live Chaturbate tip notice will be detected.

## Included action packs

- **Halloween 2026** — preselected default pack with 20 themed HTML actions.
- **Daily Pack — August 2026** — an alternate pack with 20 HTML actions.

Action pages are served locally by the bridge; no external CSS, JavaScript, or CDN is needed. OBS should use the single persistent wrapper page `http://127.0.0.1:8788/index.html?pack=halloween` (or `?pack=daily`) rather than a separate source per action. Each pack action number maps to the same-numbered tip slot. Test Run sends an action signal to this same page.

## Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `Bridge\extension` folder.
5. Open the intended Chaturbate room and follow the extension popup prompts.

The extension recognizes both standard room URLs (`/username/`) and broadcaster URLs (`/b/username/`). It reports room/tab status; it is not proof that live tips are flowing. The Events API connector is intended as the live tip source.

## OBS setup

1. In OBS, add a Browser Source.
2. Enter `http://127.0.0.1:8788/index.html?pack=halloween` (or `?pack=daily`).
3. Set dimensions to the overlay/canvas size (often 1920 × 1080).
4. Confirm the source is in the correct scene and layer order.
5. Click **Test Run on an action** and verify the expected overlay appears and clears.

## Fixes included in this build

- The dashboard no longer overwrites the model field while you are typing or the slot fields while editing.
- Model selection returns an explicit result and refreshes the displayed state.
- The starter configuration is unlocked and has no fake demo model.
- Test tips trigger local overlays without waiting for another application or a forwarding timeout.

## Diagnostics

- Dashboard: `http://127.0.0.1:8788/`
- Health: `http://127.0.0.1:8788/health`
- Status JSON: `http://127.0.0.1:8788/api/status`
- Event log: `Bridge\data\tips.jsonl`
- Saved room/slot settings: `Bridge\data\config.json`

## Security and reliability

- The service binds to `127.0.0.1`.
- Never commit or share Events API tokens, cookies, or credentials.
- Do not expose the local bridge port to the public internet.
- Back up `Bridge\data\config.json` and `Bridge\data\tips.jsonl`.
- The ZIP contains source code, not a signed installer or compiled standalone EXE.
- Passing local checks does not certify live Events API, OBS rendering, or StimTake forwarding.

## Troubleshooting

**`node` is not recognized:** Install Node.js 20 or newer, reopen the command window, and run `START-APP.cmd`.

**Dashboard does not open:** Check if port 8788 is already in use and visit `/health`.

**Test tip does not trigger:** Lock the room, enable a slot, set an appropriate minimum amount, and check any message-match rule.

**Live tips do not arrive:** Confirm the Chaturbate room is open in Chrome, the extension is enabled/reloaded, the correct broadcaster is locked, and the room is not showing a different path/username. Test tips working does not prove live browser event detection.

**OBS source is blank:** Confirm the local service is running and the Browser Source URL is correct, then refresh the source.

## Project status

This is an independent standalone starter build intended to replace the unnecessary full-upstream-repository download workflow. Local checks are included. Live Chaturbate Events API, OBS rendering, and optional StimTake forwarding still require end-to-end validation.


### If BUILD-EXE.cmd fails during npm install

The builder checks for incomplete dependencies and attempts a clean reinstall automatically. npm deprecation warnings alone are not fatal. If Windows reports `EPERM` while removing `node_modules`, close other terminals/Electron processes using the project folder and retry. If the error persists, restart Windows and run the builder again.


### Default tip-slot setup

The Halloween pack starts with all 20 slots enabled. Price ranges are prefilled in non-overlapping five-token bands: 1–5, 6–10, 11–15, 16–20, continuing through 96–100. You can disable any action or adjust its range at any time. The slot cards use a responsive layout and stack cleanly on smaller windows.


## Stable OBS overlay page (v1.3.5)

Use one persistent OBS Browser Source URL: `http://127.0.0.1:8788/index.html?pack=halloween` (or `?pack=daily`). The Test Run button broadcasts an action-test event to that same page; it does not open a separate preview window.


## Plain Index OBS Output (v1.3.9)

Add one OBS Browser Source: `http://127.0.0.1:8788/index.html`. This is a transparent index overlay page, not a themed landing page. Daily Pack is selected by default. To use Halloween actions, select Halloween in the dashboard or use `http://127.0.0.1:8788/index.html?pack=halloween`. Use **Test Run** in the dashboard; no separate preview window is required.


## Version 1.4.5 — User-managed 20-action packs
- Choose the included Daily or Halloween pack.
- Import a ZIP containing 20 numbered HTML actions (including StimTake `actions/action-01/overlay.html` layout).
- Save the current 20 actions as a reusable ZIP with the HTML effects and current slot settings.
- Imported packs are stored under the app's user data directory and remain available after restarting.


## FIFO Tip Action Queue (v1.5.5)

Actions now use a first-in, first-out queue in the persistent OBS overlay page. Only one action runs at a time. When an action reports `overlay-complete`, the next queued action starts. A local duration-based timeout and a 120-second hard timeout are fallback recovery paths.

- **Queue capacity:** 100 waiting actions. When full, further actions are rejected with a warning rather than silently growing memory without bound.
- **Duplicate protection:** tip event IDs (`event_id`, `id`, or `tip_id`) are deduplicated for two minutes when the event source provides an ID.
- **Stop:** stops the currently playing action and advances to the next waiting action.
- **Clear Queue:** removes waiting actions but allows the current action to continue.
- **Queue status:** the desktop UI displays the current action and up to the next 10 waiting actions.
- **Test Run:** uses the same queue as tip-triggered actions, so test activations are serialized too.
- **OBS source:** remains the same single persistent URL, `http://127.0.0.1:8788/index.html`.

The queue is held in the running overlay page's memory. It is not persisted across application/OBS restarts. Duplicate protection can only work when the live event source provides a stable event identifier.

### Queue verification

Run `BUILD-AND-TEST.cmd` on Windows, then build with `BUILD-EXE.cmd`. Confirm the queue panel updates while OBS Browser Source is open, send two Test Run requests quickly, verify they play one at a time, test Stop and Clear Queue, and finally test multiple real tips in the connected room. The included local checks cannot prove real Chaturbate event delivery or live OBS rendering.
