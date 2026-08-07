import { describe, expect, it } from 'vitest';
import { ALSAChainService } from '../src/service.js';
import { getPaths } from '../src/paths.js';
describe('stage service', () => {
  it('creates an empty bitperfect profile', () => {
    const service = new ALSAChainService(getPaths({ HOME: '/tmp/alsachain-test' }), {
      async run() {
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });
    const profile = service.createProfile({
      id: 'usb',
      displayName: 'USB',
      target: 'plughw:CARD=TEST,DEV=0',
      channels: 2,
    });
    expect(profile).toMatchObject({ bitperfect: true, stages: [] });
  });
});
