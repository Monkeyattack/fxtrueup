import { auth } from '../services/firebase.js';
import { logger } from '../utils/logger.js';

export async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = {
      userId: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    };

    // Get additional user data from Firestore
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      req.user = {
        ...req.user,
        ...userData
      };
    }

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = {
      userId: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    };

    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      req.user = {
        ...req.user,
        ...userData
      };
    }
  } catch (error) {
    logger.warn('Optional auth failed:', error.message);
  }

  next();
}

export function requireSubscription(allowedPlans = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPlan = req.user.subscriptionPlan || 'free';
    const isActive = req.user.subscriptionStatus === 'active' || 
                    req.user.subscriptionStatus === 'trialing';

    // If no specific plans required, just check if they have any active subscription
    if (allowedPlans.length === 0 && !isActive) {
      return res.status(403).json({ 
        error: 'Active subscription required',
        requiredPlans: 'any'
      });
    }

    // Check if user's plan is in allowed plans
    if (allowedPlans.length > 0 && (!isActive || !allowedPlans.includes(userPlan))) {
      return res.status(403).json({ 
        error: 'Insufficient subscription plan',
        currentPlan: userPlan,
        requiredPlans: allowedPlans
      });
    }

    next();
  };
}