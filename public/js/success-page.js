import "./layout.js";
import { getOrder } from "./api.js";

const statusMessage = document.getElementById("order-status");
const retryButton = document.getElementById("retry-status");
const orderId = new URLSearchParams(window.location.search).get("order_id");
const maxAttempts = 15;
const pollIntervalMs = 2000;
let attempts = 0;
let checking = false;

async function checkOrderStatus() {
    if (checking) return;
    if (!orderId || !/^\d+$/.test(orderId)) {
        statusMessage.textContent = "We could not find a valid order ID. Please check your orders or contact support.";
        retryButton.hidden = true;
        return;
    }

    checking = true;
    retryButton.hidden = true;
    statusMessage.textContent = "Checking order status…";
    try {
        const result = await getOrder(orderId);
        const order = result.order;
        if (!order) throw new Error("The server did not return this order.");

        if (order.status === "paid") {
            statusMessage.textContent = `Payment confirmed for order ${order.order_number || order.id}.`;
            return;
        }
        if (order.status !== "pending") {
            statusMessage.textContent = `Order ${order.order_number || order.id} status: ${order.status}.`;
            return;
        }

        attempts += 1;
        statusMessage.textContent = `Order ${order.order_number || order.id} is recorded, but payment is not yet confirmed.`;
        if (attempts < maxAttempts) {
            window.setTimeout(checkOrderStatus, pollIntervalMs);
        } else {
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
    attempts = 0;
    checkOrderStatus();
});

checkOrderStatus();
