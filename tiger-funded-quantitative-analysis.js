#!/usr/bin/env node

/**
 * Tiger Funded Copy Trading Strategy - Quantitative Analysis
 * Analyzes the viability of copying Gold Buy Only trades to Tiger Funded evaluation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load backtest data
const backtestData = JSON.parse(fs.readFileSync(path.join(__dirname, 'backtest-results.json'), 'utf8'));

// ===================== STRATEGY PARAMETERS =====================

const GOLD_ACCOUNT = {
  initial_balance: 5000,
  current_balance: 6297.28,
  total_trades: 197,
  win_rate: 0.746,
  months: 3,
  profit: 1297.28,
  max_position: 0.03,
  largest_loss: -87.01,
  martingale_pct: 0.52
};

const TIGER_FUNDED = {
  account_size: 100000,
  daily_loss_limit: 0.05,     // 5% daily loss limit
  total_drawdown_limit: 0.12, // 12% total drawdown limit
  phase1_target: 0.08,         // 8% profit target
  phase2_target: 0.05,         // 5% profit target
  max_lot_per_position: 2.0,  // Max lots per position
  max_total_lots: 5.0          // Max total lots
};

const POSITION_SCALING = {
  base_multiplier: 20,         // Gold account to Tiger account size ratio
  risk_adjustment: 0.65,       // Risk adjustment factor
  formula: (goldLot) => Math.min(goldLot * 20 * 0.65, TIGER_FUNDED.max_lot_per_position)
};

// ===================== STATISTICAL FUNCTIONS =====================

function calculateStatistics(trades) {
  if (!trades || trades.length === 0) return null;
  
  const profits = trades.map(t => t.profit || 0);
  const wins = profits.filter(p => p > 0);
  const losses = profits.filter(p => p < 0);
  
  // Basic metrics
  const totalProfit = profits.reduce((sum, p) => sum + p, 0);
  const avgProfit = totalProfit / trades.length;
  const winRate = wins.length / trades.length;
  
  // Volatility and risk metrics
  const stdDev = calculateStdDev(profits, avgProfit);
  const downside = losses.length > 0 ? 
    Math.sqrt(losses.reduce((sum, l) => sum + l * l, 0) / losses.length) : 0;
  
  // Sharpe ratio (assuming risk-free rate = 0 for simplicity)
  const sharpeRatio = avgProfit / (stdDev || 1);
  
  // Sortino ratio (uses downside deviation)
  const sortinoRatio = avgProfit / (downside || 1);
  
  // Maximum drawdown
  const { maxDrawdown, maxDrawdownPct, drawdownDuration } = calculateMaxDrawdown(trades);
  
  // Profit factor
  const grossWins = wins.reduce((sum, w) => sum + w, 0);
  const grossLosses = Math.abs(losses.reduce((sum, l) => sum + l, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;
  
  // Kelly Criterion
  const avgWin = wins.length > 0 ? grossWins / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(grossLosses / losses.length) : 0;
  const kellyCriterion = avgLoss > 0 ? ((winRate * avgWin) - ((1 - winRate) * avgLoss)) / avgWin : 0;
  
  return {
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate,
    totalProfit,
    avgProfit,
    avgWin,
    avgLoss,
    largestWin: Math.max(...profits),
    largestLoss: Math.min(...profits),
    stdDev,
    sharpeRatio,
    sortinoRatio,
    profitFactor,
    maxDrawdown,
    maxDrawdownPct,
    drawdownDuration,
    kellyCriterion,
    calmarRatio: maxDrawdownPct !== 0 ? (totalProfit / Math.abs(maxDrawdownPct)) : 0
  };
}

function calculateStdDev(values, mean) {
  if (values.length === 0) return 0;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

function calculateMaxDrawdown(trades) {
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let runningBalance = 0;
  let drawdownStart = null;
  let maxDuration = 0;
  let currentDuration = 0;
  
  trades.forEach(trade => {
    runningBalance += trade.profit || 0;
    
    if (runningBalance > peak) {
      peak = runningBalance;
      if (drawdownStart !== null) {
        maxDuration = Math.max(maxDuration, currentDuration);
        drawdownStart = null;
        currentDuration = 0;
      }
    } else {
      const drawdown = peak - runningBalance;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
      }
      if (drawdownStart === null) {
        drawdownStart = new Date(trade.closeTime || trade.time);
      }
      currentDuration++;
    }
  });
  
  return { maxDrawdown, maxDrawdownPct, drawdownDuration: maxDuration };
}

// ===================== MONTE CARLO SIMULATION =====================

function monteCarloSimulation(trades, initialBalance, numSimulations = 10000, tradingDays = 20) {
  const profits = trades.map(t => t.scaledProfit || t.profit || 0);
  const results = [];
  
  for (let sim = 0; sim < numSimulations; sim++) {
    let balance = initialBalance;
    let maxBalance = balance;
    let maxDailyLoss = 0;
    let maxDrawdown = 0;
    let phase1Passed = false;
    let phase2Passed = false;
    let failed = false;
    let dailyProfits = [];
    
    // Simulate trading days
    for (let day = 0; day < tradingDays; day++) {
      let dailyProfit = 0;
      let dailyTrades = Math.floor(Math.random() * 10) + 1; // 1-10 trades per day
      
      for (let t = 0; t < dailyTrades; t++) {
        // Random sample from historical profits
        const randomProfit = profits[Math.floor(Math.random() * profits.length)];
        dailyProfit += randomProfit;
        balance += randomProfit;
        
        // Track max balance for drawdown
        if (balance > maxBalance) {
          maxBalance = balance;
        }
        
        // Check drawdown
        const currentDrawdown = (maxBalance - balance) / initialBalance;
        if (currentDrawdown > maxDrawdown) {
          maxDrawdown = currentDrawdown;
        }
        
        // Check failure conditions
        if (currentDrawdown > TIGER_FUNDED.total_drawdown_limit) {
          failed = true;
          break;
        }
      }
      
      dailyProfits.push(dailyProfit);
      
      // Check daily loss limit
      const dailyLossPercent = Math.abs(Math.min(0, dailyProfit)) / initialBalance;
      if (dailyLossPercent > TIGER_FUNDED.daily_loss_limit) {
        failed = true;
        break;
      }
      
      if (dailyLossPercent > maxDailyLoss) {
        maxDailyLoss = dailyLossPercent;
      }
      
      // Check profit targets
      const totalReturn = (balance - initialBalance) / initialBalance;
      if (!phase1Passed && totalReturn >= TIGER_FUNDED.phase1_target) {
        phase1Passed = true;
      }
      if (phase1Passed && totalReturn >= TIGER_FUNDED.phase2_target) {
        phase2Passed = true;
      }
      
      if (failed) break;
    }
    
    results.push({
      finalBalance: balance,
      totalReturn: (balance - initialBalance) / initialBalance,
      maxDrawdown,
      maxDailyLoss,
      phase1Passed,
      phase2Passed,
      failed,
      success: phase1Passed && !failed,
      dailyProfits
    });
  }
  
  return results;
}

// ===================== VALUE AT RISK (VaR) CALCULATION =====================

function calculateVaR(profits, confidence = 0.95, periods = 1) {
  const sortedProfits = [...profits].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sortedProfits.length);
  const var_value = sortedProfits[index] * Math.sqrt(periods);
  
  // Calculate CVaR (Conditional VaR / Expected Shortfall)
  const tailLosses = sortedProfits.slice(0, index + 1);
  const cvar = tailLosses.reduce((sum, v) => sum + v, 0) / (tailLosses.length || 1);
  
  return { var: var_value, cvar, confidence };
}

// ===================== OPTIMAL POSITION SIZING =====================

function calculateOptimalPositionSize(stats, accountSize) {
  const { winRate, avgWin, avgLoss, kellyCriterion, maxDrawdownPct } = stats;
  
  // Kelly Criterion with safety factor
  const kellyFraction = Math.max(0, Math.min(kellyCriterion * 0.25, 0.1)); // Use 25% of Kelly with 10% cap
  
  // Risk-based sizing (max 2% risk per trade)
  const maxRiskPerTrade = 0.02;
  const riskBasedSize = maxRiskPerTrade * accountSize / Math.abs(avgLoss || 1);
  
  // Volatility-based sizing
  const volBasedSize = (0.01 * accountSize) / (stats.stdDev || 1);
  
  // Drawdown-adjusted sizing
  const ddAdjustedSize = (1 - (maxDrawdownPct / 100)) * riskBasedSize;
  
  // Take the minimum of all approaches for conservative sizing
  const optimalSize = Math.min(kellyFraction * accountSize, riskBasedSize, volBasedSize, ddAdjustedSize);
  
  return {
    kellySizing: kellyFraction * accountSize,
    riskBasedSizing: riskBasedSize,
    volatilityBasedSizing: volBasedSize,
    drawdownAdjustedSizing: ddAdjustedSize,
    recommendedSize: optimalSize,
    percentOfAccount: (optimalSize / accountSize) * 100
  };
}

// ===================== MAIN ANALYSIS =====================

function runAnalysis() {
  console.log('═'.repeat(80));
  console.log('             TIGER FUNDED COPY TRADING - QUANTITATIVE ANALYSIS');
  console.log('═'.repeat(80));
  
  // 1. Historical Performance Analysis
  console.log('\n📊 1. HISTORICAL PERFORMANCE METRICS');
  console.log('─'.repeat(60));
  
  const allTrades = backtestData.filteredTrades || [];
  const scaledTrades = allTrades.map(t => ({
    ...t,
    scaledProfit: t.profit * POSITION_SCALING.base_multiplier * POSITION_SCALING.risk_adjustment
  }));
  
  const sourceStats = calculateStatistics(allTrades);
  const scaledStats = calculateStatistics(scaledTrades);
  
  console.log('Source Account (Gold Buy Only):');
  console.log(`  • Total Trades: ${GOLD_ACCOUNT.total_trades}`);
  console.log(`  • Win Rate: ${(GOLD_ACCOUNT.win_rate * 100).toFixed(1)}%`);
  console.log(`  • Total Profit: $${GOLD_ACCOUNT.profit.toFixed(2)}`);
  console.log(`  • Monthly Return: ${(GOLD_ACCOUNT.profit / GOLD_ACCOUNT.initial_balance / GOLD_ACCOUNT.months * 100).toFixed(2)}%`);
  console.log(`  • Martingale Usage: ${(GOLD_ACCOUNT.martingale_pct * 100).toFixed(0)}% of trades`);
  
  if (scaledStats) {
    console.log('\nProjected Tiger Funded Performance:');
    console.log(`  • Sharpe Ratio: ${scaledStats.sharpeRatio.toFixed(3)}`);
    console.log(`  • Sortino Ratio: ${scaledStats.sortinoRatio.toFixed(3)}`);
    console.log(`  • Profit Factor: ${scaledStats.profitFactor.toFixed(2)}`);
    console.log(`  • Max Drawdown: ${scaledStats.maxDrawdownPct.toFixed(2)}%`);
    console.log(`  • Calmar Ratio: ${scaledStats.calmarRatio.toFixed(3)}`);
  }
  
  // 2. Risk Metrics
  console.log('\n⚠️  2. RISK ANALYSIS');
  console.log('─'.repeat(60));
  
  const profits = scaledTrades.map(t => t.scaledProfit);
  const var95 = calculateVaR(profits, 0.95, 1);
  const var99 = calculateVaR(profits, 0.99, 1);
  
  console.log('Value at Risk (VaR):');
  console.log(`  • 95% Daily VaR: $${Math.abs(var95.var).toFixed(2)}`);
  console.log(`  • 99% Daily VaR: $${Math.abs(var99.var).toFixed(2)}`);
  console.log(`  • 95% CVaR (Expected Shortfall): $${Math.abs(var95.cvar).toFixed(2)}`);
  
  const dailyVarPct = Math.abs(var95.var) / TIGER_FUNDED.account_size * 100;
  const riskOfDailyBreach = dailyVarPct > TIGER_FUNDED.daily_loss_limit * 100;
  
  console.log(`\nDaily Loss Risk Assessment:`);
  console.log(`  • 95% Daily Loss: ${dailyVarPct.toFixed(2)}% of account`);
  console.log(`  • Tiger Funded Limit: ${(TIGER_FUNDED.daily_loss_limit * 100).toFixed(0)}%`);
  console.log(`  • Risk Level: ${riskOfDailyBreach ? '⚠️ HIGH - Likely to breach' : '✅ ACCEPTABLE'}`);
  
  // 3. Monte Carlo Simulation
  console.log('\n🎲 3. MONTE CARLO SIMULATION (10,000 runs)');
  console.log('─'.repeat(60));
  
  const simResults = monteCarloSimulation(scaledTrades, TIGER_FUNDED.account_size, 10000, 30);
  const successRate = simResults.filter(r => r.success).length / simResults.length;
  const phase1PassRate = simResults.filter(r => r.phase1Passed).length / simResults.length;
  const phase2PassRate = simResults.filter(r => r.phase2Passed).length / simResults.length;
  const failureRate = simResults.filter(r => r.failed).length / simResults.length;
  
  const avgReturn = simResults.reduce((sum, r) => sum + r.totalReturn, 0) / simResults.length;
  const avgMaxDrawdown = simResults.reduce((sum, r) => sum + r.maxDrawdown, 0) / simResults.length;
  
  console.log('Evaluation Success Probability:');
  console.log(`  • Phase 1 Pass Rate: ${(phase1PassRate * 100).toFixed(1)}%`);
  console.log(`  • Phase 2 Pass Rate: ${(phase2PassRate * 100).toFixed(1)}%`);
  console.log(`  • Overall Success Rate: ${(successRate * 100).toFixed(1)}%`);
  console.log(`  • Failure Rate: ${(failureRate * 100).toFixed(1)}%`);
  
  console.log('\nExpected Outcomes:');
  console.log(`  • Average Return: ${(avgReturn * 100).toFixed(2)}%`);
  console.log(`  • Average Max Drawdown: ${(avgMaxDrawdown * 100).toFixed(2)}%`);
  
  // Distribution of outcomes
  const returnBuckets = {
    'Loss': simResults.filter(r => r.totalReturn < 0).length,
    '0-5%': simResults.filter(r => r.totalReturn >= 0 && r.totalReturn < 0.05).length,
    '5-8%': simResults.filter(r => r.totalReturn >= 0.05 && r.totalReturn < 0.08).length,
    '8-12%': simResults.filter(r => r.totalReturn >= 0.08 && r.totalReturn < 0.12).length,
    '>12%': simResults.filter(r => r.totalReturn >= 0.12).length
  };
  
  console.log('\nReturn Distribution:');
  Object.entries(returnBuckets).forEach(([range, count]) => {
    const pct = (count / simResults.length * 100).toFixed(1);
    console.log(`  • ${range}: ${pct}% (${count} simulations)`);
  });
  
  // 4. Optimal Position Sizing
  console.log('\n📏 4. OPTIMAL POSITION SIZING');
  console.log('─'.repeat(60));
  
  if (scaledStats) {
    const optimalSizing = calculateOptimalPositionSize(scaledStats, TIGER_FUNDED.account_size);
    
    console.log('Position Sizing Recommendations:');
    console.log(`  • Kelly Criterion: $${optimalSizing.kellySizing.toFixed(2)}`);
    console.log(`  • Risk-Based (2% max): $${optimalSizing.riskBasedSizing.toFixed(2)}`);
    console.log(`  • Volatility-Based: $${optimalSizing.volatilityBasedSizing.toFixed(2)}`);
    console.log(`  • Drawdown-Adjusted: $${optimalSizing.drawdownAdjustedSizing.toFixed(2)}`);
    console.log(`\n  ★ RECOMMENDED SIZE: $${optimalSizing.recommendedSize.toFixed(2)} (${optimalSizing.percentOfAccount.toFixed(2)}% of account)`);
    
    // Convert to lot sizing
    const recommendedLotMultiplier = optimalSizing.percentOfAccount / 100 * POSITION_SCALING.base_multiplier;
    console.log(`\n  Adjusted Scaling Formula:`);
    console.log(`  Tiger Lot = Gold Lot × ${recommendedLotMultiplier.toFixed(2)} × ${POSITION_SCALING.risk_adjustment}`);
  }
  
  // 5. Statistical Edge Analysis
  console.log('\n📈 5. STATISTICAL EDGE ANALYSIS');
  console.log('─'.repeat(60));
  
  if (scaledStats) {
    const edge = (scaledStats.winRate * scaledStats.avgWin) - ((1 - scaledStats.winRate) * Math.abs(scaledStats.avgLoss));
    const edgePercent = (edge / TIGER_FUNDED.account_size) * 100;
    
    console.log('Expected Value per Trade:');
    console.log(`  • Average Edge: $${edge.toFixed(2)} per trade`);
    console.log(`  • Edge as % of Account: ${edgePercent.toFixed(3)}%`);
    console.log(`  • Monthly Expected Value: $${(edge * 60).toFixed(2)} (assuming 60 trades/month)`);
    console.log(`  • Required Trades for Phase 1: ${Math.ceil((TIGER_FUNDED.phase1_target * TIGER_FUNDED.account_size) / edge)}`);
    
    // Confidence intervals
    const stdError = scaledStats.stdDev / Math.sqrt(scaledStats.totalTrades);
    const confidence95 = 1.96 * stdError;
    
    console.log('\n95% Confidence Interval for Returns:');
    console.log(`  • Lower Bound: $${(edge - confidence95).toFixed(2)} per trade`);
    console.log(`  • Upper Bound: $${(edge + confidence95).toFixed(2)} per trade`);
  }
  
  // 6. Final Recommendations
  console.log('\n✅ 6. RECOMMENDATIONS');
  console.log('─'.repeat(60));
  
  const recommendations = [];
  
  // Success probability assessment
  if (successRate > 0.7) {
    recommendations.push('✅ HIGH SUCCESS PROBABILITY - Strategy shows strong potential');
  } else if (successRate > 0.5) {
    recommendations.push('⚠️ MODERATE SUCCESS PROBABILITY - Consider risk adjustments');
  } else {
    recommendations.push('❌ LOW SUCCESS PROBABILITY - Strategy needs significant modification');
  }
  
  // Position sizing recommendation
  if (dailyVarPct < TIGER_FUNDED.daily_loss_limit * 100 * 0.5) {
    recommendations.push('✅ POSITION SIZING - Current scaling is conservative and safe');
  } else if (dailyVarPct < TIGER_FUNDED.daily_loss_limit * 100) {
    recommendations.push('⚠️ POSITION SIZING - Close to daily limit, reduce by 20-30%');
  } else {
    recommendations.push('❌ POSITION SIZING - Too aggressive, reduce by 50%');
  }
  
  // Martingale assessment
  if (GOLD_ACCOUNT.martingale_pct > 0.3) {
    recommendations.push('⚠️ MARTINGALE RISK - High usage (52%), implement strict filters');
  }
  
  // Optimal formula
  const optimalMultiplier = successRate > 0.6 ? 13 : 10;
  recommendations.push(`📊 OPTIMAL FORMULA: Tiger Lot = Gold Lot × ${optimalMultiplier} × 0.65`);
  
  console.log('Strategy Assessment:');
  recommendations.forEach(rec => console.log(`  ${rec}`));
  
  console.log('\nRisk Management Rules:');
  console.log('  1. Stop copying if daily loss exceeds 3% (safety buffer)');
  console.log('  2. Reduce position size by 50% after 2 consecutive losses');
  console.log('  3. Maximum 3 concurrent positions during high volatility');
  console.log('  4. Skip trades during major news events');
  console.log('  5. Implement time-based filters (avoid Asian session martingale)');
  
  console.log('\n═'.repeat(80));
  console.log('                         END OF QUANTITATIVE ANALYSIS');
  console.log('═'.repeat(80));
}

// Run the analysis
runAnalysis();