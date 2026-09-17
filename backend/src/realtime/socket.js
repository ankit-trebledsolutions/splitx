const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Group = require('../models/Group');

/**
 * The app's live connection: one authenticated socket per open app, joined to
 * a room per group. Carries instant messages, typing, and presence.
 *
 * Scaling notes:
 *  - "Online" is derived from open sockets and never stored, so it can't go
 *    stale when a phone dies without saying goodbye.
 *  - Room membership is cached on the socket so broadcasts don't hit the DB.
 *  - presence:query uses fetchSockets(), which is adapter-aware: with the
 *    Redis adapter (see init) it sees sockets on every server instance.
 */

// Wi-Fi blips drop sockets for a second or two; only flip someone offline
// if they've stayed gone this long.
const OFFLINE_GRACE_MS = 5000;

let io = null;

// userId -> Set<socketId>. A person can be connected from several devices;
// they're online while at least one socket is open.
const connections = new Map();
// userId -> pending "go offline" timer, cancelled if they reconnect in time.
const offlineTimers = new Map();

const groupRoom = (groupId) => `group:${groupId}`;

const memberGroupIds = async (userId) => {
  const groups = await Group.find({ members: userId }).select('_id').lean();
  return groups.map((g) => g._id.toString());
};

// Every connection must present the same JWT the HTTP API uses.
const authenticate = async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Missing access token'));
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub).select('name').lean();
    if (!user) return next(new Error('User no longer exists'));
    socket.data.user = { id: user._id.toString(), name: user.name };
    return next();
  } catch (err) {
    return next(new Error('Invalid or expired token'));
  }
};

const broadcastPresence = (groupIds, payload) => {
  for (const groupId of groupIds) io.to(groupRoom(groupId)).emit('presence:update', payload);
};

const markOnline = (userId, groupIds) => {
  const pending = offlineTimers.get(userId);
  if (pending) {
    // Back within the grace window: as far as everyone else knows, they never left.
    clearTimeout(pending);
    offlineTimers.delete(userId);
    return;
  }
  broadcastPresence(groupIds, { userId, online: true, lastSeenAt: null });
};

const markOffline = (userId, groupIds) => {
  const timer = setTimeout(async () => {
    offlineTimers.delete(userId);
    if (connections.has(userId)) return; // reconnected on another socket meanwhile
    const lastSeenAt = new Date();
    try {
      await User.updateOne({ _id: userId }, { lastSeenAt });
    } catch (err) {
      console.error('[realtime] failed to store lastSeenAt:', err.message);
    }
    broadcastPresence(groupIds, { userId, online: false, lastSeenAt });
  }, OFFLINE_GRACE_MS);
  offlineTimers.set(userId, timer);
};

// Who is online in a group right now: the snapshot a screen needs when it
// opens; presence:update events keep it current afterwards.
const onlineUserIds = async (groupId) => {
  const sockets = await io.in(groupRoom(groupId)).fetchSockets();
  const ids = sockets.map((s) => s.data.user && s.data.user.id).filter(Boolean);
  return [...new Set(ids)];
};

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: '*' },
    // Events are tiny (ids and flags); refuse anything larger.
    maxHttpBufferSize: 1e5,
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Horizontal-scaling seam: when running more than one backend instance,
  // install @socket.io/redis-adapter + redis and set REDIS_URL so rooms and
  // broadcasts are shared across instances. No other code changes needed.
  if (process.env.REDIS_URL) {
    try {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const { createClient } = require('redis');
      const pub = createClient({ url: process.env.REDIS_URL });
      const sub = pub.duplicate();
      Promise.all([pub.connect(), sub.connect()]).then(() => {
        io.adapter(createAdapter(pub, sub));
        console.log('[realtime] Redis adapter enabled');
      });
    } catch (err) {
      console.warn('[realtime] REDIS_URL set but adapter unavailable:', err.message);
    }
  }

  io.use(authenticate);

  io.on('connection', (socket) => {
    const { id: userId, name } = socket.data.user;

    if (!connections.has(userId)) connections.set(userId, new Set());
    connections.get(userId).add(socket.id);
    const isFirstSocket = connections.get(userId).size === 1;

    // Membership loads from the DB. Handlers are registered synchronously
    // below and each awaits `ready`, so events the client sends right after
    // connecting are answered instead of dropped while the query runs.
    socket.data.groupIds = new Set();
    const ready = (async () => {
      socket.data.groupIds = new Set(await memberGroupIds(userId));
      for (const groupId of socket.data.groupIds) socket.join(groupRoom(groupId));
      // First open socket for this user -> tell their groups they're online.
      if (isFirstSocket) markOnline(userId, socket.data.groupIds);
    })().catch((err) => console.error('[realtime] failed to load memberships:', err.message));

    // Snapshot of who's online in a group (members only).
    socket.on('presence:query', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      await ready;
      const groupId = payload && payload.groupId;
      if (!groupId || !socket.data.groupIds.has(String(groupId))) return ack({ online: [] });
      ack({ online: await onlineUserIds(groupId) });
    });

    // Opened a group joined/created after connecting -> join its room live.
    socket.on('group:open', async (payload) => {
      await ready;
      const groupId = payload && payload.groupId;
      if (!groupId || socket.data.groupIds.has(String(groupId))) return;
      const isMember = await Group.exists({ _id: groupId, members: userId });
      if (!isMember) return;
      socket.data.groupIds.add(String(groupId));
      socket.join(groupRoom(groupId));
    });

    // Typing is relayed to everyone else in the group and never stored.
    socket.on('typing', async (payload) => {
      await ready;
      const groupId = payload && payload.groupId;
      if (!groupId || !socket.data.groupIds.has(String(groupId))) return;
      const typing = Boolean(payload.typing);
      socket.to(groupRoom(groupId)).emit('typing', { groupId, userId, name, typing });
    });

    socket.on('disconnect', async () => {
      await ready;
      const set = connections.get(userId);
      if (set) set.delete(socket.id);
      if (!set || set.size === 0) {
        connections.delete(userId);
        markOffline(userId, [...socket.data.groupIds]); // last device gone
      }
    });
  });

  return io;
};

// Used by services (messages, activity cards) to push to a group's members.
const emitToGroup = (groupId, event, payload) => {
  if (io) io.to(groupRoom(groupId)).emit(event, payload);
};

const close = () => new Promise((resolve) => (io ? io.close(() => resolve()) : resolve()));

module.exports = { init, emitToGroup, close };
