// Health check server for Area51 Bot monitoring
const express = require('express');
const MonitoringSystem = require('./monitoring');

class HealthCheckServer {
    constructor(monitoringSystem, port = 3001) {
        this.app = express();
        this.monitoring = monitoringSystem;
        this.port = port;
        this.setupRoutes();
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', async (req, res) => {
            try {
                const health = await this.monitoring.getHealthStatus();
                res.status(200).json(health);
            } catch (error) {
                res.status(500).json({
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Metrics endpoint for Prometheus
        this.app.get('/metrics', async (req, res) => {
            try {
                const metrics = await this.monitoring.getMetrics();
                res.set('Content-Type', 'text/plain');
                res.send(metrics);
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to collect metrics',
                    message: error.message
                });
            }
        });

        // Ready endpoint
        this.app.get('/ready', (req, res) => {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date().toISOString()
            });
        });

        // Live endpoint
        this.app.get('/live', (req, res) => {
            res.status(200).json({
                status: 'alive',
                timestamp: new Date().toISOString()
            });
        });
    }

    start() {
        this.server = this.app.listen(this.port, () => {

        });
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}

module.exports = HealthCheckServer;
