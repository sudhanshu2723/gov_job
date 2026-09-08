@echo off
REM Daily scrape wrapper. Exists because schtasks mis-parses the space in
REM "government job" when the interpreter and script are both quoted inside /TR.
REM Uses the real interpreter, not the WindowsApps store alias, which does not
REM reliably resolve in a non-interactive Task Scheduler session.
cd /d "%~dp0"
"C:\Users\sudha\AppData\Local\Python\pythoncore-3.14-64\python.exe" scrape.py
