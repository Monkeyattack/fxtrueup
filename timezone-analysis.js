#!/usr/bin/env node

/**
 * Timezone Analysis - Compare CSV and MetaAPI timestamps
 * Check if "missing" trades are due to timezone differences
 */

import fs from 'fs';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const CSV_FILE_PATH = '/home/claude-dev/repos/meta-trader-hub/account_data/Gold-Buy-Only-August2025-trade_history.csv';
const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';

async function analyzeTimezones() {
  console.log('🕐 TIMEZONE ANALYSIS - CSV vs MetaAPI');
  console.log('═'.repeat(70));
  
  try {
    // 1. Load CSV trades
    console.log('\n📄 Loading CSV trades...');
    const csvTrades = await loadCSVTrades();
    
    // 2. Analyze CSV timestamps
    console.log('\n📊 CSV TIMESTAMP ANALYSIS');
    console.log('─'.repeat(50));
    
    // Group CSV trades by date
    const csvByDate = {};
    csvTrades.forEach(trade => {
      const localDate = trade.closeTime.toLocaleDateString();
      const utcDate = trade.closeTime.toISOString().split('T')[0];
      
      if (!csvByDate[localDate]) {
        csvByDate[localDate] = {
          count: 0,
          firstTime: trade.closeTime,
          lastTime: trade.closeTime,
          utcDate: utcDate
        };
      }
      csvByDate[localDate].count++;
      if (trade.closeTime < csvByDate[localDate].firstTime) {
        csvByDate[localDate].firstTime = trade.closeTime;
      }
      if (trade.closeTime > csvByDate[localDate].lastTime) {
        csvByDate[localDate].lastTime = trade.closeTime;
      }
    });
    
    console.log('CSV Trades by Local Date:');
    Object.keys(csvByDate).sort().forEach(date => {
      const data = csvByDate[date];
      console.log(`${date}: ${data.count} trades`);
      console.log(`  First: ${data.firstTime.toLocaleString()} (UTC: ${data.firstTime.toISOString()})`);
      console.log(`  Last: ${data.lastTime.toLocaleString()} (UTC: ${data.lastTime.toISOString()})`);
      console.log(`  UTC Date: ${data.utcDate}`);
    });
    
    // 3. Get MetaAPI trades for a wider date range
    console.log('\n🌐 Fetching MetaAPI trades (including July 31)...');
    const july31 = new Date('2025-07-31');
    const today = new Date();
    const daysSinceJuly31 = Math.ceil((today - july31) / (1000 * 60 * 60 * 24));
    
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, daysSinceJuly31, 1000);
    
    // Filter for July 31 - August 31
    const july31Date = new Date('2025-07-31T00:00:00Z');
    const august31Date = new Date('2025-08-31T23:59:59Z');
    
    const relevantTrades = tradeHistory.trades.filter(trade => {
      if (!trade.closeTime) return false;
      const closeDate = new Date(trade.closeTime);
      return closeDate >= july31Date && closeDate <= august31Date;
    });
    
    console.log(`\nTotal trades from July 31 - August 31: ${relevantTrades.length}`);
    
    // Group MetaAPI trades by UTC date
    const apiByDate = {};
    relevantTrades.forEach(trade => {
      const closeDate = new Date(trade.closeTime);
      const utcDate = closeDate.toISOString().split('T')[0];
      const localDate = closeDate.toLocaleDateString();
      
      if (!apiByDate[utcDate]) {
        apiByDate[utcDate] = {
          count: 0,
          trades: [],
          localDates: new Set()
        };
      }
      apiByDate[utcDate].count++;
      apiByDate[utcDate].trades.push(trade);
      apiByDate[utcDate].localDates.add(localDate);
    });
    
    console.log('\n📈 METAAPI TRADES BY UTC DATE');
    console.log('─'.repeat(50));
    Object.keys(apiByDate).sort().forEach(utcDate => {
      const data = apiByDate[utcDate];
      console.log(`${utcDate}: ${data.count} trades`);
      console.log(`  Local dates: ${Array.from(data.localDates).join(', ')}`);
      
      // Show first and last trade times
      if (data.trades.length > 0) {
        const firstTrade = data.trades[0];
        const lastTrade = data.trades[data.trades.length - 1];
        console.log(`  First: ${new Date(firstTrade.closeTime).toISOString()}`);
        console.log(`  Last: ${new Date(lastTrade.closeTime).toISOString()}`);
      }
    });
    
    // 4. Check for July 31 trades in MetaAPI
    const july31Trades = apiByDate['2025-07-31'] || { count: 0, trades: [] };
    console.log(`\n⚠️  JULY 31st TRADES IN METAAPI: ${july31Trades.count}`);
    
    if (july31Trades.count > 0) {
      console.log('\nJuly 31st trades details:');
      july31Trades.trades.slice(0, 10).forEach((trade, idx) => {
        const closeTime = new Date(trade.closeTime);
        console.log(`${idx + 1}. ${closeTime.toISOString()} - ${trade.volume} lots - P/L: $${trade.profit?.toFixed(2)}`);
      });
    }
    
    // 5. Find the missing August 1st trades from CSV
    console.log('\n🔍 ANALYZING "MISSING" AUGUST 1st TRADES');
    console.log('─'.repeat(50));
    
    // Get earliest August 1st trade from MetaAPI
    const august1Trades = relevantTrades.filter(t => {
      const date = new Date(t.closeTime);
      return date.toISOString().startsWith('2025-08-01');
    }).sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime));
    
    if (august1Trades.length > 0) {
      const firstMetaAPITrade = august1Trades[0];
      console.log(`\nFirst MetaAPI August 1st trade: ${new Date(firstMetaAPITrade.closeTime).toISOString()}`);
      
      // Find CSV trades before this time
      const csvAugust1 = csvTrades.filter(t => 
        t.closeTime.toLocaleDateString() === '8/1/2025'
      ).sort((a, b) => a.closeTime - b.closeTime);
      
      const missingFromAPI = csvAugust1.filter(t => 
        t.closeTime < new Date(firstMetaAPITrade.closeTime)
      );
      
      console.log(`\nCSV trades before first MetaAPI trade: ${missingFromAPI.length}`);
      if (missingFromAPI.length > 0) {
        console.log('\nFirst 10 "missing" trades:');
        missingFromAPI.slice(0, 10).forEach((trade, idx) => {
          console.log(`${idx + 1}. ${trade.closeTime.toLocaleString()} (UTC: ${trade.closeTime.toISOString()}) - ${trade.volume} lots - P/L: $${trade.profit.toFixed(2)}`);
        });
        
        // Check if these times would be July 31st in a different timezone
        console.log('\n🌍 TIMEZONE CONVERSION CHECK');
        console.log('If CSV times are in broker timezone (possibly UTC+3 for MetaTrader):');
        missingFromAPI.slice(0, 5).forEach((trade, idx) => {
          // Assuming CSV might be in UTC+3 (common for MT4/MT5 brokers)
          const possibleUTC = new Date(trade.closeTime.getTime() - (3 * 60 * 60 * 1000));
          console.log(`${idx + 1}. CSV: ${trade.closeTime.toLocaleString()} → UTC: ${possibleUTC.toISOString()}`);
          console.log(`   Would be: ${possibleUTC.toISOString().split('T')[0]}`);
        });
      }
    }
    
    // 6. Summary
    console.log('\n📊 SUMMARY');
    console.log('═'.repeat(70));
    console.log(`CSV Total Trades: ${csvTrades.length}`);
    console.log(`MetaAPI August Trades: ${relevantTrades.filter(t => new Date(t.closeTime).toISOString().startsWith('2025-08')).length}`);
    console.log(`MetaAPI July 31 Trades: ${july31Trades.count}`);
    console.log(`\n💡 Likely Explanation:`);
    console.log('The CSV export might be using broker server time (e.g., UTC+3),');
    console.log('while MetaAPI returns times in UTC. This would cause early morning');
    console.log('trades on August 1st (broker time) to appear as July 31st in UTC.');
    
    // Calculate the potential match
    const totalMetaAPITrades = july31Trades.count + relevantTrades.filter(t => 
      new Date(t.closeTime).toISOString().startsWith('2025-08')
    ).length;
    
    console.log(`\nIf we include July 31st trades:`);
    console.log(`MetaAPI Total: ${totalMetaAPITrades} trades`);
    console.log(`Difference from CSV: ${csvTrades.length - totalMetaAPITrades} trades`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function loadCSVTrades() {
  const trades = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on('data', (row) => {
        trades.push({
          order: row.order,
          closeTime: new Date(row.close_time),
          volume: parseFloat(row.true_volume),
          profit: parseFloat(row.true_profit),
          storage: parseFloat(row.storage)
        });
      })
      .on('end', () => resolve(trades))
      .on('error', reject);
  });
}

// Run the analysis
analyzeTimezones().catch(console.error);