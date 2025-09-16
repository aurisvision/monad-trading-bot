/**
 * Redis Cluster Development Setup Script
 * Sets up multiple Redis instances for local development
 * Simulates production cluster environment
 */

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class RedisClusterDevSetup {
    constructor() {
        this.isWindows = os.platform() === 'win32';
        this.redisDir = path.join(__dirname, '..', 'redis-dev');
        this.instances = [
            {
                name: 'master',
                port: 6379,
                role: 'master',
                config: {
                    save: '900 1 300 10 60 10000',
                    appendonly: 'yes',
                    appendfsync: 'everysec',
                    maxmemory: '512mb',
                    'maxmemory-policy': 'allkeys-lru'
                }
            },
            {
                name: 'replica',
                port: 6380,
                role: 'replica',
                config: {
                    'replicaof': '127.0.0.1 6379',
                    'replica-read-only': 'yes',
                    'replica-serve-stale-data': 'yes',
                    maxmemory: '512mb',
                    'maxmemory-policy': 'allkeys-lru'
                }
            },
            {
                name: 'cache',
                port: 6381,
                role: 'cache',
                config: {
                    save: '',
                    appendonly: 'no',
                    maxmemory: '256mb',
                    'maxmemory-policy': 'volatile-lru',
                    'tcp-nodelay': 'yes',
                    'lazyfree-lazy-eviction': 'yes'
                }
            }
        ];
        
        this.processes = new Map();
    }

    /**
     * Check if Redis is installed
     */
    async checkRedisInstallation() {
        return new Promise((resolve) => {
            const command = this.isWindows ? 'redis-server --version' : 'redis-server --version';
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.log('❌ Redis not found. Please install Redis first.');
                    if (this.isWindows) {
                        console.log('💡 Windows: Download from https://github.com/microsoftarchive/redis/releases');
                        console.log('💡 Or use: choco install redis-64');
                    } else {
                        console.log('💡 Ubuntu/Debian: sudo apt install redis-server');
                        console.log('💡 macOS: brew install redis');
                    }
                    resolve(false);
                } else {
                    console.log('✅ Redis found:', stdout.trim());
                    resolve(true);
                }
            });
        });
    }

    /**
     * Create directory structure
     */
    async createDirectories() {
        try {
            await fs.mkdir(this.redisDir, { recursive: true });
            
            for (const instance of this.instances) {
                const instanceDir = path.join(this.redisDir, instance.name);
                await fs.mkdir(instanceDir, { recursive: true });
                await fs.mkdir(path.join(instanceDir, 'data'), { recursive: true });
                await fs.mkdir(path.join(instanceDir, 'logs'), { recursive: true });
            }
            
            console.log('✅ Directory structure created');
        } catch (error) {
            console.error('❌ Failed to create directories:', error.message);
            throw error;
        }
    }

    /**
     * Generate Redis configuration files
     */
    async generateConfigs() {
        for (const instance of this.instances) {
            const configPath = path.join(this.redisDir, instance.name, 'redis.conf');
            
            const baseConfig = {
                port: instance.port,
                bind: '127.0.0.1',
                dir: path.join(this.redisDir, instance.name, 'data'),
                logfile: path.join(this.redisDir, instance.name, 'logs', 'redis.log'),
                pidfile: path.join(this.redisDir, instance.name, `redis-${instance.port}.pid`),
                databases: 16,
                timeout: 0,
                'tcp-keepalive': 300,
                'tcp-backlog': 511,
                loglevel: 'notice',
                ...instance.config
            };

            const configContent = Object.entries(baseConfig)
                .map(([key, value]) => `${key} ${value}`)
                .join('\n');

            await fs.writeFile(configPath, configContent);
            console.log(`✅ Config generated for ${instance.name} (port ${instance.port})`);
        }
    }

    /**
     * Start Redis instance
     */
    async startInstance(instance) {
        return new Promise((resolve, reject) => {
            const configPath = path.join(this.redisDir, instance.name, 'redis.conf');
            const command = this.isWindows ? 'redis-server.exe' : 'redis-server';
            
            console.log(`🚀 Starting ${instance.name} on port ${instance.port}...`);
            
            const process = spawn(command, [configPath], {
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: !this.isWindows
            });

            process.stdout.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Ready to accept connections')) {
                    console.log(`✅ ${instance.name} started successfully on port ${instance.port}`);
                    resolve(process);
                }
            });

            process.stderr.on('data', (data) => {
                console.log(`⚠️ ${instance.name} stderr:`, data.toString());
            });

            process.on('error', (error) => {
                console.error(`❌ Failed to start ${instance.name}:`, error.message);
                reject(error);
            });

            process.on('exit', (code) => {
                console.log(`📴 ${instance.name} exited with code ${code}`);
                this.processes.delete(instance.name);
            });

            // Timeout for startup
            setTimeout(() => {
                if (!this.processes.has(instance.name)) {
                    reject(new Error(`${instance.name} startup timeout`));
                }
            }, 10000);

            this.processes.set(instance.name, process);
        });
    }

    /**
     * Start all Redis instances
     */
    async startCluster() {
        console.log('🏗️ Starting Redis Cluster for Development...\n');

        try {
            // Start master first
            const masterInstance = this.instances.find(i => i.role === 'master');
            await this.startInstance(masterInstance);
            
            // Wait a bit for master to be fully ready
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Start replica and cache in parallel
            const otherInstances = this.instances.filter(i => i.role !== 'master');
            await Promise.all(otherInstances.map(instance => this.startInstance(instance)));
            
            console.log('\n🎉 Redis Cluster started successfully!');
            console.log('\n📊 Cluster Status:');
            console.log(`   Master:  127.0.0.1:6379 (Primary writes)`);
            console.log(`   Replica: 127.0.0.1:6380 (Read operations)`);
            console.log(`   Cache:   127.0.0.1:6381 (Temporary data)`);
            
            console.log('\n🔧 Configuration:');
            console.log(`   Data directory: ${this.redisDir}`);
            console.log(`   Logs directory: ${this.redisDir}/*/logs/`);
            
            console.log('\n⚡ Ready for Area51 Bot development!');
            console.log('   Run: npm start');
            
        } catch (error) {
            console.error('❌ Failed to start cluster:', error.message);
            await this.stopCluster();
            throw error;
        }
    }

    /**
     * Stop all Redis instances
     */
    async stopCluster() {
        console.log('🛑 Stopping Redis Cluster...');
        
        for (const [name, process] of this.processes) {
            try {
                console.log(`📴 Stopping ${name}...`);
                
                if (this.isWindows) {
                    process.kill('SIGTERM');
                } else {
                    process.kill('SIGTERM');
                }
                
                await new Promise(resolve => {
                    process.on('exit', resolve);
                    setTimeout(resolve, 5000); // Force timeout
                });
                
            } catch (error) {
                console.error(`⚠️ Error stopping ${name}:`, error.message);
            }
        }
        
        this.processes.clear();
        console.log('✅ Redis Cluster stopped');
    }

    /**
     * Check cluster status
     */
    async checkStatus() {
        const Redis = require('ioredis');
        console.log('🔍 Checking Redis Cluster Status...\n');
        
        for (const instance of this.instances) {
            try {
                const redis = new Redis({
                    port: instance.port,
                    host: '127.0.0.1',
                    connectTimeout: 3000,
                    lazyConnect: true
                });
                
                await redis.ping();
                const info = await redis.info('replication');
                const memory = await redis.info('memory');
                
                console.log(`✅ ${instance.name.toUpperCase()} (${instance.port}):`);
                console.log(`   Status: Connected`);
                console.log(`   Role: ${info.match(/role:(\w+)/)?.[1] || 'unknown'}`);
                console.log(`   Memory: ${memory.match(/used_memory_human:([^\r\n]+)/)?.[1] || 'unknown'}`);
                
                if (instance.role === 'replica') {
                    const connected = info.includes('master_link_status:up');
                    console.log(`   Replication: ${connected ? '✅ Connected' : '❌ Disconnected'}`);
                }
                
                console.log('');
                await redis.disconnect();
                
            } catch (error) {
                console.log(`❌ ${instance.name.toUpperCase()} (${instance.port}): ${error.message}\n`);
            }
        }
    }

    /**
     * Clean up development environment
     */
    async cleanup() {
        console.log('🧹 Cleaning up Redis development environment...');
        
        try {
            await this.stopCluster();
            await fs.rm(this.redisDir, { recursive: true, force: true });
            console.log('✅ Cleanup completed');
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
        }
    }

    /**
     * Setup signal handlers for graceful shutdown
     */
    setupSignalHandlers() {
        const signals = ['SIGINT', 'SIGTERM'];
        
        signals.forEach(signal => {
            process.on(signal, async () => {
                console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
                await this.stopCluster();
                process.exit(0);
            });
        });
    }
}

// CLI Interface
async function main() {
    const setup = new RedisClusterDevSetup();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'start':
                const redisInstalled = await setup.checkRedisInstallation();
                if (!redisInstalled) process.exit(1);
                
                await setup.createDirectories();
                await setup.generateConfigs();
                setup.setupSignalHandlers();
                await setup.startCluster();
                
                // Keep process running
                process.stdin.resume();
                break;
                
            case 'stop':
                await setup.stopCluster();
                break;
                
            case 'status':
                await setup.checkStatus();
                break;
                
            case 'cleanup':
                await setup.cleanup();
                break;
                
            default:
                console.log('🏗️ Redis Cluster Development Setup');
                console.log('');
                console.log('Usage:');
                console.log('  node scripts/setup-redis-cluster-dev.js start   - Start cluster');
                console.log('  node scripts/setup-redis-cluster-dev.js stop    - Stop cluster');
                console.log('  node scripts/setup-redis-cluster-dev.js status  - Check status');
                console.log('  node scripts/setup-redis-cluster-dev.js cleanup - Clean up');
                console.log('');
                console.log('Example:');
                console.log('  node scripts/setup-redis-cluster-dev.js start');
                break;
        }
    } catch (error) {
        console.error('❌ Operation failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = RedisClusterDevSetup;
