// Replace the POST /api/accounts endpoint with this updated version

app.post('/api/accounts', authenticateJWT, upload.single('csvFile'), async (req, res) => {
  try {
    let accountData;
    
    // Handle multipart form data (with file upload)
    if (req.file) {
      // Parse form data when file is uploaded
      accountData = {
        ...req.body,
        tags: req.body.tags ? JSON.parse(req.body.tags) : [],
        id: Date.now().toString(),
        userId: req.user.userId,
        createdAt: new Date().toISOString()
      };
      
      // Process CSV file for manual accounts
      if (accountData.connectionMethod === 'manual' && req.file) {
        try {
          const trades = await csvTradeHandler.parseCSVFile(req.file.path);
          const stats = await csvTradeHandler.storeTrades(accountData.id, trades);
          
          // Update account with CSV stats
          accountData.csvTradeCount = stats.totalTrades;
          accountData.csvProfit = stats.totalProfit;
          accountData.csvFirstTrade = stats.firstTradeDate;
          accountData.csvLastTrade = stats.lastTradeDate;
          accountData.hasCSVData = true;
          
          // Set balance if not provided
          if (!accountData.currentBalance) {
            accountData.currentBalance = stats.totalProfit;
          }
          
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
        } catch (csvError) {
          console.error('CSV processing error:', csvError);
          // Clean up file on error
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(400).json({ error: 'Failed to process CSV file' });
        }
      }
    } else {
      // Regular JSON request
      accountData = {
        ...req.body,
        id: Date.now().toString(),
        userId: req.user.userId,
        createdAt: new Date().toISOString()
      };
    }
    
    // Add account to store
    const success = tokenStore.addAccount(req.user.userId, accountData);
    
    if (success) {
      res.status(201).json({ 
        message: 'Account added successfully',
        account: accountData 
      });
    } else {
      res.status(400).json({ error: 'Failed to add account' });
    }
  } catch (error) {
    console.error('Error adding account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update the account details endpoint to support manual accounts with CSV data
app.get('/api/accounts/:id/details', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    let enhancedAccount = { ...account };
    let deals = [];
    let positions = [];
    let metrics = null;

    // Check if this is a manual account with CSV data
    if (account.connectionMethod === 'manual' && account.hasCSVData) {
      try {
        // Get data from CSV trades
        deals = await csvTradeHandler.getDealsForAccount(accountId);
        metrics = await csvTradeHandler.getAccountMetrics(accountId);
        positions = []; // Manual accounts don't have open positions
        
        enhancedAccount = {
          ...account,
          balance: account.currentBalance || metrics.balance,
          equity: account.equity || metrics.equity,
          profit: metrics.profit,
          connected: true,
          connectionStatus: 'manual'
        };
      } catch (error) {
        console.error('Error fetching CSV data:', error);
      }
    } else if (account.metaApiAccountId && metaApiService) {
      // Original MetaAPI logic
      try {
        const [realMetrics, accountDeals, accountPositions] = await Promise.all([
          metaApiService.getAccountMetrics(account.metaApiAccountId),
          metaApiService.getDeals(account.metaApiAccountId),
          metaApiService.getPositions(account.metaApiAccountId).catch(() => [])
        ]);

        if (realMetrics) {
          metrics = realMetrics;
          enhancedAccount = {
            ...account,
            balance: realMetrics.balance,
            equity: realMetrics.equity,
            profit: realMetrics.profit,
            connected: true
          };
        }

        deals = accountDeals || [];
        positions = accountPositions || [];
      } catch (error) {
        console.error('MetaApi error:', error);
      }
    }

    res.json({
      success: true,
      account: enhancedAccount,
      deals: deals.slice(0, 100),
      positions: positions,
      metrics: metrics || {
        balance: account.balance || 0,
        equity: account.equity || 0,
        profit: 0,
        trades: 0
      }
    });
  } catch (error) {
    console.error('Error in account details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update other endpoints to support manual accounts
app.get('/api/accounts/:id/deals', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const { startDate, endDate, symbol, type } = req.query;
    
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    let deals = [];
    
    if (account.connectionMethod === 'manual' && account.hasCSVData) {
      // Get deals from CSV data
      deals = await csvTradeHandler.getDealsForAccount(
        accountId,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );
      
      // Apply filters
      if (symbol) {
        deals = deals.filter(deal => 
          deal.symbol.toLowerCase().includes(symbol.toLowerCase())
        );
      }
      if (type) {
        deals = deals.filter(deal => deal.type === type);
      }
    } else if (account.metaApiAccountId && metaApiService) {
      // Original MetaAPI logic
      try {
        deals = await metaApiService.getAccountDeals(
          account.metaApiAccountId,
          startDate ? new Date(startDate) : undefined,
          endDate ? new Date(endDate) : undefined
        );

        if (symbol) {
          deals = deals.filter(deal => 
            deal.symbol.toLowerCase().includes(symbol.toLowerCase())
          );
        }
        if (type) {
          deals = deals.filter(deal => deal.type === type);
        }
      } catch (error) {
        console.error('Error fetching deals:', error);
        return res.status(500).json({ error: 'Failed to fetch deals' });
      }
    }

    res.json({ 
      deals: deals,
      total: deals.length,
      filtered: !!symbol || !!type
    });
  } catch (error) {
    console.error('Error in deals endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});