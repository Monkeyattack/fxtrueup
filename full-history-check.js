#!/usr/bin/env node

/**
 * Fetch full trading history to see all months
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';

async function getFullHistory() {
  console.log('📊 FETCHING FULL TRADING HISTORY');
  console.log('═'.repeat(70));
  console.log(`Account ID: ${GOLD_ACCOUNT_ID}`);
  console.log('═'.repeat(70));

  try {
    // Get account metrics first
    console.log('\n📈 Account Metrics:');
    const metrics = await poolClient.getAccountMetrics(GOLD_ACCOUNT_ID);
    console.log(`Total Trades (All Time): ${metrics.trades || 0}`);
    console.log(`Current Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
    console.log(`Initial Deposit: $${metrics.deposits?.toLocaleString() || 'N/A'}`);
    
    // Try to fetch 365 days of history
    console.log('\n🔍 Fetching 365 days of trade history...');
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, 365, 5000);
    
    console.log(`Trades returned: ${tradeHistory.count || 0}`);
    
    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      // Group trades by month
      const tradesByMonth = {};
      
      tradeHistory.trades.forEach(trade => {
        if (trade.closeTime) {
          const date = new Date(trade.closeTime);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          
          if (!tradesByMonth[monthKey]) {
            tradesByMonth[monthKey] = {
              count: 0,
              volume: 0,
              profit: 0,
              firstTrade: date,
              lastTrade: date
            };
          }
          
          tradesByMonth[monthKey].count++;
          tradesByMonth[monthKey].volume += (trade.volume || 0);
          tradesByMonth[monthKey].profit += (trade.profit || 0);
          
          if (date < tradesByMonth[monthKey].firstTrade) {
            tradesByMonth[monthKey].firstTrade = date;
          }
          if (date > tradesByMonth[monthKey].lastTrade) {
            tradesByMonth[monthKey].lastTrade = date;
          }
        }
      });
      
      console.log('\n📅 TRADING HISTORY BY MONTH:');
      console.log('═'.repeat(80));
      console.log('Month\t\tTrades\tVolume\t\tProfit\t\tFirst Trade\t\tLast Trade');
      console.log('─'.repeat(80));
      
      const sortedMonths = Object.keys(tradesByMonth).sort();
      let totalTrades = 0;
      let totalVolume = 0;
      let totalProfit = 0;
      
      sortedMonths.forEach(month => {
        const data = tradesByMonth[month];
        totalTrades += data.count;
        totalVolume += data.volume;
        totalProfit += data.profit;
        
        const monthName = new Date(month + '-01').toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short' 
        });
        
        console.log(
          `${monthName}\t\t${data.count}\t${data.volume.toFixed(2)}\t\t$${data.profit.toFixed(2).padStart(8)}\t${data.firstTrade.toLocaleDateString()}\t\t${data.lastTrade.toLocaleDateString()}`
        );
      });
      
      console.log('─'.repeat(80));
      console.log(`TOTAL\t\t${totalTrades}\t${totalVolume.toFixed(2)}\t\t$${totalProfit.toFixed(2).padStart(8)}`);
      console.log('═'.repeat(80));
      
      // Find actual first and last trade
      const sortedTrades = tradeHistory.trades
        .filter(t => t.closeTime)
        .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime));
      
      if (sortedTrades.length > 0) {
        const firstTrade = sortedTrades[0];
        const lastTrade = sortedTrades[sortedTrades.length - 1];
        
        console.log('\n📌 ACCOUNT TRADING SPAN:');
        console.log(`First Trade: ${new Date(firstTrade.closeTime).toLocaleString()} - ${firstTrade.symbol} - $${firstTrade.profit?.toFixed(2) || 0}`);
        console.log(`Last Trade: ${new Date(lastTrade.closeTime).toLocaleString()} - ${lastTrade.symbol} - $${lastTrade.profit?.toFixed(2) || 0}`);
        console.log(`Total Trading Days: ${Math.ceil((new Date(lastTrade.closeTime) - new Date(firstTrade.closeTime)) / (1000 * 60 * 60 * 24))}`);
      }
      
      // Check July specifically
      const julyTrades = tradesByMonth['2025-07'] || null;
      if (julyTrades) {
        console.log('\n🔍 JULY 2025 DETAILS:');
        console.log(`Total July Trades: ${julyTrades.count}`);
        console.log(`July Profit: $${julyTrades.profit.toFixed(2)}`);
        console.log(`July Volume: ${julyTrades.volume.toFixed(2)} lots`);
      } else {
        console.log('\n⚠️  No July 2025 trades found in the data');
      }
      
    } else {
      console.log('\n❌ No trade history returned');
    }
    
    // Also try daily growth to see historical data
    console.log('\n📊 Fetching daily growth data for 365 days...');
    const dailyGrowth = await poolClient.getDailyGrowth(GOLD_ACCOUNT_ID, 365);
    
    if (dailyGrowth.growth && dailyGrowth.growth.length > 0) {
      console.log(`Daily growth data points: ${dailyGrowth.growth.length}`);
      
      const firstGrowth = dailyGrowth.growth[0];
      const lastGrowth = dailyGrowth.growth[dailyGrowth.growth.length - 1];
      
      console.log(`\nGrowth data span:`);
      console.log(`First: ${new Date(firstGrowth.date).toLocaleDateString()} - Balance: $${firstGrowth.balance?.toFixed(2) || 0}`);
      console.log(`Last: ${new Date(lastGrowth.date).toLocaleDateString()} - Balance: $${lastGrowth.balance?.toFixed(2) || 0}`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Run the script
getFullHistory().catch(console.error);