/**
 * Enhanced Secure Authentication System
 * Implements JWT authentication with security best practices
 */

class SecureAuth {
    constructor() {
        this.baseURL = window.location.origin;
        this.tokenKey = 'auth_session';
        this.refreshTokenKey = 'refresh_session';
        this.csrfToken = null;
        this.sessionId = null;
        this.refreshTimer = null;
        this.user = null;
        
        // Security settings
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.tokenRefreshBuffer = 5 * 60 * 1000; // Refresh 5 minutes before expiry
        
        // Initialize on page load
        this.init();
    }

    async init() {
        console.log('🔐 Initializing secure authentication system');
        
        // Check for existing session
        await this.checkAuthStatus();
        
        // Set up automatic token refresh
        this.setupTokenRefresh();
        
        // Set up request interceptor
        this.setupRequestInterceptor();
        
        // Set up page visibility handler for security
        this.setupVisibilityHandler();
        
        console.log('✅ Secure authentication system initialized');
    }

    async checkAuthStatus() {
        try {
            const response = await this.secureRequest('/api/auth/me');
            
            if (response && response.userId) {
                this.user = response;
                this.updateUIForAuthenticatedUser();
                console.log('✅ User authenticated:', response.email);
                return true;
            }
        } catch (error) {
            console.log('ℹ️ No active session found');
            this.handleUnauthenticated();
        }
        
        return false;
    }

    async login(email, password, gRecaptchaResponse = null) {
        console.log('🔐 Attempting secure login for:', email);
        
        // Input validation
        if (!this.validateEmail(email)) {
            throw new Error('Invalid email format');
        }
        
        if (!password || password.length < 1) {
            throw new Error('Password is required');
        }

        try {
            const response = await fetch(`${this.baseURL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include', // Include cookies
                body: JSON.stringify({
                    email: email,
                    password: password,
                    gRecaptchaResponse: gRecaptchaResponse
                })
            });

            const data = await this.handleResponse(response);
            
            if (data.user) {
                this.user = data.user;
                this.sessionId = data.sessionId;
                this.csrfToken = data.csrfToken;
                
                // Store session info securely (not in localStorage for security)
                sessionStorage.setItem(this.tokenKey, JSON.stringify({
                    sessionId: this.sessionId,
                    csrfToken: this.csrfToken,
                    expiresAt: Date.now() + (data.expiresIn * 1000)
                }));
                
                this.updateUIForAuthenticatedUser();
                this.setupTokenRefresh(data.expiresIn);
                
                console.log('✅ Login successful for:', data.user.email);
                return data;
            }
            
            throw new Error(data.error || 'Login failed');
        } catch (error) {
            console.error('❌ Login error:', error.message);
            this.handleAuthError(error);
            throw error;
        }
    }

    async logout() {
        console.log('🚪 Logging out...');
        
        try {
            await this.secureRequest('/api/auth/logout', {
                method: 'POST'
            });
        } catch (error) {
            console.warn('Logout request failed:', error.message);
        }
        
        // Clear all auth data
        this.clearAuthData();
        
        // Redirect to login
        window.location.href = '/';
        
        console.log('✅ Logged out successfully');
    }

    async refreshToken() {
        try {
            console.log('🔄 Refreshing authentication token...');
            
            const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include'
            });

            const data = await this.handleResponse(response);
            
            if (data.expiresIn) {
                const sessionData = JSON.parse(sessionStorage.getItem(this.tokenKey) || '{}');
                sessionData.expiresAt = Date.now() + (data.expiresIn * 1000);
                sessionStorage.setItem(this.tokenKey, JSON.stringify(sessionData));
                
                this.setupTokenRefresh(data.expiresIn);
                console.log('✅ Token refreshed successfully');
                return true;
            }
            
            throw new Error(data.error || 'Token refresh failed');
        } catch (error) {
            console.error('❌ Token refresh failed:', error.message);
            this.handleUnauthenticated();
            return false;
        }
    }

    async secureRequest(url, options = {}) {
        const sessionData = JSON.parse(sessionStorage.getItem(this.tokenKey) || '{}');
        
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include'
        };

        // Add CSRF protection for state-changing requests
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
            if (sessionData.csrfToken && sessionData.sessionId) {
                defaultOptions.headers['X-CSRF-Token'] = sessionData.csrfToken;
                defaultOptions.headers['X-Session-Token'] = sessionData.sessionId;
            }
        }

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers }
        };

        const response = await fetch(`${this.baseURL}${url}`, mergedOptions);
        return this.handleResponse(response);
    }

    async handleResponse(response) {
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // Handle specific error codes
            if (response.status === 401) {
                if (errorData.code === 'TOKEN_INVALID' || errorData.code === 'TOKEN_EXPIRED') {
                    // Try to refresh token
                    const refreshed = await this.refreshToken();
                    if (!refreshed) {
                        this.handleUnauthenticated();
                    }
                }
            } else if (response.status === 403) {
                if (errorData.code === 'CSRF_INVALID') {
                    console.warn('⚠️ CSRF token invalid, refreshing page for security');
                    window.location.reload();
                }
            } else if (response.status === 429) {
                console.warn('⚠️ Rate limit exceeded:', errorData.message);
            }
            
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
    }

    setupTokenRefresh(expiresIn) {
        // Clear existing timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        if (expiresIn) {
            const refreshTime = (expiresIn * 1000) - this.tokenRefreshBuffer;
            this.refreshTimer = setTimeout(() => {
                this.refreshToken();
            }, Math.max(refreshTime, 30000)); // Minimum 30 seconds
            
            console.log(`🔄 Token refresh scheduled in ${Math.round(refreshTime / 1000)} seconds`);
        }
    }

    setupRequestInterceptor() {
        // Intercept all fetch requests to add security headers
        const originalFetch = window.fetch;
        
        window.fetch = async (url, options = {}) => {
            // Add security headers for same-origin requests
            if (url.startsWith('/') || url.startsWith(this.baseURL)) {
                options.headers = options.headers || {};
                options.headers['X-Requested-With'] = 'XMLHttpRequest';
                
                // Add CSRF token for state-changing requests
                if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
                    const sessionData = JSON.parse(sessionStorage.getItem(this.tokenKey) || '{}');
                    if (sessionData.csrfToken && sessionData.sessionId) {
                        options.headers['X-CSRF-Token'] = sessionData.csrfToken;
                        options.headers['X-Session-Token'] = sessionData.sessionId;
                    }
                }
            }
            
            return originalFetch(url, options);
        };
    }

    setupVisibilityHandler() {
        // Security: Check auth status when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.user) {
                // Verify auth status when user returns to tab
                setTimeout(() => {
                    this.checkAuthStatus();
                }, 1000);
            }
        });
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    sanitizeInput(input) {
        // Basic XSS prevention
        if (typeof input !== 'string') return input;
        
        return input
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    updateUIForAuthenticatedUser() {
        // Update UI elements for authenticated state
        const authElements = document.querySelectorAll('[data-auth-required]');
        authElements.forEach(el => {
            el.style.display = 'block';
        });

        const unauthElements = document.querySelectorAll('[data-unauth-only]');
        unauthElements.forEach(el => {
            el.style.display = 'none';
        });

        // Update user info display
        if (this.user && this.user.name) {
            const userNameElements = document.querySelectorAll('[data-user-name]');
            userNameElements.forEach(el => {
                el.textContent = this.sanitizeInput(this.user.name);
            });
        }

        if (this.user && this.user.email) {
            const userEmailElements = document.querySelectorAll('[data-user-email]');
            userEmailElements.forEach(el => {
                el.textContent = this.sanitizeInput(this.user.email);
            });
        }

        // Show admin elements if user is admin
        if (this.user && this.user.isAdmin) {
            const adminElements = document.querySelectorAll('[data-admin-only]');
            adminElements.forEach(el => {
                el.style.display = 'block';
            });
        }
    }

    handleUnauthenticated() {
        this.clearAuthData();
        
        const authElements = document.querySelectorAll('[data-auth-required]');
        authElements.forEach(el => {
            el.style.display = 'none';
        });

        const unauthElements = document.querySelectorAll('[data-unauth-only]');
        unauthElements.forEach(el => {
            el.style.display = 'block';
        });

        // Redirect to login if on protected page
        const protectedPages = ['/dashboard', '/accounts', '/analytics', '/add-account', '/account-detail'];
        if (protectedPages.some(page => window.location.pathname.startsWith(page))) {
            console.log('🚪 Redirecting to login from protected page');
            window.location.href = '/?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        }
    }

    handleAuthError(error) {
        // Log security events
        if (error.message.includes('CSRF')) {
            console.error('🚨 CSRF attack detected:', error.message);
        } else if (error.message.includes('rate limit')) {
            console.warn('⚠️ Rate limit exceeded:', error.message);
        }

        // Show user-friendly error message
        this.showSecurityMessage(error.message);
    }

    showSecurityMessage(message) {
        // Create or update security message element
        let messageElement = document.getElementById('security-message');
        
        if (!messageElement) {
            messageElement = document.createElement('div');
            messageElement.id = 'security-message';
            messageElement.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50';
            document.body.appendChild(messageElement);
        }

        messageElement.textContent = this.sanitizeInput(message);
        messageElement.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (messageElement) {
                messageElement.style.display = 'none';
            }
        }, 5000);
    }

    clearAuthData() {
        this.user = null;
        this.sessionId = null;
        this.csrfToken = null;
        
        // Clear session storage
        sessionStorage.removeItem(this.tokenKey);
        sessionStorage.removeItem(this.refreshTokenKey);
        
        // Clear refresh timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    // Utility methods for components
    isAuthenticated() {
        return this.user !== null;
    }

    isAdmin() {
        return this.user && this.user.isAdmin === true;
    }

    hasSubscription(plans = []) {
        if (!this.user) return false;
        if (this.user.isAdmin) return true;
        
        const userPlan = this.user.subscription || 'free';
        return plans.length === 0 || plans.includes(userPlan);
    }

    getUser() {
        return this.user;
    }

    // Security monitoring
    reportSecurityEvent(event, details = {}) {
        console.warn('🚨 Security event:', event, details);
        
        // In production, report to security monitoring service
        fetch('/api/security/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event,
                details,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href
            })
        }).catch(error => {
            console.error('Failed to report security event:', error);
        });
    }
}

// Global auth instance
window.secureAuth = new SecureAuth();

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SecureAuth;
}

// Auto-initialize if DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🔐 DOM loaded, auth system ready');
    });
} else {
    console.log('🔐 Auth system ready');
}