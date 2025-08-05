// FX True Up Dashboard
class Dashboard {
    constructor() {
        this.user = null;
        this.isAdmin = false;
        this.init();
    }

    async init() {
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
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include' // Important for cookies
            });
            if (response.ok) {
                this.user = await response.json();
                console.log('Authenticated user:', this.user);
                // Check if user is admin
                this.isAdmin = this.user.email === 'meredith@monkeyattack.com';
                return true;
            }
            console.log('Auth check failed, status:', response.status);
            return false;
        } catch (error) {
            console.error('Auth check failed:', error);
            return false;
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
        // For now, use mock data since we don't have real auth yet
        const mockUser = {
            name: 'Trader',
            email: 'user@example.com',
            avatar: 'https://ui-avatars.com/api/?name=User&background=1e40af&color=fff'
        };

        // If we have a real user from auth, use that
        if (this.user) {
            mockUser.name = this.user.name || this.user.email.split('@')[0];
            mockUser.email = this.user.email;
            mockUser.avatar = this.user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(mockUser.name)}&background=1e40af&color=fff`;
        }

        // Update UI
        document.getElementById('userName').textContent = mockUser.name;
        document.getElementById('userEmail').textContent = mockUser.email;
        document.getElementById('userAvatar').src = mockUser.avatar;

        // Show admin menu if admin
        if (this.isAdmin) {
            document.getElementById('adminMenu').classList.remove('hidden');
        }
    }

    async loadDashboardData() {
        try {
            // Fetch dashboard data with credentials
            const [accounts, analytics] = await Promise.all([
                fetch('/api/accounts', { credentials: 'include' }).then(r => r.json()),
                fetch('/api/analytics', { credentials: 'include' }).then(r => r.json())
            ]);

            // Update stats (using mock data for now)
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
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        }
        window.location.href = '/';
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});