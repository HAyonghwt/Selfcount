# Next.js 빌드 에러 자동 복구 스크립트
Write-Host "🔧 Next.js 빌드 에러 복구 중..." -ForegroundColor Yellow

# 1. 개발 서버 중지 (실행 중인 경우)
Write-Host "📋 실행 중인 프로세스 확인..." -ForegroundColor Cyan
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "🛑 Node.js 프로세스 종료 중..." -ForegroundColor Red
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# 2. .next 폴더 삭제
Write-Host "🗑️ .next 폴더 삭제 중..." -ForegroundColor Cyan
if (Test-Path ".next") {
    Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✅ .next 폴더 삭제 완료" -ForegroundColor Green
} else {
    Write-Host "ℹ️ .next 폴더가 이미 없습니다" -ForegroundColor Blue
}

# 3. node_modules 캐시 정리
Write-Host "🧹 node_modules 캐시 정리 중..." -ForegroundColor Cyan
if (Test-Path "node_modules") {
    # npm 캐시 정리
    npm cache clean --force 2>$null
    Write-Host "✅ npm 캐시 정리 완료" -ForegroundColor Green
}

# 4. package-lock.json 삭제 (선택적)
Write-Host "🔍 package-lock.json 확인 중..." -ForegroundColor Cyan
if (Test-Path "package-lock.json") {
    $choice = Read-Host "package-lock.json을 삭제하고 다시 설치하시겠습니까? (y/n)"
    if ($choice -eq "y" -or $choice -eq "Y") {
        Remove-Item "package-lock.json" -Force
        Write-Host "📦 의존성 재설치 중..." -ForegroundColor Cyan
        npm install
        Write-Host "✅ 의존성 재설치 완료" -ForegroundColor Green
    }
}

# 5. 개발 서버 재시작
Write-Host "🚀 개발 서버 시작 중..." -ForegroundColor Cyan
Write-Host "💡 다음 명령어로 서버를 시작하세요:" -ForegroundColor Yellow
Write-Host "   npm run dev" -ForegroundColor White

Write-Host "✅ 복구 완료!" -ForegroundColor Green
