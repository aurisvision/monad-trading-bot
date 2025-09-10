// Load balancer and request distribution for Area51 Bot
const EventEmitter = require('events');

class LoadBalancer extends EventEmitter {
    constructor(monitoring) {
        super();
        this.monitoring = monitoring;
        this.workers = new Map();
        this.requestQueue = [];
        this.roundRobinIndex = 0;
        this.healthCheckInterval = 30000; // 30 seconds
        this.maxQueueSize = 1000;
        
        this.startHealthChecks();
    }

    registerWorker(workerId, workerProcess) {
        this.workers.set(workerId, {
            id: workerId,
            process: workerProcess,
            healthy: true,
            load: 0,
            lastHealthCheck: Date.now(),
            requestCount: 0,
            errorCount: 0
        });
        
        this.monitoring.logInfo('Worker registered', { workerId });
        
        // Listen for worker messages
        workerProcess.on('message', (message) => {
            this.handleWorkerMessage(workerId, message);
        });
        
        workerProcess.on('exit', () => {
            this.unregisterWorker(workerId);
        });
    }

    unregisterWorker(workerId) {
        if (this.workers.has(workerId)) {
            this.workers.delete(workerId);
            this.monitoring.logWarn('Worker unregistered', { workerId });
        }
    }

    handleWorkerMessage(workerId, message) {
        const worker = this.workers.get(workerId);
        if (!worker) return;

        switch (message.type) {
            case 'health':
                worker.healthy = message.healthy;
                worker.load = message.load;
                worker.lastHealthCheck = Date.now();
                break;
            
            case 'request_complete':
                worker.load = Math.max(0, worker.load - 1);
                worker.requestCount++;
                break;
            
            case 'error':
                worker.errorCount++;
                this.monitoring.logError('Worker error reported', null, {
                    workerId,
                    error: message.error
                });
                break;
        }
    }

    getHealthyWorkers() {
        const now = Date.now();
        return Array.from(this.workers.values()).filter(worker => 
            worker.healthy && 
            (now - worker.lastHealthCheck) < this.healthCheckInterval * 2
        );
    }

    selectWorker(strategy = 'round_robin') {
        const healthyWorkers = this.getHealthyWorkers();
        
        if (healthyWorkers.length === 0) {
            throw new Error('No healthy workers available');
        }

        switch (strategy) {
            case 'round_robin':
                return this.selectRoundRobin(healthyWorkers);
            
            case 'least_connections':
                return this.selectLeastConnections(healthyWorkers);
            
            case 'least_response_time':
                return this.selectLeastResponseTime(healthyWorkers);
            
            default:
                return this.selectRoundRobin(healthyWorkers);
        }
    }

    selectRoundRobin(workers) {
        const worker = workers[this.roundRobinIndex % workers.length];
        this.roundRobinIndex++;
        return worker;
    }

    selectLeastConnections(workers) {
        return workers.reduce((min, worker) => 
            worker.load < min.load ? worker : min
        );
    }

    selectLeastResponseTime(workers) {
        // For now, use least connections as proxy for response time
        return this.selectLeastConnections(workers);
    }

    async distributeRequest(request) {
        try {
            const worker = this.selectWorker('least_connections');
            
            // Increment worker load
            worker.load++;
            
            // Send request to worker
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Request timeout'));
                }, 30000); // 30 second timeout
                
                const messageHandler = (message) => {
                    if (message.requestId === request.id) {
                        clearTimeout(timeout);
                        worker.process.removeListener('message', messageHandler);
                        
                        if (message.error) {
                            reject(new Error(message.error));
                        } else {
                            resolve(message.result);
                        }
                    }
                };
                
                worker.process.on('message', messageHandler);
                worker.process.send({
                    type: 'request',
                    requestId: request.id,
                    data: request.data
                });
            });
            
        } catch (error) {
            this.monitoring.logError('Request distribution failed', error, {
                requestId: request.id
            });
            throw error;
        }
    }

    async queueRequest(requestData) {
        if (this.requestQueue.length >= this.maxQueueSize) {
            throw new Error('Request queue full');
        }
        
        const request = {
            id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            data: requestData,
            timestamp: Date.now()
        };
        
        this.requestQueue.push(request);
        this.processQueue();
        
        return request.id;
    }

    async processQueue() {
        while (this.requestQueue.length > 0) {
            const healthyWorkers = this.getHealthyWorkers();
            
            if (healthyWorkers.length === 0) {
                this.monitoring.logWarn('No healthy workers, pausing queue processing');
                break;
            }
            
            const request = this.requestQueue.shift();
            
            try {
                await this.distributeRequest(request);
            } catch (error) {
                this.monitoring.logError('Queue request processing failed', error, {
                    requestId: request.id
                });
                
                // Re-queue request if it's not too old (5 minutes)
                if (Date.now() - request.timestamp < 300000) {
                    this.requestQueue.unshift(request);
                }
            }
        }
    }

    startHealthChecks() {
        setInterval(() => {
            this.performHealthChecks();
        }, this.healthCheckInterval);
    }

    performHealthChecks() {
        for (const [workerId, worker] of this.workers) {
            const timeSinceLastCheck = Date.now() - worker.lastHealthCheck;
            
            if (timeSinceLastCheck > this.healthCheckInterval * 2) {
                worker.healthy = false;
                this.monitoring.logWarn('Worker marked unhealthy due to missed health check', {
                    workerId,
                    timeSinceLastCheck
                });
            }
            
            // Request health status
            worker.process.send({ type: 'health_check' });
        }
    }

    getStats() {
        const workers = Array.from(this.workers.values());
        const healthyCount = this.getHealthyWorkers().length;
        
        return {
            totalWorkers: workers.length,
            healthyWorkers: healthyCount,
            queueLength: this.requestQueue.length,
            totalRequests: workers.reduce((sum, w) => sum + w.requestCount, 0),
            totalErrors: workers.reduce((sum, w) => sum + w.errorCount, 0),
            averageLoad: workers.length > 0 ? 
                workers.reduce((sum, w) => sum + w.load, 0) / workers.length : 0
        };
    }

    async gracefulShutdown() {
        this.monitoring.logInfo('Load balancer shutting down gracefully');
        
        // Stop accepting new requests
        this.requestQueue = [];
        
        // Wait for current requests to complete
        const maxWaitTime = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            const totalLoad = Array.from(this.workers.values())
                .reduce((sum, worker) => sum + worker.load, 0);
            
            if (totalLoad === 0) break;
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Terminate all workers
        for (const [workerId, worker] of this.workers) {
            worker.process.kill('SIGTERM');
        }
        
        this.monitoring.logInfo('Load balancer shutdown complete');
    }
}

class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000; // 1 minute
        this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
        
        this.monitoring = options.monitoring;
    }

    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
                this.monitoring?.logInfo('Circuit breaker transitioning to HALF_OPEN');
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await operation();
            
            if (this.state === 'HALF_OPEN') {
                this.successCount++;
                if (this.successCount >= 3) {
                    this.reset();
                }
            } else {
                this.reset();
            }
            
            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }

    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            this.monitoring?.logWarn('Circuit breaker opened due to failures', {
                failureCount: this.failureCount,
                threshold: this.failureThreshold
            });
        }
    }

    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
        
        this.monitoring?.logInfo('Circuit breaker reset to CLOSED state');
    }

    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
            successCount: this.successCount
        };
    }
}

module.exports = {
    LoadBalancer,
    CircuitBreaker
};
