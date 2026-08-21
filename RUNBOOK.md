# Runbook

Production deployment guide for ReadPulse on a Linux VPS.

## 1. Prerequisites

### System packages

```bash
sudo apt update
sudo apt install -y git curl nginx ufw

# Node.js 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# .NET 10 SDK (Microsoft)
# See https://learn.microsoft.com/dotnet/core/install/linux for your distro.
# Ubuntu 22.04 example:
wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb
sudo apt update
sudo apt install -y dotnet-sdk-10.0
```

### Verify installs

```bash
dotnet --version       # 10.x.x
node --version         # v20.x.x
nginx -v               # nginx/1.18+
```

### Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## 2. Get the code

```bash
sudo mkdir -p /opt/readpulse
sudo chown $USER:$USER /opt/readpulse
cd /opt/readpulse
git clone https://github.com/dmitrybryantsew/ReadPulse.git .
```

## 3. Configure secrets

### Backend

```bash
cd /opt/readpulse/backend
cp appsettings.Template.json appsettings.Production.json
nano appsettings.Production.json
```

Set:
- `CHUTES_API_KEY` — your Chutes.ai key (`cpk_...`)
- `Chutes:Model` — default model (e.g. `moonshotai/Kimi-K2.6-TEE`)
- `Google:ClientId` — your Google OAuth Client ID

```bash
# Lock down permissions
chmod 600 appsettings.Production.json
```

### Frontend

```bash
cd /opt/readpulse/frontend
cp .env.example .env
nano .env
```

Set:
- `VITE_API_BASE_URL=https://your-domain.com` (production URL, no port)
- `VITE_GOOGLE_CLIENT_ID=<same as backend>`

## 4. Build

### Backend (publish self-contained release)

```bash
cd /opt/readpulse/backend
dotnet publish -c Release -o /opt/readpulse/backend/publish
```

### Frontend (static build)

```bash
cd /opt/readpulse/frontend
npm ci
npm run build    # outputs to frontend/dist/
```

## 5. Run with systemd

### Backend service

```bash
sudo nano /etc/systemd/system/readpulse.service
```

```ini
[Unit]
Description=ReadPulse Backend (.NET 10)
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/readpulse/backend/publish
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://127.0.0.1:5159
ExecStart=/usr/bin/dotnet /opt/readpulse/backend/publish/backend.dll
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/readpulse
sudo systemctl daemon-reload
sudo systemctl enable readpulse
sudo systemctl start readpulse
sudo systemctl status readpulse    # verify "active (running)"
```

### Frontend (served by nginx)

The frontend is a static SPA — nginx serves `dist/` and proxies `/api` to the backend.

## 6. Configure nginx

```bash
sudo nano /etc/nginx/sites-available/readpulse
```

```nginx
server {
    listen 80;
    server_name your-domain.com;    # or VPS IP

    # Frontend SPA
    root /opt/readpulse/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass         http://127.0.0.1:5159;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Multipart uploads (PDF)
        client_max_body_size 100M;
        proxy_read_timeout 120s;
    }

    # Swagger (optional — restrict in prod)
    location /swagger {
        proxy_pass http://127.0.0.1:5159;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/readpulse /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                  # test config
sudo systemctl reload nginx
sudo systemctl enable nginx
```

## 7. HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
# Certbot auto-edits nginx config and sets up auto-renew
```

After HTTPS, update `frontend/.env`:
```
VITE_API_BASE_URL=https://your-domain.com
```
Then rebuild the frontend:
```bash
cd /opt/readpulse/frontend && npm run build
```

Also update the backend CORS policy in `Program.cs` to allow your domain, then republish:
```csharp
policy.WithOrigins("https://your-domain.com")
```

## 8. Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add **Authorized JavaScript origins**:
   - `https://your-domain.com`
4. Copy the Client ID into:
   - `backend/appsettings.Production.json` → `Google:ClientId`
   - `frontend/.env` → `VITE_GOOGLE_CLIENT_ID`
5. Rebuild frontend + restart backend

## 9. Operations

### View logs

```bash
sudo journalctl -u readpulse -f          # backend, follow
sudo journalctl -u readpulse --since "1 hour ago"
sudo tail -f /var/log/nginx/access.log   # nginx
```

### Restart services

```bash
sudo systemctl restart readpulse
sudo systemctl reload nginx
```

### Update deployment

```bash
cd /opt/readpulse
git pull

# Backend
cd backend
dotnet publish -c Release -o /opt/readpulse/backend/publish
sudo systemctl restart readpulse

# Frontend
cd ../frontend
npm ci
npm run build
# nginx serves the new dist/ automatically
```

### Backup the database

The SQLite DB lives at `backend/publish/readpulse.db` (auto-created on first run).

```bash
# Manual
cp /opt/readpulse/backend/publish/readpulse.db ~/readpulse-backup-$(date +%F).db

# Cron (daily 3am)
crontab -e
0 3 * * * cp /opt/readpulse/backend/publish/readpulse.db /home/$USER/backups/readpulse-$(date +\%F).db
```

### Recreate the database (schema changes)

The app uses `EnsureCreated()` (no EF migrations). If the schema changes:

```bash
sudo systemctl stop readpulse
rm /opt/readpulse/backend/publish/readpulse.db
sudo systemctl start readpulse    # DB auto-recreates + seeds
```

> **Warning**: this wipes all user data. Back up first.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Cards generate 0 | Check Chutes API key has balance — `curl -H "Authorization: Bearer $KEY" https://llm.chutes.ai/v1/models` should return 200 |
| Google login fails | Verify `Google:ClientId` matches in both backend and frontend `.env`; check Authorized JavaScript origins in Google Cloud Console |
| 401 on all API calls | Cookie not being set — ensure CORS has `.AllowCredentials()` and frontend uses `credentials: "include"`; over HTTPS, cookie `SecurePolicy` auto-activates |
| `dotnet` command not found | `export PATH="/usr/share/dotnet:$PATH"` or install via Microsoft's apt feed |
| Frontend blank page | Check browser console — likely `VITE_API_BASE_URL` is wrong or CORS blocking |
| Upload fails (413) | Increase `client_max_body_size` in nginx config |

## 11. Environment variables summary

| Where | Variable | Example |
|---|---|---|
| backend `appsettings.Production.json` | `CHUTES_API_KEY` | `cpk_xxx` |
| backend `appsettings.Production.json` | `Chutes:Model` | `moonshotai/Kimi-K2.6-TEE` |
| backend `appsettings.Production.json` | `Google:ClientId` | `xxx.apps.googleusercontent.com` |
| backend systemd | `ASPNETCORE_ENVIRONMENT` | `Production` |
| backend systemd | `ASPNETCORE_URLS` | `http://127.0.0.1:5159` |
| frontend `.env` | `VITE_API_BASE_URL` | `https://your-domain.com` |
| frontend `.env` | `VITE_GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` |
| frontend `.env` | `VITE_BASE_PATH` | `/` (or `/readpulse/` for path-prefix deploy) |

---

## Appendix A: Caddy reverse proxy (path-prefix deploy)

If your VPS already runs **Caddy** on ports 80/443 (e.g. serving another app), you can serve ReadPulse under a path prefix like `/readpulse/` instead of a dedicated domain.

### Frontend `.env` (path-prefix)

```
VITE_API_BASE_URL=https://your-domain.com/readpulse
VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
VITE_BASE_PATH=/readpulse/
```

`VITE_BASE_PATH` sets the Vite `base` option so all asset URLs get the prefix.

### Backend CORS (`Program.cs`)

```csharp
policy.WithOrigins("https://your-domain.com")
```

Same-origin (path-prefix) requests don't need credentials CORS, but keep `.AllowCredentials()` for safety.

### Caddyfile snippet

```caddyfile
your-domain.com {
    # ... your existing routes ...

    # ReadPulse: bare /readpulse -> /readpulse/
    @readpulseBare path /readpulse
    redir @readpulseBare /readpulse/ permanent

    # ReadPulse API: /readpulse/api/* -> backend (strip /readpulse prefix)
    @readpulseApi path /readpulse/api/*
    handle @readpulseApi {
        uri strip_prefix /readpulse
        reverse_proxy localhost:5159
    }

    # ReadPulse SPA: /readpulse/* -> dist (strip /readpulse prefix)
    @readpulseSpa path /readpulse/*
    handle @readpulseSpa {
        uri strip_prefix /readpulse
        root * /opt/readpulse/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
```

> **Key**: use `@matcher` + `handle` (not `handle_path`) with an explicit `uri strip_prefix` to avoid Caddy's directive-ordering quirks where `try_files` can shadow `reverse_proxy` inside a single `handle_path` block.

### Google OAuth (path-prefix)

Add `https://your-domain.com` to Authorized JavaScript origins in Google Cloud Console (the path prefix doesn't matter for OIDC origins).
