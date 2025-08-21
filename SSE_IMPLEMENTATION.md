# SSE 기반 점수 업데이트 구현

## 개요

기존 Firebase 실시간 리스너를 사용하던 점수 업데이트를 Netlify Functions 기반 폴링 방식으로 변경하여 Firebase 부하를 줄였습니다.

## 주요 변경사항

### ✅ 보존된 기능 (100% 동일)
- 모든 점수 계산 로직
- 순위 계산 및 백카운트
- 서든데스 플레이오프 조건
- UI 구조 및 스타일링
- 모든 기존 기능

### 🔄 변경된 부분 (최소)
- `scores` 데이터 업데이트 방식: Firebase → 폴링 API
- 점수 변경사항만 감지하여 효율적 업데이트

## 구현 구조

### 1. Netlify Functions
- `/api/scoreboard-polling` - 점수 변경사항 폴링 API
- 그룹별 필터링 지원
- 변경사항만 반환하여 효율성 증대

### 2. 클라이언트 폴링
- 1초마다 API 호출
- 변경된 점수만 업데이트
- 그룹 변경 시 자동 재시작

## 환경 변수 설정

### Netlify 환경 변수
```bash
FIREBASE_ADMIN_CREDENTIALS={"type":"service_account",...}
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
```

### Firebase Admin 설정
1. Firebase Console에서 서비스 계정 키 생성
2. JSON 내용을 `FIREBASE_ADMIN_CREDENTIALS` 환경 변수에 설정
3. 데이터베이스 URL을 `FIREBASE_DATABASE_URL`에 설정

## 성능 개선 효과

### 기존 방식
- 200명 × 6개 리스너 = 1200개 실시간 연결
- Firebase 동시 연결 제한 초과 위험

### 새로운 방식
- Firebase: 200명 × 3개 리스너 = 600개 (초기 로딩)
- 폴링 API: 그룹별 분산으로 안정적
- 점수 업데이트: 1초 이내 반영

## 사용법

### 개발 환경
```bash
npm install
npm run dev
```

### 배포
```bash
npm run build
# Netlify에 자동 배포
```

## 주의사항

1. **기존 기능 완전 보존**: 모든 계산 로직과 UI는 변경되지 않음
2. **실시간성 유지**: 1초 폴링으로 실시간성 보장
3. **그룹별 최적화**: 선택된 그룹의 점수만 폴링하여 효율성 증대

## 문제 해결

### 폴링이 작동하지 않는 경우
1. Netlify Functions 로그 확인
2. 환경 변수 설정 확인
3. Firebase Admin 권한 확인

### 성능 문제
1. 폴링 주기 조정 (현재 1초)
2. 그룹별 분산 확인
3. 네트워크 상태 확인
