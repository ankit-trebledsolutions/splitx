#!/usr/bin/env bash
# One-time preparation of the Hostinger VPS. Run as root:
#   bash deploy/setup-vps.sh
# Safe to run again: steps already done are skipped.
set -euo pipefail

# The stack is only tested on Ubuntu 24.04; stop on anything else.
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "24.04" ]; then
  echo "This VPS runs ${PRETTY_NAME:-an unknown OS}; Ubuntu 24.04 is required."
  echo "Reinstall it in hPanel: VPS > OS & Panel > Operating System > Ubuntu 24.04."
  exit 1
fi
echo "OS: $PRETTY_NAME"

apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw

# Docker Engine + compose plugin from Docker's own repository.
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker --version
docker compose version

# SSH and web only. Nginx (the web container) is the only thing published.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "VPS ready. Next: backend/.env, ./.env, deploy/certs, then: docker compose up -d --build"
