#!/usr/bin/env node

/**
 * Detailed Monthly Report with August Analysis
 * Grid Demo - Prop Firm Account Performance
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GRID_DEMO_ACCOUNT_ID = '44f05253-8b6a-4aba-a4b2-7882da7c8e48';
const PROFIT_FEE_RATE = 0.30;

async function generateDetailedReport() {
  console.log('🎯 DETAILED MONTHLY PROFIT REPORT');
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
    
    console.log('\n📊 ACCOUNT OVERVIEW');
    console.log('─'.repeat(40));
    console.log(`Current Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
    console.log(`Current Equity: $${metrics.equity?.toLocaleString() || 'N/A'}`);
    console.log(`Initial Deposit: $${metrics.deposits?.toLocaleString() || '50,000'}`);
    console.log(`Total Profit: $${((metrics.balance || 0) - (metrics.deposits || 50000)).toLocaleString()}`);
    console.log(`Total Trades: ${metrics.trades || 0}`);
    console.log(`Win Rate: ${metrics.winRate ? (metrics.winRate * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);

    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      console.log('\n📈 MONTHLY BREAKDOWN');
      console.log('═'.repeat(80));
      
      const monthlyStats = analyzeTradesByMonth(tradeHistory.trades, metrics.deposits || 50000);
      
      console.log('Month\t\tTrades\tProfit/Loss\t30% Fee\t\tNet Profit\tBalance');
      console.log('─'.repeat(80));
      
      let runningBalance = metrics.deposits || 50000;
      let totalFees = 0;
      let totalNetProfit = 0;
      
      // Sort months chronologically
      const sortedMonths = Object.keys(monthlyStats).sort();
      
      sortedMonths.forEach(monthKey => {
        const stats = monthlyStats[monthKey];
        const profit = stats.totalProfit;
        const fee = profit > 0 ? profit * PROFIT_FEE_RATE : 0;
        const netProfit = profit - fee;
        
        runningBalance += netProfit;
        totalFees += fee;
        totalNetProfit += netProfit;
        
        const monthName = formatMonth(monthKey);
        console.log(`${monthName}\t${stats.tradeCount}\t$${profit.toFixed(2).padStart(10)}\t$${fee.toFixed(2).padStart(8)}\t$${netProfit.toFixed(2).padStart(10)}\t$${runningBalance.toLocaleString()}`);
      });
      
      console.log('─'.repeat(80));
      console.log(`TOTAL\t\t${tradeHistory.count}\t$${(metrics.balance - (metrics.deposits || 50000)).toFixed(2).padStart(10)}\t$${totalFees.toFixed(2).padStart(8)}\t$${totalNetProfit.toFixed(2).padStart(10)}\t$${metrics.balance.toLocaleString()}`);
      
      console.log('\n💰 AUGUST 2025 DETAILED ANALYSIS');
      console.log('═'.repeat(60));
      
      const augustStats = monthlyStats['2025-08'] || { tradeCount: 0, totalProfit: 0, trades: [] };
      
      if (augustStats.tradeCount > 0) {
        console.log(`Trades Executed: ${augustStats.tradeCount}`);
        console.log(`Gross Profit: $${augustStats.totalProfit.toFixed(2)}`);
        console.log(`30% Profit Fee: $${(augustStats.totalProfit * PROFIT_FEE_RATE).toFixed(2)}`);
        console.log(`Net Profit: $${(augustStats.totalProfit * (1 - PROFIT_FEE_RATE)).toFixed(2)}`);
        
        console.log('\nTop August Trades:');
        console.log('─'.repeat(50));
        
        const topTrades = augustStats.trades
          .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))
          .slice(0, 10);
        
        topTrades.forEach((trade, index) => {
          const date = new Date(trade.openTime).toLocaleDateString();
          console.log(`${index + 1}. ${trade.symbol} ${trade.type} - $${trade.profit.toFixed(2)} (${date})`);
        });
        
        // Winning vs Losing trades
        const winningTrades = augustStats.trades.filter(t => t.profit > 0);
        const losingTrades = augustStats.trades.filter(t => t.profit < 0);
        
        console.log('\nAugust Performance Breakdown:');
        console.log(`Winning Trades: ${winningTrades.length} (${((winningTrades.length / augustStats.tradeCount) * 100).toFixed(1)}%)`);
        console.log(`Losing Trades: ${losingTrades.length} (${((losingTrades.length / augustStats.tradeCount) * 100).toFixed(1)}%)`);
        
        if (winningTrades.length > 0) {
          const avgWin = winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length;
          console.log(`Average Win: $${avgWin.toFixed(2)}`);
        }
        
        if (losingTrades.length > 0) {
          const avgLoss = losingTrades.reduce((sum, t) => sum + Math.abs(t.profit), 0) / losingTrades.length;
          console.log(`Average Loss: $${avgLoss.toFixed(2)}`);
        }
        
      } else {
        console.log('No trades found for August 2025');
      }
      
      console.log('\n🎯 PROFIT FEE SUMMARY');
      console.log('═'.repeat(50));
      console.log(`Total Gross Profit: $${(metrics.balance - (metrics.deposits || 50000)).toFixed(2)}`);
      console.log(`Total 30% Fees: $${totalFees.toFixed(2)}`);
      console.log(`Net Profit After Fees: $${totalNetProfit.toFixed(2)}`);
      console.log(`Effective Return: ${(totalNetProfit / (metrics.deposits || 50000) * 100).toFixed(2)}%`);
      
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

function analyzeTradesByMonth(trades, initialDeposit) {
  const monthlyStats = {};
  
  trades.forEach(trade => {
    if (!trade.openTime || !trade.profit) return;
    
    const date = new Date(trade.openTime);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {
        tradeCount: 0,
        totalProfit: 0,
        trades: []
      };
    }
    
    monthlyStats[monthKey].tradeCount++;
    monthlyStats[monthKey].totalProfit += trade.profit || 0;
    monthlyStats[monthKey].trades.push(trade);
  });
  
  return monthlyStats;
}

function formatMonth(monthKey) {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

// Run the detailed report
generateDetailedReport().catch(console.error);