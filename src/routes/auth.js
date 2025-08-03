import express from 'express';

const router = express.Router();

// Placeholder auth routes
router.get('/me', (req, res) => {
  res.json({ message: 'Auth endpoint - implement Firebase auth here' });
});

export default router;