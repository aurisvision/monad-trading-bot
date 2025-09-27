# 🎯 إعدادات Coolify للنشر - دليل مفصل

## 📋 الخطوات المطلوبة في Coolify

### 🚀 **الخطوة 1: إنشاء تطبيق جديد**

1. **اذهب إلى Coolify Dashboard**
2. **اضغط على "New Application"**
3. **اختر "Docker Compose"** (مهم جداً!)
4. **اختر "GitHub Repository"**

### 🔗 **الخطوة 2: ربط المستودع**

**Repository Settings:**
```
Repository URL: https://github.com/devYahia/Monad-Area51.git
Branch: main
Docker Compose File: docker-compose.production.yml
Build Context: . (النقطة تعني المجلد الجذر)
```

### ⚙️ **الخطوة 3: Environment Variables**

**انسخ هذه المتغيرات بالضبط:**

```env
# Application Configuration
NODE_ENV=production
TZ=UTC
BUILD_NODE_ENV=production

# Database Configuration - PostgreSQL 17
POSTGRES_HOST=ggo04s4ogo00kscg8wso4c8k
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=***REMOVED***
POSTGRES_PORT=5432
POSTGRES_SSL_MODE=disable
POSTGRES_APPLICATION_NAME=area51_bot
POSTGRES_CLIENT_ENCODING=utf8
POSTGRES_CONNECT_TIMEOUT=60000
POSTGRES_COMMAND_TIMEOUT=30000

# Redis Configuration
REDIS_HOST=dg088sgsw8444kgscg8s448g
REDIS_PORT=6379
REDIS_PASSWORD=T3KStVXQ7XGM695bKkr0lP7X9Dmh55farbY7ehwO1qjYVj8SHKUj1D6g0UJ5eSrx
REDIS_USERNAME=redis
REDIS_DB=0
REDIS_KEY_PREFIX=area51:
REDIS_CONNECTION_TIMEOUT=5000
REDIS_COMMAND_TIMEOUT=5000
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY=100
REDIS_POOL_SIZE=10

# Bot Configuration
TELEGRAM_BOT_TOKEN=8041249329:AAGFqIb8b8Dg7v71vKVteFJ76ccNmwy4dps
ADMIN_USER_ID=6920475855
ACCESS_CONTROL_ENABLED=true

# Performance Configuration
DATABASE_POOL_SIZE=25
DATABASE_TIMEOUT=30000
CLUSTER_WORKERS=4
MAX_WORKERS=8
MAX_CONNECTIONS_PER_WORKER=2500

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS_PER_MINUTE=30
RATE_LIMIT_TRANSACTIONS_PER_HOUR=100
MAX_REQUESTS_PER_MINUTE=60
MAX_TRANSACTIONS_PER_HOUR=100

# Caching Configuration
CACHE_ENABLED=true
BACKGROUND_REFRESH_ENABLED=true
PORTFOLIO_REFRESH_INTERVAL=600000
GLOBAL_PRICE_REFRESH_INTERVAL=120000
ACTIVE_USER_THRESHOLD_MINUTES=30

# Monad Network Configuration
CHAIN_ID=10143
MONAD_RPC_URL=https://testnet-rpc.monad.xyz

# Monorail Configuration
MONORAIL_APP_ID=2837175649443187
MONORAIL_DATA_URL=https://testnet-api.monorail.xyz/v1
MONORAIL_QUOTE_URL=https://testnet-pathfinder.monorail.xyz/v4

# Trading Configuration
DEFAULT_GAS_LIMIT=250000
DEFAULT_GAS_PRICE_GWEI=20
DEFAULT_SLIPPAGE_BPS=10
MAX_SLIPPAGE=5

# Security Configuration
ENCRYPTION_KEY=***REMOVED***

# Monitoring Configuration
HEALTH_CHECK_PORT=3001
METRICS_ENABLED=true
METRICS_PORT=3002
LOG_LEVEL=info

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_RETENTION_DAYS=30
BACKUP_SCHEDULE=0 2 * * *

# UI Configuration
AUTO_DELETE_TIMEOUT=15000

# Redis Monitoring
REDIS_METRICS_ENABLED=true
REDIS_ALERT_THRESHOLDS_HIT_RATE_MIN=70
REDIS_ALERT_THRESHOLDS_RESPONSE_TIME_MAX=100
REDIS_ALERT_THRESHOLDS_MEMORY_USAGE_MAX=100
REDIS_ALERT_THRESHOLDS_ERROR_RATE_MAX=5
```

### 🔧 **الخطوة 4: Resource Configuration**

**في قسم Resources:**
```
Memory Limit: 2048 MB (2GB)
CPU Limit: 2000m (2 cores)
Memory Request: 1024 MB (1GB)
CPU Request: 1000m (1 core)
```

### 🌐 **الخطوة 5: Network Configuration**

**تأكد من:**
- ✅ PostgreSQL service: `postgresql-database-ggo04s4ogo00kscg8wso4c8k` في نفس الشبكة
- ✅ Redis service: `redis-database-dg088sgsw8444kgscg8s448g` في نفس الشبكة
- ✅ Network Mode: `bridge` (افتراضي)

### 📊 **الخطوة 6: Health Check Settings**

**سيتم تكوينها تلقائياً من docker-compose.yml:**
```
Health Check URL: http://localhost:3001/health
Interval: 30 seconds
Timeout: 10 seconds
Retries: 3
Start Period: 60 seconds
```

### 🔍 **الخطوة 7: Ports Configuration**

**Ports to expose:**
```
3000 - Main application port
3001 - Health check port
3002 - Metrics port (optional)
```

---

## 🎯 **خطوات النشر التفصيلية**

### **1. في Coolify Dashboard:**

1. **اضغط "New Application"**
2. **اختر "Docker Compose"**
3. **اختر "GitHub Repository"**

### **2. Repository Configuration:**

```
Repository: devYahia/Monad-Area51
Branch: main
Docker Compose File: docker-compose.production.yml
```

### **3. Environment Variables:**

- **انسخ جميع المتغيرات أعلاه**
- **الصقها في Environment Variables section**
- **تأكد من عدم وجود مسافات إضافية**

### **4. Resource Limits:**

```
Memory: 2GB
CPU: 2 cores
```

### **5. Deploy:**

- **اضغط "Deploy"**
- **انتظر اكتمال البناء (5-10 دقائق)**
- **راقب الـ logs للتأكد من عدم وجود أخطاء**

---

## ✅ **علامات النجاح**

### **أثناء النشر:**
- ✅ Container builds successfully
- ✅ No errors in build logs
- ✅ Health check passes

### **بعد النشر:**
- ✅ Application status: "Running"
- ✅ Health check: "Healthy"
- ✅ No error logs
- ✅ Bot responds to `/start`

---

## 🚨 **مشاكل محتملة وحلولها**

### **مشكلة 1: Database Connection Failed**
```
Error: Connection terminated due to connection timeout
```
**الحل:**
- تأكد من أن PostgreSQL service في نفس الشبكة
- تحقق من POSTGRES_HOST=ggo04s4ogo00kscg8wso4c8k

### **مشكلة 2: Redis Connection Failed**
```
Error: Redis connection failed
```
**الحل:**
- تأكد من أن Redis service في نفس الشبكة
- تحقق من REDIS_HOST=dg088sgsw8444kgscg8s448g

### **مشكلة 3: Health Check Failed**
```
Health check failing
```
**الحل:**
- انتظر 60 ثانية (start period)
- تحقق من port 3001 مفتوح
- راجع application logs

### **مشكلة 4: Build Failed**
```
Docker build failed
```
**الحل:**
- تأكد من أن docker-compose.production.yml موجود
- تحقق من أن الـ repository متصل صحيح

---

## 📞 **الدعم الفوري**

### **إذا واجهت مشاكل:**
1. **تحقق من Logs** في Coolify dashboard
2. **راجع Health Check status**
3. **تأكد من Environment Variables**
4. **تحقق من Network connectivity**

### **للمساعدة:**
- **Developer**: [@yahia_crypto](https://t.me/yahia_crypto)
- **Community**: [@Area51Community](https://t.me/Area51Community)

---

## 🎉 **بعد النشر الناجح**

### **اختبار البوت:**
1. **ابحث عن البوت**: @Area51Bot
2. **اضغط Start**
3. **اختبر الوظائف الأساسية**
4. **تأكد من نظام Access Control**

### **مراقبة الأداء:**
- **Health Check**: يجب أن يكون "Healthy"
- **Memory Usage**: أقل من 1.5GB
- **CPU Usage**: أقل من 70%
- **Response Time**: أقل من 2 ثانية

---

**🚀 جاهز للإطلاق! اتبع هذه الخطوات بالترتيب وستحصل على نشر ناجح 100%**
