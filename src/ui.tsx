import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { StatusMessage } from '@inkjs/ui';
import type { Device, PlaybackState } from './alsa.js';
import { physicalStatus } from './alsa.js';
import type { DependencyReport } from './deps.js';
import type { Profile } from './model.js';
import type { AlsatoolsService } from './service.js';

type Screen = 'list' | 'detail' | 'help' | 'diagnostics' | 'new' | 'edit' | 'delete';
type Color =
  | 'green'
  | 'yellow'
  | 'red'
  | 'gray'
  | 'magenta'
  | 'white'
  | '#315BEF'
  | '#6f8fff'
  | '#171a21'
  | '#252a33'
  | '#2d3850'
  | '#203b2c'
  | '#d7dce5'
  | '#8f98a8';

const ACCENT: Color = '#315BEF';
const ACCENT_BRIGHT: Color = '#6f8fff';
const SURFACE: Color = '#252a33';
const SURFACE_DEEP: Color = '#171a21';
const TEXT: Color = '#d7dce5';
const MUTED: Color = '#8f98a8';

const statusColor = (state: PlaybackState['state'] | undefined, label?: string): Color =>
  label === 'Connected'
    ? 'green'
    : label === 'Not found' || state === 'Unavailable'
      ? 'red'
      : state === 'Playing'
        ? 'green'
        : state === 'XRUN'
          ? 'yellow'
          : 'gray';

const statusLabel = (state: PlaybackState | undefined, device?: Device) => {
  if (device && state?.state === 'Unavailable') return 'Connected';
  return state?.state ?? 'Not found';
};

export function App({ service, report }: { service: AlsatoolsService; report: DependencyReport }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [terminalSize, setTerminalSize] = useState({
    width: stdout.columns ?? 80,
    height: stdout.rows ?? 24,
  });
  const [screen, setScreen] = useState<Screen>(
    report.dependencies.every((dependency) => dependency.ok) ? 'list' : 'diagnostics',
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selection, setSelection] = useState(0);
  const [states, setStates] = useState<Record<string, PlaybackState>>({});
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const refresh = async () => {
    const [nextProfiles, nextDevices] = await Promise.all([service.list(), service.devices()]);
    setProfiles(nextProfiles);
    setDevices(nextDevices);
    const mapped = await Promise.all(
      nextProfiles.map(async (profile) => {
        const device = nextDevices.find((candidate) => candidate.target === profile.target);
        return [
          profile.id,
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

  useEffect(() => {
    const updateTerminalSize = () =>
      setTerminalSize({ width: stdout.columns ?? 80, height: stdout.rows ?? 24 });
    stdout.on('resize', updateTerminalSize);
    return () => {
      stdout.off('resize', updateTerminalSize);
    };
  }, [stdout]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
    if (feedback) return;
    if (screen === 'list') {
      if (input === 'x') exit();
      if (key.downArrow || input === 'j')
        setSelection((value) => Math.min(value + 1, Math.max(0, profiles.length - 1)));
      if (key.upArrow || input === 'k') setSelection((value) => Math.max(0, value - 1));
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
          .then(() =>
            setFeedback({ variant: 'success', title: 'QASMIXER', message: 'QasMixer launched.' }),
          )
          .catch((error: Error) =>
            setFeedback({ variant: 'error', title: 'QASMIXER FAILED', message: error.message }),
          );
    } else if (key.escape) setScreen('list');
  });

  const profile = profiles[selection];
  return (
    <Box
      flexDirection="column"
      width={terminalSize.width}
      minHeight={terminalSize.height}
      position="relative"
      backgroundColor={SURFACE_DEEP}
      paddingX={1}
      paddingY={1}
    >
      <Header report={report} />
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
          onDone={(message) => {
            setFeedback({ variant: 'success', title: 'PROFILE CREATED', message });
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
          onDone={(message) => {
            setFeedback({ variant: 'success', title: 'PROFILE UPDATED', message });
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
            setFeedback({ variant: 'success', title: 'PROFILE REMOVED', message });
            setScreen('list');
            void refresh();
          }}
        />
      )}
      <Box flexGrow={1} />
      {screen === 'list' ? <Navigation /> : <Text color={MUTED}>Esc back</Text>}
      {feedback && (
        <FeedbackModal
          feedback={feedback}
          onClose={() => setFeedback(null)}
          width={Math.max(1, Math.min(58, terminalSize.width - 6))}
        />
      )}
    </Box>
  );
}

type FeedbackVariant = 'info' | 'success' | 'error' | 'warning';
type FeedbackState = { variant: FeedbackVariant; title: string; message: string };

function FeedbackModal({
  feedback,
  onClose,
  width,
}: {
  feedback: FeedbackState;
  onClose: () => void;
  width: number;
}) {
  useInput(() => onClose());

  return (
    <Box position="absolute" width="100%" height="100%" alignItems="center" justifyContent="center">
      <Box
        width={width}
        flexDirection="column"
        paddingX={2}
        paddingY={1}
        backgroundColor={SURFACE}
        borderStyle="bold"
        borderLeft
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderColor={feedback.variant === 'error' ? 'red' : ACCENT}
      >
        <StatusMessage variant={feedback.variant}>{feedback.title}</StatusMessage>
        <Text color={TEXT}>{feedback.message}</Text>
        <Text color={MUTED}>Press any key to continue</Text>
      </Box>
    </Box>
  );
}

function Header({ report }: { report: DependencyReport }) {
  const healthy = report.dependencies.every((dependency) => dependency.ok);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between">
        <Text bold color={ACCENT_BRIGHT}>
          ALSA <Text color="white">VIRTUAL TOOLS</Text>
        </Text>
        <Text color={healthy ? 'green' : 'yellow'}>
          {healthy ? '[ SYSTEM READY ]' : '[ CHECK REQUIRED ]'}
        </Text>
      </Box>
      <Text color={MUTED}>safe alsaequal profile manager / live hardware monitor</Text>
    </Box>
  );
}

function Panel({
  title,
  children,
  color = ACCENT,
}: {
  title: string;
  children: React.ReactNode;
  color?: Color;
}) {
  return (
    <Box
      flexDirection="column"
      backgroundColor={SURFACE}
      borderStyle="bold"
      borderLeft
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderColor={color}
      paddingX={2}
      paddingY={1}
    >
      <Text bold color={color}>
        {title}
      </Text>
      {children}
    </Box>
  );
}

function Badge({ label, color }: { label: string; color: Color }) {
  return (
    <Text color={color} bold>
      [{label}]
    </Text>
  );
}

function KeyHint({ keyName, label }: { keyName: string; label: string }) {
  return (
    <Text>
      <Text color={ACCENT} bold>
        {keyName}
      </Text>
      <Text color={MUTED}> {label}</Text>
    </Text>
  );
}

function Navigation() {
  return (
    <>
      <Box marginTop={1} gap={2} flexWrap="wrap">
        <KeyHint keyName="Enter" label="details" />
        <KeyHint keyName="N" label="new" />
        <KeyHint keyName="E" label="edit" />
        <KeyHint keyName="D" label="delete" />
        <KeyHint keyName="Q" label="QasMixer" />
      </Box>
      <Box gap={2} flexWrap="wrap">
        <KeyHint keyName="R" label="refresh" />
        <KeyHint keyName="I" label="diagnostics" />
        <KeyHint keyName="?" label="help" />
        <KeyHint keyName="X" label="exit" />
      </Box>
    </>
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
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="white">
          OUTPUT PROFILES
        </Text>
        <Text color={MUTED}>
          {' '}
          {profiles.length} managed interface{profiles.length === 1 ? '' : 's'}
        </Text>
      </Box>
      {profiles.length === 0 ? (
        <Panel title="NO PROFILES YET" color="magenta">
          <Box flexDirection="column" paddingY={1}>
            <Text color="white">Create a profile to expose an equalized ALSA output.</Text>
            <Text color={MUTED}>Press N to select a physical playback device.</Text>
          </Box>
        </Panel>
      ) : (
        <Box flexDirection="column" gap={1}>
          {profiles.map((profile, index) => {
            const device = devices.find((candidate) => candidate.target === profile.target);
            const state = states[profile.id];
            const status = statusLabel(state, device);
            return (
              <ProfileRow
                key={profile.id}
                profile={profile}
                state={state}
                device={device}
                status={status}
                selected={index === selection}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function ProfileRow({
  profile,
  state,
  device,
  status,
  selected,
}: {
  profile: Profile;
  state?: PlaybackState;
  device?: Device;
  status: string;
  selected: boolean;
}) {
  const audioDetails = state?.rate && state.format ? `${state.rate} ${state.format}` : 'idle';
  return (
    <Box
      flexDirection="column"
      backgroundColor={selected ? '#2d3850' : SURFACE}
      borderStyle="bold"
      borderLeft
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderColor={selected ? ACCENT : 'gray'}
      paddingX={2}
      paddingY={1}
    >
      <Box justifyContent="space-between">
        <Box>
          <Text color={selected ? ACCENT : 'gray'} bold>
            {selected ? '> ' : '  '}
          </Text>
          <Text bold color={selected ? 'white' : TEXT}>
            {profile.displayName}
          </Text>
          <Text color={MUTED}> {profile.pcmName}</Text>
        </Box>
        <Box>
          {!profile.enabled && <Badge label="OFF" color="gray" />}
          <Text> </Text>
          <Badge label={status.toUpperCase()} color={statusColor(state?.state, status)} />
        </Box>
      </Box>
      <Box marginLeft={2}>
        <Text color="magenta">audio</Text>
        <Text> {audioDetails}</Text>
        <Text color={MUTED}>
          {' '}
          {'->'} {device?.cardName ?? profile.target}
        </Text>
      </Box>
    </Box>
  );
}

function Details({ profile, state }: { profile: Profile; state?: PlaybackState }) {
  const color = statusColor(state?.state);
  return (
    <Box flexDirection="column" gap={1}>
      <Panel title={profile.displayName} color={ACCENT}>
        <Box flexDirection="column" paddingY={1}>
          <InfoRow label="Status" value={state?.state ?? 'Unavailable'} valueColor={color} />
          <InfoRow label="Public PCM" value={profile.pcmName} />
          <InfoRow label="CTL" value={profile.ctlName} />
          <InfoRow label="Target" value={profile.target} />
        </Box>
      </Panel>
      <Panel title="PLAYBACK" color="magenta">
        <Box flexDirection="column" paddingY={1}>
          <InfoRow label="Physical" value={`${state?.rate ?? '-'} ${state?.format ?? '-'}`} />
          <InfoRow label="Channels" value={state?.channels ? `${state.channels} ch` : '-'} />
          <InfoRow label="Bit-perfect" value="No - DSP/alsaequal enabled" valueColor="yellow" />
          <InfoRow label="Native rate" value="Unknown" valueColor="yellow" />
        </Box>
      </Panel>
      <Panel title="PERSISTENCE" color="gray">
        <Box flexDirection="column" paddingY={1}>
          <InfoRow label="Controls" value={profile.controlsPath} />
          <Text color={MUTED}>Changes to a target affect new ALSA connections only.</Text>
        </Box>
      </Panel>
    </Box>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: Color;
}) {
  return (
    <Box>
      <Text color={MUTED}>{label.padEnd(14)}</Text>
      <Text color={valueColor}>{value}</Text>
    </Box>
  );
}

function Help() {
  return (
    <Panel title="KEYBOARD" color={ACCENT}>
      <Box flexDirection="column" paddingY={1} gap={1}>
        <Text>
          <Text color={ACCENT} bold>
            Arrows / j / k
          </Text>{' '}
          select profiles
        </Text>
        <Text>
          <Text color={ACCENT} bold>
            Enter
          </Text>{' '}
          open details{' '}
          <Text color={ACCENT} bold>
            N
          </Text>{' '}
          new{' '}
          <Text color={ACCENT} bold>
            E
          </Text>{' '}
          edit
        </Text>
        <Text>
          <Text color={ACCENT} bold>
            D
          </Text>{' '}
          delete{' '}
          <Text color={ACCENT} bold>
            Q
          </Text>{' '}
          QasMixer{' '}
          <Text color={ACCENT} bold>
            R
          </Text>{' '}
          refresh
        </Text>
        <Text>
          <Text color={ACCENT} bold>
            I
          </Text>{' '}
          diagnostics{' '}
          <Text color={ACCENT} bold>
            X
          </Text>{' '}
          exit
        </Text>
        <Text color={MUTED}>
          All changes are explicit. ALSA configuration is never written on startup.
        </Text>
      </Box>
    </Panel>
  );
}

function Diagnostics({ report }: { report: DependencyReport }) {
  const healthy = report.dependencies.every((dependency) => dependency.ok);
  return (
    <Box flexDirection="column" gap={1}>
      <Panel
        title={healthy ? 'SYSTEM DIAGNOSTICS' : 'ACTION REQUIRED'}
        color={healthy ? 'green' : 'yellow'}
      >
        <Box flexDirection="column" paddingY={1}>
          {report.dependencies.map((dependency) => (
            <Box key={dependency.name}>
              <Text color={dependency.ok ? 'green' : 'red'} bold>
                {dependency.ok ? '[OK]  ' : '[FAIL]'}
              </Text>
              <Text bold>{dependency.name.padEnd(14)}</Text>
              <Text color={MUTED}> {dependency.detail || dependency.purpose}</Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text color="gray">LADSPA_PATH </Text>
            <Text>{report.ladspaPath}</Text>
          </Box>
        </Box>
      </Panel>
      {report.dependencies.some((dependency) => !dependency.ok) && (
        <Panel title="SUGGESTED INSTALLATION" color="yellow">
          <Box flexDirection="column" paddingY={1}>
            {report.installCommands.map((command) => (
              <Text key={command} color="yellow">
                $ {command}
              </Text>
            ))}
          </Box>
        </Panel>
      )}
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
  onDone: (message: string) => void;
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
    const isTextField = field < 2;
    const isBackspace = key.backspace || input === '\b' || input === '\x7f';
    const isDelete = key.delete || input === '\x1b[3~';

    if (key.tab) {
      const nextField = (field + 1) % 4;
      setField(nextField);
      setCursor(nextField === 0 ? id.length : nextField === 1 ? displayName.length : 0);
    } else if (key.ctrl && input === 'a' && isTextField) {
      setCursor(0);
    } else if (key.ctrl && input === 'e' && isTextField) {
      setCursor(value.length);
    } else if (key.ctrl && input === 'u' && isTextField) {
      setValue('');
      setCursor(0);
    } else if (key.leftArrow && isTextField) {
      setCursor((position) => Math.max(0, position - 1));
    } else if (key.rightArrow && isTextField) {
      setCursor((position) => Math.min(value.length, position + 1));
    } else if (key.home && isTextField) {
      setCursor(0);
    } else if (key.end && isTextField) {
      setCursor(value.length);
    } else if (isBackspace && isTextField) {
      if (cursor > 0) {
        setValue((current) => current.slice(0, cursor - 1) + current.slice(cursor));
        setCursor((position) => position - 1);
      }
    } else if (isDelete && isTextField) {
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
          onDone(
            existing
              ? 'Profile updated. Restart playback to reopen the virtual PCM.'
              : `Profile ${profile.pcmName} created and ready to use.`,
          );
        } catch (error) {
          setError(error instanceof Error ? error.message : String(error));
        }
      })();
    } else if (input && !key.ctrl && !key.meta && isTextField) {
      const valid = field === 0 ? /^[A-Za-z0-9_-]+$/.test(input) : !/[\r\n]/.test(input);
      if (valid) {
        setValue((current) => current.slice(0, cursor) + input + current.slice(cursor));
        setCursor((position) => position + input.length);
      }
    }
  });

  const renderInput = (label: string, value: string, active: boolean) => (
    <Box>
      <Text color={active ? ACCENT : 'gray'} bold>
        {active ? '> ' : '  '}
      </Text>
      <Text color={active ? 'white' : undefined}>{label.padEnd(15)}</Text>
      {active ? (
        <Text color="white">
          {value.slice(0, cursor)}
          <Text inverse color={ACCENT_BRIGHT}>
            {value[cursor] ?? ' '}
          </Text>
          {value.slice(cursor + 1)}
        </Text>
      ) : (
        <Text>{value}</Text>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" gap={1}>
      <Panel title={existing ? `EDIT ${existing.displayName.toUpperCase()}` : 'NEW OUTPUT PROFILE'}>
        <Box flexDirection="column" paddingY={1}>
          {renderInput('Identifier', id, field === 0)}
          {renderInput('Visible name', displayName, field === 1)}
          <Box>
            <Text color={field === 2 ? ACCENT : 'gray'} bold>
              {field === 2 ? '> ' : '  '}
            </Text>
            <Text color={field === 2 ? 'white' : undefined}>{'Target'.padEnd(15)}</Text>
            <Text>{devices[device]?.target ?? 'No playback hardware'}</Text>
          </Box>
        </Box>
      </Panel>
      <Panel title="PLAYBACK DEVICES" color="magenta">
        <Box flexDirection="column" paddingY={1}>
          {devices.length === 0 ? (
            <Text color="yellow">No playback hardware detected.</Text>
          ) : (
            devices.map((candidate, index) => (
              <Text key={candidate.target}>
                <Text color={index === device ? 'magenta' : 'gray'} bold>
                  {index === device ? '> ' : '  '}
                </Text>
                <Text color={index === device ? 'white' : undefined}>
                  {candidate.cardName} <Text color={MUTED}>{candidate.description}</Text>
                </Text>
              </Text>
            ))
          )}
        </Box>
      </Panel>
      <Box
        backgroundColor={field === 3 ? '#203b2c' : SURFACE}
        borderStyle="bold"
        borderLeft
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderColor={field === 3 ? 'green' : 'gray'}
        paddingX={2}
        paddingY={1}
      >
        <Text color={field === 3 ? 'green' : 'gray'} bold>
          {field === 3 ? '> ' : '  '}
        </Text>
        <Text color={field === 3 ? 'green' : undefined}>[ Save profile ]</Text>
      </Box>
      <Text color={MUTED}>Tab/Enter advances, Up/Down chooses target, Esc cancels</Text>
      {error && <Text color="red">! {error}</Text>}
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
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    })();
  };

  useInput((input) => {
    if (input === 'k') remove(false);
    if (input === 'x') remove(true);
  });

  return (
    <Panel title={`REMOVE ${profile.displayName.toUpperCase()}?`} color="red">
      <Box flexDirection="column" paddingY={1} gap={1}>
        <Text>This removes only the managed definition for {profile.pcmName}.</Text>
        <Text>
          <Text color="yellow" bold>
            K
          </Text>{' '}
          remove interface, keep controls
        </Text>
        <Text>
          <Text color="red" bold>
            X
          </Text>{' '}
          remove interface and delete controls file
        </Text>
        <Text color={MUTED}>Esc cancel</Text>
        {error && <Text color="red">! {error}</Text>}
      </Box>
    </Panel>
  );
}
