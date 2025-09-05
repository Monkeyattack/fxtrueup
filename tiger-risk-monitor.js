#!/usr/bin/env node

/**
 * Tiger Funded Risk Monitor Dashboard
 * 
 * Real-time risk monitoring for copy trading strategy
 * Tracks key metrics and triggers alerts when approaching limits
 */

import dotenv from 'dotenv';
import Table from 'cli-table3';
import chalk from 'chalk';

dotenv.config();

class TigerRiskMonitor {
  constructor(accountBalance = 100000) {
    this.accountBalance = accountBalance;
    this.startingBalance = accountBalance;
    
    // Tiger Funded Limits
    this.limits = {
      maxDailyLoss: 5, // percentage
      maxTotalDrawdown: 12, // percentage
      dailyLossAmount: accountBalance * 0.05,
      totalDrawdownAmount: accountBalance * 0.12
    };
    
    // Alert thresholds
    this.alerts = {
      daily: [2, 3, 4, 4.5], // percentage levels for daily loss
      total: [4, 6, 8, 10], // percentage levels for total drawdown
      positions: [10, 15, 20], // number of open positions
      martingale: [2, 3, 4] // martingale level warnings
    };
    
    // Current state
    this.state = {
      currentBalance: accountBalance,
      dailyStartBalance: accountBalance,
      openPositions: [],
      dailyPnL: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      martingaleSequences: [],
      alerts: []
    };
    
    // Performance tracking
    this.performance = {
      trades: [],
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      expectancy: 0,
      rMultiples: []
    };
  }

  // Update position data
  updatePositions(positions) {
    this.state.openPositions = positions;
    this.calculateExposure();
    this.checkMartingaleSequences();
    this.checkAlerts();
  }

  // Update daily P&L
  updateDailyPnL(pnl) {
    this.state.dailyPnL = pnl;
    this.state.currentBalance = this.state.dailyStartBalance + pnl;
    this.checkDailyLossLimit();
  }

  // Update total P&L
  updateTotalPnL(pnl) {
    this.state.totalPnL = pnl;
    this.state.currentBalance = this.startingBalance + pnl;
    this.calculateDrawdown();
    this.checkTotalDrawdownLimit();
  }

  // Add completed trade for performance tracking
  addTrade(trade) {
    this.performance.trades.push(trade);
    this.calculatePerformanceMetrics();
    this.calculateRMultiple(trade);
  }

  // Calculate current exposure
  calculateExposure() {
    const totalLots = this.state.openPositions.reduce((sum, pos) => sum + pos.volume, 0);
    const exposure = {
      totalLots,
      positionCount: this.state.openPositions.length,
      estimatedRisk: totalLots * 1000, // Rough estimate: $1000 per lot risk
      percentOfBalance: (totalLots * 1000 / this.accountBalance) * 100
    };
    
    this.state.exposure = exposure;
    return exposure;
  }

  // Check for martingale sequences in open positions
  checkMartingaleSequences() {
    const sequences = [];
    const positionsBySymbol = {};
    
    // Group positions by symbol
    this.state.openPositions.forEach(pos => {
      if (!positionsBySymbol[pos.symbol]) {
        positionsBySymbol[pos.symbol] = [];
      }
      positionsBySymbol[pos.symbol].push(pos);
    });
    
    // Check each symbol for martingale patterns
    Object.keys(positionsBySymbol).forEach(symbol => {
      const positions = positionsBySymbol[symbol];
      if (positions.length > 1) {
        // Sort by open time
        positions.sort((a, b) => new Date(a.openTime) - new Date(b.openTime));
        
        // Check for increasing volumes (martingale pattern)
        let isMaringale = false;
        let totalVolume = 0;
        let unrealizedPnL = 0;
        
        for (let i = 1; i < positions.length; i++) {
          if (positions[i].volume >= positions[i-1].volume) {
            isMaringale = true;
          }
          totalVolume += positions[i].volume;
          unrealizedPnL += positions[i].unrealizedPnL || 0;
        }
        
        if (isMaringale) {
          sequences.push({
            symbol,
            level: positions.length,
            totalVolume,
            unrealizedPnL,
            oldestPosition: positions[0].openTime,
            riskLevel: positions.length > 3 ? 'HIGH' : positions.length > 2 ? 'MEDIUM' : 'LOW'
          });
        }
      }
    });
    
    this.state.martingaleSequences = sequences;
    return sequences;
  }

  // Calculate drawdown
  calculateDrawdown() {
    const currentDrawdown = Math.min(0, this.state.currentBalance - this.startingBalance);
    this.state.currentDrawdown = currentDrawdown;
    
    if (currentDrawdown < this.state.maxDrawdown) {
      this.state.maxDrawdown = currentDrawdown;
    }
    
    return {
      current: currentDrawdown,
      currentPercent: (currentDrawdown / this.startingBalance) * 100,
      max: this.state.maxDrawdown,
      maxPercent: (this.state.maxDrawdown / this.startingBalance) * 100
    };
  }

  // Check daily loss limit
  checkDailyLossLimit() {
    const dailyLossPercent = (this.state.dailyPnL / this.state.dailyStartBalance) * -100;
    
    for (const threshold of this.alerts.daily) {
      if (dailyLossPercent >= threshold) {
        this.addAlert({
          type: 'DAILY_LOSS',
          level: threshold >= 4.5 ? 'CRITICAL' : threshold >= 4 ? 'HIGH' : threshold >= 3 ? 'MEDIUM' : 'LOW',
          message: `Daily loss at ${dailyLossPercent.toFixed(2)}% (Threshold: ${threshold}%)`,
          value: dailyLossPercent,
          threshold: threshold,
          timestamp: new Date()
        });
      }
    }
    
    if (dailyLossPercent >= this.limits.maxDailyLoss) {
      this.addAlert({
        type: 'DAILY_LIMIT_BREACH',
        level: 'CRITICAL',
        message: `DAILY LOSS LIMIT BREACHED: ${dailyLossPercent.toFixed(2)}%`,
        action: 'CLOSE ALL POSITIONS IMMEDIATELY',
        timestamp: new Date()
      });
      return false; // Stop trading
    }
    
    return true; // Continue trading
  }

  // Check total drawdown limit
  checkTotalDrawdownLimit() {
    const drawdownPercent = Math.abs((this.state.currentDrawdown / this.startingBalance) * 100);
    
    for (const threshold of this.alerts.total) {
      if (drawdownPercent >= threshold) {
        this.addAlert({
          type: 'TOTAL_DRAWDOWN',
          level: threshold >= 10 ? 'CRITICAL' : threshold >= 8 ? 'HIGH' : threshold >= 6 ? 'MEDIUM' : 'LOW',
          message: `Total drawdown at ${drawdownPercent.toFixed(2)}% (Threshold: ${threshold}%)`,
          value: drawdownPercent,
          threshold: threshold,
          timestamp: new Date()
        });
      }
    }
    
    if (drawdownPercent >= this.limits.maxTotalDrawdown) {
      this.addAlert({
        type: 'DRAWDOWN_LIMIT_BREACH',
        level: 'CRITICAL',
        message: `TOTAL DRAWDOWN LIMIT BREACHED: ${drawdownPercent.toFixed(2)}%`,
        action: 'ACCOUNT VIOLATION - EVALUATION FAILED',
        timestamp: new Date()
      });
      return false; // Account blown
    }
    
    return true; // Account safe
  }

  // Check all alert conditions
  checkAlerts() {
    this.state.alerts = []; // Clear old alerts
    
    // Check position count
    const posCount = this.state.openPositions.length;
    for (const threshold of this.alerts.positions) {
      if (posCount >= threshold) {
        this.addAlert({
          type: 'POSITION_COUNT',
          level: threshold >= 20 ? 'HIGH' : 'MEDIUM',
          message: `${posCount} positions open (Threshold: ${threshold})`,
          value: posCount,
          threshold: threshold
        });
      }
    }
    
    // Check martingale levels
    this.state.martingaleSequences.forEach(seq => {
      for (const threshold of this.alerts.martingale) {
        if (seq.level >= threshold) {
          this.addAlert({
            type: 'MARTINGALE_LEVEL',
            level: threshold >= 4 ? 'CRITICAL' : threshold >= 3 ? 'HIGH' : 'MEDIUM',
            message: `${seq.symbol} at martingale level ${seq.level} (Threshold: ${threshold})`,
            symbol: seq.symbol,
            value: seq.level,
            threshold: threshold
          });
        }
      }
    });
  }

  // Add alert to state
  addAlert(alert) {
    // Avoid duplicate alerts
    const exists = this.state.alerts.find(a => 
      a.type === alert.type && 
      a.threshold === alert.threshold &&
      a.symbol === alert.symbol
    );
    
    if (!exists) {
      this.state.alerts.push(alert);
    }
  }

  // Calculate performance metrics
  calculatePerformanceMetrics() {
    const trades = this.performance.trades;
    if (trades.length === 0) return;
    
    const wins = trades.filter(t => t.profit > 0);
    const losses = trades.filter(t => t.profit < 0);
    
    this.performance.winRate = (wins.length / trades.length) * 100;
    this.performance.avgWin = wins.length > 0 ? 
      wins.reduce((sum, t) => sum + t.profit, 0) / wins.length : 0;
    this.performance.avgLoss = losses.length > 0 ? 
      losses.reduce((sum, t) => sum + t.profit, 0) / losses.length : 0;
    
    const totalWins = wins.reduce((sum, t) => sum + t.profit, 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
    
    this.performance.profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;
    this.performance.expectancy = (this.performance.winRate / 100 * this.performance.avgWin) + 
      ((100 - this.performance.winRate) / 100 * this.performance.avgLoss);
  }

  // Calculate R-multiple for a trade
  calculateRMultiple(trade) {
    const oneR = this.accountBalance * 0.01; // 1% risk
    const rMultiple = trade.profit / oneR;
    
    this.performance.rMultiples.push({
      trade: trade.id,
      profit: trade.profit,
      rMultiple: rMultiple,
      timestamp: trade.closeTime
    });
    
    return rMultiple;
  }

  // Generate dashboard display
  displayDashboard() {
    console.clear();
    console.log(chalk.cyan.bold('═'.repeat(80)));
    console.log(chalk.cyan.bold('TIGER FUNDED RISK MONITOR DASHBOARD'));
    console.log(chalk.cyan.bold('═'.repeat(80)));
    console.log(chalk.gray(`Last Updated: ${new Date().toLocaleString()}`));
    console.log();
    
    // Account Status Table
    const accountTable = new Table({
      head: [chalk.yellow('Metric'), chalk.yellow('Value'), chalk.yellow('Limit'), chalk.yellow('Status')],
      colWidths: [25, 20, 20, 15]
    });
    
    const dailyLossPercent = Math.abs((this.state.dailyPnL / this.state.dailyStartBalance) * 100);
    const drawdownPercent = Math.abs((this.state.currentDrawdown / this.startingBalance) * 100);
    
    accountTable.push(
      ['Current Balance', `$${this.state.currentBalance.toFixed(2)}`, '-', this.getStatusColor(this.state.currentBalance >= this.startingBalance)],
      ['Daily P&L', this.formatPnL(this.state.dailyPnL), `${this.limits.maxDailyLoss}%`, this.getStatusColor(dailyLossPercent < 4)],
      ['Daily Loss %', `${dailyLossPercent.toFixed(2)}%`, `${this.limits.maxDailyLoss}%`, this.getStatusColor(dailyLossPercent < 4)],
      ['Total Drawdown', this.formatPnL(this.state.currentDrawdown), `${this.limits.maxTotalDrawdown}%`, this.getStatusColor(drawdownPercent < 8)],
      ['Drawdown %', `${drawdownPercent.toFixed(2)}%`, `${this.limits.maxTotalDrawdown}%`, this.getStatusColor(drawdownPercent < 8)]
    );
    
    console.log(chalk.white.bold('Account Status'));
    console.log(accountTable.toString());
    console.log();
    
    // Position Status Table
    if (this.state.exposure) {
      const positionTable = new Table({
        head: [chalk.yellow('Metric'), chalk.yellow('Value'), chalk.yellow('Risk Level')],
        colWidths: [25, 20, 20]
      });
      
      positionTable.push(
        ['Open Positions', this.state.openPositions.length, this.getRiskLevel(this.state.openPositions.length, [5, 10, 15])],
        ['Total Exposure', `${this.state.exposure.totalLots.toFixed(2)} lots`, this.getRiskLevel(this.state.exposure.totalLots, [2, 3, 5])],
        ['Estimated Risk', `$${this.state.exposure.estimatedRisk.toFixed(2)}`, this.getRiskLevel(this.state.exposure.percentOfBalance, [2, 4, 6])],
        ['% of Balance', `${this.state.exposure.percentOfBalance.toFixed(2)}%`, this.getRiskLevel(this.state.exposure.percentOfBalance, [2, 4, 6])]
      );
      
      console.log(chalk.white.bold('Position Exposure'));
      console.log(positionTable.toString());
      console.log();
    }
    
    // Martingale Status
    if (this.state.martingaleSequences.length > 0) {
      const martingaleTable = new Table({
        head: [chalk.yellow('Symbol'), chalk.yellow('Level'), chalk.yellow('Volume'), chalk.yellow('Unrealized P&L'), chalk.yellow('Risk')],
        colWidths: [15, 10, 15, 20, 15]
      });
      
      this.state.martingaleSequences.forEach(seq => {
        martingaleTable.push([
          seq.symbol,
          seq.level,
          `${seq.totalVolume.toFixed(2)} lots`,
          this.formatPnL(seq.unrealizedPnL),
          this.getRiskLevelColor(seq.riskLevel)
        ]);
      });
      
      console.log(chalk.white.bold('Active Martingale Sequences'));
      console.log(martingaleTable.toString());
      console.log();
    }
    
    // Performance Metrics
    if (this.performance.trades.length > 0) {
      const perfTable = new Table({
        head: [chalk.yellow('Metric'), chalk.yellow('Value')],
        colWidths: [25, 20]
      });
      
      perfTable.push(
        ['Total Trades', this.performance.trades.length],
        ['Win Rate', `${this.performance.winRate.toFixed(1)}%`],
        ['Avg Win', `$${this.performance.avgWin.toFixed(2)}`],
        ['Avg Loss', `$${this.performance.avgLoss.toFixed(2)}`],
        ['Profit Factor', this.performance.profitFactor.toFixed(2)],
        ['Expectancy', `$${this.performance.expectancy.toFixed(2)}`]
      );
      
      console.log(chalk.white.bold('Performance Metrics'));
      console.log(perfTable.toString());
      console.log();
    }
    
    // Active Alerts
    if (this.state.alerts.length > 0) {
      console.log(chalk.red.bold('⚠️  ACTIVE ALERTS'));
      console.log(chalk.red('─'.repeat(80)));
      
      this.state.alerts
        .sort((a, b) => {
          const levelOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
          return levelOrder[a.level] - levelOrder[b.level];
        })
        .forEach(alert => {
          const icon = alert.level === 'CRITICAL' ? '🚨' : 
                       alert.level === 'HIGH' ? '⚠️' : 
                       alert.level === 'MEDIUM' ? '📊' : 'ℹ️';
          const color = alert.level === 'CRITICAL' ? chalk.red.bold :
                        alert.level === 'HIGH' ? chalk.yellow.bold :
                        alert.level === 'MEDIUM' ? chalk.yellow :
                        chalk.gray;
          
          console.log(color(`${icon} [${alert.level}] ${alert.message}`));
          if (alert.action) {
            console.log(chalk.red.bold(`   ACTION REQUIRED: ${alert.action}`));
          }
        });
      console.log();
    }
    
    // Risk Status Summary
    const riskStatus = this.calculateOverallRiskStatus();
    console.log(chalk.white.bold('Overall Risk Status: ') + this.getRiskLevelColor(riskStatus));
    console.log(chalk.gray('─'.repeat(80)));
  }

  // Format P&L with color
  formatPnL(value) {
    const formatted = `$${Math.abs(value).toFixed(2)}`;
    if (value > 0) {
      return chalk.green(`+${formatted}`);
    } else if (value < 0) {
      return chalk.red(`-${formatted}`);
    }
    return chalk.gray(formatted);
  }

  // Get status color
  getStatusColor(isGood) {
    return isGood ? chalk.green('✅ OK') : chalk.red('⚠️ WARNING');
  }

  // Get risk level
  getRiskLevel(value, thresholds) {
    if (value < thresholds[0]) return chalk.green('LOW');
    if (value < thresholds[1]) return chalk.yellow('MEDIUM');
    if (value < thresholds[2]) return chalk.red('HIGH');
    return chalk.red.bold('CRITICAL');
  }

  // Get risk level color
  getRiskLevelColor(level) {
    switch(level) {
      case 'LOW': return chalk.green('LOW');
      case 'MEDIUM': return chalk.yellow('MEDIUM');
      case 'HIGH': return chalk.red('HIGH');
      case 'CRITICAL': return chalk.red.bold('CRITICAL');
      default: return chalk.gray('UNKNOWN');
    }
  }

  // Calculate overall risk status
  calculateOverallRiskStatus() {
    const dailyLossPercent = Math.abs((this.state.dailyPnL / this.state.dailyStartBalance) * 100);
    const drawdownPercent = Math.abs((this.state.currentDrawdown / this.startingBalance) * 100);
    
    if (dailyLossPercent >= 4.5 || drawdownPercent >= 10) {
      return 'CRITICAL';
    } else if (dailyLossPercent >= 3 || drawdownPercent >= 8 || this.state.martingaleSequences.some(s => s.level >= 3)) {
      return 'HIGH';
    } else if (dailyLossPercent >= 2 || drawdownPercent >= 5 || this.state.openPositions.length >= 10) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  // Simulate real-time monitoring (for testing)
  startMonitoring(updateInterval = 5000) {
    console.log('Starting risk monitor...');
    
    // Display initial dashboard
    this.displayDashboard();
    
    // Update dashboard periodically
    setInterval(() => {
      // In production, this would fetch real data from MetaAPI
      // For now, we'll simulate some changes
      this.simulateMarketActivity();
      this.displayDashboard();
    }, updateInterval);
  }

  // Simulate market activity for testing
  simulateMarketActivity() {
    // Simulate P&L changes
    const pnlChange = (Math.random() - 0.5) * 200;
    this.state.dailyPnL += pnlChange;
    this.state.totalPnL += pnlChange;
    
    this.updateDailyPnL(this.state.dailyPnL);
    this.updateTotalPnL(this.state.totalPnL);
    
    // Simulate position changes
    if (Math.random() > 0.7 && this.state.openPositions.length < 20) {
      this.state.openPositions.push({
        symbol: 'XAUUSD',
        volume: 0.01 + Math.random() * 0.05,
        unrealizedPnL: (Math.random() - 0.5) * 100,
        openTime: new Date()
      });
    } else if (Math.random() > 0.8 && this.state.openPositions.length > 0) {
      const closedPosition = this.state.openPositions.shift();
      if (closedPosition) {
        this.addTrade({
          id: Date.now(),
          profit: closedPosition.unrealizedPnL || (Math.random() - 0.5) * 100,
          closeTime: new Date()
        });
      }
    }
    
    this.updatePositions(this.state.openPositions);
  }
}

// Export for use in other modules
export default TigerRiskMonitor;

// Run as standalone if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new TigerRiskMonitor(100000);
  
  // Add some sample positions for demonstration
  monitor.updatePositions([
    { symbol: 'XAUUSD', volume: 0.01, unrealizedPnL: -50, openTime: new Date() },
    { symbol: 'XAUUSD', volume: 0.02, unrealizedPnL: -75, openTime: new Date(Date.now() - 3600000) },
    { symbol: 'XAUUSD', volume: 0.04, unrealizedPnL: -100, openTime: new Date(Date.now() - 7200000) }
  ]);
  
  monitor.updateDailyPnL(-1500);
  monitor.updateTotalPnL(-3000);
  
  // Start monitoring
  monitor.startMonitoring();
}