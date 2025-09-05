#!/usr/bin/env node

/**
 * Gold Account - Corrected Monthly P/L Report
 * Groups trades by CLOSE TIME to match CSV methodology
 * Calculates accurate 30% performance fees
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';
const PROFIT_FEE_RATE = 0.30;

async function getGoldCorrectedMonthlyReport() {
  console.log('💰 GOLD ACCOUNT - CORRECTED MONTHLY PROFIT/LOSS REPORT');
  console.log('═'.repeat(80));
  console.log('Account: Gold Buy Only Service (Login: 3052705)');
  console.log('Method: Grouping by CLOSE TIME (matching CSV export)');
  console.log('Performance Fee: 30%');
  console.log('═'.repeat(80));

  try {
    // Fetch all available trade history
    console.log('\n📊 Fetching complete trade history...');
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, 365, 5000);
    
    console.log(`Total trades fetched: ${tradeHistory.count || 0}`);
    
    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      // Group trades by close month
      const monthlyData = {};
      
      // First, let's identify and separate the initial deposit
      let initialDeposit = 0;
      const tradingTrades = [];
      
      tradeHistory.trades.forEach(trade => {
        if (trade.type === 'DEAL_TYPE_BALANCE' && trade.profit === 5000) {
          initialDeposit = trade.profit;
        } else if (trade.closeTime && trade.type !== 'DEAL_TYPE_BALANCE') {
          tradingTrades.push(trade);
        }
      });
      
      // Process trading trades by close month
      tradingTrades.forEach(trade => {
        const closeDate = new Date(trade.closeTime);
        const monthKey = `${closeDate.getFullYear()}-${String(closeDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            trades: 0,
            volume: 0,
            profit: 0,
            swap: 0,
            commission: 0,
            wins: 0,
            losses: 0,
            longHeldTrades: 0, // Trades held > 24 hours
            crossMonthTrades: 0 // Trades that opened in previous month
          };
        }
        
        monthlyData[monthKey].trades++;
        monthlyData[monthKey].volume += (trade.volume || 0);
        monthlyData[monthKey].profit += (trade.profit || 0);
        monthlyData[monthKey].swap += (trade.swap || 0);
        monthlyData[monthKey].commission += (trade.commission || 0);
        
        if (trade.profit > 0) monthlyData[monthKey].wins++;
        else if (trade.profit < 0) monthlyData[monthKey].losses++;
        
        // Check if trade was held long or crosses months
        if (trade.openTime) {
          const openDate = new Date(trade.openTime);
          const holdTime = closeDate - openDate;
          const holdHours = holdTime / (1000 * 60 * 60);
          
          if (holdHours > 24) {
            monthlyData[monthKey].longHeldTrades++;
          }
          
          const openMonth = `${openDate.getFullYear()}-${String(openDate.getMonth() + 1).padStart(2, '0')}`;
          if (openMonth !== monthKey) {
            monthlyData[monthKey].crossMonthTrades++;
          }
        }
      });
      
      // Display results
      console.log('\n📈 MONTHLY PERFORMANCE BREAKDOWN');
      console.log('═'.repeat(110));
      console.log('Month\t\tTrades\tWins\tLosses\tVolume\t\tGross P/L\tSwap\t\t30% Fee\t\tNet Profit');
      console.log('─'.repeat(110));
      
      let runningBalance = initialDeposit;
      let totalProfit = 0;
      let totalFees = 0;
      let totalSwap = 0;
      
      // Process months in order
      const sortedMonths = Object.keys(monthlyData).sort();
      
      sortedMonths.forEach(monthKey => {
        const data = monthlyData[monthKey];
        const winRate = data.trades > 0 ? (data.wins / data.trades * 100) : 0;
        const fee = data.profit > 0 ? data.profit * PROFIT_FEE_RATE : 0;
        const netProfit = data.profit - fee;
        
        totalProfit += data.profit;
        totalFees += fee;
        totalSwap += data.swap;
        runningBalance += netProfit;
        
        const monthName = new Date(monthKey + '-01').toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long' 
        });
        
        console.log(
          `${monthName.padEnd(16)}${data.trades}\t${data.wins}\t${data.losses}\t${data.volume.toFixed(2)}\t\t$${data.profit.toFixed(2).padStart(10)}\t$${data.swap.toFixed(2).padStart(8)}\t$${fee.toFixed(2).padStart(8)}\t$${netProfit.toFixed(2).padStart(10)}`
        );
        
        // Add note about cross-month trades if any
        if (data.crossMonthTrades > 0) {
          console.log(`\t\t↳ Includes ${data.crossMonthTrades} trades opened in previous month(s)`);
        }
      });
      
      console.log('═'.repeat(110));
      console.log(`TOTALS\t\t${tradingTrades.length}\t\t\t${tradingTrades.reduce((sum, t) => sum + (t.volume || 0), 0).toFixed(2)}\t\t$${totalProfit.toFixed(2).padStart(10)}\t$${totalSwap.toFixed(2).padStart(8)}\t$${totalFees.toFixed(2).padStart(8)}\t$${(totalProfit - totalFees).toFixed(2).padStart(10)}`);
      console.log('═'.repeat(110));
      
      // Summary section
      console.log('\n💎 ACCOUNT SUMMARY');
      console.log('─'.repeat(60));
      console.log(`Initial Deposit: $${initialDeposit.toLocaleString()}`);
      console.log(`Current Balance: $${runningBalance.toFixed(2)}`);
      console.log(`Total Return: ${((runningBalance - initialDeposit) / initialDeposit * 100).toFixed(2)}%`);
      console.log(`Total Gross Profit: $${totalProfit.toFixed(2)}`);
      console.log(`Total Swap/Storage: $${totalSwap.toFixed(2)}`);
      console.log(`Total Performance Fees (30%): $${totalFees.toFixed(2)}`);
      console.log(`Net Profit After Fees: $${(totalProfit - totalFees).toFixed(2)}`);
      
      // Monthly details for June, July, August
      console.log('\n📊 JUNE-AUGUST 2025 DETAILS');
      console.log('─'.repeat(60));
      
      ['2025-06', '2025-07', '2025-08'].forEach(monthKey => {
        const data = monthlyData[monthKey];
        if (!data) return;
        
        const monthName = new Date(monthKey + '-01').toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long' 
        });
        const winRate = data.trades > 0 ? (data.wins / data.trades * 100) : 0;
        
        console.log(`\n${monthName}:`);
        console.log(`  • Trades: ${data.trades} (${data.wins} wins, ${data.losses} losses)`);
        console.log(`  • Win Rate: ${winRate.toFixed(1)}%`);
        console.log(`  • Volume: ${data.volume.toFixed(2)} lots`);
        console.log(`  • Gross P/L: $${data.profit.toFixed(2)}`);
        console.log(`  • Swap/Storage: $${data.swap.toFixed(2)}`);
        
        if (data.profit > 0) {
          console.log(`  • 30% Performance Fee: $${(data.profit * PROFIT_FEE_RATE).toFixed(2)}`);
          console.log(`  • Net Profit: $${(data.profit * (1 - PROFIT_FEE_RATE)).toFixed(2)}`);
        } else {
          console.log(`  • No performance fee (loss month)`);
          console.log(`  • Net Loss: $${data.profit.toFixed(2)}`);
        }
        
        if (data.crossMonthTrades > 0) {
          console.log(`  • Note: ${data.crossMonthTrades} trades were opened in previous month(s)`);
        }
      });
      
      // Special note about August
      const augustData = monthlyData['2025-08'];
      if (augustData && augustData.crossMonthTrades > 0) {
        console.log('\n⚠️  AUGUST CLARIFICATION:');
        console.log(`August includes ${augustData.crossMonthTrades} trades that were opened in July`);
        console.log('These trades are counted in August because they CLOSED in August.');
        console.log('This matches standard broker reporting (CSV exports use close time).');
      }
      
    } else {
      console.log('\n❌ No trade data available');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

// Run the report
getGoldCorrectedMonthlyReport().catch(console.error);