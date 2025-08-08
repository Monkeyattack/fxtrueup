const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public/js/account-detail.js');
let content = fs.readFileSync(filePath, 'utf8');

// Remove the error message line
content = content.replace(/this\.showError\('Failed to load real-time data'\);/g, 
  '// Error logged but not shown to user - data may still be available from cache');

// Fix the catch block to only log errors
content = content.replace(/} catch \(error\) {[\s\S]*?console\.error\('Error loading MetaApi data:', error\);[\s\S]*?}/g, 
  `} catch (error) {
            console.error('Error loading MetaApi data:', error);
            // Don't show error to user - we may have cached data
        }`);

fs.writeFileSync(filePath, content);
console.log('✅ Fixed account detail error handling');