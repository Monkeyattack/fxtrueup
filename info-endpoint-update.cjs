// Enhanced /api/accounts/:id/info endpoint that supports both MetaAPI and manual accounts
app.get('/api/accounts/:id/info', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Handle manual accounts with CSV data
    if (account.connectionMethod === 'manual') {
      try {
        let enhancedAccount = { ...account };
        
        // If account has CSV data, get metrics from it
        if (account.hasCSVData && csvTradeHandler) {
          const metrics = await csvTradeHandler.getAccountMetrics(accountId);
          enhancedAccount = {
            ...account,
            balance: account.currentBalance || metrics.balance || 0,
            equity: account.equity || metrics.equity || 0,
            profit: metrics.profit || 0,
            totalTrades: metrics.trades || 0,
            winRate: metrics.winRate || 0,
            connected: true,
            connectionStatus: 'manual',
            lastUpdate: new Date().toISOString(),
            dataSource: 'CSV Import'
          };
        } else {
          // Manual account without CSV data
          enhancedAccount = {
            ...account,
            balance: account.currentBalance || account.initialBalance || 0,
            equity: account.equity || account.currentBalance || account.initialBalance || 0,
            profit: 0,
            totalTrades: 0,
            connected: true,
            connectionStatus: 'manual',
            lastUpdate: new Date().toISOString(),
            dataSource: 'Manual Entry'
          };
        }
        
        return res.json({ 
          account: enhancedAccount,
          realtime: false,
          manual: true
        });
      } catch (error) {
        console.error('Error processing manual account info:', error);
        // Return basic account data if processing fails
        return res.json({ 
          account: {
            ...account,
            balance: account.currentBalance || account.initialBalance || 0,
            equity: account.equity || account.currentBalance || account.initialBalance || 0,
            connected: true,
            connectionStatus: 'manual'
          },
          realtime: false,
          manual: true
        });
      }
    }

    // Handle MetaAPI accounts (original logic)
    if (!account.metaApiAccountId || !metaApiService) {
      return res.json({ 
        account: account,
        realtime: false,
        message: 'MetaAPI not configured for this account' 
      });
    }

    try {
      // Get real-time account info from MetaAPI
      const metrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
      
      res.json({ 
        account: {
          ...account,
          balance: metrics.balance,
          equity: metrics.equity,
          margin: metrics.margin,
          freeMargin: metrics.freeMargin,
          marginLevel: metrics.marginLevel,
          profit: metrics.profit,
          connected: true,
          connectionStatus: 'live',
          lastUpdate: new Date().toISOString(),
          dataSource: 'MetaAPI Live'
        },
        realtime: true,
        manual: false
      });
    } catch (error) {
      console.error('Error fetching real-time info:', error);
      // Return cached account data if real-time fails
      res.json({ 
        account: {
          ...account,
          connected: false,
          connectionStatus: 'error'
        },
        realtime: false,
        error: 'Failed to fetch real-time data'
      });
    }
  } catch (error) {
    console.error('Error in info endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});