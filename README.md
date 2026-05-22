# CRM v1.1 — Phase 1 Files

All the files below are drop-in replacements or new additions to your existing project. **Start with `DEPLOYMENT.md`** — it walks you through the order.

## File map (where each file goes in your repo)

```
your-repo/
├── backend/
│   ├── main.py                       [REPLACE]
│   ├── models.py                     [REPLACE]
│   ├── deps.py                       [REPLACE]
│   └── routers/
│       ├── auth.py                   [REPLACE]
│       ├── leads.py                  [REPLACE]
│       ├── webhooks.py               [REPLACE]
│       └── tenant.py                 [NEW FILE]
│
└── frontend/
    └── app/
        ├── page.tsx                  [REPLACE — was Next.js boilerplate]
        ├── dashboard/page.tsx        [REPLACE]
        ├── leads/page.tsx            [REPLACE]
        └── settings/page.tsx         [NEW FILE — new route]
```

## Database

`migrations/001_api_key_and_utm.sql` — run once in Supabase SQL Editor.

## WordPress

`wordpress/crm-cf7-webhook.php` — PHP snippet (Code Snippets plugin)
`wordpress/crm-utm-capture.js` — JS that captures UTM/gclid from URL

## Quick-start order

1. Read `DEPLOYMENT.md`
2. Set env vars on Render (`JWT_SECRET`, `ALLOWED_ORIGINS`) and Vercel (`NEXT_PUBLIC_API_URL`)
3. Run the SQL migration in Supabase
4. Push backend changes (Render auto-deploys)
5. Push frontend changes (Vercel auto-deploys)
6. Get the api_key from the new Settings page → paste into WordPress snippet
7. Add hidden fields to the CF7 form + enqueue the JS
8. Test with a `?gclid=TEST` URL

## What you need to tell me for Phase 2

- WhatsApp provider preference (Twilio / WhatsApp Cloud API / Interakt / Gallabox)
- Email sending provider (Resend / SendGrid / SES — Resend is easiest)
- Do you want team-member invites via email link, or admin manually creates users?
