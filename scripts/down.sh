#!/bin/sh
docker service ls --filter name=dep- -q | xargs -r docker service rm 2>/dev/null || true
docker stack rm mini-dokploy
