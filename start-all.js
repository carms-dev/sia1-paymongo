const { spawn } = require('child_process');
const path = require('path');

const root = __dirname;
const services = [
    { name: 'product', file: 'services/product-service.js', port: '3001' },
    { name: 'order', file: 'services/order-service.js', port: '3002' },
    {
        name: 'payment',
        file: 'services/payment-service.js',
        port: '3003',
        extra: { ORDER_SERVICE_URL: 'http://127.0.0.1:3002' }
    },
    { name: 'website', file: 'server.js', port: process.env.PORT || '3000' }
];

const children = new Map();
let shuttingDown = false;

function stopAll(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children.values()) {
        if (child.exitCode === null) child.kill();
    }
    setTimeout(() => process.exit(exitCode), 1000).unref();
}

function startService(service) {
    const child = spawn(process.execPath, [path.join(root, service.file)], {
        cwd: root,
        env: {
            ...process.env,
            ...service.extra,
            PORT: service.port,
            PRODUCT_SERVICE_URL: process.env.PRODUCT_SERVICE_URL || 'http://127.0.0.1:3001',
            ORDER_SERVICE_URL: process.env.ORDER_SERVICE_URL ||
                service.extra?.ORDER_SERVICE_URL || 'http://127.0.0.1:3002',
            PAYMENT_SERVICE_URL: process.env.PAYMENT_SERVICE_URL || 'http://127.0.0.1:3003'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    children.set(service.name, child);
    child.stdout.on('data', chunk => process.stdout.write(`[${service.name}] ${chunk}`));
    child.stderr.on('data', chunk => process.stderr.write(`[${service.name}] ${chunk}`));
    child.on('error', error => {
        console.error(`Unable to start ${service.name} service:`, error.message);
        stopAll(1);
    });
    child.on('exit', (code, signal) => {
        if (!shuttingDown) {
            console.error(`${service.name} service exited (${signal || code}). Stopping all services.`);
            stopAll(code || 1);
        }
    });
}

process.on('SIGINT', () => stopAll());
process.on('SIGTERM', () => stopAll());

async function startAll() {
    let database;
    try {
        database = require('./database/db');
        await database.execute('SELECT 1');
    } catch (error) {
        console.error('Cannot start BUDOL because PostgreSQL is unavailable:', error.message);
        process.exitCode = 1;
        return;
    } finally {
        if (database) await database.end();
    }

    for (const service of services) startService(service);
}

startAll();
