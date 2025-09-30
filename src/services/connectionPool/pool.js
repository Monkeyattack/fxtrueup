import dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

class ConnectionPool extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // accountId -> { connection, account, lastUsed }
    this.apiInstances = new Map(); // region -> MetaApi instance
    this.token = process.env.METAAPI_TOKEN;
    this.MetaApi = null; // Will be loaded dynamically
    
    // Stats tracking
    this.stats = {
      connectionsCreated: 0,
      connectionsReused: 0,
      tradesExecuted: 0,
      errors: 0,
      activeConnections: 0
    };
    
    // Connection timeout (5 minutes)
    this.CONNECTION_TIMEOUT = 5 * 60 * 1000;
    
    // Start cleanup interval
    this.startCleanupInterval();
    
    console.log('✅ Connection Pool initialized');
  }
  
  async loadMetaApi() {
    if (!this.MetaApi) {
      try {
        // Use the Node.js-specific distribution to avoid browser-specific code
        const module = await import('metaapi.cloud-sdk/esm-node');
        this.MetaApi = module.default || module;
        console.log('✅ MetaApi SDK loaded (Node.js distribution)');
      } catch (error) {
        console.error('❌ Failed to load MetaApi SDK:', error);
        throw error;
      }
    }
  }
  
  async getConnection(accountId, region = 'new-york') {
    // Ensure MetaApi is loaded
    await this.loadMetaApi();
    
    // Check for existing connection
    const existing = this.connections.get(accountId);
    if (existing) {
      try {
        // Verify connection is still alive and synchronized
        if (existing.connection.terminalState && existing.connection.terminalState.accountInformation) {
          existing.lastUsed = Date.now();
          this.stats.connectionsReused++;
          console.log(`♻️  Reusing connection for ${accountId.substring(0, 8)}...`);
          return existing.connection;
        } else {
          console.log(`🔄 Connection not synchronized for ${accountId.substring(0, 8)}, recreating...`);
          this.connections.delete(accountId);
          this.stats.activeConnections--;
        }
      } catch (err) {
        console.log(`🔄 Connection stale for ${accountId.substring(0, 8)}, recreating...`);
        this.connections.delete(accountId);
        this.stats.activeConnections--;
      }
    }
    
    // Create new connection
    try {
      console.log(`📡 Creating connection for ${accountId.substring(0, 8)}...`);
      
      // Get or create API instance for region
      if (!this.apiInstances.has(region)) {
        this.apiInstances.set(region, new this.MetaApi(this.token, { region }));
      }
      const api = this.apiInstances.get(region);
      
      // Get account
      const account = await api.metatraderAccountApi.getAccount(accountId);
      
      // Deploy if needed
      if (account.state !== 'DEPLOYED') {
        console.log(`🚀 Deploying account ${accountId.substring(0, 8)}...`);
        await account.deploy();
      }
      
      // Wait for connection
      await account.waitConnected();
      
      // Get streaming connection (for real-time data and trading operations)
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      // Store connection
      this.connections.set(accountId, {
        account,
        connection,
        lastUsed: Date.now(),
        region
      });
      
      this.stats.connectionsCreated++;
      this.stats.activeConnections++;
      
      console.log(`✅ Connected to ${accountId.substring(0, 8)} (total: ${this.stats.activeConnections})`);
      
      return connection;
      
    } catch (err) {
      console.error(`❌ Failed to connect to ${accountId}:`, err.message);
      this.stats.errors++;
      throw err;
    }
  }
  
  async executeTrade(accountId, region, tradeData) {
    try {
      console.log(`📊 Executing trade on ${accountId.substring(0, 8)}:`, {
        symbol: tradeData.symbol,
        volume: tradeData.volume,
        action: tradeData.action
      });
      
      const connection = await this.getConnection(accountId, region);
      
      // Execute trade based on action
      let result;
      if (tradeData.action.toUpperCase() === 'BUY') {
        result = await connection.createMarketBuyOrder(
          tradeData.symbol,
          tradeData.volume,
          tradeData.stopLoss,
          tradeData.takeProfit,
          {
            comment: tradeData.comment || 'FXTrueUp',
            clientId: tradeData.clientId
          }
        );
      } else {
        result = await connection.createMarketSellOrder(
          tradeData.symbol,
          tradeData.volume,
          tradeData.stopLoss,
          tradeData.takeProfit,
          {
            comment: tradeData.comment || 'FXTrueUp',
            clientId: tradeData.clientId
          }
        );
      }
      
      this.stats.tradesExecuted++;
      
      console.log(`✅ Trade executed: ${result.orderId}`);
      
      return {
        success: true,
        orderId: result.orderId,
        ...result
      };
      
    } catch (err) {
      console.error(`❌ Trade execution failed:`, err.message);
      this.stats.errors++;
      return {
        success: false,
        error: err.message
      };
    }
  }
  
  async getPositions(accountId, region) {
    try {
      const connection = await this.getConnection(accountId, region);
      const positions = connection.terminalState.positions || [];
      return positions;
    } catch (err) {
      console.error(`❌ Failed to get positions:`, err.message);
      return [];
    }
  }
  
  async getAccountInfo(accountId, region) {
    try {
      const connection = await this.getConnection(accountId, region);
      const info = connection.terminalState.accountInformation;
      
      if (!info) {
        throw new Error('Account information not available - connection may not be synchronized');
      }
      
      return info;
    } catch (err) {
      console.error(`❌ Failed to get account info:`, err.message);
      throw err;
    }
  }
  
  async closePosition(accountId, region, positionId) {
    try {
      const connection = await this.getConnection(accountId, region);

      // Get position info before closing to capture profit
      const positions = await connection.getPositions();
      const position = positions.find(p => p.id === positionId);
      const profit = position ? position.profit : 0;

      const result = await connection.closePosition(positionId);
      console.log(`✅ Position ${positionId} closed with profit: $${profit}`);

      return {
        success: true,
        profit: profit,
        orderId: result.orderId
      };
    } catch (err) {
      console.error(`❌ Failed to close position:`, err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }
  
  async modifyPosition(accountId, region, positionId, stopLoss, takeProfit) {
    try {
      const connection = await this.getConnection(accountId, region);
      await connection.modifyPosition(positionId, stopLoss, takeProfit);
      console.log(`✅ Position ${positionId} modified`);
      return true;
    } catch (err) {
      console.error(`❌ Failed to modify position:`, err.message);
      return false;
    }
  }
  
  // Cleanup old connections
  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [accountId, conn] of this.connections.entries()) {
        if (now - conn.lastUsed > this.CONNECTION_TIMEOUT) {
          this.closeConnection(accountId);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} idle connections`);
      }
    }, 60000); // Check every minute
  }
  
  async closeConnection(accountId) {
    const conn = this.connections.get(accountId);
    if (conn) {
      try {
        await conn.connection.close();
        await conn.account.undeploy();
      } catch (err) {
        // Ignore errors during cleanup
      }
      this.connections.delete(accountId);
      this.stats.activeConnections--;
      console.log(`👋 Closed connection for ${accountId.substring(0, 8)}`);
    }
  }
  
  async closeAll() {
    console.log('🔌 Closing all connections...');
    const promises = [];
    for (const accountId of this.connections.keys()) {
      promises.push(this.closeConnection(accountId));
    }
    await Promise.all(promises);
    console.log('✅ All connections closed');
  }
  
  getStats() {
    return {
      ...this.stats,
      reuse_ratio: this.stats.connectionsCreated > 0 
        ? this.stats.connectionsReused / (this.stats.connectionsCreated + this.stats.connectionsReused)
        : 0
    };
  }
}

// Singleton instance
let poolInstance = null;

export function getPool() {
  if (!poolInstance) {
    poolInstance = new ConnectionPool();
  }
  return poolInstance;
}

export async function cleanup() {
  if (poolInstance) {
    await poolInstance.closeAll();
    poolInstance = null;
  }
}

export default { getPool, cleanup };