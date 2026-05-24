# Deploy guide

Production layout:

| Component | Where | URL |
|---|---|---|
| Frontend | Vercel | https://incidentiq.nexusagent.in |
| Backend | AWS EC2 (t3.small, Ubuntu 24.04) | https://api.nexusagent.in |
| CI/CD | GitHub Actions | on push to `main` |

## First-time setup (operator)

One-time, ~15 min total. Run on a fresh Ubuntu 24.04 EC2 instance with
ports 22/80/443 open in the security group.

### 1. Bootstrap the box

From an SSH session or EC2 Instance Connect terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/praneethhh18/IncidentIQ/main/deploy/bootstrap.sh | sudo bash
```

This clones the repo, builds the venv, installs nginx + certbot, and
registers the systemd unit. It does NOT start the service yet because
the .env still has placeholder values.

### 2. Fill in the .env

```bash
sudo nano /opt/incidentiq/backend/.env
```

The required keys are documented in `deploy/.env.production.example`.
Copy values from your local dev `.env` for everything except the
GitHub OAuth callback / redirect URLs (which use the production
domain).

### 3. Start the backend

```bash
sudo systemctl start incidentiq
sudo systemctl status incidentiq --no-pager
```

If status shows anything other than `active (running)`:

```bash
sudo journalctl -u incidentiq -n 50 --no-pager
```

### 4. Provision SSL

DNS A-record for `api.nexusagent.in` must already point at the EIP.

```bash
sudo certbot --nginx -d api.nexusagent.in --agree-tos --redirect
```

certbot will ask for an email (cert renewal notifications) and modify
the nginx site config to add the :443 server block.

After this, `https://api.nexusagent.in/health` returns JSON.

### 5. Update the GitHub OAuth App callback URL

https://github.com/settings/developers -> IncidentIQ OAuth App -> edit:

- Authorization callback URL:
  `https://api.nexusagent.in/api/v1/auth/github/callback`

Save. (The .env's `GITHUB_OAUTH_CALLBACK_URL` was already set to this
in step 2; both sides must match.)

### 6. Confirm GitHub Actions secrets

Repo Settings -> Secrets and variables -> Actions:

| Secret | Value |
|---|---|
| `EC2_HOST` | `52.204.113.147` (Elastic IP) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | full contents of `incidentiq-key.pem` |

## Subsequent deploys

Just `git push` to `main`. The workflow at
`.github/workflows/deploy.yml`:

1. SSHs into the EC2 box
2. `git pull`
3. `pip install -r requirements.txt`
4. Refreshes nginx + systemd configs (if changed)
5. `systemctl restart incidentiq`
6. Health-checks `http://127.0.0.1:8000/health` (internal) and
   `https://api.nexusagent.in/health` (public)

A failed deploy leaves the previous version running because we restart
the service AFTER pip install succeeds. To roll back:

```bash
git revert <bad-sha>
git push
```

## Operational commands

| What | Command |
|---|---|
| Tail backend logs | `sudo journalctl -u incidentiq -f` |
| Restart backend | `sudo systemctl restart incidentiq` |
| Reload nginx | `sudo systemctl reload nginx` |
| Renew SSL (auto via certbot timer) | `sudo certbot renew` |
| Update Python deps after a manual edit | `cd /opt/incidentiq/backend && ./.venv/bin/pip install -r requirements.txt && sudo systemctl restart incidentiq` |
| Free disk / log space | `sudo journalctl --vacuum-time=7d` |
