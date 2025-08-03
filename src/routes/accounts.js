import express from 'express';

const router = express.Router();

// Placeholder account routes
router.get('/', (req, res) => {
  res.json({ message: 'Accounts endpoint - implement MetaApi integration here' });
});

export default router;