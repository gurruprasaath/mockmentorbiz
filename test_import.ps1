$python = "C:\Users\Gurru Sudharsan\AppData\Local\Programs\Python\Python312\python.exe"
$backendDir = "C:\Users\Gurru Sudharsan\Downloads\goto\backend"
Set-Location $backendDir
$env:PYTHONPATH = $backendDir

# Test import first
Write-Host "Testing imports..." -ForegroundColor Cyan
$result = & $python -c "from app.main import app; print('IMPORT OK')" 2>&1
Write-Host $result
