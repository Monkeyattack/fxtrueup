// Add Account Page
class AddAccount {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.init();
    }

    async init() {
        // Check authentication
        if (!this.token || !(await this.checkAuth())) {
            window.location.href = '/?auth=required';
            return;
        }

        this.initializeEventListeners();
        this.loadUserData();
    }

    async checkAuth() {
        try {
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (response.ok) {
                this.user = await response.json();
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    loadUserData() {
        if (!this.user) return;

        document.getElementById('userEmail').textContent = this.user.email;
        document.getElementById('userAvatar').src = this.user.picture || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(this.user.name || this.user.email)}&background=1e40af&color=fff`;

        if (this.user.isAdmin) {
            document.getElementById('adminMenu').classList.remove('hidden');
        }
    }

    initializeEventListeners() {
        // User menu
        const userMenuBtn = document.getElementById('userMenuBtn');
        const userDropdown = document.getElementById('userDropdown');
        
        if (userMenuBtn) {
            userMenuBtn.addEventListener('click', () => {
                userDropdown.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!userMenuBtn.contains(e.target)) {
                    userDropdown.classList.add('hidden');
                }
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }

        // Form submission
        const form = document.getElementById('addAccountForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSubmit(e);
            });
        }

        // Connection method selection
        window.selectConnectionMethod = (method) => {
            const metaApiFields = document.getElementById('metaApiFields');
            const manualFields = document.getElementById('manualFields');
            const radios = document.querySelectorAll('input[name="connectionMethod"]');
            
            radios.forEach(radio => {
                if (radio.value === method) {
                    radio.checked = true;
                }
            });

            if (method === 'metaapi') {
                metaApiFields.classList.remove('hidden');
                manualFields.classList.add('hidden');
            } else if (method === 'manual') {
                metaApiFields.classList.add('hidden');
                manualFields.classList.remove('hidden');
            }
        };
    }

    async handleSubmit(e) {
        const formData = new FormData(e.target);
        const accountData = Object.fromEntries(formData.entries());

        // Process category tags (checkboxes)
        const categoryTags = formData.getAll('categoryTags');
        
        // Process custom tags
        const customTags = accountData.customTags ? 
            accountData.customTags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
        
        // Combine all tags
        accountData.tags = [...categoryTags, ...customTags];
        delete accountData.customTags;

        // Validate required fields
        const requiredFields = ['accountName', 'accountType', 'login', 'serverName'];
        for (const field of requiredFields) {
            if (!accountData[field]) {
                const fieldName = field === 'login' ? 'account number' : field.replace(/([A-Z])/g, ' $1').toLowerCase();
                this.showError(`Please fill in the ${fieldName}`);
                return;
            }
        }

        // If MetaApi selected, require token and password
        if (accountData.connectionMethod === 'metaapi') {
            if (!accountData.metaApiToken) {
                this.showError('MetaApi token is required for MetaApi connections');
                return;
            }
            if (!accountData.password) {
                this.showError('Account password is required for MetaApi connections');
                return;
            }
        }

        try {
            // Show loading
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding Account...';
            submitBtn.disabled = true;

            const response = await fetch('/api/accounts', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(accountData)
            });

            if (response.ok) {
                this.showSuccess('Account added successfully!');
                setTimeout(() => {
                    window.location.href = '/accounts';
                }, 1500);
            } else {
                const error = await response.json();
                this.showError(error.message || 'Failed to add account');
            }
        } catch (error) {
            this.showError('Network error. Please try again.');
        }
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        // Remove existing messages
        const existingMessage = document.querySelector('.notification-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `notification-message fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
            type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`;
        messageDiv.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'} mr-2"></i>${message}`;
        document.body.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }

    async logout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
        
        localStorage.removeItem('authToken');
        window.location.href = '/';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AddAccount();
});