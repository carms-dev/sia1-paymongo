
const express = require('express');
const db = require('../database/db');
const crypto = require('crypto');
const requireInternalKey = require('./internal-auth');

const app = express();
const PORT = Number(process.env.PORT || 3002);

app.use(express.json());
app.use('/api', requireInternalKey);

function pageParams(query) {
    const requestedPage = Number.parseInt(query.page || '1', 10);
    const requestedLimit = Number.parseInt(query.limit || '20', 10);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 20;
    return { page, limit, offset: (page - 1) * limit };
}

// Check whether the Order Service is running
app.get('/health', (req, res) => {
    res.json({ message: 'Order Service is running!' });
});

// Create a new order
app.post('/api/orders', async (req, res) => {
    const {
        customer_name, customer_email, phone, region, province, city,
        barangay, address_line, postal_code, delivery_notes, items, user_id
    } = req.body;
    const userId = Number(user_id);

    // Validate customer information
    if (
        !Number.isSafeInteger(userId) ||
        userId < 1 ||
        typeof customer_name !== 'string' ||
        !customer_name.trim() ||
        customer_name.trim().length > 150 ||
        typeof customer_email !== 'string' ||
        customer_email.length > 255 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email) ||
        typeof phone !== 'string' || !/^\+?[0-9][0-9 ()-]{5,27}[0-9]$/.test(phone.trim()) ||
        typeof region !== 'string' || !region.trim() || region.trim().length > 100 ||
        typeof province !== 'string' || !province.trim() || province.trim().length > 100 ||
        typeof city !== 'string' || !city.trim() || city.trim().length > 100 ||
        typeof barangay !== 'string' || !barangay.trim() || barangay.trim().length > 100 ||
        typeof address_line !== 'string' || !address_line.trim() || address_line.trim().length > 255 ||
        typeof postal_code !== 'string' || !/^[0-9A-Za-z -]{3,10}$/.test(postal_code.trim()) ||
        (delivery_notes !== undefined && (typeof delivery_notes !== 'string' || delivery_notes.length > 500))
    ) {
        return res.status(400).json({
            error: 'Please provide valid delivery details, buyer ID, and email.'
        });
    }

    // Validate the cart
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: 'Your cart is empty.'
        });
    }

    // Combine repeated product IDs and validate quantities
    const quantities = new Map();

    for (const item of items) {
        const productId = Number(item.product_id);
        const quantity = Number(item.quantity);

        if (
            !Number.isSafeInteger(productId) ||
            productId < 1 ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > 99
        ) {
            return res.status(400).json({
                error: 'Each item must have a valid product ID and quantity from 1 to 99.'
            });
        }

        const combinedQuantity =
            (quantities.get(productId) || 0) + quantity;

        if (combinedQuantity > 99) {
            return res.status(400).json({
                error: 'The maximum quantity per product is 99.'
            });
        }

        quantities.set(productId, combinedQuantity);
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const orderItems = [];
        let total = 0;

        // Read prices from the database, not from the browser
        for (const [productId, quantity] of quantities) {
            const [products] = await connection.execute(
                `SELECT p.id, p.shop_id, p.name, p.price_centavos, p.stock
                 FROM products p
                 JOIN shops s ON s.id = p.shop_id
                 WHERE p.id = ? AND p.status = 'active' AND s.status = 'approved'
                 FOR UPDATE OF p`,
                [productId]
            );

            if (products.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    error: `Product ${productId} is unavailable.`
                });
            }

            const product = products[0];

            if (product.stock < quantity) {
                await connection.rollback();
                return res.status(400).json({
                    error: `Not enough stock for ${product.name}.`
                });
            }

            const lineTotal = product.price_centavos * quantity;

            if (!Number.isSafeInteger(lineTotal)) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'Order total is too large.'
                });
            }

            total += lineTotal;

            if (!Number.isSafeInteger(total)) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'Order total is too large.'
                });
            }

            orderItems.push({
                product_id: product.id,
                shop_id: product.shop_id,
                product_name: product.name,
                price_centavos: product.price_centavos,
                quantity,
                line_total_centavos: lineTotal
            });
        }

        const orderNumber =
            'ORD-' + Date.now() + '-' +
            crypto.randomBytes(3).toString('hex').toUpperCase();

        const [orderResult] = await connection.execute(
            `INSERT INTO orders
                (order_number, user_id, recipient_name, phone, email,
                 region, province, city, barangay, address_line, postal_code,
                 delivery_notes, status, total_centavos)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
             RETURNING id`,
            [
                orderNumber,
                userId,
                customer_name.trim(),
                phone.trim(),
                customer_email.trim(),
                region.trim(),
                province.trim(),
                city.trim(),
                barangay.trim(),
                address_line.trim(),
                postal_code.trim(),
                typeof delivery_notes === 'string' ? delivery_notes.trim() || null : null,
                total
            ]
        );

        for (const item of orderItems) {
            await connection.execute(
                `INSERT INTO order_items
                    (order_id, product_id, shop_id, product_name,
                     price_centavos, quantity)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    orderResult.insertId,
                    item.product_id,
                    item.shop_id,
                    item.product_name,
                    item.price_centavos,
                    item.quantity
                ]
            );
        }

        await connection.commit();

        res.status(201).json({
            message: 'Order created successfully.',
            order: {
                id: orderResult.insertId,
                order_number: orderNumber,
                user_id: userId,
                customer_name: customer_name.trim(),
                customer_email: customer_email.trim(),
                phone: phone.trim(),
                region: region.trim(),
                province: province.trim(),
                city: city.trim(),
                barangay: barangay.trim(),
                address_line: address_line.trim(),
                postal_code: postal_code.trim(),
                delivery_notes: typeof delivery_notes === 'string' ? delivery_notes.trim() || null : null,
                status: 'pending',
                total_centavos: total,
                items: orderItems
            }
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error('Failed to create order:', error.message);

        res.status(500).json({
            error: 'Unable to create your order.'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// List orders for the requested buyer, shop, or administrator.
app.get('/api/orders', async (req, res) => {
    const { page, limit, offset } = pageParams(req.query);
    const conditions = [];
    const values = [];
    const userId = req.query.user_id === undefined ? null : Number(req.query.user_id);
    const shopId = req.query.shop_id === undefined ? null : Number(req.query.shop_id);

    if (userId !== null) {
        if (!Number.isSafeInteger(userId) || userId < 1) {
            return res.status(400).json({ error: 'Invalid buyer ID.' });
        }
        conditions.push('o.user_id = ?');
        values.push(userId);
    }

    if (shopId !== null) {
        if (!Number.isSafeInteger(shopId) || shopId < 1) {
            return res.status(400).json({ error: 'Invalid shop ID.' });
        }
        conditions.push(
            'EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.shop_id = ?)'
        );
        values.push(shopId);
    }

    if (typeof req.query.status === 'string' && req.query.status.trim()) {
        const statuses = req.query.status.split(',').map(value => value.trim()).filter(Boolean);
        const allowedStatuses = ['pending', 'paid', 'cancelled', 'failed'];
        if (!statuses.length || statuses.some(status => !allowedStatuses.includes(status))) {
            return res.status(400).json({ error: 'Invalid order status filter.' });
        }
        conditions.push(`o.status IN (${statuses.map(() => '?').join(', ')})`);
        values.push(...statuses);
    }

    if (typeof req.query.q === 'string' && req.query.q.trim()) {
        const search = `%${req.query.q.trim().slice(0, 100)}%`;
        conditions.push(
            '(o.order_number ILIKE ? OR o.recipient_name ILIKE ? OR o.email ILIKE ?)'
        );
        values.push(search, search, search);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
        const [[{ total }]] = await db.execute(
            `SELECT COUNT(*) AS total FROM orders o ${where}`,
            values
        );
        const [orders] = await db.execute(
            `SELECT o.id, o.order_number, o.user_id, o.recipient_name AS customer_name,
                    o.phone, o.email AS customer_email, o.region, o.province, o.city,
                    o.barangay, o.address_line, o.postal_code, o.delivery_notes,
                    o.status, o.total_centavos, o.created_at
             FROM orders o
             ${where}
             ORDER BY o.id DESC
             LIMIT ${limit} OFFSET ${offset}`,
            values
        );

        if (orders.length) {
            const placeholders = orders.map(() => '?').join(', ');
            const shopFilter = shopId === null ? '' : ' AND shop_id = ?';
            const itemParams = shopId === null
                ? orders.map(order => order.id)
                : [...orders.map(order => order.id), shopId];
            const [items] = await db.execute(
                `SELECT oi.order_id, oi.product_id, oi.shop_id, oi.product_name,
                        oi.price_centavos, oi.quantity,
                        oi.price_centavos::BIGINT * oi.quantity AS line_total_centavos,
                        oi.fulfillment_status, oi.courier, oi.tracking_number,
                        p.image_url
                 FROM order_items oi
                 LEFT JOIN products p ON p.id = oi.product_id
                 WHERE oi.order_id IN (${placeholders})${shopFilter.replaceAll('shop_id', 'oi.shop_id')}
                 ORDER BY oi.order_id, oi.product_id`,
                itemParams
            );
            const itemsByOrder = new Map();
            for (const item of items) {
                const orderItems = itemsByOrder.get(String(item.order_id)) || [];
                orderItems.push(item);
                itemsByOrder.set(String(item.order_id), orderItems);
            }
            orders.forEach(order => {
                order.items = itemsByOrder.get(String(order.id)) || [];
                if (shopId !== null) {
                    order.total_centavos = order.items.reduce(
                        (sum, item) => sum + Number(item.line_total_centavos || 0),
                        0
                    );
                    order.customer_email = null;
                    order.user_id = null;
                }
            });
        }

        res.json({ orders, total: Number(total), page, limit });
    } catch (error) {
        console.error('Failed to list orders:', error.message);
        res.status(500).json({ error: 'Unable to retrieve orders.' });
    }
});

// Get an order and its items by order ID
app.get('/api/orders/:id', async (req, res) => {
    const orderId = Number(req.params.id);

    if (!Number.isSafeInteger(orderId) || orderId < 1) {
        return res.status(400).json({
            error: 'Invalid order ID.'
        });
    }

    try {
        const [orders] = await db.execute(
            `SELECT id, order_number, user_id, recipient_name AS customer_name,
                    phone, email AS customer_email, region, province, city, barangay,
                    address_line, postal_code, delivery_notes,
                    status, total_centavos, created_at
             FROM orders
             WHERE id = ?`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                error: 'Order not found.'
            });
        }

        const [items] = await db.execute(
            `SELECT oi.order_id, oi.product_id, oi.shop_id, oi.product_name,
                    oi.price_centavos, oi.quantity,
                    oi.price_centavos::BIGINT * oi.quantity AS line_total_centavos,
                    oi.fulfillment_status, oi.courier, oi.tracking_number,
                    p.image_url
             FROM order_items oi
             LEFT JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = ?`,
            [orderId]
        );

        res.json({
            order: orders[0],
            items
        });
    } catch (error) {
        console.error('Failed to fetch order:', error.message);
        res.status(500).json({
            error: 'Unable to retrieve the order.'
        });
    }
});

// Sellers update fulfillment for items belonging to their own shop.
app.patch('/api/orders/:id/status', async (req, res) => {
    const orderId = Number(req.params.id);
    const shopId = Number(req.headers['x-shop-id']);
    const status = req.body?.status;
    const courier = typeof req.body?.courier === 'string' ? req.body.courier.trim() : '';
    const trackingNumber = typeof req.body?.tracking_number === 'string'
        ? req.body.tracking_number.trim()
        : '';
    const allowedStatuses = ['processing', 'shipped', 'delivered', 'cancelled'];

    if (!Number.isSafeInteger(orderId) || orderId < 1) {
        return res.status(400).json({ error: 'Invalid order ID.' });
    }
    if (!Number.isSafeInteger(shopId) || shopId < 1) {
        return res.status(403).json({ error: 'A valid seller shop is required.' });
    }
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid fulfillment status.' });
    }
    if (courier.length > 80 || trackingNumber.length > 80) {
        return res.status(400).json({ error: 'Courier and tracking number must be 80 characters or fewer.' });
    }
    if (status === 'shipped' && (!courier || !trackingNumber)) {
        return res.status(400).json({ error: 'Courier and tracking number are required when shipping an order.' });
    }

    try {
        const [orders] = await db.execute(
            `SELECT status
             FROM orders
             WHERE id = ?
               AND EXISTS (
                   SELECT 1 FROM order_items
                   WHERE order_id = orders.id AND shop_id = ?
               )
             LIMIT 1`,
            [orderId, shopId]
        );
        if (!orders.length) {
            return res.status(404).json({ error: 'Order not found for this shop.' });
        }
        if (orders[0].status !== 'paid') {
            return res.status(400).json({ error: 'Fulfillment can be updated after payment is confirmed.' });
        }
        const [result] = await db.execute(
            `UPDATE order_items
             SET fulfillment_status = ?,
                 courier = ?,
                 tracking_number = ?
             WHERE order_id = ? AND shop_id = ?`,
            [status, courier || null, trackingNumber || null, orderId, shopId]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ error: 'Order not found for this shop.' });
        }
        res.json({ message: 'Order fulfillment status updated.', status });
    } catch (error) {
        console.error('Failed to update order status:', error.message);
        res.status(500).json({ error: 'Unable to update order status.' });
    }
});

app.listen(PORT, () => {
    console.log(`Order Service running at http://localhost:${PORT}`);
});
