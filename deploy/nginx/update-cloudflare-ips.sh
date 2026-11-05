#!/usr/bin/env bash
# Rewrites templates/cloudflare.conf.template from Cloudflare's published
# address lists, then shows what changed. Run from the project folder:
#   bash deploy/nginx/update-cloudflare-ips.sh
# and, if the list changed, restart Nginx so it renders the file again:
#   docker compose restart web
set -euo pipefail

out="$(dirname "$0")/templates/cloudflare.conf.template"
v4="$(curl -fsS https://www.cloudflare.com/ips-v4)"
v6="$(curl -fsS https://www.cloudflare.com/ips-v6)"
ranges="$(printf '%s\n%s\n' "$v4" "$v6" | tr -d '\r' | sed '/^$/d')"

# Refuse anything that is not a plain list of CIDR ranges, and a list so short
# that something must have gone wrong: a bad file here locks every visitor out.
if printf '%s\n' "$ranges" | grep -Evq '^[0-9a-fA-F:.]+/[0-9]+$'; then
  echo "Unexpected content from cloudflare.com; $out left as it was." >&2
  exit 1
fi
if [ "$(printf '%s\n' "$ranges" | wc -l)" -lt 10 ]; then
  echo "Fewer than 10 ranges from cloudflare.com; $out left as it was." >&2
  exit 1
fi

tmp="$(mktemp)"
{
  cat <<'EOF'
# Cloudflare's address ranges, used by default.conf.template. The image renders
# every *.template here into /etc/nginx/conf.d/, which nginx.conf includes, so
# this file needs no include line of its own.
#
EOF
  echo "# Source: https://www.cloudflare.com/ips-v4 and /ips-v6, checked $(date +%F)."
  cat <<'EOF'
# They change rarely; deploy/nginx/update-cloudflare-ips.sh rewrites this file
# from the live lists (see deploy/README.md).

# 1. The visitor's real address. A request that comes from one of these ranges
#    has its client address replaced by the CF-Connecting-IP header Cloudflare
#    sets. From anywhere else the header is ignored, so it cannot be faked.
EOF
  printf '%s\n' "$ranges" | sed 's/.*/set_real_ip_from &;/'
  cat <<'EOF'
real_ip_header CF-Connecting-IP;

# 2. Whether the connection itself came from Cloudflare. This looks at the
#    address that connected ($realip_remote_addr), not the rewritten one above:
#    after step 1 every visitor has their own address, which is never in these
#    ranges. The site's server blocks drop anything that scores 0.
geo $realip_remote_addr $from_cloudflare {
  default 0;
EOF
  printf '%s\n' "$ranges" | sed 's/.*/  & 1;/'
  echo '}'
} > "$tmp"

# The "checked <date>" line alone is not a change.
if diff -u -I '^# Source:' "$out" "$tmp"; then
  echo "No change: the ranges in $out are current."
  rm -f "$tmp"
else
  mv "$tmp" "$out"
  echo
  echo "Updated $out. Apply with: docker compose restart web"
fi
