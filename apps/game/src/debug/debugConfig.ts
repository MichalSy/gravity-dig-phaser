export interface DebugConnectionConfig {
  enabled: true;
  sessionId: string;
  relayUrl: string;
  editorApiUrl: string;
}

const DEBUG_ENABLED_KEY = 'gravity-dig-debug-enabled';
const DEBUG_SESSION_KEY = 'gravity-dig-debug-session';
const DEBUG_RELAY_KEY = 'gravity-dig-debug-relay';
const DEBUG_EDITOR_API_KEY = 'gravity-dig-debug-editor-api';
const DEFAULT_SESSION_ID = 'local-dev';

export function readDebugConnectionConfig(): DebugConnectionConfig | undefined {
  const params = new URLSearchParams(window.location.search);
  const debugParam = params.get('debug');

  if (debugParam === '0') {
    localStorage.removeItem(DEBUG_ENABLED_KEY);
    localStorage.removeItem(DEBUG_SESSION_KEY);
    localStorage.removeItem(DEBUG_RELAY_KEY);
    localStorage.removeItem(DEBUG_EDITOR_API_KEY);
    return undefined;
  }

  const sessionFromUrl = params.get('debugSession')?.trim();
  const relayFromUrl = params.get('debugRelay')?.trim();
  const editorApiFromUrl = params.get('debugEditorApi')?.trim();

  if (debugParam === '1') {
    localStorage.setItem(DEBUG_ENABLED_KEY, '1');
    if (sessionFromUrl) localStorage.setItem(DEBUG_SESSION_KEY, sessionFromUrl);
    if (relayFromUrl) localStorage.setItem(DEBUG_RELAY_KEY, relayFromUrl);
    if (editorApiFromUrl) localStorage.setItem(DEBUG_EDITOR_API_KEY, editorApiFromUrl);
  }

  const enabled = debugParam === '1' || localStorage.getItem(DEBUG_ENABLED_KEY) === '1';
  if (!enabled) return undefined;

  return {
    enabled: true,
    sessionId: sessionFromUrl || localStorage.getItem(DEBUG_SESSION_KEY) || DEFAULT_SESSION_ID,
    relayUrl: relayFromUrl || localStorage.getItem(DEBUG_RELAY_KEY) || defaultRelayUrl(),
    editorApiUrl: editorApiFromUrl || localStorage.getItem(DEBUG_EDITOR_API_KEY) || defaultEditorApiUrl(),
  };
}

function defaultRelayUrl(): string {
  return window.location.protocol === 'https:'
    ? 'wss://gravity-dig-relay.sytko.de/debug'
    : 'ws://localhost:8787/debug';
}

function defaultEditorApiUrl(): string {
  return window.location.protocol === 'https:'
    ? 'https://gravity-dig-debug.sytko.de'
    : 'http://localhost:3002';
}
