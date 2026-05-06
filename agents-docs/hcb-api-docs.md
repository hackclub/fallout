---
name: HCB API v4 Documentation
description: Complete endpoint reference for HCB (Hack Club Bank) v4 API — OAuth flow, every endpoint with method, params, response schema, errors
type: reference
---

# HCB API v4 — Complete Endpoint Reference

Source: the HCB codebase ([github.com/hackclub/hcb](https://github.com/hackclub/hcb)). HCB uses **Doorkeeper** for OAuth.

---

## OAuth

### Configuration
- **Token TTL:** 2 hours (doorkeeper.rb:16)
- **Refresh tokens:** Enabled (doorkeeper.rb:170)
- **Token format:** `hcb_` prefix + 32-char base64
- **HTTPS required** for redirect URIs (except localhost)
- **Grant flows:** `authorization_code`, `client_credentials`, `device_code`
- **ENV vars:** `HCB_CLIENT_ID`, `HCB_CLIENT_SECRET`, `HCB_OAUTH_HOST` (default `https://hcb.hackclub.com`)

### Base scopes: `read`, `write`

Restricted scopes (per-controller via `require_oauth2_scope`):

| Scope | Purpose |
|-------|---------|
| `organizations:read` | Read org details, sub-orgs, balance history |
| `card_grants:write` | Create/manage card grants |
| `user_lookup` | Look up users by ID/email (admin only) |
| `event_followers` | Get organization followers |

### Authentication
All requests: `Authorization: Bearer <token>` header. Token must be not expired and not revoked.

### `GET /api/v4/oauth/authorize`
Authorization page. Redirects user to grant access.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `client_id` | string | yes | OAuth application client ID |
| `redirect_uri` | string | yes | Callback URL (HTTPS required) |
| `response_type` | string | yes | Must be `"code"` |
| `scope` | string | no | Space-separated scopes |
| `state` | string | yes | CSRF protection token |

### `POST /api/v4/oauth/token`
Exchange authorization code or refresh token for access token.

**Grant type: `authorization_code`**

| Param | Type | Required |
|-------|------|----------|
| `client_id` | string | yes |
| `client_secret` | string | yes |
| `redirect_uri` | string | yes |
| `code` | string | yes |
| `grant_type` | string | yes (`"authorization_code"`) |

**Grant type: `refresh_token`**

| Param | Type | Required |
|-------|------|----------|
| `client_id` | string | yes |
| `client_secret` | string | yes |
| `refresh_token` | string | yes |
| `grant_type` | string | yes (`"refresh_token"`) |

**Returns:**
```json
{
  "access_token": "hcb_...",
  "token_type": "Bearer",
  "expires_in": 7200,
  "refresh_token": "...",
  "scope": "read write",
  "created_at": 1234567890
}
```

### `POST /api/v4/oauth/token/revoke`
Revoke a token.

| Param | Type | Required |
|-------|------|----------|
| `token` | string | yes |

---

## Expand Mechanism

Many endpoints support `?expand=field1,field2` to include optional nested data. Available fields are documented per-endpoint. Without expansion, those fields are absent from the response.

## Pagination

List endpoints use cursor-based pagination:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | 25 | Max results per page |
| `after` | string | — | Cursor (ID of last item from previous page) |

**Response envelope:**
```json
{
  "data": [...],
  "total_count": 42,
  "has_more": true
}
```

---

## Error Handling

All errors follow: `{ "error": "<code>", "messages": ["..."] }`

| Code | HTTP | Cause |
|------|------|-------|
| `invalid_auth` | 401 | Missing, expired, or revoked token |
| `not_authorized` | 403 | Insufficient permissions / wrong scope |
| `resource_not_found` | 404 | Record doesn't exist |
| `not_found` | 404 | Route doesn't exist |
| `invalid_record` | 400 | Validation failed |
| `invalid_operation` | 400 | Business logic error / bad argument |
| `stripe_error` | 400 | Stripe API error |
| `internal_error` | 500 | Database error |
| `service_unavailable` | 503 | Database connection lost |

---

## Organizations (HCB calls them "Events")

### `GET /api/v4/user/organizations`
List the authenticated user's organizations.

- **Auth:** Bearer token (no specific scope)
- **Pundit:** Skipped (returns only current user's events)

**Returns:** Array of Organization objects (see schema below)

### `GET /api/v4/organizations/:id`
Get organization details.

- **Auth:** Scope `organizations:read`
- **Pundit:** `EventPolicy#show_in_v4?`
- **Path param:** `:id` — `public_id` OR `slug`

**Returns:** Organization object

### `GET /api/v4/organizations/:id/sub_organizations`
List sub-organizations.

- **Auth:** Scope `organizations:read`
- **Pundit:** `EventPolicy#sub_organizations_in_v4?`

**Returns:** Array of Organization objects

### `POST /api/v4/organizations/:id/sub_organizations`
Create a sub-organization.

- **Auth:** Scope `organizations:read`
- **Pundit:** `EventPolicy#create_sub_organization?` (requires admin/manager + subevents enabled)

| Param | Type | Required |
|-------|------|----------|
| `name` | string | yes |
| `email` | string | yes |
| `cosigner_email` | string | no |
| `country` | string | no |
| `scoped_tags` | array | no |

**Returns:** Organization object, status `201`

### `GET /api/v4/organizations/:id/followers`
List organization followers.

- **Auth:** Scope `event_followers`
- **Pundit:** `EventPolicy#show_in_v4?`

**Returns:** Array of User objects

### `GET /api/v4/organizations/:id/balance_by_date`
Get daily balance history (cached 5 minutes, limited to last year).

- **Auth:** Scope `organizations:read`
- **Pundit:** `EventPolicy#show_in_v4?`

**Returns:**
```json
{
  "balance_series": [
    { "date": "2025-01-15", "amount": 150000 }
  ]
}
```

### Organization Object Schema
```json
{
  "id": "string (public_id)",
  "created_at": "datetime",
  "parent_id": "string | null",
  "name": "string",
  "country": "string (ISO 2-letter)",
  "slug": "string",
  "financially_frozen": "boolean",
  "icon": "url | null",
  "donation_page_available": "boolean",
  "playground_mode": "boolean",
  "playground_mode_meeting_requested": "boolean",
  "transparent": "boolean",
  "fee_percentage": "float",
  "background_image": "url | null",

  // expand=balance_cents
  "balance_cents": "integer",
  "fee_balance_cents": "integer",

  // expand=reporting
  "total_spent_cents": "integer",
  "total_raised_cents": "integer",

  // expand=account_number (requires policy)
  "account_number": "string",
  "routing_number": "string",
  "swift_bic_code": "string",

  // expand=users
  "users": [{ "...user fields", "joined_at": "datetime", "role": "string" }]
}
```

---

## Transactions

### `GET /api/v4/organizations/:org_id/transactions`
List transactions with filtering and pagination.

- **Auth:** Bearer token
- **Pundit:** `EventPolicy#show_in_v4?`

| Filter (nested under `filters`) | Type | Description |
|----------------------------------|------|-------------|
| `search` | string | Text search (memos, merchants) |
| `tag_id` | string | Filter by tag UUID |
| `expenses` | boolean | Outflows only |
| `revenue` | boolean | Inflows only |
| `minimum_amount` | float | Min amount in **dollars** |
| `maximum_amount` | float | Max amount in **dollars** |
| `start_date` | string | `YYYY-MM-DD` |
| `end_date` | string | `YYYY-MM-DD` |
| `user_id` | string | Filter by user UUID |
| `missing_receipts` | boolean | Missing receipts only |
| `category` | string | Merchant category |
| `merchant` | string | Merchant name |
| `order_by` | string | Sort field |

Pagination: `limit` (default 25), `after` (cursor)

**Returns:** `{ transactions: [...], total_count: N, has_more: bool }`

### `GET /api/v4/transactions/:id`
Get a single transaction.

- **Auth:** Bearer token
- **Pundit:** `HcbCodePolicy#show?`

**Returns:** Transaction object

### `PATCH /api/v4/organizations/:org_id/transactions/:id`
Update transaction memo.

- **Auth:** Bearer token
- **Pundit:** `HcbCodePolicy#update?` (requires member+ in owning org)

| Param | Type | Required |
|-------|------|----------|
| `memo` | string | yes |

**Returns:** Transaction object

### `GET /api/v4/organizations/:org_id/transactions/:id/memo_suggestions`
Get AI-generated memo suggestions.

- **Auth:** Bearer token
- **Pundit:** `HcbCodePolicy#update?`

**Returns:** `{ "suggested_memos": ["string", ...] }` (max 4)

### `POST /api/v4/transactions/:id/mark_no_receipt`
Mark transaction as having no/lost receipt.

- **Auth:** Bearer token
- **Pundit:** `ReceiptablePolicy#mark_no_or_lost?`

**Returns:** `{ "message": "Transaction marked as no/lost receipt" }`

### `GET /api/v4/user/transactions/missing_receipt`
List current user's transactions missing receipts.

- **Auth:** Bearer token (no scope)
- Pagination: `limit`, `after`

**Returns:** `{ hcb_codes: [...], total_count: N, has_more: bool }`

### Transaction Object Schema
```json
{
  "id": "string (public_id)",
  "date": "datetime",
  "amount_cents": "integer",
  "memo": "string",
  "has_custom_memo": "boolean",
  "pending": "boolean",
  "declined": "boolean",
  "reversed": "boolean",
  "code": "string (e.g. hcb_abc123)",
  "missing_receipt": "boolean",
  "lost_receipt": "boolean",
  "appearance": "string | null",
  "tags": [{ "id": "string", "label": "string", "color": "string", "emoji": "string" }],

  // Exactly one of these present based on transaction type:
  "card_charge": { "...see below" },
  "donation": { "...see below" },
  "expense_payout": { "...see below" },
  "invoice": { "...see below" },
  "check": { "...see below" },
  "transfer": { "...see below" },
  "ach_transfer": { "...see below" },
  "check_deposit": { "...see below" },
  "wise_transfer": { "...see below" },

  // expand=organization
  "organization": { "...org object" }
}
```

### Transaction Type: `card_charge`
```json
{
  "merchant": {
    "name": "string",
    "smart_name": "string | null",
    "country": "string (ISO)",
    "network_id": "string"
  },
  "decline_reason": "string | null",
  "charge_method": "string | null",
  "spent_at": "datetime",
  "wallet": "string | null",
  "card": { "...card fields (when expand=user)" }
}
```

### Transaction Type: `donation`
```json
{
  "id": "string",
  "recurring": "boolean",
  "donor": { "name": "string", "email": "string", "recurring_donor_id": "string | null" },
  "attribution": { "referrer": "string | null", "utm_source/medium/campaign/term/content": "string | null" },
  "payment_method": {
    "type": "string", "brand": "string", "last4": "string",
    "funding": "string", "exp_month": "integer", "exp_year": "integer", "country": "string"
  },
  "message": "string | null",
  "donated_at": "datetime",
  "refunded": "boolean",
  "deposited": "boolean",
  "in_transit": "boolean"
}
```

### Transaction Type: `expense_payout`
```json
{ "report_id": "string" }
```

### Transaction Type: `invoice`
```json
{
  "id": "string",
  "amount_cents": "integer",
  "sent_at": "datetime",
  "paid_at": "datetime | null",
  "description": "string",
  "due_date": "date",
  "sponsor": { "id": "string", "name": "string", "email": "string" }
}
```

### Transaction Type: `check`
Fields gated by `IncreaseCheckPolicy#show?`:
```json
{
  "id": "string",
  "address_city": "string | null (policy-gated)",
  "address_line1": "string | null (policy-gated)",
  "address_line2": "string | null (policy-gated)",
  "address_state": "string | null (policy-gated)",
  "address_zip": "string | null (policy-gated)",
  "recipient_email": "string | null (policy-gated)",
  "check_number": "string",
  "status": "string (parameterized) | null",
  "recipient_name": "string | null",
  "memo": "string",
  "payment_for": "string",
  "sender": { "...user object | null" }
}
```

### Transaction Type: `transfer` (disbursement)
```json
{
  "id": "string",
  "memo": "string",
  "status": "string",
  "transaction_id": "string (deprecated)",
  "outgoing_transaction_id": "string",
  "incoming_transaction_id": "string",
  "amount_cents": "integer",
  "from": { "...org object" },
  "to": { "...org object" },
  "sender": { "...user object | null" },
  "card_grant_id": "string | null"
}
```

### Transaction Type: `ach_transfer`
Fields gated by `AchTransferPolicy#view_account_routing_numbers?`:
```json
{
  "recipient_name": "string",
  "recipient_email": "string",
  "bank_name": "string",
  "account_number_last4": "string | null (policy-gated)",
  "routing_number": "string | null (policy-gated)",
  "payment_for": "string",
  "sender": { "...user object | null" }
}
```

### Transaction Type: `check_deposit`
Fields gated by `CheckDepositPolicy#view_image?`:
```json
{
  "status": "string (parameterized)",
  "front_url": "url | null (policy-gated)",
  "back_url": "url | null (policy-gated)",
  "submitter": { "...user object | null" }
}
```

### Transaction Type: `wise_transfer`
```json
{
  "id": "string",
  "recipient_name": "string",
  "recipient_email": "string",
  "recipient_country": "string",
  "payment_for": "string",
  "currency": "string (ISO 4217)",
  "amount_cents": "integer",
  "usd_amount_cents": "integer | null",
  "state": "string (aasm)",
  "organization_id": "string",
  "return_reason": "string | null",
  "sent_at": "datetime | null",
  "created_at": "datetime",
  "sender": { "...user object | null" }
}
```

---

## Card Grants

### `GET /api/v4/organizations/:org_id/card_grants`
List organization's card grants.

- **Auth:** Bearer token
- **Pundit:** `EventPolicy#transfers_in_v4?`

**Returns:** Array of CardGrant objects

### `GET /api/v4/user/card_grants`
List current user's card grants.

- **Auth:** Bearer token (no scope)
- **Pundit:** Skipped

**Returns:** Array of CardGrant objects

### `POST /api/v4/organizations/:org_id/card_grants`
Issue a new card grant.

- **Auth:** Scope `card_grants:write`
- **Pundit:** `CardGrantPolicy#create?`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `amount_cents` | integer | yes | Grant amount in cents |
| `email` | string | yes | Recipient email |
| `expiration_at` | date string | no | Parsed via `.to_date` |
| `merchant_lock` | boolean | no | Restrict to specific merchants |
| `category_lock` | boolean | no | Restrict to specific categories |
| `keyword_lock` | boolean | no | Keyword restrictions |
| `purpose` | string | no | Description of grant purpose |
| `one_time_use` | boolean | no | Single-use card |
| `pre_authorization_required` | boolean | no | Require pre-auth |
| `instructions` | string | no | Usage instructions |
| `invite_message` | string | no | Message sent to recipient |
| `sent_by_email` | string | no | Admin only: override sender |

**Returns:** CardGrant object, status `201`

**Errors:**
- `400`: `{ error: "invalid_user", messages: "User with email '...' not found" }` (if `sent_by_email` user missing)
- `422`: `{ error: "invalid_operation" }` on `DisbursementService::Create::UserError`

### `GET /api/v4/card_grants/:id`
Get card grant details.

- **Auth:** Bearer token
- **Pundit:** `CardGrantPolicy#show?`

**Returns:** CardGrant object

### `PATCH /api/v4/card_grants/:id`
Update card grant settings.

- **Auth:** Bearer token
- **Pundit:** `CardGrantPolicy#update?`

| Param | Type | Required |
|-------|------|----------|
| `merchant_lock` | boolean | no |
| `category_lock` | boolean | no |
| `keyword_lock` | boolean | no |
| `purpose` | string | no |
| `one_time_use` | boolean | no |
| `expiration_at` | date string | no |
| `instructions` | string | no |

**Returns:** CardGrant object

### `POST /api/v4/card_grants/:id/topup`
Add funds to a card grant.

- **Auth:** Bearer token
- **Pundit:** `CardGrantPolicy#topup?`

| Param | Type | Required |
|-------|------|----------|
| `amount_cents` | integer | yes |

**Returns:** CardGrant object

### `POST /api/v4/card_grants/:id/withdraw`
Remove funds from a card grant.

- **Auth:** Bearer token
- **Pundit:** `CardGrantPolicy#withdraw?`

| Param | Type | Required |
|-------|------|----------|
| `amount_cents` | integer | yes |

**Returns:** CardGrant object

### `POST /api/v4/card_grants/:id/cancel`
Cancel a card grant.

- **Auth:** Bearer token
- **Pundit:** `CardGrantPolicy#cancel?`

**Returns:** CardGrant object

### `POST /api/v4/card_grants/:id/activate`
Activate a card grant (creates Stripe card).

- **Auth:** Bearer token
- **Pundit:** `CardGrantPolicy#activate?`

**Returns:** CardGrant object

### `GET /api/v4/card_grants/:id/transactions`
List card grant's transactions.

- **Auth:** Bearer token
- **Pundit:** `CardGrantPolicy#show?`
- Pagination: standard

**Returns:** Paginated transaction objects

### CardGrant Object Schema
```json
{
  "id": "string (public_id)",
  "amount_cents": "integer",
  "merchant_lock": "boolean",
  "category_lock": "boolean",
  "keyword_lock": "boolean",
  "allowed_merchants": ["string"],
  "allowed_categories": ["string"],
  "purpose": "string",
  "one_time_use": "boolean",
  "pre_authorization_required": "boolean",
  "email": "string",
  "expires_on": "date",
  "status": "string (active | canceled | expired)",
  "card_id": "string | null (stripe card public_id)",

  // expand=balance_cents
  "balance_cents": "integer",

  // expand=user
  "user": { "...user object" },

  // expand=organization
  "organization": { "...org object" },

  // expand=disbursements
  "disbursements": [{ "...disbursement objects" }]
}
```

---

## Cards

### `GET /api/v4/user/cards`
List current user's cards.

- **Auth:** Bearer token
- **Pundit:** Skipped

### `GET /api/v4/organizations/:org_id/cards`
List organization's cards.

- **Auth:** Bearer token
- **Pundit:** `EventPolicy#card_overview_in_v4?`

### `GET /api/v4/cards/:id`
Get card details.

- **Auth:** Bearer token
- **Pundit:** `StripeCardPolicy#show?`

### `POST /api/v4/cards`
Create a new card.

- **Auth:** Bearer token
- **Pundit:** `EventPolicy#create_stripe_card?`

| Param (nested under `card`) | Type | Required | Notes |
|------------------------------|------|----------|-------|
| `organization_id` | string | yes | Event public_id or slug |
| `card_type` | string | yes | `"physical"` or `"virtual"` |
| `shipping_name` | string | physical only | |
| `shipping_address_line1` | string | physical only | |
| `shipping_address_line2` | string | no | |
| `shipping_address_city` | string | physical only | |
| `shipping_address_state` | string | physical only | |
| `shipping_address_postal_code` | string | physical only | |
| `shipping_address_country` | string | physical only | US only |
| `card_personalization_design_id` | string | no | |

**Returns:** Card object, status `201`

**Errors:**
- `400`: `"Birthday must be set before creating a card."` (if user has no birthday)
- `400`: `"Cards can only be shipped to the US."` (physical, non-US)
- `500`: `"internal_server_error"` (card creation failed)

### `POST /api/v4/cards/:id/freeze`
Freeze a card.
**Returns:** `{ success: "Card frozen!" }`
**Error:** `422` if card is canceled

### `POST /api/v4/cards/:id/defrost`
Unfreeze a card.
**Returns:** `{ success: "Card defrosted!" }`
**Error:** `422` if card already active

### `POST /api/v4/cards/:id/activate`
Activate a card.

| Param | Type | Required |
|-------|------|----------|
| `last4` | string | yes |

**Returns:** `{ success: "Card activated!" }`
**Errors:** `422` if last4 blank, incorrect, or card canceled

### `POST /api/v4/cards/:id/cancel`
Cancel a card.
**Returns:** `{ success: "Card cancelled successfully" }`
**Error:** `422` if already cancelled, `500` if cancellation fails

### `GET /api/v4/cards/:id/transactions`
List card's transactions.

| Param | Type | Required |
|-------|------|----------|
| `missing_receipts` | string (`"true"/"false"`) | no |

Pagination: standard

### `GET /api/v4/cards/card_designs`
List available card designs.
- **Pundit:** Skipped (or `EventPolicy#create_stripe_card?` if scoped to org)

### `POST /api/v4/cards/:id/ephemeral_keys`
Get Stripe ephemeral keys. **Requires trusted OAuth app.**

| Param | Type | Required |
|-------|------|----------|
| `nonce` | string | yes |
| `stripe_version` | string | no (default `"2020-03-02"`) |

**Error:** `403` if app not trusted; `400` if card not virtual

### Card Object Schema
```json
{
  "id": "string (public_id)",
  "created_at": "datetime",
  "type": "string (physical | virtual)",
  "status": "string (parameterized)",
  "name": "string",
  "last4": "string | null (only if activated)",
  "exp_month": "integer | null (only if activated)",
  "exp_year": "integer | null (only if activated)",

  // expand=total_spent_cents
  "total_spent_cents": "integer",

  // expand=balance_available
  "balance_available": "integer",

  // expand=organization
  "organization": { "...org object" },

  // expand=user
  "user": { "...user object" },

  // expand=last_frozen_by
  "last_frozen_by": { "...user object" },

  // Physical cards only:
  "personalization": { "color": "string", "logo_url": "url" },

  // Physical cards, if policy allows:
  "shipping": {
    "status": "string",
    "eta": "date",
    "address": { "line1": "string", "line2": "string", "city": "string", "state": "string", "country": "string", "postal_code": "string" }
  }
}
```

---

## Users

### `GET /api/v4/user`
Get current authenticated user.

- **Pundit:** `UserPolicy#show?`

**Returns:** User object (with PII since it's the current user)

### `POST /api/v4/user/revoke`
Revoke the current API token.

**Returns:**
```json
{ "success": true, "owner_email": "string", "key_name": "string | null" }
```

### `GET /api/v4/users/:id`
Get user by ID. **Admin only.**

- **Auth:** Scope `user_lookup`
- **Pundit:** `UserPolicy#show?`

### `GET /api/v4/users/by_email/:email`
Get user by email. **Admin only.**

- **Auth:** Scope `user_lookup`
- **Pundit:** `UserPolicy#show?`

### `GET /api/v4/user/available_icons`
Get user's available icon badges.

**Returns:** Object with boolean values (only `true` keys included):
```json
{ "frc": true, "admin": true, "platinum": true, "testflight": true, "hackathon_grant": true, "premium": true }
```

### User Object Schema
```json
{
  "id": "string (public_id)",
  "avatar": "url (configurable via ?avatar_size=N, default 24)",
  "admin": "boolean",
  "auditor": "boolean",
  "name": "string",

  // PII — included only if current_user == this user, or token has 'pii' scope + admin
  "email": "string",
  "birthday": "date",

  // expand=shipping_address
  "shipping_address": {
    "address_line1": "string | null", "address_line2": "string | null",
    "city": "string | null", "state": "string | null",
    "country": "string | null", "postal_code": "string | null"
  },

  // expand=billing_address
  "billing_address": { "...same shape as shipping_address" }
}
```

---

## Transfers & Payments

### `POST /api/v4/organizations/:org_id/transfers`
Create inter-organization transfer (disbursement).

- **Pundit:** `DisbursementPolicy#create?`

| Param | Type | Required |
|-------|------|----------|
| `to_organization_id` | string | yes |
| `name` | string | yes |
| `amount_cents` | integer | yes |

**Returns:** Disbursement object (see Transaction Type: `transfer`), status `201`

### `POST /api/v4/organizations/:org_id/ach_transfers`
Create ACH bank transfer.

- **Pundit:** `AchTransferPolicy#create?`
- **Limit:** Amount must not exceed sudo mode threshold

| Param (nested under `ach_transfer`) | Type | Required |
|--------------------------------------|------|----------|
| `routing_number` | string | yes |
| `account_number` | string | yes |
| `recipient_email` | string | yes |
| `bank_name` | string | yes |
| `recipient_name` | string | yes |
| `amount_money` | numeric | yes |
| `payment_for` | string | yes |
| `send_email_notification` | boolean | no |
| `invoiced_at` | date | no |
| `file` | file | no |
| `scheduled_on` | date | no (admin only) |

**Returns:** ACH transfer object, status `201`
**Error:** `400` if amount exceeds sudo threshold

### `POST /api/v4/organizations/:org_id/checks`
Create a check payment.

- **Pundit:** `IncreaseCheckPolicy#create?`
- **Limit:** Amount must not exceed sudo mode threshold

| Param (nested under `check`) | Type | Required |
|-------------------------------|------|----------|
| `memo` | string | yes |
| `amount_cents` | integer | yes |
| `payment_for` | string | yes |
| `recipient_name` | string | yes |
| `recipient_email` | string | yes |
| `address_line1` | string | yes |
| `address_line2` | string | no |
| `address_city` | string | yes |
| `address_state` | string | yes |
| `address_zip` | string | yes |
| `send_email_notification` | boolean | no |
| `file` | file | no |

**Returns:** Check object, status `201`
**Error:** `400` if amount exceeds sudo threshold

### `GET /api/v4/organizations/:org_id/checks`
List checks. **Pundit:** `EventPolicy#transfers_in_v4?`

### `GET /api/v4/checks/:id`
Get check details. **Pundit:** `IncreaseCheckPolicy#show?`

---

## Donations

### `POST /api/v4/organizations/:org_id/donations`
Record an in-person donation.

- **Pundit:** `DonationPolicy#create?`

| Param | Type | Required |
|-------|------|----------|
| `amount_cents` | integer | yes |
| `name` | string | no |
| `email` | string | no |
| `anonymous` | boolean | no |
| `tax_deductible` | boolean | no (default true) |
| `fee_covered` | boolean | no |

Note: Always creates as `in_person: true`. If `fee_covered` and org has `cover_donation_fees` config, amount is adjusted for fees.

**Returns:** Donation object, status `201`

### `POST /api/v4/organizations/:org_id/donations/payment_intent`
Create Stripe payment intent. **Requires trusted OAuth app.**

| Param | Type | Required |
|-------|------|----------|
| `amount_cents` | integer | yes |
| `fee_covered` | boolean | no |

**Returns:** `{ "payment_intent_id": "pi_..." }`, status `201`

---

## Invoices

### `GET /api/v4/organizations/:org_id/invoices`
List invoices. **Pundit:** `InvoicePolicy::Scope`

### `GET /api/v4/invoices/:id`
Get invoice details. **Pundit:** `InvoicePolicy#show?`

### `POST /api/v4/organizations/:org_id/invoices`
Create invoice.

| Param (nested under `invoice`) | Type | Required |
|---------------------------------|------|----------|
| `due_date` | datetime string | yes |
| `item_description` | string | yes |
| `item_amount` | numeric | yes |
| `sponsor_id` | string | yes (top-level, sponsor public_id) |

**Returns:** Invoice object, status `201`

### Invoice Object Schema
```json
{
  "id": "string",
  "status": "string",
  "created_at": "datetime",
  "to": "string (sponsor name)",
  "amount_due": "numeric",
  "memo": "string (policy-gated)",
  "due_date": "date (policy-gated)",
  "item_amount": "numeric (policy-gated)",
  "item_description": "string (policy-gated)",
  "sponsor_id": "string (policy-gated)"
}
```

---

## Receipts

### `GET /api/v4/organizations/:org_id/transactions/:txn_id/receipts`
List receipts for a transaction. **Pundit:** `HcbCodePolicy#show?`

### `GET /api/v4/receipts`
List current user's receipts from receipt bin. **Pundit:** Skipped

### `POST /api/v4/receipts`
Upload receipt to receipt bin.

| Param | Type | Required |
|-------|------|----------|
| `file` | file (multipart) | yes |

**Returns:** Receipt object, status `201`

### `POST /api/v4/organizations/:org_id/transactions/:txn_id/receipts`
Upload receipt to a transaction. **Pundit:** `ReceiptablePolicy#upload?`

### `DELETE /api/v4/receipts/:id`
Delete receipt. **Pundit:** `ReceiptPolicy#destroy?`

**Returns:** `{ "message": "Receipt successfully deleted" }`

### Receipt Object Schema
```json
{
  "id": "string (public_id)",
  "created_at": "datetime",
  "url": "string (download URL)",
  "preview_url": "string (preview URL)",
  "filename": "string",
  "uploader": { "...user object | null" }
}
```

---

## Tags

### `GET /api/v4/organizations/:org_id/tags`
List tags. **Pundit:** `EventPolicy#index_in_v4?`

### `GET /api/v4/tags/:id`
Get tag. **Pundit:** `TagPolicy#show?` (requires reader+ or auditor)

### `POST /api/v4/organizations/:org_id/tags`
Create tag. **Pundit:** `TagPolicy#create?` (requires member+)

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `label` | string | yes | Unique within org |
| `color` | string | yes | One of: muted, red, orange, yellow, green, cyan, blue, purple |
| `emoji` | string | no | |

**Returns:** Tag object, status `201`

### `DELETE /api/v4/tags/:id`
Delete tag. **Pundit:** `TagPolicy#destroy?` (requires member+)

**Returns:** `{ "message": "Tag successfully deleted" }`

### Tag Object Schema
```json
{
  "id": "string (public_id)",
  "label": "string",
  "color": "string",
  "emoji": "string",
  "created_at": "datetime"
}
```

---

## Comments

### `GET /api/v4/organizations/:org_id/transactions/:txn_id/comments`
List comments on a transaction. Non-auditors only see non-admin comments.

- **Pundit:** `CommentPolicy::Scope` (filters admin_only for non-auditors)

### `POST /api/v4/organizations/:org_id/transactions/:txn_id/comments`
Create comment on a transaction.

- **Pundit:** `CommentPolicy#create?` (auditor or event member; `admin_only` requires auditor)

| Param | Type | Required |
|-------|------|----------|
| `content` | string | yes |
| `admin_only` | boolean | no (default false) |
| `file` | file | no (max 10MB) |

**Returns:** Comment object, status `201`

### Comment Object Schema
```json
{
  "id": "string (public_id)",
  "created_at": "datetime",
  "user": { "...user object" },
  "content": "string (encrypted at rest)",
  "file": "url | absent",
  "admin_only": "boolean (only if true)"
}
```

---

## Sponsors

### `GET /api/v4/organizations/:org_id/sponsors`
List sponsors. **Pundit:** `SponsorPolicy#index?` (auditor or reader+)

### `GET /api/v4/sponsors/:id`
Get sponsor. **Pundit:** `SponsorPolicy#show?`

### `POST /api/v4/organizations/:org_id/sponsors`
Create sponsor. **Pundit:** `SponsorPolicy#create?` (admin or member+)

| Param (nested under `sponsor`) | Type | Required |
|---------------------------------|------|----------|
| `name` | string | yes |
| `contact_email` | string | no |
| `address_line1` | string | no |
| `address_line2` | string | no |
| `address_city` | string | no |
| `address_state` | string | no |
| `address_postal_code` | string | no |
| `address_country` | string | no |

**Returns:** Sponsor object, status `201`

### Sponsor Object Schema
```json
{
  "id": "string (public_id)",
  "name": "string",
  "contact_email": "string",
  "address_city": "string",
  "address_country": "string",
  "address_line1": "string",
  "address_line2": "string",
  "address_postal_code": "string",
  "address_state": "string",
  "slug": "string",
  "created_at": "datetime",
  "event_id": "string",
  "stripe_customer_id": "string | null"
}
```

---

## Invitations (Organizer Position Invites)

### `GET /api/v4/organizations/:org_id/invitations`
List pending invitations for an org. **Pundit:** `EventPolicy#index_in_v4?`

### `GET /api/v4/user/invitations`
List current user's pending invitations. **Pundit:** Skipped

### `GET /api/v4/invitations/:id`
Get invitation. **Pundit:** `OrganizerPositionInvitePolicy#show?` (auditor or recipient)

### `POST /api/v4/organizations/:org_id/invitations`
Send invitation. **Pundit:** `EventPolicy#can_invite_user?` (manager+)

| Param | Type | Required |
|-------|------|----------|
| `email` | string | yes |
| `role` | string | no |
| `enable_spending_controls` | boolean | no |
| `initial_control_allowance_amount` | integer | no |

**Returns:** Invitation object, status `201`

### `POST /api/v4/invitations/:id/accept`
Accept invitation. Must be the recipient.

**Returns:** Invitation object

### `POST /api/v4/invitations/:id/reject`
Reject invitation. Must be the recipient.

**Returns:** Invitation object

### `DELETE /api/v4/organizations/:org_id/invitations/:id`
Cancel invitation. **Pundit:** `OrganizerPositionInvitePolicy#destroy?` (admin/manager or sender)

**Returns:** `{ "message": "Invitation successfully deleted" }`

### Invitation Object Schema
```json
{
  "id": "string (public_id)",
  "created_at": "datetime",
  "accepted": "boolean",
  "sender": { "...user object" },
  "organization": { "...org object" },
  "role": "string"
}
```

---

## Check Deposits

### `GET /api/v4/organizations/:org_id/check_deposits`
List check deposits. **Pundit:** `EventPolicy#index_in_v4?`

### `GET /api/v4/check_deposits/:id`
Get check deposit. **Pundit:** `CheckDepositPolicy#show?`

### `POST /api/v4/organizations/:org_id/check_deposits`
Create check deposit.

| Param | Type | Required |
|-------|------|----------|
| `front` | file | yes |
| `back` | file | yes |
| `amount_cents` | integer | yes |

**Returns:** CheckDeposit object, status `201`

### CheckDeposit Object Schema
```json
{
  "id": "string (public_id, cdp prefix)",
  "status": "string (parameterized)",
  "amount_cents": "integer",
  "created_at": "datetime",
  "updated_at": "datetime",
  "rejection": { "reason": "string", "description": "string" },
  "estimated_arrival_date": "date | null",
  "front_url": "url | null (policy-gated)",
  "back_url": "url | null (policy-gated)",
  "submitter": { "...user object | null" }
}
```

---

## Fallout Integration Notes

For Fallout's use case (org-level, issue grants + read balances/transactions):
- **Scopes needed:** `read` + restricted scopes `organizations:read`, `card_grants:write`
- **Key endpoints:** org details w/ balance, transactions list, card grant CRUD
- **Token refresh:** Must refresh before 2-hour expiry — job runs hourly
- **Single connection:** One HCB account for the whole program, stored in dedicated model (not User)
