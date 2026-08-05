import { describe, expect, it } from 'vitest';
import { parseAplayList, parseCards, parseHwParams, parseStatus } from '../src/alsa.js';
describe('ALSA parsers', () => {
  it('parses playback hardware without capture entries', () => {
    const devices = parseAplayList(
      '**** List of PLAYBACK Hardware Devices ****\ncard 4: Q1 [FiiO Q1], device 0: USB Audio [USB Audio]\n',
    );
    expect(devices).toMatchObject([{ cardId: 'Q1', target: 'plughw:CARD=Q1,DEV=0' }]);
  });
  it('parses card ids and runtime state', () => {
    expect(parseCards(' 4 [Q1 ]: USB-Audio - FiiO Q1\n').get(4)).toEqual({
      id: 'Q1',
      name: 'USB-Audio - FiiO Q1',
    });
    expect(parseStatus('state: RUNNING\n')).toBe('Playing');
    expect(parseStatus('state: XRUN\n')).toBe('XRUN');
  });
  it.each([
    ['S16_LE', 16, 16],
    ['S24_3LE', 24, 24],
    ['S24_LE', 24, 32],
    ['S32_LE', 32, 32],
  ])('interprets %s', (format, logicalBits, containerBits) => {
    expect(parseHwParams(`format: ${format}\nrate: 96000\nchannels: 2\n`)).toMatchObject({
      format,
      logicalBits,
      containerBits,
      rate: '96000',
      channels: 2,
    });
  });
});
