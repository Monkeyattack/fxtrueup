const fs = require('fs');
const path = require('path');

// Fix account-detail.html to ensure error is hidden by default
const htmlPath = path.join(__dirname, 'public/account-detail.html');
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Update the error message to be more specific
htmlContent = htmlContent.replace(
    '<p class="text-red-700" id="errorMessage"></p>',
    '<p class="text-red-700" id="errorMessage">Failed to load real-time data</p>'
);

// Ensure errorState has hidden class
htmlContent = htmlContent.replace(
    '<div id="errorState" class="bg-red-50',
    '<div id="errorState" class="hidden bg-red-50'
);

fs.writeFileSync(htmlPath, htmlContent);
console.log('✅ Fixed error display in HTML');

// Fix the JS to not show error when we have cached data
const jsPath = path.join(__dirname, 'public/js/account-detail.js');
let jsContent = fs.readFileSync(jsPath, 'utf8');

// Add a check before showing error
jsContent = jsContent.replace(
    'showError(message) {',
    `showError(message) {
        // Don't show error if we have account data
        if (this.account && this.account.accountName) {
            console.warn('Suppressed error:', message);
            return;
        }`
);

// Also hide the error when data loads successfully
if (!jsContent.includes('hideError()')) {
    jsContent = jsContent.replace(
        'showError(message) {',
        `hideError() {
        const errorState = document.getElementById('errorState');
        if (errorState) {
            errorState.classList.add('hidden');
        }
    }
    
    showError(message) {`
    );
}

// Call hideError when account data loads
jsContent = jsContent.replace(
    'this.account = accountData;',
    `this.account = accountData;
        this.hideError();`
);

fs.writeFileSync(jsPath, jsContent);
console.log('✅ Fixed error handling in JS');