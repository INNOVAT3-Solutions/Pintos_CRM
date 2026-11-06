#!/bin/bash
# Double-click to run the Pintos CRM at http://localhost:3100. Close this window to stop it.
cd "$(dirname "$0")"

if [ ! -f ../.env ]; then
  echo "Missing ../.env (GHL token, location ID, session secret). See README.md."
  read -r -p "Press Enter to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing (one-time, about a minute)…"
  npm install || { read -r -p "Install failed. Press Enter to close."; exit 1; }
fi

( for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3100/login && break; sleep 1; done
  open "http://localhost:3100" ) &

echo "Pintos CRM running at http://localhost:3100 — close this window to stop it."
npm run dev
