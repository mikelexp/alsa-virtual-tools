import React from 'react';
import { renderToString } from 'ink';
import { describe, expect, it } from 'vitest';
import { EqualizerGraph } from '../src/equalizer-ui.js';

const band = {
  control: '00. 31 Hz',
  label: '31 Hz',
  min: 0,
  max: 100,
  value: 66,
  channelValues: [66, 66],
};

function graphRows(value: number): string[] {
  return renderToString(
    <EqualizerGraph
      bands={[{ ...band, value, channelValues: [value, value] }]}
      selection={0}
      levels={2}
      columnWidth={8}
    />,
    { columns: 80 },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
}

describe('equalizer graph rendering', () => {
  it.each([
    [66, ['··', '··', '──', '··', '··']],
    [80, ['··', '▇▇', '──', '··', '··']],
    [49, ['··', '··', '──', '▄▄', '··']],
    [0, ['··', '··', '──', '██', '██']],
    [100, ['██', '██', '──', '··', '··']],
  ])('keeps 0 dB in the center at control value %i', (value, expectedRows) => {
    expect(graphRows(value)).toEqual(expectedRows);
  });
});
