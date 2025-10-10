#!/usr/bin/env node
/**
 * Rebuild Position Mappings for Orphaned Positions
 *
 * This script identifies orphaned positions (positions without mappings)
 * and attempts to rebuild the mappings by matching them with source positions
 * based on the comment field which contains the source position ID.
 */

import axios from 'axios';
import positionMapper from '../src/services/positionMapper.js';
import { logger } from '../src/utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Direct API client to connection pool
const poolClient = axios.create({
  baseURL: 'http://localhost:8086',
  timeout: 30000
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadRoutingConfig() {
  const configPath = path.join(__dirname, '../routing-config.json');
  const configData = await fs.readFile(configPath, 'utf8');
  return JSON.parse(configData);
}

async function rebuildMappingsForRoute(route, config) {
  const sourceAccountId = route.source;
  const destAccountId = route.destination;
  const sourceNickname = config.accounts[sourceAccountId]?.nickname || sourceAccountId.slice(0, 8);
  const destNickname = config.accounts[destAccountId]?.nickname || destAccountId.slice(0, 8);
  const sourceRegion = config.accounts[sourceAccountId]?.region || 'new-york';
  const destRegion = config.accounts[destAccountId]?.region || 'new-york';

  logger.info(`\n🔍 Checking route: ${sourceNickname} → ${destNickname}`);
  logger.info(`   Route ID: ${route.id}`);
  logger.info(`   Source: ${sourceAccountId}`);
  logger.info(`   Dest: ${destAccountId}`);

  // Get positions directly from pool API
  const sourcePositionsResp = await poolClient.get(`/positions/${sourceAccountId}`, { params: { region: sourceRegion } });
  const sourcePositions = sourcePositionsResp.data.positions || sourcePositionsResp.data || [];

  const destPositionsResp = await poolClient.get(`/positions/${destAccountId}`, { params: { region: destRegion } });
  const destPositions = destPositionsResp.data.positions || destPositionsResp.data || [];

  logger.info(`   Source positions: ${sourcePositions.length}`);
  logger.info(`   Dest positions: ${destPositions.length}`);

  let rebuiltCount = 0;
  let skippedCount = 0;

  // For each destination position
  for (const destPos of destPositions) {
    // Check if mapping already exists
    const existingMapping = await positionMapper.findByDestPosition(destAccountId, destPos.id, [sourceAccountId]);

    if (existingMapping) {
      logger.debug(`   ✓ Mapping exists for dest position ${destPos.id}`);
      skippedCount++;
      continue;
    }

    // No mapping - try to rebuild from comment
    // Comment format: "Copy_{sourcePositionId}_L{sourceVolume*100}"
    if (destPos.comment && destPos.comment.startsWith('Copy_')) {
      const parts = destPos.comment.split('_');
      if (parts.length >= 2) {
        const sourcePositionId = parts[1];

        // Find the source position
        const sourcePos = sourcePositions.find(p => p.id === sourcePositionId);

        if (sourcePos) {
          // Rebuild the mapping
          logger.info(`   🔧 Rebuilding mapping for orphan: ${destPos.id}`);
          logger.info(`      Source: ${sourcePositionId} (${sourcePos.symbol})`);
          logger.info(`      Dest: ${destPos.id} (${destPos.symbol})`);
          logger.info(`      Volume: ${sourcePos.volume} → ${destPos.volume}`);

          await positionMapper.createMapping(sourceAccountId, sourcePositionId, {
            accountId: destAccountId,
            positionId: destPos.id,
            sourceSymbol: sourcePos.symbol,
            destSymbol: destPos.symbol,
            sourceVolume: sourcePos.volume,
            destVolume: destPos.volume,
            openTime: destPos.time,
            sourceOpenPrice: sourcePos.openPrice,
            destOpenPrice: destPos.openPrice
          });

          rebuiltCount++;
        } else {
          logger.warn(`   ⚠️  Source position ${sourcePositionId} not found for dest ${destPos.id} (source may be closed)`);
          logger.warn(`      This is a true orphan that should be manually reviewed`);
        }
      }
    } else {
      logger.warn(`   ⚠️  Dest position ${destPos.id} has no Copy_ comment - cannot rebuild mapping`);
    }
  }

  return { rebuiltCount, skippedCount };
}

async function main() {
  logger.info('🚀 Starting orphaned position mapping rebuild...\n');

  try {
    // Load routing config
    const config = await loadRoutingConfig();

    // Get enabled routes
    const enabledRoutes = config.routes.filter(r => r.enabled);
    logger.info(`Found ${enabledRoutes.length} enabled routes\n`);

    let totalRebuilt = 0;
    let totalSkipped = 0;

    // Process each route
    for (const route of enabledRoutes) {
      try {
        const { rebuiltCount, skippedCount } = await rebuildMappingsForRoute(route, config);
        totalRebuilt += rebuiltCount;
        totalSkipped += skippedCount;
      } catch (error) {
        logger.error(`❌ Error processing route ${route.id}: ${error.message}`);
      }
    }

    logger.info(`\n📊 Summary:`);
    logger.info(`   ✅ Mappings rebuilt: ${totalRebuilt}`);
    logger.info(`   ⏭️  Already existed: ${totalSkipped}`);
    logger.info(`\n✅ Mapping rebuild complete!`);

  } catch (error) {
    logger.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
