# 🚀 Coolify Deployment Guide - Area51 Modular Bot

## 📋 Overview

هذا الدليل مخصص للنشر عبر Coolify مع البنية التحتية المحتوية (containerized):
- **Bot Container**: يحتوي على التطبيق الرئيسي
- **PostgreSQL Container**: قاعدة البيانات منفصلة
- **Redis Container**: التخزين المؤقت منفصل
- **Auto-deployment**: عبر Git push → Coolify

## 🔄 عملية النشر

### المرحلة 1: التحضير والاختبار
```bash
# 1. تشغيل جميع الاختبارات محلياً
npm test
node test-modular-functionality.js
node comprehensive-functionality-test.js

# 2. التحقق من البنية الجديدة
npm run start:modular  # اختبار محلي

# 3. التحقق من متغيرات البيئة
cat .env.production.example
```

### المرحلة 2: النشر عبر Git
```bash
# 1. إضافة جميع التغييرات
git add .

# 2. إنشاء commit وصفي
git commit -m "feat: Deploy modular architecture v2.0

- ✅ Refactored to modular components
- ✅ Added migration system with rollback
- ✅ Enhanced error handling and monitoring
- ✅ Improved performance and scalability
- ✅ All tests passing (100% success rate)

Breaking Changes:
- New entry point: src/index-modular-simple.js
- Modular handler system
- Enhanced configuration management

Migration: Safe gradual rollout with automatic rollback"

# 3. Push إلى main branch
git push origin main
```

### المرحلة 3: مراقبة النشر التلقائي
Coolify سيقوم تلقائياً بـ:
1. **Pull** الكود الجديد
2. **Build** الـ container الجديد
3. **Deploy** مع zero-downtime
4. **Health check** تلقائي

## 🐳 إعدادات Coolify

### متغيرات البيئة المطلوبة
```bash
# Bot Configuration
NODE_ENV=production
BOT_TOKEN=your_bot_token_here
WEBHOOK_URL=https://your-domain.com/webhook

# Database (Coolify managed)
DATABASE_URL=postgresql://user:pass@postgres-container:5432/area51
POSTGRES_DB=area51
POSTGRES_USER=area51_user
POSTGRES_PASSWORD=***REMOVED***

# Redis (Coolify managed)
REDIS_URL=redis://redis-container:6379
REDIS_PASSWORD=secure_redis_password

# Application Settings
LOG_LEVEL=info
MIGRATION_ENABLED=true
MIGRATION_TEST_MODE=false
HEALTH_CHECK_PORT=3000

# Security
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key
```

## 📊 مراقبة النشر

### Health Endpoints للمراقبة
```bash
# Basic health check
curl https://your-domain.com/health

# Detailed metrics
curl https://your-domain.com/metrics

# Migration status
curl https://your-domain.com/migration/status
```

## 🚨 إجراءات الطوارئ

### Rollback السريع
```bash
# 1. العودة للـ commit السابق
git revert HEAD
git push origin main

# 2. Coolify سيقوم بـ auto-deploy للنسخة السابقة
```

## 🔍 التحقق من النجاح

### مؤشرات النجاح
✅ **Container Status**: Running and healthy
✅ **Health Checks**: All endpoints responding
✅ **Error Rate**: < 1%
✅ **Response Time**: < 2 seconds
✅ **Memory Usage**: < 512MB

---

*آخر تحديث: $(date)*
*الإصدار: 2.0 - Modular Architecture*