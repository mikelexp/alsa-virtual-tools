import { describe, expect, it } from 'vitest';
import { checkDependencies } from '../src/deps.js';
import type { CommandRunner } from '../src/runner.js';

const runner: CommandRunner = {
  async run(file, args = []) {
    return { stdout: '', stderr: '', exitCode: file || args.length ? 0 : 1 };
  },
};

describe('dependency check', () => {
  it('does not expect an alsaequal executable', async () => {
    const report = await checkDependencies(runner, { LADSPA_PATH: '/does-not-exist' });
    expect(report.dependencies.some((dependency) => dependency.name === 'alsaequal')).toBe(false);
    expect(
      report.dependencies.find((dependency) => dependency.name === 'alsaequal PCM/CTL modules'),
    ).toBeDefined();
    expect(
      report.dependencies.find((dependency) => dependency.name === 'ALSAChain status PCM module'),
    ).toBeDefined();
    expect(report.dependencies.some((dependency) => dependency.name === 'QasMixer')).toBe(false);
  });
});
