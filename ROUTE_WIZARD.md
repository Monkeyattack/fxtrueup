# 📋 Copy Trading Route Management Wizard

Interactive CLI tool for managing copy trading routes with ease.

## 🚀 Quick Start

```bash
cd /home/claude-dev/repos/fxtrueup
npm run routes
```

Or run directly:
```bash
node src/cli/route-wizard.js
```

## ✨ Features

### 1. Create New Route
- Interactive selection of source and destination accounts
- Choose from predefined rulesets
- Configure notifications and settings
- Automatic ID generation

### 2. List Routes
- View all configured routes
- See enabled/disabled status
- Display source → destination mappings
- Show active rulesets

### 3. Enable/Disable Routes
- Toggle routes on/off without deleting
- Instantly enable or disable copy trading
- Preserve route configuration

### 4. Delete Routes
- Safely remove unwanted routes
- Confirmation prompt to prevent accidents
- Permanent deletion with warning

### 5. View Accounts
- List all source accounts (📤)
- List all destination accounts (📥)
- Show balances and platforms
- Display account IDs

### 6. View Rulesets
- Browse available trading rules
- See multipliers and lot sizes
- View risk limits and filters
- Read descriptions

## 📖 Usage Examples

### Creating a New Route

1. Run `npm run routes`
2. Select option `1` (Create new route)
3. Choose source account (e.g., "GoldBuyOnly")
4. Choose destination account (e.g., "LiveCopyFromGold")
5. Select ruleset (e.g., "aggressive_dynamic")
6. Enter route details:
   - Name: `Gold → Live Aggressive`
   - Description: `Copy gold trades with 8x scaling`
   - Copy existing: `y`
   - Notifications: `y`
   - Start enabled: `y`

7. Route is created and saved to config!

### Enabling/Disabling a Route

1. Run `npm run routes`
2. Select option `3` (Enable/Disable route)
3. Choose the route number
4. Status is toggled automatically
5. Restart router: `pm2 restart fxtrueup-router`

### Viewing Configuration

```bash
# View all accounts
npm run routes
# Select option 5

# View all rulesets
npm run routes
# Select option 6
```

## 🔧 After Making Changes

**Always restart the router service to apply changes:**

```bash
pm2 restart fxtrueup-router
```

Or use the full restart sequence:
```bash
pm2 restart connection-pool
pm2 restart fxtrueup-router
pm2 logs fxtrueup-router --lines 50
```

## 📁 Configuration File

Routes are stored in:
```
/home/claude-dev/repos/fxtrueup/src/config/routing-config.json
```

The wizard automatically:
- ✅ Loads the config on startup
- ✅ Validates changes before saving
- ✅ Creates backups (JSON pretty-printed)
- ✅ Handles errors gracefully

## 🎨 Color Guide

- **Green** ✅ - Success, enabled routes
- **Yellow** ⚠️ - Warnings, disabled routes
- **Red** ❌ - Errors, critical actions
- **Cyan** 💠 - Information, selections
- **Blue** 📘 - Destination accounts
- **Magenta** 🔮 - Source accounts

## 🛡️ Safety Features

- **Confirmation prompts** for deletions
- **Route validation** before saving
- **Automatic ID generation** to prevent conflicts
- **Config backup** via JSON pretty-printing
- **Error handling** with helpful messages

## 📝 Tips

1. **Use descriptive names** - Makes routes easy to identify
2. **Test with disabled routes first** - Enable after verifying config
3. **Copy existing positions carefully** - Can duplicate trades on restart
4. **Monitor after changes** - Check `pm2 logs` for errors
5. **Keep rulesets organized** - Use clear naming conventions

## 🐛 Troubleshooting

### Wizard won't start
```bash
# Check if in correct directory
cd /home/claude-dev/repos/fxtrueup

# Verify node version
node --version  # Should be v20+

# Run directly
node src/cli/route-wizard.js
```

### Config not loading
```bash
# Check config file exists
ls -la src/config/routing-config.json

# Validate JSON syntax
cat src/config/routing-config.json | jq '.'
```

### Changes not applying
```bash
# Restart router
pm2 restart fxtrueup-router

# Check for errors
pm2 logs fxtrueup-router --err --lines 50

# Verify config was saved
tail -20 src/config/routing-config.json
```

## 🔗 Related Commands

```bash
# View router status
pm2 status fxtrueup-router

# View router logs
pm2 logs fxtrueup-router

# Check route statistics
curl http://localhost:8080/api/routes/stats | jq '.'

# Monitor orphaned positions
npm run cleanup:orphans:scan
```

---

**Need help?** The wizard has a user-friendly interface with numbered menus and clear prompts. Just follow the on-screen instructions!
