#!/bin/bash
echo "Starting SadTalker Flask API..."
echo ""

# Use Python 3.13 specifically
python3.13 app.py

# If Python 3.13 not found, try default python
if [ $? -ne 0 ]; then
    echo ""
    echo "Python 3.13 not found. Trying default python..."
    python app.py
fi

