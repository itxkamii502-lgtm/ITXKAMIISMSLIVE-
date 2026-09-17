#!/usr/bin/env bash
set -e

echo ">>> 1. Installing dependencies..."
npm install

echo ">>> 2. Building production bundle..."
npm run build

echo ">>> 3. Configuring Nginx..."
if [ -f nginx.conf ]; then
  cp nginx.conf /etc/nginx/sites-available/default
  systemctl restart nginx 2>/dev/null || true
fi

echo ">>> 4. Starting PM2 process..."
pm2 delete sms-gateway 2>/dev/null || true
pm2 start dist/server.cjs --name "sms-gateway"
pm2 save

echo "=========================================="
echo " SUCCESS! Project is LIVE at: http://50.6.228.86"
echo "=========================================="
