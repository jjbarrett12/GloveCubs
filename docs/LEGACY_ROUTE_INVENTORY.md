# Legacy Route Inventory — loadDB/saveDB/db Migration

All routes/handlers below currently call `loadDB()` and/or `saveDB()` and use `db.*`. Each must be migrated to Supabase via the service layer.

---

## Classification

| Priority | Label | Description |
|----------|--------|-------------|
| 1 | **launch-critical** | Carts, orders, checkout — required for storefront purchasing |
| 2 | **admin-critical** | Companies, customers, manufacturers, inventory, POs, admin orders |
| 3 | **support-only** | Contact, password reset, contact messages |
| 4 | **low-priority legacy** | Fishbowl export, product update-images-csv, export.csv, account/tier/budget, etc. |

---

## Full list (by route)

### Launch-critical
| Route | Tables used | Supabase mapping |
|-------|-------------|------------------|
| GET /api/cart | db.carts, db.products, db.companies | carts, products (productsService), companies (getPricingContext) |
| POST /api/cart | db.carts, db.products | carts, productsService.getProductById |
| PUT /api/cart/:id | db.carts | carts |
| DELETE /api/cart/:id | db.carts | carts |
| DELETE /api/cart | db.carts | carts |
| POST /api/orders | db.carts, db.ship_to_addresses, db.products, db.users, db.orders | dataService carts/orders, shipTo, productsService, usersService |
| POST /api/orders/create-payment-intent | db.ship_to_addresses, db.carts, db.products, db.users, db.orders | same |
| GET /api/orders | db.orders | orders |
| GET /api/orders/:id | db.orders | orders |
| POST /api/orders/:id/reorder | db.orders, db.carts, db.products | orders, carts, productsService |
| GET /api/orders/:id/invoice | db.orders, db.users | orders, usersService |
| GET /api/saved-lists | db.saved_lists | saved_lists |
| POST /api/saved-lists | db.saved_lists | saved_lists |
| PUT /api/saved-lists/:id | db.saved_lists | saved_lists |
| DELETE /api/saved-lists/:id | db.saved_lists | saved_lists |
| POST /api/saved-lists/:id/add-to-cart | db.saved_lists, db.carts, db.products | saved_lists, carts, productsService |

### Account / ship-to (launch-related)
| Route | Tables used | Supabase mapping |
|-------|-------------|------------------|
| GET /api/ship-to | db.ship_to_addresses | ship_to_addresses |
| POST /api/ship-to | db.ship_to_addresses | ship_to_addresses |
| PUT /api/ship-to/:id | db.ship_to_addresses | ship_to_addresses |
| DELETE /api/ship-to/:id | db.ship_to_addresses | ship_to_addresses |
| GET /api/account/tier-progress | db.orders, db.users | orders, usersService |
| GET /api/account/budget | db.users | usersService |
| PUT /api/account/budget | db.users | usersService |
| GET /api/account/summary | db.orders, db.users, db.products | orders, users, productsService |
| GET /api/account/rep | db.users | usersService |

### Support-only
| Route | Tables used | Supabase mapping |
|-------|-------------|------------------|
| POST /api/contact | db.contact_messages | contact_messages |
| POST /api/auth/forgot-password | db.users, db.password_reset_tokens | usersService, password_reset_tokens |
| GET /api/auth/reset-check | db.password_reset_tokens | password_reset_tokens |
| POST /api/auth/reset-password | db.password_reset_tokens, db.users | password_reset_tokens, usersService |
| GET /api/invoices | db.uploaded_invoices | uploaded_invoices |
| POST /api/invoices | db.uploaded_invoices | uploaded_invoices |
| DELETE /api/invoices/:id | db.uploaded_invoices | uploaded_invoices |

### RFQ
| Route | Tables used | Supabase mapping |
|-------|-------------|------------------|
| POST /api/cart/bulk | db.carts, db.products | carts, productsService |
| POST /api/rfqs | db.rfqs, db.users | rfqs, usersService |
| GET /api/rfqs/mine | db.rfqs | rfqs |
| GET /api/rfqs | db.rfqs | rfqs |
| PUT /api/rfqs/:id | db.rfqs | rfqs |

### Admin
| Route | Tables used | Supabase mapping |
|-------|-------------|------------------|
| GET /api/admin/orders | db.orders | orders (all) |
| PUT /api/admin/orders/:id | db.orders | orders |
| GET /api/admin/users | db.users | usersService |
| POST /api/admin/users | db.users, db.saved_lists? | usersService |
| PUT /api/admin/users/:id | db.users | usersService |
| GET /api/admin/contact-messages | db.contact_messages | contact_messages |
| GET /api/admin/companies | db.companies | companiesService |
| GET /api/admin/manufacturers | db.manufacturers | manufacturers |
| PATCH /api/admin/manufacturers/:id | db.manufacturers | manufacturers (vendor_email, po_email) |
| GET /api/admin/inventory | db.products, db.inventory | productsService, inventory |
| PUT /api/admin/inventory/:product_id | db.products, db.inventory | productsService, inventory |
| POST /api/admin/inventory/cycle | db.inventory, db.products | inventory, productsService |
| GET /api/admin/inventory/reorder-suggestions | db.products, db.inventory | productsService, inventory |
| GET /api/admin/inventory/ai-reorder-summary | db.products, db.inventory | productsService, inventory |
| GET /api/admin/purchase-orders | db.purchase_orders | purchase_orders |
| GET /api/admin/purchase-orders/:id | db.purchase_orders | purchase_orders |
| POST /api/admin/purchase-orders | db.purchase_orders, db.products | purchase_orders, productsService |
| PUT /api/admin/purchase-orders/:id | db.purchase_orders | purchase_orders |
| POST /api/admin/purchase-orders/:id/send | db.purchase_orders, db.manufacturers | purchase_orders, manufacturers |
| POST /api/admin/orders/:id/create-po | db.orders, db.manufacturers, db.products, db.purchase_orders | orders, manufacturers, productsService, purchase_orders |

### Fishbowl / product CSV (low-priority legacy)
| Route | Tables used | Supabase mapping |
|-------|-------------|------------------|
| POST /api/products/update-images-csv | db.users, db.products, saveDB | usersService, productsService |
| GET /api/products/export.csv | db.users, db.products, db.manufacturers | usersService, productsService, getManufacturers |
| POST /api/fishbowl/sync-inventory | db.users, db.products, db.inventory | usersService, productsService, inventory |
| GET /api/fishbowl/export-customers | db.users, db.orders | usersService, orders |
| GET /api/fishbowl/export-customers.csv | db.users, db.orders | usersService, orders |
| writeFishbowlCustomersExport() | loadDB (data) | usersService + dataService.getOrdersForExport |
| GET /api/fishbowl/export-customers-file | (reads file from disk) | N/A — file written by export or scheduled job |

---

## Non-route call sites

- **Stripe webhook** (payment_intent.succeeded): already uses dataService.getOrderByIdAdmin + updateOrderStatus.
- **getCustomersForFishbowlExport(db)**: helper that uses db.users, db.orders — must be replaced with usersService + orders from Supabase.

---

## Table → service mapping

- **orders** → dataService (getOrdersByUserId, getOrderById, getOrderByIdAdmin, createOrder, updateOrder, updateOrderStatus)
- **order_items** → via createOrder/updateOrder
- **carts** → dataService (getCart, setCart)
- **ship_to_addresses** → dataService (getShipToByUserId, createShipTo, updateShipTo, deleteShipTo)
- **saved_lists** → dataService (getSavedListsByUserId, createSavedList, updateSavedList, deleteSavedList)
- **uploaded_invoices** → dataService (getUploadedInvoicesByUserId, createUploadedInvoice, deleteUploadedInvoice) — payload includes user_id
- **rfqs** → dataService (getRfqs, getRfqsByUserId, createRfq, updateRfq)
- **contact_messages** → dataService.createContactMessage, listContactMessages
- **password_reset_tokens** → dataService (createPasswordResetToken, findPasswordResetToken, deletePasswordResetToken) + user_id in token row
- **manufacturers** → dataService.getManufacturers, updateManufacturer (vendor_email, po_email)
- **inventory** → dataService (getInventory, getInventoryByProductId, upsertInventory) + bin_location, last_count_at
- **purchase_orders** → dataService (getPurchaseOrders, getPurchaseOrderById, createPurchaseOrder, updatePurchaseOrder) + po_number, sent_at
- **companies** → companiesService.getCompanies, getCompanyById
- **users** → usersService (getUserById, getUsers for admin, createUser, updateUser)
