/**
 * Position Size Calculator for XAUUSD Martingale Strategy
 * Tiger Funding Prop Firm Compliance
 */

class PositionSizeCalculator {
  constructor(config = {}) {
    this.accountSize = config.accountSize || 118000;
    this.dailyDrawdownLimit = config.dailyDrawdownLimit || 5900; // 5% of $118k
    this.totalDrawdownLimit = config.totalDrawdownLimit || 11800; // 10% of $118k
    this.currentDailyLoss = config.currentDailyLoss || 0;
    this.currentTotalDrawdown = config.currentTotalDrawdown || 0;
    
    // Risk parameters
    this.maxRiskPerTrade = config.maxRiskPerTrade || 0.005; // 0.5% per trade
    this.maxRiskPerCycle = config.maxRiskPerCycle || 0.015; // 1.5% per martingale cycle
    this.maxOpenRisk = config.maxOpenRisk || 0.02; // 2% total open risk
    
    // XAUUSD specifics
    this.pipValue = 10; // $10 per pip per lot
    this.minStopLoss = 20; // Minimum stop in pips
    this.typicalStopLoss = 30; // Typical stop in pips
    
    // Martingale configuration (SAFE DEGRESSIVE)
    this.martingaleConfig = {
      multipliers: [8, 6, 4], // Degressive scaling
      maxLevel: 3,
      skipAfterLevel: 3
    };
  }
  
  /**
   * Calculate safe position size for a trade
   */
  calculatePositionSize(params) {
    const {
      sourceAccountSize = 10000,
      sourceLotSize = 0.01,
      martingaleLevel = 1,
      stopLossPips = 30,
      currentOpenPositions = [],
      forceConservative = false
    } = params;
    
    // Step 1: Check if we can trade at all
    const canTrade = this.canTakeTrade();
    if (!canTrade.allowed) {
      return {
        lotSize: 0,
        reason: canTrade.reason,
        riskAmount: 0,
        riskPercent: 0
      };
    }
    
    // Step 2: Check martingale level
    if (martingaleLevel > this.martingaleConfig.maxLevel) {
      return {
        lotSize: 0,
        reason: `Martingale level ${martingaleLevel} exceeds maximum ${this.martingaleConfig.maxLevel}`,
        riskAmount: 0,
        riskPercent: 0
      };
    }
    
    // Step 3: Calculate base scaling
    const scalingFactor = this.accountSize / sourceAccountSize;
    const multiplier = this.martingaleConfig.multipliers[martingaleLevel - 1];
    let proposedLotSize = sourceLotSize * scalingFactor * multiplier;
    
    // Step 4: Apply conservative mode if needed
    if (forceConservative || this.shouldBeConservative()) {
      proposedLotSize *= 0.5; // Halve the size
    }
    
    // Step 5: Calculate risk for this position
    const riskAmount = proposedLotSize * stopLossPips * this.pipValue;
    const riskPercent = riskAmount / this.accountSize;
    
    // Step 6: Check against risk limits
    const maxAllowedRisk = this.calculateMaxAllowedRisk(currentOpenPositions);
    if (riskAmount > maxAllowedRisk) {
      proposedLotSize = maxAllowedRisk / (stopLossPips * this.pipValue);
    }
    
    // Step 7: Round to valid lot size (0.01 increments)
    const finalLotSize = Math.floor(proposedLotSize * 100) / 100;
    
    // Step 8: Final validation
    const finalRisk = finalLotSize * stopLossPips * this.pipValue;
    const finalRiskPercent = finalRisk / this.accountSize;
    
    return {
      lotSize: finalLotSize,
      riskAmount: finalRisk,
      riskPercent: finalRiskPercent,
      riskInR: 1, // Always 1R by definition
      martingaleLevel,
      stopLossPips,
      maxLoss: finalRisk,
      recommendation: this.getRecommendation(finalRiskPercent, martingaleLevel),
      warnings: this.getWarnings(finalRiskPercent, martingaleLevel, currentOpenPositions)
    };
  }
  
  /**
   * Check if we can take a trade based on current drawdown
   */
  canTakeTrade() {
    // Check daily drawdown
    const remainingDaily = this.dailyDrawdownLimit - Math.abs(this.currentDailyLoss);
    if (remainingDaily < 1000) { // Less than $1000 buffer
      return {
        allowed: false,
        reason: `Insufficient daily drawdown remaining: $${remainingDaily.toFixed(2)}`
      };
    }
    
    // Check total drawdown
    const remainingTotal = this.totalDrawdownLimit - this.currentTotalDrawdown;
    if (remainingTotal < 2000) { // Less than $2000 buffer
      return {
        allowed: false,
        reason: `Insufficient total drawdown remaining: $${remainingTotal.toFixed(2)}`
      };
    }
    
    // Check if we're in recovery mode (lost > 3% today)
    if (Math.abs(this.currentDailyLoss) > this.accountSize * 0.03) {
      return {
        allowed: false,
        reason: `Recovery mode: Daily loss exceeds 3% ($${Math.abs(this.currentDailyLoss).toFixed(2)})`
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Determine if we should be in conservative mode
   */
  shouldBeConservative() {
    // Conservative if daily loss > 2%
    if (Math.abs(this.currentDailyLoss) > this.accountSize * 0.02) {
      return true;
    }
    
    // Conservative if total drawdown > 5%
    if (this.currentTotalDrawdown > this.accountSize * 0.05) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Calculate maximum allowed risk for new position
   */
  calculateMaxAllowedRisk(currentOpenPositions = []) {
    // Calculate current open risk
    const currentOpenRisk = currentOpenPositions.reduce((total, pos) => {
      return total + (pos.lotSize * pos.stopLossPips * this.pipValue);
    }, 0);
    
    // Maximum new risk is the lesser of:
    // 1. Per-trade limit
    const perTradeLimit = this.accountSize * this.maxRiskPerTrade;
    
    // 2. Remaining open risk capacity
    const maxTotalOpen = this.accountSize * this.maxOpenRisk;
    const remainingOpenCapacity = maxTotalOpen - currentOpenRisk;
    
    // 3. Remaining daily capacity
    const remainingDaily = this.dailyDrawdownLimit - Math.abs(this.currentDailyLoss);
    const safeDaily = remainingDaily * 0.5; // Only use 50% of remaining
    
    return Math.min(perTradeLimit, remainingOpenCapacity, safeDaily);
  }
  
  /**
   * Get position sizing recommendation
   */
  getRecommendation(riskPercent, martingaleLevel) {
    if (riskPercent < 0.3) {
      return 'CONSERVATIVE: Low risk position';
    } else if (riskPercent < 0.5) {
      return 'MODERATE: Standard risk position';
    } else if (riskPercent < 0.75) {
      return 'AGGRESSIVE: Higher risk - monitor closely';
    } else {
      return 'DANGEROUS: Risk too high - consider reducing';
    }
  }
  
  /**
   * Generate warnings for the position
   */
  getWarnings(riskPercent, martingaleLevel, openPositions) {
    const warnings = [];
    
    if (martingaleLevel >= 3) {
      warnings.push('FINAL MARTINGALE LEVEL - No further averaging');
    }
    
    if (riskPercent > 0.5) {
      warnings.push(`HIGH RISK: ${(riskPercent * 100).toFixed(2)}% of account at risk`);
    }
    
    if (openPositions.length >= 3) {
      warnings.push('MULTIPLE POSITIONS: Consider closing some before new trades');
    }
    
    const totalOpenRisk = openPositions.reduce((sum, pos) => 
      sum + (pos.lotSize * pos.stopLossPips * this.pipValue), 0
    );
    
    if (totalOpenRisk > this.accountSize * 0.015) {
      warnings.push(`CONCENTRATION RISK: Total open risk ${(totalOpenRisk/this.accountSize*100).toFixed(2)}%`);
    }
    
    if (this.shouldBeConservative()) {
      warnings.push('CONSERVATIVE MODE ACTIVE: Position sizes reduced by 50%');
    }
    
    return warnings;
  }
  
  /**
   * Calculate position size for entire martingale sequence
   */
  calculateMartingaleSequence(params) {
    const {
      sourceAccountSize = 10000,
      baseSourceLots = 0.01,
      stopLossPips = 30,
      takeProfitPips = 45
    } = params;
    
    const sequence = [];
    let totalRisk = 0;
    let totalLots = 0;
    
    for (let level = 1; level <= this.martingaleConfig.maxLevel; level++) {
      const sourceLots = baseSourceLots * level; // Source increases by level
      
      const position = this.calculatePositionSize({
        sourceAccountSize,
        sourceLotSize: sourceLots,
        martingaleLevel: level,
        stopLossPips,
        currentOpenPositions: sequence
      });
      
      if (position.lotSize > 0) {
        totalRisk += position.riskAmount;
        totalLots += position.lotSize;
        
        sequence.push({
          level,
          sourceLots,
          targetLots: position.lotSize,
          risk: position.riskAmount,
          riskPercent: position.riskPercent,
          potentialProfit: position.lotSize * takeProfitPips * this.pipValue
        });
      }
    }
    
    return {
      sequence,
      totalLots,
      totalRisk,
      totalRiskPercent: totalRisk / this.accountSize,
      worstCase: totalRisk,
      bestCase: sequence[sequence.length - 1]?.potentialProfit || 0,
      breakeven: this.calculateBreakeven(sequence, stopLossPips, takeProfitPips),
      expectancy: this.calculateExpectancy(sequence, 0.45) // 45% win rate
    };
  }
  
  /**
   * Calculate breakeven win rate for martingale sequence
   */
  calculateBreakeven(sequence, stopPips, tpPips) {
    if (!sequence.length) return 0;
    
    const totalRisk = sequence.reduce((sum, pos) => sum + pos.risk, 0);
    const finalProfit = sequence[sequence.length - 1].potentialProfit;
    
    // Breakeven = Total Risk / Final Profit
    return totalRisk / finalProfit;
  }
  
  /**
   * Calculate expectancy for the strategy
   */
  calculateExpectancy(sequence, winRate) {
    if (!sequence.length) return 0;
    
    // Calculate probabilities of reaching each level
    const probabilities = [];
    let cumulativeLoss = Math.pow(1 - winRate, 0); // Start with 1
    
    for (let i = 0; i < sequence.length; i++) {
      const probReachLevel = Math.pow(1 - winRate, i);
      const probWinAtLevel = probReachLevel * winRate;
      probabilities.push({
        level: i + 1,
        probReach: probReachLevel,
        probWin: probWinAtLevel,
        profit: sequence[i].potentialProfit - sequence.slice(0, i).reduce((sum, s) => sum + s.risk, 0)
      });
    }
    
    // Add probability of losing all levels
    const probLoseAll = Math.pow(1 - winRate, sequence.length);
    const totalLoss = sequence.reduce((sum, s) => sum + s.risk, 0);
    
    // Calculate expectancy
    let expectancy = 0;
    probabilities.forEach(p => {
      expectancy += p.probWin * p.profit;
    });
    expectancy -= probLoseAll * totalLoss;
    
    return {
      expectancy,
      expectancyPercent: expectancy / this.accountSize,
      probabilities,
      probLoseAll,
      requiredWinRate: this.calculateBreakeven(sequence, 30, 45)
    };
  }
  
  /**
   * Generate complete risk assessment
   */
  generateRiskAssessment(currentState = {}) {
    const assessment = {
      timestamp: new Date().toISOString(),
      account: {
        size: this.accountSize,
        currentDailyLoss: this.currentDailyLoss,
        currentTotalDD: this.currentTotalDrawdown,
        remainingDaily: this.dailyDrawdownLimit - Math.abs(this.currentDailyLoss),
        remainingTotal: this.totalDrawdownLimit - this.currentTotalDrawdown
      },
      
      tradingStatus: this.canTakeTrade(),
      mode: this.shouldBeConservative() ? 'CONSERVATIVE' : 'NORMAL',
      
      // Calculate for different scenarios
      scenarios: {
        normal: this.calculateMartingaleSequence({
          sourceAccountSize: 10000,
          baseSourceLots: 0.01,
          stopLossPips: 30,
          takeProfitPips: 45
        }),
        
        wideStop: this.calculateMartingaleSequence({
          sourceAccountSize: 10000,
          baseSourceLots: 0.01,
          stopLossPips: 50,
          takeProfitPips: 75
        }),
        
        conservative: this.calculateMartingaleSequence({
          sourceAccountSize: 10000,
          baseSourceLots: 0.005, // Half size
          stopLossPips: 25,
          takeProfitPips: 40
        })
      },
      
      recommendations: this.generateRecommendations(currentState)
    };
    
    return assessment;
  }
  
  generateRecommendations(currentState) {
    const recommendations = [];
    
    // Check current drawdown levels
    if (Math.abs(this.currentDailyLoss) > this.accountSize * 0.02) {
      recommendations.push({
        priority: 'HIGH',
        action: 'REDUCE POSITION SIZES',
        reason: 'Daily loss exceeds 2% - enter conservative mode'
      });
    }
    
    if (this.currentTotalDrawdown > this.accountSize * 0.05) {
      recommendations.push({
        priority: 'HIGH',
        action: 'PAUSE NEW TRADES',
        reason: 'Total drawdown exceeds 5% - focus on recovery'
      });
    }
    
    // Check time of day (assuming we have this info)
    const hour = new Date().getHours();
    if (hour >= 20 || hour <= 6) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'AVOID TRADING',
        reason: 'Low liquidity hours - higher spread and slippage risk'
      });
    }
    
    // Always include safety reminders
    recommendations.push({
      priority: 'STANDARD',
      action: 'VERIFY STOPS',
      reason: 'Ensure all positions have stop losses set'
    });
    
    recommendations.push({
      priority: 'STANDARD',
      action: 'MONITOR CORRELATION',
      reason: 'Check for correlated positions (Gold, Silver, USD pairs)'
    });
    
    return recommendations;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PositionSizeCalculator;
}

// Example usage
function demonstrateCalculator() {
  const calculator = new PositionSizeCalculator({
    accountSize: 118000,
    currentDailyLoss: -1500, // Already down $1500 today
    currentTotalDrawdown: 2000 // $2000 from peak
  });
  
  console.log('=== POSITION SIZE CALCULATOR ===\n');
  
  // Calculate single position
  const position = calculator.calculatePositionSize({
    sourceAccountSize: 10000,
    sourceLotSize: 0.01,
    martingaleLevel: 1,
    stopLossPips: 30,
    currentOpenPositions: []
  });
  
  console.log('Single Position:', position);
  
  // Calculate full sequence
  const sequence = calculator.calculateMartingaleSequence({
    sourceAccountSize: 10000,
    baseSourceLots: 0.01,
    stopLossPips: 30,
    takeProfitPips: 45
  });
  
  console.log('\nMartingale Sequence:', JSON.stringify(sequence, null, 2));
  
  // Generate full assessment
  const assessment = calculator.generateRiskAssessment();
  console.log('\nRisk Assessment:', JSON.stringify(assessment, null, 2));
}

// Uncomment to run
// demonstrateCalculator();