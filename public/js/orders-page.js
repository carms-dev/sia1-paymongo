import "./layout.js";
import { createCheckout, getMyOrders, logout } from "./api.js";
import { requireRole } from "./auth-guard.js";
import { formatDate, formatPeso, renderEmpty, renderError, renderSkeleton } from "./ui.js";

const content = document.getElementById("orders-content");
const params = new URLSearchParams(window.location.search);
const activeTab = params.get("status") || "all";
const tabs = [
    ["All", "all"],
    ["To Pay", "pending"],
    ["Paid", "paid"],
    ["Cancelled / Failed", "cancelled,failed"]
];
let currentPage = Math.max(1, Number(params.get("page")) || 1);
const pageLimit = 10;

function makeLink(label, href, className = "button button-secondary") {
    const link = document.createElement("a");
    link.className = className;
    link.href = href;
    link.textContent = label;
    return link;
}

function accountSidebar() {
    const nav = document.createElement("nav");
    nav.className = "account-sidebar";
    nav.setAttribute("aria-label", "Account navigation");
    [["My Account", "/account.html"], ["My Orders", "/orders.html"]].forEach(([label, href]) => {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = label;
        if (href === "/orders.html") link.setAttribute("aria-current", "page");
        nav.appendChild(link);
    });
    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "button button-ghost";
    signOut.textContent = "Log out";
    signOut.addEventListener("click", async () => {
        try {
            await logout();
            window.location.assign("/login.html");
        } catch (error) {
            showMessage(error.message);
        }
    });
    nav.appendChild(signOut);
    return nav;
}

function showMessage(message) {
    let panel = document.getElementById("orders-message");
    if (!panel) {
        panel = document.createElement("p");
        panel.id = "orders-message";
        panel.className = "form-message";
        panel.setAttribute("role", "alert");
        content.prepend(panel);
    }
    panel.textContent = message;
}

function safeImage(src, alt) {
    if (typeof src !== "string" || !src.trim()) return null;
    try {
        const url = new URL(src, window.location.origin);
        if (!["http:", "https:"].includes(url.protocol)) return null;
        const image = document.createElement("img");
        image.src = url.href;
        image.alt = alt;
        image.loading = "lazy";
        return image;
    } catch {
        return null;
    }
}

async function payNow(order, button) {
    button.disabled = true;
    button.textContent = "Opening checkout…";
    try {
        const result = await createCheckout({ order_id: order.id });
        const url = new URL(result.checkout_url, window.location.origin);
        if (url.origin !== window.location.origin &&
            !(url.protocol === "https:" && url.hostname === "checkout.paymongo.com")) {
            throw new Error("The payment service returned an unsafe checkout link.");
        }
        window.location.assign(url.href);
    } catch (error) {
        button.disabled = false;
        button.textContent = "Pay now";
        showMessage(`Could not start payment: ${error.message}`);
    }
}

function renderOrderCard(order) {
    const card = document.createElement("article");
    card.className = "order-card";
    const heading = document.createElement("div");
    heading.className = "order-card-heading";
    const info = document.createElement("div");
    const number = document.createElement("strong");
    number.textContent = order.order_number || `Order ${order.id}`;
    const date = document.createElement("p");
    date.className = "muted-note";
    date.textContent = formatDate(order.created_at);
    info.append(number, date);
    const badge = document.createElement("span");
    badge.className = `status-badge status-${order.status}`;
    badge.textContent = order.status;
    heading.append(info, badge);

    const preview = document.createElement("div");
    preview.className = "order-item-preview";
    const items = Array.isArray(order.items) ? order.items : [];
    items.slice(0, 4).forEach(item => {
        const wrapper = document.createElement("div");
        wrapper.className = "order-thumb";
        const image = safeImage(item.image_url, item.product_name || "Ordered product");
        if (image) wrapper.appendChild(image);
        else wrapper.textContent = (item.product_name || "Item").slice(0, 1).toUpperCase();
        wrapper.title = item.product_name || "Ordered product";
        preview.appendChild(wrapper);
    });
    const summary = document.createElement("div");
    summary.className = "order-card-summary";
    const itemText = document.createElement("span");
    itemText.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
    const amount = document.createElement("strong");
    amount.textContent = formatPeso(order.total_centavos);
    summary.append(itemText, amount);

    const actions = document.createElement("div");
    actions.className = "order-card-actions";
    if (order.status === "pending") {
        const payButton = document.createElement("button");
        payButton.type = "button";
        payButton.className = "button button-primary";
        payButton.textContent = "Pay now";
        payButton.addEventListener("click", () => payNow(order, payButton));
        actions.appendChild(payButton);
    }
    actions.appendChild(makeLink("View details", `/order-details.html?id=${encodeURIComponent(order.id)}`));
    card.append(heading, preview, summary, actions);
    return card;
}

function renderPagination(page, total, limit) {
    const pages = Math.ceil(total / limit);
    if (pages <= 1) return null;
    const nav = document.createElement("nav");
    nav.className = "pagination";
    nav.setAttribute("aria-label", "Order pages");
    if (page > 1) nav.appendChild(makeLink("Previous", orderUrl(page - 1), "button button-secondary"));
    const pageLabel = document.createElement("span");
    pageLabel.textContent = `Page ${page} of ${pages}`;
    nav.appendChild(pageLabel);
    if (page < pages) nav.appendChild(makeLink("Next", orderUrl(page + 1), "button button-secondary"));
    return nav;
}

function orderUrl(page) {
    const query = new URLSearchParams();
    if (activeTab !== "all") query.set("status", activeTab);
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return `/orders.html${suffix ? `?${suffix}` : ""}`;
}

async function loadOrders() {
    content.replaceChildren(renderSkeleton(3, { type: "list" }));
    try {
        const user = await requireRole("buyer");
        if (!user) return;
        const request = { page: currentPage, limit: pageLimit };
        if (activeTab !== "all") request.status = activeTab;
        const result = await getMyOrders(request);
        const layout = document.createElement("div");
        layout.className = "account-layout";
        layout.appendChild(accountSidebar());
        const main = document.createElement("section");
        main.className = "account-panel card";
        const heading = document.createElement("div");
        heading.className = "buyer-section-heading";
        const title = document.createElement("h1");
        title.textContent = "My Orders";
        const count = document.createElement("p");
        count.textContent = `${result.total} order${result.total === 1 ? "" : "s"}`;
        heading.append(title, count);
        const tabNav = document.createElement("nav");
        tabNav.className = "order-tabs";
        tabNav.setAttribute("aria-label", "Filter orders");
        tabs.forEach(([label, status]) => {
            const tab = document.createElement("a");
            tab.href = status === "all" ? "/orders.html" : `/orders.html?status=${encodeURIComponent(status)}`;
            tab.textContent = label;
            if (status === activeTab) tab.setAttribute("aria-current", "page");
            tabNav.appendChild(tab);
        });
        main.append(heading, tabNav);
        if (!result.orders.length) {
            main.appendChild(renderEmpty(
                "No orders in this view",
                "Try another order filter or browse the marketplace to find something new.",
                "Browse products",
                () => window.location.assign("/products.html")
            ));
        } else {
            const list = document.createElement("div");
            list.className = "order-list";
            result.orders.forEach(order => list.appendChild(renderOrderCard(order)));
            main.append(list);
            const pagination = renderPagination(result.page, result.total, result.limit);
            if (pagination) main.appendChild(pagination);
        }
        layout.appendChild(main);
        content.replaceChildren(layout);
    } catch (error) {
        content.replaceChildren(renderError(loadOrders, error.message));
    }
}

loadOrders();
