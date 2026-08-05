import { describe, expect, it } from 'vitest';
import { alsaName, assertUniqueProfiles } from '../src/model.js';
describe('profile validation', () => {
  it('accepts safe ALSA identifiers and rejects injection syntax', () => {
    expect(alsaName.parse('usb_dac_eq-2')).toBe('usb_dac_eq-2');
    for (const value of ['bad name', 'bad"', '../bad', '1bad', 'a{'])
      expect(alsaName.safeParse(value).success).toBe(false);
  });
  it('detects ALSA name collisions', () => {
    const profile = {
      id: 'same',
      pcmName: 'same',
      internalPcmName: 'same_internal',
      ctlName: 'same',
      displayName: 'same',
      target: 'plughw:CARD=TEST_DAC,DEV=0',
      channels: 2,
      controlsPath: '/tmp/same.bin',
      enabled: true,
      eqEnabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(() => assertUniqueProfiles([profile, { ...profile, id: 'other' }])).toThrow();
  });
});
