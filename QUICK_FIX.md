# ⚡ QUICK FIX - Area51 Bot Production Issues

## 🚨 IMMEDIATE ACTION REQUIRED

### المشكلة:
```
column "encrypted_private_key" of relation "users" does not exist
Cannot read properties of null (reading 'ping')
```

### ✅ الحل السريع (5 دقائق):

## 1️⃣ تحديث Coolify Post-deployment Command

**في Coolify → Application → Configuration → Pre/Post Deployment Commands:**

**Post-deployment Command:**
```bash
node scripts/post_deployment.js
```

## 2️⃣ تشغيل Migration في PostgreSQL Container

**اتصل بـ PostgreSQL container:**
```bash
docker exec -it ggo04s4ogo00kscg8wso4c8k psql -U postgres -d postgres
```

**نفذ هذا الأمر:**
```sql
-- Add missing columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_mnemonic TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add missing column to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type VARCHAR(20);

-- Add missing column to user_access
ALTER TABLE user_access ADD COLUMN IF NOT EXISTS used_at TIMESTAMP;

-- Verify columns exist
\d users
```

## 3️⃣ اختبار سريع

**في Application container:**
```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: 'ggo04s4ogo00kscg8wso4c8k',
  database: 'postgres',
  user: 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  ssl: false
});
pool.query('SELECT encrypted_private_key FROM users LIMIT 1')
  .then(() => console.log('✅ Database OK'))
  .catch(e => console.log('❌ Error:', e.message))
  .finally(() => pool.end());
"
```

## 4️⃣ إعادة تشغيل التطبيق

```bash
# في Coolify
Restart Application Container
```

## 🎯 التحقق من النجاح:

1. **لا توجد أخطاء في الـ logs**
2. **البوت يرد على `/start`**
3. **Wallet generation يعمل**

---

## 🚨 إذا لم يعمل الحل السريع:

### استخدم الحل الشامل:

```bash
# في PostgreSQL container
psql -U postgres -d postgres -c "
BEGIN;
$(cat database/complete_migration.sql)
COMMIT;
"
```

### أو استخدم الـ script:

```bash
node database/check_and_fix_database.js
```

---

## 📞 الدعم السريع:

**أخطاء شائعة:**

1. **"relation does not exist"** → تشغيل Migration
2. **"connection timeout"** → فحص network connectivity
3. **"authentication failed"** → فحص passwords

**أوامر التشخيص:**
```bash
# Database
docker exec ggo04s4ogo00kscg8wso4c8k psql -U postgres -d postgres -c "SELECT 1;"

# Redis  
docker exec dg088sgsw8444kgscg8s448g redis-cli ping

# Application
docker logs ngsokk0c44488sss8wwsk8co --tail 20
```

---

## ⏱️ الوقت المتوقع: 5-10 دقائق

**النتيجة:** البوت يعمل بشكل طبيعي ✅
