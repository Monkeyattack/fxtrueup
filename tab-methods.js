    // Tab Management
    initializeTabSwitching() {
        const tabButtons = {
            'transactionsTabBtn': 'transactions',
            'positionsTabBtn': 'positions',
            'pnlTabBtn': 'pnl',
            'analyticsTabBtn': 'analytics'
        };

        Object.entries(tabButtons).forEach(([buttonId, tabName]) => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', () => this.switchTab(tabName));
            }
        });

        // Set initial tab
        this.switchTab('transactions');
    }

    switchTab(tabName) {
        // Hide all tab contents
        const tabContents = ['transactions', 'positions', 'pnl', 'analytics'];
        tabContents.forEach(tab => {
            const contentDiv = document.getElementById(`${tab}Content`);
            const button = document.getElementById(`${tab}TabBtn`);
            
            if (contentDiv) {
                contentDiv.classList.add('hidden');
            }
            if (button) {
                button.classList.remove('border-primary', 'text-primary');
                button.classList.add('border-transparent', 'text-gray-500');
            }
        });

        // Show selected tab
        const selectedContent = document.getElementById(`${tabName}Content`);
        const selectedButton = document.getElementById(`${tabName}TabBtn`);
        
        if (selectedContent) {
            selectedContent.classList.remove('hidden');
        }
        
        if (selectedButton) {
            selectedButton.classList.remove('border-transparent', 'text-gray-500');
            selectedButton.classList.add('border-primary', 'text-primary');
        }
    }

    // Export functions
    exportTransactions() {
        console.log('Exporting transactions...');
        // TODO: Implement CSV export
        this.showSuccess('Export feature coming soon!');
    }

    exportPnL() {
        console.log('Exporting P&L...');
        // TODO: Implement P&L export
        this.showSuccess('Export feature coming soon!');
    }