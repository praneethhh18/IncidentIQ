#!/usr/bin/env bash
# IncidentIQ - one-time EC2 bootstrap.
#
# Run this ONCE on a fresh Ubuntu 24.04 box (via EC2 Instance Connect
# or local SSH). Idempotent: safe to re-run if a step failed halfway.
#
#   curl -fsSL https://raw.githubusercontent.com/praneethhh18/IncidentIQ/main/deploy/bootstrap.sh | sudo bash
#
# What it does:
#   1. Installs system deps (Python venv, nginx, certbot, git)
#   2. Clones the IncidentIQ repo to /opt/incidentiq
#   3. Builds the backend Python venv and pip-installs requirements
#   4. Installs the nginx reverse-proxy config and the systemd service
#   5. Reloads nginx + systemd
#   6. Reminds the operator to fill in the .env and run certbot
#
# Secrets are NOT in this script. The operator creates
# /opt/incidentiq/backend/.env after bootstrap finishes.

set -euo pipefail

REPO_URL="https://github.com/praneethhh18/IncidentIQ.git"
INSTALL_DIR="/opt/incidentiq"
SERVICE_USER="ubuntu"
DOMAIN="api.nexusagent.in"

log() { printf "\n\033[1;36m[bootstrap]\033[0m %s\n" "$*"; }
die() { printf "\n\033[1;31m[bootstrap]\033[0m %s\n" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (use sudo)."

# ── 1. System dependencies ────────────────────────────────────────────

log "Updating apt and installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
    git curl ca-certificates \
    python3.12 python3.12-venv python3-pip \
    nginx \
    certbot python3-certbot-nginx \
    build-essential

# ── 2. Clone or refresh the repo ──────────────────────────────────────

if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Repo already cloned; pulling latest main..."
    sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" fetch origin main
    sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" reset --hard origin/main
else
    log "Cloning repo into $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
    chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

# ── 3. Python venv + dependencies ─────────────────────────────────────

log "Building Python venv..."
if [[ ! -d "$INSTALL_DIR/backend/.venv" ]]; then
    sudo -u "$SERVICE_USER" python3.12 -m venv "$INSTALL_DIR/backend/.venv"
fi
sudo -u "$SERVICE_USER" "$INSTALL_DIR/backend/.venv/bin/pip" install --upgrade pip wheel
sudo -u "$SERVICE_USER" "$INSTALL_DIR/backend/.venv/bin/pip" install -r "$INSTALL_DIR/backend/requirements.txt"

# ── 4. .env scaffold ──────────────────────────────────────────────────

if [[ ! -f "$INSTALL_DIR/backend/.env" ]]; then
    log "Creating placeholder .env (you MUST fill it in after this script)..."
    cp "$INSTALL_DIR/deploy/.env.production.example" "$INSTALL_DIR/backend/.env"
    chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/backend/.env"
    chmod 600 "$INSTALL_DIR/backend/.env"
fi

# ── 5. nginx config ───────────────────────────────────────────────────

log "Installing nginx site config..."
cp "$INSTALL_DIR/deploy/nginx/incidentiq.conf" /etc/nginx/sites-available/incidentiq
ln -sf /etc/nginx/sites-available/incidentiq /etc/nginx/sites-enabled/incidentiq
# Remove the stock default site if it's still active.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ── 6. systemd service ────────────────────────────────────────────────

log "Installing systemd unit..."
cp "$INSTALL_DIR/deploy/systemd/incidentiq.service" /etc/systemd/system/incidentiq.service
systemctl daemon-reload
systemctl enable incidentiq

# We deliberately do NOT start the service here yet, because the .env
# is still placeholder. Starting it would fail loudly and leave the
# operator unsure if the bootstrap itself broke.
log "Bootstrap complete. systemd service is ENABLED but NOT STARTED."

cat <<EOF

────────────────────────────────────────────────────────────────────
NEXT STEPS (do these in order, in this same terminal):

  1. Fill in the production .env with real secrets:
       sudo nano /opt/incidentiq/backend/.env

     Required keys: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
     DATADOG_API_KEY, DATADOG_APP_KEY, GITHUB_OAUTH_CLIENT_ID,
     GITHUB_OAUTH_CLIENT_SECRET.  Copy values from your existing
     local .env.  Save with Ctrl+O, Enter, Ctrl+X.

  2. Start the backend:
       sudo systemctl start incidentiq
       sudo systemctl status incidentiq --no-pager

     You should see 'active (running)'.  If not, check logs:
       sudo journalctl -u incidentiq -n 50 --no-pager

  3. Test the backend over plain HTTP (still no SSL):
       curl -i http://$DOMAIN/health

     Should return JSON with bedrock_enabled:true.

  4. Get the SSL cert (interactive - certbot will ask for an email):
       sudo certbot --nginx -d $DOMAIN --agree-tos --redirect

     After this, https://$DOMAIN/health works and HTTP redirects to HTTPS.

  5. From now on, every push to main on GitHub auto-deploys via the
     GitHub Actions workflow in .github/workflows/deploy.yml .

────────────────────────────────────────────────────────────────────
EOF
