# Run pip install and log output
$python = "C:\Users\Gurru Sudharsan\AppData\Local\Programs\Python\Python312\python.exe"
$pip = "C:\Users\Gurru Sudharsan\AppData\Local\Programs\Python\Python312\Scripts\pip.exe"
$req = "C:\Users\Gurru Sudharsan\Downloads\goto\backend\requirements.txt"
$log = "C:\Users\Gurru Sudharsan\Downloads\goto\pip_install.log"

Write-Host "Starting pip install..." -ForegroundColor Cyan
& $pip install -r $req *> $log
Write-Host "pip install exit code: $LASTEXITCODE" -ForegroundColor Yellow

# Verify
Write-Host "Verifying install..." -ForegroundColor Cyan
& $python -c "import fastapi, uvicorn, pymysql, sqlalchemy, groq; print('ALL DEPS OK')"
