# alsa-virtual-tools

Keyboard-driven fullscreen TUI and CLI for managing safe, per-device virtual PCMs with optional `alsaequal` DSP. It builds per-device ALSA PCM signal chains: direct hardware paths, isolated EQ profiles, and optional DSP without changing global PipeWire policy. The JSON configuration under XDG config is authoritative; `~/.asoundrc` is changed only inside the `ALSA-VIRTUAL-TOOLS` managed block, after an explicit create/apply action.

## Install: Arch / CachyOS

```bash
paru -S alsa-virtual-tools-bin
alsa-virtual-tools doctor
```

The release binary includes its JavaScript runtime and npm dependencies. It does
not include system ALSA components, which remain package dependencies:
`alsa-utils`, `caps`, and `alsaequal`.

To install a release manually, download the tarball from GitHub Releases, extract
it, and run:

```bash
./install.sh
```

The dependency check locates `caps.so`, checks command executables and the conventional equal PCM/CTL modules. It reports missing pieces and suggested commands, but it never installs packages or invokes `sudo`.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm start
```

## Release build

The distributable Linux x86_64 executable is compiled with Bun and does not
require Node.js, Bun, pnpm, or `node_modules` on the target machine:

```bash
bun install
make check
make release
```

The archive and its checksum are written to `dist/`. GitHub Releases are
created by pushing a tag that matches the package version:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The AUR package is maintained separately as `alsa-virtual-tools-bin`. After a
GitHub Release exists, update it with:

```bash
make aur-update VERSION=0.1.0
```

Or use the included scripts:

```bash
./setup.sh
./run.sh doctor
./run.sh
```

On hosts where pnpm blocks `esbuild` build scripts, approve `esbuild` through the local pnpm policy before running Vitest. This project does not weaken that policy automatically.

## CLI

```bash
alsa-virtual-tools                 # fullscreen TUI
alsa-virtual-tools doctor
alsa-virtual-tools list
alsa-virtual-tools status dac_eq
alsa-virtual-tools validate
alsa-virtual-tools repair
alsa-virtual-tools print-config
```

In the TUI, select an EQ-enabled profile and press `m` to open the integrated
graphic equalizer. Its bands, labels, ranges, and current values are discovered
from the profile's ALSA CTL. Use left/right to select a band and up/down to
adjust both channels. Changes apply immediately to active equalized playback.

## Generated configuration

In the TUI, select a profile and press `b` to switch its EQ between DSP and
bypass. Bypass keeps the public PCM and physical target but removes the
`alsaequal` PCM/CTL layer, so playback can use the direct bit-perfect path.
Stop and restart playback after changing the mode.

```text
ctl.dac_eq {
    type equal
    controls "/home/me/.config/alsa-virtual-tools/controls/dac_eq.bin"
    library "/usr/lib/ladspa/caps.so"
    module "Eq10"
    channels 2
}

pcm.dac_eq_internal {
    type equal
    slave.pcm "plughw:CARD=USB_DAC,DEV=0"
    controls "/home/me/.config/alsa-virtual-tools/controls/dac_eq.bin"
    library "/usr/lib/ladspa/caps.so"
    module "Eq10"
    channels 2
}

pcm.dac_eq {
    type plug
    slave.pcm "dac_eq_internal"
    hint {
        show on
        description "ALSATools Equalizer: USB DAC"
    }
}
```

## Safety and limits

- ALSA identifiers must match `[a-zA-Z][a-zA-Z0-9_-]*`; target devices are stable `plughw:CARD=...,DEV=...` values.
- Writes are atomic, backed up (ten recent copies), and rollback if CTL validation fails. Symlinked `.asoundrc` files are followed without replacing the link.
- `status` only reads `/proc/asound`; it does not open an in-use PCM. Equalizer DSP is never bit-perfect. Input/native rate is shown as unknown because ALSA hardware parameters alone cannot establish it.
- The installed `alsaequal` version must be validated on the target machine; distributions can place its PCM/CTL modules in different locations.
- External `type equal` definitions are detected but never modified.
- Changing a profile target affects new ALSA connections only. Stop and restart playback, or make the client reopen the public PCM, before expecting an active stream to move to the new DAC.

## Safe first run

```bash
pnpm dev doctor
pnpm dev list
pnpm dev print-config
# only after checking dependencies, launch the TUI and create a profile
pnpm dev
```
