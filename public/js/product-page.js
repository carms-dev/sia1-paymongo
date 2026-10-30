import "./layout.js";
import { getProduct } from "./api.js";
import { add } from "./cart.js";
import { formatPeso, renderEmpty, renderError, renderSkeleton, showToast } from "./ui.js";
import { makeImage, safeImageUrl } from "./storefront-ui.js";

const container = document.getElementById("product-content");
const productId = new URLSearchParams(window.location.search).get("id");
let product;
let quantity = 1;

function renderProduct() {
    document.title = `${product.name} | BUDOL`;
    document.getElementById("product-breadcrumb").textContent = product.name;
    container.replaceChildren();

    const layout = document.createElement("section");
    layout.className = "product-detail-layout";
    layout.setAttribute("aria-label", "Product details");
    const image = makeImage(product);
    if (image.querySelector("img")) {
        image.querySelector("img").alt = product.name;
    }

    const info = document.createElement("div");
    info.className = "product-detail-info";
    if (product.category) {
        const category = document.createElement("p");
        category.className = "product-card-shop";
        category.textContent = product.category;
        info.appendChild(category);
    }
    const title = document.createElement("h1");
    title.textContent = product.name;
    const price = document.createElement("div");
    price.className = "detail-price";
    const currentPrice = document.createElement("span");
    currentPrice.textContent = formatPeso(product.price_centavos);
    price.appendChild(currentPrice);
    const original = Number(product.original_price_centavos);
    if (Number.isSafeInteger(original) && original > product.price_centavos) {
        const oldPrice = document.createElement("span");
        oldPrice.className = "detail-original-price";
        oldPrice.textContent = formatPeso(original);
        const discount = document.createElement("span");
        discount.className = "discount-badge";
        discount.textContent = `${Math.round((1 - product.price_centavos / original) * 100)}% off`;
        price.append(oldPrice, discount);
    }

    const stock = Number(product.stock);
    const stockMessage = document.createElement("p");
    stockMessage.className = "stock-status";
    if (stock <= 0) {
        stockMessage.classList.add("out-of-stock");
        stockMessage.textContent = "Out of stock";
    } else if (stock <= 5) {
        stockMessage.classList.add("low-stock");
        stockMessage.textContent = `Low stock — ${stock} left`;
    } else {
        stockMessage.textContent = "In stock";
    }
    const description = document.createElement("p");
    description.className = "detail-description";
    description.textContent = product.description || "A useful everyday find from a BUDOL shop.";

    const quantityLabel = document.createElement("label");
    quantityLabel.textContent = "Quantity";
    quantityLabel.htmlFor = "product-quantity";
    const stepper = document.createElement("div");
    stepper.className = "quantity-stepper";
    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.textContent = "−";
    decrease.setAttribute("aria-label", "Decrease quantity");
    const output = document.createElement("output");
    output.id = "product-quantity";
    output.setAttribute("aria-live", "polite");
    output.value = String(quantity);
    output.textContent = String(quantity);
    const increase = document.createElement("button");
    increase.type = "button";
    increase.textContent = "+";
    increase.setAttribute("aria-label", "Increase quantity");
    decrease.disabled = stock <= 0 || quantity <= 1;
    increase.disabled = stock <= 0 || quantity >= Math.min(99, stock);
    const updateStepper = () => {
        output.value = String(quantity);
        output.textContent = String(quantity);
        decrease.disabled = stock <= 0 || quantity <= 1;
        increase.disabled = stock <= 0 || quantity >= Math.min(99, stock);
    };
    decrease.addEventListener("click", () => { quantity -= 1; updateStepper(); });
    increase.addEventListener("click", () => { quantity += 1; updateStepper(); });
    stepper.append(decrease, output, increase);

    const actions = document.createElement("div");
    actions.className = "detail-actions";
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "button button-primary";
    addButton.dataset.cy = "add-to-cart";
    addButton.textContent = "Add to Cart";
    addButton.disabled = stock <= 0;
    addButton.addEventListener("click", () => {
        try {
            add(product, quantity);
            showToast(`${product.name} added to cart.`, { kind: "success" });
        } catch (error) {
            showToast(error.message, { kind: "error" });
        }
    });
    const buyButton = document.createElement("button");
    buyButton.type = "button";
    buyButton.className = "button button-secondary";
    buyButton.textContent = "Buy Now";
    buyButton.disabled = stock <= 0;
    buyButton.addEventListener("click", () => {
        try {
            add(product, quantity);
            sessionStorage.setItem("budol_checkout_selection", JSON.stringify([String(product.id)]));
            window.location.assign("/checkout.html");
        } catch (error) {
            showToast(error.message, { kind: "error" });
        }
    });
    actions.append(addButton, buyButton);

    info.append(title, price, stockMessage, description, quantityLabel, stepper, actions);
    layout.append(image, info);
    container.appendChild(layout);

    const sellerName = product.shop_name || product.shop?.shop_name;
    if (product.shop_id && sellerName) {
        const sellerCard = document.createElement("a");
        sellerCard.className = "seller-card";
        sellerCard.href = `/shop.html?id=${encodeURIComponent(product.shop_id)}`;
        const logo = document.createElement("span");
        logo.className = "shop-logo";
        const logoUrl = safeImageUrl(product.shop_logo_url);
        if (logoUrl) {
            const logoImage = document.createElement("img");
            logoImage.src = logoUrl;
            logoImage.alt = "";
            logo.appendChild(logoImage);
        } else {
            logo.textContent = sellerName.slice(0, 1).toUpperCase();
        }
        const sellerInfo = document.createElement("span");
        sellerInfo.textContent = `Sold by ${sellerName} · Visit shop →`;
        sellerCard.append(logo, sellerInfo);
        container.appendChild(sellerCard);
    }
}

async function loadProduct() {
    if (!productId || !/^\d+$/.test(productId)) {
        container.replaceChildren(renderEmpty(
            "Product not found",
            "This product link is missing a valid product ID.",
            "Browse products",
            () => window.location.assign("/products.html")
        ));
        return;
    }
    container.replaceChildren(renderSkeleton(2, { type: "list" }));
    try {
        product = await getProduct(productId);
        if (!product?.id) {
            container.replaceChildren(renderEmpty(
                "Product not found",
                "This product may have been removed or is no longer available.",
                "Browse products",
                () => window.location.assign("/products.html")
            ));
            return;
        }
        renderProduct();
    } catch (error) {
        if (error.status === 404) {
            container.replaceChildren(renderEmpty(
                "Product not found",
                error.message,
                "Browse products",
                () => window.location.assign("/products.html")
            ));
        } else {
            container.replaceChildren(renderError(loadProduct, error.message));
        }
    }
}

loadProduct();
