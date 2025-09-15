const EventEmitter = require('events');

class AlertManager extends EventEmitter {
    constructor(monitoring) {
        super();
        this.monitoring = monitoring;
        this.alerts = new Map();
        this.alertRules = new Map();
        this.notificationChannels = new Map();
        this.alertHistory = [];
        this.maxHistorySize = 1000;
        
        this.setupDefaultRules();
    }

    // Setup default alert rules
    setupDefaultRules() {
        // Critical system alerts
        this.addAlertRule('high_memory_usage', {
            condition: (metrics) => {
                const memUsage = process.memoryUsage();
                const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
                return heapUsagePercent > 90;
            },
            severity: 'critical',
            message: 'Memory usage critical (>90%)',
            cooldown: 300000, // 5 minutes
            actions: ['log', 'telegram']
        });

        this.addAlertRule('database_connection_failed', {
            condition: (metrics) => metrics.database_errors > 5,
            severity: 'critical',
            message: 'Multiple database connection failures detected',
            cooldown: 180000, // 3 minutes
            actions: ['log', 'telegram']
        });

        this.addAlertRule('redis_connection_failed', {
            condition: (metrics) => metrics.redis_errors > 3,
            severity: 'warning',
            message: 'Redis connection issues detected',
            cooldown: 300000, // 5 minutes
            actions: ['log']
        });

        this.addAlertRule('high_error_rate', {
            condition: (metrics) => {
                const errorRate = metrics.error_count / Math.max(metrics.total_requests, 1);
                return errorRate > 0.1; // 10% error rate
            },
            severity: 'warning',
            message: 'High error rate detected (>10%)',
            cooldown: 600000, // 10 minutes
            actions: ['log', 'telegram']
        });

        this.addAlertRule('trading_failures', {
            condition: (metrics) => metrics.trading_failures > 10,
            severity: 'warning',
            message: 'Multiple trading operation failures',
            cooldown: 900000, // 15 minutes
            actions: ['log']
        });

        this.addAlertRule('api_response_slow', {
            condition: (metrics) => metrics.avg_api_response_time > 10,
            severity: 'warning',
            message: 'External API response time degraded',
            cooldown: 600000, // 10 minutes
            actions: ['log']
        });
    }

    // Add alert rule
    addAlertRule(name, rule) {
        this.alertRules.set(name, {
            ...rule,
            lastTriggered: 0,
            triggerCount: 0
        });
    }

    // Add notification channel
    addNotificationChannel(name, channel) {
        this.notificationChannels.set(name, channel);
    }

    // Check all alert rules
    checkAlerts(metrics) {
        const currentTime = Date.now();
        
        for (const [ruleName, rule] of this.alertRules) {
            try {
                // Check if rule condition is met
                if (rule.condition(metrics)) {
                    // Check cooldown period
                    if (currentTime - rule.lastTriggered > rule.cooldown) {
                        this.triggerAlert(ruleName, rule, metrics);
                        rule.lastTriggered = currentTime;
                        rule.triggerCount++;
                    }
                }
            } catch (error) {
                this.monitoring.logError('Alert rule evaluation failed', error, { ruleName });
            }
        }
    }

    // Trigger an alert
    triggerAlert(ruleName, rule, metrics) {
        const alert = {
            id: this.generateAlertId(),
            ruleName,
            severity: rule.severity,
            message: rule.message,
            timestamp: new Date().toISOString(),
            metrics: this.sanitizeMetrics(metrics),
            status: 'firing'
        };

        // Store alert
        this.alerts.set(alert.id, alert);
        this.addToHistory(alert);

        // Execute actions
        this.executeAlertActions(alert, rule.actions);

        // Emit event
        this.emit('alert', alert);

        this.monitoring.logWarning(`Alert triggered: ${ruleName}`, { 
            alertId: alert.id,
            severity: rule.severity,
            message: rule.message
        });
    }

    // Execute alert actions
    executeAlertActions(alert, actions) {
        for (const action of actions) {
            try {
                switch (action) {
                    case 'log':
                        this.logAlert(alert);
                        break;
                    case 'telegram':
                        this.sendTelegramAlert(alert);
                        break;
                    case 'email':
                        this.sendEmailAlert(alert);
                        break;
                    case 'webhook':
                        this.sendWebhookAlert(alert);
                        break;
                    default:
                        // Custom notification channel
                        const channel = this.notificationChannels.get(action);
                        if (channel && typeof channel.send === 'function') {
                            channel.send(alert);
                        }
                }
            } catch (error) {
                this.monitoring.logError('Alert action failed', error, { 
                    alertId: alert.id, 
                    action 
                });
            }
        }
    }

    // Log alert
    logAlert(alert) {
        const logLevel = alert.severity === 'critical' ? 'error' : 'warn';
        this.monitoring[logLevel === 'error' ? 'logError' : 'logWarning'](
            `ALERT: ${alert.message}`, 
            { 
                alertId: alert.id,
                severity: alert.severity,
                ruleName: alert.ruleName
            }
        );
    }

    // Send Telegram alert (if admin chat configured)
    async sendTelegramAlert(alert) {
        // This would integrate with your Telegram bot to send admin alerts
        // Implementation depends on your bot setup
        const adminChatId = process.env.ADMIN_CHAT_ID;
        if (adminChatId && this.telegramBot) {
            const message = this.formatTelegramAlert(alert);
            try {
                await this.telegramBot.telegram.sendMessage(adminChatId, message, {
                    parse_mode: 'Markdown'
                });
            } catch (error) {
                this.monitoring.logError('Failed to send Telegram alert', error);
            }
        }
    }

    // Format Telegram alert message
    formatTelegramAlert(alert) {
        const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';
        return `${emoji} *ALERT: ${alert.severity.toUpperCase()}*

*Rule:* ${alert.ruleName}
*Message:* ${alert.message}
*Time:* ${alert.timestamp}
*ID:* \`${alert.id}\`

Please check the system status.`;
    }

    // Send email alert (placeholder)
    async sendEmailAlert(alert) {
        // Implement email notification
        // This would use nodemailer or similar
        console.log('Email alert would be sent:', alert);
    }

    // Send webhook alert (placeholder)
    async sendWebhookAlert(alert) {
        // Implement webhook notification
        // This would make HTTP POST to configured webhook URL
        console.log('Webhook alert would be sent:', alert);
    }

    // Resolve an alert
    resolveAlert(alertId, resolvedBy = 'system') {
        const alert = this.alerts.get(alertId);
        if (alert) {
            alert.status = 'resolved';
            alert.resolvedAt = new Date().toISOString();
            alert.resolvedBy = resolvedBy;
            
            this.emit('alertResolved', alert);
            this.monitoring.logInfo('Alert resolved', { alertId, resolvedBy });
        }
    }

    // Get active alerts
    getActiveAlerts() {
        return Array.from(this.alerts.values()).filter(alert => alert.status === 'firing');
    }

    // Get alert history
    getAlertHistory(limit = 50) {
        return this.alertHistory.slice(-limit);
    }

    // Get alert statistics
    getAlertStats() {
        const activeAlerts = this.getActiveAlerts();
        const totalAlerts = this.alerts.size;
        
        const severityCount = {
            critical: 0,
            warning: 0,
            info: 0
        };

        for (const alert of this.alerts.values()) {
            severityCount[alert.severity] = (severityCount[alert.severity] || 0) + 1;
        }

        return {
            active: activeAlerts.length,
            total: totalAlerts,
            severityCount,
            ruleStats: this.getRuleStats()
        };
    }

    // Get rule statistics
    getRuleStats() {
        const stats = {};
        for (const [ruleName, rule] of this.alertRules) {
            stats[ruleName] = {
                triggerCount: rule.triggerCount,
                lastTriggered: rule.lastTriggered
            };
        }
        return stats;
    }

    // Helper methods
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    sanitizeMetrics(metrics) {
        // Remove sensitive data from metrics before storing
        const sanitized = { ...metrics };
        delete sanitized.sensitive_data;
        return sanitized;
    }

    addToHistory(alert) {
        this.alertHistory.push(alert);
        if (this.alertHistory.length > this.maxHistorySize) {
            this.alertHistory.shift();
        }
    }

    // Set Telegram bot instance for admin notifications
    setTelegramBot(bot) {
        this.telegramBot = bot;
    }

    // Cleanup old alerts
    cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
        const cutoff = Date.now() - maxAge;
        
        for (const [alertId, alert] of this.alerts) {
            const alertTime = new Date(alert.timestamp).getTime();
            if (alertTime < cutoff && alert.status === 'resolved') {
                this.alerts.delete(alertId);
            }
        }
    }

    // Start periodic cleanup
    startCleanup(intervalMs = 60 * 60 * 1000) { // 1 hour
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, intervalMs);
    }

    // Stop cleanup
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

module.exports = AlertManager;
