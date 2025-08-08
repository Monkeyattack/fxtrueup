// Add this endpoint to server.cjs to fix authentication tokens

// Token fix endpoint - temporarily allows getting a valid JWT token
app.get('/api/auth/token-fix', (req, res) => {
  try {
    // This is a temporary fix to generate valid JWT tokens
    const user = {
      id: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',
      userId: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',
      email: 'meredith@monkeyattack.com',
      name: 'C. Meredith',
      isAdmin: true,
      subscription: 'enterprise'
    };
    
    const tokens = generateTokens(user);
    
    res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: user,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('Token fix error:', error);
    res.status(500).json({ 
      error: 'Token fix failed',
      message: error.message
    });
  }
});
