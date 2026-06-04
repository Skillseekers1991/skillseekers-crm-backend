# Skill Seekers CRM — shared backend setup

This makes your whole team share the same data. One server + one database;
every device (admin, recruiters, coordinators) connects to it.

You deploy this once, then paste its URL into the CRM's login screen
(⚙ Server connection). After that, everyone logs in and sees the same data.

---

## What you need
- A free **Render** account (render.com) — easiest. (Railway/VPS also work.)
- A **GitHub** account (to hold the code Render deploys).
- 15 minutes.

---

## Step 1 — Put this folder on GitHub
1. Create a new GitHub repo (e.g. `skillseekers-crm-backend`).
2. Upload these files: `server.js`, `package.json`, `.env.example`, `.gitignore`.
   (Do NOT upload `.env` or `crm.db`.)

## Step 2 — Deploy on Render
1. Render → **New → Web Service** → connect your repo.
2. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
3. Add a **Disk** (so the database survives restarts):
   - Render → your service → *Disks* → Add Disk
   - Mount path: `/var/data`  ·  Size: 1 GB is plenty
4. Add **Environment variables** (from `.env.example`):
   - `JWT_SECRET` = a long random string (mash your keyboard)
   - `DB_PATH` = `/var/data/crm.db`   ← important, points DB at the disk
   - `CRM_ORIGIN` = `*` (or later, your CRM's exact URL)
5. Deploy. You'll get a URL like `https://skillseekers-crm.onrender.com`.
6. Visit `https://YOUR-URL/api/health` — it should show `{"ok":true}`.

> On first start the server seeds a default admin: **admin / admin123**.
> Change this password after logging in (Manage Users → Edit).

## Step 3 — Host the CRM page
Host `recruitment-crm.html` (rename to `index.html`) anywhere — Netlify Drop,
GitHub Pages, Vercel, or your own domain. (See the simple hosting note your
developer or the chat provided.)

## Step 4 — Connect the CRM to the server
1. Open the hosted CRM.
2. On the login screen click **⚙ Server connection**.
3. Paste your backend URL (e.g. `https://skillseekers-crm.onrender.com`) → **Save & use this server**.
4. The page reloads in shared mode. Log in with **admin / admin123**.
5. Create your recruiters/coordinators in Manage Users — each gets a login that
   works from any device. Everyone now shares the same live data.

Every device must do Step 4 once (paste the same URL). After that it's remembered.

---

## How it works / notes
- **Auth:** passwords are hashed (bcrypt); logins issue a 30-day token. When you
  add or edit a user in the CRM, the server creates/updates their login and
  hashes the password automatically.
- **Roles:** the server trusts its own stored role for each user; the "users"
  list can only be written by admin/leader.
- **Database:** SQLite file on the Render disk. Easy and reliable for a team.
  To back up, download the `crm.db` file from the disk. If you later outgrow it,
  the same API can be moved to PostgreSQL.
- **This-device-only mode:** if you leave the server URL blank, the CRM still
  works standalone using browser storage (no sharing) — handy for a quick demo.
- **Render free tier** sleeps after inactivity; the first request after idle
  takes ~30s to wake. Paid tier ($7/mo) stays awake.

## Security checklist
- Set a strong `JWT_SECRET`.
- Change the default admin password immediately.
- Once your CRM has a fixed URL, set `CRM_ORIGIN` to that exact URL (not `*`).
- Use HTTPS (Render gives you this automatically).
