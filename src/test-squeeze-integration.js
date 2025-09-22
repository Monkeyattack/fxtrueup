/**
 * Test script for short squeeze integration in copy trading
 */

import EnhancedCopyTrader from './services/enhancedCopyTrader.js';
import { logger } from './utils/logger.js';

// Configure logger for testing
logger.level = 'debug';

async function testSqueezeIntegration() {
  console.log('\n🧪 Testing Short Squeeze Integration in Copy Trading\n');

  // Test symbols
  const testSymbols = [
    { symbol: 'BTCUSD', type: 'POSITION_TYPE_BUY', openPrice: 98500, volume: 0.01 },
    { symbol: 'ETHUSD', type: 'POSITION_TYPE_BUY', openPrice: 3420, volume: 0.01 },
    { symbol: 'SOLUSD', type: 'POSITION_TYPE_BUY', openPrice: 245, volume: 0.01 },
    { symbol: 'XAUUSD', type: 'POSITION_TYPE_BUY', openPrice: 2650, volume: 0.01 },
    { symbol: 'EURUSD', type: 'POSITION_TYPE_BUY', openPrice: 1.0890, volume: 0.01 },
    { symbol: 'BTCUSD', type: 'POSITION_TYPE_SELL', openPrice: 98600, volume: 0.01 }
  ];

  // Initialize enhanced copy trader
  const copyTrader = new EnhancedCopyTrader(
    'demo-account-1',
    'demo-account-2'
  );

  console.log('📊 Testing squeeze analysis for each symbol:\n');

  for (const trade of testSymbols) {
    console.log(`\n🔍 Analyzing: ${trade.symbol} (${trade.type})`);
    console.log('─'.repeat(50));

    // Get squeeze analysis
    const squeezeData = await copyTrader.getShortSqueezeData(trade.symbol);
    
    if (squeezeData) {
      console.log('📈 Squeeze Analysis:');
      console.log(`   Symbol: ${squeezeData.symbol}`);
      console.log(`   Squeeze Score: ${(squeezeData.squeezeScore * 100).toFixed(1)}%`);
      console.log(`   Confidence: ${(squeezeData.confidence * 100).toFixed(1)}%`);
      console.log(`   Short Ratio: ${(squeezeData.shortRatio * 100).toFixed(1)}%`);
      console.log(`   Sentiment: ${squeezeData.sentiment.toFixed(2)}`);
      console.log(`   Recent Change: ${(squeezeData.recentChange * 100).toFixed(1)}%`);
      console.log(`   Recommendation: ${squeezeData.recommendation}`);
    } else {
      console.log('❌ No squeeze data available');
    }

    // Test copy decision
    const decision = await copyTrader.shouldCopyTrade(trade);
    
    console.log('\n📋 Copy Decision:');
    console.log(`   Should Copy: ${decision.shouldCopy ? '✅ YES' : '❌ NO'}`);
    
    if (decision.reasons && decision.reasons.length > 0) {
      console.log('   Reasons:');
      decision.reasons.forEach(reason => {
        console.log(`   - ${reason}`);
      });
    }

    if (decision.squeezeData) {
      console.log('   💡 Squeeze Enhancement Applied');
      
      // Calculate potential position size adjustment
      if (decision.shouldCopy && trade.type === 'POSITION_TYPE_BUY' && 
          decision.squeezeData.squeezeScore >= 0.5) {
        const sizeMultiplier = 1 + (decision.squeezeData.squeezeScore - 0.5) * 0.4;
        const adjustedSize = (2.50 * Math.min(sizeMultiplier, 1.2)).toFixed(2);
        console.log(`   📊 Position Size: 2.50 → ${adjustedSize} lots`);
      }
    }
  }

  console.log('\n\n📊 Summary of Short Squeeze Integration:');
  console.log('─'.repeat(60));
  console.log('1. ✅ BUY trades with high squeeze scores get:');
  console.log('   - Increased position size (up to 20%)');
  console.log('   - Tighter stop loss (10 pips vs 20)');
  console.log('   - Special tracking in trade comments');
  console.log('\n2. ⚠️  SELL trades with high squeeze scores are:');
  console.log('   - Avoided to prevent being caught in squeeze');
  console.log('   - Logged with warning for risk management');
  console.log('\n3. 📈 Symbols with squeeze detection:');
  console.log('   - BTC, ETH, SOL, and GOLD (XAU)');
  console.log('   - Real-time analysis via meta-trader-hub API');
  console.log('   - 5-minute cache for performance');
  console.log('\n4. 🎯 Risk Management:');
  console.log('   - Position sizing still risk-based (1-1.5%)');
  console.log('   - Confidence scoring capped at 95%');
  console.log('   - Conservative fallback when API unavailable');
}

// Run test
testSqueezeIntegration().catch(console.error);