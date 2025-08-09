const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'public/js/account-detail.js');
let content = fs.readFileSync(jsPath, 'utf8');

// Add hideLoading function if it doesn't exist
if (!content.includes('hideLoading()')) {
    // Add hideLoading function after hideError
    content = content.replace(
        'hideError() {',
        `hideLoading() {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.classList.add('hidden');
        }
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.classList.remove('hidden');
        }
    }
    
    hideError() {`
    );
}

// Add call to hideLoading when account loads successfully
content = content.replace(
    'this.account = accountData;\n        this.hideError();',
    `this.account = accountData;
        this.hideError();
        this.hideLoading();`
);

// Also hide loading when all initial data is loaded (after loadMetrics)
content = content.replace(
    'await this.loadAccountData();\n        await this.loadMetrics();',
    `await this.loadAccountData();
        await this.loadMetrics();
        this.hideLoading();`
);

fs.writeFileSync(jsPath, content);
console.log('✅ Fixed loading state handling');