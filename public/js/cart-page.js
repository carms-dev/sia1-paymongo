import "./layout.js";
import { getCurrentUser } from "./api.js";
import { getItems, remove, updateQuantity } from "./cart.js";
import { formatPeso, renderEmpty, showToast } from "./ui.js";
import { safeImageUrl } from "./storefront-ui.js";

const groupsContainer = document.getElementById("cart-groups");
const emptyContainer = document.getElementById("cart-empty");
const selected = new Set();
let user = null;
let cartUnreadable = false;

function cartItems() {
    return getItems();
}

function selectedItems() {
    return cartItems().filter(item => selected.has(String(item.product_id)));
}

function makeCheckbox(item, className = "") {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = className;
    checkbox.checked = selected.has(String(item.product_id));
    checkbox.setAttribute("aria-label", `Select ${item.name}`);
    checkbox.addEventListener("change", () => {
        if (checkbox.checked) selected.add(String(item.product_id));
        else selected.delete(String(item.product_id));
        render();
    });
    return checkbox;
}

function makeQuantityStepper(item) {
    const stepper = document.createElement("div");
    stepper.className = "quantity-stepper";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", `Decrease ${item.name} quantity`);
    minus.disabled = item.quantity <= 1;
    minus.addEventListener("click", () => {
        try {
            updateQuantity(item.product_id, item.quantity - 1);
            render();
        } catch (error) {
            showToast(error.message, { kind: "error" });
        }
    });
    const count = document.createElement("output");
    count.textContent = String(item.quantity);
    count.setAttribute("aria-label", `Quantity ${item.quantity}`);
    const max = Math.min(99, item.stock ?? 99);
    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `Increase ${item.name} quantity`);
    plus.disabled = item.quantity >= max;
    plus.addEventListener("click", () => {
        try {
            updateQuantity(item.product_id, item.quantity + 1);
            render();
        } catch (error) {
            showToast(error.message, { kind: "error" });
        }
    });
    stepper.append(minus, count, plus);
    return stepper;
}

function render() {
    if (cartUnreadable) return;
    const items = cartItems();
    selected.forEach(id => {
        if (!items.some(item => String(item.product_id) === id)) selected.delete(id);
    });
    emptyContainer.replaceChildren();
    groupsContainer.replaceChildren();
    const isEmpty = items.length === 0;
    document.querySelector(".cart-layout").hidden = isEmpty;
    document.querySelector(".cart-select-all").hidden = isEmpty;
    if (isEmpty) {
        emptyContainer.appendChild(renderEmpty(
            "Your cart is empty",
            "There are lots of good finds waiting to be discovered.",
            "Start Shopping",
            () => window.location.assign("/products.html")
        ));
        return;
    }

    const groups = new Map();
    items.forEach(item => {
        const groupKey = item.shop_id ? String(item.shop_id) : "marketplace";
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                name: item.shop_name || "BUDOL marketplace",
                id: item.shop_id || null,
                items: []
            });
        }
        groups.get(groupKey).items.push(item);
    });

    groups.forEach(group => {
        const section = document.createElement("section");
        section.className = "cart-shop-group";
        const heading = document.createElement("div");
        heading.className = "cart-shop-heading";
        const shopCheck = document.createElement("input");
        shopCheck.type = "checkbox";
        shopCheck.checked = group.items.every(item => selected.has(String(item.product_id)));
        shopCheck.setAttribute("aria-label", `Select all from ${group.name}`);
        shopCheck.addEventListener("change", () => {
            group.items.forEach(item => {
                const id = String(item.product_id);
                if (shopCheck.checked) selected.add(id);
                else selected.delete(id);
            });
            render();
        });
        const shopName = document.createElement("strong");
        shopName.textContent = group.name;
        const shopTitle = document.createElement("div");
        shopTitle.appendChild(shopName);
        if (group.id) {
            const shopLink = document.createElement("a");
            shopLink.className = "shop-open-link";
            shopLink.href = `/shop.html?id=${encodeURIComponent(group.id)}`;
            shopLink.textContent = "Visit shop";
            shopTitle.appendChild(shopLink);
        }
        heading.append(shopCheck, shopTitle);
        section.appendChild(heading);

        let shopSubtotal = 0;
        group.items.forEach(item => {
            const row = document.createElement("article");
            row.className = "cart-item-row";
            row.appendChild(makeCheckbox(item));
            const imageWrap = document.createElement("div");
            imageWrap.className = "cart-item-image";
            const src = safeImageUrl(item.image_url);
            if (src) {
                const image = document.createElement("img");
                image.src = src;
                image.alt = "";
                image.loading = "lazy";
                imageWrap.appendChild(image);
            } else {
                imageWrap.textContent = "B";
            }
            const info = document.createElement("div");
            info.className = "cart-item-info";
            const name = document.createElement("h3");
            name.textContent = item.name;
            const price = document.createElement("p");
            price.textContent = formatPeso(item.price_centavos);
            const controls = document.createElement("div");
            controls.className = "cart-item-controls";
            controls.appendChild(makeQuantityStepper(item));
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "button button-ghost";
            removeButton.textContent = "Remove";
            removeButton.addEventListener("click", () => {
                selected.delete(String(item.product_id));
                    remove(item.product_id);
                render();
            });
            controls.appendChild(removeButton);
            info.append(name, price);
            row.append(imageWrap, info, controls);
            section.appendChild(row);
            if (selected.has(String(item.product_id))) {
                shopSubtotal += item.price_centavos * item.quantity;
            }
        });

        const subtotal = document.createElement("div");
        subtotal.className = "cart-shop-subtotal";
        subtotal.textContent = `Estimated shop subtotal: ${formatPeso(shopSubtotal)}`;
        section.appendChild(subtotal);
        groupsContainer.appendChild(section);
    });

    const allSelected = items.every(item => selected.has(String(item.product_id)));
    const selectAll = document.getElementById("select-all");
    selectAll.checked = allSelected;
    selectAll.indeterminate = !allSelected && selected.size > 0;
    document.getElementById("selected-count").textContent =
        String(selectedItems().reduce((sum, item) => sum + item.quantity, 0));
    document.getElementById("estimated-subtotal").textContent =
        formatPeso(selectedItems().reduce((sum, item) => sum + item.price_centavos * item.quantity, 0));
    document.getElementById("cart-checkout").disabled =
        selected.size === 0 || (user && user.role !== "buyer");
}

document.getElementById("select-all").addEventListener("change", event => {
    const items = cartItems();
    if (event.currentTarget.checked) items.forEach(item => selected.add(String(item.product_id)));
    else selected.clear();
    render();
});

document.getElementById("cart-checkout").addEventListener("click", async () => {
    const ids = selectedItems().map(item => String(item.product_id));
    if (ids.length === 0) {
        showToast("Select at least one item to check out.", { kind: "error" });
        return;
    }
    sessionStorage.setItem("budol_checkout_selection", JSON.stringify(ids));
    if (user && user.role !== "buyer") {
        showToast("Only buyer accounts can place orders.", { kind: "error" });
        return;
    }
    if (!user) {
        const next = encodeURIComponent("/checkout.html");
        window.location.assign(`/login.html?next=${next}`);
        return;
    }
    window.location.assign("/checkout.html");
});

window.addEventListener("cart-changed", render);

getCurrentUser().then(result => {
    user = result.user;
    if (user.role !== "buyer") {
        const notice = document.getElementById("buyer-role-message");
        notice.hidden = false;
        notice.className = "state-panel";
        notice.textContent = "You are signed in with a seller or admin account. Only buyers can place orders.";
    }
    render();
}).catch(error => {
    if (error.status !== 401) showToast(error.message, { kind: "error" });
});

try {
    const initialItems = getItems();
    initialItems.forEach(item => selected.add(String(item.product_id)));
    render();
} catch (error) {
    cartUnreadable = true;
    document.querySelector(".cart-layout").hidden = true;
    document.querySelector(".cart-select-all").hidden = true;
    groupsContainer.replaceChildren();
    emptyContainer.replaceChildren(renderEmpty(
        "Your saved cart could not be opened",
        error.message,
        "Clear cart data",
        () => {
            localStorage.removeItem("budol_cart");
            window.location.reload();
        }
    ));
}
