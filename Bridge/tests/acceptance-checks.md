# Manual acceptance checks

- [ ] Start service and open dashboard.
- [ ] Set a model with username and with full room URL.
- [ ] Confirm invalid usernames are rejected.
- [ ] Lock model A; post a test event for model B and confirm it is ignored.
- [ ] Configure slot 1 at 10 tokens and slot 2 at 25 tokens; test 10 and 25 token tips.
- [ ] Configure a `matchText` trigger and verify nonmatching messages do not activate it.
- [ ] Verify multiple slots can activate from one tip.
- [ ] Restart service and confirm model lock and slot rules persist; token is not persisted.
- [ ] Duplicate the same event ID and verify it is ignored.
- [ ] Confirm each OBS browser source `/overlay/1` through `/overlay/20` renders with transparent background.
- [ ] Confirm Events API errors are shown and no tips are fabricated when disconnected.
- [ ] Confirm accepted events are forwarded to the installed StimTake event endpoint.
- [ ] Test on a non-production session before relying on it live.
