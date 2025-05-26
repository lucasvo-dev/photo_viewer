#!/bin/bash

echo "Starting Jet Cache Worker..."
echo "This worker will process RAW image cache jobs in the background."
echo ""
echo "To stop the worker, press Ctrl+C"
echo ""

# Change to script directory
cd "$(dirname "$0")"

# Run the worker
php worker_jet_cache.php

echo ""
echo "Jet Cache Worker stopped." 