import path from 'node:path';
import { z } from 'zod';

export const alsaName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Use a safe ALSA name');
export const profileSchema = z.object({
  id: alsaName,
  displayName: z.string().trim().min(1).max(100),
  pcmName: alsaName,
  internalPcmName: alsaName,
  ctlName: alsaName,
  target: z.string().regex(/^plughw:CARD=[A-Za-z0-9_-]+,DEV=\d+$/),
  channels: z.number().int().min(1).max(32),
  controlsPath: z.string().min(1),
  enabled: z.boolean(),
  // Optional keeps configs created before the per-profile EQ mode setting valid.
  eqEnabled: z.boolean().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Profile = z.infer<typeof profileSchema>;
export const configSchema = z.object({ version: z.literal(1), profiles: z.array(profileSchema) });
export type Config = z.infer<typeof configSchema>;
export const emptyConfig = (): Config => ({ version: 1, profiles: [] });

export function assertUniqueProfiles(profiles: Profile[]): void {
  const pcmNames = profiles.flatMap((p) => [p.pcmName, p.internalPcmName]);
  const ctlNames = profiles.map((p) => p.ctlName);
  const ids = profiles.map((p) => p.id);
  if (
    new Set(pcmNames).size !== pcmNames.length ||
    new Set(ctlNames).size !== ctlNames.length ||
    new Set(ids).size !== ids.length
  )
    throw new Error('Profile ALSA names collide');

  const controlsPaths = profiles.map((profile) => path.resolve(profile.controlsPath));
  if (new Set(controlsPaths).size !== controlsPaths.length)
    throw new Error('Profiles must use separate controls files');
}
