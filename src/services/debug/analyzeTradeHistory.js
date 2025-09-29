// Analyze GoldBuyOnly trade history for TP/SL patterns
const trades = [
  { openPrice: 3409.18, closePrice: 3412.57, profit: 3.39 },
  { openPrice: 3427.38, closePrice: 3431.53, profit: 4.15 },
  { openPrice: 3432.54, closePrice: 3429.58, profit: -2.96 },
  // ... (truncated for analysis - would include all trades)
];

// Sample analysis of first 50 trades to identify patterns
const sampleTrades = [
  { open: 3409.18, close: 3412.57, pips: 3.39 },
  { open: 3427.38, close: 3431.53, pips: 4.15 },
  { open: 3432.54, close: 3429.58, pips: -2.96 },
  { open: 3418.48, close: 3429.58, pips: 11.10 },
  { open: 3439.60, close: 3429.58, pips: -10.02 },
  { open: 3411.22, close: 3429.58, pips: 18.36 },
  { open: 3425.23, close: 3429.58, pips: 4.35 },
  { open: 3427.39, close: 3438.26, pips: 10.87 },
  { open: 3434.26, close: 3438.46, pips: 4.20 },
  { open: 3441.35, close: 3438.46, pips: -2.89 },
  { open: 3434.97, close: 3431.67, pips: -3.30 },
  { open: 3420.47, close: 3431.67, pips: 11.20 },
  { open: 3427.58, close: 3431.67, pips: 4.09 },
  { open: 3430.83, close: 3435.23, pips: 4.40 },
  { open: 3431.70, close: 3435.72, pips: 4.02 },
  { open: 3433.04, close: 3436.89, pips: 3.85 },
  { open: 3429.88, close: 3441.77, pips: 11.89 },
  { open: 3436.49, close: 3441.77, pips: 5.28 },
  { open: 3445.61, close: 3449.80, pips: 4.19 },
  { open: 3440.44, close: 3448.14, pips: 7.70 },
];

// Calculate statistics
let totalWins = 0;
let totalLosses = 0;
let winPips = 0;
let lossPips = 0;
let allPips = [];

sampleTrades.forEach(trade => {
  const pipDiff = Math.abs(trade.pips);
  allPips.push(pipDiff);

  if (trade.pips > 0) {
    totalWins++;
    winPips += pipDiff;
  } else {
    totalLosses++;
    lossPips += pipDiff;
  }
});

const avgWinPips = winPips / totalWins;
const avgLossPips = lossPips / totalLosses;
const winRate = (totalWins / sampleTrades.length) * 100;

console.log('=== GoldBuyOnly Trading Pattern Analysis ===\n');
console.log(`Sample Size: ${sampleTrades.length} trades`);
console.log(`Win Rate: ${winRate.toFixed(1)}%`);
console.log(`Average Win: ${avgWinPips.toFixed(2)} pips ($${avgWinPips.toFixed(2)} at 0.01 lots)`);
console.log(`Average Loss: ${avgLossPips.toFixed(2)} pips ($${avgLossPips.toFixed(2)} at 0.01 lots)`);

// Analyze pip ranges
allPips.sort((a, b) => a - b);
const minPips = Math.min(...allPips);
const maxPips = Math.max(...allPips);
const medianPips = allPips[Math.floor(allPips.length / 2)];

console.log(`\nPip Movement Range:`);
console.log(`Min: ${minPips.toFixed(2)} pips`);
console.log(`Max: ${maxPips.toFixed(2)} pips`);
console.log(`Median: ${medianPips.toFixed(2)} pips`);

// Estimate TP/SL based on patterns
console.log('\n=== Observed Trading Strategy ===');
console.log('The account appears to use a scalping strategy with:');
console.log('- No fixed Stop Loss (positions ride through drawdowns)');
console.log('- Take Profit target: ~4-6 pips ($4-6 profit at 0.01 lots)');
console.log('- Some positions close at 10-20 pips for larger wins');
console.log('- Positions are managed manually or by EA logic');
console.log('\n=== Recommended Default Values for Copy Trading ===');
console.log('Since source has no SL/TP, the copy trader should use:');
console.log('- Default SL: 40-50 pips (to protect capital)');
console.log('- Default TP: 40-50 pips (to capture trends)');
console.log('- Or mirror the source strategy (no SL/TP)');