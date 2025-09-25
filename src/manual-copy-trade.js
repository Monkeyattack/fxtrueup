#!/usr/bin/env node

// Manual script to copy current open position from PropFirmKid to Grid

import dotenv from 'dotenv';
import poolClient from './services/poolClient.js';
import { logger } from './utils/logger.js';
import telegram from './utils/telegram.js';

dotenv.config();

const PROP_FIRMKID_EA_ID = '1becc873-1ac2-4dbd-b98d-0d81f1e13a4b';
const GRID_ACCOUNT_ID = '019ec0f0-09f5-4230-a7bd-fa2930af07a4';
const ACCOUNT_MULTIPLIER = 1.18; // $100k -> $118k

async function manualCopyTrade() {
  try {
    console.log('📋 Manual Copy Trade Script');
    console.log(`Source: ${PROP_FIRMKID_EA_ID} (PropFirmKid)`);
    console.log(`Destination: ${GRID_ACCOUNT_ID} (Grid Demo)`);
    console.log('---');

    // Get current positions from source
    const sourcePositions = await poolClient.getPositions(PROP_FIRMKID_EA_ID, 'london');
    console.log(`Found ${sourcePositions.length} open positions on source account`);

    if (sourcePositions.length === 0) {
      console.log('❌ No open positions to copy');
      return;
    }

    // Get destination positions to check for duplicates
    const destPositions = await poolClient.getPositions(GRID_ACCOUNT_ID, 'new-york');
    console.log(`Found ${destPositions.length} open positions on destination account`);

    for (const position of sourcePositions) {
      console.log(`\n📊 Position: ${position.symbol} ${position.type} ${position.volume} lots @ ${position.openPrice}`);
      console.log(`   ID: ${position.id}`);
      console.log(`   SL: ${position.stopLoss || 'None'}, TP: ${position.takeProfit || 'None'}`);

      // Check if already copied (by checking comment)
      const alreadyCopied = destPositions.some(
        pos => pos.comment && pos.comment.includes(position.id)
      );

      if (alreadyCopied) {
        console.log('⚠️  Already copied to destination');
        continue;
      }

      // Calculate destination volume
      const destVolume = Math.round(position.volume * ACCOUNT_MULTIPLIER * 100) / 100;
      console.log(`📐 Calculated volume: ${position.volume} × ${ACCOUNT_MULTIPLIER} = ${destVolume} lots`);

      // Prepare trade data
      const tradeData = {
        symbol: position.symbol,
        action: position.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
        volume: destVolume,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        comment: `ManualCopy_${position.id}`
      };

      console.log('🚀 Executing copy trade...');

      // Execute the trade
      const result = await poolClient.executeTrade(
        GRID_ACCOUNT_ID,
        'new-york',
        tradeData
      );

      if (result.success) {
        console.log(`✅ Trade copied successfully! Order ID: ${result.orderId}`);

        // Send Telegram notification
        await telegram.notifyCopySuccess(position, GRID_ACCOUNT_ID, {
          orderId: result.orderId,
          volume: destVolume
        });
      } else {
        console.log(`❌ Failed to copy trade: ${result.error}`);

        // Send Telegram notification
        await telegram.notifyCopyFailure(position, 'Manual copy failed', result.error);
      }
    }

    console.log('\n✨ Manual copy complete');
  } catch (error) {
    console.error('❌ Error:', error);
    logger.error('Manual copy failed:', error);
  }
}

// Run the manual copy
manualCopyTrade();