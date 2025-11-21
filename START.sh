#!/bin/bash

echo "========================================"
echo "  Alyx Income Manager"
echo "========================================"
echo ""
echo "Starting local server..."
echo "Opening browser at http://localhost:8000"
echo ""
echo "Keep this terminal open while using the app."
echo "Press Ctrl+C to stop the server when done."
echo ""
echo "========================================"

sleep 2

# Try to open browser (works on Mac and most Linux)
if command -v open &> /dev/null; then
    open http://localhost:8000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:8000
else
    echo "Please open http://localhost:8000 in your browser"
fi

# Start server (try python3 first, fall back to python)
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m http.server 8000
else
    echo "ERROR: Python is not installed!"
    echo "Please install Python from https://www.python.org"
    read -p "Press Enter to exit..."
fi
