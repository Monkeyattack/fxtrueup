#!/usr/bin/env node

/**
 * Advanced Router CLI Service
 * Manages copy trading routes from configuration file
 */

import dotenv from 'dotenv';
import { advancedRouter } from './advancedRouter.js';
import { createClient } from 'redis';
import { logger } from '../utils/logger.js';
import { vaultManager } from './vaultConfig.js';

dotenv.config();

let redisConfig;
let redisClient;
let subscriber;

function createRedisClients(config) {
  const clientOptions = {
    socket: {
      host: config.host,
      port: config.port
    },
    password: config.password,
    database: config.db
  };

  redisClient = createClient(clientOptions);
  subscriber = createClient(clientOptions);

  redisClient.on('error', (err) => {
    logger.error('Redis Client Error:', err);
  });

  subscriber.on('error', (err) => {
    logger.error('Redis Subscriber Error:', err);
  });
}

// Connect to Redis
async function connectRedis() {
  if (redisClient?.isOpen && subscriber?.isOpen) {
    return;
  }

  redisConfig = await vaultManager.getRedisConfig();

  if (!redisClient || !subscriber) {
    createRedisClients(redisConfig);
  }

  await redisClient.connect();
  logger.info(`📡 Connected to Redis at ${redisConfig.host}:${redisConfig.port}`);
  await subscriber.connect();
  logger.info('📡 Subscriber connected to Redis');
}

// Subscribe to routing commands
async function subscribeToCommands() {
  if (!subscriber) {
    throw new Error('Redis subscriber not initialized');
  }

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
          if (!redisClient) {
            throw new Error('Redis client not initialized');
          }
          const stats = advancedRouter.getStats();
          await redisClient.set('routing:stats:current', JSON.stringify(stats));
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
  if (!advancedRouter.isRunning || !redisClient?.isOpen) return;

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

    // Connect to Redis using Vault-backed configuration
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
    if (redisClient?.isOpen) {
      await redisClient.disconnect();
    }
    if (subscriber?.isOpen) {
      await subscriber.disconnect();
    }

    console.log('✅ Service stopped gracefully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the service
main();
