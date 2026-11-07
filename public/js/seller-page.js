import "../js/layout.js";
import {
    createSellerProduct,
    deleteSellerProduct,
    getSellerActivity,
    getSellerOrders,
    getSellerPayments,
    getSellerProduct,
    getSellerProducts,
    getSellerShop,
    logout,
    updateSellerOrderStatus,
    updateSellerProduct,
    updateSellerShop
} from "../js/api.js";
import { requireRole } from "../js/auth-guard.js";
import { renderDashboardSidebar } from "../js/layout.js";
import {
    formatDate,
    formatPeso,
    renderEmpty,
    renderError,
    renderSkeleton,
    showToast
} from "../js/ui.js";

const content = document.getElementById("seller-content");
const sidebarRoot = document.getElementById("seller-navigation");
const statusRoot = document.getElementById("shop-status-banner");
const page = window.location.pathname.split("/").pop() || "dashboard.html";
const productCategories = [
    "Electronics", "Mobile Accessories", "Fashion", "Beauty", "Home & Living",
    "Groceries", "Gaming", "Sports", "School Supplies", "Appliances"
];

function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
}

function pageHeading(title, description, action) {
    const heading = node("div", undefined, "dashboard-page-heading");
    const copy = document.createElement("div");
    copy.append(node("h1", title));
    if (description) copy.append(node("p", description));
    heading.appendChild(copy);
    if (action) heading.appendChild(action);
    return heading;
}

function makeButton(label, className = "button button-secondary") {
    const button = node("button", label, className);
    button.type = "button";
    return button;
}

function makeLink(label, href, className = "button button-secondary") {
    const link = node("a", label, className);
    link.href = href;
    return link;
}

function formatStatus(status) {
    return String(status || "unknown").replaceAll("_", " ");
}

function statusBadge(status) {
    const badge = node("span", formatStatus(status), `status-badge status-${status || "pending"}`);
    return badge;
}

function productThumbnail(imageUrl, alt) {
    const wrapper = node("div", undefined, "seller-product-thumb");
    if (typeof imageUrl === "string" && imageUrl.trim()) {
        try {
            const url = new URL(imageUrl, window.location.origin);
            if (["http:", "https:"].includes(url.protocol)) {
                const image = document.createElement("img");
                image.src = url.href;
                image.alt = alt;
                image.loading = "lazy";
                wrapper.appendChild(image);
                return wrapper;
            }
        } catch {
            // A missing or malformed optional image is shown as a placeholder.
        }
    }
    wrapper.textContent = "—";
    wrapper.setAttribute("aria-label", `No image for ${alt}`);
    return wrapper;
}

function makeTable(headers, rows) {
    const wrap = node("div", undefined, "table-wrap");
    const table = node("table", undefined, "data-table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach(label => headerRow.appendChild(node("th", label)));
    head.appendChild(headerRow);
    const body = document.createElement("tbody");
    rows.forEach(cells => {
        const row = document.createElement("tr");
        cells.forEach(cell => {
            const td = document.createElement("td");
            if (cell instanceof Node) td.appendChild(cell);
            else td.textContent = String(cell ?? "—");
            row.appendChild(td);
        });
        body.appendChild(row);
    });
    table.append(head, body);
    wrap.appendChild(table);
    return wrap;
}

function renderShopBanner(shop) {
    statusRoot.replaceChildren();
    statusRoot.className = `shop-status-banner status-${shop.status}`;
    const heading = node("h2", `Shop status: ${formatStatus(shop.status)}`);
    const message = node("p");
    if (shop.status === "pending") {
        message.textContent = "Waiting for admin approval, you can edit your shop profile but cannot post products yet.";
    } else if (shop.status === "rejected") {
        message.textContent = "Your shop was rejected. Update your shop profile and contact an administrator for next steps.";
    } else if (shop.status === "suspended") {
        message.textContent = "Your shop is suspended. Product, order, and payment actions are unavailable.";
    } else {
        message.textContent = "Your shop is approved and seller tools are available.";
    }
    statusRoot.append(heading, message);
}

function setupShell() {
    const sidebar = renderDashboardSidebar("seller", page);
    const signOut = makeButton("Log out", "button button-ghost");
    signOut.addEventListener("click", async () => {
        signOut.disabled = true;
        try {
            await logout();
            window.location.assign("/login.html");
        } catch (error) {
            signOut.disabled = false;
            showToast(error.message, { kind: "error" });
        }
    });
    sidebar.querySelector("nav").appendChild(signOut);
    sidebarRoot.replaceChildren(sidebar);
}

function unavailableMessage(shop) {
    const section = document.createElement("section");
    section.className = "dashboard-section";
    section.append(node("h2", "Seller actions are unavailable"));
    section.append(node("p", "You can update your shop profile while you wait for approval or contact an administrator about this status."));
    section.appendChild(makeLink("Edit shop profile", "/seller/shop-profile.html", "button button-primary"));
    return section;
}

function productPriceCentavos(value) {
    const raw = String(value).trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw)) return null;
    const [whole, fraction = ""] = raw.split(".");
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(amount) ? amount : null;
}

async function getAllSellerOrders() {
    const firstPage = await getSellerOrders({ page: 1, limit: 100 });
    const orders = firstPage.orders.slice();
    const pageCount = Math.ceil(Number(firstPage.total) / firstPage.limit);
    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
        const pageResult = await getSellerOrders({ page: pageNumber, limit: firstPage.limit });
        orders.push(...pageResult.orders);
    }
    return { orders, total: Number(firstPage.total) };
}

async function loadDashboard() {
    const [productResult, orderResult] = await Promise.all([
        getSellerProducts({ limit: 100 }),
        getAllSellerOrders()
    ]);
    const products = productResult.products;
    const orders = orderResult.orders;
    const stats = node("div", undefined, "dashboard-card-grid");
    [
        ["Products", products.length],
        ["Orders", orderResult.total],
        ["Paid orders", orders.filter(order => order.status === "paid").length],
        ["Pending orders", orders.filter(order => order.status === "pending").length]
    ].forEach(([label, amount]) => {
        const card = node("article", undefined, "dashboard-stat");
        card.append(node("span", label), node("strong", String(amount)));
        stats.appendChild(card);
    });
    const recent = node("section", undefined, "dashboard-section");
    recent.appendChild(node("h2", "Recent orders"));
    if (!orders.length) {
        recent.appendChild(renderEmpty("No orders yet", "New shop orders will appear here.", "View products", () => window.location.assign("/seller/products.html")));
    } else {
        const rows = orders.slice(0, 6).map(order => [
            order.order_number || `Order ${order.id}`,
            order.customer_name || order.buyer_name || "Buyer",
            formatDate(order.created_at),
            formatPeso(order.total_centavos),
            statusBadge(order.status)
        ]);
        recent.appendChild(makeTable(["Order", "Buyer", "Date", "Total", "Payment"], rows));
    }
    const lowStock = node("section", undefined, "dashboard-section");
    lowStock.appendChild(node("h2", "Low stock (5 or fewer)"));
    const low = products.filter(product => Number(product.stock) <= 5);
    if (!low.length) {
        lowStock.appendChild(renderEmpty(
            "Stock levels look good",
            "No products are currently at five or fewer units.",
            "Manage products",
            () => window.location.assign("/seller/products.html")
        ));
    }
    else lowStock.appendChild(makeTable(
        ["Product", "Stock", "Price"],
        low.slice(0, 10).map(product => [product.name, product.stock, formatPeso(product.price_centavos)])
    ));
    content.replaceChildren(pageHeading("Seller overview", "A summary of activity in your approved shop.", makeLink("Add product", "/seller/product-form.html", "button button-primary")), stats, recent, lowStock);
}

async function loadProducts() {
    const result = await getSellerProducts({ limit: 100 });
    let products = result.products;
    const heading = pageHeading("Products", "Manage products in your shop.", makeLink("Add product", "/seller/product-form.html", "button button-primary"));
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search your products";
    search.setAttribute("aria-label", "Search products");
    const section = node("section", undefined, "dashboard-section");
    const tableRoot = document.createElement("div");
    const renderRows = () => {
        const query = search.value.trim().toLowerCase();
        const filtered = products.filter(product => `${product.name} ${product.category || ""}`.toLowerCase().includes(query));
        if (!filtered.length) {
            tableRoot.replaceChildren(renderEmpty("No products found", "Add your first product or try a different search.", "Add product", () => window.location.assign("/seller/product-form.html")));
            return;
        }
        tableRoot.replaceChildren(makeTable(
            ["Image", "Product", "Price", "Stock", "Status", "Actions"],
            filtered.map(product => {
                const actions = node("div", undefined, "dashboard-row-actions");
                actions.appendChild(makeLink("Edit", `/seller/product-form.html?id=${encodeURIComponent(product.id)}`, "button button-secondary"));
                const removeButton = makeButton("Delete");
                removeButton.addEventListener("click", async () => {
                    if (!window.confirm(`Remove "${product.name}" from your shop?`)) return;
                    removeButton.disabled = true;
                    try {
                        await deleteSellerProduct(product.id);
                        showToast("Product removed from your shop.", { kind: "success" });
                        products = products.filter(item => String(item.id) !== String(product.id));
                        renderRows();
                    } catch (error) {
                        removeButton.disabled = false;
                        showToast(error.message, { kind: "error" });
                    }
                });
                actions.appendChild(removeButton);
                return [
                    productThumbnail(product.image_url, product.name),
                    product.name,
                    formatPeso(product.price_centavos),
                    product.stock,
                    statusBadge(product.status || "active"),
                    actions
                ];
            })
        ));
    };
    search.addEventListener("input", renderRows);
    const toolbar = node("div", undefined, "dashboard-toolbar");
    toolbar.append(node("label", "Search products"), search);
    section.append(toolbar, tableRoot);
    content.replaceChildren(heading, section);
    renderRows();
}

async function renderProductForm() {
    const productId = new URLSearchParams(window.location.search).get("id");
    const existing = productId ? await getSellerProduct(productId) : null;
    const form = node("form", undefined, "dashboard-form");
    form.dataset.cy = "seller-product-form";
    const field = (labelText, name, { type = "text", required = true, maxLength, step, min } = {}) => {
        const wrap = node("div", undefined, "form-field");
        const input = document.createElement("input");
        input.type = type;
        input.name = name;
        input.id = `product-${name}`;
        if (required) input.required = true;
        if (maxLength) input.maxLength = maxLength;
        if (step) input.step = step;
        if (min !== undefined) input.min = String(min);
        wrap.append(node("label", labelText), input);
        wrap.querySelector("label").htmlFor = input.id;
        form.appendChild(wrap);
        return input;
    };
    const name = field("Product name", "name", { maxLength: 200 });
    const categoryWrap = node("div", undefined, "form-field");
    const category = document.createElement("select");
    category.name = "category";
    category.id = "product-category";
    category.required = true;
    const initialOption = node("option", "Choose a category");
    initialOption.value = "";
    category.appendChild(initialOption);
    productCategories.forEach(value => {
        const option = node("option", value);
        option.value = value;
        category.appendChild(option);
    });
    const categoryLabel = node("label", "Category");
    categoryLabel.htmlFor = category.id;
    categoryWrap.append(categoryLabel, category);
    form.appendChild(categoryWrap);
    const descriptionWrap = node("div", undefined, "form-field");
    const description = document.createElement("textarea");
    description.name = "description";
    description.id = "product-description";
    description.maxLength = 5000;
    const descriptionLabel = node("label", "Description");
    descriptionLabel.htmlFor = description.id;
    descriptionWrap.append(descriptionLabel, description);
    form.appendChild(descriptionWrap);
    const price = field("Price (PHP)", "price", { type: "number", step: "0.01", min: 0 });
    const originalPrice = field("Original price (PHP, optional)", "original_price", { type: "number", required: false, step: "0.01", min: 0 });
    const stock = field("Stock", "stock", { type: "number", min: 0, step: "1" });
    const imageUrl = field("Image URL (optional)", "image_url", { type: "url", required: false, maxLength: 500 });
    const preview = node("div", "Product image preview", "dashboard-product-preview");
    const previewImage = document.createElement("img");
    previewImage.alt = "Product preview";
    previewImage.hidden = true;
    preview.replaceChildren(previewImage);
    const updatePreview = () => {
        try {
            const url = new URL(imageUrl.value);
            if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported image URL protocol.");
            previewImage.src = url.href;
            previewImage.hidden = false;
            preview.setAttribute("aria-label", "Product image preview");
        } catch {
            previewImage.removeAttribute("src");
            previewImage.hidden = true;
            preview.setAttribute("aria-label", "No valid image preview");
        }
    };
    imageUrl.addEventListener("input", updatePreview);
    const submit = makeButton(productId ? "Save changes" : "Add product", "button button-primary");
    submit.type = "submit";
    submit.dataset.cy = "seller-product-submit";
    const message = node("p");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    form.append(preview, message, submit);
    if (existing) {
        name.value = existing.name || "";
        category.value = existing.category || "";
        description.value = existing.description || "";
        price.value = (Number(existing.price_centavos) / 100).toFixed(2);
        originalPrice.value = existing.original_price_centavos === null ? "" : (Number(existing.original_price_centavos) / 100).toFixed(2);
        stock.value = String(existing.stock ?? 0);
        imageUrl.value = existing.image_url || "";
        updatePreview();
    }
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const priceCentavos = productPriceCentavos(price.value);
        const originalCentavos = originalPrice.value.trim() ? productPriceCentavos(originalPrice.value) : null;
        const stockCount = Number(stock.value);
        if (priceCentavos === null || (originalPrice.value.trim() && originalCentavos === null) ||
            !Number.isSafeInteger(stockCount) || stockCount < 0) {
            message.textContent = "Enter a valid price and whole-number stock amount.";
            return;
        }
        submit.disabled = true;
        message.textContent = "Saving product…";
        const body = {
            name: name.value.trim(),
            category: category.value,
            description: description.value.trim(),
            price_centavos: priceCentavos,
            original_price_centavos: originalCentavos,
            stock: stockCount,
            image_url: imageUrl.value.trim()
        };
        try {
            if (productId) await updateSellerProduct(productId, body);
            else await createSellerProduct(body);
            showToast(productId ? "Product updated." : "Product added.", { kind: "success" });
            window.location.assign("/seller/products.html");
        } catch (error) {
            message.textContent = error.message;
            submit.disabled = false;
        }
    });
    content.replaceChildren(
        pageHeading(productId ? "Edit product" : "Add product", "Prices are entered in Philippine pesos and saved as centavos.", makeLink("Back to products", "/seller/products.html")),
        node("section", undefined, "dashboard-section")
    );
    content.lastElementChild.appendChild(form);
}

async function loadOrders() {
    const result = await getAllSellerOrders();
    const tabs = ["all", "pending", "processing", "shipped", "delivered", "cancelled"];
    let active = new URLSearchParams(window.location.search).get("fulfillment") || "all";
    const tabRoot = node("div", undefined, "dashboard-tabs");
    const listRoot = document.createElement("div");
    const renderRows = () => {
        tabRoot.replaceChildren();
        tabs.forEach(tab => {
            const button = makeButton(tab === "all" ? "All" : formatStatus(tab));
            button.setAttribute("aria-pressed", String(active === tab));
            button.addEventListener("click", () => {
                active = tab;
                renderRows();
            });
            tabRoot.appendChild(button);
        });
        let orders = result.orders;
        if (active !== "all") orders = orders.filter(order =>
            (order.items || []).some(item => (item.fulfillment_status || "pending") === active)
        );
        if (!orders.length) {
            listRoot.replaceChildren(renderEmpty("No orders in this status", "Orders containing items for your shop will appear here.", "Show all", () => {
                active = "all";
                renderRows();
            }));
            return;
        }
        listRoot.replaceChildren(makeTable(
            ["Order / buyer", "Shop items", "Delivery address", "Payment", "Fulfillment update"],
            orders.map(order => {
                const items = order.items || [];
                const itemNames = node("div");
                items.forEach(item => {
                    const line = node("p", `${item.product_name} × ${item.quantity}`, "dashboard-subtle");
                    itemNames.appendChild(line);
                });
                const address = [
                    order.address_line, order.barangay, order.city, order.province, order.postal_code
                ].filter(Boolean).join(", ");
                const updateForm = node("form", undefined, "fulfillment-form");
                updateForm.appendChild(statusBadge(items[0]?.fulfillment_status || "pending"));
                const status = document.createElement("select");
                status.setAttribute("aria-label", `Fulfillment status for ${order.order_number || order.id}`);
                ["processing", "shipped", "delivered", "cancelled"].forEach(value => {
                    const option = node("option", formatStatus(value));
                    option.value = value;
                    status.appendChild(option);
                });
                status.value = items[0]?.fulfillment_status || "processing";
                const courier = document.createElement("input");
                courier.placeholder = "Courier (required when shipped)";
                courier.maxLength = 80;
                courier.value = items[0]?.courier || "";
                courier.setAttribute("aria-label", "Courier");
                const tracking = document.createElement("input");
                tracking.placeholder = "Tracking number (required when shipped)";
                tracking.maxLength = 80;
                tracking.value = items[0]?.tracking_number || "";
                tracking.setAttribute("aria-label", "Tracking number");
                const updateShippingFields = () => {
                    const visible = ["shipped", "delivered"].includes(status.value) ||
                        Boolean(items[0]?.courier || items[0]?.tracking_number);
                    courier.hidden = !visible;
                    tracking.hidden = !visible;
                };
                status.addEventListener("change", updateShippingFields);
                updateShippingFields();
                const save = node("button", "Update", "button button-secondary");
                save.type = "submit";
                save.disabled = order.status !== "paid";
                if (order.status !== "paid") {
                    updateForm.appendChild(node("small", "Payment must be paid before fulfillment.", "dashboard-subtle"));
                }
                updateForm.append(status, courier, tracking, save);
                updateForm.addEventListener("submit", async event => {
                    event.preventDefault();
                    if (status.value === "shipped" && (!courier.value.trim() || !tracking.value.trim())) {
                        showToast("Enter both courier and tracking number before marking shipped.", { kind: "error" });
                        return;
                    }
                    save.disabled = true;
                    try {
                        await updateSellerOrderStatus(order.id, {
                            status: status.value,
                            courier: courier.value.trim(),
                            tracking_number: tracking.value.trim()
                        });
                        showToast("Fulfillment status updated.", { kind: "success" });
                        await loadOrders();
                    } catch (error) {
                        save.disabled = false;
                        showToast(error.message, { kind: "error" });
                    }
                });
                const orderCell = node("div");
                orderCell.append(node("strong", order.order_number || `Order ${order.id}`), node("p", order.customer_name || order.buyer_name || "Buyer"));
                return [orderCell, itemNames, address, statusBadge(order.status), updateForm];
            })
        ));
    };
    const section = node("section", undefined, "dashboard-section");
    section.append(tabRoot, listRoot);
    content.replaceChildren(pageHeading("Shop orders", "View order items from your shop and update their fulfillment."), section);
    renderRows();
}

async function loadPayments() {
    const result = await getSellerPayments({});
    const payments = Array.isArray(result.payments) ? result.payments : [];
    const filter = document.createElement("select");
    filter.setAttribute("aria-label", "Filter payments by status");
    [["all", "All statuses"], ["paid", "Paid"], ["pending", "Pending"], ["failed", "Failed"]].forEach(([value, label]) => {
        const option = node("option", label);
        option.value = value;
        filter.appendChild(option);
    });
    const section = node("section", undefined, "dashboard-section");
    const totals = node("p", "", "dashboard-subtle");
    const tableRoot = document.createElement("div");
    const renderTable = () => {
        const selected = filter.value;
        const rows = payments.filter(payment => selected === "all" || payment.status === selected);
        const paidTotal = payments.filter(payment => payment.status === "paid")
            .reduce((sum, payment) => sum + Number(payment.amount_centavos || 0), 0);
        totals.textContent = `Paid amount for this shop: ${formatPeso(paidTotal)}. Payment method details are limited to the method label; card and wallet numbers are never shown.`;
        if (!rows.length) {
            tableRoot.replaceChildren(renderEmpty(
                "No payments found",
                "Payment records will appear after a buyer starts checkout for your shop.",
                "View shop orders",
                () => window.location.assign("/seller/orders.html")
            ));
            return;
        }
        tableRoot.replaceChildren(makeTable(
            ["Order", "Buyer", "Amount", "Method", "Status", "Date"],
            rows.map(payment => [
                payment.order_number || `Order ${payment.order_id}`,
                payment.buyer_name || "Buyer",
                formatPeso(payment.amount_centavos),
                payment.payment_method || "PayMongo Checkout",
                statusBadge(payment.status),
                formatDate(payment.created_at)
            ])
        ));
    };
    filter.addEventListener("change", renderTable);
    const toolbar = node("div", undefined, "dashboard-toolbar");
    toolbar.append(node("label", "Payment status"), filter);
    section.append(toolbar, totals, tableRoot);
    content.replaceChildren(pageHeading("Online payments", "Payment status and amounts for orders containing your shop's products."), section);
    renderTable();
}

async function loadShopProfile(shop) {
    const form = node("form", undefined, "dashboard-form");
    const name = document.createElement("input");
    name.name = "shop_name";
    name.id = "shop-name";
    name.required = true;
    name.maxLength = 120;
    name.value = shop.shop_name || "";
    const nameLabel = node("label", "Shop name");
    nameLabel.htmlFor = name.id;
    const description = document.createElement("textarea");
    description.name = "description";
    description.id = "shop-description";
    description.maxLength = 2000;
    description.value = shop.description || "";
    const descriptionLabel = node("label", "Shop description");
    descriptionLabel.htmlFor = description.id;
    const message = node("p");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const save = makeButton("Save shop profile", "button button-primary");
    save.type = "submit";
    form.append(nameLabel, name, descriptionLabel, description, message, save);
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        save.disabled = true;
        message.textContent = "Saving…";
        try {
            await updateSellerShop({ shop_name: name.value.trim(), description: description.value.trim() });
            showToast("Shop profile saved.", { kind: "success" });
            message.textContent = "Shop profile saved.";
        } catch (error) {
            message.textContent = error.message;
            save.disabled = false;
        }
    });
    const section = node("section", undefined, "dashboard-section");
    section.appendChild(form);
    content.replaceChildren(pageHeading("Shop profile", "Update your shop's public name and description. These edits are available while approval is pending."), section);
}

async function loadActivity() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    const pageNumber = Math.max(1, Number(params.get("page")) || 1);
    const result = await getSellerActivity({ from, to, page: pageNumber, limit: 20 });
    const form = node("form", undefined, "activity-filters");
    const fromInput = document.createElement("input");
    fromInput.type = "date";
    fromInput.name = "from";
    fromInput.value = from;
    const toInput = document.createElement("input");
    toInput.type = "date";
    toInput.name = "to";
    toInput.value = to;
    const fromLabel = node("label", "From");
    fromLabel.appendChild(fromInput);
    const toLabel = node("label", "To");
    toLabel.appendChild(toInput);
    const apply = node("button", "Apply filters", "button button-secondary");
    apply.type = "submit";
    form.append(fromLabel, toLabel, apply);
    form.addEventListener("submit", event => {
        event.preventDefault();
        const next = new URLSearchParams();
        if (fromInput.value) next.set("from", fromInput.value);
        if (toInput.value) next.set("to", toInput.value);
        window.location.assign(`/seller/activity.html${next.toString() ? `?${next}` : ""}`);
    });
    const section = node("section", undefined, "dashboard-section");
    if (!result.logs.length) {
        section.appendChild(renderEmpty(
            "No activity found",
            "Your shop activity will appear here when you make changes.",
            "Back to seller overview",
            () => window.location.assign("/seller/dashboard.html")
        ));
    } else {
        section.appendChild(makeTable(
            ["Date", "Action", "Details"],
            result.logs.map(log => [formatDate(log.created_at), log.action, log.details || "—"])
        ));
        const nav = node("nav", undefined, "pagination");
        nav.setAttribute("aria-label", "Activity pages");
        const pages = Math.ceil(result.total / result.limit);
        if (pageNumber > 1) {
            const previous = makeLink("Previous", "#");
            previous.href = `/seller/activity.html?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), page: String(pageNumber - 1) })}`;
            nav.appendChild(previous);
        }
        nav.appendChild(node("span", `Page ${pageNumber} of ${pages}`));
        if (pageNumber < pages) {
            const next = makeLink("Next", "#");
            next.href = `/seller/activity.html?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), page: String(pageNumber + 1) })}`;
            nav.appendChild(next);
        }
        section.appendChild(nav);
    }
    content.replaceChildren(pageHeading("Shop activity", "Review recent activity for your seller account."), form, section);
}

async function loadSellerPage() {
    content.replaceChildren(renderSkeleton(3, { type: "list" }));
    try {
        const user = await requireRole("seller");
        if (!user) return;
        setupShell();
        const result = await getSellerShop();
        const shop = result.shop;
        if (!shop) throw new Error("No shop is linked to this seller account.");
        renderShopBanner(shop);
        if (page === "shop-profile.html") {
            await loadShopProfile(shop);
            return;
        }
        if (shop.status !== "approved") {
            content.replaceChildren(unavailableMessage(shop));
            return;
        }
        if (page === "dashboard.html") await loadDashboard();
        else if (page === "products.html") await loadProducts();
        else if (page === "product-form.html") await renderProductForm();
        else if (page === "orders.html") await loadOrders();
        else if (page === "payments.html") await loadPayments();
        else if (page === "activity.html") await loadActivity();
        else content.replaceChildren(renderEmpty("Page not found", "Choose a seller page from the navigation.", "Seller dashboard", () => window.location.assign("/seller/dashboard.html")));
    } catch (error) {
        content.replaceChildren(renderError(loadSellerPage, error.message));
    }
}

loadSellerPage();
