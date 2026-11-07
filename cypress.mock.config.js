const express = require("express");
const path = require("path");

let staticServer;

module.exports = {
    e2e: {
        specPattern: "cypress/mock-e2e/**/*.cy.js",
        supportFile: false,
        video: false,
        setupNodeEvents(on, config) {
            const app = express();
            app.use(express.static(path.join(__dirname, "public")));
            return new Promise((resolve, reject) => {
                staticServer = app.listen(0, "127.0.0.1", () => {
                    config.baseUrl = `http://127.0.0.1:${staticServer.address().port}`;
                    staticServer.unref();
                    resolve(config);
                });
                staticServer.once("error", reject);
                on("after:run", () => new Promise(close => {
                    staticServer.closeAllConnections();
                    staticServer.close(close);
                }));
            });
        }
    }
};
