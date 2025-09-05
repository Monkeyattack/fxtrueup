#!/usr/bin/env node

/**
 * Analyze open time vs close time in MetaStats trades
 * Determine if MetaStats groups by open or close time
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';

async function analyzeOpenVsCloseTime() {
  console.log('⏰ OPEN TIME vs CLOSE TIME ANALYSIS');
  console.log('═'.repeat(70));
  console.log('Checking if MetaStats uses open time or close time for trades...');
  console.log('═'.repeat(70));

  try {
    // Fetch recent trades with detailed information
    console.log('\n🔍 Fetching recent trade details...');
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, 90, 1000);
    
    console.log(`Total trades returned: ${tradeHistory.count || 0}`);
    
    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      // Check what fields are available
      const sampleTrade = tradeHistory.trades[0];
      console.log('\n📋 Available trade fields:');
      console.log(Object.keys(sampleTrade).join(', '));
      
      // Show sample trade with all time fields
      console.log('\n📊 SAMPLE TRADE DATA:');
      console.log(JSON.stringify(sampleTrade, null, 2));
      
      // Analyze trades that might have long durations
      console.log('\n🔄 ANALYZING TRADE DURATIONS');
      console.log('─'.repeat(90));
      
      let tradesWithBothTimes = 0;
      let tradesWithLongDuration = [];
      let crossMonthTrades = [];
      
      tradeHistory.trades.forEach(trade => {
        // Check if we have both open and close times
        if (trade.openTime && trade.closeTime) {
          tradesWithBothTimes++;
          
          const openDate = new Date(trade.openTime);
          const closeDate = new Date(trade.closeTime);
          const durationMs = closeDate - openDate;
          const durationHours = durationMs / (1000 * 60 * 60);
          
          // Find trades held for more than 1 hour
          if (durationHours > 1) {
            tradesWithLongDuration.push({
              ...trade,
              durationHours,
              openDate,
              closeDate
            });
          }
          
          // Find trades that cross month boundaries
          if (openDate.getMonth() !== closeDate.getMonth() || 
              openDate.getFullYear() !== closeDate.getFullYear()) {
            crossMonthTrades.push({
              ...trade,
              openMonth: `${openDate.getFullYear()}-${String(openDate.getMonth() + 1).padStart(2, '0')}`,
              closeMonth: `${closeDate.getFullYear()}-${String(closeDate.getMonth() + 1).padStart(2, '0')}`,
              durationHours
            });
          }
        }
      });
      
      console.log(`\nTrades with both open and close times: ${tradesWithBothTimes}`);
      console.log(`Trades held > 1 hour: ${tradesWithLongDuration.length}`);
      console.log(`Trades crossing month boundaries: ${crossMonthTrades.length}`);
      
      // Show long duration trades
      if (tradesWithLongDuration.length > 0) {
        console.log('\n📈 TRADES WITH LONG DURATION (>1 hour):');
        console.log('─'.repeat(90));
        console.log('Symbol\tOpen Time\t\t\tClose Time\t\t\tDuration\tProfit');
        console.log('─'.repeat(90));
        
        tradesWithLongDuration.slice(0, 10).forEach(trade => {
          console.log(
            `${trade.symbol}\t${trade.openDate.toISOString()}\t${trade.closeDate.toISOString()}\t${trade.durationHours.toFixed(1)}h\t\t$${(trade.profit || 0).toFixed(2)}`
          );
        });
      }
      
      // Show cross-month trades - THESE ARE KEY!
      if (crossMonthTrades.length > 0) {
        console.log('\n⚠️  TRADES CROSSING MONTH BOUNDARIES:');
        console.log('─'.repeat(90));
        console.log('Symbol\tOpen Month\tClose Month\tDuration\tProfit');
        console.log('─'.repeat(90));
        
        crossMonthTrades.forEach(trade => {
          console.log(
            `${trade.symbol}\t${trade.openMonth}\t\t${trade.closeMonth}\t\t${trade.durationHours.toFixed(1)}h\t\t$${(trade.profit || 0).toFixed(2)}`
          );
        });
        
        console.log('\n💡 IMPORTANT: These trades opened in one month but closed in another!');
        console.log('If MetaStats groups by open time, they would count in the opening month.');
        console.log('If MetaStats groups by close time (like CSV), they would count in the closing month.');
      }
      
      // Check specific July/August boundary
      console.log('\n🔍 CHECKING JULY/AUGUST BOUNDARY TRADES');
      console.log('─'.repeat(70));
      
      const julyAugustBoundary = tradeHistory.trades.filter(trade => {
        if (!trade.openTime || !trade.closeTime) return false;
        
        const openDate = new Date(trade.openTime);
        const closeDate = new Date(trade.closeTime);
        
        // Trades opened in July but closed in August
        const openedJulyClosed_August = 
          openDate.getFullYear() === 2025 && 
          openDate.getMonth() === 6 && // July is month 6 (0-indexed)
          closeDate.getFullYear() === 2025 && 
          closeDate.getMonth() === 7; // August is month 7
          
        // Trades opened in late July or early August
        const nearBoundary = 
          (openDate >= new Date('2025-07-30') && openDate <= new Date('2025-08-02')) ||
          (closeDate >= new Date('2025-07-30') && closeDate <= new Date('2025-08-02'));
          
        return openedJulyClosed_August || nearBoundary;
      });
      
      console.log(`Found ${julyAugustBoundary.length} trades near July/August boundary`);
      
      if (julyAugustBoundary.length > 0) {
        console.log('\nBoundary trade details:');
        julyAugustBoundary.forEach((trade, idx) => {
          const openDate = new Date(trade.openTime);
          const closeDate = new Date(trade.closeTime);
          console.log(`\n${idx + 1}. ${trade.symbol}`);
          console.log(`   Opened: ${openDate.toLocaleString()} (${openDate.toDateString()})`);
          console.log(`   Closed: ${closeDate.toLocaleString()} (${closeDate.toDateString()})`);
          console.log(`   Profit: $${(trade.profit || 0).toFixed(2)}`);
        });
      }
      
      // Summary
      console.log('\n📊 SUMMARY');
      console.log('═'.repeat(70));
      console.log('Based on the data structure:');
      console.log(`- Trades have both openTime and closeTime fields`);
      console.log(`- CSV explicitly uses "close_time" for grouping`);
      console.log(`- MetaStats likely uses closeTime to match standard reporting`);
      
      if (crossMonthTrades.length > 0) {
        console.log(`\n⚠️  Found ${crossMonthTrades.length} trades that cross month boundaries`);
        console.log('These trades could cause discrepancies if systems use different time fields');
      }
      
    } else {
      console.log('\n❌ No trade data returned');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

// Run the analysis
analyzeOpenVsCloseTime().catch(console.error);