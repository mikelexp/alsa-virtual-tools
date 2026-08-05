import path from 'node:path';
import os from 'node:os';

export interface Paths {
  home: string;
  configDir: string;
  stateDir: string;
  cacheDir: string;
  configFile: string;
  controlsDir: string;
  backupsDir: string;
  logFile: string;
  asoundrc: string;
}
export function getPaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = env.HOME ?? os.homedir();
  const configHome = env.XDG_CONFIG_HOME ?? path.join(home, '.config');
  const stateHome = env.XDG_STATE_HOME ?? path.join(home, '.local', 'state');
  const cacheHome = env.XDG_CACHE_HOME ?? path.join(home, '.cache');
  const configDir = path.join(configHome, 'alsa-virtual-tools');
  return {
    home,
    configDir,
    stateDir: path.join(stateHome, 'alsa-virtual-tools'),
    cacheDir: path.join(cacheHome, 'alsa-virtual-tools'),
    configFile: path.join(configDir, 'config.json'),
    controlsDir: path.join(configDir, 'controls'),
    backupsDir: path.join(stateHome, 'alsa-virtual-tools', 'backups'),
    logFile: path.join(stateHome, 'alsa-virtual-tools', 'alsa-virtual-tools.log'),
    asoundrc: path.join(home, '.asoundrc'),
  };
}
