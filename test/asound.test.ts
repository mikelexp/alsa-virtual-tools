import { describe, expect, it } from 'vitest';
import { renderBlock, replaceManagedBlock, unmanagedEqualDefinitions } from '../src/asound.js';
import type { Profile } from '../src/model.js';

const profile: Profile = {
  id: 'fiio_eq',
  displayName: 'FiiO',
  pcmName: 'fiio_eq',
  internalPcmName: 'fiio_eq_internal',
  ctlName: 'fiio_eq',
  target: 'plughw:CARD=Q1,DEV=0',
  channels: 2,
  controlsPath: '/tmp/fiio_eq.bin',
  enabled: true,
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
    expect(result).toContain('pcm.fiio_eq');
    expect(result).toContain('pcm.other_eq');
    expect(result).toContain('ALSATools Equalizer: FiiO');
  });
  it('preserves bytes outside its block', () => {
    const before = '# external\npcm.old { type hw }\n';
    const replaced = replaceManagedBlock(before, renderBlock([profile], '/caps.so'));
    expect(replaced.startsWith(before)).toBe(true);
    expect(replaceManagedBlock(replaced, renderBlock([], '/caps.so')).startsWith(before)).toBe(
      true,
    );
  });
  it('rejects malformed markers and detects external equal definitions', () => {
    expect(() => replaceManagedBlock('# BEGIN ALSATOOLS\n', 'x')).toThrow();
    expect(unmanagedEqualDefinitions('pcm.external { type equal\n }')).toEqual(['external']);
  });
});
