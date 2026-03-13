@echo off
echo Starting GoToMock Backend...
cd /d "C:\Users\Gurru Sudharsan\Downloads\goto\backend"
set PYTHONPATH=C:\Users\Gurru Sudharsan\Downloads\goto\backend
"C:\Users\Gurru Sudharsan\AppData\Local\Programs\Python\Python312\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
