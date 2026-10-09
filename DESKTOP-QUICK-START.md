# Chaturbate 20-Overlay Studio — Quick Start

## For the person building the EXE
1. Install Node.js LTS on Windows (only needed for building).
2. Double-click `BUILD-EXE.cmd`. The first run downloads Electron build tools.
3. When it finishes, find the installer and portable `.exe` in `release`.
4. Give the model the portable EXE or installer. The model does not need Node.js or a PowerShell window to run the built app.

## For a model using the built app
1. Open **Chaturbate 20-Overlay Studio**.
2. Enter your Chaturbate username and click **Set Model**, then **Lock Model**.
3. Each of the 20 cards has a start token price and an optional end price (`0` means no upper limit).
4. To use a custom action, click **Choose HTML file**, select a local `.html` or `.htm` file, and save settings. The app copies the HTML into its private local data folder.
5. Click **Test This Action** whenever you want to preview that specific action. The action test bypasses token thresholds and does not require the slot to be enabled.
6. Click **Copy OBS URL** and paste it into an OBS Browser Source (1920×1080 recommended).
7. For live browser-based tip detection, load the included `Bridge\extension` folder in Chrome at `chrome://extensions` using **Load unpacked**. In an installed build, find it inside the app installation folder under `resources\app\Bridge\extension`.
7. Halloween 2026 is the default pack. The Daily pack is also included.

## Notes
- The desktop app stores model settings and custom HTML in the current Windows user's application data folder.
- Keep the Chaturbate room open in Chrome with the supplied extension enabled for browser-based live tip detection.
- Local action tests prove the local action pipeline, not live Chaturbate tip detection.
- The application does not require the Chaturbate Events API.


**If the EXE builder previously failed:** close any processes using the project folder and run the updated `BUILD-EXE.cmd`. It detects incomplete dependencies and performs a clean reinstall. npm deprecation warnings are usually non-fatal; focus on the final `npm error` and `BUILD FAILED` lines.


### Default tip-slot setup

The Halloween pack starts with all 20 slots enabled. Price ranges are prefilled in non-overlapping five-token bands: 1–5, 6–10, 11–15, 16–20, continuing through 96–100. You can disable any action or adjust its range at any time. The slot cards use a responsive layout and stack cleanly on smaller windows.


## Stable OBS overlay page (v1.3.5)

Use one persistent OBS Browser Source URL: `http://127.0.0.1:8788/index.html?pack=halloween` (or `?pack=daily`). The Test This Action button broadcasts an action-test event to that same page; it no longer relies on opening a separate per-action browser window. Open the same URL in a normal browser to preview the shared event feed.


## Version 1.4.5 — User-managed 20-action packs
- Choose the included Daily or Halloween pack.
- Import a ZIP containing 20 numbered HTML actions (including StimTake `actions/action-01/overlay.html` layout).
- Save the current 20 actions as a reusable ZIP with the HTML effects and current slot settings.
- Imported packs are stored under the app's user data directory and remain available after restarting.
