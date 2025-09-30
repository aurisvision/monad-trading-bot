/**
 * Handler Performance Monitor
 * Monitors and compares performance between old and new handlers
 * 
 * SAFETY: This system provides detailed performance metrics to ensure
 * new handlers perform better than or equal to old handlers
 */

class HandlerPerformanceMonitor {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.monitoring = dependencies.monitoring;
        this.cacheService = dependencies.cacheService;
        
        // Performance metrics storage
        this.metrics = {
            old: {
                navigation: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 },
                wallet: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 },
                trading: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 }
            },
            new: {
                navigation: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 },
                wallet: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 },
                trading: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 }
            }
        };
        
        // Detailed performance data
        this.detailedMetrics = {
            old: { navigation: [], wallet: [], trading: [] },
            new: { navigation: [], wallet: [], trading: [] }
        };
        
        // Performance thresholds
        this.thresholds = {
            maxResponseTime: 5000, // 5 seconds
            maxErrorRate: 0.05, // 5%
            minSuccessRate: 0.95, // 95%
            performanceRegressionThreshold: 1.2 // 20% slower is considered regression
        };
        
        // Monitoring configuration
        this.config = {
            enabled: true,
            detailedLogging: false,
            maxDetailedEntries: 1000,
            reportInterval: 300000, // 5 minutes
            alertThresholds: {
                errorRate: 0.1, // 10%
                responseTime: 3000, // 3 seconds
                performanceRegression: 1.5 // 50% slower
            }
        };
        
        // Start periodic reporting
        this.startPeriodicReporting();
        
        this.logInfo('HandlerPerformanceMonitor initialized');
    }

    /**
     * Record handler execution metrics
     */
    recordExecution(handlerType, handlerVersion, action, startTime, endTime, success, error = null) {
        try {
            const duration = endTime - startTime;
            const timestamp = new Date().toISOString();
            
            // Update basic metrics
            const metrics = this.metrics[handlerVersion][handlerType];
            metrics.calls++;
            metrics.totalTime += duration;
            if (!success) {
                metrics.errors++;
            }
            metrics.avgResponseTime = metrics.totalTime / metrics.calls;
            
            // Store detailed metrics
            const detailedEntry = {
                action,
                duration,
                success,
                error: error?.message || null,
                timestamp,
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage()
            };
            
            const detailedMetrics = this.detailedMetrics[handlerVersion][handlerType];
            detailedMetrics.push(detailedEntry);
            
            // Limit detailed entries to prevent memory issues
            if (detailedMetrics.length > this.config.maxDetailedEntries) {
                detailedMetrics.shift();
            }
            
            // Check for performance alerts
            this.checkPerformanceAlerts(handlerType, handlerVersion, duration, success);
            
            // Log detailed execution if enabled
            if (this.config.detailedLogging) {
                this.logInfo('Handler execution recorded', {
                    handlerType,
                    handlerVersion,
                    action,
                    duration,
                    success,
                    error: error?.message
                });
            }
            
        } catch (recordError) {
            this.logError('Failed to record execution metrics', {
                handlerType,
                handlerVersion,
                action,
                error: recordError.message
            });
        }
    }

    /**
     * Check for performance alerts
     */
    checkPerformanceAlerts(handlerType, handlerVersion, duration, success) {
        try {
            // Check response time alert
            if (duration > this.config.alertThresholds.responseTime) {
                this.triggerAlert('slow_response', {
                    handlerType,
                    handlerVersion,
                    duration,
                    threshold: this.config.alertThresholds.responseTime
                });
            }
            
            // Check error rate alert
            const metrics = this.metrics[handlerVersion][handlerType];
            const errorRate = metrics.errors / metrics.calls;
            
            if (errorRate > this.config.alertThresholds.errorRate) {
                this.triggerAlert('high_error_rate', {
                    handlerType,
                    handlerVersion,
                    errorRate,
                    threshold: this.config.alertThresholds.errorRate
                });
            }
            
            // Check performance regression (only for new handlers)
            if (handlerVersion === 'new') {
                this.checkPerformanceRegression(handlerType);
            }
            
        } catch (error) {
            this.logError('Failed to check performance alerts', {
                handlerType,
                handlerVersion,
                error: error.message
            });
        }
    }

    /**
     * Check for performance regression
     */
    checkPerformanceRegression(handlerType) {
        try {
            const oldMetrics = this.metrics.old[handlerType];
            const newMetrics = this.metrics.new[handlerType];
            
            // Need sufficient data for comparison
            if (oldMetrics.calls < 10 || newMetrics.calls < 10) {
                return;
            }
            
            const performanceRatio = newMetrics.avgResponseTime / oldMetrics.avgResponseTime;
            
            if (performanceRatio > this.config.alertThresholds.performanceRegression) {
                this.triggerAlert('performance_regression', {
                    handlerType,
                    oldAvgTime: oldMetrics.avgResponseTime,
                    newAvgTime: newMetrics.avgResponseTime,
                    regressionRatio: performanceRatio,
                    threshold: this.config.alertThresholds.performanceRegression
                });
            }
            
        } catch (error) {
            this.logError('Failed to check performance regression', {
                handlerType,
                error: error.message
            });
        }
    }

    /**
     * Trigger performance alert
     */
    triggerAlert(alertType, data) {
        const alert = {
            type: alertType,
            severity: this.getAlertSeverity(alertType),
            data,
            timestamp: new Date().toISOString()
        };
        
        this.logWarn(`Performance alert: ${alertType}`, alert);
        
        // Send alert to monitoring system
        if (this.monitoring?.sendAlert) {
            this.monitoring.sendAlert(alert);
        }
    }

    /**
     * Get alert severity level
     */
    getAlertSeverity(alertType) {
        const severityMap = {
            slow_response: 'medium',
            high_error_rate: 'high',
            performance_regression: 'high'
        };
        
        return severityMap[alertType] || 'low';
    }

    /**
     * Get comprehensive performance comparison
     */
    getPerformanceComparison() {
        try {
            const comparison = {
                summary: {},
                detailed: {},
                recommendations: [],
                timestamp: new Date().toISOString()
            };
            
            // Generate summary comparison
            Object.keys(this.metrics.old).forEach(handlerType => {
                const oldMetrics = this.metrics.old[handlerType];
                const newMetrics = this.metrics.new[handlerType];
                
                comparison.summary[handlerType] = {
                    old: { ...oldMetrics },
                    new: { ...newMetrics },
                    improvement: this.calculateImprovement(oldMetrics, newMetrics),
                    status: this.getComparisonStatus(oldMetrics, newMetrics)
                };
            });
            
            // Generate detailed analysis
            comparison.detailed = this.generateDetailedAnalysis();
            
            // Generate recommendations
            comparison.recommendations = this.generateRecommendations();
            
            return comparison;
            
        } catch (error) {
            this.logError('Failed to generate performance comparison', {
                error: error.message
            });
            
            return {
                error: 'Failed to generate comparison',
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Calculate performance improvement
     */
    calculateImprovement(oldMetrics, newMetrics) {
        if (oldMetrics.calls === 0 || newMetrics.calls === 0) {
            return { status: 'insufficient_data' };
        }
        
        const responseTimeImprovement = oldMetrics.avgResponseTime > 0 ? 
            ((oldMetrics.avgResponseTime - newMetrics.avgResponseTime) / oldMetrics.avgResponseTime) * 100 : 0;
        
        const errorRateOld = oldMetrics.errors / oldMetrics.calls;
        const errorRateNew = newMetrics.errors / newMetrics.calls;
        const errorRateImprovement = errorRateOld > 0 ? 
            ((errorRateOld - errorRateNew) / errorRateOld) * 100 : 0;
        
        return {
            responseTime: {
                improvement: Math.round(responseTimeImprovement * 100) / 100,
                status: responseTimeImprovement > 0 ? 'improved' : 'regressed'
            },
            errorRate: {
                improvement: Math.round(errorRateImprovement * 100) / 100,
                status: errorRateImprovement > 0 ? 'improved' : 'regressed'
            },
            overall: this.getOverallImprovement(responseTimeImprovement, errorRateImprovement)
        };
    }

    /**
     * Get overall improvement status
     */
    getOverallImprovement(responseTimeImprovement, errorRateImprovement) {
        const avgImprovement = (responseTimeImprovement + errorRateImprovement) / 2;
        
        if (avgImprovement > 10) {
            return { status: 'significant_improvement', score: avgImprovement };
        } else if (avgImprovement > 0) {
            return { status: 'minor_improvement', score: avgImprovement };
        } else if (avgImprovement > -10) {
            return { status: 'minor_regression', score: avgImprovement };
        } else {
            return { status: 'significant_regression', score: avgImprovement };
        }
    }

    /**
     * Get comparison status
     */
    getComparisonStatus(oldMetrics, newMetrics) {
        if (oldMetrics.calls === 0 || newMetrics.calls === 0) {
            return 'insufficient_data';
        }
        
        const responseTimeRatio = newMetrics.avgResponseTime / oldMetrics.avgResponseTime;
        const errorRateOld = oldMetrics.errors / oldMetrics.calls;
        const errorRateNew = newMetrics.errors / newMetrics.calls;
        
        // Check for significant regression
        if (responseTimeRatio > this.thresholds.performanceRegressionThreshold || 
            errorRateNew > errorRateOld * 2) {
            return 'regression_detected';
        }
        
        // Check for improvement
        if (responseTimeRatio < 0.9 && errorRateNew <= errorRateOld) {
            return 'improvement_detected';
        }
        
        // Check for acceptable performance
        if (responseTimeRatio <= 1.1 && errorRateNew <= errorRateOld * 1.1) {
            return 'acceptable_performance';
        }
        
        return 'needs_investigation';
    }

    /**
     * Generate detailed analysis
     */
    generateDetailedAnalysis() {
        const analysis = {};
        
        Object.keys(this.detailedMetrics.old).forEach(handlerType => {
            const oldData = this.detailedMetrics.old[handlerType];
            const newData = this.detailedMetrics.new[handlerType];
            
            analysis[handlerType] = {
                old: this.analyzeDetailedData(oldData),
                new: this.analyzeDetailedData(newData),
                comparison: this.compareDetailedData(oldData, newData)
            };
        });
        
        return analysis;
    }

    /**
     * Analyze detailed performance data
     */
    analyzeDetailedData(data) {
        if (data.length === 0) {
            return { status: 'no_data' };
        }
        
        const durations = data.map(entry => entry.duration);
        const successCount = data.filter(entry => entry.success).length;
        
        return {
            totalCalls: data.length,
            successRate: successCount / data.length,
            avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            p95Duration: this.calculatePercentile(durations, 95),
            p99Duration: this.calculatePercentile(durations, 99),
            errorCount: data.length - successCount,
            recentTrend: this.calculateTrend(durations.slice(-10))
        };
    }

    /**
     * Calculate percentile
     */
    calculatePercentile(values, percentile) {
        const sorted = values.slice().sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index] || 0;
    }

    /**
     * Calculate trend
     */
    calculateTrend(values) {
        if (values.length < 2) {
            return 'insufficient_data';
        }
        
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        
        const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;
        
        const change = ((secondAvg - firstAvg) / firstAvg) * 100;
        
        if (change > 10) return 'degrading';
        if (change < -10) return 'improving';
        return 'stable';
    }

    /**
     * Compare detailed data between old and new handlers
     */
    compareDetailedData(oldData, newData) {
        const oldAnalysis = this.analyzeDetailedData(oldData);
        const newAnalysis = this.analyzeDetailedData(newData);
        
        if (oldAnalysis.status === 'no_data' || newAnalysis.status === 'no_data') {
            return { status: 'insufficient_data' };
        }
        
        return {
            avgDurationChange: ((newAnalysis.avgDuration - oldAnalysis.avgDuration) / oldAnalysis.avgDuration) * 100,
            successRateChange: (newAnalysis.successRate - oldAnalysis.successRate) * 100,
            p95DurationChange: ((newAnalysis.p95Duration - oldAnalysis.p95Duration) / oldAnalysis.p95Duration) * 100,
            errorCountChange: newAnalysis.errorCount - oldAnalysis.errorCount,
            overallAssessment: this.getOverallAssessment(oldAnalysis, newAnalysis)
        };
    }

    /**
     * Get overall assessment
     */
    getOverallAssessment(oldAnalysis, newAnalysis) {
        const factors = [];
        
        // Response time factor
        const avgTimeChange = ((newAnalysis.avgDuration - oldAnalysis.avgDuration) / oldAnalysis.avgDuration) * 100;
        if (avgTimeChange < -10) factors.push('faster');
        else if (avgTimeChange > 20) factors.push('slower');
        
        // Success rate factor
        const successRateChange = (newAnalysis.successRate - oldAnalysis.successRate) * 100;
        if (successRateChange > 5) factors.push('more_reliable');
        else if (successRateChange < -5) factors.push('less_reliable');
        
        // P95 factor
        const p95Change = ((newAnalysis.p95Duration - oldAnalysis.p95Duration) / oldAnalysis.p95Duration) * 100;
        if (p95Change < -10) factors.push('better_worst_case');
        else if (p95Change > 20) factors.push('worse_worst_case');
        
        if (factors.length === 0) return 'similar_performance';
        if (factors.every(f => ['faster', 'more_reliable', 'better_worst_case'].includes(f))) return 'significantly_better';
        if (factors.every(f => ['slower', 'less_reliable', 'worse_worst_case'].includes(f))) return 'significantly_worse';
        return 'mixed_results';
    }

    /**
     * Generate recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        const comparison = this.getPerformanceComparison();
        
        Object.entries(comparison.summary).forEach(([handlerType, data]) => {
            if (data.status === 'regression_detected') {
                recommendations.push({
                    type: 'critical',
                    handler: handlerType,
                    message: `Performance regression detected in ${handlerType} handler. Consider rollback or optimization.`,
                    action: 'investigate_regression'
                });
            } else if (data.status === 'improvement_detected') {
                recommendations.push({
                    type: 'positive',
                    handler: handlerType,
                    message: `Performance improvement detected in ${handlerType} handler. Ready for wider rollout.`,
                    action: 'expand_rollout'
                });
            } else if (data.status === 'needs_investigation') {
                recommendations.push({
                    type: 'warning',
                    handler: handlerType,
                    message: `${handlerType} handler performance needs investigation before full rollout.`,
                    action: 'investigate_performance'
                });
            }
        });
        
        return recommendations;
    }

    /**
     * Start periodic reporting
     */
    startPeriodicReporting() {
        if (this.reportInterval) {
            clearInterval(this.reportInterval);
        }
        
        this.reportInterval = setInterval(() => {
            this.generatePeriodicReport();
        }, this.config.reportInterval);
    }

    /**
     * Generate periodic performance report
     */
    generatePeriodicReport() {
        try {
            const report = {
                timestamp: new Date().toISOString(),
                metrics: { ...this.metrics },
                comparison: this.getPerformanceComparison(),
                systemHealth: this.getSystemHealth()
            };
            
            this.logInfo('Periodic performance report generated', {
                reportSummary: {
                    totalOldCalls: Object.values(this.metrics.old).reduce((sum, m) => sum + m.calls, 0),
                    totalNewCalls: Object.values(this.metrics.new).reduce((sum, m) => sum + m.calls, 0),
                    overallStatus: report.comparison.recommendations.length > 0 ? 'needs_attention' : 'healthy'
                }
            });
            
            // Cache the report
            if (this.cacheService) {
                this.cacheService.set('handler_performance_report', report, 300); // 5 minutes
            }
            
        } catch (error) {
            this.logError('Failed to generate periodic report', { error: error.message });
        }
    }

    /**
     * Get system health metrics
     */
    getSystemHealth() {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            memory: {
                rss: memoryUsage.rss,
                heapUsed: memoryUsage.heapUsed,
                heapTotal: memoryUsage.heapTotal,
                external: memoryUsage.external
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Reset all metrics
     */
    resetMetrics() {
        this.metrics = {
            old: {
                navigation: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 },
                wallet: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 },
                trading: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 }
            },
            new: {
                navigation: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 },
                wallet: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 },
                trading: { calls: 0, totalTime: 0, errors: 0, avgResponseTime: 0 }
            }
        };
        
        this.detailedMetrics = {
            old: { navigation: [], wallet: [], trading: [] },
            new: { navigation: [], wallet: [], trading: [] }
        };
        
        this.logInfo('Performance metrics reset');
    }

    /**
     * Cleanup and stop monitoring
     */
    cleanup() {
        if (this.reportInterval) {
            clearInterval(this.reportInterval);
            this.reportInterval = null;
        }
        
        this.logInfo('HandlerPerformanceMonitor cleanup completed');
    }

    /**
     * Logging helpers
     */
    logInfo(message, data = {}) {
        if (this.monitoring?.logInfo) {
            this.monitoring.logInfo(`[HandlerPerformanceMonitor] ${message}`, data);
        } else {
            console.log(`[HandlerPerformanceMonitor] ${message}`, data);
        }
    }

    logWarn(message, data = {}) {
        if (this.monitoring?.logWarn) {
            this.monitoring.logWarn(`[HandlerPerformanceMonitor] ${message}`, data);
        } else {
            console.warn(`[HandlerPerformanceMonitor] ${message}`, data);
        }
    }

    logError(message, data = {}) {
        if (this.monitoring?.logError) {
            this.monitoring.logError(`[HandlerPerformanceMonitor] ${message}`, data);
        } else {
            console.error(`[HandlerPerformanceMonitor] ${message}`, data);
        }
    }
}

module.exports = HandlerPerformanceMonitor;