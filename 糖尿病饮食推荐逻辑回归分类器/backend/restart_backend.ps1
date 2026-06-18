# 关闭占用 8000 端口的旧 Python 进程，再启动新版后端
$connections = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
foreach ($conn in $connections) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

Set-Location $PSScriptRoot
Write-Host "Starting backend on http://127.0.0.1:8000 ..."
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
