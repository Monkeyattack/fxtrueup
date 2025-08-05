// FX True Up Frontend Application
class FXTrueUpApp {
    constructor() {
        this.initializeEventListeners();
        this.checkAuthStatus();
    }

    initializeEventListeners() {
        // Login button
        const loginBtn = document.getElementById('loginBtn');
        const getStartedBtn = document.getElementById('getStartedBtn');
        const googleSignInBtn = document.getElementById('googleSignInBtn');
        const closeModal = document.getElementById('closeModal');
        const loginModal = document.getElementById('loginModal');

        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.showLoginModal());
        }

        if (getStartedBtn) {
            getStartedBtn.addEventListener('click', () => this.showLoginModal());
        }

        if (googleSignInBtn) {
            googleSignInBtn.addEventListener('click', () => this.initiateGoogleLogin());
        }

        if (closeModal) {
            closeModal.addEventListener('click', () => this.hideLoginModal());
        }

        // Close modal on outside click
        if (loginModal) {
            loginModal.addEventListener('click', (e) => {
                if (e.target === loginModal) {
                    this.hideLoginModal();
                }
            });
        }

        // Smooth scroll for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    showLoginModal() {
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    hideLoginModal() {
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = 'auto';
        }
    }

    async initiateGoogleLogin() {
        // Redirect to Google OAuth
        window.location.href = "/api/auth/google/login";
    }

    async checkAuthStatus() {
        // Check if user just logged in
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('auth') === 'success') {
            // Remove auth parameter from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show success message or redirect to dashboard
            this.showSuccessMessage('Successfully logged in!');
        }

        // Check if user is authenticated
        try {
            const response = await fetch('/api/auth/me');
            if (response.ok) {
                const user = await response.json();
                this.updateUIForAuthenticatedUser(user);
            }
        } catch (error) {
            console.log('User not authenticated');
        }
    }

    updateUIForAuthenticatedUser(user) {
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn && user) {
            loginBtn.innerHTML = `<i class="fas fa-user mr-2"></i>Dashboard`;
            loginBtn.removeEventListener('click', () => this.showLoginModal());
            loginBtn.addEventListener('click', () => {
                window.location.href = '/dashboard';
            });
        }
    }

    showSuccessMessage(message) {
        // Create and show a temporary success message
        const successDiv = document.createElement('div');
        successDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        successDiv.innerHTML = `<i class="fas fa-check-circle mr-2"></i>${message}`;
        document.body.appendChild(successDiv);

        // Remove after 3 seconds
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FXTrueUpApp();
});