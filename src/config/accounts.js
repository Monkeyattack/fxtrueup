// FXTrueUp Account Configurations
// These are the accounts managed by our connection pool

export const ACCOUNT_CONFIGS = {
  // Gold Buy Only Service - Main source account for copy trading
  GOLD_BUY_ONLY: {
    id: '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac',
    name: 'Gold Buy Only Service',
    region: 'london',
    type: 'source',
    description: 'High-performance gold trading strategy with 74.6% win rate'
  },
  
  // Grid Demo - Target account for filtered copy trading
  GRID_DEMO: {
    id: '019ec0f0-09f5-4230-a7bd-fa2930af07a4',
    name: 'Grid Demo - Prop Firm',
    region: 'new-york',
    type: 'target',
    description: '$118k prop firm account receiving filtered trades'
  },
  
  // MonkeyAttack Gold EA Demo
  GOLD_EA_DEMO: {
    id: 'd25b9ece-3422-43e8-a59b-cf85246beb3b',
    name: 'MonkeyAttack Gold EA Demo',
    region: 'new-york',
    type: 'demo',
    description: 'Gold EA testing account'
  },
  
  // Prop Firm Demo $50k
  PROP_FIRM_50K: {
    id: '166bea1c-306e-4a6a-8720-823a0134474f',
    name: 'Prop Firm Demo $50k',
    region: 'new-york', 
    type: 'demo',
    description: 'MT5 prop firm demo account'
  }
};

// Export individual account IDs for convenience
export const GOLD_ACCOUNT_ID = ACCOUNT_CONFIGS.GOLD_BUY_ONLY.id;
export const GRID_ACCOUNT_ID = ACCOUNT_CONFIGS.GRID_DEMO.id;

// Get all account IDs
export function getAllAccountIds() {
  return Object.values(ACCOUNT_CONFIGS).map(config => config.id);
}

// Get account by ID
export function getAccountConfig(accountId) {
  return Object.values(ACCOUNT_CONFIGS).find(config => config.id === accountId);
}

// Get accounts by type
export function getAccountsByType(type) {
  return Object.values(ACCOUNT_CONFIGS).filter(config => config.type === type);
}

export default ACCOUNT_CONFIGS;