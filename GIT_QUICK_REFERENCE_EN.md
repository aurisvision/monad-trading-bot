# Git Quick Reference - Area51 Bot Project

## 📊 Current Project Status
- **Version**: v2.0.0
- **Commit Hash**: `01a0641`
- **Status**: Clean working tree
- **Branch**: master
- **Files**: 33 files, 17,326 lines of code

---

## 🔧 Essential Commands

### Check Status & History
```bash
git status                    # Current file status
git log --oneline            # Project history (compact)
git show 01a0641             # Details of specific commit
```

### Save Changes
```bash
git add .                    # Add all changes
git add src/file.js          # Add specific file
git commit -m "Description"  # Save with message
```

---

## 🚀 Adding New Features

### Quick Steps
```bash
# 1. Create new branch
git checkout -b feature/feature-name

# 2. Develop feature
# (edit files)
git add .
git commit -m "Feature: Add new functionality"

# 3. Merge feature
git checkout master
git merge feature/feature-name
git branch -d feature/feature-name

# 4. Tag new version
git tag -a v2.1.0 -m "Added new feature"
```

---

## ⏪ Restoring Previous Versions

### Restore Single File
```bash
git checkout 01a0641 -- src/index-scalable.js
```

### Restore Entire Project
```bash
# Create branch from old version
git checkout -b backup-v2.0.0 01a0641

# Temporarily go back to old version
git checkout 01a0641
```

### Safe Rollback
```bash
git revert commit-hash       # Create new commit that undoes changes
git reset --soft HEAD~1      # Undo commit but keep changes
git reset --hard HEAD~1      # Undo commit and discard changes
```

---

## 🏷️ Version Management

```bash
git tag                      # List all versions
git tag -a v2.1.0 -m "desc"  # Create new version
git show v2.1.0             # Version details
```

---

## 🌐 GitHub Integration (Optional)

```bash
# Connect to GitHub
git remote add origin https://github.com/username/area51-bot.git
git push -u origin master
git push --tags

# Daily workflow
git pull origin master      # Download updates
git push origin master      # Upload changes
```

---

## 🚨 Emergency Commands

```bash
# Undo last commit
git reset --soft HEAD~1

# Restore deleted file
git checkout HEAD -- filename.js

# View file from old version
git show 01a0641:src/index-scalable.js
```

---

## 📋 Quick Scenarios

### Hotfix
```bash
git checkout -b hotfix/issue-name
# Fix the issue
git commit -m "Hotfix: Fix critical issue"
git checkout master
git merge hotfix/issue-name
```

### Experiment
```bash
git checkout -b experiment/test-feature
# Try new code
# If successful: merge
# If failed: git checkout master && git branch -D experiment/test-feature
```

---

## ✅ Important Rules

1. **Always commit before major changes**
2. **Use branches for new features**
3. **Write clear commit messages**
4. **Tag stable versions**
5. **Test before merging to master**

---

## 📁 Project Structure
```
area51-bot/
├── .git/                 # Git data (hidden)
├── src/                  # Source code
│   ├── index-scalable.js # Main bot file (production-ready)
│   ├── monorail.js       # Trading API integration
│   ├── database-postgresql.js # Database layer
│   └── ...               # Other modules
├── package.json          # Project configuration
├── README.md            # Documentation
├── CHANGELOG.md         # Version history
└── .gitignore           # Ignored files
```

## 🎯 Project Milestones

| Version | Hash | Description |
|---------|------|-------------|
| v2.0.0 | `01a0641` | Major cleanup, removed legacy index.js, fixed inline buttons |
| v1.x.x | Previous | Redis caching, PostgreSQL, monitoring system |

**Quick reference for development workflow**
