#!/bin/bash
set -e
cd /home/site/wwwroot

# 如果 antenv 尚未解壓，先解壓 Oryx 產生的 antenv.tar.gz
if [ ! -d antenv ]; then
    echo "[startup] Extracting antenv.tar.gz..."
    tar -xzf antenv.tar.gz
    echo "[startup] antenv extracted"
fi

echo "[startup] Starting uvicorn..."
exec antenv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8080
