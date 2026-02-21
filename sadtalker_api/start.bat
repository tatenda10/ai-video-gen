@echo off
echo Starting SadTalker Flask API...
echo.

REM Use Python 3.13 specifically
python3.13 app.py

if errorlevel 1 (
    echo.
    echo Error: Python 3.13 not found. Trying default python...
    python app.py
)

pause

