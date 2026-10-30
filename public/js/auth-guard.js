import { getCurrentUser as fetchCurrentUser } from "./api.js";

const roleHome = {
    admin: "/admin/dashboard.html",
    seller: "/seller/dashboard.html",
    buyer: "/index.html"
};

export async function getCurrentUser() {
    const response = await fetchCurrentUser();
    return response.user;
}

export async function requireRole(...roles) {
    if (roles.length === 0) throw new TypeError("requireRole needs at least one role.");
    let user;
    try {
        user = await getCurrentUser();
    } catch (error) {
        if (error.status === 401) {
            const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            window.location.assign(`/login.html?next=${encodeURIComponent(next)}`);
            return null;
        }
        throw error;
    }

    if (!roles.includes(user.role)) {
        window.location.assign(roleHome[user.role] || "/index.html");
        return null;
    }
    return user;
}
