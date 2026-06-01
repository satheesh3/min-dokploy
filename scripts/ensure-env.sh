#!/bin/sh
if [ ! -f .env ]; then
  echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .env
  echo "[ok] .env created with generated secret"
fi
