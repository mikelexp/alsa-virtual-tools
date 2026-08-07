import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import type { CommandRunner } from './runner.js';

export interface Dependency {
  name: string;
  purpose: string;
  ok: boolean;
  detail: string;
  required?: boolean;
}
export interface DependencyReport {
  dependencies: Dependency[];
  capsPath?: string;
  crossfeedPath?: string;
  ladspaPath: string;
  installCommands: string[];
}
async function executable(runner: CommandRunner, name: string): Promise<boolean> {
  return (await runner.run('which', [name])).exitCode === 0;
}
async function exists(file: string): Promise<boolean> {
  try {
    await access(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
async function loadable(runner: CommandRunner, file: string): Promise<boolean> {
  const result = await runner.run('ldd', ['-r', file]);
  return !`${result.stdout}\n${result.stderr}`.includes('undefined symbol:');
}
export async function checkDependencies(
  runner: CommandRunner,
  env = process.env,
): Promise<DependencyReport> {
  const ladspaPaths = (env.LADSPA_PATH ?? '').split(':').filter(Boolean);
  if (!ladspaPaths.includes('/usr/lib/ladspa')) ladspaPaths.push('/usr/lib/ladspa');
  const capsCandidates = await Promise.all(
    ladspaPaths.map(async (dir) => ({
      file: path.join(dir, 'caps.so'),
      ok: await exists(path.join(dir, 'caps.so')),
    })),
  );
  const capsPath = capsCandidates.find((candidate) => candidate.ok)?.file;
  const crossfeedCandidates = await Promise.all(
    ladspaPaths.map(async (dir) => ({
      file: path.join(dir, 'bs2b.so'),
      ok: await exists(path.join(dir, 'bs2b.so')),
    })),
  );
  const crossfeedPath = crossfeedCandidates.find((candidate) => candidate.ok)?.file;
  const commands = await Promise.all(
    ['aplay', 'amixer'].map(async (name) => [name, await executable(runner, name)] as const),
  );
  const equalDirectories = ['/usr/lib/alsa-lib', '/usr/lib64/alsa-lib', '/usr/local/lib/alsa-lib'];
  const equalModules = await Promise.all(
    equalDirectories.map(async (directory) => ({
      directory,
      modules: await Promise.all(
        ['libasound_module_pcm_equal.so', 'libasound_module_ctl_equal.so'].map(async (module) => {
          const file = path.join(directory, module);
          return { file, exists: await exists(file) };
        }),
      ),
    })),
  );
  const equalCandidate = equalModules.find((candidate) =>
    candidate.modules.every((module) => module.exists),
  );
  const equalDirectory = equalCandidate?.directory;
  const equalLoadable = equalCandidate
    ? (
        await Promise.all(equalCandidate.modules.map((module) => loadable(runner, module.file)))
      ).every(Boolean)
    : false;
  const statusModule = await Promise.all(
    equalDirectories.map(async (directory) => ({
      directory,
      ok: await exists(path.join(directory, 'libasound_module_pcm_alsachain_status.so')),
    })),
  );
  const statusDirectory = statusModule.find((candidate) => candidate.ok)?.directory;
  const nodeCompatible = Number(process.versions.node.split('.')[0]) >= 22;
  const bunCompatible = Boolean(process.versions.bun);
  const runtimeCompatible = nodeCompatible || bunCompatible;
  const runtimeDetail = process.versions.bun
    ? `Bun ${process.versions.bun}`
    : `Node.js ${process.versions.node}`;
  const lookup = new Map(commands);
  const dependencies: Dependency[] = [
    {
      name: 'Bun standalone / Node.js >= 22',
      purpose: 'Run alsachain',
      ok: runtimeCompatible,
      detail: runtimeDetail,
    },
    {
      name: 'aplay',
      purpose: 'Discover playback hardware and validate PCMs',
      ok: lookup.get('aplay') ?? false,
      detail: '',
    },
    {
      name: 'amixer',
      purpose: 'Validate equalizer CTL devices',
      ok: lookup.get('amixer') ?? false,
      detail: '',
    },
    {
      name: 'alsaequal PCM/CTL modules',
      purpose: 'Install the ALSA equal PCM and CTL modules',
      ok: Boolean(equalDirectory) && equalLoadable,
      detail: !equalDirectory
        ? 'Not found in ALSA module paths'
        : equalLoadable
          ? equalDirectory
          : `${equalDirectory}: unresolved libasound symbols; rebuild alsaequal`,
    },
    {
      name: 'ALSAChain status PCM module',
      purpose: 'Track the virtual PCM that is actively playing',
      ok: Boolean(statusDirectory),
      detail: statusDirectory ?? 'Not installed; run make install-native',
    },
    {
      name: 'caps.so',
      purpose: 'Provide CAPS Eq10 LADSPA DSP',
      ok: Boolean(capsPath),
      detail: capsPath ?? 'Not found',
    },
    {
      name: 'LADSPA_PATH',
      purpose: 'Let ALSA find LADSPA plugins',
      ok: ladspaPaths.some((p) => p === '/usr/lib/ladspa') && Boolean(capsPath),
      detail: ladspaPaths.join(':'),
    },
    {
      name: 'bs2b LADSPA crossfeed',
      purpose: 'Optional headphone crossfeed stage',
      ok: Boolean(crossfeedPath),
      detail: crossfeedPath ?? 'Optional; install ladspa-bs2b to enable crossfeed',
      required: false,
    },
  ];
  const helper = (
    await Promise.all(['paru', 'yay'].map(async (x) => [x, await executable(runner, x)] as const))
  ).find((x) => x[1])?.[0];
  return {
    dependencies,
    capsPath,
    ladspaPath: ladspaPaths.join(':'),
    crossfeedPath,
    installCommands: [
      `sudo pacman -S alsa-utils caps`,
      `${helper ?? '<AUR-helper>'} -S alsaequal`,
      `${helper ?? '<AUR-helper>'} -S ladspa-bs2b`,
      `sudo make install-native`,
    ],
  };
}
