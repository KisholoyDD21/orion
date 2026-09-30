#!/usr/bin/env node
import { createApp } from './app.js';
import { loadConfig } from './lib/config.js';
const config = loadConfig();
const app = createApp({ config });
app.start().catch((e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT=<free port> and retry.` : e); process.exit(1); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { console.log(`\n${sig}: shutting down`); await app.stop(); process.exit(0); });
