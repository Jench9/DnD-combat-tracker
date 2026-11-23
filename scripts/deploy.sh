#!/usr/bin/env bash
# Updates the kit on a server that runs it from a git clone (see Readme,
# "Updating a server"): pulls the pushed code there and rebuilds.
#
#   scripts/deploy.sh            deploy what's on origin/master
#   scripts/deploy.sh <commit>   deploy (or roll back to) a commit, tag or branch
#
# Settings: KIT_SERVER (ssh target, e.g. ubuntu@203.0.113.7), KIT_DIR (the
# clone on the server, default DnD-combat-tracker in the home folder) and
# KIT_URL (checked at the end), from the environment or a git-ignored
# `.env.deploy` file next to the repo root.
#
# Before rebuilding, the server's data/ is saved as a tarball in
# ~/deploy-snapshots (newest 5 kept), so a bad update can be undone with the
# data as it was. Server-only files (Caddyfile, docker-compose.override.yml)
# are never touched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.deploy" ] && . "$ROOT/.env.deploy"
: "${KIT_SERVER:?Set KIT_SERVER (e.g. ubuntu@203.0.113.7) in the environment or .env.deploy}"
KIT_DIR="${KIT_DIR:-DnD-combat-tracker}"
KIT_URL="${KIT_URL:-}"
REF="${1:-}"

cd "$ROOT"

# Only pushed code reaches the server: warn about what it won't get.
git fetch -q origin
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Note: you have uncommitted changes; they won't be deployed."
fi
if [ -z "$REF" ]; then
  ahead="$(git rev-list --count origin/master..HEAD 2>/dev/null || echo 0)"
  if [ "$(git rev-parse --abbrev-ref HEAD)" = master ] && [ "$ahead" -gt 0 ]; then
    echo "master has $ahead commit(s) not pushed yet. Run 'git push' first (or pass a commit to deploy)." >&2
    exit 1
  fi
fi

echo "Deploying ${REF:-origin/master} to $KIT_SERVER:$KIT_DIR"
# ssh joins the remote command into one line: quote each argument for it.
ssh -o BatchMode=yes "$KIT_SERVER" "bash -s -- $(printf '%q ' "$KIT_DIR" "$REF")" <<'REMOTE'
set -euo pipefail
dir="$1"; ref="${2:-}"
cd "$HOME/$dir"
docker_() { if docker info >/dev/null 2>&1; then docker "$@"; else sudo docker "$@"; fi; }

git fetch -q origin
before="$(git rev-parse --short HEAD)"
if [ -n "$ref" ]; then
  target="$(git rev-parse --verify -q "origin/$ref^{commit}" || git rev-parse --verify "$ref^{commit}")"
  git checkout -q --detach "$target"
else
  git checkout -q master
  git merge -q --ff-only origin/master
fi
after="$(git rev-parse --short HEAD)"

if [ "$before" = "$after" ]; then
  echo "Server already on $after; rebuilding anyway."
else
  echo "Changes $before -> $after:"
  git log --oneline "$before..$after" 2>/dev/null | sed 's/^/  /' || true
  if [ -n "$(git log --oneline "$after..$before" 2>/dev/null)" ]; then echo "  (going back: rollback)"; fi
fi

# Snapshot of the data before the new code touches it.
mkdir -p "$HOME/deploy-snapshots"
snap="$HOME/deploy-snapshots/data-$(date +%Y%m%d-%H%M%S)-$before.tar.gz"
sudo tar -czf "$snap" -C "$HOME/$dir" data
sudo chown "$(id -u):$(id -g)" "$snap"
ls -1t "$HOME"/deploy-snapshots/data-*.tar.gz | tail -n +6 | xargs -r rm -f --
echo "Data snapshot: $snap"

docker_ compose up -d --build --remove-orphans 2>&1 | grep -vE '^\s*$' | tail -4

# Wait for the health check.
cid="$(docker_ compose ps -q combat-tracker)"
for _ in $(seq 1 30); do
  status="$(docker_ inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)"
  [ "$status" = healthy ] && break
  sleep 3
done
if [ "$status" != healthy ]; then
  echo "App is '$status' after 90 s. Last log lines:" >&2
  docker_ compose logs --tail 30 combat-tracker >&2
  echo "Roll back with: scripts/deploy.sh $before" >&2
  exit 1
fi
docker_ image prune -f >/dev/null   # old builds would slowly fill the disk
echo "Running $after (healthy)."
REMOTE

if [ -n "$KIT_URL" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$KIT_URL/api/auth/status" || true)"
  if [ "$code" = 200 ]; then echo "$KIT_URL answers (200)."; else echo "Warning: $KIT_URL answered '$code'." >&2; exit 1; fi
fi
