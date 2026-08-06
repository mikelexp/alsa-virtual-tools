import path from 'node:path';
import type { Config, Profile } from './model.js';
import type { Paths } from './paths.js';
import type { CommandRunner } from './runner.js';
import { discoverDevices } from './alsa.js';
import { checkDependencies } from './deps.js';
import { parseEqualizerBands, type EqualizerBand } from './equalizer.js';
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
        .filter((p) => p.enabled && p.eqEnabled !== false)
        .map(async (p) => ({ name: p.id, ok: await this.validateProfile(p) })),
    );
  }
  async applyConfig(config?: Config): Promise<void> {
    const effectiveConfig = config ?? (await this.store.load());
    const report = await checkDependencies(this.runner);
    const needsEq = effectiveConfig.profiles.some((p) => p.enabled && p.eqEnabled !== false);
    if (needsEq && !report.capsPath) throw new Error('caps.so is unavailable');
    await this.store.applyAsoundrc(effectiveConfig, report.capsPath ?? '', async () =>
      (
        await Promise.all(
          effectiveConfig.profiles
            .filter((p) => p.enabled && p.eqEnabled !== false)
            .map((p) => this.validateProfile(p)),
        )
      ).every(Boolean),
    );
  }
  async list() {
    return (await this.store.load()).profiles;
  }
  async setEqEnabled(profileId: string, eqEnabled: boolean): Promise<void> {
    const config = await this.store.load();
    const profile = config.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    profile.eqEnabled = eqEnabled;
    profile.updatedAt = new Date().toISOString();
    await this.applyConfig(config);
    await this.store.save(config);
  }
  async devices() {
    return discoverDevices(this.runner);
  }
  async equalizerBands(profile: Profile): Promise<EqualizerBand[]> {
    if (profile.eqEnabled === false) throw new Error('EQ is disabled for this profile');
    const result = await this.runner.run('amixer', ['-D', profile.ctlName, 'scontents']);
    if (result.exitCode !== 0)
      throw new Error(result.stderr.trim() || `Unable to read CTL ${profile.ctlName}`);
    const bands = parseEqualizerBands(result.stdout);
    if (bands.length === 0) throw new Error(`CTL ${profile.ctlName} exposes no equalizer bands`);
    return bands;
  }
  async setEqualizerBand(profile: Profile, band: EqualizerBand, value: number): Promise<void> {
    if (profile.eqEnabled === false) throw new Error('EQ is disabled for this profile');
    if (!Number.isInteger(value) || value < band.min || value > band.max)
      throw new Error(`Equalizer value must be between ${band.min} and ${band.max}`);
    const result = await this.runner.run('amixer', [
      '-D',
      profile.ctlName,
      'sset',
      band.control,
      String(value),
    ]);
    if (result.exitCode !== 0)
      throw new Error(result.stderr.trim() || `Unable to update ${band.control}`);
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
      eqEnabled: true,
      createdAt: now,
      updatedAt: now,
    };
  }
}
