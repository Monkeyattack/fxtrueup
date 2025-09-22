/**
 * Short Squeeze API Client
 * Integrates with meta-trader-hub's short squeeze analysis service
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

class ShortSqueezeClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.META_TRADER_HUB_URL || 'http://localhost:5000';
    this.apiKey = config.apiKey || process.env.META_TRADER_HUB_API_KEY;
    this.timeout = config.timeout || 10000;
    
    // Cache configuration
    this.cache = new Map();
    this.cacheConfig = {
      ttl: config.cacheTTL || 5 * 60 * 1000, // 5 minutes default
      maxSize: config.cacheMaxSize || 100
    };
    
    // Symbol mapping for different platforms
    this.symbolMapping = {
      // MetaTrader to Analysis symbols
      'BTCUSD': 'BTC',
      'Bitcoin': 'BTC',
      'BTC/USD': 'BTC',
      'ETHUSD': 'ETH',
      'Ethereum': 'ETH',
      'ETH/USD': 'ETH',
      'SOLUSD': 'SOL',
      'Solana': 'SOL',
      'SOL/USD': 'SOL',
      'XAUUSD': 'GOLD',
      'Gold': 'GOLD',
      'XAU/USD': 'GOLD'
    };
  }

  /**
   * Get short squeeze analysis for a symbol
   */
  async getSqueezeAnalysis(symbol) {
    try {
      // Map symbol to analysis format
      const analysisSymbol = this.normalizeSymbol(symbol);
      if (!analysisSymbol) {
        logger.warn(`No mapping found for symbol: ${symbol}`);
        return null;
      }

      // Check cache
      const cached = this.getFromCache(analysisSymbol);
      if (cached) {
        logger.debug(`Cache hit for ${analysisSymbol}`);
        return cached;
      }

      // Call API
      const response = await fetch(`${this.baseUrl}/api/squeeze-analysis/${analysisSymbol}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform response to our format
      const analysis = this.transformSqueezeData(data, analysisSymbol);
      
      // Cache result
      this.setCache(analysisSymbol, analysis);
      
      return analysis;

    } catch (error) {
      logger.error(`Error fetching squeeze analysis for ${symbol}:`, error);
      
      // Return fallback analysis on error
      return this.getFallbackAnalysis(symbol);
    }
  }

  /**
   * Get batch squeeze analysis for multiple symbols
   */
  async getBatchSqueezeAnalysis(symbols) {
    try {
      // Normalize all symbols
      const normalizedSymbols = symbols
        .map(s => this.normalizeSymbol(s))
        .filter(s => s !== null);

      if (normalizedSymbols.length === 0) {
        return {};
      }

      // Check cache for all symbols
      const results = {};
      const uncachedSymbols = [];

      for (const symbol of normalizedSymbols) {
        const cached = this.getFromCache(symbol);
        if (cached) {
          results[symbol] = cached;
        } else {
          uncachedSymbols.push(symbol);
        }
      }

      // Fetch uncached symbols
      if (uncachedSymbols.length > 0) {
        const response = await fetch(`${this.baseUrl}/api/squeeze-analysis/batch`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ symbols: uncachedSymbols }),
          timeout: this.timeout
        });

        if (response.ok) {
          const batchData = await response.json();
          
          // Transform and cache each result
          for (const [symbol, data] of Object.entries(batchData)) {
            const analysis = this.transformSqueezeData(data, symbol);
            results[symbol] = analysis;
            this.setCache(symbol, analysis);
          }
        }
      }

      return results;

    } catch (error) {
      logger.error('Error fetching batch squeeze analysis:', error);
      return {};
    }
  }

  /**
   * Get real-time squeeze alerts
   */
  async getSqueezeAlerts(options = {}) {
    try {
      const params = new URLSearchParams({
        minScore: options.minScore || 0.7,
        symbols: options.symbols?.join(',') || '',
        limit: options.limit || 10
      });

      const response = await fetch(`${this.baseUrl}/api/squeeze-alerts?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const alerts = await response.json();
      
      return alerts.map(alert => ({
        symbol: alert.symbol,
        score: alert.squeeze_score,
        type: alert.alert_type,
        timestamp: new Date(alert.timestamp),
        metadata: alert.metadata
      }));

    } catch (error) {
      logger.error('Error fetching squeeze alerts:', error);
      return [];
    }
  }

  /**
   * Subscribe to squeeze updates via WebSocket
   */
  subscribeToSqueezeUpdates(symbols, callback) {
    try {
      const ws = new WebSocket(`${this.baseUrl.replace('http', 'ws')}/ws/squeeze-updates`);
      
      ws.on('open', () => {
        logger.info('Connected to squeeze updates WebSocket');
        
        // Subscribe to symbols
        ws.send(JSON.stringify({
          type: 'subscribe',
          symbols: symbols.map(s => this.normalizeSymbol(s)).filter(s => s !== null),
          apiKey: this.apiKey
        }));
      });

      ws.on('message', (data) => {
        try {
          const update = JSON.parse(data);
          const analysis = this.transformSqueezeData(update.data, update.symbol);
          
          // Update cache
          this.setCache(update.symbol, analysis);
          
          // Notify callback
          callback(analysis);
        } catch (error) {
          logger.error('Error processing squeeze update:', error);
        }
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });

      ws.on('close', () => {
        logger.info('Disconnected from squeeze updates WebSocket');
        
        // Attempt reconnection after 5 seconds
        setTimeout(() => {
          this.subscribeToSqueezeUpdates(symbols, callback);
        }, 5000);
      });

      return ws;

    } catch (error) {
      logger.error('Error subscribing to squeeze updates:', error);
      return null;
    }
  }

  /**
   * Transform API data to our analysis format
   */
  transformSqueezeData(data, symbol) {
    if (!data) return null;

    const squeezeScore = this.calculateSqueezeScore(data);
    const confidence = Math.min(0.95, squeezeScore);
    
    return {
      symbol,
      timestamp: new Date(),
      squeezeScore,
      confidence,
      shortRatio: data.short_ratio || data.shortRatio || 0,
      sentiment: data.sentiment || 0,
      recentChange: data.recent_change || data.recentChange || 0,
      volume: data.volume || 0,
      recommendation: this.getRecommendation(squeezeScore, data),
      metadata: {
        shortInterest: data.short_interest || 0,
        borrowRate: data.borrow_rate || 0,
        daysTocover: data.days_to_cover || 0,
        floatShorted: data.float_shorted || 0,
        sentimentScore: data.sentiment_score || 0,
        socialVolume: data.social_volume || 0,
        priceAction: data.price_action || {},
        technicalIndicators: data.technical_indicators || {}
      }
    };
  }

  /**
   * Calculate squeeze score based on multiple factors
   */
  calculateSqueezeScore(data) {
    let score = 0;
    
    // Short ratio component (0-0.3)
    const shortRatio = data.short_ratio || data.shortRatio || 0;
    if (shortRatio > 0.8) score += 0.3;
    else if (shortRatio > 0.7) score += 0.25;
    else if (shortRatio > 0.6) score += 0.2;
    else if (shortRatio > 0.5) score += 0.1;
    
    // Sentiment component (0-0.3)
    const sentiment = data.sentiment || 0;
    if (sentiment < -0.6) score += 0.3;
    else if (sentiment < -0.4) score += 0.2;
    else if (sentiment < -0.2) score += 0.1;
    
    // Recent change component (0-0.4)
    const recentChange = data.recent_change || data.recentChange || 0;
    if (recentChange > 0.25) score += 0.4;
    else if (recentChange > 0.15) score += 0.3;
    else if (recentChange > 0.1) score += 0.2;
    else if (recentChange > 0.05) score += 0.1;
    
    // Additional factors from metadata
    if (data.days_to_cover > 3) score += 0.05;
    if (data.borrow_rate > 5) score += 0.05;
    if (data.social_volume > 1000) score += 0.05;
    
    return Math.min(1, score);
  }

  /**
   * Get trading recommendation based on squeeze score
   */
  getRecommendation(score, data) {
    if (score >= 0.8) {
      return 'STRONG_SQUEEZE_IMMINENT';
    } else if (score >= 0.6) {
      return 'HIGH_SQUEEZE_POTENTIAL';
    } else if (score >= 0.4) {
      return 'MODERATE_SQUEEZE_POTENTIAL';
    } else {
      return 'LOW_SQUEEZE_POTENTIAL';
    }
  }

  /**
   * Get fallback analysis when API is unavailable
   */
  getFallbackAnalysis(symbol) {
    // Use conservative estimates for safety
    return {
      symbol: this.normalizeSymbol(symbol) || symbol,
      timestamp: new Date(),
      squeezeScore: 0.3, // Conservative default
      confidence: 0.3,
      shortRatio: 0.5,
      sentiment: -0.1,
      recentChange: 0.05,
      volume: 0,
      recommendation: 'LOW_SQUEEZE_POTENTIAL',
      metadata: {
        isFallback: true,
        reason: 'API unavailable'
      }
    };
  }

  /**
   * Normalize symbol to analysis format
   */
  normalizeSymbol(symbol) {
    if (!symbol) return null;
    
    // Check direct mapping
    if (this.symbolMapping[symbol]) {
      return this.symbolMapping[symbol];
    }
    
    // Check if symbol contains any mapped values
    const upperSymbol = symbol.toUpperCase();
    for (const [key, value] of Object.entries(this.symbolMapping)) {
      if (upperSymbol.includes(key.toUpperCase())) {
        return value;
      }
    }
    
    return null;
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheConfig.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  setCache(key, data) {
    // Implement simple LRU by removing oldest entries if size exceeded
    if (this.cache.size >= this.cacheConfig.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Short squeeze cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.cacheConfig.maxSize,
      ttl: this.cacheConfig.ttl,
      entries: Array.from(this.cache.keys())
    };
  }
}

export default ShortSqueezeClient;