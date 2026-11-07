import "./layout.js";
import { getOrder } from "./api.js";
import { requireRole } from "./auth-guard.js";
import { formatDate, formatPeso, renderEmpty, renderError, renderSkeleton } from "./ui.js";

const content = document.getElementById("order-details-content");
const orderId = new URLSearchParams(window.location.search).get("id");

function valueRow(label, value) {
    const row = document.createElement("div");
    row.className = "detail-value-row";
    const key = document.createElement("span");
    key.textContent = label;
    const text = document.createElement("strong");
    text.textContent = value || "—";
    row.append(key, text);
    return row;
}

function renderOrder(result) {
    const { order, items } = result;
    content.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "buyer-section-heading";
    const headingCopy = document.createElement("div");
    const title = document.createElement("h1");
    title.textContent = order.order_number || `Order ${order.id}`;
    const date = document.createElement("p");
    date.textContent = `Placed ${formatDate(order.created_at)}`;
    headingCopy.append(title, date);
    const badge = document.createElement("span");
    badge.className = `status-badge status-${order.status}`;
    badge.textContent = order.status;
    heading.append(headingCopy, badge);

    const grid = document.createElement("div");
    grid.className = "order-details-grid";
    const itemsCard = document.createElement("section");
    itemsCard.className = "card";
    const itemsTitle = document.createElement("h2");
    itemsTitle.textContent = "Items";
    const itemList = document.createElement("div");
    itemList.className = "order-details-items";
    let subtotal = 0;
    items.forEach(item => {
        const row = document.createElement("article");
        row.className = "detail-item";
        const name = document.createElement("h3");
        name.textContent = item.product_name || "Product";
        const amount = Number(item.line_total_centavos ?? item.price_centavos * item.quantity);
        subtotal += amount;
        const price = document.createElement("p");
        price.textContent = `${item.quantity} × ${formatPeso(item.price_centavos)} · ${formatPeso(amount)}`;
        const fulfillmentLabel = document.createElement("span");
        fulfillmentLabel.className = `status-badge status-${item.fulfillment_status || "pending"}`;
        fulfillmentLabel.textContent = `Fulfillment: ${item.fulfillment_status || "pending"}`;
        row.append(name, price, fulfillmentLabel);
        if (item.courier) row.appendChild(valueRow("Courier", item.courier));
        if (item.tracking_number) row.appendChild(valueRow("Tracking number", item.tracking_number));
        itemList.appendChild(row);
    });
    const totals = document.createElement("div");
    totals.className = "order-totals";
    totals.append(valueRow("Items subtotal", formatPeso(subtotal)));
    totals.append(valueRow("Order total", formatPeso(order.total_centavos)));
    itemsCard.append(itemsTitle, itemList, totals);

    const deliveryCard = document.createElement("section");
    deliveryCard.className = "card";
    const deliveryTitle = document.createElement("h2");
    deliveryTitle.textContent = "Delivery address";
    const address = document.createElement("address");
    address.className = "delivery-address";
    [
        order.recipient_name || order.customer_name,
        order.phone,
        order.address_line,
        order.barangay,
        [order.city, order.province, order.region].filter(Boolean).join(", "),
        order.postal_code,
        order.delivery_notes ? `Delivery note: ${order.delivery_notes}` : ""
    ].filter(Boolean).forEach(part => {
        const line = document.createElement("span");
        line.textContent = part;
        address.appendChild(line);
    });
    const paymentTitle = document.createElement("h2");
    paymentTitle.textContent = "Payment status";
    const paymentStatus = document.createElement("span");
    paymentStatus.className = `status-badge status-${order.status}`;
    paymentStatus.textContent = order.status;
    deliveryCard.append(deliveryTitle, address, paymentTitle, paymentStatus);
    if (order.status === "pending") {
        const pay = document.createElement("a");
        pay.className = "button button-primary order-pay-link";
        pay.href = `/orders.html?status=pending`;
        pay.textContent = "Pay from My Orders";
        deliveryCard.appendChild(pay);
    }

    grid.append(itemsCard, deliveryCard);
    const back = document.createElement("a");
    back.className = "button button-secondary";
    back.href = "/orders.html";
    back.textContent = "Back to My Orders";
    content.append(heading, grid, back);
}

async function loadDetails() {
    content.replaceChildren(renderSkeleton(2, { type: "list" }));
    try {
        const user = await requireRole("buyer");
        if (!user) return;
        if (!orderId || !/^\d+$/.test(orderId)) {
            content.replaceChildren(renderEmpty(
                "Order not found",
                "A valid order ID is required to view order details.",
                "View my orders",
                () => window.location.assign("/orders.html")
            ));
            return;
        }
        renderOrder(await getOrder(orderId));
    } catch (error) {
        content.replaceChildren(renderError(loadDetails, error.message));
    }
}

loadDetails();
