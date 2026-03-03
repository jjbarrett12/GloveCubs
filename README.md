# Glovecubs - B2B Glove E-Commerce Platform

A professional e-commerce website for selling disposable and work gloves from manufacturers like Hospeco, Global Glove, Safeko, and more.

## Features

- **Product Catalog**: Browse disposable and work gloves with filtering by category, brand, and material
- **B2B Login System**: Business customers can register and log in for wholesale pricing
- **Discount Tiers**: Bronze (5%), Silver (10%), Gold (15%), Platinum (20%) based on order volume
- **Shopping Cart**: Full cart functionality with quantity management
- **Checkout System**: Complete checkout flow for registered B2B customers
- **Order History**: Customers can view their order history in their dashboard
- **Responsive Design**: Woodmart-inspired theme with black and neon orange colors

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite (better-sqlite3)
- **Authentication**: JWT tokens + bcrypt password hashing
- **Frontend**: Vanilla HTML/CSS/JavaScript (SPA architecture)
- **Session Management**: express-session with SQLite store

## Quick Start

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Seed the database with products:
```bash
npm run seed
```

3. Start the server:
```bash
npm start
```

4. Open your browser to: http://localhost:3000

### Development Mode
```bash
npm run dev
```

### Local dev: Admin API proxy (storefront on :3004, Express API on :3001)

When the Next.js storefront runs on port 3004 and the main GloveCubs Express API runs on another port (e.g. 3001), requests to `http://localhost:3004/api/admin/*` are rewritten to the real API so the Admin UI (Inventory, POs, etc.) gets JSON instead of HTML.

1. **Set the Admin API origin** (in `storefront/.env.local`, do not commit secrets):
   - `GLOVECUBS_ADMIN_API_ORIGIN=http://localhost:3001` (server-side rewrite target)
   - `NEXT_PUBLIC_GLOVECUBS_ADMIN_API_ORIGIN=http://localhost:3001` (optional; for UI/debug)
   If unset, the rewrite falls back to `http://localhost:3001`.

2. **Run the Express API** on 3001 (from repo root):
   ```bash
   PORT=3001 npm run dev
   ```

3. **Run the storefront** on 3004 (from `storefront/`):
   ```bash
   npx next dev -p 3004
   ```

4. **Verify the proxy** (storefront must be running on 3004):
   ```bash
   curl -i http://localhost:3004/api/admin/inventory
   ```
   You should see `Content-Type: application/json` (and 401 if not authenticated).

## Demo Account

A demo B2B account is created during seeding:
- **Email**: demo@company.com
- **Password**: demo123
- **Tier**: Silver (10% discount)

## Product SKU Format

All product SKUs follow the format: `GLV-[manufacturer item number]`

Examples:
- GLV-GL-N105FX (Hospeco ProWorks Nitrile)
- GLV-705PFE (Global Glove Panther-Guard)
- GLV-SAF-N100 (Safeko Nitrile Exam)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new B2B account
- `POST /api/auth/login` - Login and receive JWT
- `GET /api/auth/me` - Get current user (requires auth)

### Products
- `GET /api/products` - List all products (with optional filters)
- `GET /api/products/:id` - Get single product
- `GET /api/categories` - List categories
- `GET /api/brands` - List brands

### Cart
- `GET /api/cart` - Get cart items
- `POST /api/cart` - Add item to cart
- `PUT /api/cart/:id` - Update cart item quantity
- `DELETE /api/cart/:id` - Remove item from cart
- `DELETE /api/cart` - Clear cart

### Orders (requires auth)
- `POST /api/orders` - Create order from cart
- `GET /api/orders` - Get user's orders
- `GET /api/orders/:id` - Get single order with items

## File Structure

```
glovecubs/
├── server.js          # Express server & API routes
├── seed.js            # Database seeding script
├── package.json       # Dependencies
├── .env               # Environment variables
├── glovecubs.db       # SQLite database (created on first run)
├── sessions.db        # Session storage
└── public/
    ├── index.html     # Main HTML file
    ├── css/
    │   └── styles.css # All styles (Woodmart-inspired)
    └── js/
        └── app.js     # Frontend JavaScript (SPA)
```

## Brands Included

- **Hospeco** - ProWorks line
- **Global Glove** - Panther-Guard, Samurai, FrogWear
- **Safeko** - Premium protection
- **Ambitex** - Budget-friendly
- **SW Safety** - Eco-friendly options
- **MCR Safety** - UltraTech, Cut Pro
- **PIP** - MaxiFlex series
- **Wells Lamont** - Leather work gloves
- **Ansell** - HyFlex series
- **SHOWA** - Atlas and biodegradable

## Customization

### Adding Products
Edit `seed.js` to add more products, then run:
```bash
npm run seed
```

### Changing Colors
Edit CSS variables in `public/css/styles.css`:
```css
:root {
    --primary: #FF6B00;      /* Neon Orange */
    --secondary: #1a1a1a;    /* Black */
}
```

### Adding Your Logo
Replace the logo section in `public/index.html` or add your logo image to the `public/images/` folder.

## License

Private - All rights reserved.
