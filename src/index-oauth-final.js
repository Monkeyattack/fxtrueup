import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API Routes
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

// Google OAuth routes (placeholder - to be implemented)
app.get('/api/auth/google/login', (req, res) => {
  // This will redirect to Google OAuth
  // For now, return a placeholder
  res.json({ 
    message: 'Google OAuth integration coming soon',
    action: 'redirect_to_google_oauth'
  });
});

app.get('/api/auth/google/callback', (req, res) => {
app.get('/api/auth/google/login', (req, res) => {  const clientId = process.env.GOOGLE_CLIENT_ID || '75344539904-i1537el99trrm9dndv5kkt12p9as5bs8.apps.googleusercontent.com';  const redirectUri = 'https://fxtrueup.com/api/auth/google/callback';  const googleAuthUrl = ;  res.redirect(googleAuthUrl);});
  res.status(401).json({ message: 'Not authenticated' });
});

// Trading accounts routes (placeholder)
app.get('/api/accounts', (req, res) => {
  res.json({ 
    message: 'MetaApi integration in progress',
    accounts: [],
    total: 0
  });
});

// Analytics routes (placeholder)  
app.get('/api/analytics', (req, res) => {
  res.json({ 
    message: 'Analytics features coming soon',
    data: {
      totalBalance: 0,
      monthlyReturn: 0,
      trades: 0
    }
  });
});

// Dashboard route (future)
app.get('/dashboard', (req, res) => {
  // For now, redirect to homepage
  res.redirect('/');
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    message: `${req.method} ${req.originalUrl} is not available`
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 FX True Up server running on port ${PORT}`);
  console.log(`📁 Serving static files from: ${path.join(__dirname, '../public')}`);
  console.log(`🌐 Homepage available at: http://localhost:${PORT}`);
  console.log(`💻 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🔄 Ready for MetaApi integration');
});

export default app;