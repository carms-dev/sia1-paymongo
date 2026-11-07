const pages = [
    ["/index.html", "buyer"],
    ["/products.html", "buyer"],
    ["/product.html?id=101", "buyer"],
    ["/shop.html?id=1", "buyer"],
    ["/cart.html", "buyer"],
    ["/checkout.html", "buyer"],
    ["/success.html?order_id=501", "buyer"],
    ["/cancel.html?order_id=501", "buyer"],
    ["/account.html", "buyer"],
    ["/orders.html", "buyer"],
    ["/order-details.html?id=501", "buyer"],
    ["/login.html", "guest"],
    ["/signup.html", "guest"],
    ["/seller-signup.html", "guest"],
    ["/seller/dashboard.html", "seller"],
    ["/seller/products.html", "seller"],
    ["/seller/product-form.html", "seller"],
    ["/seller/orders.html", "seller"],
    ["/seller/payments.html", "seller"],
    ["/seller/shop-profile.html", "seller"],
    ["/seller/activity.html", "seller"],
    ["/admin/dashboard.html", "admin"],
    ["/admin/users.html", "admin"],
    ["/admin/user-details.html?id=900", "admin"],
    ["/admin/shops.html", "admin"],
    ["/admin/orders.html", "admin"],
    ["/admin/payments.html", "admin"],
    ["/admin/activity-log.html", "admin"],
    ["/404.html", "buyer"],
    ["/_test.html", "buyer"]
];

describe("responsive page widths", () => {
    [360, 768, 1280].forEach(width => {
        it(`keeps every public page within ${width}px`, () => {
            cy.viewport(width, 900);
            pages.forEach(([path, role]) => {
                const separator = path.includes("?") ? "&" : "?";
                cy.visit(`${path}${separator}mock=1&role=${role}`);
                cy.document().then(document => {
                    expect(
                        document.documentElement.scrollWidth,
                        `${path} at ${width}px`
                    ).to.be.at.most(width);
                });
            });
        });
    });

    it("opens and closes the mobile product filter sheet", () => {
        cy.viewport(360, 800);
        cy.visit("/products.html?mock=1&role=buyer");
        cy.get("#filter-toggle").click();
        cy.get("#filter-panel").should("be.visible");
        cy.get("#filter-backdrop").should("be.visible").click("topLeft");
        cy.get("#filter-panel").should("not.be.visible");
        cy.get("#filter-toggle").should("have.attr", "aria-expanded", "false");
    });
});
