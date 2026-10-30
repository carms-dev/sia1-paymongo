
const express = require('express');
const db = require('../database/db');
const requireInternalKey = require('./internal-auth');

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(express.json());
app.use('/api', requireInternalKey);

// Check whether the Product Service is running
app.get('/health', (req, res) => {
    res.json({
        message: 'Product Service is running!'
    });
});

// Get all active products
app.get('/api/products', async (req, res) => {
    try {
        const conditions = ["p.status = 'active'", "s.status = 'approved'"];
        const values = [];
        const shopId = Number(req.query.shop_id);
        if (req.query.shop_id && Number.isSafeInteger(shopId) && shopId > 0) {
            conditions.push('p.shop_id = ?');
            values.push(shopId);
        }
        if (typeof req.query.q === 'string' && req.query.q.trim()) {
            conditions.push('(p.name ILIKE ? OR p.description ILIKE ?)');
            const query = `%${req.query.q.trim().slice(0, 100)}%`;
            values.push(query, query);
        }
        if (typeof req.query.category === 'string' && req.query.category.trim()) {
            conditions.push('c.name = ?');
            values.push(req.query.category.trim().slice(0, 80));
        }
        const [products] = await db.execute(
            `SELECT p.id, p.shop_id, s.shop_name, s.logo_url AS shop_logo_url,
                    c.name AS category, p.name, p.description, p.price_centavos,
                    p.original_price_centavos, p.stock, p.image_url
             FROM products p
             JOIN shops s ON s.id = p.shop_id
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY p.id ASC`,
            values
        );

        res.json(products);
    } catch (error) {
        console.error('Failed to fetch products:', error.message);
        res.status(500).json({
            error: 'Unable to load products.'
        });
    }
});

// Get one product by its ID
app.get('/api/products/:id', async (req, res) => {
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId < 1) {
        return res.status(400).json({
            error: 'Invalid product ID.'
        });
    }

    try {
        const [products] = await db.query(
            `SELECT p.id, p.shop_id, s.shop_name, s.logo_url AS shop_logo_url,
                    c.name AS category, p.name, p.description, p.price_centavos,
                    p.original_price_centavos, p.stock, p.image_url
             FROM products p
             JOIN shops s ON s.id = p.shop_id
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.id = ? AND p.status = 'active' AND s.status = 'approved'`,
            [productId]
        );

        if (products.length === 0) {
            return res.status(404).json({
                error: 'Product not found.'
            });
        }

        res.json(products[0]);
    } catch (error) {
        console.error('Failed to fetch product:', error.message);
        res.status(500).json({
            error: 'Unable to load product.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Product Service running at http://localhost:${PORT}`);
});
