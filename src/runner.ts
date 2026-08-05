import { execa, type Options } from 'execa';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
export interface CommandRunner {
  run(file: string, args?: string[], options?: Options): Promise<CommandResult>;
}
export const systemRunner: CommandRunner = {
  async run(file, args = [], options = {}) {
    const result = await execa(file, args, { reject: false, ...options });
    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
      exitCode: result.exitCode ?? 1,
    };
  },
};
