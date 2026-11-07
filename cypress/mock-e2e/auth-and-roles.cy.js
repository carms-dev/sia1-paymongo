describe("BUDOL account and role flows", () => {
    beforeEach(() => {
        cy.visit("/?mock=1&role=guest");
        cy.window().then(window => window.sessionStorage.clear());
    });

    it("allows a buyer to sign up", () => {
        cy.visit("/signup.html?mock=1&role=guest");
        cy.get("[data-cy=signup-name]").type("Cypress Buyer");
        cy.get("[data-cy=signup-email]").type("cypress-buyer@example.com");
        cy.get("[data-cy=signup-password]").type("StrongTestPass123");
        cy.get("[data-cy=signup-confirm-password]").type("StrongTestPass123");
        cy.get("[data-cy=signup-terms]").check();
        cy.get("[data-cy=signup-submit]").click();
        cy.location("pathname").should("eq", "/index.html");
    });

    it("allows a buyer to log in", () => {
        cy.visit("/login.html?mock=1&role=guest&login_role=buyer");
        cy.get("[data-cy=login-email]").type("buyer@example.com");
        cy.get("[data-cy=login-password]").type("StrongTestPass123");
        cy.get("[data-cy=login-submit]").click();
        cy.location("pathname").should("eq", "/index.html");
    });

    it("adds a product to the cart", () => {
        cy.visit("/product.html?id=101&mock=1&role=buyer");
        cy.get("[data-cy=add-to-cart]").should("be.enabled").click();
        cy.get("#site-cart-count").should("have.text", "1");
        cy.get('[role=status]').should("contain.text", "added to cart");
    });

    it("shows the pending approval banner after seller signup", () => {
        cy.visit("/seller-signup.html?mock=1&role=guest");
        cy.get("[data-cy=seller-name]").type("Cypress Seller");
        cy.get("[data-cy=seller-email]").type("cypress-seller@example.com");
        cy.get("[data-cy=seller-shop-name]").type("Cypress Finds");
        cy.get("[data-cy=seller-password]").type("StrongTestPass123");
        cy.get("[data-cy=seller-confirm-password]").type("StrongTestPass123");
        cy.get("[data-cy=seller-terms]").check();
        cy.get("[data-cy=seller-signup-submit]").click();
        cy.location("pathname", { timeout: 6000 }).should("eq", "/seller/dashboard.html");
        cy.get("#shop-status-banner").should("contain.text", "Waiting for admin approval");
    });

    it("shows seller activity and payment fixtures in mock mode", () => {
        cy.visit("/seller/activity.html?mock=1&role=seller");
        cy.contains("seller_register").should("be.visible");

        cy.visit("/seller/payments.html?mock=1&role=seller");
        cy.contains("ORD-MOCK-0501").should("be.visible");
    });

    it("shows the admin dashboard after admin login", () => {
        cy.visit("/login.html?mock=1&role=guest&login_role=admin");
        cy.get("[data-cy=login-email]").type("admin@example.com");
        cy.get("[data-cy=login-password]").type("StrongTestPass123");
        cy.get("[data-cy=login-submit]").click();
        cy.location("pathname").should("eq", "/admin/dashboard.html");
        cy.contains("Administration overview").should("be.visible");
    });

    it("redirects a buyer away from the admin dashboard", () => {
        cy.visit("/admin/dashboard.html?mock=1&role=buyer");
        cy.location("pathname").should("eq", "/index.html");
    });
});
