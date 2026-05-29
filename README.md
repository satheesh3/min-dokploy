# mini-dokploy

A self-hosted deployment platform. Provide a Git repo URL + Dockerfile path and it builds, runs, and exposes your app on a generated subdomain via Traefik.

## Prerequisites

- Docker Desktop (or Docker Engine)
- Add `127.0.0.1:5000` to insecure registries — **Docker Desktop**: Settings → Docker Engine:
  ```json
  { "insecure-registries": ["127.0.0.1:5000"] }
  ```
- Node.js 20+
- `make`

## Usage

### Develop Mini-Dokploy itself (hot-reload)
```bash
make dev
```
Starts Traefik + registry + app with live source code mounted. Edit and save — changes reload instantly.
> Note: Mini-Dokploy runs as a plain Compose container in this mode. Use `make up` for fully correct Swarm orchestration.

### Run as Docker Swarm services (correct orchestration)
```bash
make up
```
Builds the image, pushes to local registry, deploys everything as Swarm services.

| URL | What |
|---|---|
| http://app.127.0.0.1.sslip.io | Mini-Dokploy UI |
| http://localhost:8080 | Traefik dashboard |
| http://dep-{id}.127.0.0.1.sslip.io | Your deployed apps |

### Other commands
```bash
make down          # tear down the Swarm stack
make logs          # stream app logs
make ps            # list all services
```

## Stack

| Component | Role |
|---|---|
| Next.js 14 (Pages Router) + tRPC v11 | Web UI + API |
| BetterAuth | Auth (email/password, sessions) |
| SQLite + Drizzle ORM | State persistence |
| Dockerode | Docker SDK — build, push, Swarm services |
| Traefik v3 | HTTP routing via Docker Swarm labels |
| sslip.io | Zero-config local DNS (`dep-{id}.127.0.0.1.sslip.io`) |
| WebSocket (ws) | Live build/deploy log streaming |

## Architecture

```
make up
└── docker stack deploy -c stack.yml mini-dokploy
    ├── traefik     — reverse proxy, reads Swarm service labels
    ├── registry    — local Docker image registry (port 5000)
    └── app         — mini-dokploy (port 3000)

Each user deployment → Docker Swarm service dep-{id}
                     → Traefik routes dep-{id}.127.0.0.1.sslip.io to it
```
