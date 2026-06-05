# Skill Seekers CRM backend — Supabase (free, permanent data)

Data lives in a free Supabase Postgres database, so it survives any
Render restart, redeploy, or sleep. No paid disk needed.

## A) Create the free database (Supabase)
1. Go to supabase.com -> Sign up (free).
2. Click "New project". Give it a name, set a strong database password
   (save it!), pick a region near India (e.g. Singapore). Create.
3. Wait ~2 min for it to provision.
4. Left menu -> Project Settings (gear) -> Database.
5. Find "Connection string" -> choose the "URI" tab. It looks like:
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres
6. Copy it and replace [YOUR-PASSWORD] with the password you set in step 2.
   (Tip: if it offers a "Connection pooling" / "Transaction" string on
   port 6543, that also works and is fine for Render.)

## B) Tell Render to use it
1. Render -> your service -> Environment.
2. Add a variable:
   - Key:   DATABASE_URL
   - Value: the full connection string from step A6
3. Make sure these also exist:
   - JWT_SECRET = a long random string
   - CRM_ORIGIN = https://crm.skillseekers.in   (your CRM address)
4. You can DELETE the old DB_PATH variable (no longer used).
5. Save. Render redeploys.

## C) Update the code on GitHub
Replace these two files in your repo with the new versions, then
Render -> Manual Deploy -> Deploy latest commit:
   - server.js
   - package.json

## D) Verify
- Visit  https://YOUR-RENDER-URL/api/health  -> {"ok":true}
- Open the CRM, log in as admin / admin123 (auto-seeded).
- Create a user, then Render -> Manual Deploy -> Deploy latest commit.
- After it restarts, the user is STILL THERE = data is now permanent.

## Notes
- First login after idle still takes ~30s on Render free tier (server
  waking). The database itself never sleeps.
- Back up anytime from the CRM: Manage Users -> Backup data.
- Supabase free tier pauses a project after ~1 week of zero activity;
  daily team use keeps it active. If it ever pauses, open the Supabase
  dashboard and click "Restore/Resume".
