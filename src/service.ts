import path from 'node:path';
import {
  crossfeedSchema,
  equalizerStage,
  isBitperfect,
  type Config,
  type Crossfeed,
  type DspStage,
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
    const equalizer = equalizerStage(profile);
    return (
      !equalizer ||
      (await this.runner.run('amixer', ['-D', equalizer.ctlName, 'scontrols'])).exitCode === 0
    );
  }
  async validateAll(): Promise<{ name: string; ok: boolean }[]> {
    const config = await this.store.load();
    return Promise.all(
      config.profiles
        .filter((profile) => profile.enabled && !isBitperfect(profile) && equalizerStage(profile))
        .map(async (profile) => ({ name: profile.id, ok: await this.validateProfile(profile) })),
    );
  }
  async applyConfig(config?: Config): Promise<void> {
    const effective = config ?? (await this.store.load());
    const report = await checkDependencies(this.runner);
    const stages = effective.profiles
      .filter((profile) => profile.enabled && !isBitperfect(profile))
      .flatMap((profile) => profile.stages);
    if (stages.some((stage) => stage.type === 'equalizer') && !report.capsPath)
      throw new Error('caps.so is unavailable');
    if (stages.some((stage) => stage.type === 'crossfeed') && !report.crossfeedPath)
      throw new Error('bs2b LADSPA plugin is unavailable; install ladspa-bs2b first');
    await this.store.applyAsoundrc(
      effective,
      report.capsPath ?? '',
      report.crossfeedPath ?? '',
      async () => {
        const profiles = effective.profiles.filter(
          (profile) => profile.enabled && !isBitperfect(profile) && equalizerStage(profile),
        );
        return (await Promise.all(profiles.map((profile) => this.validateProfile(profile)))).every(
          Boolean,
        );
      },
    );
  }
  async list() {
    return (await this.store.load()).profiles;
  }
  async updateStages(profileId: string, stages: DspStage[], processed = true): Promise<void> {
    const config = await this.store.load();
    const profile = config.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    profile.stages = stages;
    const eq = stages.find((stage) => stage.type === 'equalizer');
    const crossfeed = stages.find((stage) => stage.type === 'crossfeed');
    profile.eqEnabled = Boolean(eq);
    profile.crossfeed = crossfeed?.type === 'crossfeed' ? crossfeed.settings : undefined;
    profile.ctlName = eq?.type === 'equalizer' ? eq.ctlName : undefined;
    profile.controlsPath = eq?.type === 'equalizer' ? eq.controlsPath : undefined;
    if (processed) profile.bitperfect = false;
    profile.updatedAt = new Date().toISOString();
    await this.applyConfig(config);
    await this.store.save(config);
  }
  async addStage(profileId: string, type: DspStage['type']): Promise<void> {
    const profile = (await this.list()).find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    if (profile.stages.some((stage) => stage.type === type))
      throw new Error(`${type === 'equalizer' ? 'EQ' : 'Crossfeed'} is already in this chain`);
    if (type === 'crossfeed' && profile.channels !== 2)
      throw new Error('Crossfeed is available only for stereo profiles');
    const stage: DspStage =
      type === 'equalizer'
        ? {
            id: 'eq',
            type,
            ctlName: profile.id,
            controlsPath: path.join(this.paths.controlsDir, `${profile.id}.bin`),
          }
        : { id: 'crossfeed', type, settings: 'normal' };
    await this.updateStages(profileId, [...profile.stages, stage]);
  }
  async removeStage(profileId: string, stageId: string): Promise<void> {
    const profile = (await this.list()).find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    const removed = profile.stages.find((stage) => stage.id === stageId);
    await this.updateStages(
      profileId,
      profile.stages.filter((stage) => stage.id !== stageId),
    );
    if (removed?.type === 'equalizer') await this.store.deleteControlsFile(removed.controlsPath);
  }
  async moveStage(profileId: string, stageId: string, direction: -1 | 1): Promise<void> {
    const profile = (await this.list()).find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    const index = profile.stages.findIndex((stage) => stage.id === stageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= profile.stages.length) return;
    const stages = [...profile.stages];
    const current = stages[index];
    const destination = stages[target];
    if (!current || !destination) return;
    stages[index] = destination;
    stages[target] = current;
    await this.updateStages(profileId, stages);
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
  async setEqEnabled(profileId: string, enabled: boolean): Promise<void> {
    const profile = (await this.list()).find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    if (enabled && !equalizerStage(profile)) await this.addStage(profileId, 'equalizer');
    if (!enabled) {
      const stage = equalizerStage(profile);
      if (stage) await this.removeStage(profileId, stage.id);
    }
  }
  async activateEqualizer(profileId: string): Promise<void> {
    await this.setEqEnabled(profileId, true);
  }
  async setCrossfeed(profileId: string, settings?: Crossfeed): Promise<void> {
    const profile = (await this.list()).find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    const stage = profile.stages.find((candidate) => candidate.type === 'crossfeed');
    if (!settings) {
      if (stage) await this.removeStage(profileId, stage.id);
      return;
    }
    if (!stage) {
      await this.addStage(profileId, 'crossfeed');
      return this.setCrossfeed(profileId, settings);
    }
    if (stage.type !== 'crossfeed') throw new Error('Crossfeed is not in this chain');
    await this.updateStages(
      profileId,
      profile.stages.map((candidate) =>
        candidate.id === stage.id
          ? { ...candidate, settings: crossfeedSchema.parse(settings) }
          : candidate,
      ),
    );
  }
  async devices() {
    return discoverDevices(this.runner);
  }
  async equalizerBands(profile: Profile): Promise<EqualizerBand[]> {
    const stage = equalizerStage(profile);
    if (!stage || isBitperfect(profile))
      throw new Error('EQ is unavailable while BITPERFECT is active');
    const result = await this.runner.run('amixer', ['-D', stage.ctlName, 'scontents']);
    if (result.exitCode !== 0)
      throw new Error(result.stderr.trim() || `Unable to read CTL ${stage.ctlName}`);
    const bands = parseEqualizerBands(result.stdout);
    if (!bands.length) throw new Error(`CTL ${stage.ctlName} exposes no equalizer bands`);
    return bands;
  }
  async setEqualizerBand(profile: Profile, band: EqualizerBand, value: number): Promise<void> {
    const stage = equalizerStage(profile);
    if (!stage || isBitperfect(profile))
      throw new Error('EQ is unavailable while BITPERFECT is active');
    if (!Number.isInteger(value) || value < band.min || value > band.max)
      throw new Error(`Equalizer value must be between ${band.min} and ${band.max}`);
    const result = await this.runner.run('amixer', [
      '-D',
      stage.ctlName,
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
    return {
      ...input,
      pcmName: input.id,
      enabled: true,
      bitperfect: true,
      stages: [],
      eqEnabled: false,
      internalPcmName: `${input.id}_internal`,
      ctlName: input.id,
      controlsPath: path.join(this.paths.controlsDir, `${input.id}.bin`),
      createdAt: now,
      updatedAt: now,
    };
  }
}
