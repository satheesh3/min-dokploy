#!/bin/sh
set -e
sh scripts/ensure-env.sh
sh scripts/ensure-swarm.sh

# Export .env vars so docker stack deploy can interpolate them
set -a && . ./.env && set +a

docker stack deploy -c stack.yml mini-dokploy --resolve-image never 2>/dev/null || true

printf "Waiting for registry..."
until curl -sf http://127.0.0.1:5000/v2/ >/dev/null 2>&1; do
  sleep 2
  printf "."
done
echo " ready"

npm install --include=dev
npm run build
docker build -t 127.0.0.1:5000/mini-dokploy:latest .
docker push 127.0.0.1:5000/mini-dokploy:latest
docker service update --image 127.0.0.1:5000/mini-dokploy:latest \
  --with-registry-auth mini-dokploy_app

echo ""
echo "  App:     http://app.127.0.0.1.sslip.io"
echo "  Traefik: http://localhost:8080"
