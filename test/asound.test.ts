import { describe, expect, it } from 'vitest';
import { renderBlock, replaceManagedBlock } from '../src/asound.js';
import type { Profile } from '../src/model.js';

const profile: Profile = {
  id: 'usb',
  displayName: 'USB DAC',
  pcmName: 'usb',
  target: 'plughw:CARD=TEST,DEV=0',
  channels: 2,
  enabled: true,
  bitperfect: false,
  stages: [
    { id: 'eq', type: 'equalizer', ctlName: 'usb', controlsPath: '/tmp/usb.bin' },
    { id: 'crossfeed', type: 'crossfeed', settings: 'normal' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
describe('ordered DSP chain', () => {
  it('renders every stage in stored signal order', () => {
    const block = renderBlock([profile], '/caps.so', '/ladspa/bs2b.so');
    expect(block).toContain('pcm.usb_stage_01_eq');
    expect(block).toContain('pcm.usb_stage_02_crossfeed');
    expect(block).toContain('slave.pcm "usb_stage_01_eq"');
    expect(block).toContain('ALSAChain EQ → Crossfeed: USB DAC');
  });
  it('supports crossfeed before EQ', () => {
    const [eq, crossfeed] = profile.stages;
    if (!eq || !crossfeed) throw new Error('fixture stages are missing');
    const block = renderBlock(
      [{ ...profile, stages: [crossfeed, eq] }],
      '/caps.so',
      '/ladspa/bs2b.so',
    );
    expect(block).toContain('pcm.usb_stage_01_crossfeed');
    expect(block).toContain('slave.pcm "usb_stage_01_crossfeed"');
  });
  it('bypasses every stage in BITPERFECT mode', () => {
    const block = renderBlock([{ ...profile, bitperfect: true }], '/caps.so', '/ladspa/bs2b.so');
    expect(block).toContain('type plug');
    expect(block).toContain('slave.pcm "plughw:CARD=TEST,DEV=0"');
    expect(block).not.toContain('type equal');
    expect(block).not.toContain('type ladspa');
  });
  it('preserves external configuration around its managed block', () => {
    const value = replaceManagedBlock('# external\n', renderBlock([], '/caps.so'));
    expect(value.startsWith('# external\n')).toBe(true);
  });
});
