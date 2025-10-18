/**
 * Simple Unified Monitoring System
 * نظام مراقبة موحد وبسيط يوفي احتياجات المشروع دون تعقيد
 * 
 * الوظائف الأساسية:
 * - مقاييس أساسية (طلبات، أخطاء، مستخدمين، أداء)
 * - فحص صحة النظام (قاعدة بيانات، Redis، ذاكرة)
 * - تنبيهات بسيطة للمشاكل الحرجة
 * - تسجيل الأحداث المهمة
 * - endpoints للمراقبة
 */

const promClient = require('prom-client');
const logger = require('../utils/Logger');
const v8 = require('v8');

class SimpleUnifiedMonitoring {
    constructor(database, redis, telegramBot = null) {
        this.database = database;
        this.redis = redis;
        this.telegramBot = telegramBot;
        this.startTime = Date.now();
        
        // إعداد Prometheus metrics
        this.setupMetrics();
        
        // إحصائيات بسيطة
        this.stats = {
            requests: 0,
            errors: 0,
            activeUsers: new Set(),
            lastHealthCheck: null,
            systemHealth: 'unknown'
        };
        
        // إعدادات التنبيهات
        this.alertThresholds = {
            errorRate: 0.1, // 10%
            memoryUsage: 0.85, // 85%
            responseTime: 5000, // 5 ثواني
            dbConnectionFails: 5
        };
        
        // بدء المهام الدورية
        this.startPeriodicTasks();
        
        logger.info('Simple Unified Monitoring System initialized', {
            hasDatabase: !!database,
            hasRedis: !!redis,
            hasTelegramBot: !!telegramBot
        });
    }

    /**
     * إعداد مقاييس Prometheus الأساسية
     */
    setupMetrics() {
        this.register = new promClient.Registry();
        this.register.setDefaultLabels({ app: 'area51-bot' });
        
        // تمكين المقاييس الافتراضية للنظام
        promClient.collectDefaultMetrics({ register: this.register });
        
        // مقاييس مخصصة أساسية
        this.metrics = {
            // طلبات HTTP
            httpRequests: new promClient.Counter({
                name: 'http_requests_total',
                help: 'Total HTTP requests',
                labelNames: ['method', 'status'],
                registers: [this.register]
            }),
            
            // رسائل التلغرام
            telegramMessages: new promClient.Counter({
                name: 'telegram_messages_total',
                help: 'Total Telegram messages',
                labelNames: ['type', 'status'],
                registers: [this.register]
            }),
            
            // المستخدمين النشطين
            activeUsers: new promClient.Gauge({
                name: 'active_users_current',
                help: 'Current active users',
                registers: [this.register]
            }),
            
            // العمليات التجارية
            tradingOps: new promClient.Counter({
                name: 'trading_operations_total',
                help: 'Total trading operations',
                labelNames: ['type', 'status'],
                registers: [this.register]
            }),
            
            // قاعدة البيانات
            dbQueries: new promClient.Counter({
                name: 'database_queries_total',
                help: 'Total database queries',
                labelNames: ['operation', 'status'],
                registers: [this.register]
            }),
            
            dbConnections: new promClient.Gauge({
                name: 'database_connections_active',
                help: 'Active database connections',
                registers: [this.register]
            }),
            
            // Redis
            redisOps: new promClient.Counter({
                name: 'redis_operations_total',
                help: 'Total Redis operations',
                labelNames: ['operation', 'status'],
                registers: [this.register]
            }),
            
            // الأخطاء
            errors: new promClient.Counter({
                name: 'errors_total',
                help: 'Total errors',
                labelNames: ['type', 'severity'],
                registers: [this.register]
            }),
            
            // زمن الاستجابة
            responseTime: new promClient.Histogram({
                name: 'response_time_seconds',
                help: 'Response time in seconds',
                labelNames: ['operation'],
                buckets: [0.1, 0.5, 1, 2, 5, 10],
                registers: [this.register]
            })
        };
    }

    /**
     * تسجيل طلب HTTP
     */
    recordHttpRequest(method, status, duration = 0) {
        this.metrics.httpRequests.inc({ method, status });
        this.stats.requests++;
        
        if (duration > 0) {
            this.metrics.responseTime.observe({ operation: 'http' }, duration / 1000);
        }
        
        if (status >= 400) {
            this.recordError('http_error', status >= 500 ? 'error' : 'warning');
        }
    }

    /**
     * تسجيل رسالة تلغرام
     */
    recordTelegramMessage(type, status = 'success', userId = null) {
        this.metrics.telegramMessages.inc({ type, status });
        
        if (userId) {
            this.stats.activeUsers.add(userId);
            this.metrics.activeUsers.set(this.stats.activeUsers.size);
        }
        
        if (status === 'error') {
            this.recordError('telegram_error', 'warning');
        }
    }

    /**
     * تسجيل عملية تجارية
     */
    recordTradingOperation(type, status, duration = 0) {
        this.metrics.tradingOps.inc({ type, status });
        
        if (duration > 0) {
            this.metrics.responseTime.observe({ operation: 'trading' }, duration / 1000);
        }
        
        if (status === 'failed') {
            this.recordError('trading_error', 'warning');
        }
    }

    /**
     * تسجيل عملية قاعدة بيانات
     */
    recordDatabaseQuery(operation, status, duration = 0) {
        this.metrics.dbQueries.inc({ operation, status });
        
        if (duration > 0) {
            this.metrics.responseTime.observe({ operation: 'database' }, duration / 1000);
        }
        
        if (status === 'error') {
            this.recordError('database_error', 'error');
        }
    }

    /**
     * تسجيل عملية Redis
     */
    recordRedisOperation(operation, status) {
        this.metrics.redisOps.inc({ operation, status });
        
        if (status === 'error') {
            this.recordError('redis_error', 'warning');
        }
    }

    /**
     * تسجيل خطأ
     */
    recordError(type, severity = 'error') {
        this.metrics.errors.inc({ type, severity });
        this.stats.errors++;
        
        logger.error(`Monitoring: ${type}`, null, { 
            severity, 
            errorCount: this.stats.errors,
            errorRate: this.getErrorRate()
        });
        
        // فحص التنبيهات
        this.checkAlerts();
    }

    /**
     * تسجيل معلومات
     */
    logInfo(message, data = {}) {
        logger.info(message, data);
        
        // تسجيل في الإحصائيات
        this.stats.logs = (this.stats.logs || 0) + 1;
        
        // إذا كان هناك بيانات إضافية، نسجلها كحدث
        if (Object.keys(data).length > 0) {
            this.recordEvent('info', message, data);
        }
    }

    /**
     * تسجيل خطأ
     */
    logError(message, data = {}) {
        logger.error(message, data);
        
        // تسجيل الخطأ في النظام
        this.recordError('application_error', 'error');
        
        // إذا كان هناك بيانات إضافية، نسجلها كحدث
        if (Object.keys(data).length > 0) {
            this.recordEvent('error', message, data);
        }
    }

    /**
     * تسجيل تحذير
     */
    logWarning(message, data = {}) {
        logger.warn(message, data);
        
        // تسجيل التحذير في النظام
        this.recordError('application_warning', 'warning');
        
        // إذا كان هناك بيانات إضافية، نسجلها كحدث
        if (Object.keys(data).length > 0) {
            this.recordEvent('warning', message, data);
        }
    }

    /**
     * تسجيل حدث عام
     */
    recordEvent(type, message, data = {}) {
        const event = {
            type,
            message,
            data,
            timestamp: new Date()
        };
        
        // حفظ الأحداث الأخيرة (آخر 100 حدث)
        if (!this.recentEvents) {
            this.recentEvents = [];
        }
        
        this.recentEvents.push(event);
        
        // الاحتفاظ بآخر 100 حدث فقط
        if (this.recentEvents.length > 100) {
            this.recentEvents = this.recentEvents.slice(-100);
        }
    }

    /**
     * فحص صحة النظام
     */
    async checkSystemHealth() {
        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: this.getUptime(),
            checks: {}
        };

        try {
            // فحص قاعدة البيانات
            healthStatus.checks.database = await this.checkDatabase();
            
            // فحص Redis
            healthStatus.checks.redis = await this.checkRedis();
            
            // فحص الذاكرة
            healthStatus.checks.memory = this.checkMemory();
            
            // تحديد الحالة العامة
            const hasErrors = Object.values(healthStatus.checks).some(check => check.status === 'unhealthy');
            const hasWarnings = Object.values(healthStatus.checks).some(check => check.status === 'warning');
            
            if (hasErrors) {
                healthStatus.status = 'unhealthy';
            } else if (hasWarnings) {
                healthStatus.status = 'warning';
            }
            
            this.stats.lastHealthCheck = healthStatus;
            this.stats.systemHealth = healthStatus.status;
            
            return healthStatus;
            
        } catch (error) {
            logger.error('Health check failed', error);
            healthStatus.status = 'unhealthy';
            healthStatus.error = error.message;
            return healthStatus;
        }
    }

    /**
     * فحص قاعدة البيانات
     */
    async checkDatabase() {
        try {
            const start = Date.now();
            await this.database.query('SELECT 1');
            const responseTime = Date.now() - start;
            
            this.metrics.dbConnections.set(this.database.pool?.totalCount || 0);
            
            return {
                status: responseTime < 1000 ? 'healthy' : 'warning',
                responseTime: `${responseTime}ms`,
                message: responseTime < 1000 ? 'Database OK' : 'Database slow'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                message: 'Database connection failed'
            };
        }
    }

    /**
     * فحص Redis
     */
    async checkRedis() {
        if (!this.redis) {
            return { status: 'warning', message: 'Redis not configured' };
        }
        
        try {
            const start = Date.now();
            await this.redis.ping();
            const responseTime = Date.now() - start;
            
            return {
                status: responseTime < 500 ? 'healthy' : 'warning',
                responseTime: `${responseTime}ms`,
                message: responseTime < 500 ? 'Redis OK' : 'Redis slow'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                message: 'Redis connection failed'
            };
        }
    }

    /**
     * فحص الذاكرة
     */
    checkMemory() {
        const memUsage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        // Use actual heap size limit instead of current heap total
        const heapUsagePercent = (memUsage.heapUsed / heapStats.heap_size_limit) * 100;
        
        let status = 'healthy';
        let message = 'Memory usage normal';
        
        if (heapUsagePercent > 90) {
            status = 'unhealthy';
            message = 'Memory usage critical';
        } else if (heapUsagePercent > 75) {
            status = 'warning';
            message = 'Memory usage high';
        }
        
        return {
            status,
            usage: `${heapUsagePercent.toFixed(1)}%`,
            heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024 * 10) / 10}MB`, // 1 decimal place
            heapTotal: `${Math.round(heapStats.heap_size_limit / 1024 / 1024 * 10) / 10}MB`, // Show actual limit
            message
        };
    }

    /**
     * فحص التنبيهات
     */
    checkAlerts() {
        const errorRate = this.getErrorRate();
        const memoryCheck = this.checkMemory();
        
        // تنبيه معدل الأخطاء العالي
        if (errorRate > this.alertThresholds.errorRate) {
            this.sendAlert('high_error_rate', {
                errorRate: (errorRate * 100).toFixed(1) + '%',
                threshold: (this.alertThresholds.errorRate * 100) + '%'
            });
        }
        
        // تنبيه استخدام الذاكرة العالي
        if (memoryCheck.status === 'unhealthy') {
            this.sendAlert('high_memory_usage', {
                usage: memoryCheck.usage,
                threshold: '90%'
            });
        }
    }

    /**
     * إرسال تنبيه
     */
    async sendAlert(type, data) {
        const alertMessage = this.formatAlert(type, data);
        
        logger.warn(`ALERT: ${alertMessage}`, data);
        
        // إرسال تنبيه عبر التلغرام إذا كان متاحاً
        if (this.telegramBot && process.env.ADMIN_CHAT_ID) {
            try {
                await this.telegramBot.telegram.sendMessage(
                    process.env.ADMIN_CHAT_ID,
                    `🚨 تنبيه: ${alertMessage}`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                logger.error('Failed to send Telegram alert', error);
            }
        }
    }

    /**
     * تنسيق رسالة التنبيه
     */
    formatAlert(type, data) {
        switch (type) {
            case 'high_error_rate':
                return `معدل أخطاء عالي: ${data.errorRate} (الحد الأقصى: ${data.threshold})`;
            case 'high_memory_usage':
                return `استخدام ذاكرة عالي: ${data.usage} (الحد الأقصى: ${data.threshold})`;
            default:
                return `تنبيه: ${type}`;
        }
    }

    /**
     * بدء المهام الدورية
     */
    startPeriodicTasks() {
        // فحص الصحة كل دقيقة
        setInterval(() => {
            this.checkSystemHealth();
        }, 60000);
        
        // تنظيف المستخدمين النشطين كل 5 دقائق
        setInterval(() => {
            this.stats.activeUsers.clear();
            this.metrics.activeUsers.set(0);
        }, 300000);
        
        // تحديث مقاييس النظام كل 30 ثانية
        setInterval(() => {
            this.updateSystemMetrics();
        }, 30000);
    }

    /**
     * تحديث مقاييس النظام
     */
    updateSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // تحديث اتصالات قاعدة البيانات
        if (this.database.pool) {
            this.metrics.dbConnections.set(this.database.pool.totalCount);
        }
    }

    /**
     * الحصول على معدل الأخطاء
     */
    getErrorRate() {
        return this.stats.requests > 0 ? this.stats.errors / this.stats.requests : 0;
    }

    /**
     * الحصول على وقت التشغيل
     */
    getUptime() {
        const uptimeMs = Date.now() - this.startTime;
        const uptimeSeconds = Math.floor(uptimeMs / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    /**
     * الحصول على إحصائيات سريعة
     */
    getQuickStats() {
        return {
            uptime: this.getUptime(),
            requests: this.stats.requests,
            errors: this.stats.errors,
            errorRate: (this.getErrorRate() * 100).toFixed(2) + '%',
            activeUsers: this.stats.activeUsers.size,
            systemHealth: this.stats.systemHealth,
            lastHealthCheck: this.stats.lastHealthCheck?.timestamp
        };
    }

    /**
     * إعداد endpoints للمراقبة
     */
    setupEndpoints(app) {
        // Add CORS headers for all monitoring endpoints
        app.use('/metrics', (req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
                return;
            }
            next();
        });

        app.use('/health', (req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
                return;
            }
            next();
        });

        app.use('/monitoring', (req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
                return;
            }
            next();
        });

        // endpoint للمقاييس
        app.get('/metrics', async (req, res) => {
            try {
                res.set('Content-Type', this.register.contentType);
                res.end(await this.register.metrics());
            } catch (error) {
                res.status(500).end(error.message);
            }
        });

        // endpoint لفحص الصحة
        app.get('/health', async (req, res) => {
            try {
                const health = await this.checkSystemHealth();
                const statusCode = health.status === 'healthy' ? 200 : 
                                 health.status === 'warning' ? 200 : 503;
                res.status(statusCode).json(health);
            } catch (error) {
                res.status(503).json({
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // endpoint للإحصائيات السريعة
        app.get('/stats', (req, res) => {
            res.json(this.getQuickStats());
        });

        // لوحة تحكم بسيطة
        app.get('/monitoring', (req, res) => {
            const stats = this.getQuickStats();
            const html = this.generateDashboardHTML(stats);
            res.send(html);
        });

        // إضافة endpoint للـ API stats
        app.get('/api/stats', (req, res) => {
            res.json(this.getQuickStats());
        });
    }

    /**
     * Generate simple admin monitoring dashboard
     */
    generateDashboardHTML(stats) {
        const systemMetrics = this.getSystemMetrics();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot Monitor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif; 
            background: #1a1a1a;
            color: #e0e0e0;
            padding: 20px;
            min-height: 100vh;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid #333;
        }
        .header h1 {
            color: #4CAF50;
            font-size: 1.8em;
            margin-bottom: 5px;
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .status-card { 
            background: #2d2d2d; 
            padding: 20px; 
            border-radius: 8px; 
            border: 1px solid #404040;
        }
        .status-card h3 {
            color: #4CAF50;
            margin-bottom: 15px;
            font-size: 1.1em;
        }
        .status-item { 
            display: flex; 
            justify-content: space-between; 
            margin: 10px 0; 
            padding: 8px 0;
            border-bottom: 1px solid #404040;
        }
        .status-item:last-child {
            border-bottom: none;
        }
        .status-label {
            color: #b0b0b0;
        }
        .status-value {
            color: #e0e0e0;
            font-weight: 500;
        }
        .status-healthy { color: #4CAF50; }
        .status-warning { color: #FF9800; }
        .status-unhealthy { color: #f44336; }
        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 5px;
        }
        .status-healthy .status-indicator { background: #4CAF50; }
        .status-warning .status-indicator { background: #FF9800; }
        .status-unhealthy .status-indicator { background: #f44336; }
        .progress-bar {
            width: 100%;
            height: 6px;
            background: #404040;
            border-radius: 3px;
            overflow: hidden;
            margin-top: 5px;
        }
        .progress-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.3s ease;
        }
        .progress-low { background: #4CAF50; }
        .progress-medium { background: #FF9800; }
        .progress-high { background: #f44336; }
        .refresh-btn { 
            background: #4CAF50;
            color: white; 
            padding: 12px 24px; 
            border: none; 
            border-radius: 6px; 
            cursor: pointer;
            font-size: 14px;
            display: block;
            margin: 20px auto;
            transition: background 0.3s ease;
        }
        .refresh-btn:hover {
            background: #45a049;
        }
        .timestamp {
            text-align: center;
            color: #888;
            font-size: 0.9em;
            margin-top: 20px;
        }
        @media (max-width: 600px) {
            .status-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Bot Monitor</h1>
            <p style="color: #888; font-size: 0.9em;">Admin Dashboard</p>
        </div>
        
        <div class="status-grid">
            <div class="status-card">
                <h3>System Status</h3>
                <div class="status-item">
                    <span class="status-label">Status:</span>
                    <span class="status-${stats.systemHealth || 'unknown'}">
                        <span class="status-indicator"></span>
                        ${stats.systemHealth === 'healthy' ? 'Healthy' : stats.systemHealth === 'warning' ? 'Warning' : stats.systemHealth === 'unhealthy' ? 'Unhealthy' : 'Unknown'}
                    </span>
                </div>
                <div class="status-item">
                    <span class="status-label">Uptime:</span>
                    <span class="status-value">${stats.uptime || '0 seconds'}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Last Check:</span>
                    <span class="status-value">${stats.lastHealthCheck || 'Never'}</span>
                </div>
            </div>

            <div class="status-card">
                <h3>CPU & Memory</h3>
                <div class="status-item">
                    <span class="status-label">CPU Usage:</span>
                    <span class="status-value">${systemMetrics.cpu.percent}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${systemMetrics.cpu.percent < 50 ? 'progress-low' : systemMetrics.cpu.percent < 80 ? 'progress-medium' : 'progress-high'}" 
                         style="width: ${systemMetrics.cpu.percent}%"></div>
                </div>
                <div class="status-item">
                    <span class="status-label">Load Average:</span>
                    <span class="status-value">${systemMetrics.cpu.loadAverage}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">System Memory:</span>
                    <span class="status-value">${systemMetrics.memory.systemUsage}% (${systemMetrics.system.usedMemory}/${systemMetrics.system.totalMemory} GB)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${systemMetrics.memory.systemUsage < 50 ? 'progress-low' : systemMetrics.memory.systemUsage < 80 ? 'progress-medium' : 'progress-high'}" 
                         style="width: ${systemMetrics.memory.systemUsage}%"></div>
                </div>
                <div class="status-item">
                    <span class="status-label">Process Memory:</span>
                    <span class="status-value">${systemMetrics.memory.processUsage}% (${systemMetrics.memory.rss} MB RSS)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${systemMetrics.memory.processUsage < 1 ? 'progress-low' : systemMetrics.memory.processUsage < 5 ? 'progress-medium' : 'progress-high'}" 
                         style="width: ${Math.max(systemMetrics.memory.processUsage * 10, 2)}%"></div>
                </div>
                <div class="status-item">
                    <span class="status-label">Heap Memory:</span>
                    <span class="status-value">${systemMetrics.memory.usage}% (${systemMetrics.memory.heapUsed}/${systemMetrics.memory.heapTotal} MB)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${systemMetrics.memory.usage < 50 ? 'progress-low' : systemMetrics.memory.usage < 80 ? 'progress-medium' : 'progress-high'}" 
                         style="width: ${systemMetrics.memory.usage}%"></div>
                </div>
            </div>

            <div class="status-card">
                <h3>Process Info</h3>
                <div class="status-item">
                    <span class="status-label">PID:</span>
                    <span class="status-value">${systemMetrics.process.pid}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Node Version:</span>
                    <span class="status-value">${systemMetrics.process.version}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Platform:</span>
                    <span class="status-value">${systemMetrics.process.platform} (${systemMetrics.process.arch})</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Process Uptime:</span>
                    <span class="status-value">${Math.floor(systemMetrics.process.uptime / 60)}m ${systemMetrics.process.uptime % 60}s</span>
                </div>
            </div>

            <div class="status-card">
                <h3>Statistics</h3>
                <div class="status-item">
                    <span class="status-label">Total Requests:</span>
                    <span class="status-value">${stats.requests || 0}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Total Errors:</span>
                    <span class="status-value">${stats.errors || 0}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Error Rate:</span>
                    <span class="status-value">${stats.errorRate || '0%'}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Active Users:</span>
                    <span class="status-value">${stats.activeUsers || 0}</span>
                </div>
            </div>

            <div class="status-card">
                <h3>Database & Cache</h3>
                <div class="status-item">
                    <span class="status-label">Database:</span>
                    <span class="status-value">Connected</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Redis:</span>
                    <span class="status-value">Connected</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Cache Hit Rate:</span>
                    <span class="status-value">N/A</span>
                </div>
            </div>
        </div>

        <button class="refresh-btn" onclick="location.reload()">Refresh</button>
        
        <div class="timestamp">
            Last updated: ${new Date().toLocaleString('en-US')}
        </div>
    </div>

    <script>
        // Auto refresh every minute
        setTimeout(() => {
            location.reload();
        }, 60000);
    </script>
</body>
</html>`;
    }

    /**
     * middleware للتلغرام
     */
    getTelegramMiddleware() {
        return async (ctx, next) => {
            const start = Date.now();
            let messageType = 'unknown';
            let status = 'success';

            try {
                if (ctx.message?.text) messageType = 'text';
                else if (ctx.callbackQuery) messageType = 'callback';
                else if (ctx.message) messageType = 'media';

                await next();
            } catch (error) {
                status = 'error';
                throw error;
            } finally {
                const duration = Date.now() - start;
                this.recordTelegramMessage(messageType, status, ctx.from?.id);
                
                if (duration > this.alertThresholds.responseTime) {
                    logger.warn('Slow Telegram response', { duration, messageType });
                }
            }
        };
    }

    /**
     * Alias for setupEndpoints to match the expected method name
     */
    initializeEndpoints(app) {
        return this.setupEndpoints(app);
    }

    /**
     * Utility method to mask sensitive RPC URLs
     */
    maskRpcUrl(url) {
        if (!url || typeof url !== 'string') return url;
        
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            
            // If there's an API key in the path, mask it
            if (pathParts.length > 1) {
                const lastPart = pathParts[pathParts.length - 1];
                if (lastPart.length > 10) {
                    pathParts[pathParts.length - 1] = lastPart.substring(0, 8) + '***' + lastPart.substring(lastPart.length - 4);
                }
            }
            
            urlObj.pathname = pathParts.join('/');
            return urlObj.toString();
        } catch (error) {
            // If URL parsing fails, just mask the middle part
            if (url.length > 20) {
                return url.substring(0, 15) + '***' + url.substring(url.length - 10);
            }
            return url;
        }
    }

    /**
     * Get system metrics including CPU, memory, and disk usage
     */
    getSystemMetrics() {
        const memUsage = process.memoryUsage();
        const os = require('os');
        const heapStats = v8.getHeapStatistics();
        
        // Get system memory info
        const totalSystemMemory = os.totalmem();
        const freeSystemMemory = os.freemem();
        const usedSystemMemory = totalSystemMemory - freeSystemMemory;
        
        // Calculate CPU percentage using load average (more accurate)
        const cpuPercent = this.calculateCpuPercent();
        
        return {
            memory: {
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 10) / 10, // 1 decimal place
                heapTotal: Math.round(heapStats.heap_size_limit / 1024 / 1024 * 10) / 10, // Use actual heap limit
                rss: Math.round(memUsage.rss / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024),
                // Fix: Show heap usage percentage based on actual heap limit
                usage: Math.round((memUsage.heapUsed / heapStats.heap_size_limit) * 100), // Heap usage based on limit
                systemUsage: Math.round((usedSystemMemory / totalSystemMemory) * 100), // System memory usage
                processUsage: Math.round((memUsage.rss / totalSystemMemory) * 100) // Process memory usage relative to system
            },
            cpu: {
                percent: cpuPercent,
                loadAverage: os.loadavg()[0].toFixed(2) // 1-minute load average
            },
            process: {
                pid: process.pid,
                uptime: Math.round(process.uptime()),
                version: process.version,
                platform: process.platform,
                arch: process.arch
            },
            system: {
                totalMemory: Math.round(totalSystemMemory / 1024 / 1024 / 1024), // GB
                freeMemory: Math.round(freeSystemMemory / 1024 / 1024 / 1024), // GB
                usedMemory: Math.round(usedSystemMemory / 1024 / 1024 / 1024) // GB
            }
        };
    }

    /**
     * Calculate CPU percentage using a more accurate method
     */
    calculateCpuPercent() {
        const os = require('os');
        const cpus = os.cpus();
        
        if (!this.lastCpuInfo) {
            this.lastCpuInfo = cpus;
            this.lastCpuTime = Date.now();
            return 0;
        }

        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastCpuTime;
        
        // Only calculate if enough time has passed
        if (timeDiff < 1000) {
            return this.lastCpuPercent || 0;
        }

        let totalIdle = 0;
        let totalTick = 0;
        let totalIdleDiff = 0;
        let totalTickDiff = 0;

        for (let i = 0; i < cpus.length; i++) {
            const cpu = cpus[i];
            const lastCpu = this.lastCpuInfo[i];

            const idle = cpu.times.idle;
            const total = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
            
            const lastIdle = lastCpu.times.idle;
            const lastTotal = lastCpu.times.user + lastCpu.times.nice + lastCpu.times.sys + lastCpu.times.idle + lastCpu.times.irq;

            totalIdle += idle;
            totalTick += total;
            totalIdleDiff += idle - lastIdle;
            totalTickDiff += total - lastTotal;
        }

        const cpuPercent = totalTickDiff > 0 ? Math.round(100 - (100 * totalIdleDiff / totalTickDiff)) : 0;
        
        this.lastCpuInfo = cpus;
        this.lastCpuTime = currentTime;
        this.lastCpuPercent = Math.max(0, Math.min(cpuPercent, 100)); // Ensure 0-100 range
        
        return this.lastCpuPercent;
    }

    /**
     * تنظيف الموارد
     */
    destroy() {
        // إيقاف المهام الدورية
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        if (this.metricsInterval) clearInterval(this.metricsInterval);
        
        logger.info('Simple Unified Monitoring System destroyed');
    }
}

module.exports = SimpleUnifiedMonitoring;