const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const realtime = require('./realtime/socket');

const start = async () => {
  try {
    await connectDB();
    const server = app.listen(env.port, () => {
      console.log(`Splity API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });
    // Socket.io shares the HTTP server (and port): plain requests go to
    // Express, WebSocket upgrades go to the realtime layer.
    realtime.init(server);

    const shutdown = async (signal) => {
      console.log(`${signal} received, shutting down`);
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
