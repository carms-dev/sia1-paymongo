import { USE_MOCK, getMyOrders, getProducts } from "./api.js";
import { renderDashboardSidebar } from "./layout.js";
import { getCurrentUser } from "./auth-guard.js";
import { add, clear, getCount, getItems, getTotal, remove, updateQuantity } from "./cart.js";
import { debounce, escapeHtml, formatDate, formatPeso, renderEmpty, renderError, renderSkeleton, showToast } from "./ui.js";

const productList = document.getElementById("product-list");
const cartState = document.getElementById("cart-state");
const stateDemo = document.getElementById("state-demo");
const orderList = document.getElementById("order-list");

function updateCartState() {
    const items = getItems();
    const count = getCount();
    cartState.textContent = `${items.length} distinct products · ${count} ${count === 1 ? "item" : "items"} · ${formatPeso(getTotal())}`;
}

function safeImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value, window.location.origin);
        return url.protocol === "https:" || url.origin === window.location.origin ? url.href : "";
    } catch {
        return "";
    }
}

function makeProductCard(product) {
    const card = document.createElement("article");
    card.className = "product-card";
    const imageBox = document.createElement("div");
    imageBox.className = "product-card-image";
    const imageUrl = safeImageUrl(product.image_url);
    if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = product.name || "Product image";
        image.loading = "lazy";
        imageBox.appendChild(image);
    } else {
        imageBox.textContent = "Product";
    }
    const body = document.createElement("div");
    body.className = "product-card-body";
    const title = document.createElement("h3");
    title.className = "product-card-title";
    title.textContent = product.name;
    const price = document.createElement("strong");
    price.className = "product-card-price";
    price.textContent = formatPeso(product.price_centavos);
    const shop = document.createElement("span");
    shop.className = "product-card-shop";
    shop.textContent = product.shop_name || "BUDOL shop";
    const date = document.createElement("span");
    date.className = "product-card-shop";
    date.textContent = `Sample date: ${formatDate(new Date())}`;
    const button = document.createElement("button");
    button.className = "button button-primary";
    button.type = "button";
    button.dataset.cy = "add-to-cart";
    button.textContent = "Add to cart";
    button.addEventListener("click", () => {
        try {
            add(product);
            updateCartState();
            showToast(`${product.name} added to cart.`, { kind: "success" });
        } catch (error) {
            showToast(error.message, { kind: "error" });
        }
    });
    body.append(title, price, shop, date, button);
    card.append(imageBox, body);
    return card;
}

async function loadProducts() {
    productList.replaceChildren(renderSkeleton(5));
    try {
        const result = await getProducts({ limit: 10 });
        const products = result.products;
        if (!Array.isArray(products)) throw new Error("The product service returned an unexpected response.");
        productList.replaceChildren();
        if (products.length === 0) {
            productList.appendChild(renderEmpty(
                "No sample products found",
                "Try loading the catalog again.",
                "Reload products",
                loadProducts
            ));
            return;
        }
        products.slice(0, 10).forEach(product => productList.appendChild(makeProductCard(product)));
    } catch (error) {
        productList.replaceChildren(renderError(loadProducts, error.message));
    }
}

async function loadOrders() {
    orderList.replaceChildren(renderSkeleton(2, { type: "list" }));
    try {
        const result = await getMyOrders({ limit: 5 });
        if (result.orders.length === 0) {
            orderList.replaceChildren(renderEmpty(
                "No orders yet",
                "Once you place an order, its status will appear here.",
                "Browse products",
                () => window.location.assign("/products.html")
            ));
            return;
        }
        orderList.replaceChildren();
        result.orders.forEach(order => {
            const card = document.createElement("article");
            card.className = "card test-section";
            const number = document.createElement("h3");
            number.textContent = order.order_number || `Order ${order.id}`;
            const status = document.createElement("span");
            const badgeClass = {
                pending: "status-pending",
                paid: "status-paid",
                approved: "status-approved",
                active: "status-active",
                failed: "status-failed",
                rejected: "status-rejected",
                banned: "status-banned",
                suspended: "status-suspended",
                shipped: "status-shipped"
            }[order.status];
            status.className = badgeClass ? `status-badge ${badgeClass}` : "status-badge";
            status.textContent = order.status || "Status unavailable";
            const total = document.createElement("p");
            total.textContent = `Total: ${formatPeso(order.total_centavos)}`;
            const created = document.createElement("p");
            created.textContent = order.created_at ? formatDate(order.created_at) : "Date unavailable";
            const count = document.createElement("p");
            count.textContent = `${order.items.length} order item${order.items.length === 1 ? "" : "s"}`;
            card.append(number, status, total, created, count);
            orderList.appendChild(card);
        });
    } catch (error) {
        orderList.replaceChildren(renderError(loadOrders, error.message));
    }
}

function setCurrentUserLabel(user) {
    const label = document.getElementById("current-user");
    label.textContent = user ? `Signed in as ${user.full_name} (${user.role})` : "Signed out";
}

async function init() {
    document.getElementById("dashboard-nav").appendChild(renderDashboardSidebar("seller", "products.html"));
    document.getElementById("refresh-products").addEventListener("click", loadProducts);
    document.getElementById("load-orders").addEventListener("click", loadOrders);
    document.getElementById("show-toast").addEventListener("click", () => showToast("Shared toast is working."));
    document.getElementById("clear-cart").addEventListener("click", () => {
        clear();
        updateCartState();
        showToast("Cart cleared.");
    });
    document.getElementById("show-modal").addEventListener("click", () => {
        document.getElementById("test-modal").hidden = false;
        document.getElementById("close-modal").focus();
    });
    document.getElementById("close-modal").addEventListener("click", () => {
        document.getElementById("test-modal").hidden = true;
        document.getElementById("show-modal").focus();
    });
    document.getElementById("show-empty").addEventListener("click", () => {
        stateDemo.replaceChildren(renderEmpty("Nothing here yet", "Add products to see them in this list.", "Browse products", () => {
            window.location.assign("/products.html");
        }));
    });
    document.getElementById("show-error").addEventListener("click", () => {
        stateDemo.replaceChildren(renderError(loadProducts, "Sample error state. Use Retry to reload products."));
    });
    document.getElementById("update-cart").addEventListener("click", () => {
        const item = getItems()[0];
        if (!item) return showToast("Add a product first.", { kind: "error" });
        updateQuantity(item.product_id, 2);
        updateCartState();
    });
    document.getElementById("remove-cart").addEventListener("click", () => {
        const item = getItems()[0];
        if (!item) return showToast("The cart is already empty.");
        remove(item.product_id);
        updateCartState();
    });
    window.addEventListener("cart-changed", updateCartState);
    const filterInput = document.getElementById("product-filter");
    const escapedPreview = document.getElementById("escaped-preview");
    filterInput.addEventListener("input", debounce(() => {
        const escaped = escapeHtml(filterInput.value);
        escapedPreview.textContent = escaped ? `Escaped preview: ${escaped}` : "";
        Array.from(productList.querySelectorAll(".product-card")).forEach(card => {
            card.hidden = !card.querySelector(".product-card-title").textContent
                .toLowerCase().includes(filterInput.value.trim().toLowerCase());
        });
    }, 180));

    try {
        setCurrentUserLabel(await getCurrentUser());
    } catch (error) {
        if (error.status === 401) setCurrentUserLabel(null);
        else {
            setCurrentUserLabel(null);
            showToast(error.message, { kind: "error" });
        }
    }
    updateCartState();
    await loadProducts();
    if (USE_MOCK) showToast("Mock data enabled for this page.");
}

init();
