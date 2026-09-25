/**
 * Starts the API against a LOCAL database, whatever backend/.env says.
 *
 *   npm run dev:local
 *
 * Why it exists: .env points at the live Atlas cluster, and the admin panel has
 * Suspend and Delete buttons. Plain `npm run dev` therefore aims a tool that
 * can remove accounts at production, which is a bad default to have one
 * forgotten flag away. This pins the local database instead.
 *
 * A wrapper rather than an inline `VAR=value nodemon`, because npm scripts run
 * through cmd.exe on Windows, where that syntax is not a thing. Anything you
 * export yourself still wins, so pointing it somewhere else stays possible:
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/other npm run dev:local
 */
const { spawn } = require('child_process');
const path = require('path');

const env = {
  ...process.env,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/splitx_dev',
  ADMIN_ORIGINS: process.env.ADMIN_ORIGINS || 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Uploads would otherwise go to the real Cloudinary account from .env. With
  // these blank the API falls back to the local uploads folder (see config/env).
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
};

console.log(`[dev:local] database  : ${env.MONGODB_URI}`);
console.log(`[dev:local] admin from: ${env.ADMIN_ORIGINS}`);

// Resolved through require so it works regardless of how npm lays out .bin.
const nodemon = require.resolve('nodemon/bin/nodemon.js');
const server = path.join(__dirname, '..', 'src', 'server.js');

const child = spawn(process.execPath, [nodemon, server], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
