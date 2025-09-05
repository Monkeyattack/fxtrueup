#!/usr/bin/env node

/**
 * Gold Buy Only Service - Account Setup and Profit Report
 * Enables MetaStats and generates monthly profit analysis
 */

import dotenv from 'dotenv';
import axios from 'axios';
import poolClient from './src/services/poolClient.js';

dotenv.config();

// Gold Buy Only Service account details
const GOLD_ACCOUNT = {
  name: "Gold Buy Only Service",
  login: "3052705",
  server: "PlexyTrade-Server01",
  region: "london",
  metastatsEnabled: false // Currently disabled, needs to be enabled
};

const PROFIT_FEE_RATE = 0.30;

async function setupGoldAccount() {
  console.log('🏆 GOLD BUY ONLY SERVICE - ACCOUNT SETUP & PROFIT REPORT');
  console.log('═'.repeat(70));
  console.log(`Account Name: ${GOLD_ACCOUNT.name}`);
  console.log(`Login: ${GOLD_ACCOUNT.login}`);
  console.log(`Server: ${GOLD_ACCOUNT.server}`);
  console.log(`Region: ${GOLD_ACCOUNT.region}`);
  console.log(`Profit Fee Rate: ${PROFIT_FEE_RATE * 100}%`);
  console.log('═'.repeat(70));

  try {
    // First, we need to find the account ID by listing accounts
    console.log('\n🔍 Finding Gold Buy Only Service account ID...');
    
    // Try to get account info from the pool API
    const poolUrl = process.env.POOL_API_URL || 'http://localhost:8086';
    
    try {
      // Get all accounts summary to find our Gold account
      const response = await axios.get(`${poolUrl}/accounts/summary`);
      const accounts = response.data;
      
      console.log(`\nFound ${Object.keys(accounts).length} accounts in the pool`);
      
      // Look for the Gold account
      let goldAccountId = null;
      for (const [accountId, info] of Object.entries(accounts)) {
        console.log(`Checking account ${accountId.substring(0, 8)}...`);
        if (info.connected) {
          // This might be our account, let's check more details
          try {
            const accountInfo = await poolClient.getAccountInfo(accountId, GOLD_ACCOUNT.region);
            if (accountInfo && accountInfo.login == GOLD_ACCOUNT.login) {
              goldAccountId = accountId;
              console.log(`✅ Found Gold Buy Only Service account: ${goldAccountId}`);
              break;
            }
          } catch (e) {
            // Not this account, continue
          }
        }
      }
      
      if (!goldAccountId) {
        // The account might not be in the pool yet, let's use the standard MetaAPI account ID format
        // We'll need to get this from MetaAPI directly or from the account list
        console.log('\n⚠️  Account not found in pool. It may need to be added to the pool configuration.');
        console.log('Please add the account ID to continue.');
        
        // For now, let's check if we can derive it from the connection info
        console.log('\n📋 Account Information:');
        console.log('- Login: 3052705');
        console.log('- Server: PlexyTrade-Server01');
        console.log('- Region: London');
        console.log('- Created: August 31, 2025');
        console.log('- MetaStats: Currently DISABLED (needs to be enabled)');
        
        console.log('\n⚠️  NEXT STEPS:');
        console.log('1. Enable MetaStats for this account in MetaAPI dashboard');
        console.log('2. Add the account ID to the meta-trader-hub configuration');
        console.log('3. Run this script again to generate the profit report');
        
        return;
      }
      
      // If we found the account, let's get its metrics
      console.log('\n📊 Fetching account metrics...');
      const metrics = await poolClient.getAccountMetrics(goldAccountId);
      
      if (!metrics || !metrics.balance) {
        console.log('⚠️  No metrics available. MetaStats may need to be enabled for this account.');
        console.log('\nTo enable MetaStats:');
        console.log('1. Go to MetaAPI dashboard');
        console.log('2. Find the Gold Buy Only Service account');
        console.log('3. Enable MetaStats in account settings');
        console.log('4. Wait 5-10 minutes for initial data collection');
        console.log('5. Run this script again');
        return;
      }
      
      // Display account metrics
      console.log('\n📈 ACCOUNT OVERVIEW');
      console.log('─'.repeat(50));
      console.log(`Current Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
      console.log(`Current Equity: $${metrics.equity?.toLocaleString() || 'N/A'}`);
      console.log(`Initial Deposit: $${metrics.deposits?.toLocaleString() || 'N/A'}`);
      console.log(`Total Profit: $${((metrics.balance || 0) - (metrics.deposits || 0)).toLocaleString()}`);
      console.log(`Total Trades: ${metrics.trades || 0}`);
      console.log(`Win Rate: ${metrics.winRate ? (metrics.winRate * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);
      
      // Get trade history
      const tradeHistory = await poolClient.getTradeHistory(goldAccountId, 30, 100);
      
      if (tradeHistory.trades && tradeHistory.trades.length > 0) {
        console.log('\n💰 MONTHLY PROFIT ANALYSIS');
        console.log('═'.repeat(70));
        
        const monthlyStats = analyzeGoldTrades(tradeHistory.trades, metrics.deposits || 0);
        
        console.log('Month\t\tTrades\tGross Profit\t30% Fee\t\tNet Profit');
        console.log('─'.repeat(70));
        
        let totalProfit = 0;
        let totalFees = 0;
        
        Object.keys(monthlyStats).sort().forEach(month => {
          const stats = monthlyStats[month];
          const fee = stats.profit > 0 ? stats.profit * PROFIT_FEE_RATE : 0;
          const netProfit = stats.profit - fee;
          
          totalProfit += stats.profit;
          totalFees += fee;
          
          const monthName = new Date(month + '-01').toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long' 
          });
          
          console.log(`${monthName.padEnd(15)}\t${stats.count}\t$${stats.profit.toFixed(2).padStart(10)}\t$${fee.toFixed(2).padStart(8)}\t$${netProfit.toFixed(2).padStart(10)}`);
        });
        
        console.log('─'.repeat(70));
        console.log(`TOTAL\t\t${tradeHistory.count}\t$${totalProfit.toFixed(2).padStart(10)}\t$${totalFees.toFixed(2).padStart(8)}\t$${(totalProfit - totalFees).toFixed(2).padStart(10)}`);
        
        // Show recent gold trades
        console.log('\n🏆 Recent Gold Trades:');
        console.log('─'.repeat(50));
        
        const goldTrades = tradeHistory.trades
          .filter(t => t.symbol && t.symbol.includes('XAU'))
          .slice(0, 10);
        
        if (goldTrades.length > 0) {
          goldTrades.forEach((trade, idx) => {
            const date = new Date(trade.openTime).toLocaleDateString();
            const profitStr = trade.profit > 0 ? `+$${trade.profit.toFixed(2)}` : `$${trade.profit.toFixed(2)}`;
            console.log(`${idx + 1}. ${trade.symbol} - ${profitStr} (${date})`);
          });
        } else {
          console.log('No XAUUSD trades found in recent history');
        }
      }
      
      // Risk status
      const riskStatus = await poolClient.getRiskStatus(goldAccountId);
      console.log('\n⚠️  RISK STATUS');
      console.log('─'.repeat(30));
      console.log(`Risk Level: ${riskStatus?.risk_status || 'N/A'}`);
      console.log(`Open Positions: ${riskStatus?.open_positions || 0}`);
      console.log(`Daily Loss: ${riskStatus?.daily_loss_percent?.toFixed(2) || 0}%`);
      
    } catch (error) {
      console.error('\n❌ Error accessing account:', error.message);
      console.log('\n💡 This could mean:');
      console.log('1. The account needs to be added to meta-trader-hub configuration');
      console.log('2. MetaStats needs to be enabled for this account');
      console.log('3. The connection pool API is not running');
    }
    
  } catch (error) {
    console.error('❌ Error setting up Gold account:', error.message);
  }
}

function analyzeGoldTrades(trades, initialDeposit) {
  const monthlyStats = {};
  
  trades.forEach(trade => {
    if (!trade.openTime || trade.profit === initialDeposit) return; // Skip deposits
    
    const date = new Date(trade.openTime);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {
        count: 0,
        profit: 0,
        trades: []
      };
    }
    
    monthlyStats[monthKey].count++;
    monthlyStats[monthKey].profit += trade.profit || 0;
    monthlyStats[monthKey].trades.push(trade);
  });
  
  return monthlyStats;
}

// Run the setup
setupGoldAccount().catch(console.error);