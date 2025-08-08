import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://fxtrueup.com', 'https://www.fxtrueup.com']
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'FX True Up API'
  });
});

// Basic API route
app.get('/api/status', (req, res) => {
  res.json({
    message: 'FX True Up API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// API Routes (basic placeholders for now)
app.get('/api/auth/me', (req, res) => {
  res.json({ message: 'Auth endpoint - Firebase integration coming soon' });
});

app.get('/api/accounts', (req, res) => {
  res.json({ message: 'Accounts endpoint - MetaApi integration coming soon' });
});

app.get('/api/analytics', (req, res) => {
  res.json({ message: 'Analytics endpoint - Reporting features coming soon' });
});

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info();
  logger.info();
  logger.info('API ready for integration testing');
});
