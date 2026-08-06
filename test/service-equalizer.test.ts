import { describe, expect, it } from 'vitest';
import type { Profile } from '../src/model.js';
import { getPaths } from '../src/paths.js';
import type { CommandRunner } from '../src/runner.js';
import { ALSAChainService } from '../src/service.js';

const profile: Profile = {
  id: 'test_eq',
  displayName: 'Test EQ',
  pcmName: 'test_eq',
  internalPcmName: 'test_eq_internal',
  ctlName: 'test_eq',
  target: 'plughw:CARD=TEST_DAC,DEV=0',
  channels: 2,
  controlsPath: '/tmp/alsachain-test/controls/test_eq.bin',
  enabled: true,
  eqEnabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const output = `Simple mixer control '00. 31 Hz',0
  Capabilities: pvolume
  Playback channels: Front Left - Front Right
  Limits: Playback 0 - 100
  Mono:
  Front Left: Playback 66 [66%]
  Front Right: Playback 66 [66%]
`;

describe('equalizer service', () => {
  it('creates new profiles in BITPERFECT mode with no DSP stage enabled', () => {
    const service = new ALSAChainService(getPaths({ HOME: '/tmp/alsachain-test' }), {
      async run() {
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });
    const profile = service.createProfile({
      id: 'new_profile',
      displayName: 'New profile',
      target: 'plughw:CARD=TEST_DAC,DEV=0',
      channels: 2,
    });
    expect(profile.bitperfect).toBe(true);
    expect(profile.eqEnabled).toBe(false);
  });

  it('reads and writes the profile CTL through the command runner', async () => {
    const calls: { file: string; args: string[] }[] = [];
    const runner: CommandRunner = {
      async run(file, args = []) {
        calls.push({ file, args });
        return { stdout: output, stderr: '', exitCode: 0 };
      },
    };
    const service = new ALSAChainService(getPaths({ HOME: '/tmp/alsachain-test' }), runner);

    const bands = await service.equalizerBands(profile);
    const band = bands[0];
    expect(band).toBeDefined();
    if (!band) return;
    await service.setEqualizerBand(profile, band, 70);

    expect(calls).toEqual([
      { file: 'amixer', args: ['-D', 'test_eq', 'scontents'] },
      { file: 'amixer', args: ['-D', 'test_eq', 'sset', '00. 31 Hz', '70'] },
    ]);
  });

  it('rejects BITPERFECT profiles and out-of-range values before writing', async () => {
    let calls = 0;
    const runner: CommandRunner = {
      async run() {
        calls += 1;
        return { stdout: output, stderr: '', exitCode: 0 };
      },
    };
    const service = new ALSAChainService(getPaths({ HOME: '/tmp/alsachain-test' }), runner);
    await expect(service.equalizerBands({ ...profile, eqEnabled: false })).rejects.toThrow(
      'BITPERFECT is active',
    );
    await expect(
      service.setEqualizerBand(
        profile,
        {
          control: '00. 31 Hz',
          label: '31 Hz',
          min: 0,
          max: 100,
          value: 66,
          channelValues: [66, 66],
        },
        101,
      ),
    ).rejects.toThrow('between 0 and 100');
    expect(calls).toBe(0);
  });
});
