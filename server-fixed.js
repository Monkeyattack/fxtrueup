import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Get the correct path to public directory (going up from src to project root)
const publicPath = path.resolve(__dirname, '..', 'public');

console.log('🔍 Server starting from:', __dirname);
console.log('📁 Public directory:', publicPath);
console.log('🌐 Port:', PORT);

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

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fx-true-up-session-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files from public directory
app.use(express.static(publicPath));

// Homepage route
app.get('/', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  console.log('📄 Serving homepage from:', indexPath);
  res.sendFile(indexPath);
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
    timestamp: new Date().toISOString(),
    publicPath: publicPath
  });
});

// Google OAuth routes
app.get('/api/auth/google/login', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '75344539904-i1537el99trrm9dndv5kkt12p9as5bs8.apps.googleusercontent.com';
  const redirectUri = 'https://fxtrueup.com/api/auth/google/callback';
  const scope = 'openid email profile';
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
  res.redirect(googleAuthUrl);
});

app.get('/api/auth/google/callback', async (req, res) => {
  // Handle Google OAuth callback
  // For now, create a mock session (in production, verify with Google)
  const { code, state } = req.query;
  
  if (code) {
    // Mock user data - in production, exchange code for tokens and get user info
    req.session.user = {
      id: '123',
      email: 'user@example.com',
      name: 'User',
      picture: null,
      isAdmin: false
    };
    
    // Check for admin email
    if (req.session.user.email === 'meredith@monkeyattack.com') {
      req.session.user.isAdmin = true;
    }
    
    res.redirect('/dashboard');
  } else {
    res.redirect('/?auth=failed');
  }
});

app.get('/api/auth/me', (req, res) => {
  // Check if user is authenticated
  if (req.session && req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
    } else {
      res.json({ message: 'Logged out successfully' });
    }
  });
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

// Dashboard route
app.get('/dashboard', (req, res) => {
  // Serve dashboard HTML
  res.sendFile(path.join(publicPath, 'dashboard.html'));
});

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// Protected routes
app.get('/api/protected/*', requireAuth);

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
  console.log(`📁 Serving static files from: ${publicPath}`);
  console.log(`🌐 Homepage available at: http://localhost:${PORT}`);
  console.log(`💻 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🔄 Ready for MetaApi integration');
});

export default app;