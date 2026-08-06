export interface EqualizerBand {
  control: string;
  label: string;
  min: number;
  max: number;
  value: number;
  channelValues: number[];
}

// CAPS Eq10 is the only supported backend. Its LADSPA ports span -48 to +24 dB,
// while alsaequal exposes the ports as the integer range reported by amixer.
const EQ10_MIN_DB = -48;
const EQ10_MAX_DB = 24;

export function flatBandValue(band: EqualizerBand): number {
  const ratio = -EQ10_MIN_DB / (EQ10_MAX_DB - EQ10_MIN_DB);
  return Math.floor(band.min + ratio * (band.max - band.min));
}

export function equalizerGainDb(band: EqualizerBand, value = band.value): number {
  if (value === flatBandValue(band)) return 0;
  const ratio = (value - band.min) / Math.max(1, band.max - band.min);
  return EQ10_MIN_DB + ratio * (EQ10_MAX_DB - EQ10_MIN_DB);
}

export function isFlatBandValue(band: EqualizerBand, value = band.value): boolean {
  // alsaequal's integer control representation rounds the Eq10 zero point to 66.
  return value === flatBandValue(band);
}

export function bandValueForEqualizerGainDb(band: EqualizerBand, gainDb: number): number {
  if (gainDb === 0) return flatBandValue(band);
  const clampedGain = Math.max(EQ10_MIN_DB, Math.min(EQ10_MAX_DB, gainDb));
  const ratio = (clampedGain - EQ10_MIN_DB) / (EQ10_MAX_DB - EQ10_MIN_DB);
  return clampBandValue(band, band.min + ratio * (band.max - band.min));
}

export function formatEqualizerGain(band: EqualizerBand, value = band.value): string {
  if (isFlatBandValue(band, value)) return 'Flat';
  const gain = equalizerGainDb(band, value);
  return `${gain > 0 ? '+' : ''}${gain.toFixed(1)} dB`;
}

export function parseEqualizerBands(output: string): EqualizerBand[] {
  const sections = output.split(/(?=^Simple mixer control )/m);
  const bands: EqualizerBand[] = [];

  for (const section of sections) {
    const control = section.match(/^Simple mixer control '(.+)',\d+$/m)?.[1];
    const limits = section.match(/^\s+Limits: Playback (-?\d+) - (-?\d+)$/m);
    if (!control || !limits) continue;

    const channelValues = [...section.matchAll(/^\s+[^:]+: Playback (-?\d+) \[-?\d+%\]$/gm)].map(
      (match) => Number(match[1]),
    );
    if (channelValues.length === 0) continue;

    const min = Number(limits[1]);
    const max = Number(limits[2]);
    bands.push({
      control,
      label: control.replace(/^\d+\.\s*/, ''),
      min,
      max,
      value: Math.round(
        channelValues.reduce((sum, value) => sum + value, 0) / channelValues.length,
      ),
      channelValues,
    });
  }

  return bands;
}

export function clampBandValue(band: EqualizerBand, value: number): number {
  return Math.max(band.min, Math.min(band.max, Math.round(value)));
}

const verticalBlocks = ['·', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function equalizerVerticalCell(band: EqualizerBand, row: number, rowCount: number): string {
  if (rowCount < 1 || row < 0 || row >= rowCount) return '··';
  const ratio = positiveGainRatio(band);
  const totalUnits = Math.round(ratio * rowCount * 8);
  const rowBase = (rowCount - row - 1) * 8;
  const fill = Math.max(0, Math.min(8, totalUnits - rowBase));
  return (verticalBlocks[fill] ?? '·').repeat(2);
}

export function equalizerCutVerticalCell(
  band: EqualizerBand,
  row: number,
  rowCount: number,
): string {
  const fill = equalizerCutVerticalFill(band, row, rowCount);
  return (verticalBlocks[mirroredCutBlockIndex(fill)] ?? '·').repeat(2);
}

export function equalizerCutVerticalFill(
  band: EqualizerBand,
  row: number,
  rowCount: number,
): number {
  if (rowCount < 1 || row < 0 || row >= rowCount) return 0;
  const ratio = negativeGainRatio(band);
  const totalUnits = Math.round(ratio * rowCount * 8);
  const rowBase = row * 8;
  return Math.max(0, Math.min(8, totalUnits - rowBase));
}

const positiveGainRatio = (band: EqualizerBand): number =>
  Math.max(0, (band.value - flatBandValue(band)) / Math.max(1, band.max - flatBandValue(band)));

const negativeGainRatio = (band: EqualizerBand): number =>
  Math.max(0, (flatBandValue(band) - band.value) / Math.max(1, flatBandValue(band) - band.min));

const mirroredCutBlockIndex = (fill: number): number => (fill > 0 && fill < 8 ? 8 - fill : fill);

function compressBands(
  bands: EqualizerBand[],
  count: number,
  normalize: (band: EqualizerBand) => number,
): number[] {
  if (bands.length <= count) return bands.map(normalize);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * bands.length) / count);
    const end = Math.max(start + 1, Math.floor(((index + 1) * bands.length) / count));
    const bucket = bands.slice(start, end).map(normalize);
    return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
  });
}

export function equalizerBarRows(
  bands: EqualizerBand[],
  rowCount: number,
  maxWidth: number,
): string[] {
  if (bands.length === 0 || rowCount < 1 || maxWidth < 1) return [];
  const separated = bands.length * 2 - 1 <= maxWidth;
  const columnCount = Math.max(
    1,
    Math.min(bands.length, separated ? Math.floor((maxWidth + 1) / 2) : maxWidth),
  );
  const values = compressBands(bands, columnCount, positiveGainRatio);
  const separator = separated ? ' ' : '';

  return Array.from({ length: rowCount }, (_, row) => {
    const base = rowCount - row - 1;
    return values
      .map((value) => {
        const fill = value * rowCount - base;
        const index = Math.max(0, Math.min(8, Math.round(fill * 8)));
        return verticalBlocks[index] ?? verticalBlocks[0];
      })
      .join(separator);
  });
}

export function equalizerCutBarRows(
  bands: EqualizerBand[],
  rowCount: number,
  maxWidth: number,
): string[] {
  if (bands.length === 0 || rowCount < 1 || maxWidth < 1) return [];
  const separated = bands.length * 2 - 1 <= maxWidth;
  const columnCount = Math.max(
    1,
    Math.min(bands.length, separated ? Math.floor((maxWidth + 1) / 2) : maxWidth),
  );
  const values = compressBands(bands, columnCount, negativeGainRatio);
  const separator = separated ? ' ' : '';

  return Array.from({ length: rowCount }, (_, row) =>
    values
      .map((value) => {
        const fill = value * rowCount - row;
        const index = Math.max(0, Math.min(8, Math.round(fill * 8)));
        return verticalBlocks[mirroredCutBlockIndex(index)] ?? verticalBlocks[0];
      })
      .join(separator),
  );
}
