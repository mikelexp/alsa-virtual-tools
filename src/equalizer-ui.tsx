import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { EqualizerBand } from './equalizer.js';
import { clampBandValue } from './equalizer.js';
import type { Profile } from './model.js';
import type { AlsatoolsService } from './service.js';

const ACCENT = '#315BEF';
const TEXT = '#d7dce5';
const MUTED = '#8f98a8';
const SURFACE = '#252a33';

export function EqualizerScreen({
  service,
  profile,
  width,
  height,
  active,
  onBack,
  onError,
  onBandsChange,
}: {
  service: AlsatoolsService;
  profile: Profile;
  width: number;
  height: number;
  active: boolean;
  onBack: () => void;
  onError: (message: string) => void;
  onBandsChange: (bands: EqualizerBand[]) => void;
}) {
  const [bands, setBands] = useState<EqualizerBand[]>([]);
  const [selection, setSelection] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bandsRef = useRef<EqualizerBand[]>([]);
  const savingRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextBands = await service.equalizerBands(profile);
      bandsRef.current = nextBands;
      setBands(nextBands);
      setSelection((value) => Math.min(value, Math.max(0, nextBands.length - 1)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [profile.id]);

  const setSelectedValue = (requestedValue: number) => {
    if (savingRef.current) return;
    const band = bandsRef.current[selection];
    if (!band) return;
    const value = clampBandValue(band, requestedValue);
    if (value === band.value) return;

    const previousBands = bandsRef.current;
    const nextBands = previousBands.map((candidate, index) =>
      index === selection
        ? { ...candidate, value, channelValues: candidate.channelValues.map(() => value) }
        : candidate,
    );
    bandsRef.current = nextBands;
    setBands(nextBands);
    savingRef.current = true;
    setSaving(true);
    void service
      .setEqualizerBand(profile, band, value)
      .then(() => onBandsChange(nextBands))
      .catch((saveError: unknown) => {
        bandsRef.current = previousBands;
        setBands(previousBands);
        onError(saveError instanceof Error ? saveError.message : String(saveError));
      })
      .finally(() => {
        savingRef.current = false;
        setSaving(false);
      });
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (input === 'r') {
        if (!savingRef.current) void load();
        return;
      }
      if (loading || error || savingRef.current || bands.length === 0) return;
      if (key.leftArrow) setSelection((value) => Math.max(0, value - 1));
      if (key.rightArrow) setSelection((value) => Math.min(bandsRef.current.length - 1, value + 1));
      const band = bandsRef.current[selection];
      if (!band) return;
      const step = key.shift ? 5 : 1;
      if (key.upArrow) setSelectedValue(band.value + step);
      if (key.downArrow) setSelectedValue(band.value - step);
      if (key.home) setSelectedValue(band.min);
      if (key.end) setSelectedValue(band.max);
    },
    { isActive: active },
  );

  const bandColumnWidth = Math.max(
    5,
    Math.min(
      10,
      bands.reduce((longest, band) => Math.max(longest, band.label.length + 1), 5),
    ),
  );
  const verticalRequiredWidth = bands.length * (bandColumnWidth + 1) + 6;

  return (
    <Box
      flexDirection="column"
      backgroundColor={SURFACE}
      borderStyle="bold"
      borderLeft
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderColor={ACCENT}
      paddingX={2}
      paddingY={1}
    >
      <Box justifyContent="space-between">
        <Text bold color={ACCENT}>
          GRAPHIC EQUALIZER{bands.length > 0 ? ` · ${bands.length} BANDS` : ''}
        </Text>
        <Text color={saving ? 'yellow' : 'green'}>{saving ? '[ SAVING ]' : '[ LIVE ]'}</Text>
      </Box>
      <Text color={MUTED}>
        {profile.displayName} · {profile.ctlName} · linked channels
      </Text>
      {loading ? (
        <Box paddingY={2}>
          <Text color={MUTED}>Reading alsaequal controls...</Text>
        </Box>
      ) : error ? (
        <Box flexDirection="column" paddingY={2}>
          <Text color="red">Unable to read equalizer controls.</Text>
          <Text color={TEXT}>{error}</Text>
          <Text color={MUTED}>Press r to retry or esc to go back.</Text>
        </Box>
      ) : width >= verticalRequiredWidth ? (
        <VerticalBands
          bands={bands}
          selection={selection}
          levels={Math.max(3, Math.min(10, height - 18))}
          columnWidth={bandColumnWidth}
        />
      ) : (
        <HorizontalBands bands={bands} selection={selection} width={width} height={height} />
      )}
      {!loading && !error && bands[selection] && (
        <Box marginTop={1} justifyContent="space-between">
          <Text color={TEXT}>
            <Text bold color={ACCENT}>
              {bands[selection].label}
            </Text>{' '}
            {bands[selection].value}/{bands[selection].max}
          </Text>
          <Text color={MUTED}>changes apply to the active EQ immediately</Text>
        </Box>
      )}
    </Box>
  );
}

function VerticalBands({
  bands,
  selection,
  levels,
  columnWidth,
}: {
  bands: EqualizerBand[];
  selection: number;
  levels: number;
  columnWidth: number;
}) {
  return (
    <Box justifyContent="center" gap={1} paddingTop={1}>
      {bands.map((band, index) => {
        const selected = index === selection;
        const ratio = (band.value - band.min) / Math.max(1, band.max - band.min);
        return (
          <Box key={band.control} width={columnWidth} flexDirection="column" alignItems="center">
            {Array.from({ length: levels }, (_, row) => {
              const filled = ratio >= (levels - row) / levels;
              return (
                <Text key={row} color={selected ? ACCENT : filled ? TEXT : MUTED}>
                  {filled ? '██' : '··'}
                </Text>
              );
            })}
            <Text bold={selected} color={selected ? ACCENT : TEXT}>
              {String(band.value).padStart(3)}
            </Text>
            <Text bold={selected} color={selected ? ACCENT : MUTED} wrap="truncate">
              {band.label.replaceAll(' ', '')}
            </Text>
            <Text color={selected ? ACCENT : SURFACE}>{selected ? ' ▲' : '  '}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function HorizontalBands({
  bands,
  selection,
  width,
  height,
}: {
  bands: EqualizerBand[];
  selection: number;
  width: number;
  height: number;
}) {
  const barWidth = Math.max(8, Math.min(32, width - 24));
  const visibleCount = Math.max(3, Math.min(bands.length, height - 18));
  const start = Math.max(
    0,
    Math.min(bands.length - visibleCount, selection - Math.floor(visibleCount / 2)),
  );
  const visibleBands = bands.slice(start, start + visibleCount);
  return (
    <Box flexDirection="column" paddingTop={1}>
      {visibleBands.map((band, visibleIndex) => {
        const selected = start + visibleIndex === selection;
        const ratio = (band.value - band.min) / Math.max(1, band.max - band.min);
        const filled = Math.round(ratio * barWidth);
        return (
          <Text key={band.control} color={selected ? ACCENT : TEXT} bold={selected}>
            {selected ? '›' : ' '} {band.label.padStart(7)} [{'█'.repeat(filled)}
            <Text color={MUTED}>{'·'.repeat(barWidth - filled)}</Text>]{' '}
            {String(band.value).padStart(3)}
          </Text>
        );
      })}
    </Box>
  );
}
