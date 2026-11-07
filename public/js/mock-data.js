export const mockData = {
    shops: [
        { id: 1, shop_name: "MNL Everyday", description: "Useful things for daily life.", logo_url: "", status: "approved", user_id: 902, full_name: "Maria Santos", email: "maria@example.com", created_at: "2026-10-25T09:00:00+08:00" },
        { id: 2, shop_name: "Little Home Co.", description: "Simple comforts for your home.", logo_url: "", status: "approved", user_id: 902, full_name: "Maria Santos", email: "maria@example.com", created_at: "2026-10-25T09:00:00+08:00" },
        { id: 3, shop_name: "Study Corner", description: "School and desk essentials.", logo_url: "", status: "approved", user_id: 902, full_name: "Maria Santos", email: "maria@example.com", created_at: "2026-10-20T09:00:00+08:00" },
        { id: 4, shop_name: "Cypress Finds", description: "A sample shop awaiting admin review.", logo_url: "", status: "pending", user_id: 903, full_name: "Alex Reyes", email: "alex@example.com", created_at: "2026-11-06T09:00:00+08:00" }
    ],
    products: [
        { id: 101, name: "Wireless Bluetooth Earbuds", description: "Compact everyday audio with a charging case.", price_centavos: 89900, stock: 18, image_url: "", shop_id: 1, shop_name: "MNL Everyday", category: "Electronics" },
        { id: 102, name: "Foldable Phone Stand", description: "A lightweight adjustable stand for your desk.", price_centavos: 18900, stock: 42, image_url: "", shop_id: 1, shop_name: "MNL Everyday", category: "Electronics" },
        { id: 103, name: "USB-C Charging Cable", description: "Braided 1.5m cable for compatible devices.", price_centavos: 14900, stock: 55, image_url: "", shop_id: 1, shop_name: "MNL Everyday", category: "Electronics" },
        { id: 104, name: "Canvas Everyday Tote", description: "A roomy reusable tote for errands and school.", price_centavos: 24900, stock: 24, image_url: "", shop_id: 1, shop_name: "MNL Everyday", category: "Fashion" },
        { id: 105, name: "Classic Baseball Cap", description: "An easy-to-wear adjustable cotton cap.", price_centavos: 32900, stock: 16, image_url: "", shop_id: 1, shop_name: "MNL Everyday", category: "Fashion" },
        { id: 106, name: "Insulated Water Bottle", description: "Reusable bottle for commutes and study days.", price_centavos: 39900, stock: 20, image_url: "", shop_id: 1, shop_name: "MNL Everyday", category: "Sports" },
        { id: 107, name: "Ceramic Plant Pot", description: "A clean, simple pot for a small indoor plant.", price_centavos: 27900, stock: 13, image_url: "", shop_id: 2, shop_name: "Little Home Co.", category: "Home & Living" },
        { id: 108, name: "Kitchen Storage Set", description: "Stackable containers to keep pantry staples tidy.", price_centavos: 45900, stock: 9, image_url: "", shop_id: 2, shop_name: "Little Home Co.", category: "Home & Living" },
        { id: 109, name: "Soft Desk Lamp", description: "Compact warm-light lamp for a bedside or workspace.", price_centavos: 69900, stock: 7, image_url: "", shop_id: 2, shop_name: "Little Home Co.", category: "Home & Living" },
        { id: 110, name: "Reusable Cleaning Cloths", description: "A set of washable cloths for everyday cleanups.", price_centavos: 15900, stock: 31, image_url: "", shop_id: 2, shop_name: "Little Home Co.", category: "Home & Living" },
        { id: 111, name: "Grid Study Notebook", description: "A handy grid notebook for class notes and planning.", price_centavos: 9900, stock: 64, image_url: "", shop_id: 3, shop_name: "Study Corner", category: "School Supplies" },
        { id: 112, name: "Pastel Highlighter Set", description: "A set of five soft-color highlighters.", price_centavos: 12900, stock: 38, image_url: "", shop_id: 3, shop_name: "Study Corner", category: "School Supplies" }
    ],
    orders: [
        {
            id: 501,
            order_number: "ORD-MOCK-0501",
            status: "pending",
            total_centavos: 108800,
            created_at: "2026-10-25T09:30:00+08:00",
            items: [
                { product_id: 101, product_name: "Wireless Bluetooth Earbuds", price_centavos: 89900, quantity: 1, line_total_centavos: 89900 },
                { product_id: 102, product_name: "Foldable Phone Stand", price_centavos: 18900, quantity: 1, line_total_centavos: 18900 }
            ]
        },
        {
            id: 502,
            order_number: "ORD-MOCK-0502",
            status: "paid",
            total_centavos: 48600,
            created_at: "2026-10-26T14:15:00+08:00",
            items: [
                { product_id: 111, product_name: "Grid Study Notebook", price_centavos: 9900, quantity: 2, line_total_centavos: 19800 },
                { product_id: 112, product_name: "Pastel Highlighter Set", price_centavos: 12900, quantity: 1, line_total_centavos: 12900 },
                { product_id: 110, product_name: "Reusable Cleaning Cloths", price_centavos: 15900, quantity: 1, line_total_centavos: 15900 }
            ]
        }
    ],
    user: {
        id: 900,
        full_name: "BUDOL Demo Buyer",
        email: "buyer@example.com",
        role: "buyer",
        shop: null
    },
    users: [
        { id: 900, full_name: "BUDOL Demo Buyer", email: "buyer@example.com", role: "buyer", status: "active", shop_id: null, shop_name: null },
        { id: 902, full_name: "Maria Santos", email: "maria@example.com", role: "seller", status: "active", shop_id: 1, shop_name: "MNL Everyday", shop_status: "approved" },
        { id: 903, full_name: "Alex Reyes", email: "alex@example.com", role: "seller", status: "active", shop_id: 4, shop_name: "Cypress Finds", shop_status: "pending" },
        { id: 901, full_name: "BUDOL Administrator", email: "admin@example.com", role: "admin", status: "active", shop_id: null, shop_name: null }
    ],
    activity: [
        { id: 1, user_id: 902, full_name: "Maria Santos", email: "maria@example.com", role: "seller", action: "seller_register", details: "Seller account and shop created.", ip_address: "127.0.0.1", created_at: "2026-11-06T09:00:00+08:00" },
        { id: 2, user_id: 900, full_name: "BUDOL Demo Buyer", email: "buyer@example.com", role: "buyer", action: "buyer_register", details: "Buyer account created.", ip_address: "127.0.0.1", created_at: "2026-11-05T12:30:00+08:00" },
        { id: 3, user_id: 901, full_name: "BUDOL Administrator", email: "admin@example.com", role: "admin", action: "admin_login", details: "Administrator signed in.", ip_address: "127.0.0.1", created_at: "2026-11-07T10:00:00+08:00" }
    ],
    payments: [
        { order_id: 501, order_number: "ORD-MOCK-0501", buyer_name: "BUDOL Demo Buyer", amount_centavos: 108800, status: "pending", payment_method: "PayMongo Checkout", created_at: "2026-10-25T09:30:00+08:00" },
        { order_id: 502, order_number: "ORD-MOCK-0502", buyer_name: "BUDOL Demo Buyer", amount_centavos: 48600, status: "paid", payment_method: "PayMongo Checkout", created_at: "2026-10-26T14:15:00+08:00" }
    ]
};
