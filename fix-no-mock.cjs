const fs = require('fs');

// Read the server file
let content = fs.readFileSync('server-metaapi-integrated.js', 'utf8');

// Remove all mock data generation and return empty arrays instead
content = content.replace(/console\.log\("📋 Using mock trading data.*?\n.*?res\.json\({[\s\S]*?}\);/gm, 
  'console.log("📋 No real trading data available");\n    res.json({ deals: [] });');

// Remove mock positions data
content = content.replace(/console\.log\("📋 Using mock positions data.*?\n.*?res\.json\({ positions: mockPositions }\);/gm,
  'console.log("📋 No real positions available");\n    res.json({ positions: [] });');

// Remove mock account data in the accounts listing
content = content.replace(/\/\/ Return account with mock\/default data[\s\S]*?dataSource: 'mock'[\s\S]*?};/gm,
  '// No mock data - return account as is\n      return account;');

// Remove mock analytics data
content = content.replace(/const mockAnalytics = {[\s\S]*?res\.json\(mockAnalytics\);/gm,
  'res.json({ totalProfit: 0, totalTrades: 0, winRate: 0, profitFactor: 0, maxDrawdown: 0, sharpeRatio: 0, averageWin: 0, averageLoss: 0, largestWin: 0, largestLoss: 0, period: period, charts: { profitLoss: [], winLossDistribution: [] } });');

// Write the cleaned file
fs.writeFileSync('server-metaapi-integrated.js', content);

console.log('✅ Removed all mock data generation');
