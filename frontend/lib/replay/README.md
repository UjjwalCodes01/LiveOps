# Fallback replay mode

`replay-log.json` holds a **real** captured session that the `/replay` page
plays back through the live UI — the judging-day safety net for when the
network or AWS is unavailable during a demo (see `AGENT.md`, "fallback replay
mode").

It ships **empty on purpose**: the replay must be a genuine run, never
fabricated. Until it's populated, `/replay` shows a "no replay captured yet"
state and the landing page keeps its honest placeholder.

## Capturing a replay (do this once, from a real run)

1. Run a full live session end to end: **Build → Explore → Break → Diagnose →
   Fix**, all the way to `completed`.
2. On the completed **Fix** page, click **"Download this run (for replay
   mode)"**. This downloads `replay-log.json` containing the exact events that
   streamed to your browser.
3. Replace this directory's `replay-log.json` with the downloaded file and
   commit it.

That's it — `hasReplay` flips to true, the landing page shows **"Watch a
recorded run"**, and `/replay` plays the real recording. Because the events
come straight from a genuine run, nothing about the replay is fabricated.
