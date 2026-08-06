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

  it('requires a separate normalized controls file for every profile', () => {
    const profile = {
      id: 'first',
      pcmName: 'first',
      internalPcmName: 'first_internal',
      ctlName: 'first',
      displayName: 'First',
      target: 'plughw:CARD=TEST_DAC,DEV=0',
      channels: 2,
      controlsPath: '/tmp/controls/first.bin',
      enabled: true,
      eqEnabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const second = {
      ...profile,
      id: 'second',
      pcmName: 'second',
      internalPcmName: 'second_internal',
      ctlName: 'second',
      controlsPath: '/tmp/controls/nested/../first.bin',
    };

    expect(() => assertUniqueProfiles([profile, second])).toThrow(
      'Profiles must use separate controls files',
    );
  });

  it('accepts only the supported crossfeed strengths', async () => {
    const { profileSchema } = await import('../src/model.js');
    const profile = {
      id: 'headphones',
      pcmName: 'headphones',
      internalPcmName: 'headphones_internal',
      ctlName: 'headphones',
      displayName: 'Headphones',
      target: 'plughw:CARD=TEST_DAC,DEV=0',
      channels: 2,
      controlsPath: '/tmp/headphones.bin',
      enabled: true,
      eqEnabled: true,
      crossfeed: 'normal',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(profileSchema.safeParse(profile).success).toBe(true);
    expect(profileSchema.safeParse({ ...profile, crossfeed: 'max' }).success).toBe(false);
    expect(
      profileSchema.safeParse({ ...profile, crossfeed: { cutoff: 925, feed: 5.5 } }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ ...profile, crossfeed: { cutoff: 250, feed: 5.5 } }).success,
    ).toBe(false);
  });
});
