#!/usr/bin/env node

/**
 * Fetch all July 31st, 2025 trades from MetaStats
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';

async function getJuly31Trades() {
  console.log('🔍 FETCHING JULY 31ST, 2025 TRADES');
  console.log('═'.repeat(70));
  console.log(`Account ID: ${GOLD_ACCOUNT_ID}`);
  console.log(`Target Date: July 31, 2025`);
  console.log('═'.repeat(70));

  try {
    // Calculate days to fetch - from July 31 to today
    const july31 = new Date('2025-07-31T00:00:00Z');
    const today = new Date();
    const daysSinceJuly31 = Math.ceil((today - july31) / (1000 * 60 * 60 * 24));
    
    console.log(`\nFetching trade history for last ${daysSinceJuly31} days...`);
    
    // Fetch with high limit to ensure we get all trades
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, daysSinceJuly31, 2000);
    
    console.log(`Total trades returned: ${tradeHistory.count || 0}`);
    
    // Filter for July 31st trades only
    const july31Start = new Date('2025-07-31T00:00:00Z');
    const july31End = new Date('2025-07-31T23:59:59Z');
    
    const july31Trades = [];
    if (tradeHistory.trades && Array.isArray(tradeHistory.trades)) {
      tradeHistory.trades.forEach(trade => {
        if (trade.closeTime) {
          const closeDate = new Date(trade.closeTime);
          if (closeDate >= july31Start && closeDate <= july31End) {
            july31Trades.push(trade);
          }
        }
      });
    }
    
    console.log(`\n📊 JULY 31ST TRADES FOUND: ${july31Trades.length}`);
    
    if (july31Trades.length === 0) {
      console.log('\n✅ No trades were executed on July 31st, 2025');
      
      // Find the earliest trade date in the data
      if (tradeHistory.trades && tradeHistory.trades.length > 0) {
        const sortedTrades = tradeHistory.trades
          .filter(t => t.closeTime)
          .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime));
        
        if (sortedTrades.length > 0) {
          const firstTrade = sortedTrades[0];
          const firstTradeDate = new Date(firstTrade.closeTime);
          console.log(`\n📅 First trade in account history:`);
          console.log(`   Date: ${firstTradeDate.toLocaleDateString()}`);
          console.log(`   Time: ${firstTradeDate.toLocaleTimeString()}`);
          console.log(`   UTC: ${firstTradeDate.toISOString()}`);
          console.log(`   Symbol: ${firstTrade.symbol}`);
          console.log(`   Volume: ${firstTrade.volume} lots`);
          console.log(`   Profit: $${firstTrade.profit?.toFixed(2) || 0}`);
        }
      }
    } else {
      // Display all July 31st trades
      console.log('\n📋 JULY 31ST TRADE DETAILS:');
      console.log('─'.repeat(90));
      console.log('Time (UTC)\t\t\tSymbol\tVolume\tType\tProfit\t\tSwap');
      console.log('─'.repeat(90));
      
      let totalProfit = 0;
      let totalVolume = 0;
      let totalSwap = 0;
      
      july31Trades.forEach((trade, idx) => {
        const closeTime = new Date(trade.closeTime);
        const profit = trade.profit || 0;
        const volume = trade.volume || 0;
        const swap = trade.swap || 0;
        
        totalProfit += profit;
        totalVolume += volume;
        totalSwap += swap;
        
        console.log(
          `${closeTime.toISOString()}\t${trade.symbol || 'N/A'}\t${volume.toFixed(2)}\t${trade.type || 'N/A'}\t$${profit.toFixed(2).padStart(8)}\t$${swap.toFixed(2).padStart(8)}`
        );
      });
      
      console.log('─'.repeat(90));
      console.log(`TOTAL\t\t\t\t\t${totalVolume.toFixed(2)}\t\t$${totalProfit.toFixed(2).padStart(8)}\t$${totalSwap.toFixed(2).padStart(8)}`);
      
      // Time analysis
      console.log('\n⏰ TIME ANALYSIS:');
      const timeRanges = {};
      july31Trades.forEach(trade => {
        const hour = new Date(trade.closeTime).getUTCHours();
        timeRanges[hour] = (timeRanges[hour] || 0) + 1;
      });
      
      console.log('Trades by hour (UTC):');
      Object.keys(timeRanges).sort((a, b) => a - b).forEach(hour => {
        console.log(`  ${hour}:00 - ${hour}:59 : ${timeRanges[hour]} trades`);
      });
    }
    
    // Also check for trades near the boundary
    console.log('\n🔄 CHECKING BOUNDARY TRADES (July 30 - August 1)');
    console.log('─'.repeat(50));
    
    // Get last 5 trades of July 30
    const july30End = new Date('2025-07-30T20:00:00Z');
    const july30Trades = tradeHistory.trades.filter(trade => {
      if (!trade.closeTime) return false;
      const closeDate = new Date(trade.closeTime);
      return closeDate >= july30End && closeDate < july31Start;
    });
    
    if (july30Trades.length > 0) {
      console.log(`\nLast trades of July 30:`);
      july30Trades.slice(-5).forEach(trade => {
        console.log(`  ${new Date(trade.closeTime).toISOString()} - ${trade.symbol} - $${trade.profit?.toFixed(2) || 0}`);
      });
    }
    
    // Get first 5 trades of August 1
    const august1Start = new Date('2025-08-01T00:00:00Z');
    const august1End = new Date('2025-08-01T04:00:00Z');
    const earlyAugust1Trades = tradeHistory.trades.filter(trade => {
      if (!trade.closeTime) return false;
      const closeDate = new Date(trade.closeTime);
      return closeDate >= august1Start && closeDate <= august1End;
    }).slice(0, 5);
    
    if (earlyAugust1Trades.length > 0) {
      console.log(`\nFirst trades of August 1:`);
      earlyAugust1Trades.forEach(trade => {
        console.log(`  ${new Date(trade.closeTime).toISOString()} - ${trade.symbol} - $${trade.profit?.toFixed(2) || 0}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Error fetching trades:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Run the script
getJuly31Trades().catch(console.error);