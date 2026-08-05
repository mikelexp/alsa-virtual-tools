import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
  lstat,
  readdir,
  copyFile,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { configSchema, emptyConfig, assertUniqueProfiles, type Config } from './model.js';
import type { Paths } from './paths.js';
import { renderBlock, replaceManagedBlock } from './asound.js';

async function atomicWrite(file: string, data: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  await writeFile(temp, data, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, file);
}

export class Store {
  constructor(private readonly paths: Paths) {}
  async load(): Promise<Config> {
    try {
      return configSchema.parse(JSON.parse(await readFile(this.paths.configFile, 'utf8')));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyConfig();
      throw new Error(
        `Invalid configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  async save(config: Config): Promise<void> {
    assertUniqueProfiles(config.profiles);
    await atomicWrite(
      this.paths.configFile,
      JSON.stringify(configSchema.parse(config), null, 2) + '\n',
    );
  }
  async assertControlsPath(file: string): Promise<void> {
    const relative = path.relative(this.paths.controlsDir, file);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      throw new Error('Controls file must stay in alsatools controls directory');
    try {
      if ((await lstat(file)).isSymbolicLink())
        throw new Error('Controls file cannot be a symlink');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  async deleteControlsFile(file: string): Promise<void> {
    await this.assertControlsPath(file);
    try {
      if ((await lstat(file)).isSymbolicLink())
        throw new Error('Controls file cannot be a symlink');
      await unlink(file);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  async applyAsoundrc(
    config: Config,
    capsPath: string,
    validate: () => Promise<boolean>,
  ): Promise<void> {
    assertUniqueProfiles(config.profiles);
    for (const profile of config.profiles) await this.assertControlsPath(profile.controlsPath);
    await mkdir(this.paths.controlsDir, { recursive: true, mode: 0o700 });
    let original = '';
    let target = this.paths.asoundrc;
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink()) target = await readlinkSafe(target);
      original = await readFile(target, 'utf8');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(this.paths.backupsDir, { recursive: true });
    const backup = path.join(
      this.paths.backupsDir,
      `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.asoundrc`,
    );
    await writeFile(backup, original, { encoding: 'utf8', mode: 0o600 });
    try {
      await atomicWrite(
        target,
        replaceManagedBlock(original, renderBlock(config.profiles, capsPath)),
      );
      if (!(await validate())) throw new Error('Generated ALSA configuration did not validate');
      await this.pruneBackups();
    } catch (error) {
      await atomicWrite(target, original);
      throw error;
    }
  }
  async listBackups(): Promise<string[]> {
    try {
      return (await readdir(this.paths.backupsDir))
        .filter((x) => x.endsWith('.asoundrc'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }
  async restoreBackup(name: string): Promise<void> {
    if (path.basename(name) !== name) throw new Error('Invalid backup name');
    const source = path.join(this.paths.backupsDir, name);
    if (!(await stat(source)).isFile()) throw new Error('Backup not found');
    await copyFile(source, this.paths.asoundrc);
  }
  private async pruneBackups(): Promise<void> {
    const backups = await this.listBackups();
    await Promise.all(backups.slice(10).map((name) => rm(path.join(this.paths.backupsDir, name))));
  }
}
async function readlinkSafe(link: string): Promise<string> {
  const { readlink } = await import('node:fs/promises');
  const destination = await readlink(link);
  return path.resolve(path.dirname(link), destination);
}
