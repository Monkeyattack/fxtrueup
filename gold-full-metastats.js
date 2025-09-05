#!/usr/bin/env node

/**
 * Gold Account - Complete MetaStats Breakdown
 * All metrics with corrected monthly grouping by close time
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';
const PROFIT_FEE_RATE = 0.30;
const INITIAL_DEPOSIT = 5000;

async function generateCompleteMetaStatsReport() {
  console.log('📊 GOLD BUY ONLY SERVICE - COMPLETE METASTATS BREAKDOWN');
  console.log('═'.repeat(100));
  console.log('Account Information:');
  console.log('  • Name: Gold Buy Only Service');
  console.log('  • Login: 3052705');
  console.log('  • Server: PlexyTrade-Server01');
  console.log('  • Account ID:', GOLD_ACCOUNT_ID);
  console.log('  • Initial Deposit: $5,000');
  console.log('  • Performance Fee: 30%');
  console.log('═'.repeat(100));

  try {
    // Fetch all data
    const metrics = await poolClient.getAccountMetrics(GOLD_ACCOUNT_ID);
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, 365, 5000);
    const dailyGrowth = await poolClient.getDailyGrowth(GOLD_ACCOUNT_ID, 365);
    const riskStatus = await poolClient.getRiskStatus(GOLD_ACCOUNT_ID);
    
    // Overall Account Performance
    console.log('\n🏆 OVERALL ACCOUNT PERFORMANCE');
    console.log('─'.repeat(70));
    console.log(`Current Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
    console.log(`Current Equity: $${metrics.equity?.toLocaleString() || 'N/A'}`);
    console.log(`Floating P/L: $${((metrics.equity || 0) - (metrics.balance || 0)).toFixed(2)}`);
    console.log(`Total Profit: $${((metrics.balance || 0) - INITIAL_DEPOSIT).toFixed(2)}`);
    console.log(`Total Return: ${(((metrics.balance || 0) - INITIAL_DEPOSIT) / INITIAL_DEPOSIT * 100).toFixed(2)}%`);
    console.log(`Net Return (after 30% fees): ${(((metrics.balance || 0) - INITIAL_DEPOSIT) * 0.7 / INITIAL_DEPOSIT * 100).toFixed(2)}%`);
    
    // Trading Statistics
    console.log('\n📈 TRADING STATISTICS');
    console.log('─'.repeat(70));
    console.log(`Total Trades: ${metrics.trades || 0}`);
    console.log(`Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);
    console.log(`Recovery Factor: ${metrics.recoveryFactor?.toFixed(2) || 'N/A'}`);
    console.log(`Sharpe Ratio: ${metrics.sharpeRatio?.toFixed(2) || 'N/A'}`);
    console.log(`Sortino Ratio: ${metrics.sortinoRatio?.toFixed(2) || 'N/A'}`);
    console.log(`Max Drawdown: ${metrics.maxDrawdownPercent?.toFixed(2) || 'N/A'}%`);
    console.log(`Average Trade: ${metrics.averageTrade ? '$' + metrics.averageTrade.toFixed(2) : 'N/A'}`);
    console.log(`Average Win: ${metrics.averageWin ? '$' + metrics.averageWin.toFixed(2) : 'N/A'}`);
    console.log(`Average Loss: ${metrics.averageLoss ? '$' + Math.abs(metrics.averageLoss).toFixed(2) : 'N/A'}`);
    console.log(`Best Trade: ${metrics.bestTrade ? '$' + metrics.bestTrade.toFixed(2) : 'N/A'}`);
    console.log(`Worst Trade: ${metrics.worstTrade ? '$' + metrics.worstTrade.toFixed(2) : 'N/A'}`);
    
    // Process trades by month
    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      const monthlyData = processDetailedMonthlyData(tradeHistory.trades);
      
      // Monthly Performance Table
      console.log('\n📅 MONTHLY PERFORMANCE METRICS (GROUPED BY CLOSE TIME)');
      console.log('═'.repeat(140));
      console.log('Month\t\tTrades\tWin%\tProfit Factor\tVolume\tGross P/L\tAvg Trade\tAvg Win\t\tAvg Loss\t30% Fee\t\tNet P/L');
      console.log('─'.repeat(140));
      
      let cumulativeBalance = INITIAL_DEPOSIT;
      const sortedMonths = Object.keys(monthlyData).sort();
      
      sortedMonths.forEach(monthKey => {
        const data = monthlyData[monthKey];
        const fee = data.profit > 0 ? data.profit * PROFIT_FEE_RATE : 0;
        const netProfit = data.profit - fee;
        cumulativeBalance += netProfit;
        
        const monthName = new Date(monthKey + '-01').toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short' 
        });
        
        console.log(
          `${monthName}\t\t${data.trades}\t${data.winRate.toFixed(1)}%\t${data.profitFactor.toFixed(2)}\t\t${data.volume.toFixed(2)}\t$${data.profit.toFixed(2).padStart(10)}\t$${data.avgTrade.toFixed(2).padStart(8)}\t$${data.avgWin.toFixed(2).padStart(8)}\t$${data.avgLoss.toFixed(2).padStart(8)}\t$${fee.toFixed(2).padStart(8)}\t$${netProfit.toFixed(2).padStart(10)}`
        );
      });
      
      console.log('═'.repeat(140));
      
      // Detailed Monthly Breakdowns
      console.log('\n📊 DETAILED MONTHLY BREAKDOWNS');
      console.log('═'.repeat(100));
      
      ['2025-06', '2025-07', '2025-08'].forEach(monthKey => {
        const data = monthlyData[monthKey];
        if (!data) return;
        
        const monthName = new Date(monthKey + '-01').toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long' 
        });
        
        console.log(`\n${monthName.toUpperCase()}`);
        console.log('─'.repeat(70));
        
        // Performance Overview
        console.log('Performance Overview:');
        console.log(`  • Total Trades: ${data.trades}`);
        console.log(`  • Winning Trades: ${data.wins} (${data.winRate.toFixed(1)}%)`);
        console.log(`  • Losing Trades: ${data.losses} (${(100 - data.winRate).toFixed(1)}%)`);
        console.log(`  • Breakeven Trades: ${data.breakeven}`);
        console.log(`  • Total Volume: ${data.volume.toFixed(2)} lots`);
        console.log(`  • Average Trade Size: ${(data.volume / data.trades).toFixed(3)} lots`);
        
        // Profit Analysis
        console.log('\nProfit Analysis:');
        console.log(`  • Gross Profit: $${data.profit.toFixed(2)}`);
        console.log(`  • Total Won: $${data.totalWinning.toFixed(2)}`);
        console.log(`  • Total Lost: $${data.totalLosing.toFixed(2)}`);
        console.log(`  • Average Trade: $${data.avgTrade.toFixed(2)}`);
        console.log(`  • Average Win: $${data.avgWin.toFixed(2)}`);
        console.log(`  • Average Loss: $${data.avgLoss.toFixed(2)}`);
        console.log(`  • Win/Loss Ratio: ${data.winLossRatio.toFixed(2)}`);
        console.log(`  • Profit Factor: ${data.profitFactor.toFixed(2)}`);
        console.log(`  • Expected Value: $${data.expectedValue.toFixed(2)}`);
        
        // Risk Metrics
        console.log('\nRisk Metrics:');
        console.log(`  • Largest Win: $${data.largestWin.toFixed(2)}`);
        console.log(`  • Largest Loss: $${Math.abs(data.largestLoss).toFixed(2)}`);
        console.log(`  • Max Consecutive Wins: ${data.maxConsecutiveWins}`);
        console.log(`  • Max Consecutive Losses: ${data.maxConsecutiveLosses}`);
        console.log(`  • Standard Deviation: $${data.stdDev.toFixed(2)}`);
        console.log(`  • Sharpe Ratio (monthly): ${data.sharpeRatio.toFixed(2)}`);
        
        // Trading Activity
        console.log('\nTrading Activity:');
        console.log(`  • Active Trading Days: ${data.tradingDays.size}`);
        console.log(`  • Average Trades per Day: ${(data.trades / data.tradingDays.size).toFixed(1)}`);
        console.log(`  • Most Active Hour: ${data.mostActiveHour}:00 (${data.hourlyDistribution[data.mostActiveHour]} trades)`);
        
        // Performance Fee
        console.log('\nPerformance Fee Calculation:');
        if (data.profit > 0) {
          console.log(`  • Gross Profit: $${data.profit.toFixed(2)}`);
          console.log(`  • 30% Performance Fee: $${(data.profit * PROFIT_FEE_RATE).toFixed(2)}`);
          console.log(`  • Net Profit After Fee: $${(data.profit * (1 - PROFIT_FEE_RATE)).toFixed(2)}`);
          console.log(`  • Effective Return: ${(data.profit * (1 - PROFIT_FEE_RATE) / cumulativeBalance * 100).toFixed(2)}%`);
        } else {
          console.log(`  • Net Loss: $${data.profit.toFixed(2)} (no performance fee)`);
        }
        
        if (data.crossMonthTrades > 0) {
          console.log(`\n⚠️  Note: ${data.crossMonthTrades} trades were opened in previous month(s) but closed in ${monthName}`);
        }
      });
      
      // Trading Pattern Analysis
      console.log('\n🔍 TRADING PATTERN ANALYSIS');
      console.log('─'.repeat(70));
      
      // Aggregate hourly distribution
      const totalHourlyDist = {};
      Object.values(monthlyData).forEach(month => {
        Object.entries(month.hourlyDistribution).forEach(([hour, count]) => {
          totalHourlyDist[hour] = (totalHourlyDist[hour] || 0) + count;
        });
      });
      
      console.log('Trading Activity by Hour (UTC):');
      Object.keys(totalHourlyDist).sort((a, b) => a - b).forEach(hour => {
        const count = totalHourlyDist[hour];
        const bar = '█'.repeat(Math.ceil(count / 5));
        console.log(`  ${hour.padStart(2, '0')}:00 - ${bar} (${count} trades)`);
      });
      
      // Risk Status
      console.log('\n⚠️  CURRENT RISK STATUS');
      console.log('─'.repeat(70));
      console.log(`Risk Level: ${riskStatus?.risk_status || 'N/A'}`);
      console.log(`Open Positions: ${riskStatus?.open_positions || 0}`);
      console.log(`Daily Loss: ${riskStatus?.daily_loss_percent?.toFixed(2) || 0}%`);
      console.log(`Max Daily Loss Limit: ${riskStatus?.max_daily_loss_percent?.toFixed(2) || 'N/A'}%`);
      console.log(`Current Drawdown: ${riskStatus?.current_drawdown_percent?.toFixed(2) || 0}%`);
      
      // Executive Summary
      console.log('\n💰 EXECUTIVE SUMMARY');
      console.log('═'.repeat(100));
      console.log(`Trading Period: June 2025 - Present`);
      console.log(`Initial Investment: $${INITIAL_DEPOSIT.toLocaleString()}`);
      console.log(`Current Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
      console.log(`Total Gross Profit: $${((metrics.balance || 0) - INITIAL_DEPOSIT).toFixed(2)}`);
      console.log(`Total Performance Fees (30%): $${(((metrics.balance || 0) - INITIAL_DEPOSIT) * 0.3).toFixed(2)}`);
      console.log(`Net Profit After Fees: $${(((metrics.balance || 0) - INITIAL_DEPOSIT) * 0.7).toFixed(2)}`);
      console.log(`Total Return: ${(((metrics.balance || 0) - INITIAL_DEPOSIT) / INITIAL_DEPOSIT * 100).toFixed(2)}%`);
      console.log(`Annualized Return: ${calculateAnnualizedReturn(INITIAL_DEPOSIT, metrics.balance || 0, sortedMonths.length).toFixed(2)}%`);
      console.log(`Average Monthly Return: ${(((metrics.balance || 0) - INITIAL_DEPOSIT) / INITIAL_DEPOSIT / sortedMonths.length * 100).toFixed(2)}%`);
      
    } else {
      console.log('\n❌ No trade data available');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

function processDetailedMonthlyData(trades) {
  const monthlyData = {};
  
  const tradingTrades = trades.filter(t => 
    t.type !== 'DEAL_TYPE_BALANCE' && t.closeTime
  );
  
  tradingTrades.forEach(trade => {
    const closeDate = new Date(trade.closeTime);
    const monthKey = `${closeDate.getFullYear()}-${String(closeDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        trades: 0,
        volume: 0,
        profit: 0,
        wins: 0,
        losses: 0,
        breakeven: 0,
        totalWinning: 0,
        totalLosing: 0,
        avgWin: 0,
        avgLoss: 0,
        avgTrade: 0,
        winRate: 0,
        profitFactor: 0,
        winLossRatio: 0,
        expectedValue: 0,
        largestWin: 0,
        largestLoss: 0,
        crossMonthTrades: 0,
        tradingDays: new Set(),
        allTrades: [],
        hourlyDistribution: {},
        consecutiveWins: 0,
        consecutiveLosses: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        stdDev: 0,
        sharpeRatio: 0,
        mostActiveHour: 0
      };
    }
    
    const data = monthlyData[monthKey];
    data.trades++;
    data.volume += (trade.volume || 0);
    data.profit += (trade.profit || 0);
    data.allTrades.push(trade);
    
    // Track trading days and hours
    data.tradingDays.add(closeDate.toDateString());
    const hour = closeDate.getUTCHours();
    data.hourlyDistribution[hour] = (data.hourlyDistribution[hour] || 0) + 1;
    
    // Win/Loss tracking
    if (trade.profit > 0) {
      data.wins++;
      data.totalWinning += trade.profit;
      if (trade.profit > data.largestWin) data.largestWin = trade.profit;
      data.consecutiveWins++;
      if (data.consecutiveWins > data.maxConsecutiveWins) {
        data.maxConsecutiveWins = data.consecutiveWins;
      }
      data.consecutiveLosses = 0;
    } else if (trade.profit < 0) {
      data.losses++;
      data.totalLosing += trade.profit;
      if (trade.profit < data.largestLoss) data.largestLoss = trade.profit;
      data.consecutiveLosses++;
      if (data.consecutiveLosses > data.maxConsecutiveLosses) {
        data.maxConsecutiveLosses = data.consecutiveLosses;
      }
      data.consecutiveWins = 0;
    } else {
      data.breakeven++;
    }
    
    // Check for cross-month trades
    if (trade.openTime) {
      const openDate = new Date(trade.openTime);
      const openMonth = `${openDate.getFullYear()}-${String(openDate.getMonth() + 1).padStart(2, '0')}`;
      if (openMonth !== monthKey) {
        data.crossMonthTrades++;
      }
    }
  });
  
  // Calculate statistics for each month
  Object.keys(monthlyData).forEach(monthKey => {
    const data = monthlyData[monthKey];
    
    // Basic averages
    data.winRate = data.trades > 0 ? (data.wins / data.trades * 100) : 0;
    data.avgTrade = data.trades > 0 ? data.profit / data.trades : 0;
    data.avgWin = data.wins > 0 ? data.totalWinning / data.wins : 0;
    data.avgLoss = data.losses > 0 ? Math.abs(data.totalLosing / data.losses) : 0;
    
    // Advanced metrics
    data.profitFactor = data.totalLosing !== 0 ? Math.abs(data.totalWinning / data.totalLosing) : data.totalWinning > 0 ? 999 : 0;
    data.winLossRatio = data.avgLoss > 0 ? data.avgWin / data.avgLoss : data.avgWin > 0 ? 999 : 0;
    data.expectedValue = (data.winRate / 100 * data.avgWin) - ((100 - data.winRate) / 100 * data.avgLoss);
    
    // Standard deviation
    if (data.allTrades.length > 1) {
      const mean = data.avgTrade;
      const variance = data.allTrades.reduce((sum, trade) => 
        sum + Math.pow((trade.profit || 0) - mean, 2), 0
      ) / data.allTrades.length;
      data.stdDev = Math.sqrt(variance);
      
      // Sharpe ratio (simplified monthly)
      if (data.stdDev > 0) {
        data.sharpeRatio = (data.avgTrade / data.stdDev) * Math.sqrt(20); // Assuming 20 trading days
      }
    }
    
    // Find most active hour
    let maxTrades = 0;
    Object.entries(data.hourlyDistribution).forEach(([hour, count]) => {
      if (count > maxTrades) {
        maxTrades = count;
        data.mostActiveHour = parseInt(hour);
      }
    });
  });
  
  return monthlyData;
}

function calculateAnnualizedReturn(initial, final, months) {
  const totalReturn = (final - initial) / initial;
  const yearsElapsed = months / 12;
  return (Math.pow(1 + totalReturn, 1 / yearsElapsed) - 1) * 100;
}

// Run the report
generateCompleteMetaStatsReport().catch(console.error);