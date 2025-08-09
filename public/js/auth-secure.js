// Secure Authentication Handler for Frontend
class SecureAuthHandler {
    constructor() {
        this.token = null;
        this.refreshTimer = null;
        this.csrfToken = null;
        this.init();
    }

    async init() {
        // Check if we have a secure session
        await this.checkSecureSession();
        
        // Set up CSRF protection
        await this.setupCSRFProtection();
        
        // Set up automatic token refresh
        this.setupTokenRefresh();
        
        // Set up security event listeners
        this.setupSecurityListeners();
    }

    // SECURE: Use httpOnly cookies instead of localStorage
    async checkSecureSession() {
        try {
            // Don't store tokens in localStorage - use secure HTTP-only cookies
            const response = await fetch('/api/auth/verify-session', {
                method: 'GET',
                credentials: 'include', // Include httpOnly cookies
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest' // CSRF protection
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.csrfToken = data.csrfToken;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Session check failed:', error);
            return false;
        }
    }

    // CSRF Protection
    async setupCSRFProtection() {
        try {
            const response = await fetch('/api/auth/csrf-token', {
                credentials: 'include'
            });
            const data = await response.json();
            this.csrfToken = data.csrfToken;
            
            // Add CSRF token to all forms
            this.addCSRFTokenToForms();
        } catch (error) {
            console.error('CSRF setup failed:', error);
        }
    }

    addCSRFTokenToForms() {
        document.querySelectorAll('form').forEach(form => {
            // Remove existing CSRF token if present
            const existingInput = form.querySelector('input[name="csrfToken"]');
            if (existingInput) {
                existingInput.remove();
            }

            // Add new CSRF token
            if (this.csrfToken) {
                const csrfInput = document.createElement('input');
                csrfInput.type = 'hidden';
                csrfInput.name = 'csrfToken';
                csrfInput.value = this.csrfToken;
                form.appendChild(csrfInput);
            }
        });
    }

    // Secure API calls with CSRF and XSS protection
    async secureApiCall(url, options = {}) {
        const secureOptions = {
            ...options,
            credentials: 'include', // Include httpOnly cookies
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-Token': this.csrfToken,
                ...options.headers
            }
        };

        // Add CSRF token to POST, PUT, DELETE requests
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase())) {
            if (options.body && typeof options.body === 'object') {
                options.body.csrfToken = this.csrfToken;
                secureOptions.body = JSON.stringify(options.body);
            }
        }

        try {
            const response = await fetch(url, secureOptions);
            
            // Handle authentication errors
            if (response.status === 401) {
                this.handleAuthenticationError();
                throw new Error('Authentication required');
            }
            
            // Handle CSRF errors
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.code === 'CSRF_TOKEN_MISMATCH') {
                    await this.setupCSRFProtection();
                    throw new Error('CSRF token expired, please retry');
                }
            }

            return response;
        } catch (error) {
            console.error('Secure API call failed:', error);
            throw error;
        }
    }

    // Secure login process
    async secureLogin(provider = 'google') {
        try {
            // Clear any existing session data
            await this.secureLogout(false);
            
            // Generate state parameter for OAuth security
            const state = this.generateSecureState();
            sessionStorage.setItem('oauth_state', state);
            
            // Redirect to secure OAuth flow
            const loginUrl = `/api/auth/${provider}/login?state=${encodeURIComponent(state)}`;
            window.location.href = loginUrl;
        } catch (error) {
            console.error('Secure login failed:', error);
            this.showSecurityError('Login failed. Please try again.');
        }
    }

    // Secure logout
    async secureLogout(redirect = true) {
        try {
            // Clear any client-side data
            sessionStorage.clear();
            
            // Remove CSRF tokens
            this.csrfToken = null;
            
            // Clear refresh timer
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }

            // Call server logout endpoint
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (redirect) {
                // Use replace to prevent back button issues
                window.location.replace('/');
            }
        } catch (error) {
            console.error('Logout error:', error);
            if (redirect) {
                window.location.replace('/');
            }
        }
    }

    // Generate secure state for OAuth
    generateSecureState() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Verify OAuth state
    verifyOAuthState() {
        const urlParams = new URLSearchParams(window.location.search);
        const state = urlParams.get('state');
        const storedState = sessionStorage.getItem('oauth_state');
        
        if (!state || !storedState || state !== storedState) {
            throw new Error('OAuth state verification failed - possible CSRF attack');
        }
        
        sessionStorage.removeItem('oauth_state');
        return true;
    }

    // Set up automatic token refresh
    setupTokenRefresh() {
        // Refresh session every 50 minutes (tokens typically expire in 60 minutes)
        this.refreshTimer = setInterval(async () => {
            try {
                await this.checkSecureSession();
            } catch (error) {
                console.error('Token refresh failed:', error);
                this.handleAuthenticationError();
            }
        }, 50 * 60 * 1000); // 50 minutes
    }

    // Handle authentication errors
    handleAuthenticationError() {
        this.showSecurityError('Session expired. Please log in again.');
        setTimeout(() => {
            this.secureLogout();
        }, 2000);
    }

    // Set up security event listeners
    setupSecurityListeners() {
        // Detect tab focus to refresh session
        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden) {
                await this.checkSecureSession();
            }
        });

        // Warn about potential XSS if console is opened
        let devToolsOpen = false;
        setInterval(() => {
            if (window.outerHeight - window.innerHeight > 200 || 
                window.outerWidth - window.innerWidth > 200) {
                if (!devToolsOpen) {
                    devToolsOpen = true;
                    console.warn('🔒 Security Warning: Developer tools detected. Do not paste any code from untrusted sources.');
                }
            } else {
                devToolsOpen = false;
            }
        }, 1000);

        // Prevent right-click in production
        if (window.location.hostname !== 'localhost') {
            document.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            });

            // Prevent F12 and other dev shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || 
                    (e.ctrlKey && e.shiftKey && e.key === 'I') ||
                    (e.ctrlKey && e.shiftKey && e.key === 'C') ||
                    (e.ctrlKey && e.key === 'U')) {
                    e.preventDefault();
                    return false;
                }
            });
        }
    }

    // XSS-safe HTML rendering
    sanitizeHTML(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }

    // Secure user data rendering
    renderUserData(user) {
        const safeUser = {
            name: this.sanitizeHTML(user.name || ''),
            email: this.sanitizeHTML(user.email || ''),
            avatar: user.picture ? this.sanitizeHTML(user.picture) : this.generateAvatar(user.name || user.email)
        };

        // Update DOM safely
        const nameEl = document.getElementById('userName');
        if (nameEl) nameEl.textContent = safeUser.name;

        const emailEl = document.getElementById('userEmail');
        if (emailEl) emailEl.textContent = safeUser.email;

        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl) avatarEl.src = safeUser.avatar;
    }

    // Generate safe avatar URL
    generateAvatar(name) {
        const cleanName = encodeURIComponent(name.substring(0, 50)); // Limit length
        return `https://ui-avatars.com/api/?name=${cleanName}&background=1e40af&color=fff&size=40&rounded=true`;
    }

    // Show security errors
    showSecurityError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-md';
        errorDiv.innerHTML = `
            <div class="flex items-center">
                <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
                <span>${this.sanitizeHTML(message)}</span>
            </div>
        `;
        
        document.body.appendChild(errorDiv);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    // Content Security Policy reporting
    setupCSPReporting() {
        window.addEventListener('securitypolicyviolation', (e) => {
            console.error('CSP Violation:', e.violatedDirective, e.blockedURI);
            
            // Report to server
            fetch('/api/security/csp-violation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    violatedDirective: e.violatedDirective,
                    blockedURI: e.blockedURI,
                    documentURI: e.documentURI,
                    lineNumber: e.lineNumber,
                    sourceFile: e.sourceFile,
                    timestamp: new Date().toISOString()
                })
            }).catch(error => {
                console.error('Failed to report CSP violation:', error);
            });
        });
    }
}

// Initialize secure auth handler
let secureAuth;
document.addEventListener('DOMContentLoaded', () => {
    secureAuth = new SecureAuthHandler();
});

// Export for use in other modules
window.SecureAuth = SecureAuthHandler;