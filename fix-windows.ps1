# Windows 전용 Next.js 강력 복구 스크립트
Write-Host "🔧 Windows Next.js 강력 복구 중..." -ForegroundColor Yellow

# 1. 모든 Node.js 프로세스 강제 종료
Write-Host "🛑 모든 Node.js 프로세스 종료 중..." -ForegroundColor Red
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# 2. 포트 사용 프로세스 확인 및 종료
Write-Host "🔍 포트 3000, 3001 사용 프로세스 확인..." -ForegroundColor Cyan
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue

if ($port3000) {
    Write-Host "🛑 포트 3000 사용 프로세스 종료 중..." -ForegroundColor Red
    $port3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
}

if ($port3001) {
    Write-Host "🛑 포트 3001 사용 프로세스 종료 중..." -ForegroundColor Red
    $port3001 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
}

Start-Sleep -Seconds 2

# 3. .next 폴더 완전 삭제
Write-Host "🗑️ .next 폴더 완전 삭제 중..." -ForegroundColor Cyan
if (Test-Path ".next") {
    Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✅ .next 폴더 삭제 완료" -ForegroundColor Green
}

# 4. node_modules 캐시 정리
Write-Host "🧹 npm 캐시 정리 중..." -ForegroundColor Cyan
npm cache clean --force 2>$null
Write-Host "✅ npm 캐시 정리 완료" -ForegroundColor Green

# 5. Windows 임시 파일 정리
Write-Host "🧹 Windows 임시 파일 정리 중..." -ForegroundColor Cyan
Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "✅ 임시 파일 정리 완료" -ForegroundColor Green

# 6. 안정적인 개발 서버 시작
Write-Host "🚀 안정적인 개발 서버 시작..." -ForegroundColor Cyan
Write-Host "💡 다음 명령어 중 하나를 선택하세요:" -ForegroundColor Yellow
Write-Host "   npm run dev:stable    (터보 모드)" -ForegroundColor White
Write-Host "   npm run dev:no-cache  (캐시 없음)" -ForegroundColor White
Write-Host "   npm run dev:win       (메모리 증가)" -ForegroundColor White

Write-Host "✅ Windows 강력 복구 완료!" -ForegroundColor Green
