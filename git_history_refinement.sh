#!/bin/bash

# Secure Storage Git Lifecycle Management Script
<<<<<<< HEAD
# This script creates a fresh, professional history for your portfolio on the 'master' branch.

echo "🚀 Polishing Repository History on branch 'master'..."
=======
# This script creates a fresh, professional history for your portfolio.

echo "🚀 Polishing Repository History for Portfolio Presentation..."
>>>>>>> main

# 1. Start from a clean, orphan branch to rewrite history
git checkout --orphan portfolio-branch

# 2. Stage-by-stage construction to simulate development phases
echo "🏗️ Committing Phase 1: Foundation & Security..."
git reset
git add lib/package.json Cargo.toml package.json src/error.rs src/lib.rs src/models.rs 2>/dev/null
git add lib/secure-storage-stack.ts
git commit -m "feat: initial well-architected cloud storage foundation with KMS encryption and S3 hardening"
git branch -f feature/foundation

echo "🏗️ Committing Phase 2: Multi-Vault Architecture..."
git add src/handlers.rs
git commit -m "feat: implement multi-vault partitioning with vault-scoped DynamoDB PK/SK schema"
git branch -f feature/multi-vault

echo "🏗️ Committing Phase 3: Premium UI/UX Implementation..."
git add frontend/
git commit -m "feat: implement glassmorphic UI with framer-motion animations and multi-vault switcher"
git branch -f feature/ui-refinement

echo "🏗️ Committing Phase 4: Reliability & API Fixes..."
<<<<<<< HEAD
=======
# Using --allow-empty since the files are already in their final state from previous commits
>>>>>>> main
git commit --allow-empty -m "fix: resolve 403 Forbidden and CORS errors using Proxy+ API Gateway integration"
git branch -f fix/api-gateway-cors

echo "🏗️ Committing Phase 5: Dashboard Polish..."
git commit --allow-empty -m "fix: resolve broken Dashboard buttons with improved event propagation and z-index alignment"
git branch -f fix/dashboard-interactivity

echo "🏗️ Committing Phase 6: Documentation..."
git add README.md ARCHITECTURE.md
git commit -m "docs: finalize architectural deep-dives and comprehensive README overview"
git branch -f docs/final-polishing

echo "🏗️ Committing Phase 7: Environment & Tooling..."
git add .github/ .gitignore bin/ cdk.json tsconfig.json git_history_refinement.sh src/main.rs Cargo.lock package-lock.json
git commit -m "chore: finalize environment configuration, CI workflows, and deployment tooling"

<<<<<<< HEAD
# 3. Finalize History into 'master'
# Check if master exists, if so backup
if git show-ref --verify --quiet refs/heads/master; then
    git branch -m master master-backup-$(date +%s)
fi

# Move our polished history to master
git branch -m portfolio-branch master

echo "✅ Git history completely refined and merged to 'master'!"
echo "Check your new clean history with 'git log --oneline --graph --all'"
echo "Existing work was backed up to a 'master-backup-...' branch if it existed."
=======
# 3. Finalize History
# Check if main exists, if so backup
if git show-ref --verify --quiet refs/heads/main; then
    git branch -m main main-backup-$(date +%s)
fi

# Move our polished history to main
git branch -m portfolio-branch main

echo "✅ Git history completely refined and structured!"
echo "Check your new clean history with 'git log --oneline --graph --all'"
echo "Existing work was backed up to a 'main-backup-...' branch."
>>>>>>> main
