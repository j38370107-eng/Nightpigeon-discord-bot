# NightPigeon — Self-Hosting Guide

This guide covers everything you need to run NightPigeon on your own infrastructure. Choose the hosting method that fits you best.

---

## Table of Contents

1. [Step 0 — Create a Discord Application](#step-0--create-a-discord-application)
2. [Option A — Local Machine / Linux VPS](#option-a--local-machine--linux-vps)
3. [Option B — Railway](#option-b--railway)
4. [Option C — Render](#option-c--render)
5. [Step — Finish Discord OAuth Setup](#step--finish-discord-oauth-setup)
6. [Step — Invite the Bot to Your Server](#step--invite-the-bot-to-your-server)
7. [Environment Variable Reference](#environment-variable-reference)
8. [Generating a SESSION_SECRET](#generating-a-session_secret)
9. [Required Bot Permissions & Intents](#required-bot-permissions--intents)
10. [Troubleshooting](#troubleshooting)

---

## Step 0 — Create a Discord Application

This is required for **all** hosting methods.

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
2. Give it a name (e.g. `NightPigeon`) and click **Create**
3. Under the **Bot** tab:
   - Click **Add Bot** → confirm
   - Copy the **Bot Token** (click **Reset Token** if needed) — save it somewhere safe
   - Enable all three **Privileged Gateway Intents**:
     - ✅ Server Members Intent
     - ✅ Message Content Intent
     - ✅ Presence Intent
4. Under **OAuth2 → General**:
   - Copy your **Client ID**
   - Copy your **Client Secret**
   - You will add a Redirect URI here **after** you know your dashboard's public URL — see [Finish Discord OAuth Setup](#step--finish-discord-oauth-setup)

---

## Option A — Local Machine / Linux VPS

Best for: self-hosters who want full control, or developers running the bot locally.

### Prerequisites

- **Node.js 20+** — [https://nodejs.org](https://nodejs.org)
- **pnpm** — `npm install -g pnpm` (or `corepack enable`)
- **PostgreSQL 14+** — [https://www.postgresql.org/download](https://www.postgresql.org/download)
- Git

### 1. Install PostgreSQL (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

Create the database and user:

```bash
sudo -u postgres psql
```

Inside the psql prompt:

```sql
CREATE USER nightpigeon WITH PASSWORD 'yourpassword';
CREATE DATABASE nightpigeon OWNER nightpigeon;
\q
```

Your `DATABASE_URL` will be:
```
postgresql://nightpigeon:yourpassword@localhost:5432/nightpigeon
```

### 2. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/nightpigeon.git
cd nightpigeon
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Create Environment Files

Create `.env` in the project root (it is gitignored):

```env
# Bot
DISCORD_BOT_TOKEN=your_bot_token_here
DATABASE_URL=postgresql://nightpigeon:yourpassword@localhost:5432/nightpigeon
PORT=3000

# Dashboard
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
SESSION_SECRET=your_random_secret_here
DASHBOARD_URL=http://localhost:5000
BOT_API_URL=http://localhost:3000
DASHBOARD_PORT=5000
NODE_ENV=development
```

> See [Generating a SESSION_SECRET](#generating-a-session_secret) for how to create a secure random string.

### 5. Push the Database Schema

```bash
pnpm --filter @workspace/db run push
```

### 6. Run the Bot and Dashboard

Open **two terminals**:

**Terminal 1 — Bot API server:**
```bash
pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Dashboard:**
```bash
DASHBOARD_PORT=5000 pnpm --filter @workspace/dashboard run dev
```

The dashboard will be available at `http://localhost:5000`.

### 7. (Optional) Run as a Background Service with systemd

Create `/etc/systemd/system/nightpigeon-bot.service`:

```ini
[Unit]
Description=NightPigeon Bot
After=network.target postgresql.service

[Service]
Type=simple
User=YOUR_LINUX_USER
WorkingDirectory=/path/to/nightpigeon/bot
ExecStart=/usr/bin/node --enable-source-maps ./dist/index.mjs
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=DISCORD_BOT_TOKEN=your_bot_token
Environment=DATABASE_URL=postgresql://nightpigeon:yourpassword@localhost:5432/nightpigeon

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/nightpigeon-dashboard.service`:

```ini
[Unit]
Description=NightPigeon Dashboard
After=network.target postgresql.service

[Service]
Type=simple
User=YOUR_LINUX_USER
WorkingDirectory=/path/to/nightpigeon/dashboard
ExecStart=/usr/bin/node --enable-source-maps ./dist/server/index.mjs
Restart=always
RestartSec=5
Environment=DASHBOARD_PORT=5000
Environment=DATABASE_URL=postgresql://nightpigeon:yourpassword@localhost:5432/nightpigeon
Environment=DISCORD_CLIENT_ID=your_client_id
Environment=DISCORD_CLIENT_SECRET=your_client_secret
Environment=SESSION_SECRET=your_random_secret
Environment=DASHBOARD_URL=https://yourdomain.com
Environment=DISCORD_BOT_TOKEN=your_bot_token
Environment=BOT_API_URL=http://localhost:3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Build both apps first, then enable the services:

```bash
# Build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/dashboard run build

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable nightpigeon-bot nightpigeon-dashboard
sudo systemctl start nightpigeon-bot nightpigeon-dashboard

# Check status
sudo systemctl status nightpigeon-bot
sudo systemctl status nightpigeon-dashboard
```

### 8. (Optional) Reverse Proxy with Nginx

If you have a domain and want HTTPS, install Nginx and Certbot:

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

Create `/etc/nginx/sites-available/nightpigeon`:

```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it and get an SSL certificate:

```bash
sudo ln -s /etc/nginx/sites-available/nightpigeon /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo systemctl restart nginx
```

---

## Option B — Railway

Best for: low-maintenance cloud hosting with a free tier and automatic deploys.

### 1. Create a Railway Account

Sign up at [https://railway.app](https://railway.app). Connect your GitHub account.

### 2. Create a PostgreSQL Database

1. New project → **Add a service** → **Database** → **PostgreSQL**
2. Once created, open the database → **Connect** tab → copy the **DATABASE_URL**

### 3. Deploy the Bot

1. **New service** → **GitHub Repo** → select your fork of NightPigeon
2. Under **Settings**:
   - **Root Directory:** `bot`
   - **Build Command:** `corepack enable && pnpm install && pnpm run build`
   - **Start Command:** `pnpm run start`
3. Under **Variables**, add:

   | Key | Value |
   |-----|-------|
   | `DISCORD_BOT_TOKEN` | Your bot token |
   | `DATABASE_URL` | PostgreSQL URL from step 2 |
   | `PORT` | `3000` |

4. **Deploy** — Railway will build and start the bot automatically.
5. Copy the generated public URL (e.g. `https://nightpigeon-bot.up.railway.app`) — this is your `BOT_API_URL`.

### 4. Deploy the Dashboard

1. In the same Railway project → **New service** → **GitHub Repo** → same repo
2. Under **Settings**:
   - **Root Directory:** `dashboard`
   - **Build Command:** `corepack enable && pnpm install && pnpm run build`
   - **Start Command:** `pnpm run start`
3. Under **Variables**, add:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Same PostgreSQL URL from step 2 |
   | `DISCORD_CLIENT_ID` | Your client ID |
   | `DISCORD_CLIENT_SECRET` | Your client secret |
   | `SESSION_SECRET` | Random string (see [below](#generating-a-session_secret)) |
   | `DASHBOARD_URL` | This service's public URL (set after first deploy) |
   | `DISCORD_BOT_TOKEN` | Your bot token |
   | `BOT_API_URL` | Bot service URL from step 3 |
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |

4. **Deploy** — copy the dashboard's public URL (e.g. `https://nightpigeon-dash.up.railway.app`)
5. Update `DASHBOARD_URL` to this URL

---

## Option C — Render

Best for: teams who want a managed platform with automatic deploy previews.

### 1. Create a Render Account

Sign up at [https://render.com](https://render.com). Connect your GitHub account.

### 2. Create a PostgreSQL Database

1. Dashboard → **New → PostgreSQL**
2. Name it (e.g. `nightpigeon-db`) and choose a plan (free tier available)
3. After creation, copy the **External Database URL** — you'll use this for both services

### 3. Deploy the Bot

1. **New → Web Service** → connect your GitHub repo
2. Settings:

   | Field | Value |
   |-------|-------|
   | **Root Directory** | `bot` |
   | **Runtime** | Node |
   | **Build Command** | `corepack enable && pnpm install && pnpm run build` |
   | **Start Command** | `pnpm run start` |

3. Environment variables:

   | Key | Value |
   |-----|-------|
   | `DISCORD_BOT_TOKEN` | Your bot token |
   | `DATABASE_URL` | PostgreSQL URL from step 2 |
   | `PORT` | `3000` |

4. **Deploy** — copy the service URL (e.g. `https://nightpigeon-bot.onrender.com`). This is your `BOT_API_URL`.

### 4. Deploy the Dashboard

1. **New → Web Service** → connect the same repo
2. Settings:

   | Field | Value |
   |-------|-------|
   | **Root Directory** | `dashboard` |
   | **Runtime** | Node |
   | **Build Command** | `corepack enable && pnpm install && pnpm run build` |
   | **Start Command** | `pnpm run start` |

3. Environment variables:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Same PostgreSQL URL from step 2 |
   | `DISCORD_CLIENT_ID` | Your client ID |
   | `DISCORD_CLIENT_SECRET` | Your client secret |
   | `SESSION_SECRET` | Random string (see [below](#generating-a-session_secret)) |
   | `DASHBOARD_URL` | This service's URL (e.g. `https://nightpigeon-dash.onrender.com`) |
   | `DISCORD_BOT_TOKEN` | Your bot token |
   | `BOT_API_URL` | Bot service URL from step 3 |
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |

4. **Deploy**

> **Free tier note:** Render's free plan spins down services after 15 minutes of inactivity. The first request after sleep can take ~30 seconds. Upgrade to a paid plan to keep services always-on.

---

## Step — Finish Discord OAuth Setup

After you know your dashboard's public URL (from any hosting method above):

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications) → your application → **OAuth2 → General**
2. Under **Redirects**, add:
   ```
   https://YOUR-DASHBOARD-URL/api/auth/callback
   ```
   Replace `YOUR-DASHBOARD-URL` with your actual dashboard domain. The path `/api/auth/callback` must be exact.
3. Click **Save Changes**

This must match the `DASHBOARD_URL` environment variable you set **exactly** (same protocol, same domain, no trailing slash).

---

## Step — Invite the Bot to Your Server

Replace `CLIENT_ID` with your actual client ID:

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot
```

Using `permissions=8` grants **Administrator**, which is the simplest setup. For a restricted permission set, see [Required Bot Permissions & Intents](#required-bot-permissions--intents) below.

---

## Environment Variable Reference

### Bot (`bot`)

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | ✅ | Bot token from the Developer Portal |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `PORT` | No | HTTP port the bot API listens on (default: `3000`) |

### Dashboard (`dashboard`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Same PostgreSQL database as the bot |
| `DISCORD_CLIENT_ID` | ✅ | Application client ID |
| `DISCORD_CLIENT_SECRET` | ✅ | Application client secret |
| `SESSION_SECRET` | ✅ | Random string for signing session cookies |
| `DASHBOARD_URL` | ✅ | Full public URL of the dashboard, e.g. `https://yourdomain.com` |
| `DISCORD_BOT_TOKEN` | Recommended | Used to fetch guild channels, roles, and audit log data |
| `BOT_API_URL` | No | Internal URL of the bot API (default: `http://localhost:3000`) |
| `DASHBOARD_PORT` | No | Port the dashboard listens on (default: `5000`) |
| `NODE_ENV` | No | Set to `production` in production to enable secure cookies |

---

## Generating a SESSION_SECRET

Run in any terminal:

```bash
openssl rand -base64 32
```

Or in Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use any 32+ character random string. Store it as a secret environment variable — never commit it to source control.

---

## Required Bot Permissions & Intents

### Privileged Gateway Intents

Enable all three in **Discord Developer Portal → Bot**:

- ✅ **Server Members Intent** — required for member join/leave events, anti-raid, modnick
- ✅ **Message Content Intent** — required for prefix commands and automod
- ✅ **Presence Intent** — required for presence-related features

### Bot Permissions

**Administrator** (permission integer `8`) is the simplest option and recommended for a private bot.

For a minimal permission set:

| Permission | Why it's needed |
|---|---|
| View Channels | Read channel messages and context |
| Send Messages | Bot responses, mod actions |
| Send Messages in Threads | Ticket threads |
| Embed Links | Rich embeds in mod logs and tags |
| Attach Files | Case exports, transcripts |
| Read Message History | Purge, cleanup, transcript generation |
| Manage Messages | Purge, automod delete |
| Add Reactions | Starboard, reaction roles |
| Manage Channels | Lock, unlock, hide, unhide |
| Manage Roles | Mute role, temp roles, role assign |
| Manage Nicknames | Modnick enforcement |
| Kick Members | Kick command |
| Ban Members | Ban, tempban, softban |
| Moderate Members | Discord timeout (mute without mute role) |
| View Audit Log | Anti-nuke, anti-raid attribution |
| Manage Webhooks | Webhook event logging |

---

## Troubleshooting

**Build fails — "Use pnpm instead"**
→ The build command must use pnpm. Run `corepack enable` before `pnpm install`. Do not use `npm install`.

**Build fails — EROFS / read-only filesystem**
→ Do not use `npm install -g pnpm`. Use `corepack enable` instead — it activates pnpm without a global install.

**"Access denied to this server" on dashboard login**
→ The dashboard only shows servers where you are the **server owner**. Staff access can be granted per-guild by the owner via the Access panel in the dashboard.

**OAuth redirect mismatch**
→ The redirect URI registered in Discord must match your `DASHBOARD_URL` + `/api/auth/callback` **exactly**, including `https://` and no trailing slash.

**Channels / roles / audit log not loading**
→ `DISCORD_BOT_TOKEN` must be set in the dashboard's environment variables, and the bot must be a member of the server.

**Bot shows offline on dashboard stats**
→ Set `BOT_API_URL` to the bot service's URL. Both services must be running at the same time.

**Session keeps expiring**
→ Make sure `SESSION_SECRET` is the same every time the dashboard restarts. If it changes, all existing sessions are invalidated.

**Database connection refused**
→ Check that `DATABASE_URL` is correct, that PostgreSQL is running, and that the user has permission to connect. For SSL issues on Render/Railway, the connection string should include `?sslmode=require`.

**Bot token invalid**
→ Bot tokens reset whenever you click "Reset Token" in the Developer Portal. Make sure your environment variable matches the currently active token.

**"DISCORD_BOT_TOKEN not set — bot will not start"**
→ The API server started successfully but the Discord connection is skipped. Add the `DISCORD_BOT_TOKEN` environment variable and restart.
