const crypto = require('crypto');

const expectedKey = process.env.INTERNAL_API_KEY || '';

if (process.env.NODE_ENV === 'production' && !expectedKey) {
    throw new Error('INTERNAL_API_KEY is required for production service-to-service requests.');
}

function requireInternalKey(req, res, next) {
    if (!expectedKey) return next();

    const providedKey = req.get('x-internal-key');
    if (
        typeof providedKey !== 'string' ||
        Buffer.byteLength(providedKey) !== Buffer.byteLength(expectedKey) ||
        !crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(expectedKey))
    ) {
        return res.status(403).json({ error: 'Internal service access is not authorized.' });
    }

    next();
}

module.exports = requireInternalKey;
