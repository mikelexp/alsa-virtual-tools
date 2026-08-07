import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../src/store.js';
import type { Paths } from '../src/paths.js';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs
      .splice(0)
      .map(async (dir) =>
        (await import('node:fs/promises')).rm(dir, { recursive: true, force: true }),
      ),
  );
});
async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'alsachain-'));
  dirs.push(home);
  const configDir = path.join(home, '.config', 'alsachain');
  return {
    home,
    configDir,
    stateDir: path.join(home, '.state'),
    cacheDir: path.join(home, '.cache'),
    configFile: path.join(configDir, 'config.json'),
    controlsDir: path.join(configDir, 'controls'),
    backupsDir: path.join(home, '.state', 'backups'),
    logFile: path.join(home, '.state', 'log'),
    asoundrc: path.join(home, '.asoundrc'),
  } satisfies Paths;
}
describe('stage resource storage', () => {
  it('writes an EQ chain with its managed controls directory', async () => {
    const paths = await fixture();
    const config = {
      version: 1 as const,
      profiles: [
        {
          id: 'usb',
          displayName: 'USB',
          pcmName: 'usb',
          target: 'plughw:CARD=TEST,DEV=0',
          channels: 2,
          enabled: true,
          bitperfect: false,
          stages: [
            {
              id: 'eq',
              type: 'equalizer' as const,
              ctlName: 'usb',
              controlsPath: path.join(paths.controlsDir, 'usb.bin'),
            },
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    await new Store(paths).applyAsoundrc(config, '/caps.so', '', async () => true);
    expect(await readFile(paths.asoundrc, 'utf8')).toContain('pcm.usb_stage_01_eq');
  });
});
