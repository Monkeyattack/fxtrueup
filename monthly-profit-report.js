#!/usr/bin/env node

/**
 * Monthly Profit Report with 30% Fee Calculation
 * Fetches MetaStats data and calculates profit fees for Grid Demo account
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GRID_DEMO_ACCOUNT_ID = '44f05253-8b6a-4aba-a4b2-7882da7c8e48'; // Grid Demo account
const PROFIT_FEE_RATE = 0.30; // 30%

async function getMonthlyProfitReport() {
  console.log('📊 Monthly Profit Report - Grid Demo Account\n');
  console.log(`Account ID: ${GRID_DEMO_ACCOUNT_ID}`);
  console.log(`Profit Fee Rate: ${PROFIT_FEE_RATE * 100}%\n`);

  try {
    // Get comprehensive account metrics
    console.log('🔍 Fetching account metrics from MetaStats...');
    const metrics = await poolClient.getAccountMetrics(GRID_DEMO_ACCOUNT_ID);
    
    if (!metrics || !metrics.balance) {
      console.error('❌ No metrics available for this account');
      return;
    }

    console.log('✅ Account Overview:');
    console.log(`   Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
    console.log(`   Equity: $${metrics.equity?.toLocaleString() || 'N/A'}`);
    console.log(`   Total Trades: ${metrics.trades || 0}`);
    console.log(`   Win Rate: ${metrics.winRate ? (metrics.winRate * 100).toFixed(1) : 'N/A'}%`);
    console.log(`   Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);
    console.log(`   Max Drawdown: ${metrics.maxDrawdownPercent?.toFixed(2) || 'N/A'}%\n`);

    // Get daily growth data for the entire account history
    console.log('📈 Fetching daily growth data...');
    const dailyGrowth = await poolClient.getDailyGrowth(GRID_DEMO_ACCOUNT_ID, 365); // Last year
    
    if (!dailyGrowth.growth || dailyGrowth.growth.length === 0) {
      console.log('⚠️  No daily growth data available. Calculating from available metrics...');
      
      // Calculate monthly profit from available metrics
      const totalProfit = (metrics.balance || 0) - (metrics.deposits || 0) + (metrics.withdrawals || 0);
      const monthlyProfit = metrics.monthlyGain || totalProfit;
      const dailyProfit = metrics.dailyGain || 0;
      
      console.log('\n💰 Current Period Profit Analysis:');
      console.log(`   Total Profit: $${totalProfit.toFixed(2)}`);
      console.log(`   Monthly Gain: $${monthlyProfit?.toFixed(2) || 'N/A'}`);
      console.log(`   Daily Gain: $${dailyProfit?.toFixed(2) || 'N/A'}`);
      
      if (monthlyProfit > 0) {
        const profitFee = monthlyProfit * PROFIT_FEE_RATE;
        console.log(`   30% Profit Fee: $${profitFee.toFixed(2)}`);
        console.log(`   Net Profit: $${(monthlyProfit - profitFee).toFixed(2)}`);
      }
      
    } else {
      // Process daily growth data to calculate monthly profits
      console.log(`✅ Found ${dailyGrowth.growth.length} daily data points`);
      
      const monthlyData = processMonthlyProfits(dailyGrowth.growth);
      displayMonthlyReport(monthlyData);
    }

    // Get recent trade history
    console.log('\n📋 Recent Trading Activity (Last 30 days):');
    const tradeHistory = await poolClient.getTradeHistory(GRID_DEMO_ACCOUNT_ID, 30, 20);
    
    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      console.log(`   Total Trades: ${tradeHistory.count}`);
      
      let totalProfit = 0;
      let winningTrades = 0;
      let losingTrades = 0;
      
      console.log('\n   Recent Trades:');
      tradeHistory.trades.slice(0, 10).forEach((trade, index) => {
        const profit = trade.profit || 0;
        totalProfit += profit;
        
        if (profit > 0) winningTrades++;
        else if (profit < 0) losingTrades++;
        
        const symbol = trade.symbol || 'N/A';
        const type = trade.type || 'N/A';
        const volume = trade.volume || 0;
        const openTime = trade.openTime ? new Date(trade.openTime).toLocaleDateString() : 'N/A';
        
        console.log(`   ${index + 1}. ${symbol} - ${type} ${volume} lots - P/L: $${profit.toFixed(2)} (${openTime})`);
      });
      
      console.log(`\n   Last 30 Days Summary:`);
      console.log(`   Total P/L: $${totalProfit.toFixed(2)}`);
      console.log(`   Winning Trades: ${winningTrades}`);
      console.log(`   Losing Trades: ${losingTrades}`);
      console.log(`   Win Rate: ${tradeHistory.count > 0 ? ((winningTrades / tradeHistory.count) * 100).toFixed(1) : 0}%`);
      
      if (totalProfit > 0) {
        const monthlyFee = totalProfit * PROFIT_FEE_RATE;
        console.log(`   30% Profit Fee: $${monthlyFee.toFixed(2)}`);
        console.log(`   Net Profit: $${(totalProfit - monthlyFee).toFixed(2)}`);
      }
    } else {
      console.log('   No recent trades found');
    }

    // Get current risk status
    console.log('\n⚠️  Risk Status:');
    const riskStatus = await poolClient.getRiskStatus(GRID_DEMO_ACCOUNT_ID);
    
    if (riskStatus) {
      console.log(`   Current Risk Level: ${riskStatus.risk_status || 'N/A'}`);
      console.log(`   Open Positions: ${riskStatus.open_positions || 0}`);
      console.log(`   Daily Loss: ${riskStatus.daily_loss_percent?.toFixed(2) || 0}%`);
    }

  } catch (error) {
    console.error('❌ Error fetching account data:', error.message);
    if (error.response?.status === 404) {
      console.log('\n💡 This might be because:');
      console.log('   - MetaStats is not enabled for this account');
      console.log('   - Account ID is incorrect');
      console.log('   - Account needs time to synchronize data');
    }
  }
}

function processMonthlyProfits(growthData) {
  const monthlyData = {};
  
  growthData.forEach(point => {
    if (!point.date || !point.balance) return;
    
    const date = new Date(point.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: monthKey,
        startBalance: point.balance,
        endBalance: point.balance,
        profit: 0,
        dataPoints: 0
      };
    }
    
    monthlyData[monthKey].endBalance = point.balance;
    monthlyData[monthKey].dataPoints++;
  });
  
  // Calculate monthly profit
  Object.keys(monthlyData).forEach(month => {
    const data = monthlyData[month];
    data.profit = data.endBalance - data.startBalance;
  });
  
  return monthlyData;
}

function displayMonthlyReport(monthlyData) {
  console.log('\n💰 Monthly Profit Breakdown:');
  console.log('═'.repeat(80));
  console.log('Month\t\tProfit\t\t30% Fee\t\tNet Profit');
  console.log('═'.repeat(80));
  
  let totalProfit = 0;
  let totalFees = 0;
  
  Object.keys(monthlyData)
    .sort()
    .forEach(month => {
      const data = monthlyData[month];
      const profit = data.profit;
      const fee = profit > 0 ? profit * PROFIT_FEE_RATE : 0;
      const netProfit = profit - fee;
      
      totalProfit += profit;
      totalFees += fee;
      
      const monthName = new Date(month + '-01').toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
      
      console.log(`${monthName.padEnd(15)}\t$${profit.toFixed(2).padStart(10)}\t$${fee.toFixed(2).padStart(8)}\t$${netProfit.toFixed(2).padStart(10)}`);
    });
  
  console.log('═'.repeat(80));
  console.log(`Total:\t\t$${totalProfit.toFixed(2).padStart(10)}\t$${totalFees.toFixed(2).padStart(8)}\t$${(totalProfit - totalFees).toFixed(2).padStart(10)}`);
  console.log('═'.repeat(80));
}

// Run the report
getMonthlyProfitReport().catch(console.error);