import { describe, expect, it } from 'vitest';
import {
  bandValueForEqualizerGainDb,
  clampBandValue,
  equalizerBarRows,
  equalizerCutBarRows,
  equalizerCutVerticalCell,
  equalizerCutVerticalFill,
  equalizerGainDb,
  equalizerVerticalCell,
  flatBandValue,
  formatEqualizerGain,
  parseEqualizerBands,
} from '../src/equalizer.js';

const amixerOutput = `Simple mixer control '00. 31 Hz',0
  Capabilities: pvolume
  Playback channels: Front Left - Front Right
  Limits: Playback 0 - 100
  Mono:
  Front Left: Playback 66 [66%]
  Front Right: Playback 68 [68%]
Simple mixer control '01. 63 Hz',0
  Capabilities: pvolume
  Playback channels: Front Left - Front Right
  Limits: Playback 0 - 100
  Mono:
  Front Left: Playback 40 [40%]
  Front Right: Playback 40 [40%]
`;

describe('equalizer controls', () => {
  it('parses bands, ranges and channel values from amixer', () => {
    expect(parseEqualizerBands(amixerOutput)).toEqual([
      {
        control: '00. 31 Hz',
        label: '31 Hz',
        min: 0,
        max: 100,
        value: 67,
        channelValues: [66, 68],
      },
      {
        control: '01. 63 Hz',
        label: '63 Hz',
        min: 0,
        max: 100,
        value: 40,
        channelValues: [40, 40],
      },
    ]);
  });

  it('ignores unrelated output and clamps values to the reported range', () => {
    expect(parseEqualizerBands('Simple mixer control malformed')).toEqual([]);
    const band = parseEqualizerBands(amixerOutput)[0];
    expect(band).toBeDefined();
    if (!band) return;
    expect(clampBandValue(band, -1)).toBe(0);
    expect(clampBandValue(band, 101)).toBe(100);
    expect(clampBandValue(band, 50.6)).toBe(51);
  });

  it('renders boosts and cuts around the discovered Flat point', () => {
    const bands = parseEqualizerBands(amixerOutput);
    expect(equalizerBarRows(bands, 4, 8)).toEqual(['· ·', '· ·', '· ·', '▁ ·']);
    const lowBand = bands[0];
    const highBand = bands[1];
    expect(lowBand).toBeDefined();
    expect(highBand).toBeDefined();
    if (!lowBand || !highBand) return;
    expect(
      equalizerBarRows(
        [
          { ...lowBand, value: 66 },
          { ...highBand, value: 100 },
        ],
        2,
        3,
      ),
    ).toEqual(['· █', '· █']);
    expect(
      equalizerCutBarRows(
        [
          { ...lowBand, value: 0 },
          { ...highBand, value: 66 },
        ],
        2,
        3,
      ),
    ).toEqual(['█ ·', '█ ·']);
  });

  it('uses partial-height Unicode blocks for vertical EQ bars', () => {
    const band = parseEqualizerBands(amixerOutput)[0];
    expect(band).toBeDefined();
    if (!band) return;
    expect(equalizerVerticalCell({ ...band, value: 66 }, 4, 10)).toBe('··');
    expect(equalizerVerticalCell({ ...band, value: 100 }, 0, 10)).toBe('██');
    expect(equalizerCutVerticalCell({ ...band, value: 0 }, 0, 10)).toBe('██');
    expect(equalizerCutVerticalCell({ ...band, value: 49 }, 0, 2)).toBe('▄▄');
    expect(equalizerCutVerticalCell({ ...band, value: 49 }, 1, 2)).toBe('··');
    expect(equalizerCutVerticalFill({ ...band, value: 49 }, 0, 2)).toBe(4);
    expect(equalizerCutVerticalCell({ ...band, value: 62 }, 0, 2)).toBe('▇▇');
  });

  it('labels the Eq10 neutral control as Flat instead of its raw percentage', () => {
    const band = parseEqualizerBands(amixerOutput)[0];
    expect(band).toBeDefined();
    if (!band) return;
    expect(flatBandValue(band)).toBe(66);
    expect(formatEqualizerGain({ ...band, value: 66 })).toBe('Flat');
    expect(formatEqualizerGain({ ...band, value: 80 })).toBe('+9.6 dB');
    expect(equalizerGainDb({ ...band, value: 50 })).toBe(-12);
    expect(bandValueForEqualizerGainDb(band, 1)).toBe(68);
    expect(bandValueForEqualizerGainDb(band, -1)).toBe(65);
  });

  it('compresses every configured band when the terminal column is narrower', () => {
    const source = parseEqualizerBands(amixerOutput);
    const lowBand = source[0];
    expect(lowBand).toBeDefined();
    if (!lowBand) return;
    const bands = Array.from({ length: 12 }, (_, value) => ({ ...lowBand, value: value * 9 }));
    const rows = equalizerBarRows(bands, 4, 6);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.length === 6)).toBe(true);
  });
});
