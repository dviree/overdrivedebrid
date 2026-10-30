# Claude instructions

## Always use Trail-Code

**Every turn starts with Trail-Code. No exceptions.** The owner has said so plainly and more than
once: no answer, plan, status check or step about this code, its builds or the app without a
`trail` command first in that same turn. A question that seems to need no code (a build's status,
a link) still starts with one, for instance `trail ask` on what the question touches.

Trail-Code (`trail`, also answering as `graft`) is used for every look into this code. Before
reading files whole or reaching for grep:

- `trail ask "<what you need>" --source` to find where something lives, with the code inline
- `trail callers <symbol>` to see who calls a function (`--direction out` for what it calls)
- `trail grep "<literal>"` to find every use, grouped by function
- `trail skeleton <file>` for a file's API in a few lines
- `trail blast` before publishing a change, to see what it reaches

When a session works something out about this code (a cause, a rule, a dead end), save it with
`trail note` so the next session starts from it.

If `trail` is not installed on the machine, install it first:
`npm install -g @trailhq/trail-code` (with `DO_NOT_TRACK=1` its anonymous usage stats stay off),
then `trail build` in the repo.

`ps5-react/CLAUDE.md` and `ps5-react/AGENTS.md` hold the rules for the framework under `ps5-react/`.
