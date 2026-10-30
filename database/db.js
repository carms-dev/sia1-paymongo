require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');
const { postgresPlaceholders } = require('./sql');

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Set it to your PostgreSQL connection string.');
}

const sslEnabled = process.env.PGSSL === 'true';
const sslCaPath = process.env.PGSSL_CA;
const sslCaBase64 = process.env.PGSSL_CA_BASE64;
if (sslCaPath && sslCaBase64) {
    throw new Error('Set only one of PGSSL_CA or PGSSL_CA_BASE64.');
}
const ssl = sslEnabled
    ? {
        rejectUnauthorized: true,
        ...(sslCaPath ? { ca: fs.readFileSync(sslCaPath, 'utf8') } : {}),
        ...(sslCaBase64 ? { ca: Buffer.from(sslCaBase64, 'base64').toString('utf8') } : {})
    }
    : undefined;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000
});

pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error.message);
});

function adaptClient(client) {
    async function execute(sql, values = []) {
        const result = await client.query(postgresPlaceholders(sql), values);
        if (result.command === 'SELECT' || result.command === 'SHOW') {
            return [result.rows];
        }
        return [{
            affectedRows: result.rowCount,
            insertId: result.rows[0]?.id,
            rows: result.rows
        }];
    }

    return {
        execute,
        query: execute,
        beginTransaction: () => client.query('BEGIN'),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        release: () => client.release()
    };
}

module.exports = {
    execute: (sql, values = []) => adaptClient(pool).execute(sql, values),
    query: (sql, values = []) => adaptClient(pool).query(sql, values),
    getConnection: async () => adaptClient(await pool.connect()),
    end: () => pool.end()
};
