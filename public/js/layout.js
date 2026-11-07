import { getCurrentUser, logout } from "./api.js";
import { showToast } from "./ui.js";
import { getCount } from "./cart.js";

const categories = [
    ["All categories", ""],
    ["Electronics", "Electronics"],
    ["Mobile Accessories", "Mobile Accessories"],
    ["Fashion", "Fashion"],
    ["Beauty", "Beauty"],
    ["Home & Living", "Home & Living"],
    ["Groceries", "Groceries"],
    ["Gaming", "Gaming"],
    ["Sports", "Sports"],
    ["School Supplies", "School Supplies"],
    ["Appliances", "Appliances"]
];

function makeLink(label, href, className = "") {
    const link = document.createElement("a");
    link.textContent = label;
    link.href = href;
    if (className) link.className = className;
    return link;
}

function destinationForRole(role) {
    if (role === "admin") return "/admin/dashboard.html";
    if (role === "seller") return "/seller/dashboard.html";
    return "/index.html";
}

function fillAccountMenu(container, user) {
    container.replaceChildren();
    if (!user) {
        container.append(
            makeLink("Log in", "/login.html", "button button-ghost"),
            makeLink("Sign up", "/signup.html", "button button-primary")
        );
        return;
    }

    const name = document.createElement("span");
    name.className = "site-account-name";
    name.textContent = user.full_name || user.email || "My account";
    container.appendChild(name);
    if (user.role === "buyer") {
        container.appendChild(makeLink("My Account", "/account.html", "button button-ghost"));
        container.appendChild(makeLink("My Orders", "/orders.html", "button button-ghost"));
    } else {
        container.appendChild(makeLink(
            user.role === "admin" ? "Admin dashboard" : "Seller dashboard",
            destinationForRole(user.role),
            "button button-ghost"
        ));
    }

    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "button button-ghost";
    signOut.textContent = "Log out";
    signOut.addEventListener("click", async () => {
        signOut.disabled = true;
        try {
            await logout();
            window.location.assign("/index.html");
        } catch (error) {
            signOut.disabled = false;
            showToast(error.message, { kind: "error" });
        }
    });
    container.appendChild(signOut);
}

function renderHeader(container) {
    container.innerHTML = `
        <div class="utility-bar">
            <div class="site-width utility-inner">
                <span>Good finds for everyday life</span>
                <span>Philippines · Prices in PHP</span>
            </div>
        </div>
        <header class="store-header">
            <div class="site-width store-header-inner">
                <a class="store-logo" href="/index.html" aria-label="BUDOL home">
                    <span class="store-logo-mark" aria-hidden="true">B</span><span>BUDOL<span>.</span></span>
                </a>
                <form class="store-search" role="search">
                    <label class="visually-hidden" for="store-search-input">Search products</label>
                    <input id="store-search-input" type="search" name="q" placeholder="Search products and shops">
                    <button class="button button-primary" type="submit">Search</button>
                </form>
                <div class="store-header-actions">
                    <div class="account-menu" id="account-menu"></div>
                    <a class="button button-secondary cart-link" href="/cart.html" aria-label="Shopping cart">
                        Cart <span class="cart-count-badge" id="site-cart-count">0</span>
                    </a>
                </div>
            </div>
        </header>
        <nav class="category-strip" aria-label="Shop categories">
            <div class="site-width category-strip-inner"></div>
        </nav>`;

    const categoryContainer = container.querySelector(".category-strip-inner");
    categories.forEach(([label, category]) => {
        const href = category
            ? `/products.html?category=${encodeURIComponent(category)}`
            : "/products.html";
        categoryContainer.appendChild(makeLink(label, href));
    });

    const searchForm = container.querySelector(".store-search");
    searchForm.addEventListener("submit", event => {
        event.preventDefault();
        const query = new FormData(searchForm).get("q");
        const search = new URLSearchParams();
        if (typeof query === "string" && query.trim()) search.set("q", query.trim());
        const queryString = search.toString();
        window.location.assign(`/products.html${queryString ? `?${queryString}` : ""}`);
    });
}

function renderFooter(container) {
    container.innerHTML = `
        <footer class="store-footer">
            <div class="site-width store-footer-inner">
                <a class="store-logo" href="/index.html"><span class="store-logo-mark" aria-hidden="true">B</span><span>BUDOL<span>.</span></span></a>
                <p>Good finds for everyday life.</p>
                <nav aria-label="Footer navigation">
                    <a href="/products.html">Browse products</a>
                    <a href="/seller-signup.html">Sell on BUDOL</a>
                    <a href="/orders.html">My orders</a>
                </nav>
                <small>© 2026 BUDOL. Student project for SIA1.</small>
            </div>
        </footer>
        <nav class="mobile-bottom-nav" aria-label="Buyer navigation">
            <a href="/index.html"><span aria-hidden="true">⌂</span>Home</a>
            <a href="/products.html"><span aria-hidden="true">▦</span>Categories</a>
            <a href="/cart.html"><span aria-hidden="true">▣</span>Cart</a>
            <a href="/orders.html"><span aria-hidden="true">↗</span>Orders</a>
            <a href="/account.html"><span aria-hidden="true">○</span>Account</a>
        </nav>`;
}

export async function renderSiteLayout() {
    const header = document.getElementById("site-header");
    const footer = document.getElementById("site-footer");
    if (header) renderHeader(header);
    if (footer) renderFooter(footer);

    const countBadge = document.getElementById("site-cart-count");
    const updateCount = () => {
        try {
            if (countBadge) countBadge.textContent = String(getCount());
        } catch (error) {
            if (countBadge) countBadge.textContent = "!";
            showToast(error.message, { kind: "error", duration: 0 });
        }
    };
    updateCount();
    window.addEventListener("cart-changed", updateCount);
    window.addEventListener("storage", event => {
        if (event.key === "budol_cart") updateCount();
    });

    const searchForm = header?.querySelector(".store-search");
    if (searchForm) {
        const query = new URLSearchParams(window.location.search).get("q");
        const input = searchForm.querySelector("input");
        if (query && input) input.value = query;
    }

    const accountMenu = document.getElementById("account-menu");
    if (accountMenu) {
        try {
            const result = await getCurrentUser();
            fillAccountMenu(accountMenu, result.user);
            if (result.user?.role === "admin" || result.user?.role === "seller") {
                container.querySelector(".mobile-bottom-nav")?.setAttribute("hidden", "");
            }
        } catch (error) {
            if (error.status === 401) {
                fillAccountMenu(accountMenu, null);
            } else {
                fillAccountMenu(accountMenu, null);
                showToast(error.message, { kind: "error" });
            }
        }
    }
}

export function renderDashboardSidebar(role, activePage = "") {
    if (role !== "seller" && role !== "admin") {
        throw new TypeError("Dashboard sidebar role must be seller or admin.");
    }
    const sellerPages = [
        ["Overview", "dashboard.html"],
        ["Products", "products.html"],
        ["Orders", "orders.html"],
        ["Payments", "payments.html"],
        ["Shop profile", "shop-profile.html"],
        ["Activity", "activity.html"]
    ];
    const adminPages = [
        ["Overview", "dashboard.html"],
        ["Users", "users.html"],
        ["Shops", "shops.html"],
        ["Orders", "orders.html"],
        ["Payments", "payments.html"],
        ["Activity log", "activity-log.html"]
    ];
    const root = role === "seller" ? "/seller/" : "/admin/";
    const aside = document.createElement("aside");
    aside.className = "dashboard-sidebar";
    if (window.matchMedia("(max-width: 900px)").matches) aside.classList.add("is-collapsed");
    const title = document.createElement("h2");
    title.textContent = role === "seller" ? "Seller Center" : "Administration";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "dashboard-sidebar-toggle";
    toggle.textContent = "Menu";
    toggle.setAttribute("aria-expanded", String(!aside.classList.contains("is-collapsed")));
    toggle.setAttribute("aria-controls", `dashboard-navigation-${role}`);
    toggle.addEventListener("click", () => {
        aside.classList.toggle("is-collapsed");
        toggle.setAttribute("aria-expanded", String(!aside.classList.contains("is-collapsed")));
    });
    const nav = document.createElement("nav");
    nav.id = `dashboard-navigation-${role}`;
    nav.setAttribute("aria-label", `${role} navigation`);
    (role === "seller" ? sellerPages : adminPages).forEach(([label, page]) => {
        const link = makeLink(label, `${root}${page}`);
        if (page === activePage) link.setAttribute("aria-current", "page");
        nav.appendChild(link);
    });
    aside.append(title, toggle, nav);
    return aside;
}

if (document.getElementById("site-header") || document.getElementById("site-footer")) {
    renderSiteLayout();
}
