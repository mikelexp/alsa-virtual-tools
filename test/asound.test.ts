import { describe, expect, it } from 'vitest';
import { renderBlock, replaceManagedBlock, unmanagedEqualDefinitions } from '../src/asound.js';
import type { Profile } from '../src/model.js';

const profile: Profile = {
  id: 'usb_dac_eq',
  displayName: 'USB DAC',
  pcmName: 'usb_dac_eq',
  internalPcmName: 'usb_dac_eq_internal',
  ctlName: 'usb_dac_eq',
  target: 'plughw:CARD=TEST_DAC,DEV=0',
  channels: 2,
  controlsPath: '/tmp/usb_dac_eq.bin',
  enabled: true,
  eqEnabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
describe('managed ALSA block', () => {
  it('renders multiple safe profiles', () => {
    const result = renderBlock(
      [
        profile,
        {
          ...profile,
          id: 'other_eq',
          pcmName: 'other_eq',
          internalPcmName: 'other_eq_internal',
          ctlName: 'other_eq',
        },
      ],
      '/usr/lib/ladspa/caps.so',
    );
    expect(result).toContain('pcm.usb_dac_eq');
    expect(result).toContain('pcm.other_eq');
    expect(result).toContain('ALSATools Equalizer: USB DAC');
  });
  it('preserves bytes outside its block', () => {
    const before = '# external\npcm.old { type hw }\n';
    const replaced = replaceManagedBlock(before, renderBlock([profile], '/caps.so'));
    expect(replaced.startsWith(before)).toBe(true);
    expect(replaceManagedBlock(replaced, renderBlock([], '/caps.so')).startsWith(before)).toBe(
      true,
    );
  });
  it('renders a direct bypass path without equalizer definitions', () => {
    const result = renderBlock([{ ...profile, eqEnabled: false }], '/caps.so');
    expect(result).toContain('type copy');
    expect(result).toContain('slave.pcm "hw:CARD=TEST_DAC,DEV=0"');
    expect(result).toContain('ALSATools Bit-perfect: USB DAC');
    expect(result).not.toContain('type plug');
    expect(result).not.toContain('type equal');
    expect(result).not.toContain('ctl.usb_dac_eq');
  });
  it('rejects malformed markers and detects external equal definitions', () => {
    expect(() => replaceManagedBlock('# BEGIN ALSA-VIRTUAL-TOOLS\n', 'x')).toThrow();
    expect(unmanagedEqualDefinitions('pcm.external { type equal\n }')).toEqual(['external']);
  });
});
