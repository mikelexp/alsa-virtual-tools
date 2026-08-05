# alsa-virtual-tools Contributor Notes

## Purpose

`alsa-virtual-tools` is a Linux TUI/CLI for managing `alsaequal` virtual ALSA PCMs. It owns only:

- `~/.config/alsatools/`
- the marked `ALSATOOLS` block in `~/.asoundrc`

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

- `src/model.ts`: Zod schemas, safe ALSA identifiers, profile collision rules.
- `src/store.ts`: XDG state, atomic writes, `.asoundrc` backups/rollback, controls-directory safety.
- `src/asound.ts`: the isolated generated block and external `type equal` detection.
- `src/alsa.ts`: `aplay -l` parsing and non-invasive `/proc/asound` state reading.
- `src/deps.ts`: executable/module/LADSPA validation and install suggestions only.
- `src/service.ts`: application actions and detached QasMixer launch.
- `src/ui.tsx`: keyboard-only Ink UI.
- `src/index.tsx`: TUI startup plus non-interactive CLI commands.

External commands must go through the injectable `CommandRunner`; do not introduce shell-string execution for ALSA actions.

## ALSA Rules

- Names must match `[a-zA-Z][a-zA-Z0-9_-]*`.
- Use stable physical targets such as `plughw:CARD=<card-id>,DEV=<n>`, never volatile card indexes.
- The public PCM needs an ALSA `hint` block so applications using `snd_device_name_hint`/`aplay -L` can enumerate it.
- Validate a generated CTL with `amixer -D <ctl> scontrols`; do not open a physical PCM merely to probe it.
- `alsaequal` is DSP, so it is never bit-perfect. Physical `hw_params` alone do not reveal source bit depth or native sample rate.
- Preserve the `.asoundrc` symlink itself: write atomically to its resolved target and retain the link.
- Controls files must remain inside the configured `controlsDir`; reject traversal and symlinks.

## Integration Notes

- Supported dependencies are `alsa-utils`, `caps`, `alsaequal`, and `qastools`/QasMixer.
- A generated public PCM must be visible through `aplay -L` and its corresponding CTL must validate through `amixer`.
- Sone support lives in `/opt/sone`, not this repository. Its `access-alsa-devices` branch enumerates ALSA PCM hints so it can list public virtual PCMs.

## Testing Constraints

- Tests must never use the real `HOME`, write the real `.asoundrc`, or open physical ALSA devices.
- Use temporary XDG/HOME paths and fake command runners for persistence/dependency tests.
- Do not claim DAC-dependent behavior verified unless it was observed with the real hardware; document the gap instead.
