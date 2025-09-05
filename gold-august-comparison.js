#!/usr/bin/env node

/**
 * Gold Buy Only Service - August 2025 Specific Comparison
 * Fetches MetaStats data for August only and compares with CSV
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';
const PROFIT_FEE_RATE = 0.30;

async function getAugustOnlyReport() {
  console.log('🏆 GOLD BUY ONLY SERVICE - AUGUST 2025 COMPARISON');
  console.log('═'.repeat(70));
  console.log(`Account ID: ${GOLD_ACCOUNT_ID}`);
  console.log(`Login: 3052705`);
  console.log(`Period: August 2025 Only`);
  console.log('═'.repeat(70));

  try {
    // First get the account metrics
    console.log('\n📊 Fetching account overview...');
    const metrics = await poolClient.getAccountMetrics(GOLD_ACCOUNT_ID);
    
    if (metrics) {
      console.log(`Current Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
      console.log(`Total Trades (All Time): ${metrics.trades || 0}`);
      console.log(`Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);
    }

    // Get trade history specifically for August 2025
    console.log('\n🔍 Fetching August 2025 trades from MetaAPI...');
    
    // Calculate days since August 1, 2025
    const august1 = new Date('2025-08-01');
    const august31 = new Date('2025-08-31T23:59:59');
    const today = new Date();
    const daysSinceAugust1 = Math.ceil((today - august1) / (1000 * 60 * 60 * 24));
    
    // Fetch trades with enough history to cover August
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, daysSinceAugust1, 1000);
    
    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      // Filter for August 2025 trades only
      const augustTrades = tradeHistory.trades.filter(trade => {
        if (!trade.closeTime) return false;
        const closeDate = new Date(trade.closeTime);
        return closeDate >= august1 && closeDate <= august31;
      });

      console.log(`\nFound ${augustTrades.length} trades in August 2025`);
      
      // Calculate August statistics
      let augustProfit = 0;
      let augustVolume = 0;
      let augustWins = 0;
      let augustLosses = 0;
      let augustStorage = 0;
      let augustCommission = 0;
      
      // Analyze each trade
      const dailyBreakdown = {};
      
      augustTrades.forEach(trade => {
        const profit = trade.profit || 0;
        const volume = trade.volume || 0;
        const storage = trade.swap || 0;
        const commission = trade.commission || 0;
        
        augustProfit += profit;
        augustVolume += volume;
        augustStorage += storage;
        augustCommission += commission;
        
        if (profit > 0) augustWins++;
        else if (profit < 0) augustLosses++;
        
        // Daily breakdown
        const dateKey = new Date(trade.closeTime).toLocaleDateString();
        if (!dailyBreakdown[dateKey]) {
          dailyBreakdown[dateKey] = {
            trades: 0,
            profit: 0,
            volume: 0
          };
        }
        dailyBreakdown[dateKey].trades++;
        dailyBreakdown[dateKey].profit += profit;
        dailyBreakdown[dateKey].volume += volume;
      });
      
      const augustWinRate = augustTrades.length > 0 ? (augustWins / augustTrades.length * 100) : 0;
      const augustFee = augustProfit > 0 ? augustProfit * PROFIT_FEE_RATE : 0;
      
      console.log('\n📈 METAAPI AUGUST 2025 RESULTS');
      console.log('─'.repeat(50));
      console.log(`Total Trades: ${augustTrades.length}`);
      console.log(`Total Volume: ${augustVolume.toFixed(2)} lots`);
      console.log(`Winning Trades: ${augustWins}`);
      console.log(`Losing Trades: ${augustLosses}`);
      console.log(`Win Rate: ${augustWinRate.toFixed(1)}%`);
      console.log(`Gross Profit: $${augustProfit.toFixed(2)}`);
      console.log(`Storage/Swap: $${augustStorage.toFixed(2)}`);
      console.log(`Commission: $${augustCommission.toFixed(2)}`);
      console.log(`30% Performance Fee: $${augustFee.toFixed(2)}`);
      console.log(`Net Profit: $${(augustProfit - augustFee).toFixed(2)}`);
      
      console.log('\n📊 CSV AUGUST 2025 RESULTS (For Comparison)');
      console.log('─'.repeat(50));
      console.log('Total Trades: 197');
      console.log('Total Volume: 2.16 lots');
      console.log('Winning Trades: 147');
      console.log('Losing Trades: 50');
      console.log('Win Rate: 74.6%');
      console.log('Gross Profit: $1,297.28');
      console.log('Storage Fees: -$198.88');
      console.log('30% Performance Fee: $389.18');
      console.log('Net Profit: $908.10');
      
      console.log('\n🔄 COMPARISON ANALYSIS');
      console.log('─'.repeat(50));
      console.log(`Trade Count Difference: ${197 - augustTrades.length} (CSV shows ${197 - augustTrades.length} more trades)`);
      console.log(`Profit Difference: $${(1297.28 - augustProfit).toFixed(2)} (CSV shows $${(1297.28 - augustProfit).toFixed(2)} more profit)`);
      console.log(`Volume Difference: ${(2.16 - augustVolume).toFixed(2)} lots`);
      
      // Show daily breakdown from MetaAPI
      console.log('\n📅 METAAPI DAILY BREAKDOWN (August 2025)');
      console.log('─'.repeat(50));
      Object.keys(dailyBreakdown).sort().forEach(date => {
        const data = dailyBreakdown[date];
        console.log(`${date}: ${data.trades} trades, ${data.volume.toFixed(2)} lots, P/L: $${data.profit.toFixed(2)}`);
      });
      
      // Get daily growth data for more detailed analysis
      console.log('\n📊 Fetching daily growth data for August...');
      const dailyGrowth = await poolClient.getDailyGrowth(GOLD_ACCOUNT_ID, daysSinceAugust1);
      
      if (dailyGrowth.growth && dailyGrowth.growth.length > 0) {
        const augustGrowth = dailyGrowth.growth.filter(point => {
          if (!point.date) return false;
          const date = new Date(point.date);
          return date >= august1 && date <= august31;
        });
        
        if (augustGrowth.length > 0) {
          console.log(`\nFound ${augustGrowth.length} daily growth data points for August`);
          
          const firstBalance = augustGrowth[0].balance || 0;
          const lastBalance = augustGrowth[augustGrowth.length - 1].balance || 0;
          const monthlyGrowth = lastBalance - firstBalance;
          
          console.log(`\n💰 BALANCE GROWTH (MetaStats Daily Data)`);
          console.log(`August 1 Balance: $${firstBalance.toFixed(2)}`);
          console.log(`August 31 Balance: $${lastBalance.toFixed(2)}`);
          console.log(`Monthly Growth: $${monthlyGrowth.toFixed(2)}`);
          console.log(`Growth %: ${((monthlyGrowth / firstBalance) * 100).toFixed(2)}%`);
        }
      }
      
    } else {
      console.log('\n⚠️  No trade history available from MetaAPI');
    }
    
  } catch (error) {
    console.error('\n❌ Error fetching data:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the comparison
getAugustOnlyReport().catch(console.error);