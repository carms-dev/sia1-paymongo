const test = require('node:test');
const assert = require('node:assert/strict');
const { postgresPlaceholders } = require('../database/sql');

test('converts positional placeholders to PostgreSQL parameters', () => {
    assert.equal(
        postgresPlaceholders('SELECT * FROM users WHERE email = ? AND id = ?'),
        'SELECT * FROM users WHERE email = $1 AND id = $2'
    );
});

test('does not convert question marks inside strings or comments', () => {
    assert.equal(
        postgresPlaceholders("SELECT '?' AS mark, value FROM items WHERE id = ? -- ignored ?\n/* ? */ AND label = 'it''s ?'"),
        "SELECT '?' AS mark, value FROM items WHERE id = $1 -- ignored ?\n/* ? */ AND label = 'it''s ?'"
    );
});

test('handles quoted identifiers and block comments around parameters', () => {
    assert.equal(
        postgresPlaceholders('SELECT "question?" FROM items /* ? */ WHERE id = ?'),
        'SELECT "question?" FROM items /* ? */ WHERE id = $1'
    );
});
