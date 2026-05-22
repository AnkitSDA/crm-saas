# CRM v1.1 — Deployment Runbook (Phase 1)

This guide walks through deploying the new features end-to-end. **Do the steps in order.** Steps 1 and 2 are reversible; step 3 (DB migration) is forward-only, so do it during a quiet hour.

---

## What's changing

| Area | Change |
|---|---|
| Backend | New `ALLOWED_ORIGINS` env-driven CORS, required `JWT_SECRET`, new `/tenant` router, rewritten `/webhooks/form` (uses `api_key` instead of `site_id`), filters + analytics endpoints on `/leads` |
| Database | New `tenants.api_key` column (backfilled), 9 new attribution columns on `leads`, indexes |
| Frontend | New `/settings` page, updated `/leads` page (filters, search, CSV export, UTM column), updated `/dashboard` (source + campaign breakdown), `/` redirects properly |
| WordPress | New CF7 webhook PHP snippet + UTM-capture JS |

---

## Step 1 — Set environment variables

### On Render (backend)

Go to your service → Environment → add/update these:

```
DATABASE_URL=postgresql://...        # already set
JWT_SECRET=<generate a long random string>   # MUST set, no fallback anymore
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://app.yourcrm.com
ENV=production
META_VERIFY_TOKEN=<your-meta-token>  # optional, only if you use Meta lead ads
```

Generate a JWT_SECRET:
```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

### On Vercel (frontend)

Settings → Environment Variables → add:

```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

> The `NEXT_PUBLIC_` prefix is required for it to be readable in the browser. Set it for Production, Preview, and Development.

---

## Step 2 — Run the database migration

Open **Supabase → SQL Editor**, paste the contents of `migrations/001_api_key_and_utm.sql`, and run it.

What it does:
1. Adds `api_key` column to `tenants`, backfills random keys for all existing tenants
2. Adds 9 attribution columns to `leads` (all nullable, no data lost)
3. Adds indexes for performance

After it runs, get your client's API key:
```sql
SELECT name, slug, api_key FROM tenants;
```
You'll need the `api_key` for the WordPress step.

---

## Step 3 — Deploy backend code

Copy these files over your existing backend, then push to your Render-connected git repo:

```
backend/main.py
backend/models.py
backend/deps.py
backend/routers/auth.py
backend/routers/leads.py
backend/routers/webhooks.py
backend/routers/tenant.py          # NEW file
```

After deploy, smoke test:
```bash
curl https://your-backend.onrender.com/
# -> {"status":"CRM backend is live","version":"1.1.0"}
```

---

## Step 4 — Deploy frontend code

Copy these files over the existing frontend:

```
frontend/app/page.tsx              # was Next.js boilerplate
frontend/app/dashboard/page.tsx
frontend/app/leads/page.tsx
frontend/app/settings/page.tsx     # NEW file
```

Push to git → Vercel auto-deploys.

Log in as the client tenant and visit `/settings` — you should see the API key.

---

## Step 5 — Connect WordPress (Contact Form 7)

On the client's WordPress site:

### 5a. Install plugins
- **Contact Form 7** (probably already installed)
- **Code Snippets** by Code Snippets Pro — lets you run PHP without editing theme files

### 5b. Add the PHP snippet
1. WP Admin → Snippets → Add New
2. Title: "CRM Webhook"
3. Paste contents of `wordpress/crm-cf7-webhook.php`
4. **Edit the two lines at the top:**
   ```php
   define('CRM_WEBHOOK_URL', 'https://your-backend.onrender.com/webhooks/form');
   define('CRM_API_KEY',     'crm_THE_KEY_FROM_SETTINGS_PAGE');
   ```
5. Set "Run snippet everywhere" → Save & Activate

### 5c. Update the CF7 form
WP Admin → Contact → Contact Forms → edit the form on the landing page.

In the **Form** tab, make sure these field names exist (CF7 default names shown — change the PHP snippet if you use different ones):

```
[text* your-name]
[tel  your-phone]
[email your-email]
[textarea your-message]
```

Then add these hidden fields at the bottom:

```
[hidden utm_source]
[hidden utm_medium]
[hidden utm_campaign]
[hidden utm_term]
[hidden utm_content]
[hidden gclid]
[hidden fbclid]
[hidden landing_page]
[hidden referrer]
```

Save the form.

### 5d. Add the UTM capture JS
Choose one method:

**Method A — Theme child folder** (recommended for performance):
- Upload `wordpress/crm-utm-capture.js` to `wp-content/themes/<your-child-theme>/js/`
- Add this PHP to Code Snippets (same plugin as above):
  ```php
  add_action('wp_enqueue_scripts', function() {
    wp_enqueue_script(
      'crm-utm',
      get_stylesheet_directory_uri() . '/js/crm-utm-capture.js',
      array(), '1.0', true
    );
  });
  ```

**Method B — Insert Headers and Footers plugin** (simpler):
- Install plugin "WPCode" or "Insert Headers and Footers"
- Paste the JS inside a `<script>` tag in the **footer** section
- Save

### 5e. Test end-to-end
1. Visit the landing page with test UTM params:
   ```
   https://clientsite.com/landing?utm_source=google&utm_campaign=test_campaign&gclid=TEST123
   ```
2. Open browser DevTools → Application → Cookies. Confirm `crm_attr` cookie exists with the values.
3. Right-click the form → Inspect. Confirm the hidden inputs (`utm_source`, `gclid`, etc.) have values filled in.
4. Submit the form with a test name/phone/email.
5. Go to the CRM → Leads page. The new lead should appear within ~5 seconds with:
   - Source = "Google Ads" (because `gclid` was present)
   - A small green "gclid" badge next to the name
   - UTM Campaign = "test_campaign"

If nothing appears:
- WP Admin → Tools → Site Health → Info → check for PHP errors
- Render dashboard → Logs → look for `/webhooks/form` requests
- Confirm CORS isn't the issue (CF7 sends server-to-server, so CORS doesn't apply — but if you see CORS errors, check `ALLOWED_ORIGINS` is set correctly)

---

## Step 6 — Configure Google Ads URL templates (optional but powerful)

In Google Ads → Settings → Account-level URL options → Tracking template:

```
{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}&utm_term={keyword}&gclid={gclid}
```

Now every click from Google Ads to the landing page will carry full attribution, which the JS captures into the cookie, which gets written into the form, which lands in the CRM. End-to-end traceability.

---

## Smoke test checklist

- [ ] `https://backend/` returns version 1.1.0
- [ ] Login still works for existing user
- [ ] `/settings` page shows the API key
- [ ] Regenerate Key button creates a new key and old key stops working
- [ ] Dashboard shows the Lead Sources card
- [ ] Leads page filters and search work
- [ ] CSV export downloads a valid CSV
- [ ] WordPress form submission creates a lead in <5 sec
- [ ] Lead from `?gclid=...` URL shows `gclid` badge and `source = google_ads`

---

## Rolling back

If something breaks:

1. **Backend:** revert the git commit on Render
2. **Frontend:** revert the git commit on Vercel
3. **Database:** the new columns are nullable and the old code ignores them — they cause no harm. Only roll back the DB if you regret adding the `api_key` column, which would require `ALTER TABLE tenants DROP COLUMN api_key`.

---

## What's NOT in this release (planned for Phase 2)

- Team members + invitations
- Per-lead activity timeline
- Lead detail page
- Email notifications on new lead
- WhatsApp notifications (needs API choice: Twilio, WhatsApp Cloud API, or Interakt — let me know which)
- Google Ads offline conversions push (when a lead is marked "won", report the conversion back to Google via the `gclid`)
- Meta Lead Ads webhook full implementation
- Two-factor auth for admins
