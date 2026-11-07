import {
    expectOrderFromService,
    loginBuyer,
    localSuccessCheckout,
    placeOrder,
    testProducts
} from "../support/checkout-flow.js";

describe("BUDOL orders and return pages", () => {
    beforeEach(() => loginBuyer());

    it("E2E-02: creates a pending order with the correct server-calculated total", () => {
        placeOrder([testProducts.mouse, testProducts.lamp], localSuccessCheckout).then(({ orderId, checkoutResponse }) => {
            expect(checkoutResponse.statusCode).to.eq(200);
            expect(checkoutResponse.body.checkout_url).to.include(`/success.html?order_id=${orderId}`);
            cy.location("pathname").should("eq", "/success.html");
            cy.get("[data-cy=order-status]").should("contain.text", "payment is being confirmed");
            expectOrderFromService(orderId, { status: "pending", total: 87000 })
                .then(({ items }) => expect(items).to.have.length(2));
        });
    });

    it("E2E-05: confirms payment on the success page from the signed server webhook", () => {
        placeOrder([testProducts.mouse], localSuccessCheckout).then(({ orderId }) => {
            cy.task("simulatePaidWebhook", orderId).its("status").should("eq", 200);
            cy.visit(`/success.html?order_id=${orderId}`);
            cy.get("[data-cy=order-status]").should("contain.text", "Payment confirmed");
            cy.contains("Order Placed Successfully!").should("be.visible");
            expectOrderFromService(orderId, { status: "paid", total: 35000 });
        });
    });

    it("E2E-06: keeps a cancelled checkout order unpaid", () => {
        placeOrder([testProducts.tote], localSuccessCheckout).then(({ orderId }) => {
            cy.visit(`/cancel.html?order_id=${orderId}`);
            cy.get("[data-cy=order-status]").should("contain.text", "was not completed");
            cy.get("#retry-checkout").should("be.visible");
            expectOrderFromService(orderId, { status: "pending", total: 27000 });
        });
    });
});
