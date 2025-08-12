# Git 자동 백업 스크립트
# 사용법: .\auto-backup.ps1 [커밋 메시지]

param(
    [string]$CommitMessage = "자동 백업: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

Write-Host "=== Git 자동 백업 시작 ===" -ForegroundColor Green

# 1. 현재 Git 상태 확인
Write-Host "1. Git 상태 확인 중..." -ForegroundColor Yellow
$status = git status --porcelain

if (-not $status) {
    Write-Host "변경사항이 없습니다. 백업이 필요하지 않습니다." -ForegroundColor Cyan
    exit 0
}

Write-Host "변경된 파일들:" -ForegroundColor Cyan
git status --short

# 2. 모든 변경사항을 스테이징
Write-Host "`n2. 변경사항을 스테이징 중..." -ForegroundColor Yellow
git add .

# 3. 커밋 생성
Write-Host "3. 커밋 생성 중..." -ForegroundColor Yellow
$commitResult = git commit -m $CommitMessage

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 백업 완료: $CommitMessage" -ForegroundColor Green
} else {
    Write-Host "❌ 백업 실패!" -ForegroundColor Red
    Write-Host $commitResult
    exit 1
}

# 4. 원격 저장소에 푸시 (선택사항)
$pushChoice = Read-Host "`n원격 저장소에 푸시하시겠습니까? (y/n)"
if ($pushChoice -eq "y" -or $pushChoice -eq "Y") {
    Write-Host "4. 원격 저장소에 푸시 중..." -ForegroundColor Yellow
    git push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ 푸시 완료!" -ForegroundColor Green
    } else {
        Write-Host "❌ 푸시 실패!" -ForegroundColor Red
    }
}

Write-Host "`n=== 백업 완료 ===" -ForegroundColor Green
