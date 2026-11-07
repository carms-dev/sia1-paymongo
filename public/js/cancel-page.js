import "./layout.js";
import { createCheckout, getOrder } from "./api.js";
import { requireRole } from "./auth-guard.js";

const statusMessage = document.getElementById("order-status");
const retryButton = document.getElementById("retry-checkout");
const checkButton = document.getElementById("retry-status");
const orderId = new URLSearchParams(window.location.search).get("order_id");
let currentOrder = null;

function hostedCheckoutUrl(value) {
    if (typeof value !== "string" || !value) throw new Error("The payment service did not return a checkout link.");
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin &&
        !(url.protocol === "https:" && url.hostname === "checkout.paymongo.com")) {
        throw new Error("The payment service returned an unsafe checkout link.");
    }
    return url.href;
}

async function loadOrder() {
    retryButton.disabled = true;
    retryButton.hidden = true;
    if (!orderId || !/^\d+$/.test(orderId)) {
        statusMessage.textContent = "No valid order ID was provided. Go to My Orders to find your order.";
        checkButton.hidden = true;
        return;
    }
    statusMessage.textContent = "Checking the order status with the server…";
    try {
        const result = await getOrder(orderId);
        currentOrder = result.order;
        if (!currentOrder) throw new Error("The server did not return this order.");
        if (currentOrder.status === "paid") {
            statusMessage.textContent = `Payment is already confirmed for ${currentOrder.order_number || currentOrder.id}.`;
            retryButton.hidden = true;
        } else if (currentOrder.status === "pending") {
            statusMessage.textContent = `Payment for ${currentOrder.order_number || currentOrder.id} was not completed. You can try the secure payment page again.`;
            retryButton.hidden = false;
            retryButton.disabled = false;
        } else {
            statusMessage.textContent = `Order ${currentOrder.order_number || currentOrder.id} is ${currentOrder.status}; a payment retry is not available.`;
        }
    } catch (error) {
        statusMessage.textContent = `We could not retrieve the order status: ${error.message}`;
        checkButton.hidden = false;
    }
}

retryButton.addEventListener("click", async () => {
    if (!currentOrder || currentOrder.status !== "pending") {
        await loadOrder();
        return;
    }
    retryButton.disabled = true;
    statusMessage.textContent = "Preparing another secure checkout…";
    try {
        const result = await createCheckout({ order_id: currentOrder.id });
        window.location.assign(hostedCheckoutUrl(result.checkout_url));
    } catch (error) {
        statusMessage.textContent = `We could not restart checkout: ${error.message}`;
        retryButton.disabled = false;
    }
});

checkButton.addEventListener("click", loadOrder);

async function start() {
    try {
        const user = await requireRole("buyer");
        if (!user) return;
        loadOrder();
    } catch (error) {
        statusMessage.textContent = `We could not verify your account: ${error.message}`;
        checkButton.hidden = false;
    }
}

start();
