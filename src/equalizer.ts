export interface EqualizerBand {
  control: string;
  label: string;
  min: number;
  max: number;
  value: number;
  channelValues: number[];
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
  const ratio = normalizedValue(band);
  const totalUnits = Math.round(ratio * rowCount * 8);
  const rowBase = (rowCount - row - 1) * 8;
  const fill = Math.max(0, Math.min(8, totalUnits - rowBase));
  return (verticalBlocks[fill] ?? '·').repeat(2);
}

const normalizedValue = (band: EqualizerBand): number =>
  Math.max(0, Math.min(1, (band.value - band.min) / Math.max(1, band.max - band.min)));

function compressBands(bands: EqualizerBand[], count: number): number[] {
  if (bands.length <= count) return bands.map(normalizedValue);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * bands.length) / count);
    const end = Math.max(start + 1, Math.floor(((index + 1) * bands.length) / count));
    const bucket = bands.slice(start, end).map(normalizedValue);
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
  const values = compressBands(bands, columnCount);
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
