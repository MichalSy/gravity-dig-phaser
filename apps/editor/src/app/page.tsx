'use client';

import { useMemo, useRef, useState } from 'react';
import { Cable, Send, Unplug } from 'lucide-react';
import type { DebugMessage } from '@gravity-dig/debug-protocol';
import styles from './page.module.css';

const DEFAULT_SESSION_ID = 'local-dev';

function defaultRelayUrl(): string {
  const configured = process.env.NEXT_PUBLIC_DEBUG_RELAY_URL;
  if (configured) return configured;
  if (typeof window === 'undefined') return 'ws://localhost:8787/debug';
  return window.location.protocol === 'https:'
    ? 'wss://gravity-dig-relay.sytko.de/debug'
    : 'ws://localhost:8787/debug';
}

export default function Home() {
  const [relayUrl, setRelayUrl] = useState(defaultRelayUrl);
  const [sessionId, setSessionId] = useState(DEFAULT_SESSION_ID);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [text, setText] = useState('Hallo vom Debug Editor');
  const [messages, setMessages] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const canSend = status === 'connected';
  const statusLabel = useMemo(() => ({ disconnected: 'Getrennt', connecting: 'Verbinde...', connected: 'Verbunden' })[status], [status]);

  function log(line: string): void {
    setMessages((current) => [`${new Date().toLocaleTimeString()} ${line}`, ...current].slice(0, 80));
  }

  function connect(): void {
    disconnect();
    setStatus('connecting');
    const socket = new WebSocket(relayUrl);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      const hello: DebugMessage = { type: 'hello', role: 'editor', sessionId };
      socket.send(JSON.stringify(hello));
      setStatus('connected');
      log(`Editor verbunden: ${sessionId}`);
    });
    socket.addEventListener('message', (event) => log(`← ${event.data}`));
    socket.addEventListener('close', () => {
      setStatus('disconnected');
      log('Verbindung geschlossen');
    });
    socket.addEventListener('error', () => {
      setStatus('disconnected');
      log('WebSocket Fehler');
    });
  }

  function disconnect(): void {
    socketRef.current?.close();
    socketRef.current = null;
    setStatus('disconnected');
  }

  function sendMessage(): void {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const message: DebugMessage = { type: 'text', from: 'editor', sessionId, text, sentAt: Date.now() };
    socket.send(JSON.stringify(message));
    log(`→ ${JSON.stringify(message)}`);
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Gravity Dig</p>
            <h1 className={styles.title}>Debug Editor</h1>
          </div>
          <span className={`${styles.badge} ${styles[status]}`}>{statusLabel}</span>
        </div>

        <label className={styles.field}>
          Relay URL
          <input className={styles.input} value={relayUrl} onChange={(event) => setRelayUrl(event.target.value)} />
        </label>
        <label className={styles.field}>
          Session ID
          <input className={styles.input} value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
        </label>

        <div className={styles.actions}>
          <button className={styles.button} onClick={connect}><Cable size={18} /> Verbinden</button>
          <button onClick={disconnect} className={`${styles.button} ${styles.secondary}`}><Unplug size={18} /> Trennen</button>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Smoke-Test</h2>
        <p className={styles.copy}>Sende eine Nachricht über das Relay. Ein verbundenes Game mit gleicher Session bekommt sie live.</p>
        <div className={styles.sendRow}>
          <input className={styles.input} value={text} onChange={(event) => setText(event.target.value)} />
          <button className={styles.button} onClick={sendMessage} disabled={!canSend}><Send size={18} /> Senden</button>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Log</h2>
        <pre className={styles.log}>{messages.join('\n') || 'Noch keine Nachrichten.'}</pre>
      </section>
    </main>
  );
}
