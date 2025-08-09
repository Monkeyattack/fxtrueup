# FXTrueUp Development Workflow - Quick Reference

## 🚨 CRITICAL RULE
**NEVER EDIT FILES DIRECTLY ON VPS VIA SSH**

## ✅ Proper Workflow

### Daily Development
```bash
# 1. Make changes locally in your editor
# 2. Check status
./dev.sh status

# 3. Commit and push
./dev.sh commit "Your commit message"

# 4. Deploy to VPS
./dev.sh deploy

# 5. Restart service
./dev.sh restart

# 6. Check logs if needed
./dev.sh logs
```

### Quick Deployment (All-in-One)
```bash
./dev.sh quick "Fixed login bug"
```

### Check Everything is Synced
```bash
./dev.sh check
```

## 📂 Key Files and Locations

### Local Repository
- **Path**: `C:\Users\cmeredith\source\repos\metatrader-reporting`
- **GitHub**: `https://github.com/Monkeyattack/fxtrueup.git`
- **Branch**: `master`

### VPS Details
- **Host**: `172.93.51.42`
- **User**: `root`
- **SSH Key**: `~/.ssh/tao_alpha_dca_key`
- **Project Path**: `/var/www/fxtrueup`
- **Service**: `fxtrueup` (PM2)

## 🛡️ Safeguards in Place

### Git Hooks
- **Pre-commit**: Warns about SSH editing patterns
- **Post-commit**: Shows deployment reminders

### Scripts Created
- **Local**: `.claude/commands/dev.sh` (and `.ps1`)
- **VPS**: `deploy.sh`, `restart.sh`, `logs.sh`, `status.sh`

### VS Code Integration
- **Workspace**: `fxtrueup.code-workspace`
- **Tasks**: Pre-configured for all workflow commands
- **Settings**: Optimized for Git workflow

## 🆘 Emergency Recovery

If you accidentally made changes via SSH:

1. **DON'T COMMIT** local changes yet
2. Check sync status: `./dev.sh check`
3. If out of sync, reset local: `git reset --hard origin/master`
4. Make changes properly in local repository
5. Use normal workflow: commit → deploy → restart

## ⚡ Command Reference

| Command | Purpose |
|---------|---------|
| `./dev.sh status` | Show Git and VPS status |
| `./dev.sh commit "msg"` | Commit and push to GitHub |
| `./dev.sh deploy` | Deploy from GitHub to VPS |
| `./dev.sh restart` | Restart VPS PM2 service |
| `./dev.sh logs` | View VPS service logs |
| `./dev.sh check` | Check if all repos are in sync |
| `./dev.sh quick "msg"` | Commit, deploy, restart in one |

## 🚫 Commands to NEVER Use

```bash
# NEVER do these:
ssh root@172.93.51.42 "cat > file.js"
ssh root@172.93.51.42 "nano file.js"
ssh root@172.93.51.42 "vim file.js"
ssh root@172.93.51.42 "echo 'code' >> file.js"
```

## 📋 Context Reset Checklist

When Claude's context resets:
1. ✅ Read `CLAUDE.md` first
2. ✅ Use only the `./dev.sh` commands
3. ✅ Never edit files via SSH
4. ✅ Always commit locally first
5. ✅ Always deploy from GitHub

---
**Remember**: Local → GitHub → VPS is the only safe path!