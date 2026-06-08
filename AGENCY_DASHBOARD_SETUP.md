# Agency Dashboard — Setup Guide

Ek hi login se SAARE clients track karo + 1-click naya client onboard karo.
Sab free tier pe chalega. Order important hai — **migration pehle, code baad mein**.

---

## Files is bundle mein
```
backend/routers/admin.py          (NEW — agency endpoints)
migrations/004_agency.sql         (NEW — run in Supabase)
frontend/app/agency/page.tsx      (NEW — agency dashboard UI)
frontend/app/login/page.tsx       (UPDATED — super_admin ko /agency bhejta hai)
```

---

## STEP 1 — Migration chalao (Supabase)
Supabase → SQL Editor → `migrations/004_agency.sql` ka content paste karo → **Run**.
(Yeh `monthly_rate` column add karta hai tenants mein.)

## STEP 2 — Apna Agency login banao
1. CRM pe `/register` kholo → ek account banao, e.g.
   - Business name: `Brandbanalo`
   - Email: `agency@brandbanalo.co.in`
   - Password: (apna)
2. Supabase → SQL Editor mein yeh chalao (apna email daalo):
   ```sql
   UPDATE users SET role = 'super_admin' WHERE email = 'agency@brandbanalo.co.in';
   ```

## STEP 3 — models.py mein 1 line add karo
`backend/models.py` → `class Tenant` ke andar (baaki columns ke saath) yeh line add karo:
```python
    monthly_rate = Column(Float, default=3500)
```
(`Float` already imported hai — deal_value bhi Float use karta hai.)

## STEP 4 — main.py mein admin router register karo (2 lines)
`backend/main.py` mein:
- jahan baaki routers import hote hain, wahan `admin` add karo:
  ```python
  from routers import auth, leads, webhooks, tenant, admin
  ```
- jahan `app.include_router(...)` likha hai, ek line aur:
  ```python
  app.include_router(admin.router)
  ```

## STEP 5 — admin.py file daalo
`backend/routers/admin.py` ko apne backend ke `routers/` folder mein copy karo.

## STEP 6 — Backend deploy
```
git add .
git commit -m "Add agency dashboard (admin router + monthly_rate)"
git push origin main
```
Render auto-deploy karega. Logs mein "Build successful" aaye → done.

## STEP 7 — Frontend deploy
- `frontend/app/agency/page.tsx` daalo (naya folder `agency`)
- `frontend/app/login/page.tsx` replace karo
```
git add .
git commit -m "Agency dashboard UI + role-based login routing"
git push origin main
```
Vercel auto-deploy.

## STEP 8 — Test
1. Logout → `agency@brandbanalo.co.in` se login karo
2. Seedha **/agency** khulega → Agency Dashboard
3. "+ Add Client" dabao → business name + email + password + rate daalo
4. Client ban jayega + API key/webhook/login details mil jayengi (copy karke handover)
5. Client us email/password se login karega → uska apna dashboard dikhega (sirf uska data)

---

## Kya milta hai
- **6 KPI cards**: total clients, leads, won, MRR (sum of rates), ad spend, blended ROAS
- **Clients table**: har client ke leads/won/revenue/spend/ROAS/rate/status
- **View** → drill-in: sources, API key + webhook, recent leads
- **+ Add Client** → 1-click onboarding (tenant + login + api_key)

## Zaroori
- Migration (Step 1) deploy se PEHLE chalao, warna `monthly_rate` errors aayenge.
- Sirf `super_admin` role wala account /agency dekh sakta hai. Clients ko kabhi
  super_admin mat banao — woh sabka data dekh lenge.
- Sab free tier pe chalta hai. Koi nayi paid cheez nahi.
