# 🚀 دليل تشغيل نظام المراقبة - Area51 Bot

## 📋 الخطوات البسيطة لتشغيل النظام

### الخطوة 1: إيقاف أي عملية تستخدم Port 3001
```powershell
# فحص ما يستخدم Port 3001
netstat -ano | findstr :3001

# إيقاف العملية (استبدل PID بالرقم الظاهر)
taskkill /F /PID [رقم_العملية]
```

### الخطوة 2: تشغيل البوت مع نظام المراقبة
```powershell
cd "c:\Users\user\Monad Area\area51-bot"
npm start
```

### الخطوة 3: التحقق من تشغيل البوت
```powershell
# يجب أن ترى رسالة تأكيد تشغيل البوت
# وأن Port 3001 يعمل للمراقبة
```

### الخطوة 4: الوصول إلى Grafana Dashboard
1. افتح المتصفح
2. اذهب إلى: http://localhost:3000
3. تسجيل الدخول:
   - Username: `admin`
   - Password: `admin`
4. ابحث عن Dashboard اسمه: "Area51 Bot Monitoring"

## 🔧 حل المشاكل الشائعة

### مشكلة: Port 3001 مستخدم
```powershell
# إيقاف جميع العمليات على Port 3001
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process -Force
```

### مشكلة: Grafana لا يظهر البيانات
1. تأكد أن البوت يعمل على Port 3001
2. تأكد أن Docker containers تعمل:
```powershell
docker ps | Select-String "area51"
```

### مشكلة: Docker containers لا تعمل
```powershell
# تشغيل جميع containers
docker-compose -f docker/docker-compose.monitoring.yml up -d
```

## 📊 ما ستراه في Dashboard

1. **Bot Status**: حالة البوت (RUNNING/DOWN)
2. **Process Uptime**: مدة تشغيل البوت بالثواني
3. **Memory Usage**: استخدام الذاكرة
4. **System Metrics**: استخدام المعالج

## 🎯 الأوامر المفيدة

```powershell
# فحص حالة البوت
curl http://localhost:3001/health

# فحص metrics
curl http://localhost:3001/metrics

# فحص Docker containers
docker ps

# إيقاف نظام المراقبة
docker-compose -f docker/docker-compose.monitoring.yml down
```

## ⚡ التشغيل السريع (خطوة واحدة)

```powershell
# إيقاف أي عملية على Port 3001 وتشغيل البوت
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; npm start
```

## 🌐 الروابط المهمة

- **Grafana Dashboard**: http://localhost:3000
- **Prometheus**: http://localhost:9090
- **Bot Health**: http://localhost:3001/health
- **Bot Metrics**: http://localhost:3001/metrics

---
**ملاحظة**: تأكد أن Docker Desktop يعمل قبل البدء
