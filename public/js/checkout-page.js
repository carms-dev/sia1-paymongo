import "./layout.js";
import { createCheckout, createOrder, getCurrentUser } from "./api.js";
import { clear, getItems, remove } from "./cart.js";
import { formatPeso, renderEmpty, renderError, renderSkeleton } from "./ui.js";

const container = document.getElementById("checkout-content");
const selectionKey = "budol_checkout_selection";

function readSelection(items) {
    const raw = sessionStorage.getItem(selectionKey);
    if (!raw) return items;
    try {
        const selectedIds = JSON.parse(raw);
        if (!Array.isArray(selectedIds)) throw new Error("Checkout selection is invalid.");
        const selected = new Set(selectedIds.map(String));
        return items.filter(item => selected.has(String(item.product_id)));
    } catch {
        sessionStorage.removeItem(selectionKey);
        throw new Error("Your selected cart items could not be read. Please return to your cart.");
    }
}

function formField(form, { label, name, type = "text", autocomplete, required = true, pattern, maxLength }) {
    const wrap = document.createElement("div");
    wrap.className = "form-field";
    const inputId = `delivery-${name}`;
    const inputLabel = document.createElement("label");
    inputLabel.htmlFor = inputId;
    inputLabel.textContent = label;
    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    input.id = inputId;
    input.name = name;
    input.dataset.cy = `delivery-${name.replaceAll("_", "-")}`;
    if (type !== "textarea") input.type = type;
    if (autocomplete) input.autocomplete = autocomplete;
    if (required) input.required = true;
    if (pattern) input.pattern = pattern;
    if (maxLength) input.maxLength = maxLength;
    const error = document.createElement("small");
    error.className = "field-error";
    error.id = `${inputId}-error`;
    input.setAttribute("aria-describedby", error.id);
    input.addEventListener("invalid", () => {
        error.textContent = input.validationMessage;
    });
    input.addEventListener("input", () => {
        error.textContent = "";
    });
    wrap.append(inputLabel, input, error);
    form.appendChild(wrap);
    return input;
}

function renderCheckout(user, items) {
    container.replaceChildren();
    const formCard = document.createElement("section");
    formCard.className = "card";
    const heading = document.createElement("h2");
    heading.textContent = "Delivery details";
    const intro = document.createElement("p");
    intro.className = "muted-note";
    intro.textContent = `Checking out as ${user.full_name || user.email}.`;
    const form = document.createElement("form");
    form.id = "place-order-form";
    form.className = "checkout-form";
    const grid = document.createElement("div");
    grid.className = "delivery-form-grid";
    form.appendChild(grid);

    const customerName = formField(grid, {
        label: "Full name", name: "customer_name", autocomplete: "name", maxLength: 150
    });
    customerName.value = user.full_name || "";
    const phone = formField(grid, {
        label: "Mobile number", name: "phone", type: "tel", autocomplete: "tel",
        pattern: "(?:\\+?[0-9](?:[0-9 ]|\\(|\\)|\\x2D){5,27}[0-9])", maxLength: 30
    });
    const email = formField(grid, {
        label: "Email address", name: "customer_email", type: "email",
        autocomplete: "email", maxLength: 255
    });
    email.value = user.email || "";
    const region = formField(grid, { label: "Region", name: "region", autocomplete: "address-level1", maxLength: 100 });
    const province = formField(grid, { label: "Province", name: "province", autocomplete: "address-level1", maxLength: 100 });
    const city = formField(grid, { label: "City / municipality", name: "city", autocomplete: "address-level2", maxLength: 100 });
    const barangay = formField(grid, { label: "Barangay", name: "barangay", maxLength: 100 });
    const addressLine = formField(grid, {
        label: "Street / building", name: "address_line", autocomplete: "street-address", maxLength: 255
    });
    const postalCode = formField(grid, {
        label: "Postal code", name: "postal_code", autocomplete: "postal-code",
        pattern: "(?:[0-9A-Za-z]| |-){3,10}", maxLength: 10
    });
    const notes = formField(grid, {
        label: "Delivery notes (optional)", name: "delivery_notes", type: "textarea",
        required: false, maxLength: 500
    });
    notes.classList.add("delivery-notes-field");

    const message = document.createElement("p");
    message.id = "checkout-message";
    message.dataset.cy = "checkout-error";
    message.className = "auth-message";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "button button-primary auth-submit";
    submit.dataset.cy = "place-order";
    submit.textContent = "Place order";
    form.append(message, submit);
    formCard.append(heading, intro, form);

    const summary = document.createElement("aside");
    summary.className = "cart-summary";
    const summaryHeading = document.createElement("h2");
    summaryHeading.textContent = "Order summary";
    summary.appendChild(summaryHeading);
    let orderTotal = 0;
    items.forEach(item => {
        const row = document.createElement("div");
        row.className = "summary-row";
        const label = document.createElement("span");
        label.textContent = `${item.name} × ${item.quantity}`;
        const lineTotal = document.createElement("strong");
        lineTotal.textContent = formatPeso(item.price_centavos * item.quantity);
        row.append(label, lineTotal);
        summary.appendChild(row);
        orderTotal += item.price_centavos * item.quantity;
    });
    const total = document.createElement("div");
    total.className = "summary-row";
    const totalLabel = document.createElement("strong");
    totalLabel.textContent = "Estimated total";
    const totalValue = document.createElement("strong");
    totalValue.textContent = formatPeso(orderTotal);
    total.append(totalLabel, totalValue);
    const note = document.createElement("p");
    note.className = "estimated-note";
    note.textContent = "Prices and stock will be rechecked by the server. Payment is completed on PayMongo’s secure hosted page (GCash, card, and QR Ph where enabled).";
    summary.append(total, note);
    container.append(formCard, summary);

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        submit.disabled = true;
        submit.textContent = "Creating order…";
        message.textContent = "";
        let orderId = null;
        try {
            const orderResponse = await createOrder({
                customer_name: customerName.value.trim(),
                customer_email: email.value.trim(),
                phone: phone.value.trim(),
                region: region.value.trim(),
                province: province.value.trim(),
                city: city.value.trim(),
                barangay: barangay.value.trim(),
                address_line: addressLine.value.trim(),
                postal_code: postalCode.value.trim(),
                delivery_notes: notes.value.trim(),
                items: items.map(item => ({
                    product_id: item.product_id,
                    quantity: item.quantity
                }))
            });
            orderId = orderResponse.order?.id;
            if (!orderId) throw new Error("The server did not return an order ID.");
            sessionStorage.setItem("budol_last_order_id", String(orderId));

            const fullCart = getItems();
            const containsWholeCart = items.length === fullCart.length &&
                items.every(item => fullCart.some(cartItem => String(cartItem.product_id) === String(item.product_id)));
            if (containsWholeCart) clear();
            else items.forEach(item => remove(item.product_id));
            sessionStorage.removeItem(selectionKey);

            submit.textContent = "Opening secure payment…";
            const checkoutResponse = await createCheckout({ order_id: orderId });
            if (typeof checkoutResponse.checkout_url !== "string" || !checkoutResponse.checkout_url) {
                throw new Error("The payment service did not return a checkout link.");
            }
            const checkoutUrl = new URL(checkoutResponse.checkout_url, window.location.origin);
            const localMockUrl = checkoutUrl.origin === window.location.origin;
            if (!localMockUrl && !(checkoutUrl.protocol === "https:" &&
                checkoutUrl.hostname === "checkout.paymongo.com")) {
                throw new Error("The payment service returned an unsafe checkout link.");
            }
            window.location.assign(checkoutUrl.href);
        } catch (error) {
            if (orderId !== null) {
                const detailLink = document.createElement("a");
                detailLink.className = "button button-secondary";
                detailLink.href = `/order-details.html?id=${encodeURIComponent(orderId)}`;
                detailLink.textContent = "View created order";
                const ordersLink = document.createElement("a");
                ordersLink.className = "button button-ghost";
                ordersLink.href = "/orders.html";
                ordersLink.textContent = "Retry payment from My Orders";
                message.textContent = `Your order was created, but checkout could not start: ${error.message}`;
                message.append(" ", detailLink, " ", ordersLink);
                submit.hidden = true;
            } else {
                message.textContent = error.message;
                submit.disabled = false;
                submit.textContent = "Place order";
            }
        }
    });
}

async function loadCheckout() {
    container.replaceChildren(renderSkeleton(2, { type: "list" }));
    let user;
    try {
        const result = await getCurrentUser();
        user = result.user;
    } catch (error) {
        if (error.status === 401) {
            const next = encodeURIComponent("/checkout.html");
            window.location.replace(`/login.html?next=${next}`);
            return;
        }
        container.replaceChildren(renderError(loadCheckout, error.message));
        return;
    }
    if (user.role !== "buyer") {
        container.replaceChildren(renderEmpty(
            "Buyer account required",
            "Only buyer accounts can place orders. Sign in with a buyer account or return to browsing.",
            "Back to cart",
            () => window.location.assign("/cart.html")
        ));
        return;
    }
    let items;
    try {
        items = readSelection(getItems());
    } catch (error) {
        container.replaceChildren(renderError(() => window.location.assign("/cart.html"), error.message));
        return;
    }
    if (!items.length) {
        container.replaceChildren(renderEmpty(
            "No items selected",
            "Choose products in your cart before checking out.",
            "Return to cart",
            () => window.location.assign("/cart.html")
        ));
        return;
    }
    renderCheckout(user, items);
}

loadCheckout();
