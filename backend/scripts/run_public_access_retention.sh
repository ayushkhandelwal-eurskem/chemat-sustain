#!/bin/sh
set -eu

while true; do
  python /app/scripts/public_access_retention.py
  sleep 3600
done