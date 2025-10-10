#!/usr/bin/env node

/**
 * Interactive CLI Wizard for Managing Copy Trading Routes
 * Provides an easy interface to create, edit, and manage routes
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../config/routing-config.json');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

class RouteWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.config = null;
  }

  // Helper to print colored text
  print(text, color = 'reset') {
    console.log(`${colors[color]}${text}${colors.reset}`);
  }

  // Helper to ask a question
  async ask(question, color = 'cyan') {
    return new Promise((resolve) => {
      this.rl.question(`${colors[color]}${question}${colors.reset}`, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  // Load configuration
  async loadConfig() {
    try {
      const data = await fs.readFile(CONFIG_PATH, 'utf8');
      this.config = JSON.parse(data);
      this.print('✅ Configuration loaded successfully', 'green');
      return true;
    } catch (error) {
      this.print(`❌ Failed to load config: ${error.message}`, 'red');
      return false;
    }
  }

  // Save configuration
  async saveConfig() {
    try {
      await fs.writeFile(CONFIG_PATH, JSON.stringify(this.config, null, 2));
      this.print('✅ Configuration saved successfully', 'green');
      return true;
    } catch (error) {
      this.print(`❌ Failed to save config: ${error.message}`, 'red');
      return false;
    }
  }

  // Display header
  showHeader() {
    console.clear();
    this.print('╔════════════════════════════════════════════════════════╗', 'cyan');
    this.print('║     📋 Copy Trading Route Management Wizard 📋        ║', 'cyan');
    this.print('╚════════════════════════════════════════════════════════╝', 'cyan');
    console.log();
  }

  // Display main menu
  async showMainMenu() {
    this.showHeader();
    this.print('What would you like to do?', 'bright');
    console.log();
    this.print('1. Create new route', 'yellow');
    this.print('2. List existing routes', 'yellow');
    this.print('3. Enable/Disable route', 'yellow');
    this.print('4. Delete route', 'yellow');
    this.print('5. View accounts', 'yellow');
    this.print('6. View rulesets', 'yellow');
    this.print('0. Exit', 'yellow');
    console.log();

    const choice = await this.ask('Enter your choice: ');
    return choice;
  }

  // List accounts by type
  displayAccounts(type = null) {
    const accounts = Object.entries(this.config.accounts);
    const filtered = type
      ? accounts.filter(([_, acc]) => acc.type === type)
      : accounts;

    if (filtered.length === 0) {
      this.print(`No ${type || ''} accounts found`, 'yellow');
      return [];
    }

    console.log();
    filtered.forEach(([id, acc], index) => {
      const typeLabel = acc.type === 'source' ? '📤' : '📥';
      const platform = acc.platform ? `(${acc.platform.toUpperCase()})` : '';
      this.print(
        `${index + 1}. ${typeLabel} ${acc.nickname} ${platform} - $${acc.balance.toLocaleString()}`,
        'cyan'
      );
      this.print(`   ID: ${id.slice(0, 8)}...`, 'dim');
    });
    console.log();

    return filtered;
  }

  // List rulesets
  displayRuleSets() {
    const ruleSets = Object.entries(this.config.ruleSets);

    console.log();
    ruleSets.forEach(([id, rule], index) => {
      this.print(`${index + 1}. ${rule.name}`, 'cyan');
      this.print(`   Type: ${rule.type}`, 'dim');
      if (rule.multiplier) this.print(`   Multiplier: ${rule.multiplier}x`, 'dim');
      if (rule.fixedLotSize) this.print(`   Fixed Size: ${rule.fixedLotSize} lots`, 'dim');
      if (rule.maxDailyLoss) this.print(`   Daily Loss Limit: $${rule.maxDailyLoss}`, 'dim');
      this.print(`   Description: ${rule.description}`, 'dim');
      console.log();
    });

    return ruleSets;
  }

  // Select account
  async selectAccount(type) {
    this.showHeader();
    this.print(`Select ${type} account:`, 'bright');

    const accounts = this.displayAccounts(type);
    if (accounts.length === 0) return null;

    const choice = await this.ask('Enter account number: ');
    const index = parseInt(choice) - 1;

    if (index >= 0 && index < accounts.length) {
      return accounts[index];
    }

    this.print('Invalid selection', 'red');
    return null;
  }

  // Select ruleset
  async selectRuleSet() {
    this.showHeader();
    this.print('Select ruleset:', 'bright');

    const ruleSets = this.displayRuleSets();
    const choice = await this.ask('Enter ruleset number: ');
    const index = parseInt(choice) - 1;

    if (index >= 0 && index < ruleSets.length) {
      return ruleSets[index];
    }

    this.print('Invalid selection', 'red');
    return null;
  }

  // Create new route
  async createRoute() {
    this.showHeader();
    this.print('🎯 Create New Route', 'bright');
    console.log();

    // Select source
    const source = await this.selectAccount('source');
    if (!source) return;

    // Select destination
    const destination = await this.selectAccount('destination');
    if (!destination) return;

    // Select ruleset
    const ruleSet = await this.selectRuleSet();
    if (!ruleSet) return;

    // Route details
    this.showHeader();
    this.print('Route Configuration:', 'bright');
    console.log();
    this.print(`Source:      ${source[1].nickname}`, 'cyan');
    this.print(`Destination: ${destination[1].nickname}`, 'cyan');
    this.print(`Ruleset:     ${ruleSet[1].name}`, 'cyan');
    console.log();

    const name = await this.ask('Enter route name: ');
    const description = await this.ask('Enter description: ');

    const copyExisting = await this.ask('Copy existing positions? (y/n): ');
    const enableNotifications = await this.ask('Enable notifications? (y/n): ');
    const startEnabled = await this.ask('Start route enabled? (y/n): ');

    // Generate route ID
    const routeId = `${source[1].nickname}_to_${destination[1].nickname}_${Date.now()}`.replace(/\s+/g, '_');

    // Create route object
    const newRoute = {
      id: routeId,
      enabled: startEnabled.toLowerCase() === 'y',
      name: name || `${source[1].nickname} → ${destination[1].nickname}`,
      source: source[0],
      destination: destination[0],
      ruleSet: ruleSet[0],
      description: description || 'Created via CLI wizard',
      copyExistingPositions: copyExisting.toLowerCase() === 'y',
      notifications: {
        onCopy: enableNotifications.toLowerCase() === 'y',
        onError: true,
        onFilter: false,
        channel: 'telegram'
      }
    };

    // Add to config
    this.config.routes.push(newRoute);

    // Save
    if (await this.saveConfig()) {
      console.log();
      this.print('✅ Route created successfully!', 'green');
      this.print(`   Route ID: ${routeId}`, 'dim');
      console.log();
      this.print('🔄 Restart the router service to apply changes:', 'yellow');
      this.print('   pm2 restart fxtrueup-router', 'cyan');
    }

    await this.ask('\nPress Enter to continue...');
  }

  // List routes
  async listRoutes() {
    this.showHeader();
    this.print('📋 Existing Routes', 'bright');
    console.log();

    if (this.config.routes.length === 0) {
      this.print('No routes configured', 'yellow');
    } else {
      this.config.routes.forEach((route, index) => {
        const status = route.enabled ? '✅' : '⏸️';
        const source = this.config.accounts[route.source];
        const dest = this.config.accounts[route.destination];

        this.print(`${index + 1}. ${status} ${route.name}`, route.enabled ? 'green' : 'yellow');
        this.print(`   ${source.nickname} → ${dest.nickname}`, 'cyan');
        this.print(`   Ruleset: ${this.config.ruleSets[route.ruleSet].name}`, 'dim');
        this.print(`   Description: ${route.description}`, 'dim');
        console.log();
      });
    }

    await this.ask('Press Enter to continue...');
  }

  // Toggle route enabled status
  async toggleRoute() {
    this.showHeader();
    this.print('🔄 Enable/Disable Route', 'bright');
    console.log();

    if (this.config.routes.length === 0) {
      this.print('No routes configured', 'yellow');
      await this.ask('Press Enter to continue...');
      return;
    }

    this.config.routes.forEach((route, index) => {
      const status = route.enabled ? '✅ Enabled' : '⏸️  Disabled';
      this.print(`${index + 1}. ${status} - ${route.name}`, route.enabled ? 'green' : 'yellow');
    });

    console.log();
    const choice = await this.ask('Enter route number (0 to cancel): ');
    const index = parseInt(choice) - 1;

    if (index < 0 || index >= this.config.routes.length) return;

    const route = this.config.routes[index];
    route.enabled = !route.enabled;

    if (await this.saveConfig()) {
      this.print(`✅ Route ${route.enabled ? 'enabled' : 'disabled'} successfully`, 'green');
      console.log();
      this.print('🔄 Restart the router service to apply changes:', 'yellow');
      this.print('   pm2 restart fxtrueup-router', 'cyan');
    }

    await this.ask('\nPress Enter to continue...');
  }

  // Delete route
  async deleteRoute() {
    this.showHeader();
    this.print('🗑️  Delete Route', 'bright');
    console.log();

    if (this.config.routes.length === 0) {
      this.print('No routes configured', 'yellow');
      await this.ask('Press Enter to continue...');
      return;
    }

    this.config.routes.forEach((route, index) => {
      this.print(`${index + 1}. ${route.name}`, 'cyan');
    });

    console.log();
    const choice = await this.ask('Enter route number to delete (0 to cancel): ');
    const index = parseInt(choice) - 1;

    if (index < 0 || index >= this.config.routes.length) return;

    const route = this.config.routes[index];
    const confirm = await this.ask(`⚠️  Delete "${route.name}"? This cannot be undone! (yes/no): `);

    if (confirm.toLowerCase() === 'yes') {
      this.config.routes.splice(index, 1);

      if (await this.saveConfig()) {
        this.print('✅ Route deleted successfully', 'green');
        console.log();
        this.print('🔄 Restart the router service to apply changes:', 'yellow');
        this.print('   pm2 restart fxtrueup-router', 'cyan');
      }
    } else {
      this.print('Deletion cancelled', 'yellow');
    }

    await this.ask('\nPress Enter to continue...');
  }

  // View accounts
  async viewAccounts() {
    this.showHeader();
    this.print('📊 Trading Accounts', 'bright');

    this.print('\n📤 Source Accounts:', 'green');
    this.displayAccounts('source');

    this.print('📥 Destination Accounts:', 'blue');
    this.displayAccounts('destination');

    await this.ask('Press Enter to continue...');
  }

  // View rulesets
  async viewRuleSets() {
    this.showHeader();
    this.print('📐 Available Rulesets', 'bright');
    this.displayRuleSets();
    await this.ask('Press Enter to continue...');
  }

  // Main loop
  async run() {
    // Load config
    if (!await this.loadConfig()) {
      this.rl.close();
      process.exit(1);
    }

    // Main loop
    let running = true;
    while (running) {
      const choice = await this.showMainMenu();

      switch (choice) {
        case '1':
          await this.createRoute();
          break;
        case '2':
          await this.listRoutes();
          break;
        case '3':
          await this.toggleRoute();
          break;
        case '4':
          await this.deleteRoute();
          break;
        case '5':
          await this.viewAccounts();
          break;
        case '6':
          await this.viewRuleSets();
          break;
        case '0':
          running = false;
          break;
        default:
          this.print('Invalid choice', 'red');
          await this.ask('Press Enter to continue...');
      }
    }

    this.print('\n👋 Goodbye!', 'green');
    this.rl.close();
  }
}

// Run wizard
const wizard = new RouteWizard();
wizard.run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
