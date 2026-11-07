import { getAdminActivity, getAdminOrders, getAdminPayments, getAdminShops, getAdminStats, getAdminUser, getAdminUserActivity, getAdminUsers, logout, updateAdminShopStatus, updateAdminUserStatus } from "./api.js";
import { requireRole } from "./auth-guard.js";
import { renderDashboardSidebar } from "./layout.js";
import { formatDate, formatPeso, renderEmpty, renderError, renderSkeleton, showToast } from "./ui.js";

const root = document.getElementById("admin-content");
const navigation = document.getElementById("admin-navigation");
const page = window.location.pathname.split("/").pop() || "dashboard.html";
const PAGE_SIZE = 20;

function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
}

function button(label, className = "button button-secondary") {
    const element = node("button", label, className);
    element.type = "button";
    return element;
}

function link(label, href) {
    const element = node("a", label, "button button-secondary");
    element.href = href;
    return element;
}

function badge(value) {
    const safeValue = String(value || "unknown");
    const classValue = safeValue.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    return node("span", safeValue.replaceAll("_", " "), `status-badge status-${classValue}`);
}

function heading(title, description, action) {
    const wrapper = node("div", undefined, "dashboard-page-heading");
    const copy = document.createElement("div");
    copy.append(node("h1", title));
    if (description) copy.append(node("p", description));
    wrapper.append(copy);
    if (action) wrapper.append(action);
    return wrapper;
}

function table(headers, rows) {
    const wrap = node("div", undefined, "table-wrap");
    const tableElement = node("table", undefined, "data-table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach(label => headerRow.append(node("th", label)));
    thead.append(headerRow);
    const tbody = document.createElement("tbody");
    rows.forEach(cells => {
        const row = document.createElement("tr");
        cells.forEach(value => {
            const cell = document.createElement("td");
            if (value instanceof Node) cell.append(value);
            else cell.textContent = String(value ?? "—");
            row.append(cell);
        });
        tbody.append(row);
    });
    tableElement.append(thead, tbody);
    wrap.append(tableElement);
    return wrap;
}

function queryState() {
    return new URLSearchParams(window.location.search);
}

function pageNumber(params = queryState()) {
    const value = Number(params.get("page") || 1);
    return Number.isInteger(value) && value > 0 ? value : 1;
}

function pagination(total, pageIndex, limit, reload) {
    const pageCount = Math.max(1, Math.ceil(Number(total || 0) / Number(limit || PAGE_SIZE)));
    const wrapper = node("div", undefined, "admin-pagination");
    wrapper.append(node("span", `Page ${pageIndex} of ${pageCount} · ${Number(total || 0)} records`, "dashboard-subtle"));
    const controls = node("div", undefined, "dashboard-row-actions");
    const previous = button("Previous");
    previous.disabled = pageIndex <= 1;
    previous.addEventListener("click", () => reload(pageIndex - 1));
    const next = button("Next");
    next.disabled = pageIndex >= pageCount;
    next.addEventListener("click", () => reload(pageIndex + 1));
    controls.append(previous, next);
    wrapper.append(controls);
    return wrapper;
}

function showLoading() {
    root.replaceChildren(renderSkeleton(4, { type: "list" }));
}

function showLoadError(error, retry) {
    if ([401, 403].includes(error.status)) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login.html?next=${encodeURIComponent(next)}`);
        return;
    }
    root.replaceChildren(renderError(retry, error.message));
}

function queryParams(extra = {}) {
    const params = queryState();
    Object.entries(extra).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") params.delete(key);
        else params.set(key, String(value));
    });
    return params;
}

function navigatePage(newPage, extras = {}) {
    const params = queryParams({ ...extras, page: newPage });
    const query = params.toString();
    window.location.assign(`${window.location.pathname}${query ? `?${query}` : ""}`);
}

function submitFilters(form) {
    const params = new URLSearchParams(new FormData(form));
    params.set("page", "1");
    const query = params.toString();
    window.location.assign(`${window.location.pathname}${query ? `?${query}` : ""}`);
}

function filterField(labelText, name, value, options) {
    const field = node("div", undefined, "form-field");
    const labelElement = node("label", labelText);
    labelElement.htmlFor = `filter-${name}`;
    const select = document.createElement("select");
    select.id = `filter-${name}`;
    select.name = name;
    options.forEach(([optionValue, optionLabel]) => {
        const option = node("option", optionLabel);
        option.value = optionValue;
        option.selected = value === optionValue;
        select.append(option);
    });
    field.append(labelElement, select);
    return field;
}

function textFilter(labelText, name, value, inputType = "search") {
    const field = node("div", undefined, "form-field");
    const labelElement = node("label", labelText);
    labelElement.htmlFor = `filter-${name}`;
    const input = document.createElement("input");
    input.id = `filter-${name}`;
    input.name = name;
    input.type = inputType;
    input.value = value || "";
    field.append(labelElement, input);
    return field;
}

function makeFilterForm(items, submitLabel = "Apply filters") {
    const form = node("form", undefined, "dashboard-toolbar admin-filter-form");
    form.addEventListener("submit", event => {
        event.preventDefault();
        submitFilters(form);
    });
    items.forEach(item => form.append(item));
    const submit = node("button", submitLabel, "button button-primary");
    submit.type = "submit";
    form.append(submit);
    return form;
}

function makeSection(title) {
    const section = node("section", undefined, "dashboard-section");
    section.append(node("h2", title));
    return section;
}

function statusMessage(value) {
    return String(value || "unknown").replaceAll("_", " ");
}

function activityTable(logs) {
    const rows = logs.map(log => [
        formatDate(log.created_at),
        log.full_name || `User ${log.user_id || "—"}`,
        log.email || "—",
        badge(log.role),
        log.action,
        log.details || "—",
        log.ip_address || "—"
    ]);
    return table(["Time", "User name", "Email", "Role", "Action", "Details", "IP address"], rows);
}

async function updateShop(shop, status, refresh) {
    const verb = status === "approved" ? "approve" : status === "rejected" ? "reject" : "suspend";
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} “${shop.shop_name}”?`)) return;
    try {
        await updateAdminShopStatus(shop.id, status);
        showToast(`Shop ${statusMessage(status)}.`, { kind: "success" });
        await refresh();
    } catch (error) {
        if ([401, 403].includes(error.status)) {
            showLoadError(error, refresh);
            return;
        }
        showToast(error.message, { kind: "error" });
    }
}

function shopActions(shop, refresh) {
    const actions = node("div", undefined, "dashboard-row-actions");
    const statuses = shop.status === "pending"
        ? [["Approve", "approved", "button button-primary"], ["Reject", "rejected", "button button-secondary"]]
        : shop.status === "approved"
            ? [["Suspend", "suspended", "button button-secondary"]]
            : [["Approve", "approved", "button button-primary"], ["Reject", "rejected", "button button-secondary"]];
    statuses.forEach(([label, status, className]) => {
        const action = button(label, className);
        action.dataset.cy = status === "approved"
            ? "admin-approve"
            : status === "rejected"
                ? "admin-reject"
                : "admin-suspend";
        action.addEventListener("click", () => updateShop(shop, status, refresh));
        actions.append(action);
    });
    return actions;
}

async function loadDashboard() {
    showLoading();
    try {
        const [stats, shopResult, activityResult] = await Promise.all([
            getAdminStats(),
            getAdminShops({ status: "pending", page: 1, limit: 5 }),
            getAdminActivity({ page: 1, limit: 10 })
        ]);
        root.replaceChildren(heading("Administration overview", "Marketplace accounts, shops, and recent activity."));
        const cards = node("div", undefined, "dashboard-card-grid admin-stat-grid");
        [
            ["Users", stats.total_users],
            ["Buyers", stats.buyers],
            ["Sellers", stats.sellers],
            ["Banned", stats.banned],
            ["Pending shops", stats.pending_shops],
            ["Actions today", stats.actions_today]
        ].forEach(([label, value]) => {
            const card = node("article", undefined, "dashboard-stat");
            card.append(node("span", label), node("strong", String(value ?? 0)));
            cards.append(card);
        });
        root.append(cards);

        const pending = makeSection("Pending shop approvals");
        if (!shopResult.shops.length) {
            pending.append(renderEmpty("No shops waiting for review", "New seller applications will appear here.", "View all shops", () => window.location.assign("/admin/shops.html?status=pending")));
        } else {
            pending.append(table(["Shop", "Owner", "Email", "Submitted", "Actions"], shopResult.shops.map(shop => [
                shop.shop_name,
                shop.full_name,
                shop.email,
                formatDate(shop.created_at),
                shopActions(shop, loadDashboard)
            ])));
        }
        root.append(pending);

        const activity = makeSection("Latest activity");
        if (!activityResult.logs.length) {
            activity.append(renderEmpty("No activity recorded", "Account and shop actions will appear here."));
        } else {
            activity.append(activityTable(activityResult.logs));
        }
        activity.append(link("Full activity log", "/admin/activity-log.html"));
        root.append(activity);
    } catch (error) {
        showLoadError(error, loadDashboard);
    }
}

async function updateUser(user, status, refresh) {
    const verb = status === "banned" ? "ban" : "activate";
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} ${user.full_name}?`)) return;
    try {
        await updateAdminUserStatus(user.id, status);
        showToast(`Account ${statusMessage(status)}.`, { kind: "success" });
        await refresh();
    } catch (error) {
        if ([401, 403].includes(error.status)) {
            showLoadError(error, refresh);
            return;
        }
        showToast(error.message, { kind: "error" });
    }
}

async function loadUsers() {
    showLoading();
    const params = queryState();
    const currentPage = pageNumber(params);
    const filters = makeFilterForm([
        filterField("Role", "role", params.get("role") || "", [["", "All roles"], ["buyer", "Buyer"], ["seller", "Seller"], ["admin", "Admin"]]),
        filterField("Status", "status", params.get("status") || "", [["", "All statuses"], ["active", "Active"], ["banned", "Banned"]]),
        textFilter("Search name or email", "q", params.get("q"))
    ]);
    try {
        const result = await getAdminUsers({ role: params.get("role"), status: params.get("status"), q: params.get("q"), page: currentPage, limit: PAGE_SIZE });
        const section = makeSection("Marketplace users");
        section.append(filters);
        if (!result.users.length) {
            section.append(renderEmpty("No users found", "Try changing or clearing the filters.", "Clear filters", () => window.location.assign("/admin/users.html")));
        } else {
            section.append(table(["Name", "Email", "Role", "Status", "Shop", "Actions"], result.users.map(user => {
                const name = node("a", user.full_name, "admin-user-link");
                name.href = `/admin/user-details.html?id=${encodeURIComponent(user.id)}`;
                const actions = node("div", undefined, "dashboard-row-actions");
                if (user.role !== "admin") {
                    const nextStatus = user.status === "banned" ? "active" : "banned";
                    const action = button(nextStatus === "banned" ? "Ban" : "Activate", nextStatus === "banned" ? "button button-secondary" : "button button-primary");
                    action.dataset.cy = nextStatus === "banned" ? "admin-ban" : "admin-activate";
                    action.addEventListener("click", () => updateUser(user, nextStatus, loadUsers));
                    actions.append(action);
                } else {
                    actions.textContent = "Admin accounts cannot be banned";
                }
                return [name, user.email, badge(user.role), badge(user.status), user.shop_name || "—", actions];
            })));
        }
        section.append(pagination(result.total, result.page, result.limit, next => navigatePage(next)));
        root.replaceChildren(heading("Users", "Search accounts and manage access."), section);
    } catch (error) {
        showLoadError(error, loadUsers);
    }
}

async function loadUserDetails() {
    showLoading();
    const params = queryState();
    const userId = params.get("id");
    const currentPage = pageNumber(params);
    if (!userId || !/^\d+$/.test(userId)) {
        root.replaceChildren(heading("User details", "A valid user ID is required."), renderEmpty("User not found", "Choose an account from the users list.", "Back to users", () => window.location.assign("/admin/users.html")));
        return;
    }
    try {
        const [result, activity] = await Promise.all([
            getAdminUser(userId),
            getAdminUserActivity(userId, { page: currentPage, limit: PAGE_SIZE })
        ]);
        const user = result.user;
        const profile = makeSection("Account profile");
        profile.append(table(["Name", "Email", "Role", "Status", "Account ID"], [[
            user.full_name, user.email, badge(user.role), badge(user.status), user.id
        ]]));
        if (user.role === "seller") {
            profile.append(node("h2", "Shop information"));
            profile.append(table(["Shop", "Shop ID", "Status"], [[
                user.shop_name || "—", user.shop_id || "—", user.shop_status ? badge(user.shop_status) : "—"
            ]]));
        }
        const timeline = makeSection("Activity timeline");
        if (!activity.logs.length) timeline.append(renderEmpty("No activity found", "This user has no recorded activity yet."));
        else timeline.append(activityTable(activity.logs));
        timeline.append(pagination(activity.total, activity.page, activity.limit, next => navigatePage(next)));
        root.replaceChildren(heading("User details", `Reviewing account ${user.id}.`, link("Back to users", "/admin/users.html")), profile, timeline);
    } catch (error) {
        showLoadError(error, loadUserDetails);
    }
}

async function loadShops() {
    showLoading();
    const params = queryState();
    const currentPage = pageNumber(params);
    const filters = makeFilterForm([
        filterField("Shop status", "status", params.get("status") || "", [
            ["", "All statuses"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["suspended", "Suspended"]
        ])
    ]);
    try {
        const result = await getAdminShops({ status: params.get("status"), page: currentPage, limit: PAGE_SIZE });
        const section = makeSection("Seller shops");
        section.append(filters);
        if (!result.shops.length) section.append(renderEmpty("No shops found", "Try another status filter."));
        else section.append(table(["Shop", "Owner", "Email", "Status", "Created", "Actions"], result.shops.map(shop => [
            shop.shop_name, shop.full_name, shop.email, badge(shop.status), formatDate(shop.created_at), shopActions(shop, loadShops)
        ])));
        section.append(pagination(result.total, result.page, result.limit, next => navigatePage(next)));
        root.replaceChildren(heading("Shops", "Review seller applications and manage shop status."), section);
    } catch (error) {
        showLoadError(error, loadShops);
    }
}

async function loadOrders() {
    showLoading();
    const params = queryState();
    const currentPage = pageNumber(params);
    const filters = makeFilterForm([
        filterField("Order status", "status", params.get("status") || "", [
            ["", "All statuses"], ["pending", "Pending"], ["paid", "Paid"], ["cancelled", "Cancelled"], ["failed", "Failed"]
        ]),
        textFilter("Search order or buyer", "q", params.get("q"))
    ]);
    try {
        const result = await getAdminOrders({ status: params.get("status"), q: params.get("q"), page: currentPage, limit: PAGE_SIZE });
        const section = makeSection("Marketplace orders");
        section.append(filters);
        if (!result.orders.length) section.append(renderEmpty("No orders found", "Try changing the status or search filters."));
        else section.append(table(["Order", "Buyer", "Date", "Items", "Total", "Status"], result.orders.map(order => [
            order.order_number || `Order ${order.id}`,
            order.customer_name || order.buyer_name || order.customer_email || "—",
            formatDate(order.created_at),
            order.items.length,
            formatPeso(order.total_centavos),
            badge(order.status)
        ])));
        section.append(pagination(result.total, result.page, result.limit, next => navigatePage(next)));
        root.replaceChildren(heading("Orders", "Platform-wide order records."), section);
    } catch (error) {
        showLoadError(error, loadOrders);
    }
}

async function loadPayments() {
    showLoading();
    const params = queryState();
    const currentPage = pageNumber(params);
    const filters = makeFilterForm([
        filterField("Payment status", "status", params.get("status") || "", [
            ["", "All statuses"], ["paid", "Paid"], ["pending", "Pending"], ["failed", "Failed"], ["cancelled", "Cancelled"], ["expired", "Expired"]
        ]),
        textFilter("Search order or buyer", "q", params.get("q"))
    ]);
    try {
        const result = await getAdminPayments({ status: params.get("status"), q: params.get("q"), page: currentPage, limit: PAGE_SIZE });
        const section = makeSection("Marketplace payments");
        section.append(filters);
        const payments = result.payments || [];
        if (!payments.length) section.append(renderEmpty("No payments found", "Payment records will appear here when available."));
        else section.append(table(["Order", "Buyer", "Amount", "Method", "Status", "Date"], payments.map(payment => [
            payment.order_number || `Order ${payment.order_id}`,
            payment.buyer_name || "—",
            formatPeso(payment.amount_centavos),
            payment.payment_method || "PayMongo Checkout",
            badge(payment.status),
            formatDate(payment.created_at)
        ])));
        section.append(pagination(result.total, result.page, result.limit, next => navigatePage(next)));
        root.replaceChildren(heading("Payments", "Platform-wide payment records. Payment credentials are never displayed."), section);
    } catch (error) {
        showLoadError(error, loadPayments);
    }
}

function csvCell(value) {
    const rawValue = String(value ?? "");
    const stringValue = /^[\t\r\n ]*[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
    return `"${stringValue.replaceAll('"', '""')}"`;
}

async function loadActivity() {
    showLoading();
    const params = queryState();
    const currentPage = pageNumber(params);
    const filterForm = makeFilterForm([
        filterField("Role", "role", params.get("role") || "", [["", "All roles"], ["buyer", "Buyer"], ["seller", "Seller"], ["admin", "Admin"]]),
        textFilter("Action", "action", params.get("action"), "text"),
        textFilter("From", "from", params.get("from"), "date"),
        textFilter("To", "to", params.get("to"), "date"),
        textFilter("User ID", "user_id", params.get("user_id"), "number")
    ]);
    try {
        const result = await getAdminActivity({
            role: params.get("role"),
            action: params.get("action"),
            from: params.get("from"),
            to: params.get("to"),
            user_id: params.get("user_id"),
            page: currentPage,
            limit: PAGE_SIZE
        });
        const section = makeSection("Activity log");
        section.append(filterForm);
        if (!result.logs.length) section.append(renderEmpty("No activity found", "Try adjusting the role, action, date, or user filters."));
        else section.append(activityTable(result.logs));
        const download = button("Download CSV", "button button-secondary");
        download.addEventListener("click", () => {
            const headers = ["time", "user_name", "email", "role", "action", "details", "ip_address"];
            const rows = result.logs.map(log => [
                log.created_at, log.full_name, log.email, log.role, log.action, log.details, log.ip_address
            ]);
            const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
            const anchor = node("a");
            anchor.href = url;
            anchor.download = `budol-activity-page-${result.page}.csv`;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        section.append(download);
        section.append(pagination(result.total, result.page, result.limit, next => navigatePage(next)));
        root.replaceChildren(heading("Activity log", "Filter, review, and export the currently loaded history rows."), section);
    } catch (error) {
        showLoadError(error, loadActivity);
    }
}

function setupShell() {
    const aside = renderDashboardSidebar("admin", page);
    const signOut = button("Log out", "button button-ghost");
    signOut.addEventListener("click", async () => {
        signOut.disabled = true;
        try {
            await logout();
            window.location.assign("/login.html");
        } catch (error) {
            signOut.disabled = false;
            if ([401, 403].includes(error.status)) showLoadError(error, loadCurrentPage);
            else showToast(error.message, { kind: "error" });
        }
    });
    aside.querySelector("nav").append(signOut);
    navigation.replaceChildren(aside);
}

async function loadCurrentPage() {
    if (page === "dashboard.html") return loadDashboard();
    if (page === "users.html") return loadUsers();
    if (page === "user-details.html") return loadUserDetails();
    if (page === "shops.html") return loadShops();
    if (page === "orders.html") return loadOrders();
    if (page === "payments.html") return loadPayments();
    if (page === "activity-log.html") return loadActivity();
    root.replaceChildren(renderEmpty("Admin page not found", "Go back to the administration overview.", "Admin overview", () => window.location.assign("/admin/dashboard.html")));
}

async function start() {
    showLoading();
    try {
        const user = await requireRole("admin");
        if (!user) return;
        setupShell();
        await loadCurrentPage();
    } catch (error) {
        showLoadError(error, start);
    }
}

start();
