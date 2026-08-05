#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { getPaths } from './paths.js';
import { systemRunner } from './runner.js';
import { AlsatoolsService } from './service.js';
import { checkDependencies } from './deps.js';
import { renderBlock } from './asound.js';
import { physicalStatus } from './alsa.js';
import { App } from './ui.js';

const service = new AlsatoolsService(getPaths(), systemRunner);
const [command, target] = process.argv.slice(2);
async function main(): Promise<void> {
  if (!command) {
    const report = await checkDependencies(systemRunner);
    process.stdout.write('\x1b[?1049h\x1b[H');
    const app = render(<App service={service} report={report} />);
    try {
      await app.waitUntilExit();
    } finally {
      process.stdout.write('\x1b[?1049l');
    }
    return;
  }
  if (command === 'list') {
    for (const p of await service.list())
      console.log(`${p.pcmName}\t${p.enabled ? 'enabled' : 'disabled'}\t${p.target}`);
    return;
  }
  if (command === 'doctor') {
    console.log(JSON.stringify(await checkDependencies(systemRunner), null, 2));
    return;
  }
  if (command === 'validate') {
    const results = await service.validateAll();
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = results.every((x) => x.ok) ? 0 : 1;
    return;
  }
  if (command === 'repair') {
    await service.applyConfig();
    console.log('Managed ALSA block regenerated and validated.');
    return;
  }
  if (command === 'print-config') {
    const report = await checkDependencies(systemRunner);
    console.log(
      renderBlock(
        (await service.list()).filter((p) => p.enabled),
        report.capsPath ?? '',
      ),
    );
    return;
  }
  const profile = (await service.list()).find((p) => p.id === target || p.pcmName === target);
  if (!profile) throw new Error(`Unknown profile: ${target ?? ''}`);
  if (command === 'qasmixer') {
    await service.qasmixer(profile);
    return;
  }
  if (command === 'status') {
    const device = (await service.devices()).find((d) => d.target === profile.target);
    console.log(
      JSON.stringify(
        {
          profile: profile.pcmName,
          status: device ? await physicalStatus(device) : { state: 'Unavailable' },
        },
        null,
        2,
      ),
    );
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
main().catch((error: unknown) => {
  console.error(`alsa-virtual-tools: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
