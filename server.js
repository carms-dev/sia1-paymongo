require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const scrypt = promisify(crypto.scrypt);

const SESSION_COOKIE = 'budol_session';
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const DUMMY_PASSWORD_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

const ROLES = ['buyer', 'seller', 'admin'];
const SHOP_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

// Where the three backend services live. Keep the localhost defaults when
// everything runs in one container; use public links if deployed separately.
const stripSlash = (url) => url.replace(/\/+$/, '');
const PRODUCT_URL = stripSlash(process.env.PRODUCT_SERVICE_URL || 'http://localhost:3001');
const ORDER_URL = stripSlash(process.env.ORDER_SERVICE_URL || 'http://localhost:3002');
const PAYMENT_URL = stripSlash(process.env.PAYMENT_SERVICE_URL || 'http://localhost:3003');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

if (IS_PROD && !INTERNAL_API_KEY) {
    throw new Error('INTERNAL_API_KEY is required in production.');
}

// Render (and most hosts) put a proxy in front of the app. This makes req.ip
// the visitor's real address, which matters for the activity log.
app.set('trust proxy', 1);

app.use(express.json({
    limit: '1mb',
    // PayMongo signs the exact bytes it sends, so keep an untouched copy.
    verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf;
    }
}));

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validEmail(email) {
    return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanText(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function toId(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function pageParams(req, defaultLimit = 20) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
    return { page, limit, offset: (page - 1) * limit };
}

function queryString(req) {
    const i = req.originalUrl.indexOf('?');
    return i < 0 ? '' : req.originalUrl.slice(i);
}

function sendAuthServiceError(res, error, message) {
    console.error('Database error:', error.message);
    res.status(503).json({ error: message });
}

// Very small in-memory limiter for login / register (per visitor address).
const attempts = new Map();
function rateLimit(max, windowMs) {
    return (req, res, next) => {
        const key = `${req.ip}:${req.path}`;
        const now = Date.now();
        const record = attempts.get(key);

        if (!record || record.reset < now) {
            attempts.set(key, { count: 1, reset: now + windowMs });
            return next();
        }

        record.count += 1;
        if (record.count > max) {
            return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
        }
        next();
    };
}
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of attempts) if (record.reset < now) attempts.delete(key);
}, 10 * 60 * 1000).unref();

// Remove expired sessions once an hour.
setInterval(() => {
    db.execute('DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP')
        .catch((error) => console.error('Session cleanup error:', error.message));
}, 60 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/* Sessions and passwords (same approach as before)                    */
/* ------------------------------------------------------------------ */

function getSessionToken(req) {
    const cookies = (req.headers.cookie || '').split(';');

    for (const cookie of cookies) {
        const separator = cookie.indexOf('=');
        if (separator < 0) continue;

        if (cookie.slice(0, separator).trim() === SESSION_COOKIE) {
            const token = cookie.slice(separator + 1).trim();
            return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
        }
    }

    return null;
}

function sessionTokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(res, token) {
    const secure = IS_PROD ? '; Secure' : '';
    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; ` +
        `HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`
    );
}

function clearSessionCookie(res) {
    const secure = IS_PROD ? '; Secure' : '';
    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
    );
}

async function createPasswordHash(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const key = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, encodedHash) {
    const [algorithm, salt, storedKey] = encodedHash.split('$');

    if (
        algorithm !== 'scrypt' ||
        !/^[a-f0-9]{32}$/.test(salt) ||
        !/^[a-f0-9]{128}$/.test(storedKey)
    ) {
        return false;
    }

    const derivedKey = await scrypt(password, salt, 64);
    return crypto.timingSafeEqual(derivedKey, Buffer.from(storedKey, 'hex'));
}

// Finds the signed-in user (with role and shop) from the session cookie.
async function loadSessionUser(req) {
    const token = getSessionToken(req);
    if (!token) return null;

    const [rows] = await db.execute(
        `SELECT u.id, u.full_name, u.email, u.role, u.status,
                s.id AS shop_id, s.shop_name, s.status AS shop_status
         FROM user_sessions us
         JOIN users u ON u.id = us.user_id
         LEFT JOIN shops s ON s.user_id = u.id
         WHERE us.token_hash = ?
           AND us.expires_at > CURRENT_TIMESTAMP
         LIMIT 1`,
        [sessionTokenHash(token)]
    );

    return rows[0] || null;
}

function publicUser(user) {
    return {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        shop: user.shop_id
            ? { id: user.shop_id, name: user.shop_name, status: user.shop_status }
            : null
    };
}

/* ------------------------------------------------------------------ */
/* Role protection and activity history                                */
/* ------------------------------------------------------------------ */

// Every protected API route starts with requireAuth, then requireRole.
async function requireAuth(req, res, next) {
    try {
        const user = await loadSessionUser(req);

        if (!user) {
            if (getSessionToken(req)) clearSessionCookie(res);
            return res.status(401).json({ error: 'Not signed in.' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Your account has been suspended.' });
        }

        req.user = user;
        next();
    } catch (error) {
        sendAuthServiceError(res, error, 'Service temporarily unavailable.');
    }
}

const requireRole = (...roles) => (req, res, next) =>
    roles.includes(req.user.role)
        ? next()
        : res.status(403).json({ error: 'You do not have access to this.' });

// Sellers can only post products and manage orders after an admin approves the shop.
function requireApprovedShop(req, res, next) {
    if (req.user.shop_status !== 'approved') {
        return res.status(403).json({ error: 'Your shop must be approved by an admin first.' });
    }
    next();
}

// Also protects the admin/seller HTML pages, not just the API.
const pageGuard = (role) => async (req, res, next) => {
    try {
        const user = await loadSessionUser(req);
        if (user && user.status === 'active' && user.role === role) return next();
        res.redirect(user ? '/index.html' : '/login.html');
    } catch (error) {
        res.status(503).send('Temporarily unavailable. Please try again.');
    }
};

async function logActivity(req, action, details = '', actor = req.user) {
    try {
        await db.execute(
            `INSERT INTO activity_logs (user_id, role, action, details, ip_address)
             VALUES (?, ?, ?, ?, ?)`,
            [
                actor ? actor.id : null,
                actor ? actor.role : null,
                action,
                String(details).slice(0, 1000),
                (req.ip || '').slice(0, 45)
            ]
        );
    } catch (error) {
        console.error('Activity log error:', error.message);
    }
}

// Writes one history entry after a route finishes successfully.
const audit = (action, detailsFn) => (req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode < 400) {
            logActivity(req, action, detailsFn ? detailsFn(req) : '');
        }
    });
    next();
};

/* ------------------------------------------------------------------ */
/* Talking to the Product / Order / Payment services                   */
/* ------------------------------------------------------------------ */

async function callService(baseUrl, pathAndQuery, options = {}) {
    const { method = 'GET', body, user, extraHeaders } = options;
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };

    if (INTERNAL_API_KEY) headers['X-Internal-Key'] = INTERNAL_API_KEY;

    // The services use these to know WHO is asking. Clients can never set them
    // because they are always written here, from the verified session.
    if (user) {
        headers['X-User-Id'] = String(user.id);
        headers['X-User-Role'] = user.role;
        if (user.shop_id) headers['X-Shop-Id'] = String(user.shop_id);
    }

    let payload;
    if (body !== undefined) {
        payload = Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(baseUrl + pathAndQuery, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(15000)
    });

    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch (error) {
        data = { error: 'Unexpected response from the service.' };
    }

    return { status: response.status, data };
}

// Builds a route handler that forwards the request to one of the services.
function proxy(label, baseUrl, buildPath, buildBody) {
    return async (req, res) => {
        try {
            const noBody = ['GET', 'HEAD', 'DELETE'].includes(req.method);
            const body = buildBody ? buildBody(req) : (noBody ? undefined : req.body);
            const result = await callService(baseUrl, buildPath(req), {
                method: req.method,
                body,
                user: req.user
            });
            res.status(result.status).json(result.data);
        } catch (error) {
            console.error(`${label} connection error:`, error.message);
            res.status(502).json({ error: `The ${label.toLowerCase()} is unavailable.` });
        }
    };
}

const productService = (buildPath, buildBody) => proxy('Product service', PRODUCT_URL, buildPath, buildBody);
const orderService = (buildPath, buildBody) => proxy('Order service', ORDER_URL, buildPath, buildBody);
const paymentService = (buildPath, buildBody) => proxy('Payment service', PAYMENT_URL, buildPath, buildBody);

/* ------------------------------------------------------------------ */
/* Website pages (admin and seller folders are guarded)                */
/* ------------------------------------------------------------------ */

app.use('/admin', pageGuard('admin'));
app.use('/seller', pageGuard('seller'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

function readAccountFields(body) {
    const fullName = cleanText(body.full_name, 150);
    const email = normalizeEmail(body.email);
    const password = body.password;

    if (!fullName) return { error: 'Enter your name (up to 150 characters).' };
    if (!validEmail(email)) return { error: 'Enter a valid email address.' };
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return { error: 'Your password must be between 8 and 128 characters.' };
    }

    return { fullName, email, password };
}

// Buyer sign-up. The role is ALWAYS buyer here, whatever the browser sends.
app.post('/api/auth/register', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    const fields = readAccountFields(req.body || {});
    if (fields.error) return res.status(400).json({ error: fields.error });

    let connection;

    try {
        const passwordHash = await createPasswordHash(fields.password);
        const token = crypto.randomBytes(32).toString('base64url');
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [userResult] = await connection.execute(
            `INSERT INTO users (full_name, email, password_hash, role)
             VALUES (?, ?, ?, 'buyer') RETURNING id`,
            [fields.fullName, fields.email, passwordHash]
        );
        await connection.execute(
            `INSERT INTO user_sessions (token_hash, user_id, expires_at)
             VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
            [sessionTokenHash(token), userResult.insertId]
        );
        await connection.commit();

        setSessionCookie(res, token);
        logActivity(req, 'register', 'Buyer account created', { id: userResult.insertId, role: 'buyer' });
        res.status(201).json({
            user: {
                id: userResult.insertId,
                full_name: fields.fullName,
                email: fields.email,
                role: 'buyer',
                shop: null
            }
        });
    } catch (error) {
        if (connection) await connection.rollback();

        if (error.code === '23505') {
            return res.status(409).json({
                error: 'An account with this email already exists. Try logging in.'
            });
        }

        sendAuthServiceError(res, error, 'Account registration is temporarily unavailable.');
    } finally {
        if (connection) connection.release();
    }
});

// Seller sign-up: creates the account AND a shop that waits for admin approval.
app.post('/api/auth/register-seller', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    const body = req.body || {};
    const fields = readAccountFields(body);
    if (fields.error) return res.status(400).json({ error: fields.error });

    const shopName = cleanText(body.shop_name, 120);
    const shopDescription = cleanText(body.shop_description, 2000);

    if (shopName.length < 3) {
        return res.status(400).json({ error: 'Enter a shop name (at least 3 characters).' });
    }

    let connection;

    try {
        const passwordHash = await createPasswordHash(fields.password);
        const token = crypto.randomBytes(32).toString('base64url');
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [userResult] = await connection.execute(
            `INSERT INTO users (full_name, email, password_hash, role)
             VALUES (?, ?, ?, 'seller') RETURNING id`,
            [fields.fullName, fields.email, passwordHash]
        );
        const [shopResult] = await connection.execute(
            `INSERT INTO shops (user_id, shop_name, description, status)
             VALUES (?, ?, ?, 'pending') RETURNING id`,
            [userResult.insertId, shopName, shopDescription || null]
        );
        await connection.execute(
            `INSERT INTO user_sessions (token_hash, user_id, expires_at)
             VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
            [sessionTokenHash(token), userResult.insertId]
        );
        await connection.commit();

        setSessionCookie(res, token);
        logActivity(req, 'register_seller', `Shop "${shopName}" submitted for approval`,
            { id: userResult.insertId, role: 'seller' });
        res.status(201).json({
            user: {
                id: userResult.insertId,
                full_name: fields.fullName,
                email: fields.email,
                role: 'seller',
                shop: { id: shopResult.insertId, name: shopName, status: 'pending' }
            }
        });
    } catch (error) {
        if (connection) await connection.rollback();

        if (error.code === '23505') {
            const takenShop = /shop_name|shops/i.test(String(error.constraint || ''));
            return res.status(409).json({
                error: takenShop
                    ? 'That shop name is already taken.'
                    : 'An account with this email already exists. Try logging in.'
            });
        }

        sendAuthServiceError(res, error, 'Seller registration is temporarily unavailable.');
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/auth/login', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const password = body.password;

    if (
        !validEmail(email) ||
        typeof password !== 'string' ||
        password.length < 1 ||
        password.length > 128
    ) {
        return res.status(400).json({ error: 'Enter a valid email address and password.' });
    }

    try {
        const [users] = await db.execute(
            `SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.status,
                    s.id AS shop_id, s.shop_name, s.status AS shop_status
             FROM users u
             LEFT JOIN shops s ON s.user_id = u.id
             WHERE u.email = ?
             LIMIT 1`,
            [email]
        );
        const user = users[0];
        const passwordMatches = await verifyPassword(
            password,
            user ? user.password_hash : DUMMY_PASSWORD_HASH
        );

        if (!user || !passwordMatches) {
            logActivity(req, 'login_failed', `Failed login for ${email}`,
                user ? { id: user.id, role: user.role } : null);
            return res.status(401).json({ error: 'Email or password is incorrect.' });
        }

        if (user.status !== 'active') {
            logActivity(req, 'login_blocked', 'Suspended account tried to log in', user);
            return res.status(403).json({ error: 'Your account has been suspended.' });
        }

        const token = crypto.randomBytes(32).toString('base64url');
        await db.execute(
            `INSERT INTO user_sessions (token_hash, user_id, expires_at)
             VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
            [sessionTokenHash(token), user.id]
        );

        setSessionCookie(res, token);
        logActivity(req, 'login', 'Logged in', user);
        // The browser uses "role" to decide which dashboard to open.
        res.json({ user: publicUser(user) });
    } catch (error) {
        sendAuthServiceError(res, error, 'Login is temporarily unavailable.');
    }
});

app.get('/api/auth/me', async (req, res) => {
    try {
        const user = await loadSessionUser(req);

        if (!user) {
            if (getSessionToken(req)) clearSessionCookie(res);
            return res.status(401).json({ error: 'Not signed in.' });
        }

        if (user.status !== 'active') {
            clearSessionCookie(res);
            return res.status(403).json({ error: 'Your account has been suspended.' });
        }

        res.json({ user: publicUser(user) });
    } catch (error) {
        sendAuthServiceError(res, error, 'Account details are temporarily unavailable.');
    }
});

app.post('/api/auth/logout', async (req, res) => {
    const token = getSessionToken(req);

    try {
        if (token) {
            const user = await loadSessionUser(req);
            if (user) logActivity(req, 'logout', 'Logged out', user);

            await db.execute(
                'DELETE FROM user_sessions WHERE token_hash = ?',
                [sessionTokenHash(token)]
            );
        }

        clearSessionCookie(res);
        res.json({ message: 'You have been signed out.' });
    } catch (error) {
        sendAuthServiceError(res, error, 'Unable to sign out right now.');
    }
});

/* ------------------------------------------------------------------ */
/* PUBLIC: products and shops (anyone can browse)                      */
/* ------------------------------------------------------------------ */

app.get('/api/products', productService((req) => `/api/products${queryString(req)}`));

app.get('/api/products/:id',
    productService((req) => `/api/products/${encodeURIComponent(req.params.id)}`));

app.get('/api/shops', async (req, res) => {
    const { limit, offset } = pageParams(req, 20);

    try {
        const [shops] = await db.query(
            `SELECT id, shop_name, description, logo_url
             FROM shops
             WHERE status = 'approved'
             ORDER BY id DESC
             LIMIT ${limit} OFFSET ${offset}`
        );
        res.json({ shops });
    } catch (error) {
        sendAuthServiceError(res, error, 'Shops are temporarily unavailable.');
    }
});

async function findApprovedShop(id) {
    const [rows] = await db.execute(
        `SELECT id, shop_name, description, logo_url, created_at
         FROM shops
         WHERE id = ? AND status = 'approved'
         LIMIT 1`,
        [id]
    );
    return rows[0] || null;
}

app.get('/api/shops/:id', async (req, res) => {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Shop not found.' });

    try {
        const shop = await findApprovedShop(id);
        if (!shop) return res.status(404).json({ error: 'Shop not found.' });
        res.json({ shop });
    } catch (error) {
        sendAuthServiceError(res, error, 'Shop details are temporarily unavailable.');
    }
});

// "View each store's products" for buyers.
app.get('/api/shops/:id/products', async (req, res) => {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Shop not found.' });

    try {
        const shop = await findApprovedShop(id);
        if (!shop) return res.status(404).json({ error: 'Shop not found.' });

        const result = await callService(PRODUCT_URL, `/api/products?shop_id=${id}`);
        res.status(result.status).json(result.data);
    } catch (error) {
        console.error('Shop products error:', error.message);
        res.status(502).json({ error: 'The product service is unavailable.' });
    }
});

/* ------------------------------------------------------------------ */
/* BUYER: orders and checkout                                          */
/* ------------------------------------------------------------------ */

const buyerOnly = [requireAuth, requireRole('buyer')];

// user_id always comes from the session, never from the browser.
app.post('/api/orders', ...buyerOnly,
    audit('order_created', () => 'Placed an order'),
    orderService(() => '/api/orders', (req) => ({ ...req.body, user_id: req.user.id })));

app.get('/api/my/orders', ...buyerOnly,
    orderService((req) => `/api/orders?user_id=${req.user.id}`));

// Buyers see only their own order; sellers and admins are checked by the service
// using the X-User-Id / X-User-Role / X-Shop-Id headers.
app.get('/api/orders/:id', requireAuth, async (req, res) => {
    try {
        const result = await callService(
            ORDER_URL,
            `/api/orders/${encodeURIComponent(req.params.id)}`,
            { user: req.user }
        );

        const order = result.data && (result.data.order || result.data);
        if (
            result.status < 400 &&
            req.user.role === 'buyer' &&
            order && order.user_id !== undefined &&
            Number(order.user_id) !== Number(req.user.id)
        ) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        if (result.status < 400 && req.user.role === 'seller' && order) {
            const items = Array.isArray(result.data.items)
                ? result.data.items
                : Array.isArray(order.items)
                    ? order.items
                    : [];
            const sellerItems = items.filter(item =>
                Number(item.shop_id) === Number(req.user.shop_id)
            );
            if (!sellerItems.length) {
                return res.status(404).json({ error: 'Order not found.' });
            }
            if (result.data.order) {
                result.data.order = { ...result.data.order, items: sellerItems };
                result.data.items = sellerItems;
            } else {
                result.data = { ...result.data, items: sellerItems };
            }
        }

        res.status(result.status).json(result.data);
    } catch (error) {
        console.error('Order service connection error:', error.message);
        res.status(502).json({ error: 'The order service is unavailable.' });
    }
});

app.post('/api/checkout', ...buyerOnly,
    audit('checkout_started', (req) => `Started checkout${req.body && req.body.order_id ? ` for order ${req.body.order_id}` : ''}`),
    paymentService(() => '/api/checkout', (req) => ({ ...req.body, user_id: req.user.id })));

/* ------------------------------------------------------------------ */
/* PAYMONGO webhook (public, but verified by the Payment Service)      */
/* ------------------------------------------------------------------ */

// Register  https://YOUR-APP-LINK/api/webhooks/paymongo  in the PayMongo dashboard.
// The Payment Service must verify the Paymongo-Signature header, then mark the
// order paid. The success page must trust the database, never the browser redirect.
app.post('/api/webhooks/paymongo', async (req, res) => {
    try {
        const extraHeaders = {};
        const signature = req.get('paymongo-signature');
        if (signature) extraHeaders['Paymongo-Signature'] = signature;

        // The Payment Service listens on /webhooks/paymongo (no /api in front).
        const result = await callService(PAYMENT_URL, '/webhooks/paymongo', {
            method: 'POST',
            body: req.rawBody || JSON.stringify(req.body || {}),
            extraHeaders
        });

        res.status(result.status).json(result.data);
    } catch (error) {
        console.error('Webhook forwarding error:', error.message);
        res.status(502).json({ error: 'The payment service is unavailable.' });
    }
});

/* ------------------------------------------------------------------ */
/* SELLER: own shop, products, orders, payments, history               */
/* ------------------------------------------------------------------ */

const sellerOnly = [requireAuth, requireRole('seller')];
const approvedSeller = [...sellerOnly, requireApprovedShop];

app.get('/api/seller/shop', ...sellerOnly, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, shop_name, description, logo_url, status, created_at
             FROM shops WHERE user_id = ? LIMIT 1`,
            [req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'No shop found for this account.' });
        res.json({ shop: rows[0] });
    } catch (error) {
        sendAuthServiceError(res, error, 'Shop details are temporarily unavailable.');
    }
});

app.put('/api/seller/shop', ...sellerOnly,
    audit('shop_updated', () => 'Updated shop profile'),
    async (req, res) => {
        const body = req.body || {};
        const shopName = cleanText(body.shop_name, 120);
        const description = cleanText(body.description, 2000);

        if (shopName.length < 3) {
            return res.status(400).json({ error: 'Enter a shop name (at least 3 characters).' });
        }

        try {
            const [result] = await db.execute(
                'UPDATE shops SET shop_name = ?, description = ? WHERE user_id = ?',
                [shopName, description || null, req.user.id]
            );
            if (!result.affectedRows) return res.status(404).json({ error: 'No shop found for this account.' });
            res.json({ message: 'Shop updated.' });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'That shop name is already taken.' });
            }
            sendAuthServiceError(res, error, 'Unable to update the shop right now.');
        }
    });

// Post goods: shop_id always comes from the seller's own shop.
app.get('/api/seller/products', ...approvedSeller,
    productService((req) => `/api/products?shop_id=${req.user.shop_id}`));

app.post('/api/seller/products', ...approvedSeller,
    audit('product_created', (req) => `Added product "${cleanText((req.body || {}).name, 120)}"`),
    productService(() => '/api/products', (req) => ({ ...req.body, shop_id: req.user.shop_id })));

// The Product Service must confirm the product belongs to X-Shop-Id.
app.put('/api/seller/products/:id', ...approvedSeller,
    audit('product_updated', (req) => `Edited product #${req.params.id}`),
    productService((req) => `/api/products/${encodeURIComponent(req.params.id)}`,
        (req) => ({ ...req.body, shop_id: req.user.shop_id })));

app.delete('/api/seller/products/:id', ...approvedSeller,
    audit('product_deleted', (req) => `Deleted product #${req.params.id}`),
    productService((req) => `/api/products/${encodeURIComponent(req.params.id)}`));

// Orders and online payments of buyers, limited to this seller's shop.
// Payments show status and amount only; card and wallet details stay with PayMongo.
app.get('/api/seller/orders', ...approvedSeller,
    orderService((req) => `/api/orders?shop_id=${req.user.shop_id}`));

app.patch('/api/seller/orders/:id/status', ...approvedSeller,
    audit('order_status_updated', (req) => `Order #${req.params.id} set to ${cleanText((req.body || {}).status, 40)}`),
    orderService((req) => `/api/orders/${encodeURIComponent(req.params.id)}/status`,
        (req) => ({ status: (req.body || {}).status })));

app.get('/api/seller/payments', ...approvedSeller,
    paymentService((req) => `/api/payments?shop_id=${req.user.shop_id}`));

app.get('/api/seller/activity', ...sellerOnly, async (req, res) => {
    try {
        res.json(await queryActivity({ user_id: req.user.id, ...req.query }, pageParams(req)));
    } catch (error) {
        sendAuthServiceError(res, error, 'Activity history is temporarily unavailable.');
    }
});

/* ------------------------------------------------------------------ */
/* ADMIN: all accounts, shops, orders, payments and activity           */
/* ------------------------------------------------------------------ */

const adminOnly = [requireAuth, requireRole('admin')];

const count = (value) => Number(value || 0);

app.get('/api/admin/stats', ...adminOnly, async (req, res) => {
    try {
        const [[users]] = await db.query(
            `SELECT COUNT(*) AS total_users,
                    COUNT(*) FILTER (WHERE role = 'buyer') AS buyers,
                    COUNT(*) FILTER (WHERE role = 'seller') AS sellers,
                    COUNT(*) FILTER (WHERE role = 'admin') AS admins,
                    COUNT(*) FILTER (WHERE status = 'banned') AS banned
             FROM users`
        );
        const [[shops]] = await db.query(
            `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending_shops,
                    COUNT(*) FILTER (WHERE status = 'approved') AS approved_shops
             FROM shops`
        );
        const [[today]] = await db.query(
            'SELECT COUNT(*) AS actions_today FROM activity_logs WHERE created_at >= CURRENT_DATE'
        );

        res.json({
            total_users: count(users.total_users),
            buyers: count(users.buyers),
            sellers: count(users.sellers),
            admins: count(users.admins),
            banned: count(users.banned),
            pending_shops: count(shops.pending_shops),
            approved_shops: count(shops.approved_shops),
            actions_today: count(today.actions_today)
        });
    } catch (error) {
        sendAuthServiceError(res, error, 'Statistics are temporarily unavailable.');
    }
});

app.get('/api/admin/users', ...adminOnly, async (req, res) => {
    const { page, limit, offset } = pageParams(req);
    const where = [];
    const params = [];

    if (ROLES.includes(req.query.role)) {
        where.push('u.role = ?');
        params.push(req.query.role);
    }
    if (['active', 'banned'].includes(req.query.status)) {
        where.push('u.status = ?');
        params.push(req.query.status);
    }
    const q = cleanText(req.query.q, 100);
    if (q) {
        where.push('(u.full_name ILIKE ? OR u.email ILIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    try {
        const [[{ total }]] = await db.execute(
            `SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
        const [users] = await db.execute(
            `SELECT u.id, u.full_name, u.email, u.role, u.status,
                    s.id AS shop_id, s.shop_name, s.status AS shop_status
             FROM users u
             LEFT JOIN shops s ON s.user_id = u.id
             ${whereSql}
             ORDER BY u.id DESC
             LIMIT ${limit} OFFSET ${offset}`,
            params
        );
        res.json({ users, total, page, limit });
    } catch (error) {
        sendAuthServiceError(res, error, 'Users are temporarily unavailable.');
    }
});

app.get('/api/admin/users/:id', ...adminOnly, async (req, res) => {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: 'User not found.' });

    try {
        const [rows] = await db.execute(
            `SELECT u.id, u.full_name, u.email, u.role, u.status,
                    s.id AS shop_id, s.shop_name, s.status AS shop_status
             FROM users u
             LEFT JOIN shops s ON s.user_id = u.id
             WHERE u.id = ?
             LIMIT 1`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });
        res.json({ user: rows[0] });
    } catch (error) {
        sendAuthServiceError(res, error, 'User details are temporarily unavailable.');
    }
});

// Ban or re-activate an account. Admins cannot ban themselves or other admins.
app.patch('/api/admin/users/:id/status', ...adminOnly,
    audit('admin_user_status', (req) => `User #${req.params.id} set to ${(req.body || {}).status}`),
    async (req, res) => {
        const id = toId(req.params.id);
        const status = (req.body || {}).status;

        if (!id || !['active', 'banned'].includes(status)) {
            return res.status(400).json({ error: 'Provide a valid user and a status of active or banned.' });
        }
        if (id === Number(req.user.id)) {
            return res.status(400).json({ error: 'You cannot change your own account status.' });
        }

        try {
            const [rows] = await db.execute('SELECT role FROM users WHERE id = ? LIMIT 1', [id]);
            if (!rows.length) return res.status(404).json({ error: 'User not found.' });
            if (rows[0].role === 'admin') {
                return res.status(403).json({ error: 'Admin accounts cannot be banned here.' });
            }

            await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
            if (status === 'banned') {
                // Sign the user out everywhere right away.
                await db.execute('DELETE FROM user_sessions WHERE user_id = ?', [id]);
            }
            res.json({ message: `User #${id} is now ${status}.` });
        } catch (error) {
            sendAuthServiceError(res, error, 'Unable to update the account right now.');
        }
    });

app.get('/api/admin/shops', ...adminOnly, async (req, res) => {
    const { page, limit, offset } = pageParams(req);
    const where = [];
    const params = [];

    if (SHOP_STATUSES.includes(req.query.status)) {
        where.push('s.status = ?');
        params.push(req.query.status);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    try {
        const [[{ total }]] = await db.execute(
            `SELECT COUNT(*) AS total FROM shops s ${whereSql}`, params);
        const [shops] = await db.execute(
            `SELECT s.id, s.shop_name, s.description, s.status, s.created_at,
                    u.id AS user_id, u.full_name, u.email
             FROM shops s
             JOIN users u ON u.id = s.user_id
             ${whereSql}
             ORDER BY s.id DESC
             LIMIT ${limit} OFFSET ${offset}`,
            params
        );
        res.json({ shops, total, page, limit });
    } catch (error) {
        sendAuthServiceError(res, error, 'Shops are temporarily unavailable.');
    }
});

// Approve, reject, suspend or move a shop back to pending.
app.patch('/api/admin/shops/:id/status', ...adminOnly,
    audit('admin_shop_status', (req) => `Shop #${req.params.id} set to ${(req.body || {}).status}`),
    async (req, res) => {
        const id = toId(req.params.id);
        const status = (req.body || {}).status;

        if (!id || !SHOP_STATUSES.includes(status)) {
            return res.status(400).json({ error: `Status must be one of: ${SHOP_STATUSES.join(', ')}.` });
        }

        try {
            const [result] = await db.execute('UPDATE shops SET status = ? WHERE id = ?', [status, id]);
            if (!result.affectedRows) return res.status(404).json({ error: 'Shop not found.' });
            res.json({ message: `Shop #${id} is now ${status}.` });
        } catch (error) {
            sendAuthServiceError(res, error, 'Unable to update the shop right now.');
        }
    });

// Full history of everyone: filter by role, user, action and date range.
app.get('/api/admin/activity', ...adminOnly, async (req, res) => {
    try {
        res.json(await queryActivity(req.query, pageParams(req, 50)));
    } catch (error) {
        sendAuthServiceError(res, error, 'Activity history is temporarily unavailable.');
    }
});

app.get('/api/admin/users/:id/activity', ...adminOnly, async (req, res) => {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: 'User not found.' });

    try {
        res.json(await queryActivity({ ...req.query, user_id: id }, pageParams(req, 50)));
    } catch (error) {
        sendAuthServiceError(res, error, 'Activity history is temporarily unavailable.');
    }
});

async function queryActivity(filters, { page, limit, offset }) {
    const where = [];
    const params = [];
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

    if (filters.user_id && toId(filters.user_id)) {
        where.push('a.user_id = ?');
        params.push(toId(filters.user_id));
    }
    if (ROLES.includes(filters.role)) {
        where.push('a.role = ?');
        params.push(filters.role);
    }
    const action = cleanText(filters.action, 100);
    if (action) {
        where.push('a.action ILIKE ?');
        params.push(`${action}%`);
    }
    if (typeof filters.from === 'string' && dateOnly.test(filters.from)) {
        where.push('a.created_at >= ?');
        params.push(filters.from);
    }
    if (typeof filters.to === 'string' && dateOnly.test(filters.to)) {
        where.push("a.created_at < (?::date + INTERVAL '1 day')");
        params.push(filters.to);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM activity_logs a ${whereSql}`, params);
    const [logs] = await db.execute(
        `SELECT a.id, a.user_id, u.full_name, u.email, a.role, a.action,
                a.details, a.ip_address, a.created_at
         FROM activity_logs a
         LEFT JOIN users u ON u.id = a.user_id
         ${whereSql}
         ORDER BY a.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
    );

    return { logs, total, page, limit };
}

// Platform-wide lists come from the services; the services see X-User-Role: admin.
app.get('/api/admin/products', ...adminOnly,
    productService((req) => `/api/products${queryString(req)}`));

app.get('/api/admin/orders', ...adminOnly,
    orderService((req) => `/api/orders${queryString(req)}`));

app.get('/api/admin/payments', ...adminOnly,
    paymentService((req) => `/api/payments${queryString(req)}`));

/* ------------------------------------------------------------------ */
/* Health check and error handling                                     */
/* ------------------------------------------------------------------ */

app.get('/health', (req, res) => {
    res.json({ message: 'SIA1 online store server is running!' });
});

app.use((error, req, res, next) => {
    if (
        error instanceof SyntaxError &&
        error.status === 400 &&
        Object.prototype.hasOwnProperty.call(error, 'body')
    ) {
        return res.status(400).json({ error: 'Invalid JSON request body.' });
    }

    console.error('Unexpected error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
    console.log(`Website running at http://localhost:${PORT}`);
});