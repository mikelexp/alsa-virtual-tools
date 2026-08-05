# alsatools

Keyboard-driven fullscreen TUI and CLI for managing safe, per-device `alsaequal` virtual PCMs. The JSON configuration under XDG config is authoritative; `~/.asoundrc` is changed only inside the `ALSATOOLS` managed block, after an explicit create/apply action.

## Install: Arch / CachyOS

```bash
sudo pacman -S nodejs pnpm alsa-utils caps qastools
# use an AUR helper you already trust; do not run this from alsatools automatically
paru -S alsaequal
pnpm install
pnpm build
pnpm start
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

Or use the included scripts:

```bash
./setup.sh
./run.sh doctor
./run.sh
```

On hosts where pnpm blocks `esbuild` build scripts, approve `esbuild` through the local pnpm policy before running Vitest. This project does not weaken that policy automatically.

## CLI

```bash
alsatools                 # fullscreen TUI
alsatools doctor
alsatools list
alsatools status dac_eq
alsatools validate
alsatools repair
alsatools print-config
alsatools qasmixer dac_eq
```

## Generated configuration

```text
ctl.dac_eq {
    type equal
    controls "/home/me/.config/alsatools/controls/dac_eq.bin"
    library "/usr/lib/ladspa/caps.so"
    module "Eq10"
    channels 2
}

pcm.dac_eq_internal {
    type equal
    slave.pcm "plughw:CARD=USB_DAC,DEV=0"
    controls "/home/me/.config/alsatools/controls/dac_eq.bin"
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
