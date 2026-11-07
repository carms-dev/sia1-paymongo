import { mockData } from "./mock-data.js";

const mockRequested = new URLSearchParams(window.location.search).get("mock") === "1";
if (mockRequested) window.sessionStorage.setItem("budol_mock_mode", "1");
const mockRole = new URLSearchParams(window.location.search).get("role");
if (mockRequested && ["buyer", "seller", "admin", "guest"].includes(mockRole)) {
    window.sessionStorage.setItem("budol_mock_role", mockRole);
}
const mockLoginRole = new URLSearchParams(window.location.search).get("login_role");
if (mockRequested && ["buyer", "seller", "admin"].includes(mockLoginRole)) {
    window.sessionStorage.setItem("budol_mock_login_role", mockLoginRole);
}
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

function normalizePaymentList(data) {
    const payments = Array.isArray(data) ? data : data?.payments;
    if (!Array.isArray(payments)) {
        throw new Error("The payment service returned an invalid payment list.");
    }
    return {
        ...(Array.isArray(data) ? {} : data),
        payments,
        total: Array.isArray(data) ? payments.length : (data.total ?? payments.length),
        page: Array.isArray(data) ? 1 : (data.page ?? 1),
        limit: Array.isArray(data) ? payments.length : (data.limit ?? payments.length)
    };
}

function normalizeResponse(path, method, data) {
    const pathname = path.split("?")[0];
    if (pathname === "/api/seller/products" && method === "POST") {
        return { ...data, product: normalizeProduct(data.product) };
    }
    if (/^\/api\/seller\/products\/[^/]+$/.test(pathname) && method === "PUT") {
        return { ...data, product: normalizeProduct(data.product) };
    }
    if (/^\/api\/seller\/products\/[^/]+$/.test(pathname) && method === "GET") {
        return normalizeProduct(data);
    }
    if (/^\/api\/products\/[^/]+$/.test(pathname)) return normalizeProduct(data);
    if (pathname === "/api/products" ||
        /^\/api\/shops\/[^/]+\/products$/.test(pathname) ||
        ((pathname === "/api/seller/products" || pathname === "/api/admin/products") && method === "GET")) {
        return normalizeProducts(data);
    }
    if (pathname === "/api/orders" && method === "POST") return normalizeOrder(data);
    if (pathname === "/api/my/orders" || pathname === "/api/seller/orders" ||
        pathname === "/api/admin/orders") return normalizeOrderList(data);
    if ((pathname === "/api/seller/payments" || pathname === "/api/admin/payments") && method === "GET") {
        return normalizePaymentList(data);
    }
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

function getMockProducts() {
    const stored = window.sessionStorage.getItem("budol_mock_products");
    if (!stored) return clone(mockData.products);
    try {
        const products = JSON.parse(stored);
        if (!Array.isArray(products)) throw new Error("Mock product list is invalid.");
        return products;
    } catch {
        throw new Error("Saved mock products could not be read.");
    }
}

function mockRequest(path, method, body) {
    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;
    const params = url.searchParams;
    const products = getMockProducts();
    const orders = getMockOrders();
    const shops = mockData.shops;
    const activeMockRole = window.sessionStorage.getItem("budol_mock_role") || "buyer";
    const mockUserForRole = role => ({
        ...clone(mockData.user),
        role,
        shop: role === "seller"
            ? {
                id: 1,
                name: window.sessionStorage.getItem("budol_mock_shop_name") || "MNL Everyday",
                status: window.sessionStorage.getItem("budol_mock_shop_status") || "approved"
            }
            : null
    });
    const activeMockUser = {
        ...mockUserForRole(activeMockRole)
    };

    if (pathname === "/api/auth/me") {
        if (activeMockRole === "guest") {
            const error = new Error("Not signed in.");
            error.status = 401;
            throw error;
        }
        return { user: activeMockUser };
    }
    if (pathname === "/api/auth/register-seller") {
        window.sessionStorage.setItem("budol_mock_role", "seller");
        window.sessionStorage.setItem("budol_mock_shop_status", "pending");
        window.sessionStorage.setItem("budol_mock_shop_name", body?.shop_name || "Demo shop");
        return {
            user: {
                ...clone(mockData.user),
                role: "seller",
                shop: { id: 1, name: body?.shop_name || "Demo shop", status: "pending" }
            }
        };
    }
    if (pathname === "/api/auth/register") {
        window.sessionStorage.setItem("budol_mock_role", "buyer");
        window.sessionStorage.removeItem("budol_mock_shop_status");
        return { user: { ...clone(mockData.user), role: "buyer", shop: null } };
    }
    if (pathname === "/api/auth/login") {
        const role = activeMockRole === "guest"
            ? window.sessionStorage.getItem("budol_mock_login_role") || "buyer"
            : activeMockRole;
        window.sessionStorage.setItem("budol_mock_role", role);
        window.sessionStorage.removeItem("budol_mock_login_role");
        return { user: mockUserForRole(role) };
    }
    if (pathname === "/api/auth/logout") return { message: "Signed out." };

    if (method === "GET" && (pathname === "/api/products" || pathname === "/api/seller/products" ||
        pathname === "/api/admin/products")) {
        let results = products.slice();
        const query = (params.get("q") || "").toLowerCase();
        const category = params.get("category");
        const shopId = params.get("shop_id");
        if (query) results = results.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(query));
        if (category) results = results.filter(p => p.category === category);
        if (shopId) results = results.filter(p => String(p.shop_id) === shopId);
        if (pathname === "/api/seller/products" && activeMockRole === "seller") {
            results = results.filter(p => String(p.shop_id) === "1");
        }
        return paginated(results, params, "products");
    }
    const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch) {
        const product = products.find(p => String(p.id) === decodeURIComponent(productMatch[1]));
        if (!product) throw new Error("Product not found.");
        return clone(product);
    }
    const sellerProductMatch = pathname.match(/^\/api\/seller\/products\/([^/]+)$/);
    if (sellerProductMatch && method === "GET") {
        const product = products.find(p => String(p.id) === decodeURIComponent(sellerProductMatch[1]));
        if (!product) throw new Error("Product not found.");
        return clone(product);
    }
    if (sellerProductMatch && method === "DELETE") {
        const index = products.findIndex(p => String(p.id) === decodeURIComponent(sellerProductMatch[1]));
        if (index < 0) throw new Error("Product not found.");
        products.splice(index, 1);
        window.sessionStorage.setItem("budol_mock_products", JSON.stringify(products));
        return { message: "Mock product removed." };
    }
    if ((pathname === "/api/seller/products" && method === "POST") ||
        (sellerProductMatch && method === "PUT")) {
        const existing = sellerProductMatch
            ? products.find(p => String(p.id) === decodeURIComponent(sellerProductMatch[1]))
            : null;
        if (sellerProductMatch && !existing) throw new Error("Product not found.");
        const product = {
            ...(existing || {}),
            ...body,
            id: existing?.id || Math.max(...products.map(item => Number(item.id))) + 1,
            shop_id: 1,
            shop_name: "MNL Everyday",
            price_centavos: Number(body.price_centavos),
            original_price_centavos: body.original_price_centavos === "" ||
                body.original_price_centavos === null || body.original_price_centavos === undefined
                ? null
                : Number(body.original_price_centavos),
            stock: Number(body.stock)
        };
        if (existing) Object.assign(existing, product);
        else products.push(product);
        window.sessionStorage.setItem("budol_mock_products", JSON.stringify(products));
        return { product: clone(product) };
    }

    if (pathname === "/api/shops") {
        return { shops: clone(shops.filter(shop => shop.status === "approved")) };
    }
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
                shop_id: product.shop_id,
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
            customer_name: body.customer_name,
            customer_email: body.customer_email,
            phone: body.phone,
            region: body.region,
            province: body.province,
            city: body.city,
            barangay: body.barangay,
            address_line: body.address_line,
            postal_code: body.postal_code,
            delivery_notes: body.delivery_notes,
            items
        };
        orders.unshift(order);
        window.sessionStorage.setItem("budol_mock_orders", JSON.stringify(orders));
        return { message: "Mock order created.", order };
    }
    if (pathname === "/api/my/orders" || pathname === "/api/seller/orders" ||
        pathname === "/api/admin/orders") {
        let results = orders.slice();
        const status = params.get("status");
        if (status) {
            const allowed = status.split(",").map(value => value.trim());
            results = results.filter(order => allowed.includes(order.status));
        }
        if (pathname === "/api/seller/orders") {
            results = results.map(order => ({
                ...order,
                items: (order.items || []).filter(item => {
                    const product = products.find(entry => String(entry.id) === String(item.product_id));
                    return Number(item.shop_id ?? product?.shop_id) === 1;
                })
            })).filter(order => order.items.length);
        }
        return paginated(results, params, "orders");
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
        const shop = {
            ...clone(shops[0]),
            shop_name: window.sessionStorage.getItem("budol_mock_shop_name") || shops[0].shop_name,
            status: window.sessionStorage.getItem("budol_mock_shop_status") || "approved"
        };
        if (method === "GET") return { shop };
        Object.assign(shop, body || {});
        window.sessionStorage.setItem("budol_mock_shop_name", shop.shop_name);
        return { shop };
    }
    if (pathname === "/api/seller/orders" && method === "PATCH") return { message: "Mock seller action complete." };
    if (pathname === "/api/seller/payments") {
        const payments = clone(mockData.payments).filter(payment => {
            const order = orders.find(item => String(item.id) === String(payment.order_id));
            return (order?.items || []).some(item => {
                const product = products.find(entry => String(entry.id) === String(item.product_id));
                return Number(item.shop_id ?? product?.shop_id) === 1;
            });
        });
        return paginated(payments, params, "payments");
    }
    if (pathname === "/api/seller/activity") {
        let logs = clone(mockData.activity).filter(log => log.role === "seller");
        if (params.get("from")) logs = logs.filter(log => log.created_at.slice(0, 10) >= params.get("from"));
        if (params.get("to")) logs = logs.filter(log => log.created_at.slice(0, 10) <= params.get("to"));
        return paginated(logs, params, "logs");
    }
    if (pathname.startsWith("/api/seller/")) return { message: "Mock seller action complete." };

    if (pathname === "/api/admin/stats") {
        return {
            total_users: mockData.users.length,
            buyers: mockData.users.filter(user => user.role === "buyer").length,
            sellers: mockData.users.filter(user => user.role === "seller").length,
            admins: mockData.users.filter(user => user.role === "admin").length,
            banned: mockData.users.filter(user => user.status === "banned").length,
            pending_shops: shops.filter(shop => shop.status === "pending").length,
            approved_shops: shops.filter(shop => shop.status === "approved").length,
            actions_today: 4
        };
    }
    if (pathname === "/api/admin/users" && method === "GET") {
        let users = clone(mockData.users);
        const role = params.get("role");
        const status = params.get("status");
        const query = (params.get("q") || "").toLowerCase();
        if (role) users = users.filter(user => user.role === role);
        if (status) users = users.filter(user => user.status === status);
        if (query) users = users.filter(user => `${user.full_name} ${user.email}`.toLowerCase().includes(query));
        return paginated(users, params, "users");
    }
    const adminUserStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
    if (adminUserStatusMatch && method === "PATCH") {
        const user = mockData.users.find(item => String(item.id) === decodeURIComponent(adminUserStatusMatch[1]));
        if (!user || user.role === "admin") throw new Error("This mock account cannot be changed.");
        user.status = body.status;
        return { message: `User #${user.id} is now ${user.status}.` };
    }
    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/activity$/);
    if (adminUserMatch) {
        const userId = decodeURIComponent(adminUserMatch[1]);
        const logs = mockData.activity.filter(log => String(log.user_id) === userId);
        return paginated(logs, params, "logs");
    }
    if (/^\/api\/admin\/users\/[^/]+$/.test(pathname)) {
        const userId = decodeURIComponent(pathname.split("/").pop());
        const user = mockData.users.find(item => String(item.id) === userId);
        if (!user) throw new Error("User not found.");
        return { user: clone(user) };
    }
    if (pathname === "/api/admin/shops" && method === "GET") {
        let results = clone(shops);
        if (params.get("status")) results = results.filter(shop => shop.status === params.get("status"));
        return paginated(results, params, "shops");
    }
    const adminShopStatusMatch = pathname.match(/^\/api\/admin\/shops\/([^/]+)\/status$/);
    if (adminShopStatusMatch && method === "PATCH") {
        const shop = shops.find(item => String(item.id) === decodeURIComponent(adminShopStatusMatch[1]));
        if (!shop) throw new Error("Shop not found.");
        shop.status = body.status;
        return { message: `Shop #${shop.id} is now ${shop.status}.` };
    }
    if (pathname === "/api/admin/activity") {
        let logs = clone(mockData.activity);
        if (params.get("role")) logs = logs.filter(log => log.role === params.get("role"));
        if (params.get("user_id")) logs = logs.filter(log => String(log.user_id) === params.get("user_id"));
        if (params.get("action")) logs = logs.filter(log => log.action.toLowerCase().startsWith(params.get("action").toLowerCase()));
        if (params.get("from")) logs = logs.filter(log => log.created_at.slice(0, 10) >= params.get("from"));
        if (params.get("to")) logs = logs.filter(log => log.created_at.slice(0, 10) <= params.get("to"));
        return paginated(logs, params, "logs", 50);
    }
    if (pathname === "/api/admin/payments") {
        let payments = clone(mockData.payments);
        if (params.get("status")) payments = payments.filter(payment => payment.status === params.get("status"));
        const query = (params.get("q") || "").toLowerCase();
        if (query) payments = payments.filter(payment => `${payment.order_number} ${payment.buyer_name}`.toLowerCase().includes(query));
        return paginated(payments, params, "payments");
    }
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
export const getSellerProduct = id => api(`/api/seller/products/${encodeURIComponent(id)}`);
export const updateSellerOrderStatus = (id, body) =>
    api(`/api/seller/orders/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: typeof body === "string" ? { status: body } : body
    });
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
