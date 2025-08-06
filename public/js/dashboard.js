// FX True Up Dashboard
class Dashboard {
    constructor() {
        this.token = null;
        this.user = null;
        this.accounts = [];
        this.performanceChart = null;
        this.init();
    }

    async init() {
        // Get token from URL or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token');
        
        if (tokenFromUrl) {
            // Store token and clean URL
            localStorage.setItem('authToken', tokenFromUrl);
            urlParams.delete('token');
            const newUrl = urlParams.toString() ? `/dashboard?${urlParams.toString()}` : '/dashboard';
            window.history.replaceState({}, document.title, newUrl);
            this.token = tokenFromUrl;
        } else {
            this.token = localStorage.getItem('authToken');
        }

        // Check authentication
        if (!this.token || !(await this.checkAuth())) {
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

        // Add Account button - redirect to add-account page
        const addAccountBtn = document.getElementById('addAccountBtn');
        if (addAccountBtn) {
            addAccountBtn.addEventListener('click', () => {
                window.location.href = '/add-account';
            });
        }

        // Connect First Account button in empty state - find it by class pattern
        document.addEventListener('click', (e) => {
            if (e.target.closest('.bg-accent')) {
                window.location.href = '/add-account';
            }
        });

        // Close modal button
        const closeAddAccount = document.getElementById('closeAddAccount');
        if (closeAddAccount) {
            closeAddAccount.addEventListener('click', () => {
                document.getElementById('addAccountModal').classList.add('hidden');
            });
        }
    }

    loadUserData() {
        if (!this.user) return;

        // Update user info in UI
        document.getElementById('userName').textContent = this.user.name || this.user.email.split('@')[0];
        document.getElementById('userEmail').textContent = this.user.email;
        document.getElementById('userAvatar').src = this.user.picture || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(this.user.name || this.user.email)}&background=1e40af&color=fff`;

        if (this.user.isAdmin) {
            document.getElementById('adminMenu').classList.remove('hidden');
        }
    }

    async loadDashboardData() {
        try {
            // Load accounts
            const response = await fetch('/api/accounts', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.accounts = data.accounts || [];
                
                // Update UI with real data
                this.updateStats();
                this.renderAccounts();
                this.updatePerformanceChart();
            } else {
                console.error('Failed to load accounts');
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    updateStats() {
        let totalBalance = 0;
        let totalTrades = 0;
        let activeAccounts = 0;
        let monthlyReturn = 0;

        this.accounts.forEach(account => {
            if (account.connectionMethod === 'metaapi' || account.currentBalance) {
                activeAccounts++;
                
                // For manual accounts with balance data
                if (account.currentBalance) {
                    totalBalance += account.currentBalance;
                }
                
                // For connected accounts, we'd fetch real-time data
                // TODO: Fetch real metrics from MetaApi
            }
        });

        // Update stat cards
        document.querySelector('.fa-wallet').parentElement.parentElement.querySelector('dd').textContent = 
            `$${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        document.querySelector('.fa-chart-line').parentElement.parentElement.querySelector('dd').textContent = 
            `${monthlyReturn.toFixed(2)}%`;
        
        document.querySelector('.fa-exchange-alt').parentElement.parentElement.querySelector('dd').textContent = 
            totalTrades.toString();
        
        document.querySelector('.fa-server').parentElement.parentElement.querySelector('dd').textContent = 
            activeAccounts.toString();
    }

    renderAccounts() {
        const accountsList = document.getElementById('accountsList');
        
        if (this.accounts.length === 0) {
            // Show empty state
            accountsList.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-link text-6xl text-gray-300 mb-4"></i>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">No accounts connected yet</h3>
                    <p class="text-gray-500 mb-4">Connect your MT4/MT5 accounts to start tracking performance</p>
                    <a href="/add-account" class="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition duration-200">
                        <i class="fas fa-plug mr-2"></i>Connect First Account
                    </a>
                </div>
            `;
        } else {
            // Show accounts list
            accountsList.innerHTML = `
                <div class="grid gap-4">
                    ${this.accounts.map(account => this.renderAccountCard(account)).join('')}
                </div>
            `;
        }
    }

    renderAccountCard(account) {
        const isConnected = account.connectionMethod === 'metaapi';
        const balance = account.currentBalance || 0;
        const equity = account.equity || balance;
        const profit = equity - (account.initialBalance || balance);
        const profitPercent = account.initialBalance ? ((profit / account.initialBalance) * 100) : 0;

        return `
            <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition duration-200">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <div class="flex items-center justify-between mb-2">
                            <h4 class="text-lg font-semibold text-gray-900">
                                <a href="/account-detail?id=${account.id}" class="hover:text-primary transition-colors">
                                    ${account.accountName || 'Unnamed Account'}
                                </a>
                            </h4>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                isConnected 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-yellow-100 text-yellow-800'
                            }">
                                <i class="fas fa-${isConnected ? 'link' : 'edit'} mr-1"></i>
                                ${isConnected ? 'Connected' : 'Manual'}
                            </span>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-500">Login:</span>
                                <span class="ml-1 font-medium">${account.login}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Broker:</span>
                                <span class="ml-1 font-medium">${account.brokerName || account.serverName || 'N/A'}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Platform:</span>
                                <span class="ml-1 font-medium">${account.accountType?.toUpperCase()}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Balance:</span>
                                <span class="ml-1 font-medium">$${balance.toLocaleString()}</span>
                            </div>
                        </div>

                        ${account.tags && account.tags.length > 0 ? `
                            <div class="mt-3 flex flex-wrap gap-1">
                                ${account.tags.map(tag => `
                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        ${tag}
                                    </span>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="ml-4 text-right">
                        <div class="text-2xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}">
                            ${profit >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%
                        </div>
                        <div class="text-sm text-gray-500">
                            ${profit >= 0 ? '+' : ''}$${profit.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    updatePerformanceChart() {
        const canvas = document.getElementById('performanceChart');
        const noDataMessage = document.getElementById('noDataMessage');

        if (this.accounts.length === 0) {
            canvas.classList.add('hidden');
            noDataMessage.classList.remove('hidden');
            return;
        }

        canvas.classList.remove('hidden');
        noDataMessage.classList.add('hidden');

        // Generate mock performance data for now
        // TODO: Fetch real performance data from MetaApi
        const labels = [];
        const data = [];
        const now = new Date();
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            
            // Mock cumulative returns
            const previousValue = data.length > 0 ? data[data.length - 1] : 0;
            const dailyChange = -2 + Math.random() * 4; // -2% to +2% daily
            data.push(previousValue + dailyChange);
        }

        // Destroy existing chart if it exists
        if (this.performanceChart) {
            this.performanceChart.destroy();
        }

        // Create new chart
        const ctx = canvas.getContext('2d');
        this.performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Portfolio Performance (%)',
                    data: data,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `Return: ${context.parsed.y.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        display: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
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

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});