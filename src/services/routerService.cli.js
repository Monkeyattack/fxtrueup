#!/usr/bin/env node

/**
 * Advanced Router CLI Service
 * Manages copy trading routes from configuration file
 */

import dotenv from 'dotenv';
import { advancedRouter } from './advancedRouter.js';
import { createClient } from 'redis';
import { logger } from '../utils/logger.js';

dotenv.config();

// Get Redis config from environment or use defaults
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'dqP7gPpALbQKW8OmJg2eqgLRO8GCjSXdlVDRgG2IXEJbMnYOoD',
  db: parseInt(process.env.REDIS_DB || '0')
};

// Create Redis client for command subscription
const redisClient = createClient({
  socket: {
    host: redisConfig.host,
    port: redisConfig.port
  },
  password: redisConfig.password,
  database: redisConfig.db
});

const subscriber = createClient({
  socket: {
    host: redisConfig.host,
    port: redisConfig.port
  },
  password: redisConfig.password,
  database: redisConfig.db
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
  await redisClient.connect();
  logger.info('📡 Connected to Redis');
  await subscriber.connect();
  logger.info('📡 Subscriber connected to Redis');
}

// Subscribe to routing commands
async function subscribeToCommands() {
  await subscriber.subscribe('routing:commands', async (message) => {
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
  await redisClient.setEx('routing:stats:current', 60, JSON.stringify(stats));

  // Update per-route stats
  for (const route of stats.routes) {
    const key = `routing:stats:${route.routeId}`;
    await redisClient.hSet(key, 'detected', String(route.stats.detected || 0));
    await redisClient.hSet(key, 'copied', String(route.stats.copied || 0));
    await redisClient.hSet(key, 'filtered', String(route.stats.filtered || 0));
    await redisClient.hSet(key, 'errors', String(route.stats.errors || 0));
    await redisClient.hSet(key, 'profit', String(route.stats.profit || 0));
    await redisClient.hSet(key, 'dailyLoss', String(route.stats.dailyLoss || 0));
    await redisClient.hSet(key, 'lastActivity', new Date().toISOString());
    await redisClient.expire(key, 3600); // Expire after 1 hour
  }
}

// Main function
async function main() {
  try {
    console.log('🚀 Advanced Router Service Starting...');

    // Connect to Redis
    await connectRedis();

    // Subscribe to commands
    await subscribeToCommands();

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
    await redisClient.disconnect();
    await subscriber.disconnect();

    console.log('✅ Service stopped gracefully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the service
main();