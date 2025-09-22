// Define copy routes for multi-source/multi-destination service
// Each route: { sourceId, destId, destRegion?, fixedLotSize?, maxDailyTrades? }

import { ACCOUNT_CONFIGS, GOLD_ACCOUNT_ID, GRID_ACCOUNT_ID, PROP_FIRMKID_EA_ID } from './accounts.js';

export const COPY_ROUTES = [
  // PropFirmKidEA ($100k) → Grid Demo ($118k) - Use proportional sizing
  {
    sourceId: PROP_FIRMKID_EA_ID,
    destId: GRID_ACCOUNT_ID,
    destRegion: ACCOUNT_CONFIGS.GRID_DEMO.region,
    // No fixedLotSize - will use proportional copying (1.18x multiplier)
    maxDailyTrades: 5
  },
  // Example 2: Gold Buy Only → Grid Demo (can run concurrently)
  // Uncomment if you want both
  // {
  //   sourceId: GOLD_ACCOUNT_ID,
  //   destId: GRID_ACCOUNT_ID,
  //   destRegion: ACCOUNT_CONFIGS.GRID_DEMO.region,
  //   fixedLotSize: 2.50,
  //   maxDailyTrades: 5
  // }
];

export default COPY_ROUTES;

