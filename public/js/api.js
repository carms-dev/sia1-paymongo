import { mockData } from "./mock-data.js";

const mockRequested = new URLSearchParams(window.location.search).get("mock") === "1";
if (mockRequested) window.sessionStorage.setItem("budol_mock_mode", "1");
export const USE_MOCK =
    mockRequested || window.sessionStorage.getItem("budol_mock_mode") === "1";

function appendQuery(path, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            query.set(key, String(value));
        }
    });
    const suffix = query.toString();
    return suffix ? `${path}?${suffix}` : path;
}

function normalizeProduct(product) {
    if (!product || typeof product !== "object" || Array.isArray(product)) {
        throw new Error("The product service returned an invalid product.");
    }
    const id = product.id ?? product.product_id;
    const name = product.name ?? product.product_name;
    const price = Number(product.price_centavos);
    const stock = Number(product.stock ?? product.quantity);
    if (id === undefined || typeof name !== "string" ||
        !Number.isSafeInteger(price) || price < 0 ||
        !Number.isFinite(stock) || stock < 0) {
        throw new Error("The product service returned incomplete product details.");
    }
    return {
        ...product,
        id,
        name,
        price_centavos: price,
        stock,
        image_url: product.image_url ?? null
    };
}

function normalizeProducts(data) {
    const products = Array.isArray(data) ? data : data?.products;
    if (!Array.isArray(products)) {
        throw new Error("The product service returned an invalid product list.");
    }
    const normalized = products.map(normalizeProduct);
    return {
        ...(Array.isArray(data) ? {} : data),
        products: normalized,
        total: Array.isArray(data) ? normalized.length : (data.total ?? normalized.length),
        page: Array.isArray(data) ? 1 : (data.page ?? 1),
        limit: Array.isArray(data) ? normalized.length : (data.limit ?? normalized.length)
    };
}

function normalizeOrder(data) {
    if (!data || typeof data !== "object" || !data.order || typeof data.order !== "object") {
        throw new Error("The order service returned an invalid order.");
    }
    const order = data.order;
    const items = Array.isArray(data.items)
        ? data.items
        : Array.isArray(order.items)
            ? order.items
            : null;
    if (!items) throw new Error("The order service returned invalid order items.");
    return { ...data, order, items };
}

function normalizeOrderList(data) {
    const orders = Array.isArray(data) ? data : data?.orders;
    if (!Array.isArray(orders)) {
        throw new Error("The order service returned an invalid order list.");
    }
    return {
        ...(Array.isArray(data) ? {} : data),
        orders: orders.map(order => {
            if (!order || typeof order !== "object" || Array.isArray(order) ||
                (order.items !== undefined && !Array.isArray(order.items))) {
                throw new Error("The order service returned an invalid order list item.");
            }
            return { ...order, items: order.items || [] };
        }),
        total: Array.isArray(data) ? orders.length : (data.total ?? orders.length),
        page: Array.isArray(data) ? 1 : (data.page ?? 1),
        limit: Array.isArray(data) ? orders.length : (data.limit ?? orders.length)
    };
}

function normalizeResponse(path, method, data) {
    const pathname = path.split("?")[0];
    if (/^\/api\/products\/[^/]+$/.test(pathname)) return normalizeProduct(data);
    if (pathname === "/api/products" ||
        /^\/api\/shops\/[^/]+\/products$/.test(pathname) ||
        pathname === "/api/seller/products" || pathname === "/api/admin/products") {
        return normalizeProducts(data);
    }
    if (pathname === "/api/orders" && method === "POST") return normalizeOrder(data);
    if (pathname === "/api/my/orders" || pathname === "/api/seller/orders" ||
        pathname === "/api/admin/orders") return normalizeOrderList(data);
    if (/^\/api\/orders\/[^/]+$/.test(pathname)) return normalizeOrder(data);
    return data;
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function paginated(items, params, key, defaultLimit = 20) {
    const requestedPage = Number.parseInt(params.get("page") || "1", 10);
    const requestedLimit = Number.parseInt(params.get("limit") || String(defaultLimit), 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : defaultLimit;
    const start = (page - 1) * limit;
    return {
        [key]: clone(items.slice(start, start + limit)),
        total: items.length,
        page,
        limit
    };
}

function getMockOrders() {
    const stored = window.sessionStorage.getItem("budol_mock_orders");
    if (!stored) return clone(mockData.orders);
    try {
        const orders = JSON.parse(stored);
        if (!Array.isArray(orders)) throw new Error("Mock order list is invalid.");
        return orders;
    } catch {
        throw new Error("Saved mock orders could not be read.");
    }
}

function mockRequest(path, method, body) {
    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;
    const params = url.searchParams;
    const products = mockData.products;
    const orders = getMockOrders();
    const shops = mockData.shops;

    if (pathname === "/api/auth/me") return { user: clone(mockData.user) };
    if (pathname === "/api/auth/register-seller") {
        return {
            user: {
                ...clone(mockData.user),
                role: "seller",
                shop: { id: 1, name: body?.shop_name || "Demo shop", status: "pending" }
            }
        };
    }
    if (pathname === "/api/auth/login" || pathname === "/api/auth/register") {
        return { user: clone(mockData.user) };
    }
    if (pathname === "/api/auth/logout") return { message: "Signed out." };

    if (pathname === "/api/products" || pathname === "/api/seller/products" ||
        pathname === "/api/admin/products") {
        let results = products.slice();
        const query = (params.get("q") || "").toLowerCase();
        const category = params.get("category");
        const shopId = params.get("shop_id");
        if (query) results = results.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(query));
        if (category) results = results.filter(p => p.category === category);
        if (shopId) results = results.filter(p => String(p.shop_id) === shopId);
        return paginated(results, params, "products");
    }
    const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch) return clone(products.find(p => String(p.id) === decodeURIComponent(productMatch[1])) || null);

    if (pathname === "/api/shops") return { shops: clone(shops) };
    const shopMatch = pathname.match(/^\/api\/shops\/([^/]+)$/);
    if (shopMatch) {
        const shop = shops.find(item => String(item.id) === decodeURIComponent(shopMatch[1]));
        return shop ? { shop: clone(shop) } : { shop: null };
    }
    const shopProductsMatch = pathname.match(/^\/api\/shops\/([^/]+)\/products$/);
    if (shopProductsMatch) {
        let results = products.filter(p =>
            String(p.shop_id) === decodeURIComponent(shopProductsMatch[1])
        );
        const query = (params.get("q") || "").toLowerCase();
        const category = params.get("category");
        if (query) results = results.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(query));
        if (category) results = results.filter(p => p.category === category);
        return paginated(results, params, "products");
    }

    if (pathname === "/api/orders" && method === "POST") {
        const items = (Array.isArray(body?.items) ? body.items : []).map(requestedItem => {
            const product = products.find(item => String(item.id) === String(requestedItem.product_id));
            if (!product) throw new Error(`Product ${requestedItem.product_id} is unavailable in mock data.`);
            const quantity = Number(requestedItem.quantity);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
                throw new Error("Mock order quantities must be between 1 and 99.");
            }
            return {
                product_id: product.id,
                product_name: product.name,
                price_centavos: product.price_centavos,
                quantity,
                line_total_centavos: product.price_centavos * quantity
            };
        });
        const id = Math.max(502, ...orders.map(order => Number(order.id) || 0)) + 1;
        const order = {
            id,
            order_number: `ORD-MOCK-${String(id).padStart(4, "0")}`,
            status: "pending",
            total_centavos: items.reduce((sum, item) => sum + item.line_total_centavos, 0),
            created_at: new Date().toISOString(),
            items
        };
        orders.unshift(order);
        window.sessionStorage.setItem("budol_mock_orders", JSON.stringify(orders));
        return { message: "Mock order created.", order };
    }
    if (pathname === "/api/my/orders" || pathname === "/api/seller/orders" ||
        pathname === "/api/admin/orders") {
        return paginated(orders, params, "orders");
    }
    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (orderMatch) {
        const order = orders.find(item => String(item.id) === decodeURIComponent(orderMatch[1]));
        if (!order) throw new Error("The requested mock order was not found.");
        return { order: clone(order), items: clone(order.items) };
    }
    if (pathname === "/api/checkout") {
        return { checkout_url: `/success.html?order_id=${encodeURIComponent(body?.order_id || "")}` };
    }

    if (pathname === "/api/seller/shop") {
        return method === "GET"
            ? { shop: clone(shops[0]) }
            : { shop: { ...clone(shops[0]), ...(body || {}) } };
    }
    if (pathname === "/api/seller/payments" || pathname === "/api/seller/activity") return [];
    if (pathname.startsWith("/api/seller/")) return { message: "Mock seller action complete." };

    if (pathname === "/api/admin/stats") {
        return { total_users: 3, buyers: 1, sellers: 1, admins: 1, banned: 0, pending_shops: 1, approved_shops: 2, actions_today: 4 };
    }
    if (pathname === "/api/admin/users") return paginated([mockData.user], params, "users");
    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/activity$/);
    if (adminUserMatch) return { logs: [], total: 0, page: 1, limit: 20 };
    if (/^\/api\/admin\/users\/[^/]+$/.test(pathname)) return { user: clone(mockData.user) };
    if (pathname === "/api/admin/shops") return paginated(shops, params, "shops");
    if (pathname === "/api/admin/activity") return { logs: [], total: 0, page: 1, limit: 20 };
    if (pathname === "/api/admin/payments") return [];
    if (pathname.startsWith("/api/admin/")) return { message: "Mock admin action complete." };
    throw new Error(`No mock response is defined for ${method} ${pathname}.`);
}

export async function api(path, { method = "GET", body } = {}) {
    const normalizedMethod = method.toUpperCase();
    if (USE_MOCK) {
        return normalizeResponse(path, normalizedMethod, mockRequest(path, normalizedMethod, body));
    }

    const headers = {};
    const options = {
        method: normalizedMethod,
        credentials: "same-origin",
        headers
    };
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }

    const response = await fetch(path, options);
    const responseText = await response.text();
    let data = null;
    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch {
            const error = new Error(`The server returned an invalid JSON response (${response.status}).`);
            error.status = response.status;
            throw error;
        }
    }
    if (!response.ok) {
        const error = new Error(data?.error || `Request failed (${response.status}).`);
        error.status = response.status;
        throw error;
    }
    return normalizeResponse(path, normalizedMethod, data);
}

export const registerBuyer = body => api("/api/auth/register", { method: "POST", body });
export const registerSeller = body => api("/api/auth/register-seller", { method: "POST", body });
export const login = body => api("/api/auth/login", { method: "POST", body });
export const getCurrentUser = () => api("/api/auth/me");
export const logout = () => api("/api/auth/logout", { method: "POST" });

export const getProducts = (params = {}) => api(appendQuery("/api/products", params));
export const getProduct = id => api(`/api/products/${encodeURIComponent(id)}`);
export const getShops = (params = {}) => api(appendQuery("/api/shops", params));
export const getShop = id => api(`/api/shops/${encodeURIComponent(id)}`);
export const getShopProducts = (id, params = {}) =>
    api(appendQuery(`/api/shops/${encodeURIComponent(id)}/products`, params));

export const createOrder = body => api("/api/orders", { method: "POST", body });
export const getMyOrders = (params = {}) => api(appendQuery("/api/my/orders", params));
export const getOrder = id => api(`/api/orders/${encodeURIComponent(id)}`);
export const createCheckout = body => api("/api/checkout", { method: "POST", body });

export const getSellerShop = () => api("/api/seller/shop");
export const updateSellerShop = body => api("/api/seller/shop", { method: "PUT", body });
export const getSellerProducts = (params = {}) => api(appendQuery("/api/seller/products", params));
export const createSellerProduct = body => api("/api/seller/products", { method: "POST", body });
export const updateSellerProduct = (id, body) =>
    api(`/api/seller/products/${encodeURIComponent(id)}`, { method: "PUT", body });
export const deleteSellerProduct = id =>
    api(`/api/seller/products/${encodeURIComponent(id)}`, { method: "DELETE" });
export const getSellerOrders = (params = {}) => api(appendQuery("/api/seller/orders", params));
export const updateSellerOrderStatus = (id, status) =>
    api(`/api/seller/orders/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } });
export const getSellerPayments = (params = {}) => api(appendQuery("/api/seller/payments", params));
export const getSellerActivity = (params = {}) => api(appendQuery("/api/seller/activity", params));

export const getAdminStats = () => api("/api/admin/stats");
export const getAdminUsers = (params = {}) => api(appendQuery("/api/admin/users", params));
export const getAdminUser = id => api(`/api/admin/users/${encodeURIComponent(id)}`);
export const updateAdminUserStatus = (id, status) =>
    api(`/api/admin/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } });
export const getAdminShops = (params = {}) => api(appendQuery("/api/admin/shops", params));
export const updateAdminShopStatus = (id, status) =>
    api(`/api/admin/shops/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } });
export const getAdminActivity = (params = {}) => api(appendQuery("/api/admin/activity", params));
export const getAdminUserActivity = (id, params = {}) =>
    api(appendQuery(`/api/admin/users/${encodeURIComponent(id)}/activity`, params));
export const getAdminProducts = (params = {}) => api(appendQuery("/api/admin/products", params));
export const getAdminOrders = (params = {}) => api(appendQuery("/api/admin/orders", params));
export const getAdminPayments = (params = {}) => api(appendQuery("/api/admin/payments", params));
