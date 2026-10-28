#!/bin/bash
# Finds the photobooth laptop (server on :3847) on the local network and prints "host:port".
# Order: last known host → mDNS names → parallel scan of this Pi's /24 subnet.
# The result is cached in ~/.photobooth-server, which the camera service also reads to announce itself.
PORT="${PHOTOBOOTH_PORT:-3847}"
CACHE="${HOME}/.photobooth-server"

probe() { curl -fs -m 0.6 "http://$1:${PORT}/api/health" 2>/dev/null | grep -q '"status":"ok"'; }

save() { echo "$1:${PORT}" > "$CACHE"; echo "$1:${PORT}"; exit 0; }

# 1. Last known address
if [ -f "$CACHE" ]; then
    host="$(cut -d: -f1 "$CACHE")"
    [ -n "$host" ] && probe "$host" && save "$host"
fi

# 2. Names set via PHOTOBOOTH_HOST or mDNS
for host in ${PHOTOBOOTH_HOST:-} photobooth.local photobooth-laptop.local; do
    probe "$host" && save "$host"
done

# 3. Scan the subnet (≈2-4 s with 64 parallel probes)
for prefix in $(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | awk -F. '{print $1"."$2"."$3}' | sort -u); do
    found="$(seq 1 254 | xargs -P 64 -I{} sh -c "curl -fs -m 0.6 http://${prefix}.{}:${PORT}/api/health 2>/dev/null | grep -q '\"status\":\"ok\"' && echo ${prefix}.{}" | head -1)"
    [ -n "$found" ] && save "$found"
done

exit 1
