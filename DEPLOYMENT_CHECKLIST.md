# 🚀 Deployment Checklist

## Pre-Deployment
- [ ] All tests pass: `node run_production_tests.js`
- [ ] Database migration ready: `database/complete_migration.sql`
- [ ] Environment variables configured in Coolify
- [ ] PostgreSQL and Redis containers running

## Coolify Configuration
- [ ] Repository: https://github.com/devYahia/area51-telegram-bot
- [ ] Branch: main
- [ ] Build Pack: Dockerfile
- [ ] Pre-deployment: `npm install --production`
- [ ] Post-deployment: `node scripts/post_deployment.js`

## Environment Variables Required
- [ ] POSTGRES_HOST
- [ ] POSTGRES_PASSWORD
- [ ] POSTGRES_SSL_MODE=disable
- [ ] REDIS_HOST
- [ ] REDIS_PASSWORD
- [ ] TELEGRAM_BOT_TOKEN
- [ ] ADMIN_USER_ID
- [ ] ACCESS_CONTROL_ENABLED=true

## Post-Deployment Verification
- [ ] Bot responds to /start
- [ ] Wallet generation works
- [ ] Admin panel accessible
- [ ] No database schema errors
- [ ] Redis connection working

## Troubleshooting
- [ ] Check logs: `docker logs container-id`
- [ ] Run diagnostics: `node run_production_tests.js`
- [ ] Quick fix: Follow `QUICK_FIX.md`
- [ ] Complete guide: `PRODUCTION_DEPLOYMENT_GUIDE.md`
