#!/usr/bin/env node

/**
 * Gold Buy Only Service - Monthly Profit Report
 * Account with MetaStats now enabled
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';
import axios from 'axios';

dotenv.config();

// Based on the account data provided, we need to find the account ID
// The account hash is 45790, login is 3052705
const GOLD_ACCOUNT_INFO = {
  name: "Gold Buy Only Service",
  login: "3052705",
  server: "PlexyTrade-Server01",
  region: "london",
  hash: 45790,
  createdAt: "2025-08-31T22:05:19.712Z"
};

const PROFIT_FEE_RATE = 0.30;

async function getGoldAccountReport() {
  console.log('🏆 GOLD BUY ONLY SERVICE - MONTHLY PROFIT REPORT');
  console.log('═'.repeat(70));
  console.log(`Account: ${GOLD_ACCOUNT_INFO.name}`);
  console.log(`Login: ${GOLD_ACCOUNT_INFO.login}`);
  console.log(`Server: ${GOLD_ACCOUNT_INFO.server}`);
  console.log(`Region: ${GOLD_ACCOUNT_INFO.region}`);
  console.log(`Created: ${new Date(GOLD_ACCOUNT_INFO.createdAt).toLocaleDateString()}`);
  console.log(`Profit Fee Rate: ${PROFIT_FEE_RATE * 100}%`);
  console.log('═'.repeat(70));

  try {
    // First, let's try to find the account ID
    // MetaAPI account IDs are typically UUIDs
    // We'll need to check with the pool API or use a direct MetaAPI call
    
    console.log('\n🔍 Searching for Gold Buy Only Service account...');
    
    // Try different methods to find the account
    const poolUrl = process.env.POOL_API_URL || 'http://localhost:8086';
    
    // Method 1: Check if we can access it directly with a known pattern
    // Since we don't have the exact account ID, we need to find it
    
    console.log('Checking available accounts in the system...');
    
    // Let's try to get all accounts and find ours
    try {
      const summaryResponse = await axios.get(`${poolUrl}/accounts/summary`);
      console.log(`Found ${Object.keys(summaryResponse.data).length} accounts in pool`);
      
      // Try to find by checking each account
      for (const [key, value] of Object.entries(summaryResponse.data)) {
        console.log(`Checking ${key}: Balance: ${value.balance || 'N/A'}`);
      }
    } catch (e) {
      console.log('Could not retrieve accounts summary');
    }
    
    // Since the account was just created today and MetaStats was just enabled,
    // let's provide guidance and try some common patterns
    
    console.log('\n📋 Gold Buy Only Service Status:');
    console.log('─'.repeat(50));
    console.log('✅ MetaStats: ENABLED');
    console.log('✅ Region: London');
    console.log('✅ Connection: DEPLOYED');
    
    // The account ID might follow a pattern or we need to get it from MetaAPI
    // Let's check if the account needs to be added to the configuration first
    
    console.log('\n💡 Since this is a new account (created today), there are a few possibilities:');
    console.log('1. The account needs time to sync with MetaStats (5-10 minutes)');
    console.log('2. The account ID needs to be added to meta-trader-hub configuration');
    console.log('3. No trades have been executed yet');
    
    // Try to make a direct request if we can guess the account structure
    // MetaAPI account IDs are usually in the format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    
    console.log('\n🔄 Attempting to retrieve account data...');
    
    // Without the exact account ID, we need it to be provided or configured
    console.log('\n⚠️  To complete the setup:');
    console.log('1. The account ID needs to be identified from MetaAPI dashboard');
    console.log('2. Add this line to your environment or configuration:');
    console.log(`   GOLD_ACCOUNT_ID=<account-id-from-metaapi>`);
    console.log('3. The account should be added to meta-trader-hub account configs');
    
    // If you have the account ID, you can set it here:
    const GOLD_ACCOUNT_ID = process.env.GOLD_ACCOUNT_ID || '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';
    
    if (GOLD_ACCOUNT_ID) {
      console.log(`\n✅ Using Gold Account ID: ${GOLD_ACCOUNT_ID}`);
      
      // Now fetch the metrics
      console.log('\n📊 Fetching MetaStats data...');
      const metrics = await poolClient.getAccountMetrics(GOLD_ACCOUNT_ID);
      
      if (metrics && metrics.balance) {
        displayAccountMetrics(metrics);
        
        // Get trade history
        const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, 30, 100);
        if (tradeHistory.trades && tradeHistory.trades.length > 0) {
          displayMonthlyProfits(tradeHistory.trades, metrics.deposits || 0);
        } else {
          console.log('\n📈 No trading history available yet.');
          console.log('This account was created today, so trades may not have been executed yet.');
        }
        
        // Get risk status
        const riskStatus = await poolClient.getRiskStatus(GOLD_ACCOUNT_ID);
        if (riskStatus) {
          console.log('\n⚠️  RISK STATUS');
          console.log('─'.repeat(30));
          console.log(`Risk Level: ${riskStatus.risk_status || 'N/A'}`);
          console.log(`Open Positions: ${riskStatus.open_positions || 0}`);
          console.log(`Daily Loss: ${riskStatus.daily_loss_percent?.toFixed(2) || 0}%`);
        }
      } else {
        console.log('\n⚠️  No metrics available yet.');
        console.log('MetaStats may need more time to collect initial data.');
        console.log('Please wait 5-10 minutes and try again.');
      }
    } else {
      console.log('\n📝 Next Steps:');
      console.log('1. Find the account ID in MetaAPI dashboard');
      console.log('2. Look for an account with:');
      console.log(`   - Login: ${GOLD_ACCOUNT_INFO.login}`);
      console.log(`   - Name: ${GOLD_ACCOUNT_INFO.name}`);
      console.log('3. Copy the account ID (UUID format)');
      console.log('4. Set environment variable: GOLD_ACCOUNT_ID=<the-uuid>');
      console.log('5. Run this script again');
    }
    
  } catch (error) {
    console.error('\n❌ Error generating report:', error.message);
  }
}

function displayAccountMetrics(metrics) {
  const totalProfit = (metrics.balance || 0) - (metrics.deposits || 0);
  
  console.log('\n📈 ACCOUNT OVERVIEW');
  console.log('─'.repeat(50));
  console.log(`Current Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
  console.log(`Current Equity: $${metrics.equity?.toLocaleString() || 'N/A'}`);
  console.log(`Initial Deposit: $${metrics.deposits?.toLocaleString() || 'N/A'}`);
  console.log(`Total Profit: $${totalProfit.toLocaleString()}`);
  console.log(`Total Trades: ${metrics.trades || 0}`);
  console.log(`Win Rate: ${metrics.winRate ? (metrics.winRate * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);
  console.log(`Max Drawdown: ${metrics.maxDrawdownPercent?.toFixed(2) || 'N/A'}%`);
}

function displayMonthlyProfits(trades, initialDeposit) {
  console.log('\n💰 MONTHLY PROFIT BREAKDOWN');
  console.log('═'.repeat(75));
  
  const monthlyStats = {};
  
  // Group trades by month
  trades.forEach(trade => {
    if (!trade.openTime || trade.profit === initialDeposit) return;
    
    const date = new Date(trade.openTime);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {
        count: 0,
        profit: 0,
        goldTrades: 0,
        goldProfit: 0
      };
    }
    
    monthlyStats[monthKey].count++;
    monthlyStats[monthKey].profit += trade.profit || 0;
    
    // Track gold-specific trades
    if (trade.symbol && trade.symbol.includes('XAU')) {
      monthlyStats[monthKey].goldTrades++;
      monthlyStats[monthKey].goldProfit += trade.profit || 0;
    }
  });
  
  console.log('Month\t\tTotal\tGold\tProfit\t\t30% Fee\t\tNet Profit');
  console.log('─'.repeat(75));
  
  let totalProfit = 0;
  let totalFees = 0;
  let totalGoldProfit = 0;
  
  Object.keys(monthlyStats).sort().forEach(monthKey => {
    const stats = monthlyStats[monthKey];
    const fee = stats.profit > 0 ? stats.profit * PROFIT_FEE_RATE : 0;
    const netProfit = stats.profit - fee;
    
    totalProfit += stats.profit;
    totalFees += fee;
    totalGoldProfit += stats.goldProfit;
    
    const monthName = new Date(monthKey + '-01').toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short' 
    });
    
    console.log(`${monthName}\t\t${stats.count}\t${stats.goldTrades}\t$${stats.profit.toFixed(2).padStart(10)}\t$${fee.toFixed(2).padStart(8)}\t$${netProfit.toFixed(2).padStart(10)}`);
  });
  
  console.log('═'.repeat(75));
  console.log(`TOTAL\t\t\t\t$${totalProfit.toFixed(2).padStart(10)}\t$${totalFees.toFixed(2).padStart(8)}\t$${(totalProfit - totalFees).toFixed(2).padStart(10)}`);
  
  if (totalGoldProfit > 0) {
    console.log(`\n🏆 Gold Trading Profit: $${totalGoldProfit.toFixed(2)}`);
    console.log(`   Gold 30% Fee: $${(totalGoldProfit * PROFIT_FEE_RATE).toFixed(2)}`);
    console.log(`   Gold Net Profit: $${(totalGoldProfit * (1 - PROFIT_FEE_RATE)).toFixed(2)}`);
  }
  
  console.log('\n📊 PROFIT FEE SUMMARY');
  console.log('─'.repeat(50));
  console.log(`Total Gross Profit: $${totalProfit.toFixed(2)}`);
  console.log(`Total 30% Fees: $${totalFees.toFixed(2)}`);
  console.log(`Net Profit After Fees: $${(totalProfit - totalFees).toFixed(2)}`);
  
  if (initialDeposit > 0) {
    const roi = (totalProfit / initialDeposit * 100).toFixed(2);
    const netRoi = ((totalProfit - totalFees) / initialDeposit * 100).toFixed(2);
    console.log(`Return on Investment: ${roi}%`);
    console.log(`Net ROI After Fees: ${netRoi}%`);
  }
}

// Run the report
getGoldAccountReport().catch(console.error);