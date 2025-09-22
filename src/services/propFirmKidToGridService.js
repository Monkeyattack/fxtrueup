// Dedicated service to copy filtered trades from PropFirmKidEA (source)
// to Grid Demo (destination) using the existing FilteredCopyTrader.

import dotenv from 'dotenv';
import FilteredCopyTrader from './filteredCopyTrader.js';
import { ACCOUNT_CONFIGS, PROP_FIRMKID_EA_ID, GRID_ACCOUNT_ID } from '../config/accounts.js';

dotenv.config();

export function createPropFirmKidToGridService(options = {}) {
  const sourceId = options.sourceId || PROP_FIRMKID_EA_ID;
  const destId = options.destId || GRID_ACCOUNT_ID;
  const destRegion = options.destRegion || ACCOUNT_CONFIGS.GRID_DEMO.region || 'new-york';
  const fixedLotSize = options.fixedLotSize != null ? options.fixedLotSize : 2.50;

  const trader = new FilteredCopyTrader(sourceId, destId, destRegion);

  // Apply baseline risk config (kept same size as requested)
  trader.config.fixedLotSize = fixedLotSize;
  trader.config.maxDailyTrades = options.maxDailyTrades || 5;

  return {
    start: async () => {
      await trader.start();
      return true;
    },
    stop: () => trader.stop(),
    getStats: () => trader.getStats(),
    get config() { return trader.config; }
  };
}

export default { createPropFirmKidToGridService };

