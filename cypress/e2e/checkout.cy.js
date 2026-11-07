import {
    fillDeliveryForm,
    loginBuyer,
    openCheckout,
    placeOrder,
    testProducts
} from "../support/checkout-flow.js";

const realCheckout = req => req.continue();

describe("PayMongo checkout boundary", () => {
    beforeEach(() => loginBuyer());

    it("E2E-03: receives a successful checkout session URL from the Payment Service", () => {
        cy.intercept("POST", "/api/checkout").as("checkout");
        openCheckout([testProducts.mouse]);
        fillDeliveryForm();
        cy.get("[data-cy=place-order]").click();

        cy.wait("@checkout").then(({ response }) => {
            expect(response.statusCode).to.eq(201);
            expect(response.body.checkout_url).to.match(
                /^https:\/\/checkout\.paymongo\.com\//
            );
        });
    });

    it("E2E-04: sends the browser to the hosted PayMongo checkout", () => {
        cy.intercept("GET", "https://checkout.paymongo.com/**", req => {
            req.destroy();
        }).as("hostedCheckout");
        cy.intercept("POST", "/api/checkout", realCheckout).as("checkout");
        openCheckout([testProducts.lamp]);
        fillDeliveryForm();
        cy.get("[data-cy=place-order]").click();

        cy.wait("@checkout").then(({ response }) => {
            expect(response.statusCode).to.eq(201);
            expect(response.body.checkout_url).to.match(
                /^https:\/\/checkout\.paymongo\.com\//
            );
        });
        cy.wait("@hostedCheckout").then(({ request }) => {
            expect(request.url).to.match(
                /^https:\/\/checkout\.paymongo\.com\//
            );
        });
    });

    it("E2E-07: displays a checkout error and leaves the order pending when payment fails", () => {
        placeOrder([testProducts.mouse], req => {
            req.reply({
                statusCode: 500,
                body: { error: "Payment unavailable" }
            });
        }).then(({ orderId, checkoutResponse }) => {
            expect(checkoutResponse.statusCode).to.eq(500);
            cy.location("pathname").should("eq", "/checkout.html");
            cy.get("[data-cy=checkout-error]")
                .should("be.visible")
                .and("contain.text", "Payment unavailable");
            cy.request(`/api/orders/${orderId}`).its("body.order.status").should("eq", "pending");
        });
    });
});
