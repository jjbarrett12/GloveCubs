# Fishbowl Inventory Integration

Glovecubs can sync inventory with **Fishbowl Advanced** via the Fishbowl REST API. This lets you:

- **Sync stock levels** from Fishbowl into Glovecubs (in_stock and quantity_on_hand).
- Match products by **Main SKU** and **Variant SKU** (e.g. `GLV-500G` and `GLV-500G-S`, `GLV-500G-M`, etc.).

## Requirements

- **Fishbowl Advanced** with REST API enabled (default API port **2456**).
- Fishbowl server reachable from the machine running Glovecubs (local network or Fishbowl hosting).
- A Fishbowl user with API access; the first time you connect, you must **approve the app** in Fishbowl (Settings → Integrated Apps).

## Configuration

Add these to your `.env` file:

```env
# Fishbowl REST API (optional – omit to disable integration)
FISHBOWL_BASE_URL=https://your-fishbowl-server:2456
FISHBOWL_USERNAME=your_fishbowl_username
FISHBOWL_PASSWORD=your_fishbowl_password

# Optional: app identity (defaults shown)
FISHBOWL_APP_NAME=Glovecubs
FISHBOWL_APP_DESCRIPTION=B2B glove e-commerce - inventory sync
FISHBOWL_APP_ID=9001

# If the Fishbowl user has MFA enabled, set the current TOTP code (or use login with mfaCode)
# FISHBOWL_MFA_CODE=123456
```

- **FISHBOWL_BASE_URL** – Full URL to the Fishbowl API (e.g. `https://fishbowl.company.com:2456` or `http://192.168.1.100:2456`). No trailing slash.
- **FISHBOWL_USERNAME** / **FISHBOWL_PASSWORD** – Fishbowl user credentials.
- **FISHBOWL_APP_NAME**, **FISHBOWL_APP_DESCRIPTION**, **FISHBOWL_APP_ID** – Shown in Fishbowl when approving the integration; defaults work for most cases.
- **FISHBOWL_MFA_CODE** – Only needed if the user has MFA; you can also pass `mfaCode` when calling login programmatically.

## SKU / Part Number Mapping

- **Glovecubs Main SKU** (e.g. `GLV-500G`) should match a Fishbowl **Part Number** for the base product.
- **Variant SKUs** (e.g. `GLV-500G-S`, `GLV-500G-M`, `GLV-500G-L`, `GLV-500G-XL`) should match Fishbowl part numbers for each size.
- Sync sums quantity for the main part number and all variant part numbers (main + each size suffix) and sets:
  - **in_stock** = 1 if total quantity > 0, else 0.
  - **quantity_on_hand** = total quantity (for future “X in stock” display).

Ensure Part Numbers in Fishbowl match your Glovecubs SKUs (and variant SKUs) exactly (case-insensitive match).

## API Endpoints (Glovecubs server)

- **GET /api/fishbowl/status**  
  - No auth required.  
  - Returns `{ configured, connected, message }`.  
  - Use to verify env and connectivity.

- **POST /api/fishbowl/sync-inventory**  
  - **Requires authentication** (admin/approved user).  
  - Pulls inventory from Fishbowl and updates Glovecubs products (in_stock, quantity_on_hand).  
  - Response: `{ success, updated, totalProducts, message }`.  
  - On MFA-required login: response includes `mfaRequired: true`; set `FISHBOWL_MFA_CODE` or call login with `mfaCode` and retry.

## Running a Sync

1. Configure `.env` as above.
2. Restart Glovecubs (or ensure it has loaded the new env).
3. Check status:  
   `GET https://your-glovecubs-server/api/fishbowl/status`
4. Run sync as an authenticated admin:  
   `POST https://your-glovecubs-server/api/fishbowl/sync-inventory`  
   with `Authorization: Bearer <your-jwt>`.

You can call sync on a schedule (e.g. cron every 15 minutes) or trigger it from an admin UI.

## Fishbowl Server Setup

1. Enable the REST API and set the port (e.g. 2456) in **Fishbowl Server Administration** (or Options on the Fishbowl Server app).
2. Prefer **HTTPS** and install a certificate on the Fishbowl server if the Glovecubs server is not on the same LAN.
3. In Fishbowl, go to **Settings → Integrated Apps**, approve “Glovecubs” when it first connects (login from Glovecubs triggers this).

## Troubleshooting

- **configured: false** – One or more of `FISHBOWL_BASE_URL`, `FISHBOWL_USERNAME`, `FISHBOWL_PASSWORD` are missing in `.env`.
- **connected: false** – Check URL, port, firewall, and credentials; confirm the app is approved in Fishbowl.
- **401 / MFA required** – User has MFA; include current TOTP in `FISHBOWL_MFA_CODE` or pass `mfaCode` in login.
- **No products updated** – Verify Part Numbers in Fishbowl match Glovecubs Main SKU and variant SKUs (e.g. `GLV-500G`, `GLV-500G-S`).

## References

- [Fishbowl Advanced REST API – Connecting](https://help.fishbowlinventory.com/advanced/s/apidocs/connecting.html)
- [Fishbowl Advanced REST API – Login](https://help.fishbowlinventory.com/advanced/s/apidocs/login.html)
- [Fishbowl Advanced REST API – Inventory](https://help.fishbowlinventory.com/advanced/s/apidocs/inventory.html)
- [Fishbowl Advanced REST API – Parts](https://help.fishbowlinventory.com/advanced/s/apidocs/parts.html)
