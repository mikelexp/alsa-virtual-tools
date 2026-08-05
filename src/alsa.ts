import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { CommandRunner } from './runner.js';

export interface Device {
  cardId: string;
  cardIndex: number;
  cardName: string;
  device: number;
  description: string;
  target: string;
  connected: boolean;
  busy: boolean;
}
export interface PlaybackState {
  state: 'Unavailable' | 'Inactive' | 'Prepared' | 'Playing' | 'Paused' | 'XRUN' | 'Unknown';
  rate?: string;
  format?: string;
  logicalBits?: number;
  containerBits?: number;
  channels?: number;
  bufferSize?: string;
  periodSize?: string;
}
export function parseAplayList(text: string): Device[] {
  const lines = text.split('\n');
  const devices: Device[] = [];
  const pattern = /^card (\d+): ([^ ]+) \[(.+?)\], device (\d+): (.+?) \[(.+?)\]$/;
  for (const line of lines) {
    const m = line.match(pattern);
    if (m) {
      const cardId = m[2] ?? '';
      const device = m[4] ?? '';
      devices.push({
        cardIndex: Number(m[1]),
        cardId,
        cardName: m[3] ?? '',
        device: Number(device),
        description: `${m[5] ?? ''} (${m[6] ?? ''})`,
        target: `plughw:CARD=${cardId},DEV=${device}`,
        connected: true,
        busy: false,
      });
    }
  }
  return devices;
}
export function parseCards(text: string): Map<number, { id: string; name: string }> {
  const cards = new Map<number, { id: string; name: string }>();
  for (const match of text.matchAll(/^\s*(\d+)\s+\[([^\]]+)\s*\]:\s*(.+)$/gm))
    cards.set(Number(match[1]), { id: (match[2] ?? '').trim(), name: (match[3] ?? '').trim() });
  return cards;
}
export function parseHwParams(text: string): Omit<PlaybackState, 'state'> {
  const lookup = (key: string) => text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  const format = lookup('format');
  const bits = format
    ? format === 'S16_LE'
      ? [16, 16]
      : format === 'S24_3LE'
        ? [24, 24]
        : format === 'S24_LE'
          ? [24, 32]
          : format === 'S32_LE'
            ? [32, 32]
            : undefined
    : undefined;
  return {
    rate: lookup('rate'),
    format,
    logicalBits: bits?.[0],
    containerBits: bits?.[1],
    channels: Number(lookup('channels')) || undefined,
    bufferSize: lookup('buffer_size'),
    periodSize: lookup('period_size'),
  };
}
export function parseStatus(text: string): PlaybackState['state'] {
  const value = text.match(/^state:\s*(\S+)/m)?.[1];
  return value === 'RUNNING'
    ? 'Playing'
    : value === 'PREPARED'
      ? 'Prepared'
      : value === 'PAUSED'
        ? 'Paused'
        : value === 'XRUN'
          ? 'XRUN'
          : value === 'OPEN' || value === 'SETUP'
            ? 'Inactive'
            : 'Unknown';
}
export async function discoverDevices(runner: CommandRunner): Promise<Device[]> {
  const result = await runner.run('aplay', ['-l']);
  return result.exitCode === 0 ? parseAplayList(result.stdout) : [];
}
export async function physicalStatus(
  device: Device,
  procRoot = '/proc/asound',
): Promise<PlaybackState> {
  const dir = path.join(procRoot, `card${device.cardIndex}`, `pcm${device.device}p`);
  try {
    const subs = await readdir(dir);
    const statusFiles = subs.filter((name) => /^sub\d+$/.test(name));
    if (!statusFiles.length) return { state: 'Inactive' };
    const states = await Promise.all(
      statusFiles.map(async (sub) => {
        const base = path.join(dir, sub);
        const status = parseStatus(await readFile(path.join(base, 'status'), 'utf8'));
        const params = await readFile(path.join(base, 'hw_params'), 'utf8').catch(() => '');
        return { status, params };
      }),
    );
    const live = states.find((x) => x.status !== 'Inactive') ?? states[0];
    return { state: live?.status ?? 'Unknown', ...parseHwParams(live?.params ?? '') };
  } catch {
    return { state: 'Unavailable' };
  }
}
