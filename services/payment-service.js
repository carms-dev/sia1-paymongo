require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const db = require('../database/db');
const requireInternalKey = require('./internal-auth');

const app = express();
const PORT = Number(process.env.PORT || 3003);

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3002';
const PAYMONGO_URL = 'https://api.paymongo.com/v2/checkout_sessions';

// ==================================================
// WEBHOOK ROUTE
// IMPORTANT: Keep this BEFORE express.json()
// ==================================================

app.post(
    '/webhooks/paymongo',
    express.raw({ type: 'application/json' }),
    async (req, res) => {

        const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
        const signatureHeader = req.headers['paymongo-signature'];

        console.log('Webhook diagnostic:', {
            secretLoaded: Boolean(webhookSecret),
            signatureHeaderPresent: Boolean(signatureHeader),
            rawBodyReceived: Buffer.isBuffer(req.body)
        });


        if (
            !webhookSecret ||
            !signatureHeader ||
            !Buffer.isBuffer(req.body)
        ) {
            return res.status(400).json({
                error: 'Webhook configuration or signature is missing.'
            });
        }

        try {
            // Parse the signature header
            const parts = Object.fromEntries(
                signatureHeader.split(',').map(part => {
                    const index = part.indexOf('=');

                    if (index === -1) {
                        return ['', ''];
                    }

                    return [
                        part.slice(0, index).trim(),
                        part.slice(index + 1).trim()
                    ];
                })
            );

            const timestamp = Number(parts.t);
            const receivedSignature = parts.te;

            // Check timestamp and signature
            if (
                !Number.isFinite(timestamp) ||
                !receivedSignature ||
                Math.abs(Date.now() / 1000 - timestamp) > 300
            ) {
                return res.status(401).json({
                    error: 'Invalid or expired webhook signature.'
                });
            }

            // Verify signature using the exact raw request body
            const signedPayload =
                `${parts.t}.${req.body.toString('utf8')}`;

            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(signedPayload)
                .digest('hex');

            // Reject malformed hexadecimal signatures
            if (
                !/^[0-9a-f]+$/i.test(receivedSignature) ||
                receivedSignature.length !== expectedSignature.length
            ) {
                return res.status(401).json({
                    error: 'Webhook signature verification failed.'
                });
            }

            const received = Buffer.from(receivedSignature, 'hex');
            const expected = Buffer.from(expectedSignature, 'hex');

            if (!crypto.timingSafeEqual(received, expected)) {
                return res.status(401).json({
                    error: 'Webhook signature verification failed.'
                });
            }

            // Parse verified event
            const event = JSON.parse(req.body.toString('utf8'));
            const eventAttributes = event?.data?.attributes;

            // This project uses PayMongo test mode
            if (eventAttributes?.livemode !== false) {
                return res.status(400).json({
                    error: 'Unexpected payment mode.'
                });
            }

            // Ignore unrelated event types
            if (
                eventAttributes?.type !==
                'checkout_session.payment.paid'
            ) {
                return res.status(200).json({
                    received: true,
                    message: 'Event ignored.'
                });
            }

            const session = eventAttributes.data;
            const sessionId = session?.id;
            const sessionAttributes = session?.attributes;

            // Confirm that the checkout session contains a paid payment
            const hasPaidPayment =
                Array.isArray(sessionAttributes?.payments) &&
                sessionAttributes.payments.some(
                    payment => payment?.attributes?.status === 'paid'
                );

            if (!sessionId || !hasPaidPayment) {
                return res.status(400).json({
                    error: 'Paid checkout session details are invalid.'
                });
            }

            const connection = await db.getConnection();

            try {
                await connection.beginTransaction();

                const [payments] = await connection.execute(
                    `SELECT order_id
                     FROM payments
                     WHERE checkout_session_id = ?
                     LIMIT 1
                     FOR UPDATE`,
                    [sessionId]
                );

                if (payments.length === 0) {
                    await connection.rollback();

                    return res.status(404).json({
                        error: 'Checkout session was not found.'
                    });
                }

                const orderId = payments[0].order_id;

                // Update payment record
                await connection.execute(
                    `UPDATE payments
                     SET payment_status = 'paid'
                     WHERE checkout_session_id = ?`,
                    [sessionId]
                );

                // Update order status
                await connection.execute(
                    `UPDATE orders
                     SET status = 'paid'
                     WHERE id = ? AND status = 'pending'`,
                    [orderId]
                );

                await connection.commit();

                console.log(
                    `Payment confirmed for order ${orderId}.`
                );

                return res.status(200).json({
                    received: true,
                    message: 'Payment notification processed.'
                });
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error(
                'Webhook processing error:',
                error.message
            );

            return res.status(500).json({
                error: 'Unable to process payment notification.'
            });
        }
    }
);

// ==================================================
// JSON MIDDLEWARE
// Keep AFTER the webhook route
// ==================================================

app.use(express.json());
app.use('/api', requireInternalKey);

// ==================================================
// HEALTH CHECK
// ==================================================

app.get('/health', (req, res) => {
    res.json({
        message: 'Payment Service is running!'
    });
});

// ==================================================
// CREATE PAYMONGO CHECKOUT SESSION
// ==================================================

app.post('/api/checkout', async (req, res) => {
    const orderId = Number(req.body.order_id);

    if (!Number.isSafeInteger(orderId) || orderId < 1) {
        return res.status(400).json({
            error: 'A valid order ID is required.'
        });
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    if (!secretKey || !secretKey.startsWith('sk_test_')) {
        return res.status(500).json({
            error: 'PayMongo test mode is not configured.'
        });
    }

    let connection;

    try {
        // Get the order from the Order Service
        const orderResponse = await fetch(
            `${ORDER_SERVICE_URL}/api/orders/${orderId}`,
            {
                headers: process.env.INTERNAL_API_KEY
                    ? { 'X-Internal-Key': process.env.INTERNAL_API_KEY }
                    : {}
            }
        );

        if (!orderResponse.ok) {
            return res.status(orderResponse.status).json({
                error: 'Unable to find the requested order.'
            });
        }

        const result = await orderResponse.json();
        const order = result.order;
        const items = result.items;

        if (!order) {
            return res.status(404).json({
                error: 'Order details were not returned.'
            });
        }

        if (order.status !== 'pending') {
            return res.status(400).json({
                error: 'Only pending orders can be checked out.'
            });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({
                error: 'The order has no items.'
            });
        }

        // Use prices saved in the database
        const lineItems = items.map(item => ({
            name: item.product_name,
            amount: item.price_centavos,
            currency: 'PHP',
            quantity: item.quantity
        }));

        const paymentMethods = (
            process.env.PAYMONGO_PAYMENT_METHODS ||
            'card,gcash,qrph'
        )
            .split(',')
            .map(method => method.trim())
            .filter(Boolean);

        // Create a Checkout Session on PayMongo
        const paymongoResponse = await fetch(PAYMONGO_URL, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(
                    `${secretKey}:`
                ).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        line_items: lineItems,
                        payment_method_types: paymentMethods,
                        success_url:
                            `${appUrl}/success.html?order_id=${order.id}`,
                        cancel_url:
                            `${appUrl}/cancel.html?order_id=${order.id}`,
                        reference_number: order.order_number,
                        description: `Order ${order.order_number}`
                    }
                }
            })
        });

        const paymongoData = await paymongoResponse.json();

        if (!paymongoResponse.ok) {
            console.error(
                'PayMongo rejected the checkout request:',
                paymongoData.errors || paymongoResponse.status
            );

            return res.status(502).json({
                error: 'Unable to start checkout. Please try again.'
            });
        }

        const session = paymongoData.data;
        const checkoutUrl = session?.attributes?.checkout_url;

        // Only accept PayMongo's hosted checkout URL
        let parsedUrl;

        try {
            parsedUrl = new URL(checkoutUrl);
        } catch {
            parsedUrl = null;
        }

        if (
            !session?.id ||
            !parsedUrl ||
            parsedUrl.protocol !== 'https:' ||
            parsedUrl.hostname !== 'checkout.paymongo.com'
        ) {
            return res.status(502).json({
                error: 'PayMongo returned an invalid checkout URL.'
            });
        }

        // Save the checkout session in PostgreSQL
        connection = await db.getConnection();

        await connection.execute(
            `INSERT INTO payments
                (order_id, checkout_session_id, checkout_url, payment_status)
             VALUES (?, ?, ?, 'pending')`,
            [order.id, session.id, checkoutUrl]
        );

        return res.status(201).json({
            message: 'Checkout session created.',
            order_id: order.id,
            checkout_url: checkoutUrl
        });
    } catch (error) {
        console.error('Checkout error:', error.message);

        return res.status(500).json({
            error: 'An unexpected error occurred while starting checkout.'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ==================================================
// START PAYMENT SERVICE
// ==================================================

app.listen(PORT, () => {
    console.log(
        `Payment Service running at http://localhost:${PORT}`
    );
});
