import {
    localSuccessCheckout,
    loginBuyer,
    placeOrder,
    testProducts
} from "../support/checkout-flow.js";

const secretPattern = /sk_(?:test|live)_/;

describe("browser payment security", () => {
    it("E2E-08: never exposes a PayMongo secret or calls the PayMongo API from the browser", () => {
        cy.intercept({ method: "GET", url: "**/*.html" }, request => {
            request.continue(response => {
                expect(response.body).not.to.match(secretPattern);
            });
        });
        cy.intercept({ method: "GET", url: "**/*.js" }, request => {
            request.continue(response => {
                expect(response.body).not.to.match(secretPattern);
            });
        });
        cy.intercept("https://api.paymongo.com/**").as("browserPayMongoAPI");

        loginBuyer();
        placeOrder([testProducts.tote], localSuccessCheckout).then(({ orderId }) => {
            cy.location("pathname").should("eq", "/success.html");
            cy.get("[data-cy=order-status]").should("contain.text", "payment is being confirmed");
            cy.get("@browserPayMongoAPI.all").should("have.length", 0);
            cy.request(`/api/orders/${orderId}`).its("body.order.status").should("eq", "pending");
        });
    });
});
