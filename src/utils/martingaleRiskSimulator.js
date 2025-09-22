/**
 * Monte Carlo Simulation for Martingale Strategy Risk Assessment
 * Tiger Funding $118k Account - XAUUSD Trading
 */

class MartingaleRiskSimulator {
  constructor(config = {}) {
    this.accountSize = config.accountSize || 118000;
    this.dailyDrawdownLimit = config.dailyLimit || 0.05; // 5%
    this.totalDrawdownLimit = config.totalLimit || 0.10; // 10%
    this.simulations = config.simulations || 10000;
    
    // Position sizing configurations
    this.strategies = {
      original: {
        name: 'Original Proposed',
        multipliers: [10, 7.5, 6.67],
        baseLots: [0.01, 0.02, 0.03],
        targetLots: [0.10, 0.15, 0.20]
      },
      degressive: {
        name: 'Degressive Safe',
        multipliers: [8, 6, 4],
        baseLots: [0.01, 0.02, 0.03],
        targetLots: [0.08, 0.12, 0.12]
      },
      conservative: {
        name: 'Conservative Fixed',
        multipliers: [5, 4, 3.33],
        baseLots: [0.01, 0.02, 0.03],
        targetLots: [0.05, 0.08, 0.10]
      }
    };
    
    // XAUUSD characteristics
    this.instrument = {
      pipValue: 10, // $10 per pip per lot
      avgVolatility: 35, // pips
      stopLoss: {
        min: 20,
        typical: 30,
        max: 50,
        catastrophic: 75
      },
      winRate: 0.45, // Typical for trend following
      avgWinPips: 45,
      avgLossPips: 30
    };
  }
  
  /**
   * Run Monte Carlo simulation for a strategy
   */
  runSimulation(strategyName, numTrades = 1000) {
    const strategy = this.strategies[strategyName];
    if (!strategy) throw new Error(`Strategy ${strategyName} not found`);
    
    const results = [];
    
    for (let sim = 0; sim < this.simulations; sim++) {
      const simResult = this.simulateTradingSequence(strategy, numTrades);
      results.push(simResult);
    }
    
    return this.analyzeResults(results, strategy);
  }
  
  /**
   * Simulate a single trading sequence
   */
  simulateTradingSequence(strategy, numTrades) {
    let balance = this.accountSize;
    let peakBalance = balance;
    let maxDrawdown = 0;
    let maxDailyLoss = 0;
    let currentDailyLoss = 0;
    let martingaleLevel = 0;
    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;
    let trades = [];
    let accountBlown = false;
    let hitDailyLimit = false;
    let hitTotalLimit = false;
    
    for (let i = 0; i < numTrades; i++) {
      // Reset daily loss every 20 trades (simulating new day)
      if (i % 20 === 0) {
        maxDailyLoss = Math.max(maxDailyLoss, currentDailyLoss);
        currentDailyLoss = 0;
      }
      
      // Determine if trade wins or loses
      const isWin = Math.random() < this.instrument.winRate;
      
      // Calculate position size based on martingale level
      const lotSize = this.calculateLotSize(strategy, martingaleLevel);
      
      // Calculate P&L
      let pips;
      if (isWin) {
        pips = this.randomNormal(this.instrument.avgWinPips, 10);
        martingaleLevel = 0; // Reset on win
        consecutiveLosses = 0;
      } else {
        // Simulate different stop loss scenarios
        const stopScenario = Math.random();
        if (stopScenario < 0.7) {
          pips = -this.instrument.stopLoss.typical;
        } else if (stopScenario < 0.9) {
          pips = -this.instrument.stopLoss.max;
        } else if (stopScenario < 0.98) {
          pips = -this.instrument.stopLoss.catastrophic;
        } else {
          // 2% chance of extreme slippage
          pips = -this.instrument.stopLoss.catastrophic * 1.5;
        }
        
        martingaleLevel = Math.min(martingaleLevel + 1, 3);
        consecutiveLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
      }
      
      const pl = lotSize * Math.abs(pips) * this.instrument.pipValue * (pips > 0 ? 1 : -1);
      balance += pl;
      currentDailyLoss = Math.min(currentDailyLoss, pl);
      
      // Track peak and drawdown
      if (balance > peakBalance) {
        peakBalance = balance;
      }
      const currentDrawdown = (peakBalance - balance) / this.accountSize;
      maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
      
      // Check for breaches
      if (Math.abs(currentDailyLoss) > this.accountSize * this.dailyDrawdownLimit) {
        hitDailyLimit = true;
      }
      
      if (currentDrawdown > this.totalDrawdownLimit) {
        hitTotalLimit = true;
        accountBlown = true;
        break;
      }
      
      trades.push({
        trade: i + 1,
        martingaleLevel,
        lotSize,
        pips,
        pl,
        balance,
        drawdown: currentDrawdown * 100
      });
    }
    
    return {
      finalBalance: balance,
      totalReturn: (balance - this.accountSize) / this.accountSize,
      maxDrawdown,
      maxDailyLoss: Math.abs(maxDailyLoss) / this.accountSize,
      maxConsecutiveLosses,
      hitDailyLimit,
      hitTotalLimit,
      accountBlown,
      trades: trades.slice(-10) // Last 10 trades for inspection
    };
  }
  
  /**
   * Calculate lot size based on martingale level
   */
  calculateLotSize(strategy, level) {
    if (level >= strategy.targetLots.length) {
      return 0; // Skip trades beyond level 3
    }
    return strategy.targetLots[level];
  }
  
  /**
   * Generate random number with normal distribution
   */
  randomNormal(mean, stdDev) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return num * stdDev + mean;
  }
  
  /**
   * Analyze simulation results
   */
  analyzeResults(results, strategy) {
    const analysis = {
      strategy: strategy.name,
      simulations: results.length,
      
      // Account survival
      survivalRate: results.filter(r => !r.accountBlown).length / results.length,
      dailyLimitBreaches: results.filter(r => r.hitDailyLimit).length / results.length,
      totalLimitBreaches: results.filter(r => r.hitTotalLimit).length / results.length,
      
      // Returns
      avgReturn: this.average(results.map(r => r.totalReturn)),
      medianReturn: this.median(results.map(r => r.totalReturn)),
      bestReturn: Math.max(...results.map(r => r.totalReturn)),
      worstReturn: Math.min(...results.map(r => r.totalReturn)),
      
      // Drawdowns
      avgMaxDrawdown: this.average(results.map(r => r.maxDrawdown)),
      worst5PercentDrawdown: this.percentile(results.map(r => r.maxDrawdown), 95),
      worst1PercentDrawdown: this.percentile(results.map(r => r.maxDrawdown), 99),
      
      // Daily losses
      avgMaxDailyLoss: this.average(results.map(r => r.maxDailyLoss)),
      worst5PercentDaily: this.percentile(results.map(r => r.maxDailyLoss), 95),
      
      // Consecutive losses
      avgMaxConsecutive: this.average(results.map(r => r.maxConsecutiveLosses)),
      worstConsecutive: Math.max(...results.map(r => r.maxConsecutiveLosses)),
      
      // Risk metrics
      sharpeRatio: this.calculateSharpe(results),
      sortinoRatio: this.calculateSortino(results),
      calmarRatio: this.calculateCalmar(results),
      
      // Value at Risk (VaR)
      var95: this.calculateVaR(results, 0.95),
      var99: this.calculateVaR(results, 0.99),
      cvar95: this.calculateCVaR(results, 0.95),
      
      // Distribution
      profitableSims: results.filter(r => r.totalReturn > 0).length / results.length,
      distribution: this.getDistribution(results)
    };
    
    return analysis;
  }
  
  /**
   * Statistical helper functions
   */
  average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  
  median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  
  percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }
  
  standardDeviation(arr) {
    const avg = this.average(arr);
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(this.average(squareDiffs));
  }
  
  calculateSharpe(results) {
    const returns = results.map(r => r.totalReturn);
    const avgReturn = this.average(returns);
    const stdDev = this.standardDeviation(returns);
    return avgReturn / stdDev;
  }
  
  calculateSortino(results) {
    const returns = results.map(r => r.totalReturn);
    const avgReturn = this.average(returns);
    const negativeReturns = returns.filter(r => r < 0);
    const downside = Math.sqrt(this.average(negativeReturns.map(r => r * r)));
    return avgReturn / downside;
  }
  
  calculateCalmar(results) {
    const avgReturn = this.average(results.map(r => r.totalReturn));
    const maxDD = Math.max(...results.map(r => r.maxDrawdown));
    return avgReturn / maxDD;
  }
  
  calculateVaR(results, confidence) {
    const returns = results.map(r => r.totalReturn);
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return sorted[index];
  }
  
  calculateCVaR(results, confidence) {
    const returns = results.map(r => r.totalReturn);
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    const tail = sorted.slice(0, index + 1);
    return this.average(tail);
  }
  
  getDistribution(results) {
    const returns = results.map(r => r.totalReturn * 100);
    const bins = [];
    for (let i = -100; i <= 100; i += 10) {
      const count = returns.filter(r => r >= i && r < i + 10).length;
      bins.push({ range: `${i}% to ${i + 10}%`, count, percentage: count / returns.length });
    }
    return bins.filter(b => b.count > 0);
  }
  
  /**
   * Generate comprehensive risk report
   */
  generateRiskReport() {
    const report = {
      timestamp: new Date().toISOString(),
      accountSize: this.accountSize,
      limits: {
        daily: this.dailyDrawdownLimit * 100 + '%',
        total: this.totalDrawdownLimit * 100 + '%'
      },
      strategies: {}
    };
    
    // Run simulations for each strategy
    for (const strategyName in this.strategies) {
      console.log(`Running ${this.simulations} simulations for ${strategyName}...`);
      report.strategies[strategyName] = this.runSimulation(strategyName);
    }
    
    // Add comparative analysis
    report.recommendation = this.generateRecommendation(report.strategies);
    
    return report;
  }
  
  /**
   * Generate recommendation based on simulation results
   */
  generateRecommendation(strategies) {
    let bestStrategy = null;
    let bestScore = -Infinity;
    
    for (const name in strategies) {
      const s = strategies[name];
      // Weighted scoring: survival most important, then returns, then drawdown
      const score = (s.survivalRate * 100) + 
                   (s.avgReturn * 50) - 
                   (s.avgMaxDrawdown * 75) - 
                   (s.dailyLimitBreaches * 25);
      
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = name;
      }
    }
    
    const best = strategies[bestStrategy];
    
    return {
      recommended: bestStrategy,
      riskScore: this.calculateRiskScore(best),
      keyMetrics: {
        survivalRate: (best.survivalRate * 100).toFixed(1) + '%',
        expectedReturn: (best.avgReturn * 100).toFixed(1) + '%',
        maxDrawdown95: (best.worst5PercentDrawdown * 100).toFixed(1) + '%',
        dailyBreachRisk: (best.dailyLimitBreaches * 100).toFixed(1) + '%'
      },
      warnings: this.generateWarnings(best)
    };
  }
  
  calculateRiskScore(analysis) {
    // 1-10 scale based on multiple factors
    let score = 10;
    
    // Deduct for poor survival
    score -= (1 - analysis.survivalRate) * 3;
    
    // Deduct for high drawdowns
    score -= analysis.avgMaxDrawdown * 2;
    
    // Deduct for daily limit breaches
    score -= analysis.dailyLimitBreaches * 2;
    
    // Deduct for negative expected return
    if (analysis.avgReturn < 0) score -= 2;
    
    // Ensure score is between 1 and 10
    return Math.max(1, Math.min(10, score));
  }
  
  generateWarnings(analysis) {
    const warnings = [];
    
    if (analysis.survivalRate < 0.95) {
      warnings.push(`HIGH RISK: ${((1 - analysis.survivalRate) * 100).toFixed(1)}% chance of account termination`);
    }
    
    if (analysis.dailyLimitBreaches > 0.1) {
      warnings.push(`DAILY LIMIT RISK: ${(analysis.dailyLimitBreaches * 100).toFixed(1)}% chance of breaching daily limit`);
    }
    
    if (analysis.worst5PercentDrawdown > 0.08) {
      warnings.push(`DRAWDOWN RISK: 5% worst case scenario exceeds 8% drawdown`);
    }
    
    if (analysis.avgReturn < 0) {
      warnings.push(`NEGATIVE EXPECTANCY: Strategy has negative expected return`);
    }
    
    if (analysis.worstConsecutive > 7) {
      warnings.push(`SEQUENCE RISK: Worst case ${analysis.worstConsecutive} consecutive losses`);
    }
    
    return warnings;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MartingaleRiskSimulator;
}

// Example usage
function runRiskAnalysis() {
  const simulator = new MartingaleRiskSimulator({
    accountSize: 118000,
    dailyLimit: 0.05,
    totalLimit: 0.10,
    simulations: 10000
  });
  
  const report = simulator.generateRiskReport();
  
  console.log('\n=== MARTINGALE STRATEGY RISK ANALYSIS ===\n');
  console.log(JSON.stringify(report, null, 2));
  
  return report;
}

// Uncomment to run
// runRiskAnalysis();