  // Get real trading history if account has metaApiAccountId
  if (account.metaApiAccountId) {
    try {
      console.log(📈 Getting real trading history from MetaApi for:, account.metaApiAccountId);
      const realDeals = await metaApiService.getDeals(account.metaApiAccountId);
      if (realDeals && realDeals.length > 0) {
        console.log(✅ Real deals retrieved:, realDeals.length, deals);
        return res.json({ deals: realDeals });
      }
    } catch (error) {
      console.error(❌ Failed to get real deals:, error);
    }
  }

  // Fallback to mock data
  console.log(📋 Using mock trading data for account:, accountId);
