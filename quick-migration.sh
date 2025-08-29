#!/bin/bash

echo "========================================"
echo "🔥 Firebase 마이그레이션 도구"
echo "========================================"
echo

# 필요한 파일 확인
if [ ! -f "source-firebase-key.json" ]; then
    echo "❌ source-firebase-key.json 파일이 없습니다."
    echo "   원본 Firebase 프로젝트의 서비스 계정 키를 다운로드하세요."
    exit 1
fi

if [ ! -f "target-firebase-key.json" ]; then
    echo "❌ target-firebase-key.json 파일이 없습니다."
    echo "   대상 Firebase 프로젝트의 서비스 계정 키를 다운로드하세요."
    exit 1
fi

echo "✅ 서비스 계정 키 파일 확인 완료"
echo

# firebase-admin 설치 확인
echo "📦 의존성 확인 중..."
if [ ! -d "node_modules/firebase-admin" ]; then
    echo "🔧 firebase-admin 설치 중..."
    npm install firebase-admin
    if [ $? -ne 0 ]; then
        echo "❌ 의존성 설치 실패"
        exit 1
    fi
fi

echo "✅ 의존성 확인 완료"
echo

# 사용자에게 선택 메뉴 제공
while true; do
    echo "작업을 선택하세요:"
    echo
    echo "1. 백업만 실행"
    echo "2. 백업 + 마이그레이션"
    echo "3. 백업 + 마이그레이션 + 검증 (추천)"
    echo "4. 검증만 실행"
    echo "5. 종료"
    echo
    read -p "선택 (1-5): " choice

    case $choice in
        1)
            echo
            echo "💾 백업 실행 중..."
            node firebase-migration.js --mode=backup
            if [ $? -eq 0 ]; then
                echo "✅ 백업 완료!"
            else
                echo "❌ 백업 실패"
            fi
            echo
            read -p "계속하려면 Enter를 누르세요..."
            ;;
        2)
            echo
            echo "🚀 마이그레이션 실행 중..."
            node firebase-migration.js --mode=migrate
            if [ $? -eq 0 ]; then
                echo "✅ 마이그레이션 완료!"
            else
                echo "❌ 마이그레이션 실패"
            fi
            echo
            read -p "계속하려면 Enter를 누르세요..."
            ;;
        3)
            echo
            echo "🎯 전체 마이그레이션 실행 중..."
            echo "   (백업 + 마이그레이션 + 검증)"
            node firebase-migration.js --mode=full
            if [ $? -eq 0 ]; then
                echo "🎉 전체 마이그레이션 완료!"
                echo
                echo "다음 단계:"
                echo "1. .env.local 파일에서 새 Firebase 설정으로 변경"
                echo "2. npm run dev로 앱 재시작"
                echo "3. 모든 기능 정상 작동 확인"
            else
                echo "❌ 마이그레이션 실패"
            fi
            echo
            read -p "계속하려면 Enter를 누르세요..."
            ;;
        4)
            echo
            echo "🔍 검증 실행 중..."
            node firebase-migration.js --mode=verify
            if [ $? -eq 0 ]; then
                echo "✅ 검증 완료!"
            else
                echo "❌ 검증 실패"
            fi
            echo
            read -p "계속하려면 Enter를 누르세요..."
            ;;
        5)
            echo
            echo "👋 마이그레이션 도구를 종료합니다."
            echo "백업 파일은 firebase-backup 폴더에 저장되어 있습니다."
            break
            ;;
        *)
            echo "잘못된 선택입니다. 1-5 중에서 선택하세요."
            ;;
    esac
done
