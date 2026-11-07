require("dotenv").config();

const crypto = require("crypto");
const { promisify } = require("util");
const db = require("../database/db");

const scrypt = promisify(crypto.scrypt);
const buyerEmail = "e2e-buyer@example.test";
const buyerPassword = "BudolE2EPass123!";
const fixedSalt = "6275646f6c2d637970726573732d7631";
const shopName = "E2E Cypress Test Shop";
const products = [
    { name: "E2E Cypress Mouse", category: "Electronics", price: 35000 },
    { name: "E2E Cypress Desk Lamp", category: "Home & Living", price: 52000 },
    { name: "E2E Cypress Tote Bag", category: "Fashion", price: 27000 }
];

async function seed() {
    if (process.env.NODE_ENV === "production" || process.env.E2E_TEST_MODE !== "1") {
        throw new Error(
            "Seeding is disabled unless E2E_TEST_MODE=1 is set in a non-production environment."
        );
    }

    const key = await scrypt(buyerPassword, fixedSalt, 64);
    const passwordHash = `scrypt$${fixedSalt}$${key.toString("hex")}`;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const [userResult] = await connection.execute(
            `INSERT INTO users (full_name, email, password_hash, role, status)
             VALUES (?, ?, ?, 'buyer', 'active')
             ON CONFLICT (LOWER(email)) DO UPDATE
             SET full_name = EXCLUDED.full_name,
                 password_hash = EXCLUDED.password_hash,
                 role = 'buyer',
                 status = 'active'
             RETURNING id`,
            ["BUDOL Cypress Buyer", buyerEmail, passwordHash]
        );
        const userId = userResult.rows[0].id;

        const [shopResult] = await connection.execute(
            `INSERT INTO shops (user_id, shop_name, description, status)
             VALUES (?, ?, ?, 'approved')
             ON CONFLICT (user_id) DO UPDATE
             SET shop_name = EXCLUDED.shop_name,
                 description = EXCLUDED.description,
                 status = 'approved'
             RETURNING id`,
            [userId, shopName, "Seeded shop reserved for Cypress end-to-end tests."]
        );
        const shopId = shopResult.rows[0].id;

        for (const product of products) {
            const [categories] = await connection.execute(
                "SELECT id FROM categories WHERE name = ? LIMIT 1",
                [product.category]
            );
            if (!categories.length) {
                throw new Error(`Missing seeded category: ${product.category}. Run the schema first.`);
            }

            const [existing] = await connection.execute(
                "SELECT id FROM products WHERE shop_id = ? AND name = ? LIMIT 1",
                [shopId, product.name]
            );
            if (existing.length) {
                await connection.execute(
                    `UPDATE products
                     SET category_id = ?, description = ?, price_centavos = ?,
                         original_price_centavos = NULL, stock = 50, status = 'active'
                     WHERE id = ?`,
                    [
                        categories[0].id,
                        `${product.name}, seeded for repeatable Cypress tests.`,
                        product.price,
                        existing[0].id
                    ]
                );
            } else {
                await connection.execute(
                    `INSERT INTO products
                        (shop_id, category_id, name, description, price_centavos, stock, status)
                     VALUES (?, ?, ?, ?, ?, 50, 'active')`,
                    [
                        shopId,
                        categories[0].id,
                        product.name,
                        `${product.name}, seeded for repeatable Cypress tests.`,
                        product.price
                    ]
                );
            }
        }

        await connection.commit();
        console.log("Cypress seed is ready:");
        console.log(`  Buyer: ${buyerEmail}`);
        console.log(`  Password: ${buyerPassword}`);
        products.forEach(product => {
            console.log(`  ${product.name}: ${product.price} centavos`);
        });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await db.end();
    }
}

seed().catch(error => {
    console.error("Could not seed Cypress data:", error.message);
    process.exitCode = 1;
});
