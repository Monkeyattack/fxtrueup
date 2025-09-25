#!/usr/bin/env node

/**
 * Advanced Router CLI Service
 * Manages copy trading routes from configuration file
 */

import dotenv from 'dotenv';
import { advancedRouter } from './advancedRouter.js';
import redis from 'redis';
import { logger } from '../utils/logger.js';

dotenv.config();

// Create Redis client for command subscription
const redisClient = redis.createClient({
  host: 'localhost',
  port: 6379
});

const subscriber = redis.createClient({
  host: 'localhost',
  port: 6379
});

// Error handling
redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

subscriber.on('error', (err) => {
  logger.error('Redis Subscriber Error:', err);
});

// Connect to Redis
async function connectRedis() {
  return new Promise((resolve) => {
    redisClient.on('connect', () => {
      logger.info('📡 Connected to Redis');
      subscriber.on('connect', () => {
        logger.info('📡 Subscriber connected to Redis');
        resolve();
      });
    });
  });
}

// Subscribe to routing commands
function subscribeToCommands() {
  subscriber.subscribe('routing:commands');

  subscriber.on('message', async (channel, message) => {
    try {
      const command = JSON.parse(message);
      logger.info(`📨 Received command: ${command.command}`);

      switch (command.command) {
        case 'toggle_route':
          await advancedRouter.toggleRoute(command.route_id, command.enabled);
          break;

        case 'reload_config':
          await advancedRouter.stop();
          await advancedRouter.start();
          break;

        case 'get_stats':
          const stats = advancedRouter.getStats();
          redisClient.set('routing:stats:current', JSON.stringify(stats));
          break;

        default:
          logger.warn(`Unknown command: ${command.command}`);
      }
    } catch (error) {
      logger.error('Error processing command:', error);
    }
  });
}

// Update route statistics in Redis periodically
async function updateStats() {
  if (!advancedRouter.isRunning) return;

  const stats = advancedRouter.getStats();

  // Update global stats
  redisClient.setex('routing:stats:current', 60, JSON.stringify(stats));

  // Update per-route stats
  for (const route of stats.routes) {
    const key = `routing:stats:${route.routeId}`;
    redisClient.hset(key, {
      detected: route.stats.detected || 0,
      copied: route.stats.copied || 0,
      filtered: route.stats.filtered || 0,
      errors: route.stats.errors || 0,
      profit: route.stats.profit || 0,
      dailyLoss: route.stats.dailyLoss || 0,
      lastActivity: new Date().toISOString()
    });
    redisClient.expire(key, 3600); // Expire after 1 hour
  }
}

// Main function
async function main() {
  try {
    console.log('🚀 Advanced Router Service Starting...');

    // Connect to Redis
    await connectRedis();

    // Subscribe to commands
    subscribeToCommands();

    // Start the router
    await advancedRouter.start();

    // Update stats every 30 seconds
    setInterval(updateStats, 30000);
    updateStats(); // Initial update

    console.log('✅ Advanced Router Service Started');

    // Graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start router service:', error);
    process.exit(1);
  }
}

async function shutdown() {
  console.log('\n🛑 Shutting down Advanced Router Service...');

  try {
    // Stop the router
    await advancedRouter.stop();

    // Close Redis connections
    redisClient.quit();
    subscriber.quit();

    console.log('✅ Service stopped gracefully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the service
main();