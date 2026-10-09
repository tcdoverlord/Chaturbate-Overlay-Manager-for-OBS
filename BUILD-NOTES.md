# Build 1.2.0 notes

- Removed Events API token controls from the dashboard. No API token is required for local tests.
- Added 20 Halloween 2026 HTML actions as the preselected pack.
- Added 20 Daily Pack — August 2026 HTML actions.
- Added action wrapper URLs that replay the corresponding HTML action when the matching tip slot activates.
- Fresh configuration starts unlocked with Halloween action names and all tip slots disabled until the model enables them.
- Live browser-based tip detection remains best-effort and requires testing in the model’s own Chaturbate room.


## Windows EXE builder recovery

The builder now detects interrupted or incomplete npm installs, including a missing `defer-to-connect` dependency under Electron's downloader. If detected, it removes the incomplete `node_modules` folder and reinstalls dependencies. If Windows reports EPERM while removing files, close other terminals or Electron processes using this folder and retry; restart Windows if the file lock persists. npm deprecation notices are warnings and are not, by themselves, a build failure.


## Version 1.3.3 — live action test preview
The Test This Action button opens the persistent action wrapper URL (without `?preview=1`) in a named browser window, then sends the test-action event. The wrapper listens for that event and plays the selected HTML action; the same event is broadcast to matching OBS Browser Sources. If the browser blocks pop-ups, the dashboard now displays a clear message.


## Stable OBS overlay page (v1.3.5)

Use one persistent OBS Browser Source URL: `http://127.0.0.1:8788/index.html?pack=halloween` (or `?pack=daily`). The Test This Action button broadcasts an action-test event to that same page; it no longer relies on opening a separate per-action browser window. Open the same URL in a normal browser to preview the shared event feed.


## Version 1.3.7 build fix

Removed the invalid `${target}` artifact-name macro that caused electron-builder to stop before producing EXEs. Also removed the global custom artifact name so the NSIS installer and portable build use electron-builder target-specific default filenames and do not collide.


## Version 1.3.9 — plain index OBS page

- The single OBS Browser Source is a transparent, plain index overlay page, not a Halloween-themed landing page.
- Default OBS URL is `http://127.0.0.1:8788/index.html`.
- Daily Pack is the default; to select Halloween explicitly use `http://127.0.0.1:8788/index.html?pack=halloween`.
- The dashboard remains at `http://127.0.0.1:8788/`; Test Run sends events to the one persistent index page.


## Version 1.4.3 — Top Tippers + Test Run repair
- Restored a transparent OBS overlay with the Top Tippers session card, VIP leader, and Last Tipper display inspired by the supplied StimTake Studio reference.
- Adapted overlay events to this app's existing `/api/events` Server-Sent Events channel.
- Tip totals are accumulated in the current overlay session from accepted live tip events.
- Fixed local Test Run so it can preview enabled actions before Model Lock; real Chaturbate tip acceptance still requires a locked model.
- OBS Browser Source remains `http://127.0.0.1:8788/index.html`.


## Version 1.4.5 — User-managed 20-action packs
- Choose the included Daily or Halloween pack.
- Import a ZIP containing 20 numbered HTML actions (including StimTake `actions/action-01/overlay.html` layout).
- Save the current 20 actions as a reusable ZIP with the HTML effects and current slot settings.
- Imported packs are stored under the app's user data directory and remain available after restarting.


Version 1.4.6 startup fix: BUILD-AND-TEST.cmd now installs root npm dependencies when adm-zip is missing before running bridge integration tests. The bridge imports adm-zip for ZIP pack import/export; a missing module caused the bridge process to exit before readiness.


## Version 1.5.3 — Golden Rule preset packs

- Replaced the built-in Daily preset with the approved Daily Pack August 2026 Golden Rule edition (20 self-timed, self-clearing HTML actions).
- Replaced the built-in Halloween preset with the approved Halloween 20-Action Golden Rule edition (20 self-timed, self-clearing HTML actions).
- Preserved the existing pack IDs, action routes, one persistent OBS Browser Source URL, user custom-pack support, and the existing 20 token ranges.
- Updated pack names in the preset picker to identify the Golden Rule editions.
- Added pack-level smoke checks for all 40 HTML actions.
- The app's auto-expiry remains an emergency fallback; each HTML action contains its own cleanup lifecycle.


## Version 1.5.4 — token range persistence fix
- Applying either included preset explicitly resets slots 1–20 to 1–5, 6–10, 11–15, continuing in 5-token bands through 96–100.
- Saving a slot preserves the selected start/end token range in the bridge config.
- Edited slots show `Save Changes*` until successfully saved, then return to `Save Settings`.
- Custom pack import remains available; use Apply selected pack to initialize its 20 standard token bands.
