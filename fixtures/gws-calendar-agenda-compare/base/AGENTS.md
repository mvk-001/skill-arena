# Calendar Agenda Benchmark

For Google Calendar agenda requests:

- Use the task prompt's JSON response contract exactly.
- Prefer the local `gws calendar +agenda` command in read-only mode.
- If the command fails because of auth, permission, or scope problems, do not
  invent events. Return the required JSON shape with `events: []`,
  `eventCount: 0`, the command you attempted in `commandUsed`, and a concise
  failure summary in `notes`.
