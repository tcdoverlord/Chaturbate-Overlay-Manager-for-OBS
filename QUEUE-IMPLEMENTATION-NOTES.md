# v1.5.5 FIFO queue implementation notes

- Queue is maintained by the persistent overlay page in `Bridge/server.js`.
- Jobs are serialized and start one at a time.
- HTML `overlay-complete` messages advance the queue; detected duration and hard 120-second timer are recovery fallbacks.
- Stop interrupts the current action and then advances to the next queued action.
- Clear Queue clears waiting jobs only.
- Queue state is posted to and exposed by `/api/queue-state` for the desktop UI.
- Capacity is 100 waiting jobs.
- Event IDs are deduplicated for 120 seconds when provided by the event source.
- Queue is in-memory only and resets when the overlay page reloads.
- `BUILD-AND-TEST.cmd` and `BUILD-EXE.cmd` are retained.

Validation in this packaging environment: Node syntax checks pass. The bridge integration smoke test could not start because runtime dependencies were not installed in this environment; npm dependency installation timed out here. Run the included Windows test/build scripts before distributing the EXE.
