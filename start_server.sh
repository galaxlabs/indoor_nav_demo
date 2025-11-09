#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/advanced"
python3 -m http.server 5500
