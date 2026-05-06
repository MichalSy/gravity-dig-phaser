import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { WebSocketServer, type WebSocket } from 'ws';
import type { DebugClientRole, DebugHelloMessage, DebugMessage, DebugRelayStatusMessage } from '@gravity-dig/debug-protocol';

interface Client {
  id: string;
  role: DebugClientRole;
  sessionId: string;
  socket: WebSocket;
}

interface SessionCache {
  assetList?: DebugMessage;
  nodeDefinitions?: DebugMessage;
  nodeTree?: DebugMessage;
  nodeProps: Map<string, DebugMessage>;
}

const sessions = new Map<string, Set<Client>>();
const clients = new Map<WebSocket, Client>();
const sessionCaches = new Map<string, SessionCache>();
const port = Number(process.env.PORT ?? 80);

const app = new Hono();
app.get('/health', (c) => c.json({ ok: true, service: 'gravity-dig-debug-relay' }));
app.get('/sessions', (c) => c.json([...sessions.entries()].map(([sessionId, peers]) => ({
  sessionId,
  games: [...peers].filter((client) => client.role === 'game').length,
  editors: [...peers].filter((client) => client.role === 'editor').length,
}))));
app.get('/', (c) => c.text('Gravity Dig debug relay is running. Connect via WebSocket at /debug.'));

const server = createServer(async (req, res) => {
  const response = await app.fetch(new Request(`http://localhost${req.url ?? '/'}`, { method: req.method }));
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(await response.text());
});

const wss = new WebSocketServer({ server, path: '/debug' });

wss.on('connection', (socket) => {
  socket.on('message', (raw) => handleMessage(socket, raw.toString()));
  socket.on('close', () => removeClient(socket));
  socket.on('error', () => removeClient(socket));
});

function handleMessage(socket: WebSocket, raw: string): void {
  const message = parseMessage(raw);
  if (!message) return send(socket, { type: 'text', from: 'game', sessionId: 'relay', text: 'Invalid debug message', sentAt: Date.now() });

  if (message.type === 'hello') {
    registerClient(socket, message);
    return;
  }

  if (message.type === 'ping') {
    send(socket, { type: 'pong', sentAt: message.sentAt, receivedAt: Date.now() });
    return;
  }

  const client = clients.get(socket);
  if (!client) return;
  updateSessionCache(client.sessionId, message);
  broadcast(client.sessionId, message, socket);
}

function registerClient(socket: WebSocket, hello: DebugHelloMessage): void {
  removeClient(socket);
  const client: Client = {
    id: hello.clientId ?? randomUUID(),
    role: hello.role,
    sessionId: hello.sessionId,
    socket,
  };
  clients.set(socket, client);
  const peers = sessions.get(client.sessionId) ?? new Set<Client>();
  peers.add(client);
  sessions.set(client.sessionId, peers);
  publishStatus(client.sessionId);
  if (client.role === 'editor') sendCachedSnapshot(client);
}

function removeClient(socket: WebSocket): void {
  const client = clients.get(socket);
  if (!client) return;
  clients.delete(socket);
  const peers = sessions.get(client.sessionId);
  peers?.delete(client);
  if (!peers || peers.size === 0) {
    sessions.delete(client.sessionId);
    sessionCaches.delete(client.sessionId);
  } else publishStatus(client.sessionId);
}

function publishStatus(sessionId: string): void {
  const peers = sessions.get(sessionId) ?? new Set<Client>();
  const status: DebugRelayStatusMessage = {
    type: 'relay:status',
    sessionId,
    games: [...peers].filter((client) => client.role === 'game').length,
    editors: [...peers].filter((client) => client.role === 'editor').length,
  };
  broadcast(sessionId, status);
}

function sendCachedSnapshot(client: Client): void {
  const cache = sessionCaches.get(client.sessionId);
  if (!cache) return;
  if (cache.assetList) send(client.socket, cache.assetList);
  if (cache.nodeDefinitions) send(client.socket, cache.nodeDefinitions);
  if (cache.nodeTree) send(client.socket, cache.nodeTree);
  for (const props of cache.nodeProps.values()) send(client.socket, props);
}

function updateSessionCache(sessionId: string, message: DebugMessage): void {
  const cache = sessionCaches.get(sessionId) ?? { nodeProps: new Map<string, DebugMessage>() } satisfies SessionCache;
  if (message.type === 'asset:list') cache.assetList = message;
  if (message.type === 'node:definitions') cache.nodeDefinitions = message;
  if (message.type === 'node:tree') cache.nodeTree = message;
  if (message.type === 'node:props') cache.nodeProps.set(message.nodeId, message);
  sessionCaches.set(sessionId, cache);
}

function broadcast(sessionId: string, message: DebugMessage, except?: WebSocket): void {
  for (const client of sessions.get(sessionId) ?? []) {
    if (client.socket !== except) send(client.socket, message);
  }
}

function send(socket: WebSocket, message: DebugMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function parseMessage(raw: string): DebugMessage | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<DebugMessage>;
    return typeof parsed.type === 'string' ? parsed as DebugMessage : undefined;
  } catch {
    return undefined;
  }
}

server.listen(port, () => {
  console.log(`Gravity Dig debug relay listening on :${port}`);
});
