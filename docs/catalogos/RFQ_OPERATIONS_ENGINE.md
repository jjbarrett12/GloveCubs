# RFQ Operations Engine

## Goal

Turn incoming quote requests into actionable, assignable, sourceable quote workflows. Internal team can own RFQs, track SLA, see supplier match and best/alternate offers per line item, and get notified on new/assigned/urgent requests.

## Architecture

- **Assignment**: `assigned_to` (user id or email), `priority` (low, normal, high, urgent), `due_by` (optional SLA), `source` (e.g. storefront). Queue views: unassigned, mine, overdue, urgent, awaiting response.
- **SLA**: `submitted_at` (= created_at), `first_viewed_at`, `first_contacted_at`, `quoted_at`, `closed_at`. Aging and overdue derived in UI.
- **Offer matching**: For each quote_line_item (product_id), load active supplier_offers for that product; best sell price, alternates, lead time; flag items with no offers as needing manual sourcing.
- **Detail workspace**: Buyer/contact, line items with matched-offer table, internal notes, assignment/priority/due_by, SLA timestamps.
- **Notifications**: Hooks for new RFQ (team), on assignment (assignee), buyer confirmation on submit; urgent/asap highlighted. Implement as stub or wire to email later.

## Schema Additions (quote_requests)

- assigned_to TEXT
- priority TEXT (low, normal, high, urgent)
- due_by TIMESTAMPTZ
- source TEXT (default 'storefront')
- internal_notes TEXT
- submitted_at TIMESTAMPTZ (default created_at)
- first_viewed_at TIMESTAMPTZ
- first_contacted_at TIMESTAMPTZ
- quoted_at TIMESTAMPTZ
- closed_at TIMESTAMPTZ

## Queue views

- **Unassigned**: `assigned_to IS NULL` and `status != 'closed'`.
- **Mine**: `assigned_to = current_user` and `status != 'closed'`. Set `RFQ_CURRENT_USER` env to the assignee id/email for "mine" to work.
- **Overdue**: `due_by < now()` and `due_by IS NOT NULL` and `status != 'closed'`.
- **Urgent**: `priority IN ('high','urgent')` and `status != 'closed'`.
- **Awaiting response**: `status = 'quoted'`.

## Offer matching

- For each quote line item, `product_id` is used to load active `supplier_offers` for that product.
- Best offer: lowest display price (sell_price ?? cost).
- Alternates: remaining offers sorted by price.
- Items with no active offers are flagged "No match" / "Manual source" in the workspace.

## Notifications

- **New RFQ**: `notifyTeamNewRfq` called after create (stub; wire to email/Slack).
- **Assignee**: `notifyAssigneeAssigned` called when assignment is set (stub).
- **Buyer confirmation**: `sendBuyerConfirmation` called after submit (stub; wire to transactional email).

## Audit

- First-view: set `first_viewed_at` when an admin first opens the RFQ workspace (server component calls `recordFirstViewed(id)`).
- Status transitions: when status → contacted set `first_contacted_at`; → quoted set `quoted_at`; → closed set `closed_at`.
- All assignment/priority/due_by/internal_notes updates go through server actions and revalidate paths.
