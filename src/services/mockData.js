import { faker } from '@faker-js/faker';

class MockDataGenerator {
  constructor() {
    this.symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD'];
    this.startBalance = 10000;
  }

  generateAccountInfo() {
    const balance = this.startBalance + faker.number.float({ min: -2000, max: 5000, precision: 0.01 });
    const equity = balance + faker.number.float({ min: -500, max: 500, precision: 0.01 });
    
    return {
      login: faker.number.int({ min: 100000, max: 999999 }),
      name: 'Demo Account',
      server: 'Demo-Server',
      currency: 'USD',
      leverage: faker.helpers.arrayElement([50, 100, 200, 500]),
      balance: balance,
      equity: equity,
      margin: Math.max(0, faker.number.float({ min: 0, max: equity * 0.3, precision: 0.01 })),
      freeMargin: equity - (equity * 0.1),
      credit: 0,
      platform: 'MetaTrader 5',
      type: 'HEDGE',
      company: 'Demo Broker Ltd.'
    };
  }

  generateRealisticTrades(days = 30) {
    const trades = [];
    const tradesPerDay = faker.number.int({ min: 0, max: 5 });
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    let runningBalance = this.startBalance;
    let tradeId = 1000000;

    for (let d = 0; d < days; d++) {
      const dayTrades = faker.number.int({ min: 0, max: tradesPerDay });
      
      for (let t = 0; t < dayTrades; t++) {
        const openTime = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
        openTime.setHours(faker.number.int({ min: 0, max: 23 }));
        openTime.setMinutes(faker.number.int({ min: 0, max: 59 }));
        
        const duration = faker.number.int({ min: 5, max: 1440 }); // 5 min to 24 hours
        const closeTime = new Date(openTime.getTime() + duration * 60 * 1000);
        
        const symbol = faker.helpers.arrayElement(this.symbols);
        const volume = faker.helpers.arrayElement([0.01, 0.05, 0.1, 0.2, 0.5, 1.0]);
        const type = faker.helpers.arrayElement(['BUY', 'SELL']);
        
        // Realistic profit/loss distribution (more small trades, few big ones)
        const profitProbability = faker.number.float({ min: 0, max: 1 });
        let profit;
        if (profitProbability < 0.55) { // 55% win rate
          profit = faker.number.float({ min: 10, max: 200, precision: 0.01 }) * volume;
        } else {
          profit = -faker.number.float({ min: 10, max: 150, precision: 0.01 }) * volume;
        }
        
        runningBalance += profit;
        
        const openPrice = this.getRealisticPrice(symbol);
        const closePrice = type === 'BUY' 
          ? openPrice + (profit / (volume * 100000))
          : openPrice - (profit / (volume * 100000));
        
        trades.push({
          id: tradeId++,
          type: 'DEAL_TYPE_' + type,
          entryType: 'DEAL_ENTRY_OUT',
          symbol: symbol,
          volume: volume,
          time: closeTime.toISOString(),
          brokerTime: closeTime.toISOString(),
          openTime: openTime.toISOString(),
          openPrice: openPrice,
          price: closePrice,
          profit: profit,
          swap: faker.number.float({ min: -5, max: 2, precision: 0.01 }),
          commission: -faker.number.float({ min: 0, max: 10, precision: 0.01 }),
          magic: 0,
          reason: 'DEAL_REASON_CLIENT',
          accountCurrencyExchangeRate: 1
        });
      }
    }
    
    return trades.sort((a, b) => new Date(a.time) - new Date(b.time));
  }

  getRealisticPrice(symbol) {
    const prices = {
      'EURUSD': faker.number.float({ min: 1.0500, max: 1.1000, precision: 0.00001 }),
      'GBPUSD': faker.number.float({ min: 1.2000, max: 1.3000, precision: 0.00001 }),
      'USDJPY': faker.number.float({ min: 140.00, max: 150.00, precision: 0.001 }),
      'AUDUSD': faker.number.float({ min: 0.6200, max: 0.6800, precision: 0.00001 }),
      'USDCAD': faker.number.float({ min: 1.3000, max: 1.3800, precision: 0.00001 }),
      'XAUUSD': faker.number.float({ min: 1900, max: 2100, precision: 0.01 })
    };
    return prices[symbol] || 1.0;
  }

  generatePositions() {
    const hasPositions = faker.datatype.boolean();
    if (!hasPositions) return [];
    
    const numPositions = faker.number.int({ min: 1, max: 3 });
    const positions = [];
    
    for (let i = 0; i < numPositions; i++) {
      const symbol = faker.helpers.arrayElement(this.symbols);
      const type = faker.helpers.arrayElement(['POSITION_TYPE_BUY', 'POSITION_TYPE_SELL']);
      const volume = faker.helpers.arrayElement([0.01, 0.05, 0.1, 0.2]);
      const openPrice = this.getRealisticPrice(symbol);
      const currentPrice = openPrice * (1 + faker.number.float({ min: -0.01, max: 0.01 }));
      const profit = type === 'POSITION_TYPE_BUY' 
        ? (currentPrice - openPrice) * volume * 100000
        : (openPrice - currentPrice) * volume * 100000;
      
      positions.push({
        id: faker.number.int({ min: 1000000, max: 9999999 }),
        type: type,
        symbol: symbol,
        magic: 0,
        time: faker.date.recent({ days: 2 }).toISOString(),
        brokerTime: faker.date.recent({ days: 2 }).toISOString(),
        openPrice: openPrice,
        volume: volume,
        swap: faker.number.float({ min: -2, max: 0.5, precision: 0.01 }),
        profit: profit,
        commission: 0,
        clientId: '',
        unrealizedProfit: profit,
        realizedProfit: 0,
        currentPrice: currentPrice,
        currentTickValue: 1,
        accountCurrencyExchangeRate: 1,
        updateSequenceNumber: faker.number.int({ min: 1000, max: 9999 })
      });
    }
    
    return positions;
  }

  generateMetrics(deals) {
    let wins = 0;
    let losses = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let maxDrawdown = 0;
    let peak = this.startBalance;
    let runningBalance = this.startBalance;
    
    deals.forEach(deal => {
      const netProfit = (deal.profit || 0) + (deal.commission || 0) + (deal.swap || 0);
      runningBalance += netProfit;
      
      if (netProfit > 0) {
        wins++;
        totalProfit += netProfit;
      } else if (netProfit < 0) {
        losses++;
        totalLoss += Math.abs(netProfit);
      }
      
      if (runningBalance > peak) {
        peak = runningBalance;
      }
      const drawdown = ((peak - runningBalance) / peak) * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    });
    
    return {
      totalTrades: deals.length,
      winRate: deals.length > 0 ? (wins / deals.length) * 100 : 0,
      profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0,
      totalProfit: totalProfit,
      totalLoss: totalLoss,
      netProfit: totalProfit - totalLoss,
      maxDrawdown: maxDrawdown,
      averageWin: wins > 0 ? totalProfit / wins : 0,
      averageLoss: losses > 0 ? totalLoss / losses : 0,
      expectancy: deals.length > 0 ? (totalProfit - totalLoss) / deals.length : 0
    };
  }

  generateMockAccount(timeframe = 'monthly') {
    const days = timeframe === 'quarterly' ? 90 : 30;
    const accountInfo = this.generateAccountInfo();
    const deals = this.generateRealisticTrades(days);
    const positions = this.generatePositions();
    const metrics = this.generateMetrics(deals);
    
    return {
      accountId: `mock_${faker.string.alphanumeric(8)}`,
      accountInfo,
      deals,
      positions,
      metrics,
      lastUpdate: new Date().toISOString(),
      isMockData: true
    };
  }
}

export default new MockDataGenerator();