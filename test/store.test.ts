import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from '../src/model.js';
import type { Paths } from '../src/paths.js';
import { Store } from '../src/store.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Store', () => {
  it('creates the approved controls directory before validating ALSA config', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'alsatools-'));
    temporaryDirectories.push(home);
    const configDir = path.join(home, '.config', 'alsatools');
    const paths: Paths = {
      home,
      configDir,
      stateDir: path.join(home, '.state'),
      cacheDir: path.join(home, '.cache'),
      configFile: path.join(configDir, 'config.json'),
      controlsDir: path.join(configDir, 'controls'),
      backupsDir: path.join(home, '.state', 'backups'),
      logFile: path.join(home, '.state', 'alsatools.log'),
      asoundrc: path.join(home, '.asoundrc'),
    };
    const config: Config = {
      version: 1,
      profiles: [
        {
          id: 'test_eq',
          displayName: 'Test',
          pcmName: 'test_eq',
          internalPcmName: 'test_eq_internal',
          ctlName: 'test_eq',
          target: 'plughw:CARD=TEST_DAC,DEV=0',
          channels: 2,
          controlsPath: path.join(paths.controlsDir, 'test_eq.bin'),
          enabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    await new Store(paths).applyAsoundrc(config, '/usr/lib/ladspa/caps.so', async () => true);
    expect(await readFile(paths.asoundrc, 'utf8')).toContain('pcm.test_eq');
    expect((await stat(paths.controlsDir)).isDirectory()).toBe(true);
  });

  it('deletes only a regular controls file inside its managed directory', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'alsatools-'));
    temporaryDirectories.push(home);
    const controlsDir = path.join(home, '.config', 'alsatools', 'controls');
    const paths: Paths = {
      home,
      configDir: path.dirname(controlsDir),
      stateDir: path.join(home, '.state'),
      cacheDir: path.join(home, '.cache'),
      configFile: path.join(home, '.config', 'alsatools', 'config.json'),
      controlsDir,
      backupsDir: path.join(home, '.state', 'backups'),
      logFile: path.join(home, '.state', 'alsatools.log'),
      asoundrc: path.join(home, '.asoundrc'),
    };
    const controls = path.join(controlsDir, 'test_eq.bin');
    await mkdir(controlsDir, { recursive: true });
    await writeFile(controls, 'controls');
    await new Store(paths).deleteControlsFile(controls);
    await expect(access(controls)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
