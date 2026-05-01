#!/bin/bash
set -e
cd /home/site/wwwroot

# antenv.tar.gz 內部結構是 ./bin/ ./lib/，需解壓到 antenv/ 子目錄
if [ ! -d antenv ]; then
    echo "[startup] Extracting antenv.tar.gz into antenv/..."
    mkdir -p antenv
    tar -xzf antenv.tar.gz -C antenv
    echo "[startup] antenv extracted"
fi

echo "[startup] Starting uvicorn..."
exec antenv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8080
