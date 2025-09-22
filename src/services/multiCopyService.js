// Orchestrates multiple FilteredCopyTrader instances for multiple routes

import dotenv from 'dotenv';
import FilteredCopyTrader from './filteredCopyTrader.js';

dotenv.config();

export function createMultiCopyService(routes = []) {
  const traders = [];

  function buildTrader(route) {
    const { sourceId, destId, destRegion = 'new-york', fixedLotSize = 2.50, maxDailyTrades = 5 } = route;
    const trader = new FilteredCopyTrader(sourceId, destId, destRegion);
    trader.config.fixedLotSize = fixedLotSize;
    trader.config.maxDailyTrades = maxDailyTrades;
    return trader;
  }

  return {
    start: async () => {
      for (const route of routes) {
        const trader = buildTrader(route);
        traders.push({ route, trader });
      }
      for (const { route, trader } of traders) {
        console.log(`🚀 Starting route: ${route.sourceId} → ${route.destId} (${route.destRegion})`);
        await trader.start();
      }
      return true;
    },
    stop: () => {
      for (const { trader } of traders) {
        try { trader.stop(); } catch (_) {}
      }
    },
    getStats: () => {
      return traders.map(({ route, trader }) => ({
        route,
        stats: trader.getStats()
      }));
    }
  };
}

export default { createMultiCopyService };

