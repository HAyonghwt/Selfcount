# 🔥 Firebase 프로젝트 간 마이그레이션 가이드

이 가이드는 현재 Firebase 프로젝트에서 새로운 Firebase 프로젝트로 모든 데이터를 안전하게 이동하는 방법을 설명합니다.

## 📋 준비사항

### 1. 새 Firebase 프로젝트 생성

1. [Firebase 콘솔](https://console.firebase.google.com/)에 접속
2. **"프로젝트 추가"** 클릭
3. 프로젝트 이름 입력 (예: `parkcore-new`)
4. **Realtime Database** 활성화
   - Database > Realtime Database > "데이터베이스 만들기"
   - **테스트 모드**로 시작 (나중에 보안 규칙 설정)

### 2. 서비스 계정 키 생성

#### 원본 프로젝트 (현재 프로젝트)
1. Firebase 콘솔 > 프로젝트 설정 > 서비스 계정
2. **"새 비공개 키 생성"** 클릭
3. JSON 파일 다운로드
4. 파일명을 `source-firebase-key.json`으로 변경

#### 대상 프로젝트 (새 프로젝트)
1. 새 Firebase 프로젝트 콘솔 > 프로젝트 설정 > 서비스 계정
2. **"새 비공개 키 생성"** 클릭
3. JSON 파일 다운로드
4. 파일명을 `target-firebase-key.json`으로 변경

### 3. 마이그레이션 도구 설치

```bash
# 의존성 설치
npm install firebase-admin

# 또는 migration-package.json 사용
cp migration-package.json package.json
npm install
```

## 🚀 마이그레이션 실행

### 1단계: 백업 (필수)

```bash
node firebase-migration.js --mode=backup
```

**결과:**
- `firebase-backup/` 디렉토리에 백업 파일 생성
- `firebase-backup-YYYY-MM-DD-HH-mm-ss.json` 파일
- `backup-summary-YYYY-MM-DD-HH-mm-ss.json` 요약 파일

### 2단계: 마이그레이션 실행

```bash
node firebase-migration.js --mode=migrate
```

**실행 내용:**
- 자동으로 백업 먼저 실행
- 모든 데이터 경로를 새 프로젝트로 복사:
  - `config` - 앱 설정
  - `players` - 선수 정보
  - `scores` - 점수 데이터
  - `scoreLogs` - 점수 로그
  - `tournaments` - 대회 정보

### 3단계: 검증

```bash
node firebase-migration.js --mode=verify
```

**검증 항목:**
- 원본과 대상 데이터 완전 일치 확인
- 각 경로별 항목 수 비교
- 데이터 무결성 검증

### 🎯 한 번에 모든 작업 실행

```bash
node firebase-migration.js --mode=full
```

**실행 순서:**
1. 백업
2. 마이그레이션
3. 검증

## 📊 마이그레이션할 데이터

| 경로 | 설명 | 예상 항목 수 |
|------|------|-------------|
| `config` | 앱 설정 (앱 이름, 도메인 등) | 1 |
| `players` | 선수 정보 | 100-500 |
| `scores` | 점수 데이터 | 1000-5000 |
| `scoreLogs` | 점수 변경 로그 | 5000-20000 |
| `tournaments` | 대회 정보 | 10-50 |

## 🛡️ 보안 규칙 설정

마이그레이션 완료 후 새 프로젝트에 보안 규칙을 설정하세요:

```json
{
  "rules": {
    ".read": true,
    ".write": "auth != null",
    "scoreLogs": {
      ".indexOn": ["playerId"]
    },
    "scores": {
      "$playerId": {
        "$courseId": {
          "$holeNumber": {
            ".write": "auth != null"
          }
        }
      }
    },
    "players": {
      ".read": true,
      ".write": "auth != null"
    },
    "tournaments": {
      ".read": true,
      ".write": "auth != null"
    },
    "config": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

## 🔧 앱 설정 변경

마이그레이션 완료 후 앱에서 새 Firebase 프로젝트를 사용하도록 설정:

### 1. 새 Firebase 설정 값 확인

새 Firebase 프로젝트 콘솔에서:
1. 프로젝트 설정 > 일반 > 내 앱
2. 웹 앱 추가 (없는 경우)
3. Firebase SDK 설정 값 복사

### 2. 환경 변수 업데이트

`.env.local` 파일 수정:

```bash
# 새 Firebase 프로젝트 설정
NEXT_PUBLIC_FIREBASE_API_KEY="새-API-키"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="새-프로젝트-ID.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_DATABASE_URL="https://새-프로젝트-ID-default-rtdb.firebaseio.com/"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="새-프로젝트-ID"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="새-프로젝트-ID.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="새-센더-ID"
NEXT_PUBLIC_FIREBASE_APP_ID="새-앱-ID"
```

### 3. 앱 재시작

```bash
npm run dev
```

## 📝 마이그레이션 로그

모든 마이그레이션 작업은 `firebase-backup/` 디렉토리에 로그가 저장됩니다:

- `firebase-backup-*.json` - 전체 데이터 백업
- `backup-summary-*.json` - 백업 요약
- `migration-result-*.json` - 마이그레이션 결과
- `verification-*.json` - 검증 결과

## 🚨 주의사항

1. **백업 필수**: 마이그레이션 전 반드시 백업을 실행하세요
2. **서비스 계정 보안**: JSON 키 파일은 안전한 곳에 보관하세요
3. **테스트 먼저**: 중요한 데이터라면 테스트 환경에서 먼저 실행하세요
4. **인덱스 설정**: 마이그레이션 후 Firebase 콘솔에서 인덱스 설정 확인
5. **보안 규칙**: 마이그레이션 후 반드시 보안 규칙을 설정하세요

## 🆘 문제 해결

### 권한 오류
```
Error: Insufficient permissions
```
**해결:** 서비스 계정에 Editor 또는 Owner 권한 부여

### 네트워크 오류
```
Error: Network timeout
```
**해결:** 인터넷 연결 확인 후 재시도

### 데이터 불일치
```
Verification failed
```
**해결:** 백업 파일에서 수동으로 누락된 데이터 복원

## 📞 지원

문제가 발생하면 마이그레이션 로그 파일과 함께 문의해주세요.

---

🎉 **마이그레이션 완료 후 새로운 Firebase 프로젝트에서 앱이 정상 작동하는지 확인하세요!**
