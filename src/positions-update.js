  // Get real open positions if account has metaApiAccountId
  if (account.metaApiAccountId) {
    try {
      console.log(📊 Getting real positions from MetaApi for:, account.metaApiAccountId);
      const realPositions = await metaApiService.getPositions(account.metaApiAccountId);
      if (realPositions) {
        console.log(✅ Real positions retrieved:, realPositions.length, positions);
        return res.json({ positions: realPositions });
      }
    } catch (error) {
      console.error(❌ Failed to get real positions:, error);
    }
  }

  // Fallback to mock data
  console.log(📋 Using mock positions for account:, accountId);
