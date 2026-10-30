export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

export function formatPeso(centavos) {
    const amount = Number(centavos);
    if (!Number.isFinite(amount)) throw new TypeError("Amount must be a finite number of centavos.");
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(amount / 100);
}

export function formatDate(value, options = {}) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError("Date value is invalid.");
    return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        ...options
    }).format(date);
}

export function showToast(message, { kind = "info", duration = 3000 } = {}) {
    let toast = document.getElementById("site-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "site-toast";
        toast.className = "toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
    }
    toast.textContent = String(message);
    toast.dataset.kind = kind;
    toast.hidden = false;
    window.clearTimeout(showToast.timeoutId);
    if (duration > 0) {
        showToast.timeoutId = window.setTimeout(() => {
            toast.hidden = true;
        }, duration);
    }
    return toast;
}

export function renderSkeleton(count = 5, { type = "product" } = {}) {
    const fragment = document.createDocumentFragment();
    const safeCount = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
    for (let index = 0; index < safeCount; index += 1) {
        const card = document.createElement("div");
        card.className = type === "product" ? "skeleton-card" : "card";
        card.setAttribute("aria-hidden", "true");
        if (type === "product") {
            const image = document.createElement("div");
            image.className = "skeleton skeleton-image";
            const line = document.createElement("div");
            line.className = "skeleton skeleton-line";
            const shortLine = document.createElement("div");
            shortLine.className = "skeleton skeleton-line skeleton-line-short";
            card.append(image, line, shortLine);
        } else {
            const line = document.createElement("div");
            line.className = "skeleton skeleton-line";
            card.appendChild(line);
        }
        fragment.appendChild(card);
    }
    return fragment;
}

export function renderEmpty(title, message, actionLabel, actionHandler) {
    const panel = document.createElement("section");
    panel.className = "state-panel";
    panel.setAttribute("aria-live", "polite");

    const heading = document.createElement("h2");
    heading.textContent = title;
    const description = document.createElement("p");
    description.textContent = message;
    panel.append(heading, description);
    if (actionLabel && typeof actionHandler === "function") {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "button button-primary";
        action.textContent = actionLabel;
        action.addEventListener("click", actionHandler);
        panel.appendChild(action);
    }
    return panel;
}

export function renderError(retryFn, message = "We couldn’t load this right now. Please try again.") {
    if (typeof retryFn !== "function") throw new TypeError("An error state requires a retry function.");
    const panel = document.createElement("section");
    panel.className = "state-panel state-panel-error";
    panel.setAttribute("role", "alert");
    const heading = document.createElement("h2");
    heading.textContent = "Something went wrong";
    const description = document.createElement("p");
    description.textContent = message;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button button-secondary";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => retryFn());
    panel.append(heading, description, retry);
    return panel;
}

export function debounce(callback, delay = 250) {
    if (typeof callback !== "function") throw new TypeError("Debounce requires a function.");
    let timeoutId;
    return function debounced(...args) {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => callback.apply(this, args), delay);
    };
}
