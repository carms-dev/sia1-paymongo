export const testProducts = {
    mouse: "E2E Cypress Mouse",
    lamp: "E2E Cypress Desk Lamp",
    tote: "E2E Cypress Tote Bag"
};

export function loginBuyer() {
    cy.session("seeded-cypress-buyer", () => {
        cy.visit("/login.html");
        cy.get("[data-cy=login-email]").type("e2e-buyer@example.test");
        cy.get("[data-cy=login-password]").type("BudolE2EPass123!");
        cy.get("[data-cy=login-submit]").click();
        cy.location("pathname", { timeout: 20000 }).should("eq", "/index.html");
    }, { cacheAcrossSpecs: true });

    cy.visit("/index.html");
    cy.location("pathname").should("eq", "/index.html");
}

export function openCheckout(productNames) {
    productNames.forEach(productName => {
        cy.visit(`/products.html?q=${encodeURIComponent("E2E Cypress")}`);
        cy.contains("[data-cy=product-card]", productName)
            .find("[data-cy=add-to-cart]")
            .click();
    });
    cy.visit("/cart.html");
    cy.get("[data-cy=cart-checkout]").should("be.enabled").click();
    cy.location("pathname").should("eq", "/checkout.html");
}

export function fillDeliveryForm() {
    cy.get("[data-cy=delivery-phone]").type("09171234567");
    cy.get("[data-cy=delivery-region]").type("NCR");
    cy.get("[data-cy=delivery-province]").type("Metro Manila");
    cy.get("[data-cy=delivery-city]").type("Manila");
    cy.get("[data-cy=delivery-barangay]").type("Barangay 1");
    cy.get("[data-cy=delivery-address-line]").type("123 Test Street");
    cy.get("[data-cy=delivery-postal-code]").type("1000");
}

export function placeOrder(productNames, checkoutHandler) {
    openCheckout(productNames);
    fillDeliveryForm();
    cy.intercept("POST", "/api/orders").as("createOrder");
    cy.intercept("POST", "/api/checkout", checkoutHandler).as("checkout");
    cy.get("[data-cy=place-order]").click();

    return cy.wait("@createOrder").then(({ response }) => {
        expect(response.statusCode).to.eq(201);
        const orderId = response.body.order?.id;
        expect(orderId).to.exist;
        cy.wrap(orderId).as("createdOrderId");
        return cy.wait("@checkout").then(({ response: checkoutResponse }) => ({
            orderId,
            checkoutResponse
        }));
    });
}

export function localSuccessCheckout(req) {
    req.reply({
        statusCode: 200,
        body: {
            checkout_url: `${Cypress.config("baseUrl")}/success.html?order_id=${encodeURIComponent(req.body.order_id)}`
        }
    });
}

export function expectOrderFromService(orderId, { status, total }) {
    return cy.request(`/api/orders/${orderId}`).then(({ body }) => {
        expect(body.order.status).to.eq(status);
        if (total !== undefined) expect(Number(body.order.total_centavos)).to.eq(total);
        return body;
    });
}
