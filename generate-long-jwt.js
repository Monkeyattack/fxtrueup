const jwt = require('jsonwebtoken');
require('dotenv').config();

const user = {
  id: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',
  userId: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',
  email: 'meredith@monkeyattack.com',
  name: 'C. Meredith',
  isAdmin: true,
  subscription: 'enterprise'
};

const accessToken = jwt.sign(
  { ...user, type: 'access' },
  process.env.JWT_SECRET,
  { 
    expiresIn: '7d', // 7 days instead of 1 hour
    issuer: 'fxtrueup.com',
    audience: 'fxtrueup.com'
  }
);

console.log('Long-lived JWT Token (7 days):');
console.log(accessToken);
