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
    expiresIn: '1h',
    issuer: 'fxtrueup.com',
    audience: 'fxtrueup.com'
  }
);

console.log('Generated JWT Access Token:');
console.log(accessToken);

// Test token verification
try {
  const decoded = jwt.verify(accessToken, process.env.JWT_SECRET, {
    issuer: 'fxtrueup.com',
    audience: 'fxtrueup.com'
  });
  console.log('\nToken verification successful\!');
  console.log('Decoded payload:', decoded);
} catch (error) {
  console.log('\nToken verification failed:', error.message);
}
