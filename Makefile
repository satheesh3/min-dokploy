.PHONY: dev dev-down up down logs ps

# ── Development (hot-reload) ───────────────────────────────────
# Starts Traefik + registry + app with live source code.
# First run takes a minute while npm install runs inside the container.
dev:
	@docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active \
		|| docker swarm init --advertise-addr 127.0.0.1
	@[ -f .env ] || (openssl rand -hex 32 | xargs -I{} echo "BETTER_AUTH_SECRET={}" > .env)
	docker compose up

dev-down:
	docker compose down -v

# ── Production-like (built image, Swarm stack) ─────────────────
# Builds the Docker image, pushes to local registry, deploys as Swarm stack.
up:
	@docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active \
		|| docker swarm init --advertise-addr 127.0.0.1
	@[ -f .env ] || (openssl rand -hex 32 | xargs -I{} echo "BETTER_AUTH_SECRET={}" > .env)
	@docker stack deploy -c stack.yml mini-dokploy --resolve-image never 2>/dev/null || true
	@echo "Waiting for registry..." && until curl -sf http://127.0.0.1:5000/v2/ >/dev/null 2>&1; do sleep 2; done
	npm install --include=dev
	npm run build
	docker build -t 127.0.0.1:5000/mini-dokploy:latest .
	docker push 127.0.0.1:5000/mini-dokploy:latest
	@. .env && docker stack deploy --with-registry-auth -c stack.yml mini-dokploy
	@echo ""
	@echo "  App:     http://app.127.0.0.1.sslip.io"
	@echo "  Traefik: http://localhost:8080"

down:
	docker stack rm mini-dokploy

# ── Helpers ────────────────────────────────────────────────────
logs:
	docker service logs -f mini-dokploy_app

ps:
	docker service ls
