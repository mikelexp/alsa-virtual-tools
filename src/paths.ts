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
  const configDir = path.join(configHome, 'alsatools');
  return {
    home,
    configDir,
    stateDir: path.join(stateHome, 'alsatools'),
    cacheDir: path.join(cacheHome, 'alsatools'),
    configFile: path.join(configDir, 'config.json'),
    controlsDir: path.join(configDir, 'controls'),
    backupsDir: path.join(stateHome, 'alsatools', 'backups'),
    logFile: path.join(stateHome, 'alsatools', 'alsatools.log'),
    asoundrc: path.join(home, '.asoundrc'),
  };
}
