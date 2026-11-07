# Cypress E2E Test Plan

| ID | Spec file | Test name | Owner / author |
|---|---|---|---|
| E2E-01 | `cypress/e2e/catalog.cy.js` | Lists seeded products with peso prices converted from centavos | Product service owner — enter group member name |
| E2E-02 | `cypress/e2e/orders.cy.js` | Creates a pending order with the correct server-calculated total | Order service owner — enter group member name |
| E2E-03 | `cypress/e2e/checkout.cy.js` | Receives a successful checkout session URL from the Payment Service | Payment service owner — enter group member name |
| E2E-04 | `cypress/e2e/checkout.cy.js` | Hands the browser over to the hosted PayMongo checkout | Payment service owner — enter group member name |
| E2E-05 | `cypress/e2e/orders.cy.js` | Confirms payment on the success page from the signed server webhook | Order service owner — enter group member name |
| E2E-06 | `cypress/e2e/orders.cy.js` | Keeps a cancelled checkout order unpaid | Order service owner — enter group member name |
| E2E-07 | `cypress/e2e/checkout.cy.js` | Displays a checkout error and leaves the order pending when payment fails | Payment service owner — enter group member name |
| E2E-08 | `cypress/e2e/security.cy.js` | Never exposes a PayMongo secret or calls the PayMongo API from the browser | Product service owner — enter group member name |
| E2E-09 | `cypress/e2e/catalog.cy.js` | Blocks checkout with an empty cart and creates no order or session | Product service owner — enter group member name |

The success-page test delivers a correctly signed test webhook to the Payment Service; it does not claim that a real customer completed a PayMongo payment. The checkout hand-off tests use PayMongo test mode and stop at its hosted page.
