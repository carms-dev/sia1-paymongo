import "./layout.js";
import { getProducts, getShops } from "./api.js";
import { renderEmpty, renderError, renderSkeleton } from "./ui.js";
import { categories, createProductCard } from "./storefront-ui.js";

const shopList = document.getElementById("shop-list");
const productGrid = document.getElementById("home-products");
const loadMoreButton = document.getElementById("load-more-products");
let allProducts = [];
let shownProducts = 10;

function renderCategories() {
    const container = document.getElementById("category-shortcuts");
    categories.forEach(category => {
        const link = document.createElement("a");
        link.className = "category-shortcut";
        link.href = `/products.html?category=${encodeURIComponent(category.name)}`;
        const icon = document.createElement("span");
        icon.className = "category-shortcut-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = category.icon;
        const name = document.createElement("span");
        name.textContent = category.name;
        link.append(icon, name);
        container.appendChild(link);
    });
}

function createShopCard(shop) {
    const card = document.createElement("a");
    card.className = "shop-card";
    card.href = `/shop.html?id=${encodeURIComponent(shop.id)}`;
    const logo = document.createElement("span");
    logo.className = "shop-logo";
    if (typeof shop.logo_url === "string" && shop.logo_url) {
        try {
            const url = new URL(shop.logo_url, window.location.origin);
            if (url.protocol === "https:" || url.origin === window.location.origin) {
                const image = document.createElement("img");
                image.src = url.href;
                image.alt = "";
                image.loading = "lazy";
                logo.appendChild(image);
            }
        } catch {
            logo.textContent = String(shop.shop_name || "B").slice(0, 1).toUpperCase();
        }
    } else {
        logo.textContent = String(shop.shop_name || "B").slice(0, 1).toUpperCase();
    }
    const details = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = shop.shop_name || "BUDOL shop";
    const description = document.createElement("p");
    description.textContent = shop.description || "Browse this shop’s everyday finds.";
    details.append(name, description);
    card.append(logo, details);
    return card;
}

async function loadShops() {
    shopList.replaceChildren(renderSkeleton(3, { type: "list" }));
    try {
        const result = await getShops({ limit: 6 });
        if (!Array.isArray(result.shops)) throw new Error("The shop service returned an invalid list.");
        shopList.replaceChildren();
        if (!result.shops.length) {
            shopList.appendChild(renderEmpty(
                "No shops to show yet",
                "Explore the product catalog while shops are getting ready.",
                "Browse products",
                () => window.location.assign("/products.html")
            ));
            return;
        }
        result.shops.forEach(shop => shopList.appendChild(createShopCard(shop)));
    } catch (error) {
        shopList.replaceChildren(renderError(loadShops, error.message));
    }
}

function renderProducts() {
    productGrid.replaceChildren();
    allProducts.slice(0, shownProducts).forEach(product => {
        productGrid.appendChild(createProductCard(product));
    });
    loadMoreButton.hidden = shownProducts >= allProducts.length;
}

async function loadProducts() {
    productGrid.replaceChildren(renderSkeleton(10));
    loadMoreButton.hidden = true;
    try {
        const result = await getProducts();
        allProducts = result.products;
        if (!allProducts.length) {
            productGrid.replaceChildren(renderEmpty(
                "No products available yet",
                "Check back soon or browse the shops on BUDOL.",
                "Browse shops",
                () => document.getElementById("shops-title").scrollIntoView({ behavior: "smooth" })
            ));
            return;
        }
        renderProducts();
    } catch (error) {
        productGrid.replaceChildren(renderError(loadProducts, error.message));
    }
}

document.getElementById("load-more-products").addEventListener("click", () => {
    shownProducts += 10;
    renderProducts();
});

renderCategories();
loadShops();
loadProducts();
