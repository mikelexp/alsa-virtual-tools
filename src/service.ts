import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Config, Profile } from './model.js';
import type { Paths } from './paths.js';
import type { CommandRunner } from './runner.js';
import { discoverDevices } from './alsa.js';
import { checkDependencies } from './deps.js';
import { Store } from './store.js';

export class AlsatoolsService {
  readonly store: Store;
  constructor(
    readonly paths: Paths,
    readonly runner: CommandRunner,
  ) {
    this.store = new Store(paths);
  }
  async validateProfile(profile: Profile): Promise<boolean> {
    return (await this.runner.run('amixer', ['-D', profile.ctlName, 'scontrols'])).exitCode === 0;
  }
  async validateAll(): Promise<{ name: string; ok: boolean }[]> {
    const config = await this.store.load();
    return Promise.all(
      config.profiles
        .filter((p) => p.enabled)
        .map(async (p) => ({ name: p.id, ok: await this.validateProfile(p) })),
    );
  }
  async applyConfig(config?: Config): Promise<void> {
    const effectiveConfig = config ?? (await this.store.load());
    const report = await checkDependencies(this.runner);
    if (!report.capsPath) throw new Error('caps.so is unavailable');
    await this.store.applyAsoundrc(effectiveConfig, report.capsPath, async () =>
      (
        await Promise.all(
          effectiveConfig.profiles.filter((p) => p.enabled).map((p) => this.validateProfile(p)),
        )
      ).every(Boolean),
    );
  }
  async list() {
    return (await this.store.load()).profiles;
  }
  async devices() {
    return discoverDevices(this.runner);
  }
  async qasmixer(profile: Profile): Promise<void> {
    if (!(await this.validateProfile(profile)))
      throw new Error(`CTL ${profile.ctlName} does not validate; QasMixer was not opened`);
    // QasMixer is single-instance by default; replace any stale instance so the
    // selected profile is always the one displayed.
    await this.runner.run('pkill', ['-TERM', '-x', 'qasmixer']);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const env = {
      ...process.env,
      LADSPA_PATH: process.env.LADSPA_PATH
        ? `${process.env.LADSPA_PATH}:/usr/lib/ladspa`
        : '/usr/lib/ladspa',
    };
    const child = spawn('qasmixer', ['-D', profile.ctlName], {
      detached: true,
      stdio: 'ignore',
      env,
    });
    child.unref();
  }
  createProfile(input: {
    id: string;
    displayName: string;
    target: string;
    channels: number;
  }): Profile {
    const now = new Date().toISOString();
    const id = input.id;
    return {
      ...input,
      pcmName: id,
      internalPcmName: `${id}_internal`,
      ctlName: id,
      controlsPath: path.join(this.paths.controlsDir, `${id}.bin`),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
  }
}
