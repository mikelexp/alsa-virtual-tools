# ALSAChain

Keyboard-driven fullscreen TUI and CLI for managing safe, per-device virtual PCMs with optional `alsaequal` DSP. It builds per-device ALSA PCM signal chains: direct hardware paths, isolated EQ profiles, and optional DSP without changing global PipeWire policy. The JSON configuration under XDG config is authoritative; `~/.asoundrc` is changed only inside the `ALSACHAIN` managed block, after an explicit create/apply action.

## Install: Arch / CachyOS

```bash
paru -S alsachain-bin
alsachain doctor
```

The AUR package installs both components automatically:

```text
/usr/bin/alsachain
/usr/lib/alsa-lib/libasound_module_pcm_alsachain_status.so
```

The release binary includes its JavaScript runtime and npm dependencies. It does
not include system ALSA components, which remain package dependencies:
`alsa-lib`, `alsa-utils`, `caps`, and `alsaequal`. The release also contains
the ALSAChain PCM status module; `install.sh` installs it into ALSA's module
directory and asks for `sudo` only for that step.

Headphone crossfeed is optional. Install `ladspa-bs2b` from the AUR when you
want to enable it; ALSAChain reports it separately and does not treat its
absence as a system failure.

To install a release manually, download the tarball from GitHub Releases, extract
it, and run:

```bash
./install.sh
```

The dependency check locates `caps.so`, checks command executables, verifies
that the conventional equal PCM/CTL modules have no unresolved `libasound`
symbols, and checks the ALSAChain PCM status module.

The released status module is compiled from `native/alsachain-status.c` and is
included in the same archive as the standalone executable. It is installed by
the AUR package or by `install.sh`; it is not a kernel module and does not need
DKMS or `modprobe`.

After upgrading from a version without the status module, regenerate the managed
block and restart any player that already has a profile open:

```bash
alsachain repair
```

## Playback Status Module

`libasound_module_pcm_alsachain_status.so` is an ALSA userspace PCM plugin, not
a kernel module. ALSA loads it dynamically only when a client opens an
ALSAChain public PCM. It needs no `modprobe`, DKMS, reboot, or kernel rebuild.

Every enabled profile has its own wrapper in the generated block:

```text
application -> public plug PCM -> alsachain_status -> private plug PCM -> DSP stages -> plughw target
```

The wrapper receives the virtual PCM lifecycle callbacks. It writes the profile
state to:

```text
$XDG_STATE_HOME/alsachain/playback/<profile-id>.status
```

When `XDG_STATE_HOME` is unset, the location is
`~/.local/state/alsachain/playback/`. A record contains the opening process ID,
state, negotiated rate, format, and channel count. The TUI and
`alsachain status <profile>` read this record, so two profiles that share the
same DAC are no longer both reported as playing merely because the physical
PCM is running.

Status files are mode `0600` in the managed state directory. The module leaves
the last record after a client closes or crashes; ALSAChain checks whether that
PID still exists, removes stale records, and then reports the profile as
inactive. It never opens a physical PCM to determine profile activity.

The plugin supports playback through interleaved little-endian `S16_LE`,
`S24_3LE`, `S24_LE`, `S32_LE`, and `FLOAT_LE` streams. It is inserted below the
public `plug` PCM, so ALSA can negotiate these formats with normal clients. A
player that bypasses the public ALSAChain PCM and opens `hw:*`, `plughw:*`, or a
different PCM is intentionally not attributed to any profile.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
make build-native
sudo make install-native
pnpm start
```

`make build-native` requires the ALSA development headers and `pkg-config`
(`libasound2-dev` and `pkg-config` on Ubuntu/Debian). The native smoke test
also requires `alsa-utils` because it invokes `aplay` against the `null` PCM.
`sudo make install-native` installs only
`libasound_module_pcm_alsachain_status.so` into `/usr/lib/alsa-lib/`; it does
not change ALSA configuration. Run `./run.sh repair` after installing it to
regenerate profiles with the wrapper.

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

The release workflow installs the native ALSA build dependencies, runs
`make check`, builds the standalone executable and status module, and uploads:

- `alsachain-0.1.0-linux-x86_64.tar.gz`
- `SHA256SUMS`

The current release is available at
<https://github.com/mikelexp/alsachain/releases/tag/v0.1.0>.

The AUR package is maintained separately as `alsachain-bin`. After a
GitHub Release exists, update it with:

```bash
make aur-update VERSION=0.1.0
```

The release archive includes the native status module. The `PKGBUILD` installs
it under `/usr/lib/alsa-lib/` as part of the normal package transaction; users
do not need to run `make install-native` after installing from the AUR.

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

The TUI manages each virtual PCM as an ordered DSP chain. Press `s` for the scrollable
**Manage DSP stages** screen, where `Shift+↑` and `Shift+↓` reorder the
selected stage, `enter` configures it, `d` removes it, and `a` opens the
**Add DSP stage** catalog. The catalog and manager are designed to grow as new
stages are added. Gain supports amplification and attenuation from `-24 dB` to
`+12 dB` in `0.5 dB` steps. EQ bands, labels, ranges, and current values are
always discovered from the ALSA CTL rather than assumed.
EQ values are written immediately, but restart playback after changing them so
the player opens a fresh ALSA PCM chain.

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

Crossfeed and gain may be used with or without EQ, in any stored order. Both
are DSP and therefore are never bit-perfect. Positive gain values can clip when
the signal or a later EQ stage exceeds 0 dBFS; use negative gain as headroom
when needed.

The private `*_status_target` and `*_status` PCMs are implementation details.
Applications must select the public PCM only, for example `dac_eq`; do not
select the private names directly.

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

pcm.dac_eq_status_target {
    type plug
    slave.pcm "dac_eq_stage_01_eq"
}

pcm.dac_eq_status {
    type alsachain_status
    status_path "/home/me/.local/state/alsachain/playback/dac_eq.status"
    slave_name "dac_eq_status_target"
}

pcm.dac_eq {
    type plug
    slave.pcm "dac_eq_status"
    hint {
        show on
        description "ALSAChain EQ: USB DAC"
    }
}
```

## Safety and limits

- ALSA identifiers must match `[a-zA-Z][a-zA-Z0-9_-]*`; target devices are stable `plughw:CARD=...,DEV=...` values.
- Writes are atomic, backed up (ten recent copies), and rollback if CTL validation fails. Symlinked `.asoundrc` files are followed without replacing the link.
- Each public PCM includes an ALSAChain lifecycle wrapper. It records its own
  `prepare`, `start`, `pause`, `stop`, and close transitions under XDG state,
  so `status` and the profile list report the selected virtual PCM rather than
  merely the shared physical device. Stale records from terminated clients are
  discarded without opening an in-use PCM.
- Equalizer DSP is never bit-perfect. ALSA hardware parameters alone cannot establish the input's native rate.
- The installed `alsaequal` version must be validated on the target machine; distributions can place its PCM/CTL modules in different locations.
- External `type equal` definitions are detected but never modified.
- Changing a profile target affects new ALSA connections only. Stop and restart playback, or make the client reopen the public PCM, before expecting an active stream to move to the new DAC.
- Profile activity is only authoritative for clients using the generated public
  PCM. It does not identify streams routed through PipeWire/PulseAudio or a raw
  hardware PCM outside ALSAChain.

## Safe first run

```bash
pnpm dev doctor
pnpm dev list
pnpm dev print-config
# only after checking dependencies, launch the TUI and create a profile
pnpm dev
```
