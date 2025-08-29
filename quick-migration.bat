@echo off
echo ========================================
echo 🔥 Firebase 마이그레이션 도구
echo ========================================
echo.

REM 필요한 파일 확인
if not exist "source-firebase-key.json" (
    echo ❌ source-firebase-key.json 파일이 없습니다.
    echo    원본 Firebase 프로젝트의 서비스 계정 키를 다운로드하세요.
    pause
    exit /b 1
)

if not exist "target-firebase-key.json" (
    echo ❌ target-firebase-key.json 파일이 없습니다.
    echo    대상 Firebase 프로젝트의 서비스 계정 키를 다운로드하세요.
    pause
    exit /b 1
)

echo ✅ 서비스 계정 키 파일 확인 완료
echo.

REM firebase-admin 설치 확인
echo 📦 의존성 확인 중...
if not exist "node_modules\firebase-admin" (
    echo 🔧 firebase-admin 설치 중...
    npm install firebase-admin
    if errorlevel 1 (
        echo ❌ 의존성 설치 실패
        pause
        exit /b 1
    )
)

echo ✅ 의존성 확인 완료
echo.

REM 사용자에게 선택 메뉴 제공
:menu
echo 작업을 선택하세요:
echo.
echo 1. 백업만 실행
echo 2. 백업 + 마이그레이션
echo 3. 백업 + 마이그레이션 + 검증 (추천)
echo 4. 검증만 실행
echo 5. 종료
echo.
set /p choice="선택 (1-5): "

if "%choice%"=="1" goto backup
if "%choice%"=="2" goto migrate
if "%choice%"=="3" goto full
if "%choice%"=="4" goto verify
if "%choice%"=="5" goto end
goto menu

:backup
echo.
echo 💾 백업 실행 중...
node firebase-migration.js --mode=backup
if errorlevel 1 (
    echo ❌ 백업 실패
    pause
    goto menu
)
echo ✅ 백업 완료!
pause
goto menu

:migrate
echo.
echo 🚀 마이그레이션 실행 중...
node firebase-migration.js --mode=migrate
if errorlevel 1 (
    echo ❌ 마이그레이션 실패
    pause
    goto menu
)
echo ✅ 마이그레이션 완료!
pause
goto menu

:full
echo.
echo 🎯 전체 마이그레이션 실행 중...
echo    (백업 + 마이그레이션 + 검증)
node firebase-migration.js --mode=full
if errorlevel 1 (
    echo ❌ 마이그레이션 실패
    pause
    goto menu
)
echo 🎉 전체 마이그레이션 완료!
echo.
echo 다음 단계:
echo 1. .env.local 파일에서 새 Firebase 설정으로 변경
echo 2. npm run dev로 앱 재시작
echo 3. 모든 기능 정상 작동 확인
pause
goto menu

:verify
echo.
echo 🔍 검증 실행 중...
node firebase-migration.js --mode=verify
if errorlevel 1 (
    echo ❌ 검증 실패
    pause
    goto menu
)
echo ✅ 검증 완료!
pause
goto menu

:end
echo.
echo 👋 마이그레이션 도구를 종료합니다.
echo 백업 파일은 firebase-backup 폴더에 저장되어 있습니다.
pause
