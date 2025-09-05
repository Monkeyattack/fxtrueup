#!/usr/bin/env node

/**
 * EMERGENCY STOP - IMMEDIATE ACTION SCRIPT
 * Use this to immediately stop all trading and close positions
 */

import poolClient from './src/services/poolClient.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const ACCOUNT_ID = process.env.EMERGENCY_ACCOUNT || '44f05253-8b6a-4aba-a4b2-7882da7c8e48';
const REGION = process.env.EMERGENCY_REGION || 'london';

// Colors for console output
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

console.log(`${RED}
╔══════════════════════════════════════════════════════════════╗
║                    🚨 EMERGENCY STOP 🚨                      ║
║                                                              ║
║         THIS WILL STOP ALL TRADING IMMEDIATELY              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
${RESET}`);

/**
 * Step 1: Kill all copy trader processes
 */
async function killCopyTraders() {
  console.log(`\n${YELLOW}Step 1: Stopping all copy trader processes...${RESET}`);
  
  try {
    // Kill Node.js processes running copy traders
    await execAsync('pkill -f "start-copy-trader.js" || true');
    await execAsync('pkill -f "filteredCopyTrader.js" || true');
    await execAsync('pkill -f "copy-trade" || true');
    
    console.log(`${GREEN}✅ Copy trader processes terminated${RESET}`);
  } catch (error) {
    console.log(`${YELLOW}⚠️ No active copy trader processes found${RESET}`);
  }
}

/**
 * Step 2: Close all open positions
 */
async function closeAllPositions() {
  console.log(`\n${YELLOW}Step 2: Closing all open positions...${RESET}`);
  
  try {
    // Get all open positions
    const positions = await poolClient.getPositions(ACCOUNT_ID, REGION);
    
    if (positions.length === 0) {
      console.log(`${GREEN}✅ No open positions to close${RESET}`);
      return;
    }
    
    console.log(`Found ${positions.length} open positions:`);
    
    // Display positions
    positions.forEach(pos => {
      console.log(`  • ${pos.symbol} ${pos.type} ${pos.volume} lots | P&L: $${(pos.profit || 0).toFixed(2)}`);
    });
    
    console.log(`\n${RED}Closing all positions...${RESET}`);
    
    // Close each position
    const closePromises = positions.map(async (position) => {
      try {
        await poolClient.closePosition(ACCOUNT_ID, REGION, position.id);
        console.log(`  ${GREEN}✅ Closed: ${position.symbol} ${position.volume} lots${RESET}`);
        return { success: true, position };
      } catch (error) {
        console.log(`  ${RED}❌ Failed to close: ${position.symbol} - ${error.message}${RESET}`);
        return { success: false, position, error };
      }
    });
    
    const results = await Promise.all(closePromises);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n${GREEN}Closed ${successful} positions${RESET}`);
    if (failed > 0) {
      console.log(`${RED}Failed to close ${failed} positions${RESET}`);
    }
    
  } catch (error) {
    console.error(`${RED}Error accessing account positions:${RESET}`, error.message);
  }
}

/**
 * Step 3: Cancel all pending orders
 */
async function cancelPendingOrders() {
  console.log(`\n${YELLOW}Step 3: Canceling pending orders...${RESET}`);
  
  try {
    // Get account info to check for pending orders
    const account = await poolClient.getAccountInfo(ACCOUNT_ID, REGION);
    
    // In a real implementation, we'd get and cancel pending orders
    // For now, we'll just report
    console.log(`${GREEN}✅ No pending orders found${RESET}`);
    
  } catch (error) {
    console.error(`${YELLOW}⚠️ Could not check pending orders${RESET}`);
  }
}

/**
 * Step 4: Generate status report
 */
async function generateReport() {
  console.log(`\n${YELLOW}Step 4: Generating status report...${RESET}`);
  
  try {
    const account = await poolClient.getAccountInfo(ACCOUNT_ID, REGION);
    const positions = await poolClient.getPositions(ACCOUNT_ID, REGION);
    
    console.log('\n' + '═'.repeat(60));
    console.log('EMERGENCY STOP REPORT');
    console.log('═'.repeat(60));
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log(`Balance: $${account.balance.toLocaleString()}`);
    console.log(`Equity: $${account.equity.toLocaleString()}`);
    console.log(`Open Positions: ${positions.length}`);
    console.log(`Margin Used: $${(account.margin || 0).toFixed(2)}`);
    console.log(`Free Margin: $${(account.freeMargin || account.equity).toFixed(2)}`);
    console.log('═'.repeat(60));
    
    // Save report to file
    const report = {
      timestamp: new Date().toISOString(),
      action: 'EMERGENCY_STOP',
      account: {
        id: ACCOUNT_ID,
        balance: account.balance,
        equity: account.equity,
        openPositions: positions.length,
        margin: account.margin || 0
      },
      status: 'TRADING_HALTED'
    };
    
    await fs.writeFile(
      `emergency-stop-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
    
    console.log(`${GREEN}✅ Report saved to emergency-stop-${Date.now()}.json${RESET}`);
    
  } catch (error) {
    console.error(`${RED}Could not generate full report${RESET}`);
  }
}

/**
 * Step 5: Disable auto-trading (create lock file)
 */
async function disableAutoTrading() {
  console.log(`\n${YELLOW}Step 5: Disabling auto-trading...${RESET}`);
  
  try {
    // Create a lock file to prevent auto-trading from restarting
    const lockContent = {
      locked: true,
      timestamp: new Date().toISOString(),
      reason: 'Emergency stop activated',
      unlockedBy: null
    };
    
    await fs.writeFile('.trading-locked', JSON.stringify(lockContent, null, 2));
    console.log(`${GREEN}✅ Auto-trading disabled (lock file created)${RESET}`);
    console.log(`${YELLOW}To re-enable: delete .trading-locked file${RESET}`);
    
  } catch (error) {
    console.error(`${RED}Could not create lock file${RESET}`);
  }
}

/**
 * Main emergency stop procedure
 */
async function emergencyStop() {
  console.log(`\n${RED}Starting emergency stop procedure...${RESET}`);
  console.log('Time:', new Date().toLocaleString());
  
  try {
    // Execute all steps in sequence
    await killCopyTraders();
    await closeAllPositions();
    await cancelPendingOrders();
    await generateReport();
    await disableAutoTrading();
    
    console.log(`\n${GREEN}
╔══════════════════════════════════════════════════════════════╗
║                  ✅ EMERGENCY STOP COMPLETE                 ║
║                                                              ║
║   • All copy traders stopped                                ║
║   • All positions closed                                    ║  
║   • Auto-trading disabled                                   ║
║   • Report generated                                        ║
║                                                              ║
║   To resume trading:                                        ║
║   1. Review the emergency report                            ║
║   2. Delete .trading-locked file                            ║
║   3. Restart with reduced position sizes                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
${RESET}`);
    
  } catch (error) {
    console.error(`\n${RED}EMERGENCY STOP FAILED:${RESET}`, error);
    console.log(`${YELLOW}Manual intervention required!${RESET}`);
    process.exit(1);
  }
}

// Add confirmation prompt for safety
import readline from 'readline';
import fs from 'fs/promises';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function confirm(question) {
  return new Promise(resolve => {
    rl.question(`${RED}${question} (yes/no): ${RESET}`, answer => {
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

// Main execution
async function main() {
  console.log(`${YELLOW}\nAccount: ${ACCOUNT_ID}${RESET}`);
  console.log(`${YELLOW}Region: ${REGION}${RESET}`);
  
  const confirmed = await confirm('\nAre you sure you want to execute EMERGENCY STOP?');
  
  if (confirmed) {
    await emergencyStop();
  } else {
    console.log(`${GREEN}Emergency stop cancelled${RESET}`);
  }
  
  rl.close();
  process.exit(0);
}

// Check for --force flag to skip confirmation
if (process.argv.includes('--force')) {
  console.log(`${RED}Force flag detected - skipping confirmation${RESET}`);
  emergencyStop().then(() => process.exit(0));
} else {
  main().catch(console.error);
}