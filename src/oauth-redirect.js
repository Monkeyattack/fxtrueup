// Google OAuth configuration
export const getGoogleAuthUrl = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
  const redirectUri = process.env.NODE_ENV === 'production' 
    ? 'https://fxtrueup.com/api/auth/google/callback'
    : 'http://localhost:8080/api/auth/google/callback';
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent'
  });
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};
