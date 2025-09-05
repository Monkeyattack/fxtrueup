#!/usr/bin/env node

/**
 * CORRECTED Monthly Report with Proper Profit Calculation
 * Grid Demo - Prop Firm Account Performance
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GRID_DEMO_ACCOUNT_ID = '44f05253-8b6a-4aba-a4b2-7882da7c8e48';
const PROFIT_FEE_RATE = 0.30;
const INITIAL_DEPOSIT = 50000; // From the balance trade we saw

async function generateCorrectedReport() {
  console.log('🎯 CORRECTED MONTHLY PROFIT REPORT');
  console.log('═'.repeat(60));
  console.log(`Account: Grid Demo - Prop Firm`);
  console.log(`Login: 3063328`);
  console.log(`Server: PlexyTrade-Server01`);
  console.log(`Account ID: ${GRID_DEMO_ACCOUNT_ID}`);
  console.log(`Profit Fee Rate: ${PROFIT_FEE_RATE * 100}%`);
  console.log('═'.repeat(60));

  try {
    // Get comprehensive account metrics
    const metrics = await poolClient.getAccountMetrics(GRID_DEMO_ACCOUNT_ID);
    const tradeHistory = await poolClient.getTradeHistory(GRID_DEMO_ACCOUNT_ID, 90, 200); // Last 90 days
    
    // Calculate ACTUAL profit (current balance - initial deposit)
    const actualTotalProfit = metrics.balance - INITIAL_DEPOSIT;
    
    console.log('\n📊 ACCOUNT OVERVIEW');
    console.log('─'.repeat(40));
    console.log(`Initial Deposit: $${INITIAL_DEPOSIT.toLocaleString()}`);
    console.log(`Current Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
    console.log(`Current Equity: $${metrics.equity?.toLocaleString() || 'N/A'}`);
    console.log(`ACTUAL Total Profit: $${actualTotalProfit.toLocaleString()}`);
    console.log(`Total Trades: ${metrics.trades || 0}`);
    console.log(`Win Rate: ${metrics.winRate ? (metrics.winRate * 100).toFixed(1) + '%' : 'Calculating...'}`);
    console.log(`Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);

    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      console.log('\n📈 MONTHLY BREAKDOWN');
      console.log('═'.repeat(85));
      
      const monthlyStats = analyzeTradesByMonth(tradeHistory.trades);
      
      console.log('Month\t\tTrades\tGross Profit\t30% Fee\t\tNet Profit');
      console.log('─'.repeat(85));
      
      let totalGrossProfit = 0;
      let totalFees = 0;
      let totalNetProfit = 0;
      
      // Sort months chronologically
      const sortedMonths = Object.keys(monthlyStats).sort();
      
      sortedMonths.forEach(monthKey => {
        const stats = monthlyStats[monthKey];
        
        // Calculate profit excluding the initial deposit transaction
        const monthProfit = stats.trades
          .filter(trade => trade.profit !== INITIAL_DEPOSIT) // Exclude deposit
          .reduce((sum, trade) => sum + (trade.profit || 0), 0);
        
        const fee = monthProfit > 0 ? monthProfit * PROFIT_FEE_RATE : 0;
        const netProfit = monthProfit - fee;
        
        totalGrossProfit += monthProfit;
        totalFees += fee;
        totalNetProfit += netProfit;
        
        const monthName = formatMonth(monthKey);
        console.log(`${monthName}\t${stats.tradeCount - (stats.hasDeposit ? 1 : 0)}\t$${monthProfit.toFixed(2).padStart(10)}\t$${fee.toFixed(2).padStart(8)}\t$${netProfit.toFixed(2).padStart(10)}`);
      });
      
      console.log('─'.repeat(85));
      console.log(`TOTAL\t\t${tradeHistory.count - 1}\t$${actualTotalProfit.toFixed(2).padStart(10)}\t$${totalFees.toFixed(2).padStart(8)}\t$${totalNetProfit.toFixed(2).padStart(10)}`);
      
      console.log('\n💰 AUGUST 2025 DETAILED ANALYSIS');
      console.log('═'.repeat(60));
      
      const augustStats = monthlyStats['2025-08'];
      
      if (augustStats) {
        // Filter out the deposit transaction
        const actualTrades = augustStats.trades.filter(trade => trade.profit !== INITIAL_DEPOSIT);
        const augustProfit = actualTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
        const augustFee = augustProfit > 0 ? augustProfit * PROFIT_FEE_RATE : 0;
        const augustNet = augustProfit - augustFee;
        
        console.log(`Trading Days: August 1-31, 2025`);
        console.log(`Actual Trades Executed: ${actualTrades.length} (excluding deposit)`);
        console.log(`Gross Trading Profit: $${augustProfit.toFixed(2)}`);
        console.log(`30% Profit Fee: $${augustFee.toFixed(2)}`);
        console.log(`Net Profit After Fee: $${augustNet.toFixed(2)}`);
        
        console.log('\nTop August Trades (Excluding Deposit):');
        console.log('─'.repeat(50));
        
        const topTrades = actualTrades
          .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))
          .slice(0, 10);
        
        topTrades.forEach((trade, index) => {
          const date = new Date(trade.openTime).toLocaleDateString();
          const profitColor = trade.profit > 0 ? '+' : '';
          console.log(`${index + 1}. ${trade.symbol || 'N/A'} ${trade.type || 'N/A'} - ${profitColor}$${trade.profit.toFixed(2)} (${date})`);
        });
        
        // Performance analysis
        const winningTrades = actualTrades.filter(t => t.profit > 0);
        const losingTrades = actualTrades.filter(t => t.profit < 0);
        
        console.log('\nAugust Performance Analysis:');
        console.log('─'.repeat(40));
        console.log(`Winning Trades: ${winningTrades.length} (${((winningTrades.length / actualTrades.length) * 100).toFixed(1)}%)`);
        console.log(`Losing Trades: ${losingTrades.length} (${((losingTrades.length / actualTrades.length) * 100).toFixed(1)}%)`);
        
        if (winningTrades.length > 0) {
          const totalWinnings = winningTrades.reduce((sum, t) => sum + t.profit, 0);
          const avgWin = totalWinnings / winningTrades.length;
          console.log(`Total Winnings: $${totalWinnings.toFixed(2)}`);
          console.log(`Average Win: $${avgWin.toFixed(2)}`);
        }
        
        if (losingTrades.length > 0) {
          const totalLosses = losingTrades.reduce((sum, t) => sum + Math.abs(t.profit), 0);
          const avgLoss = totalLosses / losingTrades.length;
          console.log(`Total Losses: $${totalLosses.toFixed(2)}`);
          console.log(`Average Loss: $${avgLoss.toFixed(2)}`);
        }
        
      } else {
        console.log('No trades found for August 2025');
      }
      
      console.log('\n🎯 CORRECTED PROFIT FEE SUMMARY');
      console.log('═'.repeat(50));
      console.log(`Total Gross Profit: $${actualTotalProfit.toFixed(2)}`);
      console.log(`Total 30% Fees: $${(actualTotalProfit * PROFIT_FEE_RATE).toFixed(2)}`);
      console.log(`Net Profit After Fees: $${(actualTotalProfit * (1 - PROFIT_FEE_RATE)).toFixed(2)}`);
      console.log(`Return on Deposit: ${(actualTotalProfit / INITIAL_DEPOSIT * 100).toFixed(2)}%`);
      console.log(`Net Return After Fees: ${((actualTotalProfit * (1 - PROFIT_FEE_RATE)) / INITIAL_DEPOSIT * 100).toFixed(2)}%`);
      
    }

    // Risk Analysis
    const riskStatus = await poolClient.getRiskStatus(GRID_DEMO_ACCOUNT_ID);
    console.log('\n⚠️  CURRENT RISK STATUS');
    console.log('─'.repeat(30));
    console.log(`Risk Level: ${riskStatus?.risk_status || 'N/A'}`);
    console.log(`Open Positions: ${riskStatus?.open_positions || 0}`);
    console.log(`Daily Loss: ${riskStatus?.daily_loss_percent?.toFixed(2) || 0}%`);

  } catch (error) {
    console.error('❌ Error generating report:', error.message);
  }
}

function analyzeTradesByMonth(trades) {
  const monthlyStats = {};
  
  trades.forEach(trade => {
    if (!trade.openTime) return;
    
    const date = new Date(trade.openTime);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {
        tradeCount: 0,
        trades: [],
        hasDeposit: false
      };
    }
    
    monthlyStats[monthKey].tradeCount++;
    monthlyStats[monthKey].trades.push(trade);
    
    // Check if this is a deposit transaction
    if (trade.profit === INITIAL_DEPOSIT) {
      monthlyStats[monthKey].hasDeposit = true;
    }
  });
  
  return monthlyStats;
}

function formatMonth(monthKey) {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

// Run the corrected report
generateCorrectedReport().catch(console.error);