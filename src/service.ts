import path from 'node:path';
import {
  crossfeedSchema,
  isBitperfect,
  type Config,
  type Crossfeed,
  type Profile,
} from './model.js';
import type { Paths } from './paths.js';
import type { CommandRunner } from './runner.js';
import { discoverDevices } from './alsa.js';
import { checkDependencies } from './deps.js';
import { parseEqualizerBands, type EqualizerBand } from './equalizer.js';
import { Store } from './store.js';

export class ALSAChainService {
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
        .filter((p) => p.enabled && p.eqEnabled !== false && !isBitperfect(p))
        .map(async (p) => ({ name: p.id, ok: await this.validateProfile(p) })),
    );
  }
  async applyConfig(config?: Config): Promise<void> {
    const effectiveConfig = config ?? (await this.store.load());
    const report = await checkDependencies(this.runner);
    const needsEq = effectiveConfig.profiles.some(
      (p) => p.enabled && p.eqEnabled !== false && !isBitperfect(p),
    );
    const needsCrossfeed = effectiveConfig.profiles.some(
      (p) => p.enabled && p.crossfeed && !isBitperfect(p),
    );
    if (needsEq && !report.capsPath) throw new Error('caps.so is unavailable');
    if (needsCrossfeed && !report.crossfeedPath)
      throw new Error('bs2b LADSPA plugin is unavailable; install ladspa-bs2b first');
    await this.store.applyAsoundrc(
      effectiveConfig,
      report.capsPath ?? '',
      report.crossfeedPath ?? '',
      async () =>
        (
          await Promise.all(
            effectiveConfig.profiles
              .filter((p) => p.enabled && p.eqEnabled !== false && !isBitperfect(p))
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
    if (eqEnabled) profile.bitperfect = false;
    profile.updatedAt = new Date().toISOString();
    await this.applyConfig(config);
    await this.store.save(config);
  }
  async setBitperfect(profileId: string, bitperfect: boolean): Promise<void> {
    const config = await this.store.load();
    const profile = config.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    profile.bitperfect = bitperfect;
    profile.updatedAt = new Date().toISOString();
    await this.applyConfig(config);
    await this.store.save(config);
  }
  async activateEqualizer(profileId: string): Promise<void> {
    const config = await this.store.load();
    const profile = config.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    profile.eqEnabled = true;
    profile.bitperfect = false;
    profile.updatedAt = new Date().toISOString();
    await this.applyConfig(config);
    await this.store.save(config);
  }
  async setCrossfeed(profileId: string, crossfeed?: Crossfeed): Promise<void> {
    const config = await this.store.load();
    const profile = config.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    const settings = crossfeed === undefined ? undefined : crossfeedSchema.parse(crossfeed);
    if (settings && profile.channels !== 2)
      throw new Error('Crossfeed is available only for stereo profiles');
    profile.crossfeed = settings;
    if (settings) profile.bitperfect = false;
    profile.updatedAt = new Date().toISOString();
    await this.applyConfig(config);
    await this.store.save(config);
  }
  async devices() {
    return discoverDevices(this.runner);
  }
  async equalizerBands(profile: Profile): Promise<EqualizerBand[]> {
    if (profile.eqEnabled === false || isBitperfect(profile))
      throw new Error('EQ is unavailable while BITPERFECT is active');
    const result = await this.runner.run('amixer', ['-D', profile.ctlName, 'scontents']);
    if (result.exitCode !== 0)
      throw new Error(result.stderr.trim() || `Unable to read CTL ${profile.ctlName}`);
    const bands = parseEqualizerBands(result.stdout);
    if (bands.length === 0) throw new Error(`CTL ${profile.ctlName} exposes no equalizer bands`);
    return bands;
  }
  async setEqualizerBand(profile: Profile, band: EqualizerBand, value: number): Promise<void> {
    if (profile.eqEnabled === false || isBitperfect(profile))
      throw new Error('EQ is unavailable while BITPERFECT is active');
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
      eqEnabled: false,
      bitperfect: true,
      crossfeed: undefined,
      createdAt: now,
      updatedAt: now,
    };
  }
}
