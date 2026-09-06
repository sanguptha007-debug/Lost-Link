/**
 * LostLink — Vercel Serverless Function Entrypoint
 * Routes all API requests directly to the Express application
 */

const app = require('../server/server');

module.exports = app;
