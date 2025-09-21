# 🚀 دليل نقل Area51 Trading Bot للسيرفر

## 📋 المتطلبات الأساسية

### 1. متطلبات السيرفر
```bash
# نظام التشغيل
Ubuntu 20.04+ أو CentOS 7+

# الذاكرة والمعالج
RAM: 4GB+ (مستحسن 8GB)
CPU: 2 cores+
Storage: 50GB+ SSD

# البرمجيات المطلوبة
Node.js 18+
PostgreSQL 13+
Redis 6+
Docker & Docker Compose
Git
```

### 2. الحسابات والمفاتيح المطلوبة
- Telegram Bot Token
- Database credentials
- RPC endpoints للشبكة
- SSL certificates (للإنتاج)

## 🔧 خطوات التثبيت

### الخطوة 1: تحضير السيرفر
```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# تثبيت PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# تثبيت Redis
sudo apt install redis-server -y

# تثبيت Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# تثبيت Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### الخطوة 2: استنساخ المشروع
```bash
# إنشاء مجلد للمشروع
sudo mkdir -p /opt/area51-bot
sudo chown $USER:$USER /opt/area51-bot
cd /opt/area51-bot

# استنساخ المشروع (أو رفع الملفات)
git clone <repository-url> .
# أو
scp -r /path/to/local/project/* user@server:/opt/area51-bot/

# تثبيت التبعيات
npm install --production
```

### الخطوة 3: إعداد قاعدة البيانات PostgreSQL
```bash
# الدخول لـ PostgreSQL
sudo -u postgres psql

# إنشاء قاعدة البيانات والمستخدم
CREATE DATABASE area51_trading;
CREATE USER area51_user WITH PASSWORD 'your_***REMOVED***';
GRANT ALL PRIVILEGES ON DATABASE area51_trading TO area51_user;
\q

# تشغيل ملفات الـ Schema
cd /opt/area51-bot
psql -h localhost -U area51_user -d area51_trading -f database/schema.sql
```

### الخطوة 4: إعداد Redis
```bash
# تحرير إعدادات Redis
sudo nano /etc/redis/redis.conf

# التأكد من الإعدادات التالية:
bind 127.0.0.1
port 6379
requirepass your_redis_password
maxmemory 1gb
maxmemory-policy allkeys-lru

# إعادة تشغيل Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

### الخطوة 5: إعداد متغيرات البيئة
```bash
# إنشاء ملف .env
cd /opt/area51-bot
cp .env.example .env
nano .env
```

```env
# ملف .env للسيرفر
NODE_ENV=production

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=area51_trading
DB_USER=area51_user
DB_PASSWORD=your_***REMOVED***
DB_SSL=false

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0

# RPC Configuration
RPC_URL=https://your-rpc-endpoint
BACKUP_RPC_URL=https://backup-rpc-endpoint

# Security
ENCRYPTION_KEY=your_32_character_encryption_key
JWT_SECRET=your_jwt_secret_key

# Monitoring
ENABLE_MONITORING=true
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000

# Performance
MAX_CONCURRENT_TRADES=100
CACHE_TTL_SECONDS=300
REQUEST_TIMEOUT=30000

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/area51-bot/app.log
```

### الخطوة 6: إعداد الـ Logging
```bash
# إنشاء مجلد السجلات
sudo mkdir -p /var/log/area51-bot
sudo chown $USER:$USER /var/log/area51-bot

# إعداد log rotation
sudo nano /etc/logrotate.d/area51-bot
```

```
/var/log/area51-bot/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 area51 area51
    postrotate
        systemctl reload area51-bot
    endscript
}
```

### الخطوة 7: إنشاء Systemd Service
```bash
# إنشاء ملف الخدمة
sudo nano /etc/systemd/system/area51-bot.service
```

```ini
[Unit]
Description=Area51 Telegram Trading Bot
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=area51
Group=area51
WorkingDirectory=/opt/area51-bot
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=area51-bot

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/area51-bot /var/log/area51-bot

[Install]
WantedBy=multi-user.target
```

```bash
# إنشاء مستخدم للخدمة
sudo useradd -r -s /bin/false area51
sudo chown -R area51:area51 /opt/area51-bot
sudo chown -R area51:area51 /var/log/area51-bot

# تفعيل الخدمة
sudo systemctl daemon-reload
sudo systemctl enable area51-bot
```

### الخطوة 8: إعداد Nginx (Reverse Proxy)
```bash
# تثبيت Nginx
sudo apt install nginx -y

# إنشاء إعدادات الموقع
sudo nano /etc/nginx/sites-available/area51-bot
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Monitoring endpoints
    location /metrics {
        proxy_pass http://localhost:9090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Basic auth for security
        auth_basic "Monitoring";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }

    location /grafana {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# تفعيل الموقع
sudo ln -s /etc/nginx/sites-available/area51-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### الخطوة 9: إعداد SSL Certificate
```bash
# تثبيت Certbot
sudo apt install certbot python3-certbot-nginx -y

# الحصول على شهادة SSL
sudo certbot --nginx -d your-domain.com

# تجديد تلقائي
sudo crontab -e
# إضافة السطر التالي:
0 12 * * * /usr/bin/certbot renew --quiet
```

### الخطوة 10: إعداد المراقبة (Monitoring)
```bash
# تشغيل Docker Compose للمراقبة
cd /opt/area51-bot
docker-compose -f docker/monitoring/docker-compose.yml up -d

# التحقق من حالة الخدمات
docker-compose -f docker/monitoring/docker-compose.yml ps
```

### الخطوة 11: إعداد النسخ الاحتياطي
```bash
# إنشاء سكريبت النسخ الاحتياطي
sudo nano /opt/area51-bot/scripts/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/area51-bot"
DATE=$(date +%Y%m%d_%H%M%S)

# إنشاء مجلد النسخ الاحتياطي
mkdir -p $BACKUP_DIR

# نسخ احتياطي لقاعدة البيانات
pg_dump -h localhost -U area51_user area51_trading > $BACKUP_DIR/database_$DATE.sql

# نسخ احتياطي للملفات المهمة
tar -czf $BACKUP_DIR/files_$DATE.tar.gz /opt/area51-bot --exclude=node_modules --exclude=logs

# حذف النسخ القديمة (أكثر من 30 يوم)
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

```bash
# جعل السكريبت قابل للتنفيذ
chmod +x /opt/area51-bot/scripts/backup.sh

# إضافة مهمة cron للنسخ الاحتياطي اليومي
sudo crontab -e
# إضافة السطر التالي:
0 2 * * * /opt/area51-bot/scripts/backup.sh >> /var/log/area51-bot/backup.log 2>&1
```

### الخطوة 12: إعداد Firewall
```bash
# تفعيل UFW
sudo ufw enable

# السماح بالاتصالات الأساسية
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# السماح بالاتصالات المحلية فقط للخدمات
sudo ufw allow from 127.0.0.1 to any port 5432  # PostgreSQL
sudo ufw allow from 127.0.0.1 to any port 6379  # Redis
sudo ufw allow from 127.0.0.1 to any port 9090  # Prometheus
sudo ufw allow from 127.0.0.1 to any port 3000  # Grafana

# التحقق من حالة Firewall
sudo ufw status
```

## 🚀 تشغيل المشروع

### بدء التشغيل
```bash
# تشغيل الخدمة
sudo systemctl start area51-bot

# التحقق من الحالة
sudo systemctl status area51-bot

# مراقبة السجلات
sudo journalctl -u area51-bot -f
```

### فحص الصحة
```bash
# فحص اتصال قاعدة البيانات
psql -h localhost -U area51_user -d area51_trading -c "SELECT NOW();"

# فحص اتصال Redis
redis-cli -h localhost -p 6379 -a your_redis_password ping

# فحص صحة التطبيق
curl http://localhost:3001/health
```

## 🔧 الصيانة والمراقبة

### مراقبة الأداء
```bash
# مراقبة استخدام الموارد
htop
iotop
nethogs

# مراقبة السجلات
tail -f /var/log/area51-bot/app.log
sudo journalctl -u area51-bot -f

# مراقبة قاعدة البيانات
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
```

### التحديثات
```bash
# إيقاف الخدمة
sudo systemctl stop area51-bot

# تحديث الكود
cd /opt/area51-bot
git pull origin main
npm install --production

# تشغيل migrations إذا كانت موجودة
npm run migrate

# إعادة تشغيل الخدمة
sudo systemctl start area51-bot
```

### استكشاف الأخطاء
```bash
# فحص حالة الخدمات
sudo systemctl status area51-bot postgresql redis-server nginx

# فحص السجلات
sudo journalctl -u area51-bot --since "1 hour ago"
tail -f /var/log/area51-bot/app.log

# فحص الاتصالات
netstat -tulpn | grep -E ':(3001|5432|6379|80|443)'

# فحص استخدام الذاكرة
free -h
ps aux | grep node

# فحص مساحة القرص
df -h
du -sh /opt/area51-bot/*
```

## 🔒 الأمان

### تحديثات الأمان
```bash
# تحديث النظام بانتظام
sudo apt update && sudo apt upgrade -y

# مراقبة محاولات الاختراق
sudo tail -f /var/log/auth.log

# فحص الملفات المشبوهة
sudo find /opt/area51-bot -type f -name "*.js" -exec grep -l "eval\|exec\|system" {} \;
```

### نسخ احتياطي للمفاتيح
```bash
# نسخ احتياطي آمن للمفاتيح الحساسة
sudo cp /opt/area51-bot/.env /opt/backups/env_backup_$(date +%Y%m%d).enc
sudo chmod 600 /opt/backups/env_backup_*.enc
```

## 📊 مراقبة الأداء

### Metrics المهمة
- Response time للتداول
- معدل نجاح المعاملات
- استخدام الذاكرة والمعالج
- حالة اتصال قاعدة البيانات والـ Redis
- عدد المستخدمين النشطين

### تنبيهات مهمة
- فشل في اتصال قاعدة البيانات
- ارتفاع استخدام الذاكرة > 80%
- فشل في المعاملات > 5%
- انقطاع اتصال RPC

## 🆘 الطوارئ

### إعادة التشغيل السريع
```bash
# إعادة تشغيل سريع
sudo systemctl restart area51-bot

# إعادة تشغيل كامل
sudo systemctl restart postgresql redis-server nginx area51-bot
```

### استعادة من النسخة الاحتياطية
```bash
# استعادة قاعدة البيانات
sudo systemctl stop area51-bot
psql -h localhost -U area51_user -d area51_trading < /opt/backups/database_YYYYMMDD_HHMMSS.sql
sudo systemctl start area51-bot
```

---

## 📞 الدعم الفني

للحصول على المساعدة:
1. تحقق من السجلات أولاً
2. راجع هذا الدليل
3. تواصل مع فريق التطوير مع تفاصيل الخطأ والسجلات

**ملاحظة مهمة**: تأكد من تغيير جميع كلمات المرور الافتراضية وإعداد SSL قبل التشغيل في الإنتاج!
