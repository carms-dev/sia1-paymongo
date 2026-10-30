const STORAGE_KEY = "budol_cart";

function normalizeId(value) {
    if (typeof value !== "string" && typeof value !== "number") {
        throw new TypeError("Cart product ID is required.");
    }
    const id = String(value).trim();
    if (!id) throw new TypeError("Cart product ID is required.");
    return id;
}

function readCart() {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return [];
    let items;
    try {
        items = JSON.parse(stored);
    } catch {
        throw new Error("The saved cart is unreadable. Clear browser storage to continue.");
    }
    if (!Array.isArray(items)) throw new Error("The saved cart has an invalid format.");
    items.forEach(item => {
        if (!item || (typeof item.product_id !== "string" && typeof item.product_id !== "number") ||
            !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 ||
            !Number.isSafeInteger(item.price_centavos) || item.price_centavos < 0) {
            throw new Error("The saved cart contains an invalid item.");
        }
        if (item.stock !== undefined &&
            (!Number.isInteger(item.stock) || item.stock < 0)) {
            throw new Error("The saved cart contains invalid stock information.");
        }
    });
    return items;
}

function writeCart(items) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("cart-changed", {
        detail: { items, count: items.reduce((sum, item) => sum + item.quantity, 0), total: total(items) }
    }));
    return items;
}

export function total(items = readCart()) {
    const value = items.reduce((sum, item) => sum + item.price_centavos * item.quantity, 0);
    if (!Number.isSafeInteger(value)) throw new RangeError("Cart total exceeds the supported amount.");
    return value;
}

export function getItems() {
    return readCart();
}

export function getCount() {
    return readCart().reduce((sum, item) => sum + item.quantity, 0);
}

export function add(product, quantity = 1) {
    if (!product || typeof product !== "object") throw new TypeError("A product is required.");
    const id = normalizeId(product.product_id ?? product.id);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new RangeError("Quantity must be between 1 and 99.");
    }
    if (!Number.isSafeInteger(Number(product.price_centavos)) || Number(product.price_centavos) < 0) {
        throw new TypeError("Product price must be an integer number of centavos.");
    }
    const stock = Number(product.stock);
    if (!Number.isInteger(stock) || stock < 1) throw new RangeError("This product is out of stock.");
    const items = readCart();
    const existing = items.find(item => String(item.product_id) === id);
    if (existing) {
        if (existing.quantity + quantity > Math.min(99, stock)) {
            throw new RangeError("The requested quantity exceeds available stock.");
        }
        existing.quantity += quantity;
        Object.assign(existing, {
            name: String(product.name ?? existing.name ?? ""),
            price_centavos: Number(product.price_centavos),
            stock,
            image_url: product.image_url ?? existing.image_url ?? null,
            shop_id: product.shop_id ?? existing.shop_id ?? null,
            shop_name: String(product.shop_name ?? existing.shop_name ?? "")
        });
    } else {
        items.push({
            product_id: product.product_id ?? product.id,
            quantity,
            name: String(product.name ?? ""),
            price_centavos: Number(product.price_centavos),
            stock,
            image_url: product.image_url ?? null,
            shop_id: product.shop_id ?? null,
            shop_name: String(product.shop_name ?? "")
        });
    }
    return writeCart(items);
}

export function updateQuantity(productId, quantity) {
    const id = normalizeId(productId);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
        throw new RangeError("Quantity must be between 0 and 99.");
    }
    if (quantity === 0) return remove(id);
    const items = readCart();
    const item = items.find(entry => String(entry.product_id) === id);
    if (!item) throw new Error("That product is not in the cart.");
    if (item.stock !== undefined && quantity > item.stock) {
        throw new RangeError("The requested quantity exceeds available stock.");
    }
    item.quantity = quantity;
    return writeCart(items);
}

export const update = updateQuantity;

export function remove(productId) {
    const id = normalizeId(productId);
    return writeCart(readCart().filter(item => String(item.product_id) !== id));
}

export function clear() {
    return writeCart([]);
}

export function getTotal() {
    return total();
}
