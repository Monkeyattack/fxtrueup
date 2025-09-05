#!/usr/bin/env node

/**
 * Real-Time Risk Monitoring Dashboard
 * Monitors positions and implements circuit breakers
 */

import poolClient from './src/services/poolClient.js';
import { logger } from './src/utils/logger.js';

class RiskMonitor {
  constructor(accountId, region = 'london', accountBalance = 118000) {
    this.accountId = accountId;
    this.region = region;
    this.accountBalance = accountBalance;
    
    // Risk limits (FTMO compliant)
    this.limits = {
      maxDailyLossPercent: 5,           // 5% = $5,900
      maxDailyLossAmount: 5900,
      maxTotalDrawdownPercent: 10,      // 10% = $11,800  
      maxTotalDrawdownAmount: 11800,
      maxOpenPositions: 3,
      maxPositionSizeGold: 0.50,         // lots
      maxCorrelatedExposure: 1.5,       // total lots
      minMarginLevel: 200,              // %
      consecutiveLossLimit: 2,
      pauseAfterLossAmount: 1500,
      stopTradingLossAmount: 2000
    };
    
    // Tracking state
    this.state = {
      startingBalance: accountBalance,
      currentEquity: accountBalance,
      dailyStartBalance: accountBalance,
      openPositions: [],
      closedTodayPnL: 0,
      floatingPnL: 0,
      consecutiveLosses: 0,
      isPaused: false,
      isStopped: false,
      alerts: [],
      lastCheck: new Date()
    };
    
    // Circuit breakers
    this.circuitBreakers = {
      dailyLoss: false,
      drawdown: false,
      marginLevel: false,
      positionLimit: false,
      consecutiveLoss: false
    };
  }
  
  /**
   * Start monitoring
   */
  async start() {
    logger.info('🚨 Starting Risk Monitor Dashboard');
    logger.info(`Account: ${this.accountId}`);
    logger.info(`Balance: $${this.accountBalance.toLocaleString()}`);
    logger.info('─'.repeat(60));
    
    // Initial check
    await this.checkRisk();
    
    // Set up monitoring interval
    this.monitorInterval = setInterval(() => {
      this.checkRisk();
    }, 30000); // Check every 30 seconds
    
    // Set up daily reset
    this.scheduleDailyReset();
    
    logger.info('✅ Risk monitoring active');
  }
  
  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    logger.info('🛑 Risk monitoring stopped');
  }
  
  /**
   * Main risk check
   */
  async checkRisk() {
    try {
      // Get account info
      const accountInfo = await this.getAccountInfo();
      
      // Update state
      this.state.currentEquity = accountInfo.equity;
      this.state.openPositions = accountInfo.positions;
      this.state.floatingPnL = accountInfo.floatingPnL;
      this.state.lastCheck = new Date();
      
      // Clear previous alerts
      this.state.alerts = [];
      
      // Run all risk checks
      this.checkDailyLoss();
      this.checkMaxDrawdown();
      this.checkPositionLimits();
      this.checkMarginLevel(accountInfo);
      this.checkCorrelation();
      
      // Display dashboard
      this.displayDashboard();
      
      // Execute circuit breakers if needed
      await this.executeCircuitBreakers();
      
    } catch (error) {
      logger.error('Risk check error:', error);
    }
  }
  
  /**
   * Get account information
   */
  async getAccountInfo() {
    const account = await poolClient.getAccountInfo(this.accountId, this.region);
    const positions = await poolClient.getPositions(this.accountId, this.region);
    
    const floatingPnL = positions.reduce((sum, pos) => sum + (pos.profit || 0), 0);
    const equity = account.balance + floatingPnL;
    
    return {
      balance: account.balance,
      equity,
      margin: account.margin || 0,
      freeMargin: account.freeMargin || equity,
      marginLevel: account.margin > 0 ? (equity / account.margin) * 100 : 999,
      positions,
      floatingPnL
    };
  }
  
  /**
   * Check daily loss limit
   */
  checkDailyLoss() {
    const dailyPnL = this.state.currentEquity - this.state.dailyStartBalance;
    const dailyPnLPercent = (dailyPnL / this.state.dailyStartBalance) * 100;
    
    if (dailyPnL < -this.limits.maxDailyLossAmount) {
      this.circuitBreakers.dailyLoss = true;
      this.state.alerts.push({
        level: 'CRITICAL',
        message: `Daily loss limit exceeded: $${Math.abs(dailyPnL).toFixed(2)} (${Math.abs(dailyPnLPercent).toFixed(1)}%)`
      });
    } else if (dailyPnL < -this.limits.pauseAfterLossAmount) {
      this.state.isPaused = true;
      this.state.alerts.push({
        level: 'WARNING',
        message: `Approaching daily loss limit: $${Math.abs(dailyPnL).toFixed(2)}`
      });
    }
    
    return {
      dailyPnL,
      dailyPnLPercent,
      remaining: this.limits.maxDailyLossAmount + dailyPnL
    };
  }
  
  /**
   * Check maximum drawdown
   */
  checkMaxDrawdown() {
    const totalPnL = this.state.currentEquity - this.state.startingBalance;
    const drawdownPercent = (totalPnL / this.state.startingBalance) * 100;
    
    if (totalPnL < -this.limits.maxTotalDrawdownAmount) {
      this.circuitBreakers.drawdown = true;
      this.state.alerts.push({
        level: 'CRITICAL',
        message: `Max drawdown exceeded: $${Math.abs(totalPnL).toFixed(2)} (${Math.abs(drawdownPercent).toFixed(1)}%)`
      });
    } else if (totalPnL < -this.limits.maxTotalDrawdownAmount * 0.8) {
      this.state.alerts.push({
        level: 'WARNING',
        message: `Approaching max drawdown: $${Math.abs(totalPnL).toFixed(2)}`
      });
    }
    
    return {
      totalPnL,
      drawdownPercent,
      remaining: this.limits.maxTotalDrawdownAmount + totalPnL
    };
  }
  
  /**
   * Check position limits
   */
  checkPositionLimits() {
    const positions = this.state.openPositions;
    
    if (positions.length >= this.limits.maxOpenPositions) {
      this.circuitBreakers.positionLimit = true;
      this.state.alerts.push({
        level: 'INFO',
        message: `Position limit reached: ${positions.length}/${this.limits.maxOpenPositions}`
      });
    }
    
    // Check individual position sizes
    positions.forEach(pos => {
      if (pos.volume > this.limits.maxPositionSizeGold) {
        this.state.alerts.push({
          level: 'WARNING',
          message: `Oversized position: ${pos.symbol} ${pos.volume} lots`
        });
      }
    });
  }
  
  /**
   * Check margin level
   */
  checkMarginLevel(accountInfo) {
    if (accountInfo.marginLevel < this.limits.minMarginLevel) {
      this.circuitBreakers.marginLevel = true;
      this.state.alerts.push({
        level: 'CRITICAL',
        message: `Low margin level: ${accountInfo.marginLevel.toFixed(0)}%`
      });
    } else if (accountInfo.marginLevel < this.limits.minMarginLevel * 1.5) {
      this.state.alerts.push({
        level: 'WARNING',
        message: `Margin level warning: ${accountInfo.marginLevel.toFixed(0)}%`
      });
    }
  }
  
  /**
   * Check correlation exposure
   */
  checkCorrelation() {
    const goldPositions = this.state.openPositions.filter(p => 
      p.symbol === 'XAUUSD' || p.symbol === 'GOLD'
    );
    
    const totalGoldExposure = goldPositions.reduce((sum, pos) => 
      sum + pos.volume, 0
    );
    
    if (totalGoldExposure > this.limits.maxCorrelatedExposure) {
      this.state.alerts.push({
        level: 'WARNING',
        message: `High correlated exposure: ${totalGoldExposure.toFixed(2)} lots on Gold`
      });
    }
  }
  
  /**
   * Execute circuit breakers
   */
  async executeCircuitBreakers() {
    // Check if any critical circuit breaker is triggered
    const criticalBreaker = 
      this.circuitBreakers.dailyLoss ||
      this.circuitBreakers.drawdown ||
      this.circuitBreakers.marginLevel;
    
    if (criticalBreaker && !this.state.isStopped) {
      logger.error('🚨 CRITICAL: Circuit breaker triggered!');
      
      // Close all positions
      await this.emergencyCloseAll();
      
      // Stop trading
      this.state.isStopped = true;
      
      // Send alert
      this.sendEmergencyAlert();
    }
  }
  
  /**
   * Emergency close all positions
   */
  async emergencyCloseAll() {
    logger.warn('⚠️ EMERGENCY: Closing all positions...');
    
    for (const position of this.state.openPositions) {
      try {
        await poolClient.closePosition(
          this.accountId, 
          this.region, 
          position.id
        );
        logger.info(`Closed position: ${position.symbol} ${position.volume} lots`);
      } catch (error) {
        logger.error(`Failed to close position ${position.id}:`, error);
      }
    }
  }
  
  /**
   * Display risk dashboard
   */
  displayDashboard() {
    console.clear();
    console.log('\n🎯 RISK MONITORING DASHBOARD');
    console.log('═'.repeat(70));
    console.log(`Account: ${this.accountId.substring(0, 8)}...`);
    console.log(`Last Check: ${this.state.lastCheck.toLocaleTimeString()}`);
    console.log('─'.repeat(70));
    
    // Account metrics
    const dailyPnL = this.state.currentEquity - this.state.dailyStartBalance;
    const totalPnL = this.state.currentEquity - this.state.startingBalance;
    
    console.log('\n📊 ACCOUNT STATUS');
    console.log(`Balance: $${this.state.startingBalance.toLocaleString()}`);
    console.log(`Equity: $${this.state.currentEquity.toLocaleString()}`);
    console.log(`Daily P&L: ${this.formatPnL(dailyPnL)} (${((dailyPnL/this.state.dailyStartBalance)*100).toFixed(2)}%)`);
    console.log(`Total P&L: ${this.formatPnL(totalPnL)} (${((totalPnL/this.state.startingBalance)*100).toFixed(2)}%)`);
    console.log(`Floating P&L: ${this.formatPnL(this.state.floatingPnL)}`);
    
    // Position summary
    console.log('\n📈 POSITIONS');
    console.log(`Open Positions: ${this.state.openPositions.length}/${this.limits.maxOpenPositions}`);
    if (this.state.openPositions.length > 0) {
      this.state.openPositions.forEach(pos => {
        console.log(`  • ${pos.symbol} ${pos.type} ${pos.volume} lots @ ${pos.openPrice} | P&L: ${this.formatPnL(pos.profit || 0)}`);
      });
    }
    
    // Risk metrics
    console.log('\n⚠️ RISK METRICS');
    const dailyRemaining = this.limits.maxDailyLossAmount + dailyPnL;
    const drawdownRemaining = this.limits.maxTotalDrawdownAmount + totalPnL;
    
    console.log(`Daily Loss Remaining: $${dailyRemaining.toFixed(2)} / $${this.limits.maxDailyLossAmount}`);
    console.log(`Drawdown Remaining: $${drawdownRemaining.toFixed(2)} / $${this.limits.maxTotalDrawdownAmount}`);
    console.log(`Consecutive Losses: ${this.state.consecutiveLosses}`);
    
    // Circuit breakers
    console.log('\n🚦 CIRCUIT BREAKERS');
    Object.keys(this.circuitBreakers).forEach(breaker => {
      const status = this.circuitBreakers[breaker] ? '🔴 TRIGGERED' : '🟢 OK';
      console.log(`  ${breaker}: ${status}`);
    });
    
    // Trading status
    console.log('\n🎮 TRADING STATUS');
    if (this.state.isStopped) {
      console.log('  🛑 TRADING STOPPED (Circuit breaker activated)');
    } else if (this.state.isPaused) {
      console.log('  ⏸️ TRADING PAUSED (Loss limit warning)');
    } else {
      console.log('  ✅ TRADING ACTIVE');
    }
    
    // Alerts
    if (this.state.alerts.length > 0) {
      console.log('\n🔔 ALERTS');
      this.state.alerts.forEach(alert => {
        const icon = alert.level === 'CRITICAL' ? '🚨' : 
                     alert.level === 'WARNING' ? '⚠️' : 'ℹ️';
        console.log(`  ${icon} ${alert.message}`);
      });
    }
    
    console.log('\n' + '═'.repeat(70));
  }
  
  /**
   * Format P&L for display
   */
  formatPnL(amount) {
    const formatted = Math.abs(amount).toFixed(2);
    if (amount >= 0) {
      return `+$${formatted}`;
    } else {
      return `-$${formatted}`;
    }
  }
  
  /**
   * Schedule daily reset
   */
  scheduleDailyReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow - now;
    
    setTimeout(() => {
      this.resetDailyStats();
      this.scheduleDailyReset(); // Schedule next reset
    }, msUntilMidnight);
  }
  
  /**
   * Reset daily statistics
   */
  resetDailyStats() {
    logger.info('📅 Resetting daily statistics');
    
    this.state.dailyStartBalance = this.state.currentEquity;
    this.state.closedTodayPnL = 0;
    this.state.consecutiveLosses = 0;
    this.state.isPaused = false;
    
    // Reset non-critical circuit breakers
    this.circuitBreakers.dailyLoss = false;
    this.circuitBreakers.positionLimit = false;
    this.circuitBreakers.consecutiveLoss = false;
  }
  
  /**
   * Send emergency alert
   */
  sendEmergencyAlert() {
    const alert = {
      timestamp: new Date().toISOString(),
      account: this.accountId,
      type: 'EMERGENCY',
      message: 'Circuit breaker activated - All positions closed',
      metrics: {
        equity: this.state.currentEquity,
        dailyLoss: this.state.currentEquity - this.state.dailyStartBalance,
        totalDrawdown: this.state.currentEquity - this.state.startingBalance,
        triggeredBreakers: Object.keys(this.circuitBreakers)
          .filter(b => this.circuitBreakers[b])
      }
    };
    
    // In production, this would send email/SMS/webhook
    logger.error('EMERGENCY ALERT:', alert);
  }
  
  /**
   * Get current risk report
   */
  getRiskReport() {
    const dailyPnL = this.state.currentEquity - this.state.dailyStartBalance;
    const totalPnL = this.state.currentEquity - this.state.startingBalance;
    
    return {
      timestamp: new Date().toISOString(),
      account: {
        id: this.accountId,
        balance: this.state.startingBalance,
        equity: this.state.currentEquity,
        floatingPnL: this.state.floatingPnL
      },
      performance: {
        dailyPnL,
        dailyPnLPercent: (dailyPnL / this.state.dailyStartBalance) * 100,
        totalPnL,
        totalPnLPercent: (totalPnL / this.state.startingBalance) * 100
      },
      positions: {
        open: this.state.openPositions.length,
        limit: this.limits.maxOpenPositions,
        totalVolume: this.state.openPositions.reduce((sum, p) => sum + p.volume, 0)
      },
      risk: {
        dailyLossRemaining: this.limits.maxDailyLossAmount + dailyPnL,
        drawdownRemaining: this.limits.maxTotalDrawdownAmount + totalPnL,
        consecutiveLosses: this.state.consecutiveLosses
      },
      status: {
        isActive: !this.state.isStopped && !this.state.isPaused,
        isPaused: this.state.isPaused,
        isStopped: this.state.isStopped,
        circuitBreakers: this.circuitBreakers,
        alerts: this.state.alerts
      }
    };
  }
}

// Main execution
async function main() {
  const ACCOUNT_ID = process.env.MONITOR_ACCOUNT_ID || '44f05253-8b6a-4aba-a4b2-7882da7c8e48';
  const REGION = process.env.MONITOR_REGION || 'london';
  const BALANCE = parseInt(process.env.ACCOUNT_BALANCE || '118000');
  
  console.log('🚀 Starting Risk Monitor Dashboard');
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log(`Region: ${REGION}`);
  console.log(`Balance: $${BALANCE.toLocaleString()}`);
  
  const monitor = new RiskMonitor(ACCOUNT_ID, REGION, BALANCE);
  await monitor.start();
  
  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down risk monitor...');
    monitor.stop();
    process.exit(0);
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default RiskMonitor;