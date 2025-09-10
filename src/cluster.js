// Cluster manager for horizontal scaling - supports 10,000+ users
const cluster = require('cluster');
const os = require('os');

const numCPUs = os.cpus().length;
const maxWorkers = process.env.MAX_WORKERS || Math.min(numCPUs, 8);

if (cluster.isMaster) {
    console.log(`🚀 Master process ${process.pid} starting...`);
    console.log(`📊 Spawning ${maxWorkers} worker processes`);
    
    // Fork workers
    for (let i = 0; i < maxWorkers; i++) {
        const worker = cluster.fork();
        console.log(`👷 Worker ${worker.process.pid} started`);
    }
    
    // Handle worker crashes
    cluster.on('exit', (worker, code, signal) => {
        console.log(`💥 Worker ${worker.process.pid} died (${signal || code})`);
        console.log('🔄 Spawning new worker...');
        cluster.fork();
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('📴 Master received SIGTERM, shutting down workers...');
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
    });
    
} else {
    // Worker process - run the bot
    require('./index-scalable.js');
    console.log(`👷 Worker ${process.pid} ready for connections`);
}
