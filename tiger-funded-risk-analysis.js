#!/usr/bin/env node

/**
 * Tiger Funded Copy Trading Risk Analysis
 * 
 * Comprehensive risk assessment for copying Gold Buy Only strategy to Tiger Funded account
 * 
 * Tiger Funded Rules:
 * - 5% max daily loss (calculated at 8 PM EST)
 * - 12% max total drawdown
 * - Profit targets: 8% (Phase 1), 5% (Phase 2)
 * - Martingale and hedging are ALLOWED
 * 
 * Source Account Stats:
 * - $5,000 balance with 25.9% return over 3 months
 * - 74.6% win rate overall
 * - 52% of trades use martingale/grid patterns
 * - Largest single loss: -$87.01 (1.74% of account)
 */

import fs from 'fs';

// Source account historical data based on actual performance
const sourceAccountStats = {
  balance: 5000,
  totalReturn: 25.9, // percentage over 3 months
  monthlyReturn: 8.63, // average monthly return
  winRate: 74.6,
  totalTrades: 197,
  martingaleTrades: 102,
  nonMartingaleTrades: 95,
  largestSingleLoss: -87.01,
  largestMartingaleSequence: -362.31, // sum of losses before recovery
  averageWin: 23.45,
  averageLoss: -31.78,
  maxPositionsHeld: 23,
  maxTotalVolume: 0.37, // lots
  averageHoldTime: 4.2 // hours
};

// Tiger Funded account settings
const tigerFundedAccount = {
  balance: 100000, // Example balance
  maxDailyLoss: 5, // percentage
  maxTotalDrawdown: 12, // percentage
  profitTargetPhase1: 8, // percentage
  profitTargetPhase2: 5, // percentage
  evaluationPeriod: 30, // days
  dailyCalculationTime: 20 // 8 PM EST
};

// Proposed risk settings
const proposedSettings = {
  scalingFactor: 0.65, // Conservative scaling
  maxSinglePosition: 2.0, // lots
  maxTotalExposure: 5.0, // lots
  maxMartingaleLevels: 3,
  dailyLossStop: 4.5, // percentage - buffer before 5%
  emergencyStop: 8.0, // percentage total drawdown
  positionFormula: 'Tiger Lot = Gold Lot × (Tiger Balance / 5000) × 0.65'
};

class RiskAssessment {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      sourceStats: sourceAccountStats,
      tigerRules: tigerFundedAccount,
      proposedSettings: proposedSettings,
      analysis: {},
      stressTests: [],
      recommendations: [],
      warnings: [],
      verdict: null
    };
  }

  // Calculate position sizing based on formula
  calculatePositionSize(goldLot, tigerBalance) {
    const baseFactor = tigerBalance / sourceAccountStats.balance;
    const scaledLot = goldLot * baseFactor * proposedSettings.scalingFactor;
    
    // Apply maximum limits
    const finalLot = Math.min(scaledLot, proposedSettings.maxSinglePosition);
    
    return {
      goldLot,
      tigerBalance,
      baseFactor: baseFactor.toFixed(2),
      scalingFactor: proposedSettings.scalingFactor,
      calculatedLot: scaledLot.toFixed(2),
      finalLot: finalLot.toFixed(2),
      cappedByLimit: scaledLot > proposedSettings.maxSinglePosition
    };
  }

  // Calculate R-multiples for risk management
  calculateRMultiples() {
    const tigerBalance = tigerFundedAccount.balance;
    const oneR = tigerBalance * 0.01; // 1% risk per trade
    
    const analysis = {
      oneR: oneR,
      maxDailyRisk: (tigerBalance * tigerFundedAccount.maxDailyLoss / 100) / oneR,
      maxTotalRisk: (tigerBalance * tigerFundedAccount.maxTotalDrawdown / 100) / oneR,
      
      // Calculate scaled losses
      scaledLargestLoss: sourceAccountStats.largestSingleLoss * 
        (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor,
      scaledMartingaleSequence: sourceAccountStats.largestMartingaleSequence * 
        (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor
    };
    
    // Express scaled losses in R terms
    analysis.largestLossInR = analysis.scaledLargestLoss / oneR;
    analysis.martingaleSequenceInR = analysis.scaledMartingaleSequence / oneR;
    
    // Calculate safety margins
    analysis.dailyLossSafetyMargin = 
      ((tigerBalance * tigerFundedAccount.maxDailyLoss / 100) - Math.abs(analysis.scaledMartingaleSequence)) / 
      (tigerBalance * tigerFundedAccount.maxDailyLoss / 100) * 100;
    
    analysis.totalDrawdownSafetyMargin = 
      ((tigerBalance * tigerFundedAccount.maxTotalDrawdown / 100) - Math.abs(analysis.scaledMartingaleSequence)) / 
      (tigerBalance * tigerFundedAccount.maxTotalDrawdown / 100) * 100;
    
    return analysis;
  }

  // Calculate expectancy
  calculateExpectancy() {
    const winProb = sourceAccountStats.winRate / 100;
    const lossProb = 1 - winProb;
    
    const avgWinScaled = sourceAccountStats.averageWin * 
      (tigerFundedAccount.balance / sourceAccountStats.balance) * proposedSettings.scalingFactor;
    const avgLossScaled = Math.abs(sourceAccountStats.averageLoss) * 
      (tigerFundedAccount.balance / sourceAccountStats.balance) * proposedSettings.scalingFactor;
    
    const expectancy = (winProb * avgWinScaled) - (lossProb * avgLossScaled);
    const expectancyPercentage = (expectancy / tigerFundedAccount.balance) * 100;
    
    // Calculate trades needed for profit targets
    const tradesForPhase1 = Math.ceil((tigerFundedAccount.balance * tigerFundedAccount.profitTargetPhase1 / 100) / expectancy);
    const tradesForPhase2 = Math.ceil((tigerFundedAccount.balance * tigerFundedAccount.profitTargetPhase2 / 100) / expectancy);
    
    // Estimate days needed based on average trades per day
    const avgTradesPerDay = sourceAccountStats.totalTrades / 90; // 3 months = ~90 days
    const daysForPhase1 = Math.ceil(tradesForPhase1 / avgTradesPerDay);
    const daysForPhase2 = Math.ceil(tradesForPhase2 / avgTradesPerDay);
    
    return {
      winProbability: winProb,
      lossProbability: lossProb,
      averageWinScaled: avgWinScaled.toFixed(2),
      averageLossScaled: avgLossScaled.toFixed(2),
      expectancyPerTrade: expectancy.toFixed(2),
      expectancyPercentage: expectancyPercentage.toFixed(4),
      tradesForPhase1,
      tradesForPhase2,
      estimatedDaysPhase1: daysForPhase1,
      estimatedDaysPhase2: daysForPhase2,
      withinEvaluationPeriod: daysForPhase1 <= tigerFundedAccount.evaluationPeriod
    };
  }

  // Monte Carlo simulation for stress testing
  runMonteCarloSimulation(numSimulations = 10000) {
    const results = [];
    const tigerBalance = tigerFundedAccount.balance;
    const maxDailyLossAmount = tigerBalance * tigerFundedAccount.maxDailyLoss / 100;
    const maxTotalDrawdownAmount = tigerBalance * tigerFundedAccount.maxTotalDrawdown / 100;
    
    for (let sim = 0; sim < numSimulations; sim++) {
      let balance = tigerBalance;
      let maxDrawdown = 0;
      let currentDrawdown = 0;
      let dailyLoss = 0;
      let tradeCount = 0;
      let busted = false;
      let passedPhase1 = false;
      let dayCount = 0;
      let tradesInDay = 0;
      
      // Simulate 30 days of trading
      for (let day = 0; day < 30; day++) {
        dailyLoss = 0;
        tradesInDay = Math.floor(Math.random() * 5) + 1; // 1-5 trades per day
        
        for (let trade = 0; trade < tradesInDay; trade++) {
          tradeCount++;
          
          // Determine if this is a martingale sequence
          const isMartingale = Math.random() < 0.52; // 52% martingale trades
          
          let tradeResult;
          if (isMartingale && Math.random() < 0.15) { // 15% chance of bad martingale
            // Simulate a martingale sequence loss
            tradeResult = -(Math.random() * 300 + 100) * 
              (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor;
          } else if (Math.random() < sourceAccountStats.winRate / 100) {
            // Win
            tradeResult = (Math.random() * 40 + 10) * 
              (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor;
          } else {
            // Loss
            tradeResult = -(Math.random() * 50 + 10) * 
              (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor;
          }
          
          balance += tradeResult;
          dailyLoss += Math.min(0, tradeResult);
          
          // Track drawdown
          currentDrawdown = Math.min(0, balance - tigerBalance);
          maxDrawdown = Math.min(maxDrawdown, currentDrawdown);
          
          // Check stop conditions
          if (Math.abs(dailyLoss) > maxDailyLossAmount) {
            busted = true;
            break;
          }
          
          if (Math.abs(maxDrawdown) > maxTotalDrawdownAmount) {
            busted = true;
            break;
          }
        }
        
        if (busted) break;
        dayCount++;
        
        // Check if passed Phase 1
        if ((balance - tigerBalance) / tigerBalance >= tigerFundedAccount.profitTargetPhase1 / 100) {
          passedPhase1 = true;
        }
      }
      
      results.push({
        finalBalance: balance,
        profit: balance - tigerBalance,
        profitPercentage: ((balance - tigerBalance) / tigerBalance) * 100,
        maxDrawdown: maxDrawdown,
        maxDrawdownPercentage: (maxDrawdown / tigerBalance) * 100,
        tradeCount,
        dayCount,
        busted,
        passedPhase1,
        hitDailyLimit: Math.abs(dailyLoss) > maxDailyLossAmount
      });
    }
    
    // Analyze results
    const successfulSims = results.filter(r => !r.busted);
    const passedPhase1Sims = results.filter(r => r.passedPhase1 && !r.busted);
    const bustedSims = results.filter(r => r.busted);
    const dailyLimitHits = results.filter(r => r.hitDailyLimit);
    
    const avgProfit = successfulSims.reduce((sum, r) => sum + r.profit, 0) / successfulSims.length;
    const avgDrawdown = results.reduce((sum, r) => sum + Math.abs(r.maxDrawdown), 0) / results.length;
    
    return {
      totalSimulations: numSimulations,
      survivalRate: (successfulSims.length / numSimulations * 100).toFixed(2),
      phase1PassRate: (passedPhase1Sims.length / numSimulations * 100).toFixed(2),
      bustRate: (bustedSims.length / numSimulations * 100).toFixed(2),
      dailyLimitHitRate: (dailyLimitHits.length / numSimulations * 100).toFixed(2),
      
      survivors: {
        count: successfulSims.length,
        averageProfit: avgProfit.toFixed(2),
        averageProfitPercentage: (avgProfit / tigerBalance * 100).toFixed(2)
      },
      
      failures: {
        count: bustedSims.length,
        byDailyLimit: dailyLimitHits.length,
        byTotalDrawdown: bustedSims.length - dailyLimitHits.length
      },
      
      riskMetrics: {
        averageMaxDrawdown: avgDrawdown.toFixed(2),
        averageMaxDrawdownPercentage: (avgDrawdown / tigerBalance * 100).toFixed(2),
        worstDrawdown: Math.min(...results.map(r => r.maxDrawdown)).toFixed(2),
        bestProfit: Math.max(...results.map(r => r.profit)).toFixed(2)
      }
    };
  }

  // Stress test specific scenarios
  runStressTests() {
    const tests = [];
    const tigerBalance = tigerFundedAccount.balance;
    
    // Test 1: Worst historical day repeated
    tests.push({
      name: 'Worst Historical Day Repeated',
      scenario: 'The largest martingale sequence loss happens',
      loss: sourceAccountStats.largestMartingaleSequence * 
        (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor,
      percentLoss: (Math.abs(sourceAccountStats.largestMartingaleSequence) / sourceAccountStats.balance * 
        proposedSettings.scalingFactor * 100).toFixed(2),
      breachesDailyLimit: Math.abs(sourceAccountStats.largestMartingaleSequence * 
        (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor) > 
        (tigerBalance * tigerFundedAccount.maxDailyLoss / 100),
      survives: Math.abs(sourceAccountStats.largestMartingaleSequence * 
        (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor) < 
        (tigerBalance * tigerFundedAccount.maxDailyLoss / 100)
    });
    
    // Test 2: Multiple martingale failures in one day
    tests.push({
      name: 'Multiple Martingale Failures',
      scenario: '3 martingale sequences fail in one day',
      loss: sourceAccountStats.largestMartingaleSequence * 3 * 0.5 * // Assume 50% of worst case each
        (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor,
      percentLoss: (Math.abs(sourceAccountStats.largestMartingaleSequence * 3 * 0.5) / 
        sourceAccountStats.balance * proposedSettings.scalingFactor * 100).toFixed(2),
      breachesDailyLimit: true,
      survives: false
    });
    
    // Test 3: 10 consecutive losses
    const avgLoss = Math.abs(sourceAccountStats.averageLoss);
    tests.push({
      name: '10 Consecutive Losses',
      scenario: '10 trades lose in a row at average loss',
      loss: avgLoss * 10 * (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor,
      percentLoss: (avgLoss * 10 / sourceAccountStats.balance * proposedSettings.scalingFactor * 100).toFixed(2),
      breachesDailyLimit: (avgLoss * 10 * (tigerBalance / sourceAccountStats.balance) * 
        proposedSettings.scalingFactor) > (tigerBalance * tigerFundedAccount.maxDailyLoss / 100),
      survives: (avgLoss * 10 * (tigerBalance / sourceAccountStats.balance) * 
        proposedSettings.scalingFactor) < (tigerBalance * tigerFundedAccount.maxDailyLoss / 100)
    });
    
    // Test 4: Max positions all lose
    tests.push({
      name: 'Maximum Positions All Lose',
      scenario: 'All max concurrent positions (23) close at loss',
      loss: avgLoss * 23 * (tigerBalance / sourceAccountStats.balance) * proposedSettings.scalingFactor,
      percentLoss: (avgLoss * 23 / sourceAccountStats.balance * proposedSettings.scalingFactor * 100).toFixed(2),
      breachesDailyLimit: true,
      survives: false
    });
    
    // Test 5: Black swan event
    tests.push({
      name: 'Black Swan Event',
      scenario: 'Market gaps 200 pips against all positions',
      estimatedLoss: proposedSettings.maxTotalExposure * 200 * 10, // $10 per pip per lot
      percentLoss: (proposedSettings.maxTotalExposure * 200 * 10 / tigerBalance * 100).toFixed(2),
      breachesDailyLimit: true,
      survives: (proposedSettings.maxTotalExposure * 200 * 10) < (tigerBalance * tigerFundedAccount.maxTotalDrawdown / 100)
    });
    
    return tests;
  }

  // Generate recommendations based on analysis
  generateRecommendations() {
    const recommendations = [];
    const warnings = [];
    const rMultiples = this.calculateRMultiples();
    const expectancy = this.calculateExpectancy();
    
    // Position sizing recommendations
    if (proposedSettings.scalingFactor > 0.5) {
      recommendations.push({
        category: 'Position Sizing',
        recommendation: 'Consider reducing scaling factor to 0.5 or lower',
        reason: 'Current scaling factor of 0.65 may be too aggressive for martingale strategies',
        priority: 'HIGH'
      });
    }
    
    recommendations.push({
      category: 'Position Sizing',
      recommendation: 'Implement dynamic position sizing based on daily P&L',
      reason: 'Reduce position size by 50% after any loss exceeding 2% of balance',
      priority: 'MEDIUM'
    });
    
    // Martingale level recommendations
    recommendations.push({
      category: 'Martingale Control',
      recommendation: `Limit martingale to ${proposedSettings.maxMartingaleLevels} levels maximum`,
      reason: 'Each additional level exponentially increases risk',
      priority: 'HIGH'
    });
    
    recommendations.push({
      category: 'Martingale Control',
      recommendation: 'Skip martingale sequences near daily calculation time (7-9 PM EST)',
      reason: 'Avoid having open martingale sequences during daily loss calculation',
      priority: 'HIGH'
    });
    
    // Stop loss recommendations
    recommendations.push({
      category: 'Risk Limits',
      recommendation: `Set hard stop at ${proposedSettings.dailyLossStop}% daily loss`,
      reason: `Provides 0.5% buffer before Tiger's 5% daily limit`,
      priority: 'CRITICAL'
    });
    
    recommendations.push({
      category: 'Risk Limits',
      recommendation: 'Implement time-based stops for martingale sequences',
      reason: 'Close all martingale positions if not recovered within 4 hours',
      priority: 'MEDIUM'
    });
    
    // Monitoring recommendations
    recommendations.push({
      category: 'Monitoring',
      recommendation: 'Set up real-time drawdown alerts at 2%, 3%, and 4% levels',
      reason: 'Early warning system to prevent limit breaches',
      priority: 'HIGH'
    });
    
    recommendations.push({
      category: 'Monitoring',
      recommendation: 'Track correlation between Gold positions and market volatility',
      reason: 'Gold martingale strategies perform poorly in high volatility',
      priority: 'MEDIUM'
    });
    
    // Time-based recommendations
    if (expectancy.estimatedDaysPhase1 > 25) {
      warnings.push({
        category: 'Timeline Risk',
        warning: `Phase 1 may take ${expectancy.estimatedDaysPhase1} days, close to 30-day limit`,
        impact: 'Risk of failing evaluation due to time constraints',
        severity: 'MEDIUM'
      });
    }
    
    // Risk warnings
    if (rMultiples.dailyLossSafetyMargin < 30) {
      warnings.push({
        category: 'Daily Loss Risk',
        warning: `Only ${rMultiples.dailyLossSafetyMargin.toFixed(1)}% safety margin for daily loss`,
        impact: 'High risk of breaching 5% daily loss limit',
        severity: 'HIGH'
      });
    }
    
    warnings.push({
      category: 'Martingale Risk',
      warning: '52% of source trades use martingale - high risk strategy',
      impact: 'Single bad sequence could blow the account',
      severity: 'HIGH'
    });
    
    warnings.push({
      category: 'Scalability Risk',
      warning: 'Strategy uses up to 23 concurrent positions',
      impact: 'May hit broker position limits or margin requirements',
      severity: 'MEDIUM'
    });
    
    return { recommendations, warnings };
  }

  // Calculate overall risk score
  calculateRiskScore() {
    let score = 100; // Start with perfect score
    const factors = [];
    
    const rMultiples = this.calculateRMultiples();
    const monteCarloResults = this.runMonteCarloSimulation(1000);
    
    // Factor 1: Survival rate from Monte Carlo
    const survivalPenalty = (100 - parseFloat(monteCarloResults.survivalRate)) * 0.5;
    score -= survivalPenalty;
    factors.push({
      factor: 'Survival Rate',
      value: `${monteCarloResults.survivalRate}%`,
      penalty: survivalPenalty.toFixed(1),
      weight: '50%'
    });
    
    // Factor 2: Daily loss safety margin
    if (rMultiples.dailyLossSafetyMargin < 50) {
      const marginPenalty = (50 - rMultiples.dailyLossSafetyMargin) * 0.3;
      score -= marginPenalty;
      factors.push({
        factor: 'Daily Loss Margin',
        value: `${rMultiples.dailyLossSafetyMargin.toFixed(1)}%`,
        penalty: marginPenalty.toFixed(1),
        weight: '30%'
      });
    }
    
    // Factor 3: Martingale usage
    const martingalePenalty = (sourceAccountStats.martingaleTrades / sourceAccountStats.totalTrades) * 20;
    score -= martingalePenalty;
    factors.push({
      factor: 'Martingale Usage',
      value: `${(sourceAccountStats.martingaleTrades / sourceAccountStats.totalTrades * 100).toFixed(1)}%`,
      penalty: martingalePenalty.toFixed(1),
      weight: '20%'
    });
    
    // Factor 4: Phase 1 pass rate
    if (parseFloat(monteCarloResults.phase1PassRate) < 70) {
      const passPenalty = (70 - parseFloat(monteCarloResults.phase1PassRate)) * 0.2;
      score -= passPenalty;
      factors.push({
        factor: 'Phase 1 Success Rate',
        value: `${monteCarloResults.phase1PassRate}%`,
        penalty: passPenalty.toFixed(1),
        weight: '20%'
      });
    }
    
    // Determine risk level
    let riskLevel, recommendation;
    if (score >= 80) {
      riskLevel = 'LOW';
      recommendation = 'Safe to proceed with careful monitoring';
    } else if (score >= 60) {
      riskLevel = 'MEDIUM';
      recommendation = 'Proceed with caution and strict risk controls';
    } else if (score >= 40) {
      riskLevel = 'HIGH';
      recommendation = 'Significant adjustments needed before proceeding';
    } else {
      riskLevel = 'EXTREME';
      recommendation = 'NOT recommended - unacceptable risk level';
    }
    
    return {
      score: Math.max(0, score).toFixed(1),
      riskLevel,
      recommendation,
      factors
    };
  }

  // Generate comprehensive report
  generateReport() {
    console.log('Generating Tiger Funded Copy Trading Risk Assessment...\n');
    
    // Run all analyses
    this.results.analysis.rMultiples = this.calculateRMultiples();
    this.results.analysis.expectancy = this.calculateExpectancy();
    this.results.analysis.positionSizing = this.calculatePositionSize(0.01, tigerFundedAccount.balance);
    this.results.stressTests = this.runStressTests();
    
    const monteCarloResults = this.runMonteCarloSimulation(10000);
    this.results.analysis.monteCarlo = monteCarloResults;
    
    const { recommendations, warnings } = this.generateRecommendations();
    this.results.recommendations = recommendations;
    this.results.warnings = warnings;
    
    this.results.analysis.riskScore = this.calculateRiskScore();
    
    // Determine final verdict
    const survivalRate = parseFloat(monteCarloResults.survivalRate);
    const phase1PassRate = parseFloat(monteCarloResults.phase1PassRate);
    
    if (survivalRate >= 80 && phase1PassRate >= 60) {
      this.results.verdict = {
        decision: 'PROCEED WITH CAUTION',
        confidence: 'MEDIUM',
        rationale: `${survivalRate}% survival rate and ${phase1PassRate}% Phase 1 success rate are acceptable with proper risk management`
      };
    } else if (survivalRate >= 60 && phase1PassRate >= 40) {
      this.results.verdict = {
        decision: 'RISKY - ADJUSTMENTS REQUIRED',
        confidence: 'LOW',
        rationale: `${survivalRate}% survival rate is marginal. Reduce position sizing and martingale levels.`
      };
    } else {
      this.results.verdict = {
        decision: 'DO NOT PROCEED',
        confidence: 'HIGH',
        rationale: `${survivalRate}% survival rate is too low. Strategy has unacceptable risk for Tiger Funded.`
      };
    }
    
    return this.results;
  }

  // Save report to file
  saveReport(filename = 'tiger-funded-risk-report.json') {
    const report = this.generateReport();
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`Report saved to ${filename}`);
    return report;
  }
}

// Execute risk assessment
async function runRiskAssessment() {
  const assessment = new RiskAssessment();
  const report = assessment.saveReport();
  
  // Display summary
  console.log('\n' + '='.repeat(80));
  console.log('TIGER FUNDED COPY TRADING RISK ASSESSMENT - EXECUTIVE SUMMARY');
  console.log('='.repeat(80));
  
  console.log('\n1. POSITION SIZING ANALYSIS');
  console.log('-'.repeat(40));
  console.log(`Formula: ${proposedSettings.positionFormula}`);
  console.log(`Example: 0.01 Gold lot → ${report.analysis.positionSizing.finalLot} Tiger lot`);
  console.log(`Max single position: ${proposedSettings.maxSinglePosition} lots`);
  console.log(`Max total exposure: ${proposedSettings.maxTotalExposure} lots`);
  
  console.log('\n2. RISK METRICS (R-MULTIPLES)');
  console.log('-'.repeat(40));
  console.log(`1R (1% risk): $${report.analysis.rMultiples.oneR.toFixed(2)}`);
  console.log(`Largest loss in R: ${Math.abs(report.analysis.rMultiples.largestLossInR).toFixed(2)}R`);
  console.log(`Martingale sequence in R: ${Math.abs(report.analysis.rMultiples.martingaleSequenceInR).toFixed(2)}R`);
  console.log(`Daily loss safety margin: ${report.analysis.rMultiples.dailyLossSafetyMargin.toFixed(1)}%`);
  
  console.log('\n3. EXPECTANCY ANALYSIS');
  console.log('-'.repeat(40));
  console.log(`Win rate: ${(report.analysis.expectancy.winProbability * 100).toFixed(1)}%`);
  console.log(`Expectancy per trade: $${report.analysis.expectancy.expectancyPerTrade}`);
  console.log(`Days to Phase 1 (8%): ${report.analysis.expectancy.estimatedDaysPhase1} days`);
  console.log(`Within 30-day limit: ${report.analysis.expectancy.withinEvaluationPeriod ? 'YES' : 'NO'}`);
  
  console.log('\n4. MONTE CARLO SIMULATION (10,000 runs)');
  console.log('-'.repeat(40));
  console.log(`Survival rate: ${report.analysis.monteCarlo.survivalRate}%`);
  console.log(`Phase 1 pass rate: ${report.analysis.monteCarlo.phase1PassRate}%`);
  console.log(`Account bust rate: ${report.analysis.monteCarlo.bustRate}%`);
  console.log(`Daily limit hit rate: ${report.analysis.monteCarlo.dailyLimitHitRate}%`);
  console.log(`Average max drawdown: ${report.analysis.monteCarlo.riskMetrics.averageMaxDrawdownPercentage}%`);
  
  console.log('\n5. STRESS TEST RESULTS');
  console.log('-'.repeat(40));
  report.stressTests.forEach(test => {
    const status = test.survives ? '✅ SURVIVES' : '❌ FAILS';
    console.log(`${test.name}: ${status} (${test.percentLoss}% loss)`);
  });
  
  console.log('\n6. RISK SCORE');
  console.log('-'.repeat(40));
  console.log(`Overall Risk Score: ${report.analysis.riskScore.score}/100`);
  console.log(`Risk Level: ${report.analysis.riskScore.riskLevel}`);
  console.log(`Recommendation: ${report.analysis.riskScore.recommendation}`);
  
  console.log('\n7. TOP WARNINGS');
  console.log('-'.repeat(40));
  report.warnings.slice(0, 3).forEach(warning => {
    console.log(`⚠️  [${warning.severity}] ${warning.warning}`);
  });
  
  console.log('\n8. KEY RECOMMENDATIONS');
  console.log('-'.repeat(40));
  report.recommendations
    .filter(r => r.priority === 'CRITICAL' || r.priority === 'HIGH')
    .slice(0, 5)
    .forEach(rec => {
      console.log(`• [${rec.priority}] ${rec.recommendation}`);
    });
  
  console.log('\n9. FINAL VERDICT');
  console.log('='.repeat(80));
  console.log(`Decision: ${report.verdict.decision}`);
  console.log(`Confidence: ${report.verdict.confidence}`);
  console.log(`Rationale: ${report.verdict.rationale}`);
  console.log('='.repeat(80));
  
  // Save detailed markdown report
  saveMarkdownReport(report);
}

// Generate markdown report for better readability
function saveMarkdownReport(report) {
  let markdown = `# Tiger Funded Copy Trading Risk Assessment Report

Generated: ${report.timestamp}

## Executive Summary

**Verdict: ${report.verdict.decision}**
- Confidence Level: ${report.verdict.confidence}
- Rationale: ${report.verdict.rationale}

## Risk Score: ${report.analysis.riskScore.score}/100 (${report.analysis.riskScore.riskLevel})

${report.analysis.riskScore.recommendation}

### Risk Score Breakdown
`;

  report.analysis.riskScore.factors.forEach(factor => {
    markdown += `- **${factor.factor}**: ${factor.value} (Penalty: -${factor.penalty} points)\n`;
  });

  markdown += `

## 1. Strategy Overview

### Source Account Performance
- Balance: $${report.sourceStats.balance}
- Total Return: ${report.sourceStats.totalReturn}% over 3 months
- Monthly Average: ${report.sourceStats.monthlyReturn}%
- Win Rate: ${report.sourceStats.winRate}%
- Martingale Usage: ${((report.sourceStats.martingaleTrades / report.sourceStats.totalTrades) * 100).toFixed(1)}%

### Tiger Funded Requirements
- Max Daily Loss: ${report.tigerRules.maxDailyLoss}%
- Max Total Drawdown: ${report.tigerRules.maxTotalDrawdown}%
- Phase 1 Target: ${report.tigerRules.profitTargetPhase1}%
- Phase 2 Target: ${report.tigerRules.profitTargetPhase2}%
- Evaluation Period: ${report.tigerRules.evaluationPeriod} days

## 2. Proposed Risk Settings

\`\`\`
${report.proposedSettings.positionFormula}
\`\`\`

- Scaling Factor: ${report.proposedSettings.scalingFactor}
- Max Single Position: ${report.proposedSettings.maxSinglePosition} lots
- Max Total Exposure: ${report.proposedSettings.maxTotalExposure} lots
- Max Martingale Levels: ${report.proposedSettings.maxMartingaleLevels}
- Daily Loss Stop: ${report.proposedSettings.dailyLossStop}%
- Emergency Stop: ${report.proposedSettings.emergencyStop}%

## 3. Risk Analysis

### R-Multiple Analysis
- 1R (1% risk): $${report.analysis.rMultiples.oneR.toFixed(2)}
- Scaled Largest Loss: $${Math.abs(report.analysis.rMultiples.scaledLargestLoss).toFixed(2)} (${Math.abs(report.analysis.rMultiples.largestLossInR).toFixed(2)}R)
- Scaled Martingale Sequence: $${Math.abs(report.analysis.rMultiples.scaledMartingaleSequence).toFixed(2)} (${Math.abs(report.analysis.rMultiples.martingaleSequenceInR).toFixed(2)}R)
- Daily Loss Safety Margin: ${report.analysis.rMultiples.dailyLossSafetyMargin.toFixed(1)}%
- Total Drawdown Safety Margin: ${report.analysis.rMultiples.totalDrawdownSafetyMargin.toFixed(1)}%

### Expectancy Calculation
- Win Probability: ${(report.analysis.expectancy.winProbability * 100).toFixed(1)}%
- Average Win (scaled): $${report.analysis.expectancy.averageWinScaled}
- Average Loss (scaled): $${report.analysis.expectancy.averageLossScaled}
- **Expectancy per Trade: $${report.analysis.expectancy.expectancyPerTrade}**
- Trades for Phase 1: ${report.analysis.expectancy.tradesForPhase1}
- Estimated Days to Phase 1: ${report.analysis.expectancy.estimatedDaysPhase1}
- Within Evaluation Period: ${report.analysis.expectancy.withinEvaluationPeriod ? '✅ Yes' : '❌ No'}

## 4. Monte Carlo Simulation Results (10,000 runs)

### Success Metrics
- **Survival Rate: ${report.analysis.monteCarlo.survivalRate}%**
- **Phase 1 Pass Rate: ${report.analysis.monteCarlo.phase1PassRate}%**
- Account Bust Rate: ${report.analysis.monteCarlo.bustRate}%
- Daily Limit Hit Rate: ${report.analysis.monteCarlo.dailyLimitHitRate}%

### Performance Statistics
- Survivors Average Profit: $${report.analysis.monteCarlo.survivors.averageProfit} (${report.analysis.monteCarlo.survivors.averageProfitPercentage}%)
- Average Max Drawdown: $${report.analysis.monteCarlo.riskMetrics.averageMaxDrawdown} (${report.analysis.monteCarlo.riskMetrics.averageMaxDrawdownPercentage}%)
- Worst Drawdown: $${report.analysis.monteCarlo.riskMetrics.worstDrawdown}
- Best Profit: $${report.analysis.monteCarlo.riskMetrics.bestProfit}

## 5. Stress Test Results

| Scenario | Loss | % of Account | Survives |
|----------|------|--------------|----------|`;

  report.stressTests.forEach(test => {
    const survives = test.survives ? '✅' : '❌';
    const loss = test.loss || test.estimatedLoss || 0;
    markdown += `
| ${test.name} | $${Math.abs(loss).toFixed(2)} | ${test.percentLoss}% | ${survives} |`;
  });

  markdown += `

## 6. Critical Warnings

`;
  report.warnings.forEach(warning => {
    markdown += `### ⚠️ ${warning.category} [${warning.severity}]
**${warning.warning}**
- Impact: ${warning.impact}

`;
  });

  markdown += `## 7. Recommendations

`;

  // Group recommendations by priority
  const criticalRecs = report.recommendations.filter(r => r.priority === 'CRITICAL');
  const highRecs = report.recommendations.filter(r => r.priority === 'HIGH');
  const mediumRecs = report.recommendations.filter(r => r.priority === 'MEDIUM');

  if (criticalRecs.length > 0) {
    markdown += `### 🔴 Critical Priority\n\n`;
    criticalRecs.forEach(rec => {
      markdown += `**${rec.category}**: ${rec.recommendation}
- *Reason: ${rec.reason}*

`;
    });
  }

  if (highRecs.length > 0) {
    markdown += `### 🟠 High Priority\n\n`;
    highRecs.forEach(rec => {
      markdown += `**${rec.category}**: ${rec.recommendation}
- *Reason: ${rec.reason}*

`;
    });
  }

  if (mediumRecs.length > 0) {
    markdown += `### 🟡 Medium Priority\n\n`;
    mediumRecs.forEach(rec => {
      markdown += `**${rec.category}**: ${rec.recommendation}
- *Reason: ${rec.reason}*

`;
    });
  }

  markdown += `## 8. Implementation Checklist

If proceeding with this strategy, implement these controls:

- [ ] Set scaling factor to ${report.proposedSettings.scalingFactor} or lower
- [ ] Configure max single position limit: ${report.proposedSettings.maxSinglePosition} lots
- [ ] Configure max total exposure limit: ${report.proposedSettings.maxTotalExposure} lots
- [ ] Implement ${report.proposedSettings.dailyLossStop}% daily loss stop
- [ ] Set up ${report.proposedSettings.emergencyStop}% total drawdown stop
- [ ] Limit martingale to ${report.proposedSettings.maxMartingaleLevels} levels
- [ ] Configure real-time monitoring alerts at 2%, 3%, and 4% drawdown
- [ ] Implement time-based stops for martingale sequences (4 hours max)
- [ ] Set up position reduction after 2% daily loss
- [ ] Avoid martingale sequences 7-9 PM EST (near daily calculation)
- [ ] Monitor correlation with gold volatility indices
- [ ] Set up automated emergency stop system
- [ ] Test all risk controls in demo first

## 9. Monitoring Dashboard Requirements

Create a real-time dashboard tracking:
- Current daily P&L and distance to 5% limit
- Current drawdown and distance to 12% limit
- Number of open positions and total exposure
- Active martingale sequences and their levels
- Time since last martingale recovery
- Win rate (rolling 20 trades)
- R-multiple performance tracking
- Correlation with VIX and gold volatility

---

*Report generated: ${new Date(report.timestamp).toLocaleString()}*
`;

  fs.writeFileSync('tiger-funded-risk-assessment.md', markdown);
  console.log('\nDetailed markdown report saved to: tiger-funded-risk-assessment.md');
}

// Run the assessment
runRiskAssessment().catch(console.error);