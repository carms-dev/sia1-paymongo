import "./layout.js";
import { getOrder } from "./api.js";
import { requireRole } from "./auth-guard.js";
import { formatPeso } from "./ui.js";

const card = document.querySelector(".checkout-return");
const title = document.getElementById("return-title");
const statusMessage = document.getElementById("order-status");
const retryButton = document.getElementById("retry-status");
const orderId = new URLSearchParams(window.location.search).get("order_id");
const orderNumber = document.getElementById("confirmed-order-number");
const itemList = document.getElementById("confirmed-order-items");
const actions = document.getElementById("confirmed-order-actions");
const pollIntervalMs = 3000;
const maxDurationMs = 30000;
let startedAt = Date.now();
let checking = false;

function showAction(label, href, primary = false) {
    const link = document.createElement("a");
    link.className = `button ${primary ? "button-primary" : "button-secondary"}`;
    link.href = href;
    link.textContent = label;
    actions.appendChild(link);
}

function renderPaid(result) {
    const order = result.order;
    title.textContent = "Order Placed Successfully!";
    statusMessage.textContent = `Payment confirmed for order ${order.order_number || order.id}.`;
    orderNumber.textContent = `Order ${order.order_number || order.id}`;
    orderNumber.hidden = false;
    itemList.replaceChildren();
    result.items.forEach(item => {
        const row = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = `${item.product_name} × ${item.quantity}`;
        const price = document.createElement("strong");
        price.textContent = formatPeso(item.line_total_centavos ?? item.price_centavos * item.quantity);
        row.append(name, price);
        itemList.appendChild(row);
    });
    const total = document.createElement("p");
    total.className = "confirmed-total";
    total.textContent = `Order total: ${formatPeso(order.total_centavos)}`;
    itemList.appendChild(total);
    itemList.hidden = false;
    actions.replaceChildren();
    showAction("Track my order", `/order-details.html?id=${encodeURIComponent(order.id)}`, true);
    showAction("Continue shopping", "/products.html");
    actions.hidden = false;
    retryButton.hidden = true;
}

async function checkOrderStatus() {
    if (checking) return;
    if (!orderId || !/^\d+$/.test(orderId)) {
        title.textContent = "Order status unavailable";
        statusMessage.textContent = "We could not find a valid order ID. View My Orders to check your purchases.";
        retryButton.hidden = true;
        actions.replaceChildren();
        showAction("View my orders", "/orders.html", true);
        actions.hidden = false;
        return;
    }

    checking = true;
    retryButton.hidden = true;
    statusMessage.textContent = "Confirming your payment with the server…";
    try {
        const result = await getOrder(orderId);
        const order = result.order;
        if (!order) throw new Error("The server did not return this order.");

        if (order.status === "paid") {
            renderPaid(result);
            return;
        }
        if (order.status !== "pending") {
            title.textContent = "Payment not confirmed";
            statusMessage.textContent = `Order ${order.order_number || order.id} is ${order.status}.`;
            retryButton.hidden = true;
            actions.replaceChildren();
            showAction("View my orders", "/orders.html", true);
            actions.hidden = false;
            return;
        }

        if (Date.now() - startedAt < maxDurationMs) {
            statusMessage.textContent = `Order ${order.order_number || order.id} is recorded. Your payment is being confirmed.`;
            window.setTimeout(checkOrderStatus, pollIntervalMs);
        } else {
            title.textContent = "Your payment is being confirmed";
            statusMessage.textContent = `Order ${order.order_number || order.id} is still pending. Check My Orders for the latest status.`;
            actions.replaceChildren();
            showAction("View my orders", "/orders.html", true);
            actions.hidden = false;
            retryButton.hidden = false;
        }
    } catch (error) {
        statusMessage.textContent = `We could not verify the order status: ${error.message}`;
        retryButton.hidden = false;
    } finally {
        checking = false;
    }
}

retryButton.addEventListener("click", () => {
    startedAt = Date.now();
    checkOrderStatus();
});

async function start() {
    try {
        const user = await requireRole("buyer");
        if (!user) return;
        checkOrderStatus();
    } catch (error) {
        statusMessage.textContent = `We could not verify your account: ${error.message}`;
        retryButton.hidden = false;
    }
}

start();
