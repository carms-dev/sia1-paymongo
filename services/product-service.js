
const express = require('express');
const db = require('../database/db');
const requireInternalKey = require('./internal-auth');

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(express.json());
app.use('/api', requireInternalKey);

function sellerShop(req) {
    const shopId = Number(req.headers['x-shop-id']);
    return req.headers['x-user-role'] === 'seller' &&
        Number.isSafeInteger(shopId) && shopId > 0
        ? shopId
        : null;
}

function validProduct(body) {
    const price = Number(body.price_centavos);
    const originalPrice = body.original_price_centavos === null ||
        body.original_price_centavos === undefined || body.original_price_centavos === ''
        ? null
        : Number(body.original_price_centavos);
    const stock = Number(body.stock);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : '';

    if (!name || name.length > 200 || description.length > 5000 ||
        !category || category.length > 80 ||
        !Number.isSafeInteger(price) || price < 0 || price > 2147483647 ||
        (originalPrice !== null && (
            !Number.isSafeInteger(originalPrice) || originalPrice < 0 || originalPrice > 2147483647
        )) ||
        !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000 ||
        imageUrl.length > 500) {
        return { error: 'Provide a valid product name, category, price, stock, and image URL.' };
    }

    if (imageUrl) {
        try {
            const url = new URL(imageUrl);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid URL protocol.');
        } catch {
            return { error: 'Image URL must be a valid HTTP or HTTPS link.' };
        }
    }
    return { name, description, category, price, originalPrice, stock, imageUrl: imageUrl || null };
}

async function categoryId(name) {
    const [rows] = await db.execute(
        'SELECT id FROM categories WHERE name = ? LIMIT 1',
        [name]
    );
    return rows[0]?.id ?? null;
}

// Check whether the Product Service is running
app.get('/health', (req, res) => {
    res.json({
        message: 'Product Service is running!'
    });
});

// Get all active products
app.get('/api/products', async (req, res) => {
    try {
        const shopId = Number(req.query.shop_id);
        const ownShopId = sellerShop(req);
        const isSellerListing = ownShopId !== null;
        if (isSellerListing && shopId !== ownShopId) {
            return res.status(403).json({ error: 'You may only view your own products.' });
        }
        const conditions = isSellerListing
            ? ['p.shop_id = ?', 's.user_id = ?']
            : ["p.status = 'active'", "s.status = 'approved'"];
        const values = [];
        if (isSellerListing) values.push(ownShopId, Number(req.headers['x-user-id']));
        if (req.query.shop_id && Number.isSafeInteger(shopId) && shopId > 0) {
            if (!isSellerListing) {
                conditions.push('p.shop_id = ?');
                values.push(shopId);
            }
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
                   p.original_price_centavos, p.stock, p.image_url, p.status
             FROM products p
             JOIN shops s ON s.id = p.shop_id
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY p.id DESC`,
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

app.post('/api/products', async (req, res) => {
    const shopId = sellerShop(req);
    if (!shopId) return res.status(403).json({ error: 'A seller shop is required.' });
    const userId = Number(req.headers['x-user-id']);
    const product = validProduct(req.body || {});
    if (product.error) return res.status(400).json({ error: product.error });

    try {
        const category = await categoryId(product.category);
        if (!category) return res.status(400).json({ error: 'Choose a valid product category.' });
        const [result] = await db.execute(
            `INSERT INTO products
                (shop_id, category_id, name, description, price_centavos,
                 original_price_centavos, stock, image_url)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
                 SELECT 1 FROM shops WHERE id = ? AND user_id = ? AND status = 'approved'
             )
             RETURNING id`,
            [shopId, category, product.name, product.description || null,
                product.price, product.originalPrice, product.stock, product.imageUrl,
                shopId, userId]
        );
        if (!result.rows?.length) {
            return res.status(403).json({ error: 'The shop is not approved to post products.' });
        }
        const [rows] = await db.execute(
            `SELECT p.id, p.shop_id, s.shop_name, c.name AS category, p.name,
                    p.description, p.price_centavos, p.original_price_centavos,
                    p.stock, p.image_url, p.status
             FROM products p
             JOIN shops s ON s.id = p.shop_id
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.id = ?`,
            [result.rows[0].id]
        );
        res.status(201).json({ product: rows[0] });
    } catch (error) {
        console.error('Failed to create product:', error.message);
        res.status(500).json({ error: 'Unable to save the product.' });
    }
});

app.put('/api/products/:id', async (req, res) => {
    const shopId = sellerShop(req);
    const productId = Number(req.params.id);
    if (!shopId) return res.status(403).json({ error: 'A seller shop is required.' });
    if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(400).json({ error: 'Invalid product ID.' });
    }
    const product = validProduct(req.body || {});
    if (product.error) return res.status(400).json({ error: product.error });

    try {
        const category = await categoryId(product.category);
        if (!category) return res.status(400).json({ error: 'Choose a valid product category.' });
        const [result] = await db.execute(
            `UPDATE products
             SET category_id = ?, name = ?, description = ?, price_centavos = ?,
                 original_price_centavos = ?, stock = ?, image_url = ?
             WHERE id = ? AND shop_id = ?`,
            [category, product.name, product.description || null, product.price,
                product.originalPrice, product.stock, product.imageUrl, productId, shopId]
        );
        if (!result.affectedRows) return res.status(404).json({ error: 'Product not found in your shop.' });
        const [rows] = await db.execute(
            `SELECT p.id, p.shop_id, s.shop_name, c.name AS category, p.name,
                    p.description, p.price_centavos, p.original_price_centavos,
                    p.stock, p.image_url, p.status
             FROM products p
             JOIN shops s ON s.id = p.shop_id
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.id = ?`,
            [productId]
        );
        res.json({ product: rows[0] });
    } catch (error) {
        console.error('Failed to update product:', error.message);
        res.status(500).json({ error: 'Unable to update the product.' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    const shopId = sellerShop(req);
    const productId = Number(req.params.id);
    if (!shopId) return res.status(403).json({ error: 'A seller shop is required.' });
    if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(400).json({ error: 'Invalid product ID.' });
    }
    try {
        const [result] = await db.execute(
            `UPDATE products SET status = 'hidden' WHERE id = ? AND shop_id = ?`,
            [productId, shopId]
        );
        if (!result.affectedRows) return res.status(404).json({ error: 'Product not found in your shop.' });
        res.json({ message: 'Product removed from your shop.' });
    } catch (error) {
        console.error('Failed to remove product:', error.message);
        res.status(500).json({ error: 'Unable to remove the product.' });
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
        const ownShopId = sellerShop(req);
        const userId = Number(req.headers['x-user-id']);
        const ownsProducts = ownShopId && Number.isSafeInteger(userId);
        const query = ownsProducts
            ? `SELECT p.id, p.shop_id, s.shop_name, s.logo_url AS shop_logo_url,
                      c.name AS category, p.name, p.description, p.price_centavos,
                      p.original_price_centavos, p.stock, p.image_url, p.status
               FROM products p
               JOIN shops s ON s.id = p.shop_id
               LEFT JOIN categories c ON c.id = p.category_id
               WHERE p.id = ? AND p.shop_id = ? AND s.user_id = ?`
            : `SELECT p.id, p.shop_id, s.shop_name, s.logo_url AS shop_logo_url,
                      c.name AS category, p.name, p.description, p.price_centavos,
                      p.original_price_centavos, p.stock, p.image_url
               FROM products p
               JOIN shops s ON s.id = p.shop_id
               LEFT JOIN categories c ON c.id = p.category_id
               WHERE p.id = ? AND p.status = 'active' AND s.status = 'approved'`;
        const values = ownsProducts
            ? [productId, ownShopId, userId]
            : [productId];
        const [products] = await db.query(query, values);

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
