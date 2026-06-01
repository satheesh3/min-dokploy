#!/bin/sh
if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q active; then
  docker swarm init --advertise-addr 127.0.0.1
fi
