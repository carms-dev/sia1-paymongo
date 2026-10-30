import "./layout.js";
import { getOrder } from "./api.js";

const statusMessage = document.getElementById("order-status");
const retryButton = document.getElementById("retry-status");
const orderId = new URLSearchParams(window.location.search).get("order_id");
let checking = false;

async function checkOrderStatus() {
    if (checking) return;
    if (!orderId || !/^\d+$/.test(orderId)) {
        statusMessage.textContent = "No valid order ID was provided.";
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
        statusMessage.textContent = `Order ${order.order_number || order.id} currently has status: ${order.status}.`;
    } catch (error) {
        statusMessage.textContent = `We could not retrieve the order status: ${error.message}`;
        retryButton.hidden = false;
    } finally {
        checking = false;
    }
}

retryButton.addEventListener("click", checkOrderStatus);
checkOrderStatus();
