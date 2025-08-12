# Next.js 빌드 에러 해결 가이드

## 🚨 빌드 에러가 발생했을 때

### 1단계: 간단한 복구 (권장)
```bash
npm run dev:clean
```

### 2단계: 캐시까지 정리
```bash
npm run dev:fresh
```

### 3단계: 자동 복구 스크립트 실행
```bash
npm run dev:fix
```

### 4단계: 완전 초기화 (최후의 수단)
```bash
npm run dev:reset
```

## 🔧 수동 복구 방법

### PowerShell에서 직접 실행
```powershell
# 1. Node.js 프로세스 종료
taskkill /f /im node.exe

# 2. .next 폴더 삭제
Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue

# 3. 캐시 정리
npm cache clean --force

# 4. 개발 서버 재시작
npm run dev
```

### Windows CMD에서 실행
```cmd
# 1. Node.js 프로세스 종료
taskkill /f /im node.exe

# 2. .next 폴더 삭제
rmdir /s /q .next

# 3. 캐시 정리
npm cache clean --force

# 4. 개발 서버 재시작
npm run dev
```

## 🛠️ 근본적 해결책

### 1. Node.js 버전 확인
```bash
node --version
npm --version
```
- Node.js 18+ 권장
- npm 9+ 권장

### 2. 메모리 설정 (Windows)
```bash
# package.json의 dev:win 스크립트 사용
npm run dev:win
```

### 3. 안티바이러스 예외 설정
- 프로젝트 폴더를 안티바이러스 실시간 검사에서 제외
- Windows Defender 실시간 보호 일시 비활성화

### 4. 파일 경로 문제 해결
- 프로젝트 경로에 한글이나 특수문자가 없도록 설정
- 경로가 너무 길지 않도록 주의

## 📋 예방 방법

### 1. 정기적인 캐시 정리
```bash
# 주 1회 실행 권장
npm run clean
```

### 2. 개발 서버 재시작
- 코드 변경 후 30분 이상 사용 시 서버 재시작 권장
- 메모리 사용량이 높아지면 재시작

### 3. 파일 감시 설정 최적화
- next.config.mjs에서 watchOptions 설정 확인
- 불필요한 파일은 감시에서 제외

## 🆘 여전히 문제가 있다면

1. **Node.js 재설치**: 최신 LTS 버전으로 업데이트
2. **npm 캐시 완전 정리**: `npm cache clean --force`
3. **프로젝트 재클론**: 깨끗한 상태에서 다시 시작
4. **Windows 업데이트**: 시스템 업데이트 확인

## 📞 추가 도움

- Next.js 공식 문서: https://nextjs.org/docs
- GitHub Issues: 프로젝트 저장소에서 이슈 확인
