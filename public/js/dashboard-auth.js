// FX True Up Dashboard with Token Auth
class Dashboard {
    constructor() {
        this.user = null;
        this.isAdmin = false;
        this.token = null;
        this.init();
    }

    async init() {
        // Get token from URL or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token');
        
        if (tokenFromUrl) {
            // Store token and clean URL
            localStorage.setItem('authToken', tokenFromUrl);
            window.history.replaceState({}, document.title, '/dashboard');
            this.token = tokenFromUrl;
        } else {
            this.token = localStorage.getItem('authToken');
        }

        // Check authentication
        const authCheck = await this.checkAuth();
        if (!authCheck) {
            window.location.href = '/?auth=required';
            return;
        }

        this.initializeEventListeners();
        this.loadUserData();
        this.loadDashboardData();
    }

    async checkAuth() {
        if (!this.token) {
            return false;
        }

        try {
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                this.user = await response.json();
                console.log('Authenticated user:', this.user);
                this.isAdmin = this.user.isAdmin || this.user.email === 'meredith@monkeyattack.com';
                return true;
            }
            
            // Token invalid, clear it
            localStorage.removeItem('authToken');
            return false;
        } catch (error) {
            console.error('Auth check failed:', error);
            return false;
        }
    }

    async apiCall(url, options = {}) {
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${this.token}`
            }
        });
    }

    initializeEventListeners() {
        // User menu
        const userMenuBtn = document.getElementById('userMenuBtn');
        const userDropdown = document.getElementById('userDropdown');
        
        if (userMenuBtn) {
            userMenuBtn.addEventListener('click', () => {
                userDropdown.classList.toggle('hidden');
            });

            // Close dropdown on outside click
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

        // Add account button
        const addAccountBtn = document.getElementById('addAccountBtn');
        const addAccountModal = document.getElementById('addAccountModal');
        const closeAddAccount = document.getElementById('closeAddAccount');

        if (addAccountBtn) {
            addAccountBtn.addEventListener('click', () => {
                addAccountModal.classList.remove('hidden');
            });
        }

        if (closeAddAccount) {
            closeAddAccount.addEventListener('click', () => {
                addAccountModal.classList.add('hidden');
            });
        }

        // Connect first account button
        const connectFirstBtn = document.querySelector('button:has(.fa-plug)');
        if (connectFirstBtn) {
            connectFirstBtn.addEventListener('click', () => {
                addAccountModal.classList.remove('hidden');
            });
        }

        // Upgrade button
        const upgradeBtn = document.querySelector('button:contains("Upgrade")');
        if (upgradeBtn) {
            upgradeBtn.addEventListener('click', () => {
                window.location.href = '/#pricing';
            });
        }
    }

    loadUserData() {
        if (!this.user) return;

        // Update UI
        document.getElementById('userName').textContent = this.user.name || this.user.email.split('@')[0];
        document.getElementById('userEmail').textContent = this.user.email;
        document.getElementById('userAvatar').src = this.user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(this.user.name || this.user.email)}&background=1e40af&color=fff`;

        // Show admin menu if admin
        if (this.isAdmin) {
            document.getElementById('adminMenu').classList.remove('hidden');
        }
    }

    async loadDashboardData() {
        try {
            // Fetch dashboard data
            const [accountsRes, analyticsRes] = await Promise.all([
                this.apiCall('/api/accounts'),
                this.apiCall('/api/analytics')
            ]);

            const accounts = await accountsRes.json();
            const analytics = await analyticsRes.json();

            // Update stats
            this.updateStats(analytics.data || {
                totalBalance: 0,
                monthlyReturn: 0,
                trades: 0,
                activeAccounts: accounts.total || 0
            });

            // Update accounts list
            if (accounts.accounts && accounts.accounts.length > 0) {
                this.renderAccounts(accounts.accounts);
            }

        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        }
    }

    updateStats(data) {
        // Update stat cards
        const stats = {
            'Total Balance': `$${(data.totalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Monthly Return': `${(data.monthlyReturn || 0).toFixed(2)}%`,
            'Total Trades': (data.trades || 0).toLocaleString(),
            'Active Accounts': data.activeAccounts || 0
        };

        // Update each stat card
        document.querySelectorAll('.grid .bg-white').forEach((card) => {
            const label = card.querySelector('dt')?.textContent;
            const value = card.querySelector('dd');
            if (label && value && stats[label]) {
                value.textContent = stats[label];
            }
        });
    }

    renderAccounts(accounts) {
        const accountsList = document.getElementById('accountsList');
        
        // Clear the "no accounts" message
        accountsList.innerHTML = '';

        // Render each account
        accounts.forEach(account => {
            const accountCard = document.createElement('div');
            accountCard.className = 'border rounded-lg p-4 hover:shadow-md transition duration-150';
            accountCard.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="font-semibold text-gray-900">${account.name || 'Trading Account'}</h4>
                        <p class="text-sm text-gray-500">Account: ${account.login || 'N/A'}</p>
                        <p class="text-sm text-gray-500">Server: ${account.server || 'N/A'}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-lg font-semibold text-gray-900">$${(account.balance || 0).toLocaleString()}</p>
                        <p class="text-sm ${account.profit >= 0 ? 'text-green-600' : 'text-red-600'}">
                            ${account.profit >= 0 ? '+' : ''}${(account.profit || 0).toFixed(2)}%
                        </p>
                    </div>
                </div>
            `;
            accountsList.appendChild(accountCard);
        });
    }

    async logout() {
        try {
            await this.apiCall('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        }
        
        localStorage.removeItem('authToken');
        window.location.href = '/';
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});