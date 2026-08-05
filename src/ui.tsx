import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { Device, PlaybackState } from './alsa.js';
import type { DependencyReport } from './deps.js';
import type { Profile } from './model.js';
import type { AlsatoolsService } from './service.js';
import { physicalStatus } from './alsa.js';

type Screen = 'list' | 'detail' | 'help' | 'diagnostics' | 'new' | 'edit' | 'delete';
const statusColor = (s: PlaybackState['state'] | undefined, label?: string) =>
  label === 'Connected'
    ? 'green'
    : label === 'Not found' || s === 'Unavailable'
      ? 'red'
      : s === 'Playing'
        ? 'green'
        : s === 'XRUN'
          ? 'yellow'
          : 'gray';
export function App({ service, report }: { service: AlsatoolsService; report: DependencyReport }) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(
    report.dependencies.every((d) => d.ok) ? 'list' : 'diagnostics',
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selection, setSelection] = useState(0);
  const [states, setStates] = useState<Record<string, PlaybackState>>({});
  const [notice, setNotice] = useState('');
  const refresh = async () => {
    const [nextProfiles, nextDevices] = await Promise.all([service.list(), service.devices()]);
    setProfiles(nextProfiles);
    setDevices(nextDevices);
    const mapped = await Promise.all(
      nextProfiles.map(async (p) => {
        const device = nextDevices.find((d) => d.target === p.target);
        return [
          p.id,
          device ? await physicalStatus(device) : { state: 'Unavailable' as const },
        ] as const;
      }),
    );
    setStates(Object.fromEntries(mapped));
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, []);
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
    if (screen === 'list') {
      if (input === 'x') exit();
      if (key.downArrow || input === 'j')
        setSelection((v) => Math.min(v + 1, Math.max(0, profiles.length - 1)));
      if (key.upArrow || input === 'k') setSelection((v) => Math.max(0, v - 1));
      if (key.return && profiles[selection]) setScreen('detail');
      if (input === 'n') setScreen('new');
      if (input === 'e' && profiles[selection]) setScreen('edit');
      if (input === 'r') void refresh();
      if (input === '?') setScreen('help');
      if (input === 'd' && profiles[selection]) setScreen('delete');
      if (input === 'i') setScreen('diagnostics');
      if (input === 'q' && profiles[selection])
        void service
          .qasmixer(profiles[selection])
          .then(() => setNotice('QasMixer launched'))
          .catch((e: Error) => setNotice(e.message));
    } else if (key.escape) setScreen('list');
  });
  const profile = profiles[selection];
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        ALSA Equalizer Manager
      </Text>
      {notice ? <Text color="yellow">{notice}</Text> : null}
      {screen === 'list' && (
        <List profiles={profiles} selection={selection} states={states} devices={devices} />
      )}
      {screen === 'detail' && profile && <Details profile={profile} state={states[profile.id]} />}
      {screen === 'help' && <Help />}
      {screen === 'diagnostics' && <Diagnostics report={report} />}
      {screen === 'new' && (
        <NewProfile
          service={service}
          devices={devices}
          onDone={() => {
            setScreen('list');
            void refresh();
          }}
        />
      )}
      {screen === 'edit' && profile && (
        <NewProfile
          service={service}
          devices={devices}
          existing={profile}
          onDone={() => {
            setNotice(
              'Target changed. Stop and restart playback so clients reopen the virtual PCM.',
            );
            setScreen('list');
            void refresh();
          }}
        />
      )}
      {screen === 'delete' && profile && (
        <DeleteProfile
          service={service}
          profile={profile}
          onDone={(message) => {
            setNotice(message);
            setScreen('list');
            void refresh();
          }}
        />
      )}
      {screen === 'list' && (
        <Text dimColor>
          [Enter] Details [N] New [E] Edit [D] Delete [Q] QasMixer [R] Refresh [I] Doctor [?] Help
          [X] Exit
        </Text>
      )}
    </Box>
  );
}
function List({
  profiles,
  selection,
  states,
  devices,
}: {
  profiles: Profile[];
  selection: number;
  states: Record<string, PlaybackState>;
  devices: Device[];
}) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>Interfaces</Text>
      {profiles.length === 0 ? (
        <Text dimColor>No managed interfaces. Press N to create one.</Text>
      ) : (
        profiles.map((p, index) =>
          (() => {
            const device = devices.find((d) => d.target === p.target);
            const state = states[p.id];
            const status = device && state?.state === 'Unavailable' ? 'Connected' : state?.state;
            const audioDetails =
              state?.rate && state.format ? `${state.rate} ${state.format}` : 'Audio not playing';
            return (
              <Text key={p.id} color={index === selection ? 'cyan' : undefined}>
                {index === selection ? '>' : ' '} {p.enabled ? 'o' : 'off'} {p.pcmName.padEnd(18)}{' '}
                <Text color={statusColor(state?.state, status ?? 'Not found')}>
                  {(status ?? 'Not found').padEnd(11)}
                </Text>{' '}
                {audioDetails} {'->'} {device?.cardName ?? p.target}
              </Text>
            );
          })(),
        )
      )}
    </Box>
  );
}
function Details({ profile, state }: { profile: Profile; state?: PlaybackState }) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>{profile.displayName}</Text>
      <Text>Public PCM: {profile.pcmName}</Text>
      <Text>CTL: {profile.ctlName}</Text>
      <Text>Target: {profile.target}</Text>
      <Text>Controls: {profile.controlsPath}</Text>
      <Text>
        Status: <Text color={statusColor(state?.state)}>{state?.state ?? 'Unavailable'}</Text>
      </Text>
      <Text>
        Physical: {state?.rate ?? '-'} {state?.format ?? '-'}{' '}
        {state?.channels ? `${state.channels} ch` : ''}
      </Text>
      <Text>Bit-perfect: No - DSP/alsaequal enabled</Text>
      <Text>Native sample rate: Unknown</Text>
      <Text dimColor>[Esc] Back</Text>
    </Box>
  );
}
function Help() {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>Keyboard</Text>
      <Text>
        Arrows/j/k select, Enter details, N new, E edit, D delete, Q QasMixer, R refresh, I
        diagnostics, X exit.
      </Text>
      <Text>All changes are explicit; no ALSA configuration is written on startup.</Text>
      <Text dimColor>[Esc] Back</Text>
    </Box>
  );
}
function Diagnostics({ report }: { report: DependencyReport }) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>Diagnostics</Text>
      {report.dependencies.map((d) => (
        <Text key={d.name} color={d.ok ? 'green' : 'red'}>
          {d.ok ? 'OK ' : 'FAIL'} {d.name}: {d.detail || d.purpose}
        </Text>
      ))}
      <Text>LADSPA_PATH: {report.ladspaPath}</Text>
      {report.dependencies.some((d) => !d.ok) && (
        <>
          <Text color="yellow">Suggested installation:</Text>
          {report.installCommands.map((command) => (
            <Text key={command}>{command}</Text>
          ))}
        </>
      )}
      <Text dimColor>[Esc] Back</Text>
    </Box>
  );
}
function NewProfile({
  service,
  devices,
  existing,
  onDone,
}: {
  service: AlsatoolsService;
  devices: Device[];
  existing?: Profile;
  onDone: () => void;
}) {
  const [id, setId] = useState(existing?.id ?? '');
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [device, setDevice] = useState(() =>
    Math.max(
      0,
      devices.findIndex((candidate) => candidate.target === existing?.target),
    ),
  );
  const [field, setField] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState('');
  useInput((input, key) => {
    const value = field === 0 ? id : displayName;
    const setValue = field === 0 ? setId : setDisplayName;
    if (key.tab) {
      const nextField = (field + 1) % 4;
      setField(nextField);
      setCursor(nextField === 0 ? id.length : nextField === 1 ? displayName.length : 0);
    } else if (key.leftArrow && field < 2) {
      setCursor((position) => Math.max(0, position - 1));
    } else if (key.rightArrow && field < 2) {
      setCursor((position) => Math.min(value.length, position + 1));
    } else if (key.backspace && field < 2) {
      if (cursor > 0) {
        setValue((current) => current.slice(0, cursor - 1) + current.slice(cursor));
        setCursor((position) => position - 1);
      }
    } else if (key.delete && field < 2) {
      setValue((current) => current.slice(0, cursor) + current.slice(cursor + 1));
    } else if (key.upArrow || (field === 2 && input === 'k')) {
      setDevice((current) => Math.max(0, current - 1));
    } else if (key.downArrow || (field === 2 && input === 'j')) {
      setDevice((current) => Math.min(devices.length - 1, current + 1));
    } else if (key.return && field < 3) {
      const nextField = field + 1;
      setField(nextField);
      setCursor(nextField === 1 ? displayName.length : 0);
    } else if (key.return) {
      const selected = devices[device];
      if (!selected) return setError('Select a playback device');
      if (!id) return setError('Identifier is required');
      void (async () => {
        try {
          const config = await service.store.load();
          const generatedProfile = service.createProfile({
            id,
            displayName: displayName || id,
            target: selected.target,
            channels: 2,
          });
          const profile = existing
            ? { ...generatedProfile, createdAt: existing.createdAt }
            : generatedProfile;
          const existingIndex = existing
            ? config.profiles.findIndex((candidate) => candidate.id === existing.id)
            : -1;
          if (
            config.profiles.some(
              (candidate) => candidate.id !== existing?.id && candidate.id === profile.id,
            )
          ) {
            setError(`Identifier ${profile.id} already exists`);
            return;
          }
          if (existingIndex >= 0) config.profiles[existingIndex] = profile;
          else config.profiles.push(profile);
          await service.applyConfig(config);
          await service.store.save(config);
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    } else if (input && !key.ctrl && !key.meta && field < 2) {
      const valid = field === 0 ? /^[A-Za-z0-9_-]+$/.test(input) : !/[\r\n]/.test(input);
      if (valid) {
        setValue((current) => current.slice(0, cursor) + input + current.slice(cursor));
        setCursor((position) => position + input.length);
      }
    }
  });
  const renderInput = (label: string, value: string, active: boolean) => (
    <Text color={active ? 'cyan' : undefined}>
      {active ? '>' : ' '} {label}: {value.slice(0, active ? cursor : value.length)}
      {active ? '_' : ''}
      {value.slice(active ? cursor : value.length)}
    </Text>
  );
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>{existing ? `Edit ${existing.displayName}` : 'New interface'}</Text>
      {renderInput('Identifier', id, field === 0)}
      {renderInput('Visible name', displayName, field === 1)}
      <Text color={field === 2 ? 'cyan' : undefined}>
        {field === 2 ? '>' : ' '} Target: {devices[device]?.target ?? 'No playback hardware'}
      </Text>
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        <Text bold>Available playback devices</Text>
        {devices.map((candidate, index) => (
          <Text key={candidate.target} color={index === device ? 'cyan' : undefined}>
            {index === device ? '>' : ' '} Card {candidate.cardId} ({candidate.cardIndex}), DEV=
            {candidate.device}: {candidate.cardName} - {candidate.description}
          </Text>
        ))}
      </Box>
      <Text color={field === 3 ? 'green' : undefined}>
        {field === 3 ? '>' : ' '} [Create interface]
      </Text>
      <Text dimColor>
        Tab or Enter advances. Up/Down chooses target. Select Create interface and press Enter to
        save.
      </Text>
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}

function DeleteProfile({
  service,
  profile,
  onDone,
}: {
  service: AlsatoolsService;
  profile: Profile;
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState('');
  const remove = (deleteControls: boolean) => {
    void (async () => {
      try {
        const config = await service.store.load();
        const next = {
          ...config,
          profiles: config.profiles.filter((candidate) => candidate.id !== profile.id),
        };
        await service.applyConfig(next);
        await service.store.save(next);
        if (deleteControls) await service.store.deleteControlsFile(profile.controlsPath);
        onDone(
          deleteControls
            ? `Removed ${profile.pcmName} and its controls file`
            : `Removed ${profile.pcmName}; controls file kept`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  };
  useInput((input) => {
    if (input === 'k') remove(false);
    if (input === 'x') remove(true);
  });
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="red">
        Delete {profile.displayName}?
      </Text>
      <Text>This removes only the managed definition for {profile.pcmName}.</Text>
      <Text>[K] Remove interface, keep controls: {profile.controlsPath}</Text>
      <Text>[X] Remove interface and delete controls file</Text>
      <Text dimColor>[Esc] Cancel</Text>
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
