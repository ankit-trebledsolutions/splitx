const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const realtime = require('./realtime/socket');
const aiItineraryService = require('./services/aiItinerary.service');

// How long a shutdown waits for AI jobs to be closed before carrying on regardless.
const AI_ABORT_WAIT_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const start = async () => {
  try {
    await connectDB();
    // AI jobs the previous process was running died with it. Close them now
    // (putting back any itinerary caught mid-replace) rather than leaving their
    // groups locked until somebody opens one.
    await aiItineraryService
      .reapStale()
      .catch((err) => console.error('[ai] could not reap stale jobs:', err.message));

    const server = app.listen(env.port, () => {
      console.log(`Splity API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });
    // Socket.io shares the HTTP server (and port): plain requests go to
    // Express, WebSocket upgrades go to the realtime layer.
    realtime.init(server);

    const shutdown = async (signal) => {
      console.log(`${signal} received, shutting down`);
      // Before the sockets close, so requesters still get the "failed" event
      // instead of watching the planning animation until it times out.
      await Promise.race([
        aiItineraryService
          .abortLocalJobs()
          .catch((err) => console.error('[ai] could not abort running jobs:', err.message)),
        sleep(AI_ABORT_WAIT_MS),
      ]);
      await realtime.close();
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

start();
