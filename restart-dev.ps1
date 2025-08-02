Write-Host "ParkScore 개발 서버 재시작 중..." -ForegroundColor Green
Set-Location E:\ParkScore

Write-Host ".next 폴더 삭제 중..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
}

Write-Host "node_modules 캐시 삭제 중..." -ForegroundColor Yellow
if (Test-Path "node_modules\.cache") {
    Remove-Item -Recurse -Force "node_modules\.cache"
}

Write-Host "개발 서버 시작 중..." -ForegroundColor Green
npm run dev 