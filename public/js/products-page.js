import "./layout.js";
import { getProducts } from "./api.js";
import { renderEmpty, renderError, renderSkeleton } from "./ui.js";
import { categoryFor, createProductCard } from "./storefront-ui.js";

const params = new URLSearchParams(window.location.search);
const query = (params.get("q") || "").trim();
const category = params.get("category") || "";
const pageSize = 20;
let products = [];
let currentPage = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
let minimum = null;
let maximum = null;
const grid = document.getElementById("products-grid");
const filterPanel = document.getElementById("filter-panel");
const filterToggle = document.getElementById("filter-toggle");
const filterBackdrop = document.getElementById("filter-backdrop");

document.getElementById("results-title").textContent =
    category || (query ? `Results for “${query}”` : "All products");
document.getElementById("breadcrumb-current").textContent =
    category || (query ? `Search: ${query}` : "Products");
document.getElementById("sort-products").value =
    ["featured", "price-asc", "price-desc", "name"].includes(params.get("sort"))
        ? params.get("sort")
        : "featured";

function visibleProducts() {
    const normalizedQuery = query.toLocaleLowerCase();
    const filtered = products.filter(product => {
        const searchable = `${product.name} ${product.description || ""} ${product.shop_name || ""}`.toLocaleLowerCase();
        const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
        const matchesCategory = !category || product.category === category || categoryFor(product) === category;
        const price = Number(product.price_centavos);
        return matchesQuery && matchesCategory &&
            (minimum === null || price >= minimum * 100) &&
            (maximum === null || price <= maximum * 100);
    });

    switch (document.getElementById("sort-products").value) {
        case "price-asc":
            filtered.sort((a, b) => a.price_centavos - b.price_centavos);
            break;
        case "price-desc":
            filtered.sort((a, b) => b.price_centavos - a.price_centavos);
            break;
        case "name":
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            break;
        default:
            break;
    }
    return filtered;
}

function renderPagination(pageCount) {
    const container = document.getElementById("products-pagination");
    container.replaceChildren();
    if (pageCount <= 1) return;
    const addButton = (label, page, disabled = false, current = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = disabled;
        if (current) button.setAttribute("aria-current", "page");
        button.addEventListener("click", () => {
            currentPage = page;
            render();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
        container.appendChild(button);
    };
    addButton("Previous", Math.max(1, currentPage - 1), currentPage <= 1);
    const first = Math.max(1, currentPage - 2);
    const last = Math.min(pageCount, currentPage + 2);
    for (let page = first; page <= last; page += 1) {
        addButton(String(page), page, false, page === currentPage);
    }
    addButton("Next", Math.min(pageCount, currentPage + 1), currentPage >= pageCount);
}

function render() {
    const filtered = visibleProducts();
    document.getElementById("results-count").textContent =
        `${filtered.length} ${filtered.length === 1 ? "product" : "products"} found`;
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, pages);
    const start = (currentPage - 1) * pageSize;
    const pageProducts = filtered.slice(start, start + pageSize);
    if (!pageProducts.length) {
        grid.replaceChildren(renderEmpty(
            "No products found",
            "Try a different search or clear the current filters to see more products.",
            "Show all products",
            () => window.location.assign("/products.html")
        ));
        renderPagination(0);
        return;
    }
    grid.replaceChildren(...pageProducts.map(createProductCard));
    renderPagination(pages);
}

async function loadProducts() {
    grid.replaceChildren(renderSkeleton(10));
    try {
        const result = await getProducts();
        products = result.products;
        render();
    } catch (error) {
        grid.replaceChildren(renderError(loadProducts, error.message));
        document.getElementById("results-count").textContent = "Products unavailable";
    }
}

document.getElementById("sort-products").addEventListener("change", () => {
    currentPage = 1;
    render();
});
document.getElementById("apply-price").addEventListener("click", () => {
    const minValue = document.getElementById("price-min").value;
    const maxValue = document.getElementById("price-max").value;
    minimum = minValue === "" ? null : Number(minValue);
    maximum = maxValue === "" ? null : Number(maxValue);
    if ((minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) ||
        (maximum !== null && (!Number.isFinite(maximum) || maximum < 0)) ||
        (minimum !== null && maximum !== null && minimum > maximum)) {
        grid.replaceChildren(renderEmpty(
            "Check your price range",
            "Enter a non-negative minimum that is not greater than the maximum.",
            "Clear filters",
            () => document.getElementById("clear-filters").click()
        ));
        document.getElementById("results-count").textContent = "Invalid price range";
        return;
    }
    currentPage = 1;
    render();
});
document.getElementById("clear-filters").addEventListener("click", () => {
    minimum = null;
    maximum = null;
    document.getElementById("price-min").value = "";
    document.getElementById("price-max").value = "";
    window.location.assign(`/products.html${category ? `?category=${encodeURIComponent(category)}` : query ? `?q=${encodeURIComponent(query)}` : ""}`);
});

function closeFilters() {
    filterPanel.classList.remove("is-open");
    filterBackdrop.hidden = true;
    filterToggle.setAttribute("aria-expanded", "false");
}

filterToggle.addEventListener("click", () => {
    const opening = !filterPanel.classList.contains("is-open");
    filterPanel.classList.toggle("is-open", opening);
    filterBackdrop.hidden = !opening;
    filterToggle.setAttribute("aria-expanded", String(opening));
});
filterBackdrop.addEventListener("click", closeFilters);
document.getElementById("apply-price").addEventListener("click", closeFilters);

loadProducts();
