const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Group = require('../models/Group');
const Conversation = require('../models/Conversation');

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
// Every socket also sits in a room of its own user, which is how direct
// messages reach all of someone's devices.
const userRoom = (userId) => `user:${userId}`;

// The other person in a direct conversation, or null if this user isn't in it.
// Cached per socket: typing events arrive in bursts and must not hit the DB.
const dmPeerOf = async (socket, conversationId) => {
  const key = String(conversationId);
  if (socket.data.dmPeers.has(key)) return socket.data.dmPeers.get(key);
  let peer = null;
  if (/^[a-f\d]{24}$/i.test(key)) {
    const conversation = await Conversation.findById(key).select('participants').lean();
    const me = socket.data.user.id;
    if (conversation && conversation.participants.some((p) => String(p) === me)) {
      peer = String(conversation.participants.find((p) => String(p) !== me) ?? '') || null;
    }
  }
  socket.data.dmPeers.set(key, peer);
  return peer;
};

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
    socket.data.dmPeers = new Map();
    socket.data.activeConversation = null;
    socket.join(userRoom(userId));
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

    // ---- Direct (one-to-one) chat ------------------------------------------

    // Which conversation this device has on screen, so a message that lands
    // while they're reading it doesn't also buzz their phone.
    socket.on('dm:open', async (payload) => {
      const conversationId = payload && payload.conversationId;
      if (!conversationId || !(await dmPeerOf(socket, conversationId))) return;
      socket.data.activeConversation = String(conversationId);
    });

    socket.on('dm:close', () => {
      socket.data.activeConversation = null;
    });

    // Relayed to the other person only, never stored.
    socket.on('dm:typing', async (payload) => {
      const conversationId = payload && payload.conversationId;
      if (!conversationId) return;
      const peer = await dmPeerOf(socket, conversationId);
      if (!peer) return;
      io.to(userRoom(peer)).emit('dm:typing', {
        conversationId: String(conversationId),
        userId,
        name,
        typing: Boolean(payload.typing),
      });
    });

    // "Active now" for the other person in a conversation.
    socket.on('dm:presence', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      const peer = payload && (await dmPeerOf(socket, payload.conversationId));
      if (!peer) return ack({ online: false, lastSeenAt: null });
      if (connections.has(peer)) return ack({ online: true, lastSeenAt: null });
      const user = await User.findById(peer).select('lastSeenAt').lean();
      return ack({ online: false, lastSeenAt: user ? user.lastSeenAt : null });
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

// Reaches every device a person has connected.
const emitToUser = (userId, event, payload) => {
  if (io) io.to(userRoom(userId)).emit(event, payload);
};

// True when any of the user's devices has this conversation open right now.
const isViewingConversation = (userId, conversationId) => {
  if (!io) return false;
  for (const socketId of connections.get(String(userId)) ?? []) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.data.activeConversation === String(conversationId)) return true;
  }
  return false;
};

/**
 * Someone left or was removed: tell the group (their own devices included, so
 * an open chat can close itself), then take their sockets out of the room so
 * nothing further from the group reaches them.
 */
const removeFromGroup = (userId, groupId) => {
  if (!io) return;
  const uid = String(userId);
  const gid = String(groupId);
  io.to(groupRoom(gid)).emit('group:member-left', { groupId: gid, userId: uid });
  for (const socketId of connections.get(uid) ?? []) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    socket.data.groupIds.delete(gid);
    socket.leave(groupRoom(gid));
  }
};

/**
 * The admin deleted the group: tell everyone who has it open so their screens
 * can close, then empty the room. `deletedBy` lets the admin's own devices tell
 * "I did this" from "this was done to me".
 */
const closeGroup = (groupId, { name, deletedBy }) => {
  if (!io) return;
  const gid = String(groupId);
  const room = groupRoom(gid);
  io.to(room).emit('group:deleted', { groupId: gid, name, deletedBy: String(deletedBy) });
  // Copied first: leaving the room edits the very set being walked.
  for (const socketId of [...(io.sockets.adapter.rooms.get(room) ?? [])]) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    socket.data.groupIds?.delete(gid);
    socket.leave(room);
  }
};

const close = () => new Promise((resolve) => (io ? io.close(() => resolve()) : resolve()));

module.exports = {
  init,
  emitToGroup,
  emitToUser,
  isViewingConversation,
  removeFromGroup,
  closeGroup,
  close,
};
