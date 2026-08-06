import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { EqualizerBand } from './equalizer.js';
import {
  bandValueForEqualizerGainDb,
  clampBandValue,
  equalizerCutVerticalCell,
  equalizerCutVerticalFill,
  equalizerGainDb,
  equalizerVerticalCell,
  flatBandValue,
  formatEqualizerGain,
} from './equalizer.js';
import type { Profile } from './model.js';
import type { ALSAChainService } from './service.js';

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
  onRemove,
  onError,
  onBandsChange,
}: {
  service: ALSAChainService;
  profile: Profile;
  width: number;
  height: number;
  active: boolean;
  onBack: () => void;
  onRemove: () => Promise<void>;
  onError: (message: string) => void;
  onBandsChange: (bands: EqualizerBand[]) => void;
}) {
  const [bands, setBands] = useState<EqualizerBand[]>([]);
  const [selection, setSelection] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bandsRef = useRef<EqualizerBand[]>([]);
  const savedBandsRef = useRef<EqualizerBand[]>([]);
  const savingRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextBands = await service.equalizerBands(profile);
      bandsRef.current = nextBands;
      savedBandsRef.current = nextBands;
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

    const nextBands = bandsRef.current.map((candidate, index) =>
      index === selection
        ? { ...candidate, value, channelValues: candidate.channelValues.map(() => value) }
        : candidate,
    );
    bandsRef.current = nextBands;
    setBands(nextBands);
  };

  const removeEqualizer = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    void onRemove()
      .catch((removeError: unknown) =>
        onError(removeError instanceof Error ? removeError.message : String(removeError)),
      )
      .finally(() => {
        savingRef.current = false;
        setSaving(false);
      });
  };

  const resetEqualizer = () => {
    if (savingRef.current || bandsRef.current.length === 0) return;
    const previousBands = bandsRef.current;
    const nextBands = previousBands.map((band) => {
      const value = flatBandValue(band);
      return { ...band, value, channelValues: band.channelValues.map(() => value) };
    });
    if (nextBands.every((band, index) => band.value === previousBands[index]?.value)) return;
    bandsRef.current = nextBands;
    setBands(nextBands);
  };

  const saveAndBack = () => {
    if (savingRef.current) return;
    const savedBands = savedBandsRef.current;
    const nextBands = bandsRef.current;
    const changes = nextBands.flatMap((band) => {
      const savedBand = savedBands.find((candidate) => candidate.control === band.control);
      return savedBand && savedBand.value !== band.value ? [[savedBand, band.value] as const] : [];
    });
    if (changes.length === 0) {
      onBack();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    void Promise.all(changes.map(([band, value]) => service.setEqualizerBand(profile, band, value)))
      .then(() => {
        savedBandsRef.current = nextBands;
        onBandsChange(nextBands);
        onBack();
      })
      .catch((saveError: unknown) => {
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
        saveAndBack();
        return;
      }
      if (input === 'r' && error) {
        if (!savingRef.current) void load();
        return;
      }
      if (input === 'x' && !loading && !savingRef.current) {
        removeEqualizer();
        return;
      }
      if (input === 'f' && !loading && !savingRef.current) {
        resetEqualizer();
        return;
      }
      if (loading || error || savingRef.current || bands.length === 0) return;
      if (key.leftArrow) setSelection((value) => Math.max(0, value - 1));
      if (key.rightArrow) setSelection((value) => Math.min(bandsRef.current.length - 1, value + 1));
      const band = bandsRef.current[selection];
      if (!band) return;
      const step = key.shift ? 5 : 1;
      if (key.upArrow)
        setSelectedValue(bandValueForEqualizerGainDb(band, equalizerGainDb(band) + step));
      if (key.downArrow)
        setSelectedValue(bandValueForEqualizerGainDb(band, equalizerGainDb(band) - step));
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
  const hasChanges = bands.some((band) => {
    const savedBand = savedBandsRef.current.find((candidate) => candidate.control === band.control);
    return savedBand?.value !== band.value;
  });

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
        <Text color={saving ? 'yellow' : hasChanges ? 'yellow' : 'green'}>
          {saving ? '[ SAVING ]' : hasChanges ? '[ UNSAVED ]' : '[ SAVED ]'}
        </Text>
      </Box>
      <Text color={MUTED}>
        {profile.displayName} · {profile.ctlName} · linked channels
      </Text>
      <Text color={MUTED}>↑ boost to +24 dB · 0 dB = Flat · ↓ cut to −48 dB</Text>
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
        <EqualizerGraph
          bands={bands}
          selection={selection}
          levels={Math.max(2, Math.min(5, Math.floor((height - 20) / 2)))}
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
            {formatEqualizerGain(bands[selection])}
          </Text>
          <Text color={MUTED}>changes save when leaving this screen</Text>
        </Box>
      )}
      <Text color={MUTED}>
        ↑ boost · ↓ cut · shift ±5 dB · f reset to Flat · x removes EQ · esc save & back
      </Text>
    </Box>
  );
}

export function EqualizerGraph({
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
        return (
          <Box key={band.control} width={columnWidth} flexDirection="column" alignItems="center">
            {Array.from({ length: levels }, (_, row) => {
              const cell = equalizerVerticalCell(band, row, levels);
              const filled = cell !== '··';
              return (
                <Text key={row} color={selected ? ACCENT : filled ? TEXT : MUTED}>
                  {cell}
                </Text>
              );
            })}
            <Text color={selected ? ACCENT : MUTED}>{'──'}</Text>
            {Array.from({ length: levels }, (_, row) => {
              const cell = equalizerCutVerticalCell(band, row, levels);
              const fill = equalizerCutVerticalFill(band, row, levels);
              const filled = fill > 0;
              const color = selected ? ACCENT : filled ? TEXT : MUTED;
              const partial = fill > 0 && fill < 8;
              return (
                <Text
                  key={`cut-${row}`}
                  color={partial ? SURFACE : color}
                  backgroundColor={partial ? color : SURFACE}
                >
                  {cell}
                </Text>
              );
            })}
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
        const neutral = flatBandValue(band);
        const leftWidth = Math.floor(barWidth / 2);
        const rightWidth = barWidth - leftWidth;
        const cut = Math.round(
          (Math.max(0, neutral - band.value) / Math.max(1, neutral - band.min)) * leftWidth,
        );
        const boost = Math.round(
          (Math.max(0, band.value - neutral) / Math.max(1, band.max - neutral)) * rightWidth,
        );
        return (
          <Text key={band.control} color={selected ? ACCENT : TEXT} bold={selected}>
            {selected ? '›' : ' '} {band.label.padStart(7)} [
            <Text color={MUTED}>{'·'.repeat(leftWidth - cut)}</Text>
            {'█'.repeat(cut)}|{'█'.repeat(boost)}
            <Text color={MUTED}>{'·'.repeat(rightWidth - boost)}</Text>] {formatEqualizerGain(band)}
          </Text>
        );
      })}
    </Box>
  );
}
