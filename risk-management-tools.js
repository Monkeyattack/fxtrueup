#!/usr/bin/env node

/**
 * Risk Management Tools Suite
 * Position sizing, R-multiple tracking, and risk assessment
 */

import fs from 'fs/promises';
import path from 'path';

// ============================================
// POSITION SIZE CALCULATOR
// ============================================

class PositionSizeCalculator {
  constructor(accountBalance, maxRiskPercent = 1) {
    this.accountBalance = accountBalance;
    this.maxRiskPercent = maxRiskPercent;
    this.instruments = {
      'XAUUSD': { pipValue: 10, name: 'Gold' },      // $10 per pip per lot
      'EURUSD': { pipValue: 10, name: 'Euro' },      // $10 per pip per lot
      'GBPUSD': { pipValue: 10, name: 'Cable' },     // $10 per pip per lot  
      'USDJPY': { pipValue: 9.1, name: 'Yen' },      // Approx $9.10 per pip per lot
      'USDCAD': { pipValue: 7.7, name: 'Loonie' }    // Approx $7.70 per pip per lot
    };
  }

  calculate(instrument, stopLossPips, riskPercent = null) {
    const risk = riskPercent || this.maxRiskPercent;
    const riskAmount = this.accountBalance * (risk / 100);
    const pipValuePerLot = this.instruments[instrument]?.pipValue || 10;
    
    const dollarsPerPip = riskAmount / stopLossPips;
    const positionSizeLots = dollarsPerPip / pipValuePerLot;
    
    // Kelly Criterion calculation (optional)
    const kelly = this.calculateKelly(0.61, 1.5); // Using actual win rate from backtest
    const kellyLots = (this.accountBalance * kelly / 100) / (stopLossPips * pipValuePerLot);
    
    return {
      instrument,
      accountBalance: this.accountBalance,
      riskPercent: risk,
      riskAmount: riskAmount.toFixed(2),
      stopLossPips,
      dollarsPerPip: dollarsPerPip.toFixed(2),
      positionSizeLots: positionSizeLots.toFixed(2),
      kellyRecommended: kellyLots.toFixed(2),
      maxLoss: riskAmount.toFixed(2),
      breakEvenPips: Math.ceil(stopLossPips * 0.1), // Assuming 0.1 spread/commission
      targetPips: Math.ceil(stopLossPips * 1.5) // 1.5R target
    };
  }
  
  calculateKelly(winRate, avgWinLossRatio) {
    // Kelly % = (p * b - q) / b
    // p = win probability, q = loss probability, b = win/loss ratio
    const q = 1 - winRate;
    const kelly = (winRate * avgWinLossRatio - q) / avgWinLossRatio;
    // Use 1/4 Kelly for safety
    return Math.max(0, Math.min(kelly * 0.25 * 100, this.maxRiskPercent));
  }
  
  generateSizeTable(instrument, stopLossList = [20, 30, 40, 50, 75, 100]) {
    console.log('\n📊 POSITION SIZE TABLE');
    console.log(`Account: $${this.accountBalance.toLocaleString()}`);
    console.log(`Instrument: ${instrument}`);
    console.log(`Max Risk: ${this.maxRiskPercent}%`);
    console.log('═'.repeat(70));
    console.log('Stop Loss | Risk $ | Position Size | $/pip | Break Even | Target');
    console.log('─'.repeat(70));
    
    stopLossList.forEach(sl => {
      const calc = this.calculate(instrument, sl);
      console.log(
        `${sl.toString().padStart(9)} | ` +
        `$${calc.riskAmount.padStart(6)} | ` +
        `${calc.positionSizeLots.padStart(13)} | ` +
        `$${calc.dollarsPerPip.padStart(5)} | ` +
        `${calc.breakEvenPips.toString().padStart(10)} | ` +
        `${calc.targetPips.toString().padStart(6)}`
      );
    });
    console.log('═'.repeat(70));
  }
}

// ============================================
// R-MULTIPLE TRACKER
// ============================================

class RMultipleTracker {
  constructor(accountBalance, riskPerTrade = 1) {
    this.accountBalance = accountBalance;
    this.riskPerTrade = riskPerTrade;
    this.oneR = accountBalance * (riskPerTrade / 100);
    this.trades = [];
  }
  
  addTrade(entry, exit, lotSize, stopLoss, isWin) {
    const profitLoss = (exit - entry) * lotSize * 10; // Assuming Gold
    const riskAmount = Math.abs(entry - stopLoss) * lotSize * 10;
    const rMultiple = profitLoss / riskAmount;
    
    const trade = {
      id: this.trades.length + 1,
      entry,
      exit,
      stopLoss,
      lotSize,
      profitLoss: profitLoss.toFixed(2),
      riskAmount: riskAmount.toFixed(2),
      rMultiple: rMultiple.toFixed(2),
      isWin,
      cumulative: 0
    };
    
    this.trades.push(trade);
    this.updateCumulative();
    return trade;
  }
  
  updateCumulative() {
    let cumR = 0;
    this.trades.forEach(trade => {
      cumR += parseFloat(trade.rMultiple);
      trade.cumulative = cumR.toFixed(2);
    });
  }
  
  getStatistics() {
    if (this.trades.length === 0) return null;
    
    const wins = this.trades.filter(t => t.isWin);
    const losses = this.trades.filter(t => !t.isWin);
    const rMultiples = this.trades.map(t => parseFloat(t.rMultiple));
    
    const totalR = rMultiples.reduce((sum, r) => sum + r, 0);
    const avgR = totalR / this.trades.length;
    const winRate = (wins.length / this.trades.length) * 100;
    
    const avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + parseFloat(t.rMultiple), 0) / wins.length 
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + parseFloat(t.rMultiple), 0) / losses.length
      : 0;
    
    const expectancy = (winRate/100 * avgWin) + ((100-winRate)/100 * avgLoss);
    const profitFactor = Math.abs(avgWin * wins.length / (avgLoss * losses.length || 1));
    
    // Calculate max drawdown in R
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    
    this.trades.forEach(trade => {
      cumulative += parseFloat(trade.rMultiple);
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
    
    return {
      totalTrades: this.trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: winRate.toFixed(1),
      totalR: totalR.toFixed(2),
      averageR: avgR.toFixed(2),
      avgWinR: avgWin.toFixed(2),
      avgLossR: avgLoss.toFixed(2),
      expectancy: expectancy.toFixed(3),
      profitFactor: profitFactor.toFixed(2),
      maxDrawdownR: maxDrawdown.toFixed(2),
      accountGrowth: ((totalR * this.riskPerTrade)).toFixed(1) + '%'
    };
  }
  
  displayReport() {
    const stats = this.getStatistics();
    if (!stats) {
      console.log('No trades to analyze');
      return;
    }
    
    console.log('\n📈 R-MULTIPLE PERFORMANCE REPORT');
    console.log('═'.repeat(50));
    console.log(`Total Trades: ${stats.totalTrades}`);
    console.log(`Wins: ${stats.wins} | Losses: ${stats.losses}`);
    console.log(`Win Rate: ${stats.winRate}%`);
    console.log('─'.repeat(50));
    console.log(`Total R: ${stats.totalR}R`);
    console.log(`Average R: ${stats.averageR}R`);
    console.log(`Avg Win: ${stats.avgWinR}R`);
    console.log(`Avg Loss: ${stats.avgLossR}R`);
    console.log('─'.repeat(50));
    console.log(`Expectancy: ${stats.expectancy}R per trade`);
    console.log(`Profit Factor: ${stats.profitFactor}`);
    console.log(`Max Drawdown: ${stats.maxDrawdownR}R`);
    console.log(`Account Growth: ${stats.accountGrowth}`);
    console.log('═'.repeat(50));
  }
  
  exportToCSV(filename = 'r-multiples.csv') {
    const headers = 'ID,Entry,Exit,Stop,Lots,P&L,Risk,R-Multiple,Win/Loss,Cumulative R\n';
    const rows = this.trades.map(t => 
      `${t.id},${t.entry},${t.exit},${t.stopLoss},${t.lotSize},` +
      `${t.profitLoss},${t.riskAmount},${t.rMultiple},` +
      `${t.isWin ? 'WIN' : 'LOSS'},${t.cumulative}`
    ).join('\n');
    
    return fs.writeFile(filename, headers + rows);
  }
}

// ============================================
// RISK CORRELATION MATRIX
// ============================================

class CorrelationAnalyzer {
  constructor() {
    this.positions = [];
    this.correlations = {
      'XAUUSD': { 'XAGUSD': 0.85, 'EURUSD': -0.3, 'USDJPY': -0.4 },
      'EURUSD': { 'GBPUSD': 0.7, 'AUDUSD': 0.6, 'USDJPY': -0.5 },
      'GBPUSD': { 'EURUSD': 0.7, 'AUDUSD': 0.5, 'USDJPY': -0.4 },
      'USDJPY': { 'EURJPY': 0.8, 'GBPJPY': 0.8, 'AUDJPY': 0.7 }
    };
  }
  
  addPosition(symbol, direction, lotSize, stopLoss) {
    this.positions.push({ symbol, direction, lotSize, stopLoss });
  }
  
  calculateTotalExposure() {
    const exposure = {};
    
    this.positions.forEach(pos => {
      if (!exposure[pos.symbol]) exposure[pos.symbol] = 0;
      exposure[pos.symbol] += pos.direction === 'BUY' ? pos.lotSize : -pos.lotSize;
    });
    
    // Calculate correlated exposure
    const correlatedExposure = {};
    
    Object.keys(exposure).forEach(symbol1 => {
      correlatedExposure[symbol1] = exposure[symbol1];
      
      Object.keys(exposure).forEach(symbol2 => {
        if (symbol1 !== symbol2) {
          const correlation = this.correlations[symbol1]?.[symbol2] || 0;
          correlatedExposure[symbol1] += exposure[symbol2] * correlation;
        }
      });
    });
    
    return { direct: exposure, correlated: correlatedExposure };
  }
  
  assessRisk() {
    const exposure = this.calculateTotalExposure();
    const totalRisk = Object.values(exposure.correlated)
      .reduce((sum, exp) => sum + Math.abs(exp), 0);
    
    let riskLevel = 'LOW';
    if (totalRisk > 3) riskLevel = 'HIGH';
    else if (totalRisk > 1.5) riskLevel = 'MODERATE';
    
    return {
      exposure,
      totalRisk: totalRisk.toFixed(2),
      riskLevel,
      recommendation: this.getRecommendation(riskLevel)
    };
  }
  
  getRecommendation(riskLevel) {
    switch(riskLevel) {
      case 'HIGH':
        return 'Reduce position sizes or close correlated trades';
      case 'MODERATE':
        return 'Monitor closely, consider hedging';
      case 'LOW':
        return 'Risk within acceptable limits';
    }
  }
}

// ============================================
// VALUE AT RISK (VAR) CALCULATOR
// ============================================

class ValueAtRisk {
  constructor(accountBalance, confidence = 95) {
    this.accountBalance = accountBalance;
    this.confidence = confidence;
    this.zScores = { 90: 1.645, 95: 1.96, 99: 2.576 };
  }
  
  calculateParametricVaR(volatility, holdingPeriod = 1) {
    const z = this.zScores[this.confidence];
    const dailyVol = volatility / Math.sqrt(252); // Annual to daily
    const periodVol = dailyVol * Math.sqrt(holdingPeriod);
    const var95 = this.accountBalance * z * periodVol;
    
    return {
      method: 'Parametric',
      confidence: this.confidence,
      holdingPeriod,
      volatility: (volatility * 100).toFixed(2) + '%',
      valueAtRisk: var95.toFixed(2),
      percentOfAccount: ((var95 / this.accountBalance) * 100).toFixed(2) + '%'
    };
  }
  
  monteCarloVaR(returns, simulations = 10000) {
    const results = [];
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    for (let i = 0; i < simulations; i++) {
      // Generate random return using normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const simulatedReturn = mean + stdDev * z;
      results.push(this.accountBalance * simulatedReturn);
    }
    
    results.sort((a, b) => a - b);
    const varIndex = Math.floor((1 - this.confidence / 100) * simulations);
    const var95 = Math.abs(results[varIndex]);
    
    return {
      method: 'Monte Carlo',
      confidence: this.confidence,
      simulations,
      valueAtRisk: var95.toFixed(2),
      percentOfAccount: ((var95 / this.accountBalance) * 100).toFixed(2) + '%',
      worstCase: Math.abs(results[0]).toFixed(2),
      bestCase: results[results.length - 1].toFixed(2)
    };
  }
}

// ============================================
// STRESS TESTING
// ============================================

class StressTester {
  constructor(accountBalance) {
    this.accountBalance = accountBalance;
    this.scenarios = {
      'Flash Crash': { drawdown: 0.15, probability: 0.05 },
      'Black Swan': { drawdown: 0.25, probability: 0.01 },
      'Normal Correction': { drawdown: 0.05, probability: 0.30 },
      'Trend Reversal': { drawdown: 0.10, probability: 0.15 }
    };
  }
  
  runScenario(scenarioName, currentPositions) {
    const scenario = this.scenarios[scenarioName];
    const loss = this.accountBalance * scenario.drawdown;
    const newBalance = this.accountBalance - loss;
    const survivalRate = (newBalance / this.accountBalance) * 100;
    
    // Calculate position impact
    let positionLoss = 0;
    currentPositions.forEach(pos => {
      positionLoss += pos.lotSize * 1000 * scenario.drawdown; // Rough estimate
    });
    
    return {
      scenario: scenarioName,
      drawdown: (scenario.drawdown * 100).toFixed(1) + '%',
      loss: loss.toFixed(2),
      newBalance: newBalance.toFixed(2),
      survivalRate: survivalRate.toFixed(1) + '%',
      positionLoss: positionLoss.toFixed(2),
      probability: (scenario.probability * 100).toFixed(1) + '%',
      expectedLoss: (loss * scenario.probability).toFixed(2)
    };
  }
  
  runAllScenarios(currentPositions = []) {
    console.log('\n⚠️ STRESS TEST RESULTS');
    console.log('═'.repeat(80));
    console.log(`Account Balance: $${this.accountBalance.toLocaleString()}`);
    console.log('─'.repeat(80));
    
    const results = [];
    let totalExpectedLoss = 0;
    
    Object.keys(this.scenarios).forEach(name => {
      const result = this.runScenario(name, currentPositions);
      results.push(result);
      totalExpectedLoss += parseFloat(result.expectedLoss);
      
      console.log(`\nScenario: ${name}`);
      console.log(`  Drawdown: ${result.drawdown}`);
      console.log(`  Loss: $${result.loss}`);
      console.log(`  New Balance: $${result.newBalance}`);
      console.log(`  Survival Rate: ${result.survivalRate}`);
      console.log(`  Probability: ${result.probability}`);
      console.log(`  Expected Loss: $${result.expectedLoss}`);
    });
    
    console.log('\n─'.repeat(80));
    console.log(`Total Expected Loss (weighted): $${totalExpectedLoss.toFixed(2)}`);
    console.log(`Risk-Adjusted Account Value: $${(this.accountBalance - totalExpectedLoss).toFixed(2)}`);
    console.log('═'.repeat(80));
    
    return results;
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('🛡️ RISK MANAGEMENT TOOLS SUITE');
  console.log('═'.repeat(80));
  
  const ACCOUNT_BALANCE = 118000;
  const RISK_PER_TRADE = 1; // 1%
  
  // 1. Position Size Calculator
  console.log('\n1️⃣ POSITION SIZE CALCULATOR');
  const calculator = new PositionSizeCalculator(ACCOUNT_BALANCE, RISK_PER_TRADE);
  calculator.generateSizeTable('XAUUSD');
  
  // Show specific calculation
  const calc = calculator.calculate('XAUUSD', 50);
  console.log('\nExample: 50 pip stop on Gold');
  console.log(`  Position Size: ${calc.positionSizeLots} lots`);
  console.log(`  Risk Amount: $${calc.riskAmount}`);
  console.log(`  Kelly Size: ${calc.kellyRecommended} lots`);
  
  // 2. R-Multiple Tracker (using actual backtest data)
  console.log('\n2️⃣ R-MULTIPLE TRACKER');
  const tracker = new RMultipleTracker(ACCOUNT_BALANCE, RISK_PER_TRADE);
  
  // Add sample trades from backtest
  tracker.addTrade(3391.09, 3343.68, 0.50, 3441.09, false); // -47 pip loss
  tracker.addTrade(3355.64, 3363.91, 0.50, 3305.64, true);  // +8 pip win
  tracker.addTrade(3375.15, 3373.20, 0.50, 3425.15, false); // -2 pip loss
  tracker.addTrade(3379.12, 3389.70, 0.50, 3329.12, true);  // +10 pip win
  
  tracker.displayReport();
  
  // 3. Correlation Analysis
  console.log('\n3️⃣ CORRELATION ANALYSIS');
  const correlator = new CorrelationAnalyzer();
  correlator.addPosition('XAUUSD', 'BUY', 0.50, 50);
  correlator.addPosition('XAGUSD', 'BUY', 0.30, 100);
  
  const risk = correlator.assessRisk();
  console.log(`Total Correlated Risk: ${risk.totalRisk} lots`);
  console.log(`Risk Level: ${risk.riskLevel}`);
  console.log(`Recommendation: ${risk.recommendation}`);
  
  // 4. Value at Risk
  console.log('\n4️⃣ VALUE AT RISK (VaR)');
  const var95 = new ValueAtRisk(ACCOUNT_BALANCE, 95);
  
  // Parametric VaR
  const paramVaR = var95.calculateParametricVaR(0.15); // 15% annual volatility
  console.log(`\nParametric VaR (95% confidence):`);
  console.log(`  Daily VaR: $${paramVaR.valueAtRisk}`);
  console.log(`  As % of Account: ${paramVaR.percentOfAccount}`);
  
  // Monte Carlo VaR
  const returns = [-0.02, 0.01, -0.005, 0.015, -0.01, 0.02, -0.03, 0.025];
  const monteVaR = var95.monteCarloVaR(returns, 10000);
  console.log(`\nMonte Carlo VaR (10,000 simulations):`);
  console.log(`  VaR (95%): $${monteVaR.valueAtRisk}`);
  console.log(`  Worst Case: $${monteVaR.worstCase}`);
  console.log(`  Best Case: $${monteVaR.bestCase}`);
  
  // 5. Stress Testing
  const stressTester = new StressTester(ACCOUNT_BALANCE);
  const currentPositions = [
    { symbol: 'XAUUSD', lotSize: 0.50 }
  ];
  stressTester.runAllScenarios(currentPositions);
  
  // Export R-Multiple data
  await tracker.exportToCSV('r-multiple-tracking.csv');
  console.log('\n✅ R-Multiple data exported to r-multiple-tracking.csv');
  
  // Create risk limits file
  const riskLimits = {
    account: {
      balance: ACCOUNT_BALANCE,
      currency: 'USD',
      broker: 'FTMO'
    },
    limits: {
      maxRiskPerTrade: 1,  // %
      maxDailyLoss: 5,     // %
      maxTotalDrawdown: 10, // %
      maxPositions: 3,
      maxCorrelatedExposure: 2, // lots
      maxLeverageUsed: 10
    },
    positionSizing: {
      method: 'Fixed Percentage',
      percentage: 1,
      kellyFraction: 0.25,
      adjustForVolatility: true
    },
    stopLossRules: {
      required: true,
      maxPips: 100,
      trailingActivation: 30,
      breakEvenAt: 20
    },
    alerts: {
      drawdown5Percent: true,
      consecutiveLosses: 3,
      dailyLossLimit: 2000,
      marginLevel: 200
    }
  };
  
  await fs.writeFile(
    'risk-limits.json',
    JSON.stringify(riskLimits, null, 2)
  );
  console.log('✅ Risk limits saved to risk-limits.json');
  
  console.log('\n' + '═'.repeat(80));
  console.log('🏁 Risk Management Analysis Complete');
  console.log('═'.repeat(80));
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  PositionSizeCalculator,
  RMultipleTracker,
  CorrelationAnalyzer,
  ValueAtRisk,
  StressTester
};