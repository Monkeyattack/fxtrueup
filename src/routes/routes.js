import express from 'express';
import { createClient } from 'redis';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Get Redis config from environment or use defaults
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'dqP7gPpALbQKW8OmJg2eqgLRO8GCjSXdlVDRgG2IXEJbMnYOoD',
  db: parseInt(process.env.REDIS_DB || '0')
};

// Initialize Redis client
const redisClient = createClient({
  socket: {
    host: redisConfig.host,
    port: redisConfig.port
  },
  password: redisConfig.password,
  database: redisConfig.db
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

// Connect to Redis
(async () => {
  await redisClient.connect();
  logger.info('Connected to Redis for routing service');
})();

// Path to routing config file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, '../config/routing-config.json');

// Helper function to load config
async function loadConfig() {
  try {
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Return default config if file doesn't exist
    return {
      accounts: {},
      ruleSets: {},
      filters: {},
      routes: [],
      globalSettings: {
        emergencyStopLoss: 5000,
        dailyDrawdownLimit: 1500,
        notificationSettings: {
          telegram: { enabled: true }
        }
      }
    };
  }
}

// Helper function to save config
async function saveConfig(config) {
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  // Notify router service to reload config
  await redisClient.publish('routing:commands', JSON.stringify({ command: 'reload_config' }));
}

// Get routing configuration
router.get('/config', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (error) {
    logger.error('Error loading config:', error);
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

// Get route statistics
router.get('/stats', async (req, res) => {
  try {
    const data = await redisClient.get('routing:stats:current');
    const stats = data ? JSON.parse(data) : null;

    res.json(stats || {
      timestamp: new Date().toISOString(),
      routes: [],
      global: {
        totalRoutes: 0,
        activeRoutes: 0,
        totalProfit: 0,
        totalLoss: 0
      }
    });
  } catch (error) {
    logger.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Create new route
router.post('/', async (req, res) => {
  try {
    const config = await loadConfig();
    const newRoute = {
      id: req.body.id || `route_${Date.now()}`,
      name: req.body.name,
      description: req.body.description,
      source: req.body.source,
      destination: req.body.destination,
      ruleSet: req.body.ruleSet,
      enabled: req.body.enabled || false,
      notifications: req.body.notifications || {
        onCopy: true,
        onError: true,
        onFilter: false,
        channel: 'telegram'
      }
    };

    config.routes.push(newRoute);
    await saveConfig(config);

    res.json({ success: true, route: newRoute });
  } catch (error) {
    logger.error('Error creating route:', error);
    res.status(500).json({ error: 'Failed to create route' });
  }
});

// Update route
router.put('/:routeId', async (req, res) => {
  try {
    const config = await loadConfig();
    const routeIndex = config.routes.findIndex(r => r.id === req.params.routeId);

    if (routeIndex === -1) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Update allowed fields only
    const allowedFields = ['name', 'description', 'ruleSet', 'enabled', 'notifications'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        config.routes[routeIndex][field] = req.body[field];
      }
    });

    await saveConfig(config);
    res.json({ success: true, route: config.routes[routeIndex] });
  } catch (error) {
    logger.error('Error updating route:', error);
    res.status(500).json({ error: 'Failed to update route' });
  }
});

// Toggle route enabled/disabled
router.post('/:routeId/toggle', async (req, res) => {
  try {
    const config = await loadConfig();
    const route = config.routes.find(r => r.id === req.params.routeId);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    route.enabled = req.body.enabled;
    await saveConfig(config);

    // Send command to router service
    await redisClient.publish('routing:commands', JSON.stringify({
      command: 'toggle_route',
      route_id: req.params.routeId,
      enabled: req.body.enabled
    }));

    res.json({ success: true, route });
  } catch (error) {
    logger.error('Error toggling route:', error);
    res.status(500).json({ error: 'Failed to toggle route' });
  }
});

// Delete route
router.delete('/:routeId', async (req, res) => {
  try {
    const config = await loadConfig();
    const routeIndex = config.routes.findIndex(r => r.id === req.params.routeId);

    if (routeIndex === -1) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const deletedRoute = config.routes.splice(routeIndex, 1)[0];
    await saveConfig(config);

    res.json({ success: true, route: deletedRoute });
  } catch (error) {
    logger.error('Error deleting route:', error);
    res.status(500).json({ error: 'Failed to delete route' });
  }
});

// Test route (run a test copy)
router.post('/test', async (req, res) => {
  try {
    // For testing, we'll just return success
    // In production, this would trigger a test trade copy
    res.json({
      success: true,
      message: 'Route test initiated. Check notifications for results.'
    });
  } catch (error) {
    logger.error('Error testing route:', error);
    res.status(500).json({ error: 'Failed to test route' });
  }
});

export default router;