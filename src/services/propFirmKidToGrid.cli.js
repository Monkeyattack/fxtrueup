#!/usr/bin/env node

// CLI runner for PropFirmKidEA → Grid Demo filtered copy service

import dotenv from 'dotenv';
import { createPropFirmKidToGridService } from './propFirmKidToGridService.js';

dotenv.config();

async function main() {
  const service = createPropFirmKidToGridService({
    sourceId: process.env.SOURCE_ID,
    destId: process.env.DEST_ID,
    destRegion: process.env.DEST_REGION,
    fixedLotSize: process.env.FIXED_LOT_SIZE ? Number(process.env.FIXED_LOT_SIZE) : undefined,
    maxDailyTrades: process.env.MAX_DAILY_TRADES ? Number(process.env.MAX_DAILY_TRADES) : undefined
  });

  console.log('🔄 Starting PropFirmKidEA → Grid Demo (Filtered Copy)');
  await service.start();
  console.log('✅ Service started');

  // Periodic status logging
  setInterval(() => {
    const stats = service.getStats();
    console.log(`[${new Date().toLocaleTimeString()}] Stats:`, stats);
  }, 30000);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Stopping service...');
    try { service.stop(); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('❌ Failed to start service:', err.message);
  process.exit(1);
});

