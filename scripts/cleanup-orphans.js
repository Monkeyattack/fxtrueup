#!/usr/bin/env node

/**
 * CLI Script to scan and clean up orphaned positions
 * Usage:
 *   node scripts/cleanup-orphans.js --scan             # Just scan and report
 *   node scripts/cleanup-orphans.js --clean            # Scan and close orphans
 *   node scripts/cleanup-orphans.js --route route_001  # Scan specific route
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import orphanedPositionCleaner from '../src/utils/orphanedPositionCleaner.js';
import { logger } from '../src/utils/logger.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadRoutingConfig() {
  const configPath = path.join(__dirname, '../src/config/routing-config.json');
  const data = await fs.readFile(configPath, 'utf8');
  return JSON.parse(data);
}

async function main() {
  const args = process.argv.slice(2);
  const scanOnly = args.includes('--scan');
  const autoClose = args.includes('--clean');
  const routeArg = args.find(arg => arg.startsWith('--route='));
  const specificRoute = routeArg ? routeArg.split('=')[1] : null;

  console.log('🔍 FX True Up - Orphaned Position Cleaner\n');

  // Load configuration
  const config = await loadRoutingConfig();

  let routesToScan = config.routes.filter(r => r.enabled);

  if (specificRoute) {
    routesToScan = routesToScan.filter(r => r.id === specificRoute);
    if (routesToScan.length === 0) {
      console.error(`❌ Route ${specificRoute} not found or not enabled`);
      process.exit(1);
    }
  }

  console.log(`📊 Scanning ${routesToScan.length} route(s)...\n`);

  if (specificRoute) {
    // Scan specific route
    const route = routesToScan[0];
    console.log(`Route: ${route.name} (${route.id})`);
    console.log(`  ${route.source.slice(0, 8)} → ${route.destination.slice(0, 8)}\n`);

    const orphans = await orphanedPositionCleaner.findOrphanedPositions(
      route.source,
      route.destination
    );

    if (orphans.length === 0) {
      console.log('✅ No orphaned positions found');
      process.exit(0);
    }

    console.log(`⚠️ Found ${orphans.length} orphaned position(s):\n`);

    orphans.forEach((o, i) => {
      console.log(`${i + 1}. Position ${o.position.id}`);
      console.log(`   Symbol: ${o.position.symbol}`);
      console.log(`   Volume: ${o.position.volume} lots`);
      console.log(`   P&L: ${o.position.profit || 0}`);
      console.log(`   Reason: ${o.reason}`);
      console.log(`   Open Time: ${o.position.time}`);
      console.log('');
    });

    if (autoClose) {
      console.log('🔴 Closing orphaned positions...\n');
      let closed = 0;
      let failed = 0;

      for (const orphan of orphans) {
        const result = await orphanedPositionCleaner.closeOrphanedPosition(orphan);
        if (result.success) {
          closed++;
          console.log(`✅ Closed position ${orphan.position.id}`);
        } else {
          failed++;
          console.log(`❌ Failed to close position ${orphan.position.id}: ${result.error}`);
        }
      }

      console.log(`\n🎯 Results: ${closed} closed, ${failed} failed`);
    } else {
      console.log('ℹ️ Run with --clean to close these positions');
    }
  } else {
    // Scan all routes
    const result = await orphanedPositionCleaner.cleanupAllOrphans(config, autoClose);

    if (result.orphans.length === 0) {
      console.log('✅ No orphaned positions found');
    } else {
      console.log('\n📊 Orphaned Positions Report:');
      console.table(result.orphans);

      if (autoClose) {
        console.log(`\n🎯 Cleanup Results: ${result.cleaned} closed, ${result.failed} failed`);
      } else {
        console.log('\nℹ️ Run with --clean to close these positions');
      }
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
