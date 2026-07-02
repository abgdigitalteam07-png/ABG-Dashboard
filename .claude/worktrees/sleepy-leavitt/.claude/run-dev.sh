#!/bin/bash
export PATH="/Users/mali/.local/node/bin:$PATH"
cd /Users/mali/brand-performance-hub
exec ./node_modules/.bin/vite --port ${PORT:-8080}
