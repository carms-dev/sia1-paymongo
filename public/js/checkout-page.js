import "./layout.js";
import { createCheckout, createOrder, getCurrentUser } from "./api.js";
import { getItems } from "./cart.js";
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

function showLoginRequired() {
    const next = encodeURIComponent("/checkout.html");
    window.location.replace(`/login.html?next=${next}`);
}

function renderCheckout(user, items) {
    container.replaceChildren();
    const formCard = document.createElement("section");
    formCard.className = "card";
    const heading = document.createElement("h2");
    heading.textContent = "Buyer details";
    const intro = document.createElement("p");
    intro.className = "muted-note";
    intro.textContent = `Checking out as ${user.full_name || user.email}.`;
    const form = document.createElement("form");
    form.id = "place-order-form";
    form.className = "checkout-form";
    const nameLabel = document.createElement("label");
    nameLabel.htmlFor = "customer-name";
    nameLabel.textContent = "Full name";
    const name = document.createElement("input");
    name.id = "customer-name";
    name.name = "customer_name";
    name.autocomplete = "name";
    name.maxLength = 150;
    name.required = true;
    name.value = user.full_name || "";
    const emailLabel = document.createElement("label");
    emailLabel.htmlFor = "customer-email";
    emailLabel.textContent = "Email address";
    const email = document.createElement("input");
    email.id = "customer-email";
    email.name = "customer_email";
    email.type = "email";
    email.autocomplete = "email";
    email.maxLength = 255;
    email.required = true;
    email.value = user.email || "";
    const message = document.createElement("p");
    message.id = "checkout-message";
    message.className = "auth-message";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "button button-primary auth-submit";
    submit.dataset.cy = "place-order";
    submit.textContent = "Place order & pay";
    form.append(nameLabel, name, emailLabel, email, message, submit);
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
    note.textContent = "Prices and stock will be rechecked by the server before the order is created. Payment is completed only on PayMongo’s hosted checkout.";
    summary.append(total, note);
    container.append(formCard, summary);

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        submit.disabled = true;
        submit.textContent = "Preparing secure checkout…";
        message.textContent = "";
        try {
            const orderResponse = await createOrder({
                customer_name: name.value.trim(),
                customer_email: email.value.trim(),
                items: items.map(item => ({
                    product_id: item.product_id,
                    quantity: item.quantity
                }))
            });
            const orderId = orderResponse.order?.id;
            if (!orderId) throw new Error("The server did not return an order ID.");
            const checkoutResponse = await createCheckout({ order_id: orderId });
            if (typeof checkoutResponse.checkout_url !== "string" || !checkoutResponse.checkout_url) {
                throw new Error("The payment service did not return a checkout link.");
            }
            const checkoutUrl = new URL(checkoutResponse.checkout_url, window.location.origin);
            if (checkoutUrl.protocol !== "https:" && checkoutUrl.origin !== window.location.origin) {
                throw new Error("The payment service returned an unsafe checkout link.");
            }
            window.location.assign(checkoutUrl.href);
        } catch (error) {
            message.textContent = error.message;
            submit.disabled = false;
            submit.textContent = "Place order & pay";
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
            showLoginRequired();
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
