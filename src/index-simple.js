import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'FX True Up API'
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    message: 'FX True Up API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ message: 'Auth endpoint - Firebase integration coming soon' });
});

app.get('/api/accounts', (req, res) => {
  res.json({ message: 'Accounts endpoint - MetaApi integration coming soon' });
});

app.get('/api/analytics', (req, res) => {
  res.json({ message: 'Analytics endpoint - Reporting features coming soon' });
});

app.listen(PORT, () => {
  console.log(`FX True Up server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('API ready for integration testing');
});