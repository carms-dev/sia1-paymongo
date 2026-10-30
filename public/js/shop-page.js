import "./layout.js";
import { getShop, getShopProducts } from "./api.js";
import { renderEmpty, renderError, renderSkeleton } from "./ui.js";
import { createProductCard, safeImageUrl } from "./storefront-ui.js";

const shopId = new URLSearchParams(window.location.search).get("id");
const container = document.getElementById("shop-content");

function renderShop(shop, products) {
    document.title = `${shop.shop_name || "Shop"} | BUDOL`;
    document.getElementById("shop-breadcrumb").textContent = shop.shop_name || "Shop";
    container.replaceChildren();
    const banner = document.createElement("section");
    banner.className = "shop-banner";
    banner.setAttribute("aria-hidden", "true");
    const profile = document.createElement("section");
    profile.className = "shop-profile";
    const logo = document.createElement("span");
    logo.className = "shop-logo";
    const logoUrl = safeImageUrl(shop.logo_url);
    if (logoUrl) {
        const image = document.createElement("img");
        image.src = logoUrl;
        image.alt = "";
        logo.appendChild(image);
    } else {
        logo.textContent = String(shop.shop_name || "B").slice(0, 1).toUpperCase();
    }
    const info = document.createElement("div");
    const name = document.createElement("h1");
    name.textContent = shop.shop_name || "BUDOL shop";
    const description = document.createElement("p");
    description.textContent = shop.description || "Browse this shop’s marketplace products.";
    info.append(name, description);
    profile.append(logo, info);

    const heading = document.createElement("div");
    heading.className = "buyer-section-heading";
    const title = document.createElement("h2");
    title.textContent = "Shop products";
    heading.appendChild(title);
    const grid = document.createElement("div");
    grid.className = "product-grid";
    if (!products.length) {
        grid.appendChild(renderEmpty(
            "This shop has no products yet",
            "Browse other BUDOL products while this shop gets ready.",
            "Browse products",
            () => window.location.assign("/products.html")
        ));
    } else {
        products.forEach(product => grid.appendChild(createProductCard({
            ...product,
            shop_id: product.shop_id || shop.id,
            shop_name: product.shop_name || shop.shop_name
        })));
    }
    container.append(banner, profile, heading, grid);
}

async function loadShop() {
    if (!shopId || !/^\d+$/.test(shopId)) {
        container.replaceChildren(renderEmpty(
            "Shop not found",
            "This shop link is missing a valid shop ID.",
            "Browse products",
            () => window.location.assign("/products.html")
        ));
        return;
    }
    container.replaceChildren(renderSkeleton(5));
    try {
        const [shopResult, productResult] = await Promise.all([
            getShop(shopId),
            getShopProducts(shopId)
        ]);
        if (!shopResult?.shop) {
            container.replaceChildren(renderEmpty(
                "Shop not found",
                "This shop may have closed or is not available.",
                "Browse products",
                () => window.location.assign("/products.html")
            ));
            return;
        }
        renderShop(shopResult.shop, productResult.products);
    } catch (error) {
        if (error.status === 404) {
            container.replaceChildren(renderEmpty(
                "Shop not found",
                error.message,
                "Browse products",
                () => window.location.assign("/products.html")
            ));
        } else {
            container.replaceChildren(renderError(loadShop, error.message));
        }
    }
}

loadShop();
