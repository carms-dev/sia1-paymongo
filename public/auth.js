import { getCurrentUser, login, registerBuyer, registerSeller } from "/js/api.js";

const form = document.querySelector("[data-auth-form]");
const message = document.getElementById("auth-message");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function roleDestination(user) {
    const destinations = {
        admin: "/admin/dashboard.html",
        seller: "/seller/dashboard.html",
        buyer: "/index.html"
    };
    const fallback = destinations[user?.role] || "/index.html";
    const requestedPath = new URLSearchParams(window.location.search).get("next");
    if (!requestedPath || !requestedPath.startsWith("/") || requestedPath.startsWith("//")) {
        return fallback;
    }

    const requestedUrl = new URL(requestedPath, window.location.origin);
    if (requestedUrl.origin !== window.location.origin) return fallback;
    if (user.role === "admin" && !requestedUrl.pathname.startsWith("/admin/")) return fallback;
    if (user.role === "seller" && !requestedUrl.pathname.startsWith("/seller/")) return fallback;
    if (
        user.role === "buyer" &&
        (requestedUrl.pathname.startsWith("/admin/") || requestedUrl.pathname.startsWith("/seller/"))
    ) {
        return fallback;
    }
    return `${requestedUrl.pathname}${requestedUrl.search}${requestedUrl.hash}`;
}

function setFieldError(input, errorElement, text) {
    if (!input || !errorElement) return;
    input.setAttribute("aria-invalid", text ? "true" : "false");
    errorElement.textContent = text;
}

function setMessage(text, success = false) {
    message.textContent = text;
    message.classList.toggle("success", success);
}

function validateEmail() {
    const input = form.elements.email;
    const errorElement = document.getElementById("email-error");
    const email = input.value.trim();
    const error = !email
        ? "Enter your email address."
        : !emailPattern.test(email) || email.length > 255
            ? "Enter a valid email address."
            : "";
    setFieldError(input, errorElement, error);
    return !error;
}

function validatePasswordMatch() {
    const password = form.elements.password;
    const confirmation = form.elements.confirm_password;
    const errorElement = document.getElementById("confirm-password-error");
    if (!confirmation || !errorElement) return true;
    const error = confirmation.value && confirmation.value !== password.value
        ? "Your passwords do not match."
        : "";
    setFieldError(confirmation, errorElement, error);
    return !error;
}

function displayServerError(error) {
    const text = error instanceof Error ? error.message : "Unable to complete your request. Please try again.";
    if (error?.status === 409) {
        const lower = text.toLowerCase();
        if (lower.includes("shop name") || lower.includes("shopname")) {
            const shopName = form.elements.shop_name;
            setFieldError(shopName, document.getElementById("shop-name-error"), text);
            shopName?.focus();
            return;
        }
        if (lower.includes("email") || lower.includes("account")) {
            setFieldError(form.elements.email, document.getElementById("email-error"), text);
            form.elements.email.focus();
            return;
        }
    }
    setMessage(text);
}

async function submitForm(event) {
    event.preventDefault();
    setMessage("");
    const emailValid = validateEmail();
    const passwordsMatch = validatePasswordMatch();
    if (!emailValid) {
        form.elements.email.focus();
        return;
    }
    if (!passwordsMatch) {
        form.elements.confirm_password.focus();
        return;
    }
    if (!form.reportValidity()) return;

    const submitButton = form.querySelector('[type="submit"]');
    const idleText = submitButton.dataset.idleLabel || submitButton.textContent.trim();
    const formData = new FormData(form);
    const values = Object.fromEntries(formData.entries());
    const isSeller = form.dataset.authForm === "seller-signup";
    const isLogin = form.dataset.authForm === "login";

    if (isSeller && values.shop_name.trim().length < 3) {
        setFieldError(
            form.elements.shop_name,
            document.getElementById("shop-name-error"),
            "Shop name must be at least 3 characters."
        );
        form.elements.shop_name.focus();
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Please wait...";
    try {
        let response;
        if (isLogin) {
            response = await login({
                email: values.email.trim(),
                password: values.password
            });
        } else if (isSeller) {
            response = await registerSeller({
                full_name: values.full_name.trim(),
                email: values.email.trim(),
                password: values.password,
                shop_name: values.shop_name.trim(),
                shop_description: values.shop_description.trim()
            });
        } else {
            response = await registerBuyer({
                full_name: values.full_name.trim(),
                email: values.email.trim(),
                password: values.password
            });
        }

        if (!response?.user || typeof response.user.role !== "string") {
            throw new Error("The server returned an invalid account response.");
        }
        if (isSeller) {
            setMessage("Your shop is waiting for admin approval. Taking you to Seller Center...", true);
            window.setTimeout(() => window.location.assign("/seller/dashboard.html"), 1400);
        } else {
            setMessage(isLogin ? "You are signed in. Redirecting..." : "Your account is ready. Redirecting...", true);
            window.location.assign(roleDestination(response.user));
        }
    } catch (error) {
        displayServerError(error);
        submitButton.disabled = false;
        submitButton.textContent = idleText;
    }
}

document.querySelectorAll("[data-toggle-password]").forEach(button => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.togglePassword);
        const showPassword = input.type === "password";
        input.type = showPassword ? "text" : "password";
        button.textContent = showPassword ? "Hide" : "Show";
        button.setAttribute("aria-label", `${showPassword ? "Hide" : "Show"} password`);
    });
});

if (form) {
    form.querySelector('[type="submit"]').dataset.idleLabel =
        form.querySelector('[type="submit"]').textContent.trim();
    form.elements.email.addEventListener("blur", validateEmail);
    form.elements.email.addEventListener("input", () => {
        if (form.elements.email.getAttribute("aria-invalid") === "true") validateEmail();
    });
    form.elements.confirm_password?.addEventListener("input", validatePasswordMatch);
    form.elements.shop_name?.addEventListener("input", () => {
        setFieldError(form.elements.shop_name, document.getElementById("shop-name-error"), "");
    });
    form.addEventListener("submit", submitForm);

    getCurrentUser().then(response => {
        if (response.user) window.location.replace(roleDestination(response.user));
    }).catch(error => {
        if (error.status !== 401 && error.status !== 403) {
            setMessage(error.message);
        }
    });
}
