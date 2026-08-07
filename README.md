# ALSAChain

Keyboard-driven fullscreen TUI and CLI for managing safe, per-device virtual PCMs with optional `alsaequal` DSP. It builds per-device ALSA PCM signal chains: direct hardware paths, isolated EQ profiles, and optional DSP without changing global PipeWire policy. The JSON configuration under XDG config is authoritative; `~/.asoundrc` is changed only inside the `ALSACHAIN` managed block, after an explicit create/apply action.

## Install: Arch / CachyOS

```bash
paru -S alsachain-bin
alsachain doctor
```

The release binary includes its JavaScript runtime and npm dependencies. It does
not include system ALSA components, which remain package dependencies:
`alsa-utils`, `caps`, and `alsaequal`.

Headphone crossfeed is optional. Install `ladspa-bs2b` from the AUR when you
want to enable it; ALSAChain reports it separately and does not treat its
absence as a system failure.

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

The AUR package is maintained separately as `alsachain-bin`. After a
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
alsachain                 # fullscreen TUI
alsachain doctor
alsachain list
alsachain status dac_eq
alsachain validate
alsachain repair
alsachain print-config
```

The TUI manages each virtual PCM as an ordered DSP chain. Press `a` to open the
scrollable **Add DSP stage** catalog and choose a compatible stage; it is added
to the chain and opens its configuration. Press `s` for the scrollable
**Manage DSP stages** screen, where `Shift+↑` and `Shift+↓` reorder the
selected stage, `enter` configures it, and `d` removes it. The catalog and
manager are designed to grow as new stages are added. EQ bands, labels, ranges,
and current values are always discovered from the ALSA CTL rather than assumed.

## Generated configuration

In the TUI, select a profile and press `b` to switch between **PROCESSED** and
**BITPERFECT**. Processed mode renders its stored DSP stages in their configured
order. BITPERFECT omits every stage and routes the public PCM through `plug`
and the stable `plughw:CARD=...,DEV=...` target, so ALSA clients can negotiate
the physical device's supported format, rate, and channel layout. Adding a
stage returns the profile to Processed mode. Stop and restart playback after
changing a chain.

The profile list reports the active mode on the right:

- **PROCESSED**: one or more DSP stages are active; their ordered names appear
  under `stages`.
- **BITPERFECT**: no DSP stage is active and the profile channel count matches
  the physical PCM. Format and rate must also match for strict bit-perfect
  playback; ALSA's physical status cannot prove the source parameters.
- **EFFECTIVE BITPERFECT**: a stereo profile targets a PCM with a different
  physical channel count. ALSA preserves the audible stereo channels and pads
  the physical stream's unused channels. It is effective bit-perfect for the
  stereo output, but not strict bit-perfectness for the complete stream.

Crossfeed may be used with or without EQ, in either order. Crossfeed is DSP and
therefore is never bit-perfect.

```text
ctl.dac_eq {
    type equal
    controls "/home/me/.config/alsachain/controls/dac_eq.bin"
    library "/usr/lib/ladspa/caps.so"
    module "Eq10"
    channels 2
}

pcm.dac_eq_stage_01_eq {
    type equal
    slave.pcm "plughw:CARD=USB_DAC,DEV=0"
    controls "/home/me/.config/alsachain/controls/dac_eq.bin"
    library "/usr/lib/ladspa/caps.so"
    module "Eq10"
    channels 2
}

pcm.dac_eq {
    type plug
    slave.pcm "dac_eq_stage_01_eq"
    hint {
        show on
        description "ALSAChain EQ: USB DAC"
    }
}
```

## Safety and limits

- ALSA identifiers must match `[a-zA-Z][a-zA-Z0-9_-]*`; target devices are stable `plughw:CARD=...,DEV=...` values.
- Writes are atomic, backed up (ten recent copies), and rollback if CTL validation fails. Symlinked `.asoundrc` files are followed without replacing the link.
- `status` only reads `/proc/asound`; it does not open an in-use PCM. Equalizer DSP is never bit-perfect. ALSA hardware parameters alone cannot establish the input's native rate.
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
