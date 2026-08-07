# ALSAChain Contributor Notes

## Purpose

`alsachain` is a Linux TUI/CLI for managing `alsaequal` virtual ALSA PCMs. It owns only:

- `~/.config/alsachain/`
- the marked `ALSACHAIN` block in `~/.asoundrc`

It must not modify `/etc/asound.conf`, `pcm.!default`, PipeWire configuration, or unrelated user ALSA configuration.

## Stack and Commands

- Node.js 22+, TypeScript strict, ESM, React + Ink, pnpm, Vitest, ESLint, Prettier.
- Install/build: `./setup.sh`
- Run TUI: `./run.sh`
- Read-only diagnostics: `./run.sh doctor`, `./run.sh list`, `./run.sh validate`, `./run.sh print-config`
- Regenerate the managed block: `./run.sh repair`
- Verify changes: `pnpm format:check && pnpm lint && pnpm test && pnpm build`

`pnpm-workspace.yaml` explicitly allows the local `esbuild` postinstall needed by Vitest and tsx.

## Architecture

- `src/model.ts`: Zod schemas, safe ALSA identifiers, ordered DSP-stage instances, and profile collision rules.
- `src/store.ts`: XDG state, atomic writes, `.asoundrc` backups/rollback, controls-directory safety.
- `src/asound.ts`: the isolated generated block, ordered DSP-chain rendering, and external `type equal` detection.
- `src/alsa.ts`: `aplay -l` parsing and non-invasive `/proc/asound` state reading.
- `src/deps.ts`: executable/module/LADSPA validation and install suggestions only.
- `src/service.ts`: transactional stage add/move/remove actions and integrated EQ CTL reads/writes.
- `src/ui.tsx`: keyboard-only Ink UI.
- `src/index.tsx`: TUI startup plus non-interactive CLI commands.

External commands must go through the injectable `CommandRunner`; do not introduce shell-string execution for ALSA actions.

## TUI Visual Rules

- Keep the interactive UI fullscreen and responsive to terminal resize events.
- Use `#315BEF` for primary accents, borders, selections, and keyboard hints; reserve green, yellow, and red for semantic status or warnings.
- Keep playback-device rows compact with no blank line between devices.
- Text fields must behave like normal terminal inputs: support visible cursor placement, insertion, arrows, backspace, delete, Home/End, and predictable focus movement.
- EQ graphs, both in the fullscreen editor and virtual-card list, use the eight partial-height Unicode blocks `▁▂▃▄▅▆▇█`. Preserve that shared visual scale instead of reverting to binary or coarse bars.
- Do not show success-confirmation modals for normal in-place settings changes, including crossfeed; return to the relevant screen and reflect the new state. Reserve modals for errors, destructive actions, or information that needs acknowledgement.
- Keep **Add DSP stage** and **Manage DSP stages** as fullscreen, height-aware lists: the stage catalog and an individual chain can grow beyond the terminal viewport.
- Render stages in their saved signal order everywhere a profile is summarized. When a stage moves, move the selection with that same stage.
- Use `Shift+↑` / `Shift+↓` as the visible reordering shortcut; `[` / `]` may remain as non-advertised aliases.

## ALSA Rules

- Names must match `[a-zA-Z][a-zA-Z0-9_-]*`.
- Use stable physical targets such as `plughw:CARD=<card-id>,DEV=<n>`, never volatile card indexes.
- The public PCM needs an ALSA `hint` block so applications using `snd_device_name_hint`/`aplay -L` can enumerate it.
- Validate a generated CTL with `amixer -D <ctl> scontrols`; do not open a physical PCM merely to probe it.
- `alsaequal` is DSP, so it is never bit-perfect. Physical `hw_params` alone do not reveal source bit depth or native sample rate.
- Preserve the `.asoundrc` symlink itself: write atomically to its resolved target and retain the link.
- Controls files must remain inside the configured `controlsDir`; reject traversal and symlinks.
- `Profile.stages` is the source of truth for DSP. A stage renderer wraps the preceding PCM; do not reintroduce boolean EQ/crossfeed combinations as chain logic.

## Equalizer Backend Direction

- Keep CAPS `Eq10` as the only active backend for now. It provides 10 fixed bands; do not add another backend unless explicitly requested.
- Never hard-code 10 bands in the model or TUI. Discover the current controls through `amixer` so rendering and editing remain compatible with a future backend change.
- Every virtual card must have its own normalized controls path and must not share the same file through aliases or hard links.
- The preferred future higher-band option is the SWH LADSPA `mbeq` module from `swh-plugins`. It exposes 15 fixed bands and should require backend selection/configuration rather than custom DSP. Upstream definition: <https://github.com/swh/ladspa/blob/master/mbeq_1197.xml>.
- LSP provides 16- and 32-band LADSPA graphic equalizers, but they also expose many non-band controls. They are not clean `alsaequal` drop-ins without explicit control metadata/filtering.
- Fixed LADSPA equalizers allow choosing a preset topology (for example, Eq10 or mbeq), not adding or removing arbitrary individual bands. Arbitrary topology would require a different host, a plugin chain, or custom DSP.

## Integration Notes

- Supported dependencies are `alsa-utils`, `caps`, and `alsaequal`.
- A generated public PCM must be visible through `aplay -L` and its corresponding CTL must validate through `amixer`.
- Sone support lives in `/opt/sone`, not this repository. Its `access-alsa-devices` branch enumerates ALSA PCM hints so it can list public virtual PCMs.

## Testing Constraints

- Tests must never use the real `HOME`, write the real `.asoundrc`, or open physical ALSA devices.
- Use temporary XDG/HOME paths and fake command runners for persistence/dependency tests.
- Do not claim DAC-dependent behavior verified unless it was observed with the real hardware; document the gap instead.
