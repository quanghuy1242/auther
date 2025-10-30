## 1. `user`

You already have this from Better Auth.

**Why you need it:**
Ownership. Every webhook endpoint belongs to a user (or account/org/tenant if you go multi-tenant later).

**Core columns (you already have):**

* `id`
* `email`
* `name`
* plus any `plan` or tier if you want to gate access to webhooks

**Used by which screen:**

* Not shown directly on either of the two screens, but everything below links back to `user.id`.

---

## 2. `webhook_endpoint`

**What it represents:**
A single destination where you send notifications (one row per URL the user registers).

**Example important columns:**

* `id`: primary key for the endpoint
* `userId`: which user this endpoint belongs to
* `displayName`: "Production Endpoint", "Staging", "Local Dev", etc.
* `url`: where to POST
* `secret`: signing secret (store hashed if you want security)
* `isActive`: boolean
* `createdAt`, `updatedAt`
* `retryPolicy`, `deliveryFormat`, `requestMethod`

  * these map 1:1 to the "Advanced Options" section in your UI:

    * Retry Policy dropdown
    * Delivery Format (JSON / form-encoded)
    * Request Method (POST / PUT / etc.)

**What functionality it supports:**

* Create new webhook (Register New Webhook screen)
* Edit name/URL/status/secret/etc.
* Regenerate secret (one-time reveal)
* Disable/enable (the toggle in your UI)
* Delete

**Which parts of the UI it powers:**

* Overview table rows: Name, URL, Status, Created At
* “Add webhook” button creates a new `webhook_endpoint`
* The main form fields in Register/Edit:

  * Display name
  * Webhook URL
  * Secret (and regenerate)
  * Status toggle
  * Advanced options (method / retry / format)

---

## 3. `webhook_subscription`

**What it represents:**
Which event types this endpoint wants to receive.

You want an endpoint to be able to subscribe to multiple event types. This is many-to-many: one endpoint → many event types.

**Example important columns:**

* `id`
* `endpointId` → FK to `webhook_endpoint.id`
* `eventType`: string like `"order.created"`, `"order.paid"`, `"stock.low"`, etc.
* `createdAt`
* a unique index on (`endpointId`, `eventType`) so they can’t subscribe twice to the same event

**What functionality it supports:**

* The chips / checkboxes in “Event subscriptions” on the Register/Edit screen.
* Letting the user toggle which events they want.
* Filtering which endpoints get notified when an event fires.

**Which parts of the UI it powers:**

* In the overview table, under “EVENTS”, you display those eventType badges.
* In the Register Webhook form, the row of selectable chips (`order.created`, `order.paid`, etc.).

---

## 4. `webhook_event`

**What it represents:**
A record that “an event happened in the system.”

Every time your backend says “user.updated” or “order.created,” you insert one row here.

**Example important columns:**

* `id`: event id
* `userId`: which user this event belongs to (so you only deliver to that user’s endpoints)
* `type`: `"order.created"`, etc.
* `payload`: JSON string of the event data at the moment it happened (snapshot)
* `createdAt`: when it happened

**What functionality it supports:**

* Powers delivery logs/history.
* Lets you resend/replay later.
* Gives you something to show in debugging views (“this event existed, you just didn’t accept it because endpoint was inactive”).

**Which parts of the UI it powers:**

* The “Delivery Success Rate (Last 7 Days)” graph and trend on the Overview screen uses aggregated info from here + deliveries (below).
* Also used behind the scenes to build per-endpoint “recent deliveries.”

This table itself is not edited in the UI. It’s write-only from your system.

---

## 5. `webhook_delivery`

**What it represents:**
A specific attempt to send one `webhook_event` to one `webhook_endpoint`.

There will be:

* 1 `webhook_event`
* fanned out to N endpoints via N rows in `webhook_delivery`.

**Example important columns:**

* `id`
* `eventId` → FK to `webhook_event.id`
* `endpointId` → FK to `webhook_endpoint.id`
* `status`: `"pending" | "success" | "failed" | "retrying" | "dead"`
* `attemptCount`: how many times you’ve tried
* `responseCode`: HTTP status you got back (e.g. 200, 500, 404…)
* `responseBody`: trimmed response, for debugging
* `durationMs`: request time
* `lastAttemptAt`
* `createdAt`

**What functionality it supports:**

* Calculating success rate and trend % for the Overview header card.
* Showing “Last delivery: 2 mins ago / failed / 500” in the table row next to each endpoint.
* Eventually: “Send sample payload now,” “Retry,” and “Notify me via email/Slack if failures keep happening.”

**Which parts of the UI it powers:**

* In Overview table:

  * `LAST DELIVERY` column (2 mins ago, 1 hour ago, N/A)
  * success/failure status chips
* In future detailed view / modal per endpoint:

  * Delivery log timeline (each attempt, response code, etc.)
* In metrics card at top:

  * “Delivery success rate (Last 7 Days) 98.8%”

---

## How everything maps to your two screens

### Screen 1: Webhook Overview Screen

Needs data from:

* `webhook_endpoint`

  * name, url, status, createdAt
* `webhook_subscription`

  * which events each endpoint is listening to
* `webhook_delivery`

  * last delivery status/timestamp per endpoint
* `webhook_delivery` (+ `webhook_event`)

  * aggregate success rate over last 7 days

Actions on this screen:

* Add webhook → creates a new `webhook_endpoint`
* Toggle active/inactive → updates `webhook_endpoint.isActive`
* View last delivery result → read from `webhook_delivery`
* Filter by Active/Inactive → query `webhook_endpoint.isActive`

Future actions:

* Click an endpoint row → see past deliveries (`webhook_delivery` joined with `webhook_event`)

---

### Screen 2: Register / Edit Webhook

Needs data from:

* `webhook_endpoint`

  * webhook URL, secret (show-once), retry policy, request method,
    delivery format, status, etc.
* `webhook_subscription`

  * which event types are checked for this endpoint

Actions on this screen:

* Save new webhook → insert into `webhook_endpoint`
* Set events → insert into / delete from `webhook_subscription`
* Regenerate secret → update `webhook_endpoint.secret`
* Disable webhook → update `webhook_endpoint.isActive`
* Advanced options → update `webhook_endpoint.retryPolicy`, etc.
* Send test delivery → create a synthetic `webhook_event`, then insert `webhook_delivery` rows and fire them


## Store secret in database
1. You generate a symmetric encryption key (server secret).
    - This can live in env/secret manager: BETTER_AUTH_SECRET.
2. When a user creates a webhook endpoint:
    - You generate a random per-endpoint secret, e.g. whsec_....
    - You encrypt it with your symmetric key.
    - You store the ciphertext in DB (e.g. encrypted_secret column).
3. When delivering a webhook:
    - Server loads the row for that endpoint.
    - Decrypts encrypted_secret in memory.
    - Uses the plaintext to compute HMAC signature header.
    - Sends request.
    - Immediately discards plaintext from memory.
