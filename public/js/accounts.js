// Accounts Management Page
class AccountsManager {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.accounts = [];
        this.filteredAccounts = [];
        this.currentEditId = null;
        this.currentDeleteId = null;
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
        this.loadAccounts();
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

        // Search and filters
        document.getElementById('searchAccounts').addEventListener('input', (e) => {
            this.filterAccounts();
        });

        document.getElementById('filterByTag').addEventListener('change', (e) => {
            this.filterAccounts();
        });

        document.getElementById('filterByPlatform').addEventListener('change', (e) => {
            this.filterAccounts();
        });

        document.getElementById('filterByStatus').addEventListener('change', (e) => {
            this.filterAccounts();
        });

        // Edit modal
        document.getElementById('closeEditModal').addEventListener('click', () => {
            this.closeEditModal();
        });

        document.getElementById('cancelEdit').addEventListener('click', () => {
            this.closeEditModal();
        });

        document.getElementById('editAccountForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleEditSubmit(e);
        });

        // Delete modal
        document.getElementById('cancelDelete').addEventListener('click', () => {
            this.closeDeleteModal();
        });

        document.getElementById('confirmDelete').addEventListener('click', () => {
            this.handleDelete();
        });
    }

    async loadAccounts() {
        try {
            const response = await fetch('/api/accounts', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.accounts = data.accounts || [];
                this.updateTagFilter();
                this.filterAccounts();
            } else {
                this.showError('Failed to load accounts');
            }
        } catch (error) {
            this.showError('Network error loading accounts');
        } finally {
            document.getElementById('loadingState').style.display = 'none';
        }
    }

    updateTagFilter() {
        const tagFilter = document.getElementById('filterByTag');
        const allTags = new Set();
        
        this.accounts.forEach(account => {
            if (account.tags) {
                account.tags.forEach(tag => allTags.add(tag));
            }
        });

        // Clear existing options except "All Tags"
        tagFilter.innerHTML = '<option value="">All Tags</option>';
        
        // Add tag options
        Array.from(allTags).sort().forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            tagFilter.appendChild(option);
        });
    }

    filterAccounts() {
        const search = document.getElementById('searchAccounts').value.toLowerCase();
        const tagFilter = document.getElementById('filterByTag').value;
        const platformFilter = document.getElementById('filterByPlatform').value;
        const statusFilter = document.getElementById('filterByStatus').value;

        this.filteredAccounts = this.accounts.filter(account => {
            // Search filter
            const matchesSearch = !search || 
                account.accountName?.toLowerCase().includes(search) ||
                account.accountNumber?.toLowerCase().includes(search) ||
                account.serverName?.toLowerCase().includes(search) ||
                account.notes?.toLowerCase().includes(search);

            // Tag filter
            const matchesTag = !tagFilter || 
                (account.tags && account.tags.includes(tagFilter));

            // Platform filter
            const matchesPlatform = !platformFilter || 
                account.accountType === platformFilter;

            // Status filter (mock status based on connection method)
            const accountStatus = account.connectionMethod === 'metaapi' ? 'connected' : 'manual';
            const matchesStatus = !statusFilter || accountStatus === statusFilter;

            return matchesSearch && matchesTag && matchesPlatform && matchesStatus;
        });

        this.renderAccounts();
    }

    renderAccounts() {
        const accountsList = document.getElementById('accountsList');
        const accountCount = document.getElementById('accountCount');
        
        accountCount.textContent = this.filteredAccounts.length;

        if (this.filteredAccounts.length === 0) {
            accountsList.innerHTML = `
                <div class="p-8 text-center">
                    <i class="fas fa-search text-6xl text-gray-300 mb-4"></i>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">No accounts found</h3>
                    <p class="text-gray-500 mb-4">Try adjusting your search or filters</p>
                    <a href="/add-account" class="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-secondary transition duration-200">
                        <i class="fas fa-plus mr-2"></i>Add Your First Account
                    </a>
                </div>
            `;
            return;
        }

        accountsList.innerHTML = this.filteredAccounts.map(account => `
            <div class="p-6">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <div class="flex items-center space-x-4">
                            <div class="flex-shrink-0">
                                <div class="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                                    <i class="fas fa-chart-line text-white text-xl"></i>
                                </div>
                            </div>
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold text-gray-900">${account.accountName || 'Unnamed Account'}</h3>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm text-gray-600">
                                    <div>
                                        <span class="font-medium">Login:</span> ${account.login || 'N/A'}
                                    </div>
                                    <div>
                                        <span class="font-medium">Platform:</span> ${account.accountType?.toUpperCase() || 'N/A'}
                                    </div>
                                    <div>
                                        <span class="font-medium">Broker:</span> ${account.brokerName || account.serverName || 'N/A'}
                                    </div>
                                    <div>
                                        <span class="font-medium">Status:</span> 
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            account.connectionMethod === 'metaapi' 
                                                ? 'bg-green-100 text-green-800' 
                                                : 'bg-yellow-100 text-yellow-800'
                                        }">
                                            <i class="fas fa-${account.connectionMethod === 'metaapi' ? 'link' : 'edit'} mr-1"></i>
                                            ${account.connectionMethod === 'metaapi' ? 'Connected' : 'Manual'}
                                        </span>
                                    </div>
                                </div>
                                ${account.brokerName && account.accountRegion ? `
                                    <div class="mt-2 text-sm text-gray-500">
                                        <span class="font-medium">Server:</span> ${account.serverName} 
                                        ${account.accountRegion ? `(${account.accountRegion.charAt(0).toUpperCase() + account.accountRegion.slice(1).replace('-', ' ')})` : ''}
                                    </div>
                                ` : ''}
                                ${account.connectionMethod === 'manual' && (account.currentBalance || account.equity) ? `
                                    <div class="mt-2 text-sm text-gray-600">
                                        ${account.currentBalance ? `<span class="mr-4"><span class="font-medium">Balance:</span> $${account.currentBalance.toLocaleString()}</span>` : ''}
                                        ${account.equity ? `<span><span class="font-medium">Equity:</span> $${account.equity.toLocaleString()}</span>` : ''}
                                    </div>
                                ` : ''}
                                ${account.tags && account.tags.length > 0 ? `
                                    <div class="mt-3">
                                        <div class="flex flex-wrap gap-2">
                                            ${account.tags.map(tag => `
                                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    ${tag}
                                                </span>
                                            `).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                                ${account.notes ? `
                                    <div class="mt-3">
                                        <p class="text-sm text-gray-600 italic">"${account.notes}"</p>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 ml-4">
                        <button onclick="accountsManager.editAccount('${account.id}')" 
                                class="text-primary hover:text-secondary p-2 rounded-lg hover:bg-gray-100 transition duration-150">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="accountsManager.deleteAccount('${account.id}', '${account.accountName}')" 
                                class="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-gray-100 transition duration-150">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Make the manager globally accessible for onclick handlers
        window.accountsManager = this;
    }

    editAccount(accountId) {
        const account = this.accounts.find(acc => acc.id === accountId);
        if (!account) return;

        this.currentEditId = accountId;
        
        // Populate form
        document.getElementById('editAccountId').value = accountId;
        document.getElementById('editAccountName').value = account.accountName || '';
        document.getElementById('editAccountType').value = account.accountType || '';
        document.getElementById('editLogin').value = account.login || '';
        document.getElementById('editServerName').value = account.serverName || '';
        document.getElementById('editBrokerName').value = account.brokerName || '';
        document.getElementById('editAccountRegion').value = account.accountRegion || '';
        document.getElementById('editAccountTags').value = account.tags ? account.tags.join(', ') : '';
        document.getElementById('editAccountNotes').value = account.notes || '';

        // Show modal
        document.getElementById('editAccountModal').classList.remove('hidden');
    }

    closeEditModal() {
        document.getElementById('editAccountModal').classList.add('hidden');
        this.currentEditId = null;
    }

    async handleEditSubmit(e) {
        const formData = new FormData(e.target);
        const accountData = Object.fromEntries(formData.entries());

        // Process tags
        if (accountData.accountTags) {
            accountData.tags = accountData.accountTags.split(',').map(tag => tag.trim()).filter(tag => tag);
            delete accountData.accountTags;
        }

        try {
            const response = await fetch(`/api/accounts/${this.currentEditId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(accountData)
            });

            if (response.ok) {
                this.showSuccess('Account updated successfully!');
                this.closeEditModal();
                this.loadAccounts();
            } else {
                const error = await response.json();
                this.showError(error.message || 'Failed to update account');
            }
        } catch (error) {
            this.showError('Network error. Please try again.');
        }
    }

    deleteAccount(accountId, accountName) {
        this.currentDeleteId = accountId;
        document.getElementById('deleteAccountName').textContent = accountName;
        document.getElementById('deleteAccountModal').classList.remove('hidden');
    }

    closeDeleteModal() {
        document.getElementById('deleteAccountModal').classList.add('hidden');
        this.currentDeleteId = null;
    }

    async handleDelete() {
        try {
            const response = await fetch(`/api/accounts/${this.currentDeleteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                this.showSuccess('Account deleted successfully!');
                this.closeDeleteModal();
                this.loadAccounts();
            } else {
                const error = await response.json();
                this.showError(error.message || 'Failed to delete account');
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
    new AccountsManager();
});