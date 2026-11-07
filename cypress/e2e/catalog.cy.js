import { loginBuyer, testProducts } from "../support/checkout-flow.js";

describe("BUDOL catalog and invalid checkout", () => {
    it("E2E-01: lists seeded products with peso prices converted from centavos", () => {
        cy.intercept("GET", "/api/products").as("catalog");
        cy.visit(`/products.html?q=${encodeURIComponent("E2E Cypress")}`);
        cy.wait("@catalog").its("response.statusCode").should("eq", 200);

        const expected = [
            [testProducts.mouse, "₱350.00"],
            [testProducts.lamp, "₱520.00"],
            [testProducts.tote, "₱270.00"]
        ];
        expected.forEach(([name, price]) => {
            cy.contains("[data-cy=product-card]", name)
                .find("[data-cy=product-price]")
                .should("have.text", price);
        });
    });

    it("E2E-09: blocks checkout with an empty cart and creates no order or session", () => {
        loginBuyer();
        cy.intercept("POST", "/api/orders").as("createOrder");
        cy.intercept("POST", "/api/checkout").as("checkout");

        cy.visit("/cart.html");
        cy.get("[data-cy=cart-empty-state]").should("contain.text", "Your cart is empty");
        cy.visit("/checkout.html");
        cy.contains("#checkout-content", "No items selected").should("be.visible");
        cy.get("[data-cy=place-order]").should("not.exist");
        cy.get("@createOrder.all").should("have.length", 0);
        cy.get("@checkout.all").should("have.length", 0);
    });
});
