import "./layout.js";
import { getMyOrders, logout } from "./api.js";
import { requireRole } from "./auth-guard.js";
import { formatDate, formatPeso, renderEmpty, renderError, renderSkeleton } from "./ui.js";

const content = document.getElementById("account-content");

function accountSidebar(active) {
    const nav = document.createElement("nav");
    nav.className = "account-sidebar";
    nav.setAttribute("aria-label", "Account navigation");
    [["My Account", "/account.html", "account"], ["My Orders", "/orders.html", "orders"]]
        .forEach(([label, href, key]) => {
            const link = document.createElement("a");
            link.href = href;
            link.textContent = label;
            if (key === active) link.setAttribute("aria-current", "page");
            nav.appendChild(link);
        });
    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "button button-ghost";
    signOut.textContent = "Log out";
    signOut.addEventListener("click", async () => {
        signOut.disabled = true;
        try {
            await logout();
            window.location.assign("/login.html");
        } catch (error) {
            signOut.disabled = false;
            const message = document.getElementById("account-message");
            if (message) message.textContent = error.message;
        }
    });
    nav.appendChild(signOut);
    return nav;
}

function renderRecentOrders(orders) {
    if (!orders.length) {
        return renderEmpty(
            "No orders yet",
            "Browse the marketplace and place your first order when you find something you like.",
            "Start shopping",
            () => window.location.assign("/products.html")
        );
    }
    const list = document.createElement("div");
    list.className = "account-recent-list";
    orders.slice(0, 3).forEach(order => {
        const card = document.createElement("article");
        card.className = "order-card";
        const heading = document.createElement("div");
        heading.className = "order-card-heading";
        const number = document.createElement("strong");
        number.textContent = order.order_number || `Order ${order.id}`;
        const status = document.createElement("span");
        status.className = `status-badge status-${order.status}`;
        status.textContent = order.status;
        heading.append(number, status);
        const date = document.createElement("p");
        date.className = "muted-note";
        date.textContent = formatDate(order.created_at);
        const amount = document.createElement("strong");
        amount.textContent = formatPeso(order.total_centavos);
        const details = document.createElement("a");
        details.className = "button button-secondary";
        details.href = `/order-details.html?id=${encodeURIComponent(order.id)}`;
        details.textContent = "View details";
        card.append(heading, date, amount, details);
        list.appendChild(card);
    });
    return list;
}

async function loadAccount() {
    content.replaceChildren(renderSkeleton(2, { type: "list" }));
    try {
        const user = await requireRole("buyer");
        if (!user) return;
        const result = await getMyOrders({ page: 1, limit: 3 });
        const layout = document.createElement("div");
        layout.className = "account-layout";
        layout.appendChild(accountSidebar("account"));
        const main = document.createElement("section");
        main.className = "account-panel card";
        const welcome = document.createElement("h1");
        welcome.textContent = `Welcome, ${user.full_name || "Buyer"}`;
        const intro = document.createElement("p");
        intro.textContent = "Manage your BUDOL account and keep track of your recent purchases.";
        const recentHeading = document.createElement("h2");
        recentHeading.textContent = "Recent orders";
        main.append(welcome, intro, recentHeading, renderRecentOrders(result.orders));
        layout.appendChild(main);
        content.replaceChildren(layout);
    } catch (error) {
        content.replaceChildren(renderError(loadAccount, error.message));
    }
}

loadAccount();
