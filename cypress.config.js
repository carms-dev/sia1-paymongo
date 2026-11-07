require("dotenv").config();

const crypto = require("crypto");

module.exports = {
    chromeWebSecurity: false,
    e2e: {
        baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:3000",
        specPattern: "cypress/e2e/**/*.cy.js",
        supportFile: false,
        video: true,
        retries: 0,
        setupNodeEvents(on, config) {
            let db;

            on("task", {
                async simulatePaidWebhook(orderId) {
                    if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1) {
                        throw new Error("A valid order ID is required.");
                    }
                    if (!process.env.PAYMONGO_WEBHOOK_SECRET) {
                        throw new Error("PAYMONGO_WEBHOOK_SECRET is required for the webhook test.");
                    }

                    db = db || require("./database/db");
                    const [orders] = await db.execute(
                        `SELECT id, order_number, total_centavos, status
                         FROM orders WHERE id = ? LIMIT 1`,
                        [Number(orderId)]
                    );
                    const order = orders[0];
                    if (!order || order.status !== "pending") {
                        throw new Error("The test order must exist and still be pending.");
                    }

                    const sessionId = `cs_test_e2e_${order.id}`;
                    await db.execute(
                        `INSERT INTO payments
                            (order_id, checkout_session_id, checkout_url, payment_status, amount_centavos)
                         VALUES (?, ?, ?, 'pending', ?)
                         ON CONFLICT (checkout_session_id) DO UPDATE
                         SET payment_status = 'pending',
                             amount_centavos = EXCLUDED.amount_centavos`,
                        [
                            order.id,
                            sessionId,
                            `https://checkout.paymongo.com/${sessionId}`,
                            order.total_centavos
                        ]
                    );

                    const payload = JSON.stringify({
                        data: {
                            attributes: {
                                livemode: false,
                                type: "checkout_session.payment.paid",
                                data: {
                                    id: sessionId,
                                    attributes: {
                                        payments: [{ attributes: { status: "paid" } }]
                                    }
                                }
                            }
                        }
                    });
                    const timestamp = Math.floor(Date.now() / 1000);
                    const signature = crypto
                        .createHmac("sha256", process.env.PAYMONGO_WEBHOOK_SECRET)
                        .update(`${timestamp}.${payload}`)
                        .digest("hex");
                    const response = await fetch(
                        `${config.baseUrl}/api/webhooks/paymongo`,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Paymongo-Signature": `t=${timestamp},te=${signature}`
                            },
                            body: payload
                        }
                    );
                    const responseBody = await response.json();
                    if (!response.ok) {
                        throw new Error(
                            `The signed test webhook failed (${response.status}): ${responseBody.error || "Unknown error."}`
                        );
                    }
                    return { status: response.status };
                }
            });

            on("after:run", async () => {
                if (db) await db.end();
            });
            return config;
        }
    }
};
