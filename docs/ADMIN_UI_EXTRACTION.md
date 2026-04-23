# AdminUI extraction plan (incremental)

## OrdersPage ✅ (implemented)
| Extract to `AdminUI.OrdersPage` | Stay in `app.js` |
|--------------------------------|------------------|
| Loading / auth / empty-page / error / empty-table markup | `api.get('/api/admin/orders')`, cache, filter state |
| SummaryStrip, Toolbar, BulkBar, table shell, footer hint | `adminOrdersSetStatusFilter`, `adminOrdersBulkUpdate`, `adminOrdersToggleSelectAll`, `adminOrdersCopyIds` |
| `tableRowsHtml(filtered)` (main + inline line rows) | `adminOrdersToggleDetail`, `openAdminOrderTrackingModal`, `saveAdminOrderTracking`, `createPoFromOrder` |
| `computeStats(orders)` | Retry button calls `loadAdminOrders()` |

## ProductsPage ✅ (implemented)
| In `AdminUI.ProductsPage` | Stay in `app.js` |
|---------------------------|------------------|
| `states.loading` / `states.error` / `states.filteredEmpty` | `api.get('/api/products')`, cache, `keepPage`, `populateExportFilters`, `populateAdminListFilters` |
| `summaryStrip`, `pageHeader`, `fishbowlHint`, `exportBySection` | Fishbowl handlers (`syncFishbowlInventory`, `exportFishbowlCustomers`), CSV import orchestration |
| `toolbar`, `batchBar`, grid wrapper, `tableFooter` + `paginationFooterHtml` | `adminProductsRenderPage`, filters, `batchDeleteProducts`, `editProduct` |
| `tableRowHtml`, `tableWrapWithBody`, `cardHtml` | `new-from-url` → `renderAdminNewFromUrl()`; add-product form + CSV section + edit modal markup |

## AdminUsersPage ✅ (implemented)
| In `AdminUI.AdminUsersPage` | Stay in `app.js` |
|-----------------------------|------------------|
| `states.authRequired` / `loading` / `error`, `summaryStrip`, `truthBanner` | `Promise.all` `/api/admin/users` + `/api/admin/owner/admins-users` |
| `adminRosterCard` + `rosterRowHtml` (app_admins), `approvalQueueCard` + `approvalRowHtml` | `ownerApproveUser`, `updateUserApproval`, `updateUserTier`, `updateUserPaymentTerms` |
| `pageHeader`, `emptyPublicUsers`, `publicUsersSection` + `publicUserCardHtml` (public.users) | `getAddCustomerModalHTML`, `submitAddCustomer`, `showAddCustomerModal` / product fetch |
| `composeBody(users, cockpit)` | `adminUsersPageLegacyHtml` if `AdminUI.AdminUsersPage` missing |

## CompanyDetailDrawer
| Safe to extract | Stay |
|-----------------|------|
| Layout sections (tabs shell when added) | `loadAdminCustomerDetail` API calls, `saveAdminDefaultMargin`, overrides CRUD |

## OrderDetailDrawer
| Safe to extract | Stay |
|-----------------|------|
| Tracking modal markup (`openAdminOrderTrackingModal`) | `saveAdminOrderTracking`, PUT call |

## ProductDetailDrawer
| Safe to extract | Stay |
|-----------------|------|
| Edit form panels if unified | `editProduct` modal flow, `api` save |
