// Auth Debug Helper
console.log('🔍 Auth Debug Helper Loaded');

// Check localStorage
const token = localStorage.getItem('authToken');
console.log('📍 Token in localStorage:', token ? `${token.substring(0, 20)}...` : 'Not found');

// Check URL params
const urlParams = new URLSearchParams(window.location.search);
const tokenFromUrl = urlParams.get('token');
console.log('📍 Token in URL:', tokenFromUrl ? `${tokenFromUrl.substring(0, 20)}...` : 'Not found');

// Monitor localStorage changes
window.addEventListener('storage', (e) => {
    if (e.key === 'authToken') {
        console.log('🔄 Auth token changed:', e.newValue ? 'Set' : 'Removed');
    }
});

// Add auth status to page
document.addEventListener('DOMContentLoaded', () => {
    const authStatus = document.createElement('div');
    authStatus.id = 'auth-debug-status';
    authStatus.style.cssText = 'position: fixed; bottom: 10px; right: 10px; background: #333; color: white; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px; z-index: 9999;';
    authStatus.innerHTML = `
        <div>Auth Debug</div>
        <div>Token: ${token ? '✅ Present' : '❌ Missing'}</div>
        <div>Length: ${token ? token.length : 0}</div>
    `;
    document.body.appendChild(authStatus);
});

// Global helper function
window.checkAuthStatus = async () => {
    const token = localStorage.getItem('authToken');
    console.log('🔍 Checking auth status...');
    console.log('Token:', token);
    
    if (!token) {
        console.log('❌ No token found');
        return false;
    }
    
    try {
        const response = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('Response status:', response.status);
        
        if (response.ok) {
            const user = await response.json();
            console.log('✅ Authenticated as:', user.email);
            return true;
        } else {
            console.log('❌ Auth check failed');
            return false;
        }
    } catch (error) {
        console.error('❌ Auth check error:', error);
        return false;
    }
};