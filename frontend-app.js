// FX True Up Frontend Application
class FXTrueUpApp {
    constructor() {
        this.apiBaseUrl = "/api";
        this.isAuthenticated = false;
        this.user = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
        this.animateOnScroll();
    }

    setupEventListeners() {
        // Modal controls
        document.getElementById("loginBtn")?.addEventListener("click", () => this.showLoginModal());
        document.getElementById("startTrialBtn")?.addEventListener("click", () => this.showLoginModal());
        document.getElementById("closeModal")?.addEventListener("click", () => this.hideLoginModal());
        document.getElementById("googleSignInBtn")?.addEventListener("click", () => this.initiateGoogleLogin());
        
        // Close modal on background click
        document.getElementById("loginModal")?.addEventListener("click", (e) => {
            if (e.target.id === "loginModal") {
                this.hideLoginModal();
            }
        });

        // Smooth scrolling for navigation links
        document.querySelectorAll("a[href^='#']").forEach(anchor => {
            anchor.addEventListener("click", function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute("href"));
                if (target) {
                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            });
        });

        // Escape key to close modal
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.hideLoginModal();
            }
        });
    }

    showLoginModal() {
        const modal = document.getElementById("loginModal");
        if (modal) {
            modal.classList.remove("hidden");
            modal.classList.add("flex");
            document.body.style.overflow = "hidden";
            
            // Add entrance animation
            const modalContent = modal.querySelector("div > div");
            modalContent.classList.add("modal-enter");
            setTimeout(() => {
                modalContent.classList.add("modal-enter-active");
            }, 10);
        }
    }

    hideLoginModal() {
        const modal = document.getElementById("loginModal");
        if (modal) {
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            document.body.style.overflow = "auto";
        }
    }

    async initiateGoogleLogin() {
        try {
            const button = document.getElementById("googleSignInBtn");
            const originalText = button.innerHTML;
            
            // Show loading state
            button.innerHTML = '<div class="spinner mr-3"></div>Connecting...';
            button.disabled = true;

            // Redirect to Google OAuth endpoint
            window.location.href = "/api/auth/google/login";
        } catch (error) {
            console.error("Google login error:", error);
            this.showError("Failed to connect with Google. Please try again.");
            
            // Reset button
            const button = document.getElementById("googleSignInBtn");
            button.innerHTML = '<i class="fab fa-google mr-3"></i>Continue with Google';
            button.disabled = false;
        }
    }

    async checkAuthStatus() {
        try {
            const response = await fetch("/api/auth/me", {
                credentials: "include"
            });

            if (response.ok) {
                const data = await response.json();
                this.handleAuthSuccess(data.user);
            }
        } catch (error) {
            console.log("User not authenticated");
        }
    }

    handleAuthSuccess(user) {
        this.isAuthenticated = true;
        this.user = user;
        this.updateUIForAuthenticatedUser();
        this.hideLoginModal();
    }

    updateUIForAuthenticatedUser() {
        const loginBtn = document.getElementById("loginBtn");
        if (loginBtn && this.user) {
            loginBtn.innerHTML = `
                <div class="flex items-center">
                    <img src="${this.user.picture || "/images/default-avatar.png"}" 
                         alt="Profile" class="w-6 h-6 rounded-full mr-2">
                    <span>${this.user.name || "Dashboard"}</span>
                </div>
            `;
            loginBtn.onclick = () => this.goToDashboard();
        }
    }

    goToDashboard() {
        window.location.href = "/dashboard";
    }

    showError(message) {
        // Simple error notification
        const errorDiv = document.createElement("div");
        errorDiv.className = "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
        errorDiv.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-exclamation-circle mr-2"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(errorDiv);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    showSuccess(message) {
        // Simple success notification
        const successDiv = document.createElement("div");
        successDiv.className = "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
        successDiv.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-check-circle mr-2"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(successDiv);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 5000);
    }

    animateOnScroll() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: "0px 0px -50px 0px"
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("fade-in-up");
                }
            });
        }, observerOptions);

        // Observe feature cards and pricing cards
        document.querySelectorAll(".feature-card, .pricing-card").forEach(el => {
            observer.observe(el);
        });
    }
}

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    window.fxTrueUpApp = new FXTrueUpApp();
});

// Handle OAuth callback if present
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("auth") === "success") {
    window.fxTrueUpApp?.showSuccess("Successfully signed in!");
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
}