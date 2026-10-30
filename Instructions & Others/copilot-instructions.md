# BUDOL marketplace frontend: project context

BUDOL is a Philippine multi-vendor marketplace (Shopee-style features, original branding). Three account roles: BUYER (browses products, views each shop's products, cart, checkout, orders), SELLER (posts products to their own shop, manages shop orders, views buyers' online payments), ADMIN (controls all accounts, approves shops, sees activity history of all users and sellers).

## Tech rules
- Frontend lives in /public and is served by Express (server.js). Plain HTML, CSS and JavaScript only (ES modules are fine). No React, no build step, no npm frontend packages. Inter font from Google Fonts.
- One HTML file per page. Shared header/footer are injected by /public/js/layout.js into <div id="site-header"></div> and <div id="site-footer"></div>, so there is no copy-pasted markup.
- READ the existing files first (public/app.js, auth.js, style.css, index.html, login.html, signup.html, success.html, cancel.html) and keep what works. Extend them; do not create duplicates.
- Never use innerHTML with data from the API (sellers type product names and descriptions). Use textContent, or a shared escapeHtml() helper. This prevents XSS.
- Money: the API returns centavos in price_centavos fields. Display with Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100).
- Cookies: login uses an HttpOnly cookie, so every fetch uses credentials: 'same-origin'. Never store tokens in localStorage.
- Cart is stored in localStorage (product_id, quantity, plus name, price_centavos, image_url, shop_id, shop_name for display only). Prices are always re-checked by the server at order time.
- Payments: ONLY PayMongo hosted checkout (redirect to the checkout_url). Never create card or e-wallet number fields. Never show a payment as successful because of the browser redirect alone: success.html must poll the order until the server says status is "paid".
- Do not build features the backend does not support (no chat, coins, live streams, vouchers, reviews). Do not use Shopee's logo, colors or artwork. No fake countdown timers.
- Add data-cy attributes (for Cypress) on key elements: login form fields and submit, add-to-cart button, cart checkout button, place-order button, seller product form submit, admin ban/approve buttons.

## Design system (CSS variables in /public/css/variables.css)
--orange #F36B3F, --orange-dark #D9532B, --navy #172B4D, --bg #F5F6F8, --white #FFFFFF, --text #222B38, --text-2 #77808F, --border #E5E8ED, --success #16A36A, --error #DC3545, --discount #E84C3D, --promo #FFD166.
8px spacing scale, 4px card radius, 8px button radius, 1px borders, very light shadows. Content width 1200px centered. Dense marketplace layout, white cards on the gray background, 5 product cards per row on desktop (4 at <1200px, 3 on tablet, 2 on mobile). Product title: 2-line clamp. Price: bold orange. Original price: gray strikethrough. Discount badge: --discount.
Buttons: primary orange, secondary navy outline, ghost. Status badges with text (not color only): pending (yellow), paid/approved/active (green), failed/rejected/banned (red), shipped (blue).
Seller and admin pages use a left-sidebar dashboard layout (navy sidebar, white content cards, compact tables), not the storefront layout.

## File layout
public/
  index.html (home feed), products.html (search/category results), product.html, shop.html,
  cart.html, checkout.html, login.html, signup.html (buyer), seller-signup.html,
  success.html, cancel.html, account.html, orders.html, order-details.html, 404.html
  seller/  dashboard.html, products.html, product-form.html, orders.html, payments.html, shop-profile.html, activity.html
  admin/   dashboard.html, users.html, user-details.html, shops.html, orders.html, payments.html, activity-log.html
  css/  variables.css, base.css, components.css, buyer.css, dashboard.css, auth.css
  js/   api.js, ui.js, layout.js, auth-guard.js, cart.js, mock-data.js, plus one small script per page

## Backend API (already built in server.js; all errors look like { "error": "message" })
AUTH
- POST /api/auth/register {full_name,email,password} -> 201 {user}
- POST /api/auth/register-seller {full_name,email,password,shop_name,shop_description} -> 201 {user}
- POST /api/auth/login {email,password} -> {user}   (429 after too many tries, 403 if banned)
- GET /api/auth/me -> {user} or 401.   POST /api/auth/logout
- user = { id, full_name, email, role: "buyer"|"seller"|"admin", shop: null | {id, name, status: "pending"|"approved"|"rejected"|"suspended"} }
PUBLIC
- GET /api/products (query string passes through: q, category, shop_id, page...), GET /api/products/:id
- GET /api/shops -> {shops:[{id,shop_name,description,logo_url}]}, GET /api/shops/:id -> {shop}, GET /api/shops/:id/products
BUYER (must be logged in as buyer)
- POST /api/orders (do NOT send user_id; the server adds it), GET /api/my/orders, GET /api/orders/:id -> {order, items}
- POST /api/checkout {order_id} -> {checkout_url}  then window.location.href = checkout_url
SELLER (role seller; product/order/payment routes also need shop.status === "approved")
- GET/PUT /api/seller/shop; GET/POST /api/seller/products; PUT/DELETE /api/seller/products/:id
- GET /api/seller/orders; PATCH /api/seller/orders/:id/status {status}
- GET /api/seller/payments (show order number, buyer, amount, payment status only); GET /api/seller/activity
ADMIN (role admin)
- GET /api/admin/stats -> {total_users,buyers,sellers,admins,banned,pending_shops,approved_shops,actions_today}
- GET /api/admin/users?role=&status=&q=&page=&limit= -> {users,total,page,limit}; GET /api/admin/users/:id; PATCH /api/admin/users/:id/status {status:"active"|"banned"}
- GET /api/admin/shops?status= -> {shops,total,page,limit}; PATCH /api/admin/shops/:id/status {status}
- GET /api/admin/activity?role=&user_id=&action=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&limit= -> {logs,total,page,limit}; GET /api/admin/users/:id/activity
- GET /api/admin/products, /api/admin/orders, /api/admin/payments

## Redirect after login by role
admin -> /admin/dashboard.html, seller -> /seller/dashboard.html, buyer -> /index.html (or back to the page they came from).

## Every list or data page needs: a loading skeleton, an empty state with a next action, and a friendly error state with Retry.
Desktop first, fully usable at 360px width. Accessible: labels on inputs, visible focus, 4.5:1 text contrast, buttons are real <button> elements.