import { add } from "./cart.js";
import { showToast, formatPeso } from "./ui.js";

export const categories = [
    { name: "Electronics", icon: "🎧" },
    { name: "Mobile Accessories", icon: "📱" },
    { name: "Fashion", icon: "🧢" },
    { name: "Beauty", icon: "🧴" },
    { name: "Home & Living", icon: "🪴" },
    { name: "Groceries", icon: "🥭" },
    { name: "Gaming", icon: "🎮" },
    { name: "Sports", icon: "⚽" },
    { name: "School Supplies", icon: "✏️" },
    { name: "Appliances", icon: "🔌" }
];

export function safeImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value, window.location.origin);
        return url.protocol === "https:" || url.origin === window.location.origin
            ? url.href
            : "";
    } catch {
        return "";
    }
}

export function productLink(product) {
    return `/product.html?id=${encodeURIComponent(product.id)}`;
}

function createImage(product, className = "product-card-image") {
    const box = document.createElement("div");
    box.className = className;
    const src = safeImageUrl(product.image_url);
    if (!src) {
        box.textContent = "BUDOL find";
        box.setAttribute("aria-label", "Product image unavailable");
        return box;
    }
    const image = document.createElement("img");
    image.src = src;
    image.alt = product.name || "Product image";
    image.loading = "lazy";
    image.addEventListener("error", () => {
        image.remove();
        box.textContent = "Image unavailable";
    }, { once: true });
    box.appendChild(image);
    return box;
}

export function createProductCard(product) {
    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.cy = "product-card";
    const imageLink = document.createElement("a");
    imageLink.href = productLink(product);
    imageLink.setAttribute("aria-label", `View ${product.name}`);
    imageLink.appendChild(createImage(product));

    const body = document.createElement("div");
    body.className = "product-card-body";
    const titleLink = document.createElement("a");
    titleLink.href = productLink(product);
    const title = document.createElement("h2");
    title.className = "product-card-title";
    title.dataset.cy = "product-title";
    title.textContent = product.name;
    titleLink.appendChild(title);

    const priceRow = document.createElement("div");
    const price = document.createElement("strong");
    price.className = "product-card-price";
    price.dataset.cy = "product-price";
    price.textContent = formatPeso(product.price_centavos);
    priceRow.appendChild(price);

    const original = Number(product.original_price_centavos);
    const current = Number(product.price_centavos);
    if (Number.isSafeInteger(original) && original > current) {
        const oldPrice = document.createElement("span");
        oldPrice.className = "product-card-original-price";
        oldPrice.textContent = formatPeso(original);
        priceRow.appendChild(oldPrice);

        const discount = Math.round((1 - current / original) * 100);
        const badge = document.createElement("span");
        badge.className = "discount-badge";
        badge.textContent = `${discount}% off`;
        body.append(titleLink, priceRow, badge);
    } else {
        body.append(titleLink, priceRow);
    }

    const shopName = product.shop_name || product.shop?.shop_name || "";
    if (shopName && product.shop_id) {
        const shop = document.createElement("a");
        shop.className = "product-card-shop";
        shop.href = `/shop.html?id=${encodeURIComponent(product.shop_id)}`;
        shop.textContent = shopName;
        body.appendChild(shop);
    }

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "button button-primary";
    addButton.dataset.cy = "add-to-cart";
    addButton.textContent = Number(product.stock) > 0 ? "Add to cart" : "Out of stock";
    addButton.disabled = Number(product.stock) <= 0;
    addButton.addEventListener("click", () => {
        try {
            add({
                ...product,
                shop_name: shopName
            });
            showToast(`${product.name} added to cart.`, { kind: "success" });
        } catch (error) {
            showToast(error.message, { kind: "error" });
        }
    });

    body.appendChild(addButton);
    card.append(imageLink, body);
    return card;
}

export function renderProductGrid(container, products) {
    container.replaceChildren();
    products.forEach(product => container.appendChild(createProductCard(product)));
}

export function categoryFor(product) {
    if (typeof product.category === "string" && product.category) return product.category;
    const text = `${product.name || ""} ${product.description || ""}`.toLowerCase();
    const knownRules = [
        ["Mobile Accessories", /\b(phone|mobile|charger|charging|cable|usb|case|screen protector)\b/],
        ["Electronics", /\b(electronic|earbud|headphone|speaker|mouse|keyboard|camera)\b/],
        ["Fashion", /\b(fashion|shirt|clothing|apparel|tote|bag|cap|wear|socks)\b/],
        ["Beauty", /\b(beauty|skin|makeup|cosmetic|hair|serum|lotion)\b/],
        ["Home & Living", /\b(home|living|organizer|decor|kitchen|bottle|tumbler|storage|lamp)\b/],
        ["Groceries", /\b(grocery|snack|food|coffee|tea|rice|pantry)\b/],
        ["Gaming", /\b(gaming|game|controller|console)\b/],
        ["Sports", /\b(sport|fitness|exercise|yoga|ball)\b/],
        ["School Supplies", /\b(school|notebook|notepad|pen|pencil|stationery|supplies)\b/],
        ["Appliances", /\b(appliance|fan|blender|kettle|rice cooker|iron)\b/]
    ];
    return knownRules.find(([, pattern]) => pattern.test(text))?.[0] || "";
}

export function categoryLink(category) {
    return `/products.html?category=${encodeURIComponent(category)}`;
}

export function makeImage(product, className = "product-detail-image") {
    const box = createImage(product, className);
    if (box.querySelector("img")) return box;
    box.textContent = "Product image unavailable";
    return box;
}
