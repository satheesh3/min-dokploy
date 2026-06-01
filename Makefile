.PHONY: up down logs ps

# Generates .env with a real secret if it doesn't exist yet
ensure-env:
	@[ -f .env ] || ( \
		echo "BETTER_AUTH_SECRET=$$(openssl rand -hex 32)" > .env && \
		echo "[ok] .env created with generated secret" \
	)

# Ensures Docker Swarm is active
ensure-swarm:
	@docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active \
		|| docker swarm init --advertise-addr 127.0.0.1


# ── Production-like (Swarm stack) ─────────────────────────────
# Both Mini-Dokploy and user deployments run as Docker Swarm services.
up: ensure-env ensure-swarm
	@set -a && . ./.env && set +a && \
		docker stack deploy -c stack.yml mini-dokploy --resolve-image never 2>/dev/null || true
	@printf "Waiting for registry..."; \
		until curl -sf http://127.0.0.1:5000/v2/ >/dev/null 2>&1; do sleep 2; printf "."; done; echo " ready"
	npm install --include=dev
	npm run build
	docker build -t 127.0.0.1:5000/mini-dokploy:latest .
	docker push 127.0.0.1:5000/mini-dokploy:latest
	docker service update --image 127.0.0.1:5000/mini-dokploy:latest \
		--with-registry-auth mini-dokploy_app
	@echo ""
	@echo "  App:     http://app.127.0.0.1.sslip.io"
	@echo "  Traefik: http://localhost:8080"

down:
	@docker service ls --filter name=dep- -q | xargs -r docker service rm 2>/dev/null || true
	docker stack rm mini-dokploy

# ── Helpers ────────────────────────────────────────────────────
logs:
	docker service logs -f mini-dokploy_app

ps:
	docker service ls
