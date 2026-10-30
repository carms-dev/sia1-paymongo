const productGrid = document.getElementById('product-grid');
const productTotal = document.getElementById('product-total');
const cartButton = document.getElementById('cart-button');
const cartCount = document.getElementById('cart-count');
const mobileCartCount = document.getElementById('mobile-cart-count');
const cartOverlay = document.getElementById('cart-overlay');
const checkoutOverlay = document.getElementById('checkout-overlay');
const productOverlay = document.getElementById('product-overlay');
const cartItemsContainer = document.getElementById('cart-items');
const cartSubtotal = document.getElementById('cart-subtotal');
const checkoutTotal = document.getElementById('checkout-total');
const checkoutForm = document.getElementById('checkout-form');
const checkoutMessage = document.getElementById('checkout-message');
const placeOrderButton = document.getElementById('place-order-button');
const toast = document.getElementById('toast');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const loadMoreButton = document.getElementById('load-more-button');
const activeFilters = document.getElementById('active-filters');
const activeFilterLabel = document.getElementById('active-filter-label');

const categoryRules = {
    Electronics: /\b(electronic|audio|earbud|headphone|speaker|mouse|keyboard|charger|cable|phone|gaming|fan)\b/i,
    Fashion: /\b(fashion|shirt|t-shirt|clothing|apparel|tote|bag|cap|wear)\b/i,
    'Home & Living': /\b(home|living|organizer|organiser|decor|kitchen|bottle|tumbler|storage)\b/i,
    Beauty: /\b(beauty|skin|makeup|cosmetic|hair|personal care)\b/i,
    'School Supplies': /\b(school|notebook|notepad|pen|pencil|stationery|suppl(y|ies))\b/i
};

const categoryIcons = {
    Electronics: '🎧',
    Fashion: '🧢',
    'Home & Living': '🪴',
    Beauty: '🧴',
    'School Supplies': '✏️',
    'Everyday Finds': '✨'
};

let products = [];
let selectedCategory = '';
let searchTerm = '';
let visibleProductLimit = 12;
let activeDialog = null;
const cart = new Map();

function peso(centavos) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(Number(centavos) / 100);
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
        toast.classList.remove('show');
    }, 2600);
}

function openPanel(panel) {
    panel.hidden = false;
    activeDialog = panel;
    document.body.classList.add('no-scroll');
    const firstButton = panel.querySelector('button');

    if (firstButton) firstButton.focus();
}

function closePanel(panel) {
    panel.hidden = true;

    if (activeDialog === panel) activeDialog = null;

    if (cartOverlay.hidden && checkoutOverlay.hidden && productOverlay.hidden) {
        document.body.classList.remove('no-scroll');
    }
}

function safeImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    try {
        const url = new URL(value, window.location.origin);

        if (url.protocol === 'https:' || url.origin === window.location.origin) {
            return url.href;
        }
    } catch {
        return null;
    }

    return null;
}

function getProductCategory(product) {
    const text = `${product.name || ''} ${product.description || ''}`;

    for (const [category, pattern] of Object.entries(categoryRules)) {
        if (pattern.test(text)) return category;
    }

    return 'Everyday Finds';
}

function createProductImage(product, className = 'product-image') {
    const container = document.createElement('div');
    container.className = className;
    const imageUrl = safeImageUrl(product.image_url);

    if (imageUrl) {
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = product.name || 'Product image';
        image.loading = 'lazy';
        image.addEventListener('error', () => {
            container.replaceChildren();
            container.classList.add('image-fallback');
            container.textContent = categoryIcons[getProductCategory(product)] || '✦';
        }, { once: true });
        container.appendChild(image);
    } else {
        container.classList.add('image-fallback');
        container.textContent = categoryIcons[getProductCategory(product)] || '✦';
        container.setAttribute('aria-label', `${product.name || 'Product'} image placeholder`);
    }

    return container;
}

function getFilteredProducts() {
    const normalizedQuery = searchTerm.trim().toLocaleLowerCase();
    const filteredProducts = products.filter(product => {
        const searchableText =
            `${product.name || ''} ${product.description || ''}`.toLocaleLowerCase();
        const matchesSearch = !normalizedQuery || searchableText.includes(normalizedQuery);
        const matchesCategory =
            !selectedCategory || getProductCategory(product) === selectedCategory;

        return matchesSearch && matchesCategory;
    });

    switch (sortSelect.value) {
        case 'price-asc':
            filteredProducts.sort((a, b) => Number(a.price_centavos) - Number(b.price_centavos));
            break;
        case 'price-desc':
            filteredProducts.sort((a, b) => Number(b.price_centavos) - Number(a.price_centavos));
            break;
        case 'name':
            filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
            break;
        default:
            break;
    }

    return filteredProducts;
}

function updateActiveFilters(resultCount) {
    const filters = [];

    if (searchTerm) filters.push(`Search: “${searchTerm}”`);
    if (selectedCategory) filters.push(selectedCategory);

    activeFilters.hidden = filters.length === 0;
    activeFilterLabel.textContent = filters.length
        ? `${filters.join(' · ')} — ${resultCount} ${resultCount === 1 ? 'find' : 'finds'}`
        : '';
}

function createProductCard(product) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.appendChild(createProductImage(product));

    const info = document.createElement('div');
    info.className = 'product-info';

    const category = document.createElement('span');
    category.className = 'product-category';
    category.textContent = getProductCategory(product);

    const name = document.createElement('h3');
    name.textContent = product.name;
    name.title = product.name;

    const description = document.createElement('p');
    description.className = 'product-description';
    description.textContent =
        product.description || 'A useful everyday find from BUDOL.';

    const bottom = document.createElement('div');
    bottom.className = 'product-bottom';

    const price = document.createElement('span');
    price.className = 'product-price';
    price.textContent = peso(product.price_centavos);

    const stock = Number(product.stock);
    const addButton = document.createElement('button');
    addButton.className = 'add-button';
    addButton.dataset.cy = 'add-to-cart';
    addButton.type = 'button';
    addButton.textContent = '+';
    addButton.setAttribute('aria-label', `Add ${product.name} to cart`);
    addButton.disabled = stock <= 0;
    addButton.addEventListener('click', () => addToCart(product.id));
    bottom.append(price, addButton);

    const stockLabel = document.createElement('div');
    stockLabel.className = 'stock-label';
    if (stock <= 0) {
        stockLabel.textContent = 'Currently unavailable';
        stockLabel.classList.add('out-of-stock');
    } else {
        stockLabel.textContent = 'Ready to add to your bag';
    }

    const detailsButton = document.createElement('button');
    detailsButton.className = 'details-button';
    detailsButton.type = 'button';
    detailsButton.textContent = 'View details';
    detailsButton.addEventListener('click', () => openProductDetails(product));

    info.append(category, name, description, bottom, stockLabel, detailsButton);
    card.appendChild(info);
    return card;
}

function renderProducts() {
    const filteredProducts = getFilteredProducts();
    const visibleProducts = filteredProducts.slice(0, visibleProductLimit);
    productGrid.replaceChildren();
    productTotal.textContent =
        `${filteredProducts.length} ${filteredProducts.length === 1 ? 'find' : 'finds'}`;
    updateActiveFilters(filteredProducts.length);

    if (!filteredProducts.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-results';
        const icon = document.createElement('span');
        icon.textContent = '⌕';
        const title = document.createElement('h3');
        title.textContent = 'No finds this time';
        const message = document.createElement('p');
        message.textContent = 'Try another search or clear your filters to see the full collection.';
        const clearButton = document.createElement('button');
        clearButton.className = 'primary-button';
        clearButton.type = 'button';
        clearButton.textContent = 'Show all products';
        clearButton.addEventListener('click', clearFilters);
        empty.append(icon, title, message, clearButton);
        productGrid.appendChild(empty);
        loadMoreButton.hidden = true;
        return;
    }

    visibleProducts.forEach(product => productGrid.appendChild(createProductCard(product)));
    loadMoreButton.hidden = visibleProducts.length >= filteredProducts.length;
}

function renderProductError() {
    productGrid.replaceChildren();
    const error = document.createElement('div');
    error.className = 'empty-results error-state';
    const title = document.createElement('h3');
    title.textContent = 'We could not load the collection';
    const message = document.createElement('p');
    message.textContent =
        'Please check that the product service is running, then try again.';
    const retryButton = document.createElement('button');
    retryButton.className = 'primary-button';
    retryButton.type = 'button';
    retryButton.textContent = 'Try again';
    retryButton.addEventListener('click', loadProducts);
    error.append(title, message, retryButton);
    productGrid.appendChild(error);
    productTotal.textContent = 'Collection unavailable';
    loadMoreButton.hidden = true;
}

async function loadProducts() {
    productGrid.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'loading-message';
    loading.textContent = 'Finding good things for you...';
    productGrid.appendChild(loading);
    productTotal.textContent = 'Loading products...';

    try {
        const response = await fetch('/api/products');
        if (!response.ok) throw new Error('Could not load products.');

        const result = await response.json();
        if (!Array.isArray(result)) {
            throw new Error('The product service returned invalid data.');
        }

        products = result.filter(product =>
            product &&
            product.id !== undefined &&
            typeof product.name === 'string' &&
            Number.isFinite(Number(product.price_centavos)) &&
            Number.isFinite(Number(product.stock))
        );
        renderProducts();
    } catch (error) {
        console.error('Product loading error:', error);
        renderProductError();
    }
}

function openProductDetails(product) {
    const content = document.getElementById('product-dialog-content');
    content.replaceChildren();
    content.appendChild(createProductImage(product, 'product-dialog-image'));

    const details = document.createElement('div');
    details.className = 'product-dialog-details';

    const category = document.createElement('span');
    category.className = 'product-category';
    category.textContent = getProductCategory(product);

    const name = document.createElement('h2');
    name.id = 'detail-name';
    name.textContent = product.name;

    const description = document.createElement('p');
    description.className = 'dialog-description';
    description.textContent = product.description || 'A useful everyday find from BUDOL.';

    const price = document.createElement('strong');
    price.className = 'dialog-price';
    price.textContent = peso(product.price_centavos);

    const stock = Number(product.stock);
    const availability = document.createElement('p');
    availability.className = stock > 0 ? 'dialog-stock' : 'dialog-stock out-of-stock';
    availability.textContent = stock > 0 ? 'In stock and ready to order' : 'Currently unavailable';

    const addButton = document.createElement('button');
    addButton.className = 'primary-button full-button';
    addButton.dataset.cy = 'add-to-cart';
    addButton.type = 'button';
    addButton.textContent = stock > 0 ? 'Add to cart' : 'Out of stock';
    addButton.disabled = stock <= 0;
    addButton.addEventListener('click', () => {
        addToCart(product.id);
        if (stock > 0) closePanel(productOverlay);
    });

    details.append(category, name, description, price, availability, addButton);
    content.appendChild(details);
    openPanel(productOverlay);
}

function addToCart(productId) {
    const product = products.find(item => Number(item.id) === Number(productId));

    if (!product || Number(product.stock) <= 0) {
        showToast('This product is currently unavailable.');
        return;
    }

    const currentQuantity = cart.get(product.id) || 0;
    if (currentQuantity >= Math.min(99, Number(product.stock))) {
        showToast('You have reached the available stock limit.');
        return;
    }

    cart.set(product.id, currentQuantity + 1);
    renderCart();
    showToast(`${product.name} added to your cart.`);
}

function changeQuantity(productId, amount) {
    const product = products.find(item => Number(item.id) === Number(productId));
    if (!product) return;

    const currentQuantity = cart.get(product.id) || 0;
    const newQuantity = currentQuantity + amount;

    if (newQuantity <= 0) {
        cart.delete(product.id);
    } else if (newQuantity <= Math.min(99, Number(product.stock))) {
        cart.set(product.id, newQuantity);
    } else {
        showToast('Not enough stock available.');
    }

    renderCart();
}

function getCartTotal() {
    return products.reduce((total, product) => {
        const quantity = cart.get(product.id) || 0;
        return total + Number(product.price_centavos) * quantity;
    }, 0);
}

function renderCart() {
    cartItemsContainer.replaceChildren();
    const totalQuantity = Array.from(cart.values())
        .reduce((total, quantity) => total + quantity, 0);

    cartCount.textContent = totalQuantity;
    mobileCartCount.textContent = totalQuantity;
    cartSubtotal.textContent = peso(getCartTotal());
    checkoutTotal.textContent = peso(getCartTotal());
    document.getElementById('checkout-button').disabled = cart.size === 0;

    if (cart.size === 0) {
        const empty = document.createElement('div');
        empty.className = 'cart-empty';
        const icon = document.createElement('span');
        icon.textContent = '♧';
        const message = document.createElement('p');
        message.textContent = 'Your cart is waiting for a good find.';
        empty.append(icon, message);
        cartItemsContainer.appendChild(empty);
        return;
    }

    cart.forEach((quantity, productId) => {
        const product = products.find(item => Number(item.id) === Number(productId));
        if (!product) return;

        const row = document.createElement('div');
        row.className = 'cart-item';
        row.appendChild(createProductImage(product, 'cart-item-art'));

        const details = document.createElement('div');
        details.className = 'cart-item-details';

        const name = document.createElement('h3');
        name.textContent = product.name;

        const price = document.createElement('div');
        price.className = 'cart-item-price';
        price.textContent = peso(product.price_centavos);

        const controls = document.createElement('div');
        controls.className = 'quantity-controls';

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.textContent = '−';
        minus.setAttribute('aria-label', `Remove one ${product.name}`);
        minus.addEventListener('click', () => changeQuantity(product.id, -1));

        const count = document.createElement('span');
        count.textContent = quantity;

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.textContent = '+';
        plus.setAttribute('aria-label', `Add one ${product.name}`);
        plus.disabled = quantity >= Math.min(99, Number(product.stock));
        plus.addEventListener('click', () => changeQuantity(product.id, 1));
        controls.append(minus, count, plus);
        details.append(name, price, controls);

        const remove = document.createElement('button');
        remove.className = 'remove-button';
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
            cart.delete(product.id);
            renderCart();
        });

        row.append(details, remove);
        cartItemsContainer.appendChild(row);
    });
}

function clearFilters() {
    selectedCategory = '';
    searchTerm = '';
    searchInput.value = '';
    visibleProductLimit = 12;
    document.querySelectorAll('[data-category]').forEach(button => {
        button.classList.remove('is-active');
        button.setAttribute('aria-pressed', 'false');
    });
    renderProducts();
}

function selectCategory(category) {
    selectedCategory = selectedCategory === category ? '' : category;
    visibleProductLimit = 12;

    document.querySelectorAll('[data-category]').forEach(button => {
        const isActive = button.dataset.category === selectedCategory;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });

    renderProducts();
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

async function checkAuthSession() {
    try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) return;

        const data = await response.json();
        if (!data.user || typeof data.user.full_name !== 'string') return;

        document.getElementById('auth-login-link').hidden = true;
        document.getElementById('auth-signup-link').hidden = true;

        const accountName = document.getElementById('account-name');
        accountName.textContent = `Hi, ${data.user.full_name}`;
        accountName.hidden = false;
        document.getElementById('logout-button').hidden = false;
    } catch (error) {
        console.error('Could not check account session:', error);
    }
}

cartButton.addEventListener('click', () => {
    renderCart();
    openPanel(cartOverlay);
});

document.getElementById('mobile-cart-button').addEventListener('click', () => {
    renderCart();
    openPanel(cartOverlay);
});

document.getElementById('footer-cart-link').addEventListener('click', () => {
    renderCart();
    openPanel(cartOverlay);
});

document.getElementById('close-cart').addEventListener('click', () => closePanel(cartOverlay));
document.getElementById('continue-shopping').addEventListener('click', () => closePanel(cartOverlay));
document.getElementById('close-checkout').addEventListener('click', () => closePanel(checkoutOverlay));
document.getElementById('close-product').addEventListener('click', () => closePanel(productOverlay));

document.getElementById('checkout-button').addEventListener('click', () => {
    if (cart.size === 0) return;

    closePanel(cartOverlay);
    checkoutMessage.textContent = '';
    checkoutTotal.textContent = peso(getCartTotal());
    openPanel(checkoutOverlay);
});

[cartOverlay, checkoutOverlay, productOverlay].forEach(overlay => {
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closePanel(overlay);
    });
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeDialog) closePanel(activeDialog);
});

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    searchTerm = searchInput.value.trim();
    selectedCategory = '';
    visibleProductLimit = 12;
    document.querySelectorAll('[data-category]').forEach(button => {
        button.classList.remove('is-active');
        button.setAttribute('aria-pressed', 'false');
    });
    renderProducts();
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
});

searchInput.addEventListener('search', () => {
    if (!searchInput.value) {
        searchTerm = '';
        visibleProductLimit = 12;
        renderProducts();
    }
});

sortSelect.addEventListener('change', () => {
    visibleProductLimit = 12;
    renderProducts();
});

loadMoreButton.addEventListener('click', () => {
    visibleProductLimit += 12;
    renderProducts();
});

document.getElementById('clear-filters').addEventListener('click', clearFilters);
document.getElementById('show-all-categories').addEventListener('click', clearFilters);

document.querySelectorAll('[data-category]').forEach(button => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectCategory(button.dataset.category));
});

document.querySelectorAll('[data-nav-category]').forEach(link => {
    link.addEventListener('click', () => {
        selectedCategory = link.dataset.navCategory;
        searchTerm = '';
        searchInput.value = '';
        visibleProductLimit = 12;
        document.querySelectorAll('[data-category]').forEach(button => {
            const isActive = button.dataset.category === selectedCategory;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
        renderProducts();
    });
});

document.getElementById('logout-button').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;

    try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Unable to log out.');
        }

        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
        showToast(error instanceof Error ? error.message : 'Unable to log out.');
        button.disabled = false;
    }
});

checkoutForm.addEventListener('submit', async event => {
    event.preventDefault();

    if (cart.size === 0) {
        checkoutMessage.textContent = 'Your cart is empty.';
        return;
    }

    const customerName = document.getElementById('customer-name').value.trim();
    const customerEmail = document.getElementById('customer-email').value.trim();

    if (!customerName || !customerEmail) {
        checkoutMessage.textContent = 'Please enter your name and email.';
        return;
    }

    const items = Array.from(cart.entries()).map(([productId, quantity]) => ({
        product_id: Number(productId),
        quantity
    }));

    placeOrderButton.disabled = true;
    placeOrderButton.textContent = 'Creating your order...';
    checkoutMessage.textContent = '';

    try {
        const orderResponse = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_name: customerName,
                customer_email: customerEmail,
                items
            })
        });
        const orderData = await orderResponse.json();

        if (!orderResponse.ok) {
            throw new Error(orderData.error || 'Unable to create your order.');
        }

        const order = orderData.order;
        if (!order || order.id === undefined) {
            throw new Error('The order service returned an invalid order.');
        }

        const checkoutResponse = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: order.id })
        });
        const checkoutData = await checkoutResponse.json();

        if (!checkoutResponse.ok) {
            throw new Error(checkoutData.error || 'Unable to start payment checkout.');
        }

        const checkoutUrl = new URL(checkoutData.checkout_url);
        if (
            checkoutUrl.protocol !== 'https:' ||
            checkoutUrl.hostname !== 'checkout.paymongo.com'
        ) {
            throw new Error('The checkout URL could not be verified.');
        }

        window.location.assign(checkoutUrl.href);
    } catch (error) {
        console.error('Checkout error:', error);
        checkoutMessage.textContent =
            error instanceof Error ? error.message : 'Unable to start checkout.';
        placeOrderButton.disabled = false;
        placeOrderButton.innerHTML = 'Try checkout again <span aria-hidden="true">→</span>';
    }
});

renderCart();
loadProducts();
checkAuthSession();
