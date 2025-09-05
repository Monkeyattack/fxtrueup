#!/usr/bin/env node

/**
 * Gold Buy Only Service - Complete Monthly Profit Report
 * Account ID: 58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';
const GOLD_ACCOUNT_INFO = {
  name: "Gold Buy Only Service",
  login: "3052705",
  server: "PlexyTrade-Server01",
  region: "london",
  createdAt: "2025-08-31T22:05:19.712Z"
};
const PROFIT_FEE_RATE = 0.30;

async function generateGoldAccountReport() {
  console.log('🏆 GOLD BUY ONLY SERVICE - COMPLETE MONTHLY PROFIT REPORT');
  console.log('═'.repeat(70));
  console.log(`Account ID: ${GOLD_ACCOUNT_ID}`);
  console.log(`Account Name: ${GOLD_ACCOUNT_INFO.name}`);
  console.log(`Login: ${GOLD_ACCOUNT_INFO.login}`);
  console.log(`Server: ${GOLD_ACCOUNT_INFO.server}`);
  console.log(`Region: ${GOLD_ACCOUNT_INFO.region}`);
  console.log(`Created: ${new Date(GOLD_ACCOUNT_INFO.createdAt).toLocaleDateString()}`);
  console.log(`Profit Fee Rate: ${PROFIT_FEE_RATE * 100}%`);
  console.log('═'.repeat(70));

  try {
    // Fetch MetaStats metrics
    console.log('\n📊 Fetching MetaStats data...');
    const metrics = await poolClient.getAccountMetrics(GOLD_ACCOUNT_ID);
    
    if (metrics && metrics.balance !== undefined) {
      // Calculate actual profit
      const totalProfit = (metrics.balance || 0) - (metrics.deposits || 0);
      
      console.log('\n📈 ACCOUNT OVERVIEW');
      console.log('─'.repeat(50));
      console.log(`Initial Deposit: $${(metrics.deposits || 0).toLocaleString()}`);
      console.log(`Current Balance: $${(metrics.balance || 0).toLocaleString()}`);
      console.log(`Current Equity: $${(metrics.equity || 0).toLocaleString()}`);
      console.log(`Total Profit/Loss: $${totalProfit.toLocaleString()}`);
      console.log(`Total Trades: ${metrics.trades || 0}`);
      console.log(`Winning Trades: ${metrics.wonTrades || 0}`);
      console.log(`Losing Trades: ${metrics.lostTrades || 0}`);
      console.log(`Win Rate: ${metrics.winRate ? (metrics.winRate * 100).toFixed(1) + '%' : 'Calculating...'}`);
      console.log(`Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);
      console.log(`Max Drawdown: ${metrics.maxDrawdownPercent?.toFixed(2) || 'N/A'}%`);
      console.log(`Sharpe Ratio: ${metrics.sharpeRatio?.toFixed(2) || 'N/A'}`);
      
      // Get trade history
      console.log('\n📅 Fetching trade history...');
      const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, 90, 500);
      
      if (tradeHistory.trades && tradeHistory.trades.length > 0) {
        console.log(`Found ${tradeHistory.count} trades`);
        
        // Analyze trades by month
        const monthlyStats = analyzeMonthlyTrades(tradeHistory.trades, metrics.deposits || 0);
        
        console.log('\n💰 MONTHLY PROFIT BREAKDOWN');
        console.log('═'.repeat(80));
        console.log('Month\t\tTrades\tGold\tGross Profit\t30% Fee\t\tNet Profit');
        console.log('─'.repeat(80));
        
        let totalGrossProfit = 0;
        let totalFees = 0;
        let totalGoldProfit = 0;
        let totalGoldTrades = 0;
        
        Object.keys(monthlyStats).sort().forEach(monthKey => {
          const stats = monthlyStats[monthKey];
          const fee = stats.profit > 0 ? stats.profit * PROFIT_FEE_RATE : 0;
          const netProfit = stats.profit - fee;
          
          totalGrossProfit += stats.profit;
          totalFees += fee;
          totalGoldProfit += stats.goldProfit;
          totalGoldTrades += stats.goldTrades;
          
          const monthName = formatMonth(monthKey);
          console.log(`${monthName}\t${stats.count}\t${stats.goldTrades}\t$${stats.profit.toFixed(2).padStart(10)}\t$${fee.toFixed(2).padStart(8)}\t$${netProfit.toFixed(2).padStart(10)}`);
        });
        
        console.log('─'.repeat(80));
        console.log(`TOTAL\t\t${tradeHistory.count}\t${totalGoldTrades}\t$${totalGrossProfit.toFixed(2).padStart(10)}\t$${totalFees.toFixed(2).padStart(8)}\t$${(totalGrossProfit - totalFees).toFixed(2).padStart(10)}`);
        
        // Special focus on gold trades
        if (totalGoldTrades > 0) {
          console.log('\n🏆 GOLD TRADING ANALYSIS (XAUUSD)');
          console.log('─'.repeat(50));
          console.log(`Total Gold Trades: ${totalGoldTrades}`);
          console.log(`Gold Trading Profit: $${totalGoldProfit.toFixed(2)}`);
          console.log(`30% Fee on Gold: $${(totalGoldProfit * PROFIT_FEE_RATE).toFixed(2)}`);
          console.log(`Net Gold Profit: $${(totalGoldProfit * (1 - PROFIT_FEE_RATE)).toFixed(2)}`);
          
          // Show top gold trades
          const goldTrades = tradeHistory.trades
            .filter(t => t.symbol && t.symbol.includes('XAU'))
            .sort((a, b) => (b.profit || 0) - (a.profit || 0))
            .slice(0, 10);
          
          if (goldTrades.length > 0) {
            console.log('\nTop Gold Trades:');
            goldTrades.forEach((trade, idx) => {
              const date = new Date(trade.openTime).toLocaleDateString();
              const profit = trade.profit || 0;
              const profitStr = profit > 0 ? `+$${profit.toFixed(2)}` : `$${profit.toFixed(2)}`;
              console.log(`${idx + 1}. ${trade.symbol} ${trade.type} - ${profitStr} (${date})`);
            });
          }
        }
        
        // August specific analysis (if available)
        const augustStats = monthlyStats['2025-08'];
        if (augustStats) {
          console.log('\n📅 AUGUST 2025 DETAILED ANALYSIS');
          console.log('─'.repeat(50));
          console.log(`August Trades: ${augustStats.count}`);
          console.log(`August Gross Profit: $${augustStats.profit.toFixed(2)}`);
          console.log(`August 30% Fee: $${(augustStats.profit * PROFIT_FEE_RATE).toFixed(2)}`);
          console.log(`August Net Profit: $${(augustStats.profit * (1 - PROFIT_FEE_RATE)).toFixed(2)}`);
          
          if (augustStats.goldTrades > 0) {
            console.log(`Gold Trades in August: ${augustStats.goldTrades}`);
            console.log(`Gold Profit in August: $${augustStats.goldProfit.toFixed(2)}`);
          }
        }
        
        console.log('\n🎯 PROFIT FEE SUMMARY');
        console.log('═'.repeat(50));
        console.log(`Total Gross Profit: $${totalGrossProfit.toFixed(2)}`);
        console.log(`Total 30% Fees: $${totalFees.toFixed(2)}`);
        console.log(`Net Profit After Fees: $${(totalGrossProfit - totalFees).toFixed(2)}`);
        
        if (metrics.deposits > 0) {
          const roi = (totalGrossProfit / metrics.deposits * 100).toFixed(2);
          const netRoi = ((totalGrossProfit - totalFees) / metrics.deposits * 100).toFixed(2);
          console.log(`Return on Investment: ${roi}%`);
          console.log(`Net ROI After Fees: ${netRoi}%`);
        }
        
      } else {
        console.log('\n📈 No trading history available yet.');
        console.log('This account was created today (Aug 31, 2025).');
        console.log('Trades may not have been executed yet or are still syncing.');
      }
      
      // Get current positions
      console.log('\n📍 Current Open Positions:');
      const openTrades = await poolClient.getOpenTrades(GOLD_ACCOUNT_ID);
      if (openTrades.open_trades && openTrades.open_trades.length > 0) {
        console.log(`Found ${openTrades.count} open positions:`);
        openTrades.open_trades.forEach((trade, idx) => {
          const unrealizedPL = trade.unrealizedProfit || trade.profit || 0;
          console.log(`${idx + 1}. ${trade.symbol} ${trade.type} - Volume: ${trade.volume} - Unrealized P/L: $${unrealizedPL.toFixed(2)}`);
        });
      } else {
        console.log('No open positions');
      }
      
      // Risk status
      const riskStatus = await poolClient.getRiskStatus(GOLD_ACCOUNT_ID);
      console.log('\n⚠️  RISK STATUS');
      console.log('─'.repeat(30));
      console.log(`Risk Level: ${riskStatus?.risk_status || 'N/A'}`);
      console.log(`Open Positions: ${riskStatus?.open_positions || 0}`);
      console.log(`Daily Loss: ${riskStatus?.daily_loss_percent?.toFixed(2) || 0}%`);
      console.log(`Current Equity: $${riskStatus?.equity?.toLocaleString() || 'N/A'}`);
      
    } else {
      console.log('\n⚠️  No metrics data available yet.');
      console.log('Possible reasons:');
      console.log('1. MetaStats was just enabled and needs 5-10 minutes to sync');
      console.log('2. The account has no trading activity yet');
      console.log('3. The account needs to be added to the connection pool configuration');
      
      // Try to at least get basic account info
      try {
        const accountInfo = await poolClient.getAccountInfo(GOLD_ACCOUNT_ID, GOLD_ACCOUNT_INFO.region);
        if (accountInfo) {
          console.log('\n📊 Basic Account Info:');
          console.log(`Balance: $${accountInfo.balance?.toLocaleString() || 'N/A'}`);
          console.log(`Equity: $${accountInfo.equity?.toLocaleString() || 'N/A'}`);
          console.log(`Margin: $${accountInfo.margin?.toLocaleString() || 'N/A'}`);
        }
      } catch (e) {
        console.log('\nCould not retrieve basic account info.');
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error generating report:', error.message);
    
    if (error.response?.status === 404) {
      console.log('\n💡 Account not found. This could mean:');
      console.log('1. The account ID needs to be added to meta-trader-hub configuration');
      console.log('2. The account is in London region and the pool needs region-specific config');
      console.log('3. MetaStats is still initializing (wait 5-10 minutes)');
    }
  }
}

function analyzeMonthlyTrades(trades, initialDeposit) {
  const monthlyStats = {};
  
  trades.forEach(trade => {
    // Skip deposit transactions
    if (!trade.openTime || trade.profit === initialDeposit) return;
    
    const date = new Date(trade.openTime);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {
        count: 0,
        profit: 0,
        goldTrades: 0,
        goldProfit: 0,
        trades: []
      };
    }
    
    monthlyStats[monthKey].count++;
    monthlyStats[monthKey].profit += trade.profit || 0;
    monthlyStats[monthKey].trades.push(trade);
    
    // Track gold-specific trades
    if (trade.symbol && (trade.symbol.includes('XAU') || trade.symbol.includes('GOLD'))) {
      monthlyStats[monthKey].goldTrades++;
      monthlyStats[monthKey].goldProfit += trade.profit || 0;
    }
  });
  
  return monthlyStats;
}

function formatMonth(monthKey) {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }).substring(0, 12);
}

// Run the report
generateGoldAccountReport().catch(console.error);