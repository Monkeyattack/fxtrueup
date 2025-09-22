#!/usr/bin/env node

// CLI runner for multi-source/multi-destination filtered copy

import dotenv from 'dotenv';
import { createMultiCopyService } from './multiCopyService.js';
import COPY_ROUTES from '../config/copy-routes.js';

dotenv.config();

function parseRoutesFromEnv() {
  const raw = process.env.COPY_ROUTES; // JSON string or empty
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    console.error('Invalid COPY_ROUTES JSON:', e.message);
  }
  return null;
}

async function main() {
  const routes = parseRoutesFromEnv() || COPY_ROUTES;
  if (!routes || routes.length === 0) {
    console.error('No routes configured. Set COPY_ROUTES env var or edit src/config/copy-routes.js');
    process.exit(1);
  }

  console.log('🔄 Starting Multi Copy Service');
  routes.forEach(r => console.log(` - ${r.sourceId} → ${r.destId} (${r.destRegion || 'new-york'})`));

  const service = createMultiCopyService(routes);
  await service.start();
  console.log('✅ Multi Copy Service started');

  // Periodic status
  setInterval(() => {
    const stats = service.getStats();
    console.log(`[${new Date().toLocaleTimeString()}] Route stats:`);
    stats.forEach(({ route, stats }) => {
      console.log(`  ${route.sourceId} → ${route.destId}:`, stats);
    });
  }, 30000);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Stopping Multi Copy Service...');
    try { service.stop(); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('❌ Failed to start:', err.message);
  process.exit(1);
});

