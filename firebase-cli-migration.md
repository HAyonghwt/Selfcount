# 🔥 Firebase CLI로 초간단 마이그레이션

Firebase CLI를 사용하면 **명령어 몇 개**로 마이그레이션을 완료할 수 있습니다!

## 🚀 준비사항

### 1. Firebase CLI 설치
```bash
npm install -g firebase-tools
```

### 2. Firebase 로그인
```bash
firebase login
```

## 📥 **방법 1: Export/Import 명령어**

### 1단계: 원본 프로젝트에서 데이터 내보내기
```bash
# 원본 프로젝트로 전환
firebase use your-source-project-id

# 전체 Realtime Database 내보내기
firebase database:get / --output=database-backup.json

# 특정 경로만 내보내기 (선택사항)
firebase database:get /players --output=players.json
firebase database:get /scores --output=scores.json  
firebase database:get /scoreLogs --output=scoreLogs.json
firebase database:get /tournaments --output=tournaments.json
firebase database:get /config --output=config.json
```

### 2단계: 새 프로젝트에 데이터 가져오기
```bash
# 새 프로젝트로 전환
firebase use your-new-project-id

# 전체 데이터 가져오기
firebase database:set / database-backup.json

# 또는 경로별로 개별 가져오기
firebase database:set /players players.json
firebase database:set /scores scores.json
firebase database:set /scoreLogs scoreLogs.json  
firebase database:set /tournaments tournaments.json
firebase database:set /config config.json
```

### 3단계: 검증
```bash
# 데이터 확인
firebase database:get /players --output=verify-players.json
firebase database:get /scores --output=verify-scores.json

# 파일 비교 (Windows)
fc players.json verify-players.json
fc scores.json verify-scores.json

# 파일 비교 (Linux/Mac)
diff players.json verify-players.json
diff scores.json verify-scores.json
```

## 🎯 **방법 2: 웹 콘솔에서 직접**

### 1단계: 원본 프로젝트에서 내보내기
1. [Firebase 콘솔](https://console.firebase.google.com/) 접속
2. 원본 프로젝트 선택
3. **Realtime Database** > **데이터** 탭
4. 루트 노드 선택 후 **⋮** 메뉴 > **JSON 내보내기**
5. `database-backup.json` 파일 다운로드

### 2단계: 새 프로젝트에 가져오기
1. 새 Firebase 프로젝트 선택
2. **Realtime Database** > **데이터** 탭  
3. 루트 노드 선택 후 **⋮** 메뉴 > **JSON 가져오기**
4. `database-backup.json` 파일 업로드

## ⚡ **방법 3: 한 줄 스크립트**

### Windows (PowerShell)
```powershell
# 백업 + 마이그레이션을 한 번에
firebase use source-project-id; firebase database:get / --output=backup.json; firebase use target-project-id; firebase database:set / backup.json
```

### Linux/Mac (Bash)
```bash
# 백업 + 마이그레이션을 한 번에  
firebase use source-project-id && firebase database:get / --output=backup.json && firebase use target-project-id && firebase database:set / backup.json
```

## 🔧 **선택적 데이터 마이그레이션**

특정 데이터만 옮기고 싶다면:

```bash
# 원본에서 필요한 데이터만 추출
firebase use source-project-id
firebase database:get /players --output=players.json
firebase database:get /scores --output=scores.json

# 새 프로젝트에 선택적 업로드
firebase use target-project-id  
firebase database:set /players players.json
firebase database:set /scores scores.json
```

## ⚠️ **주의사항**

1. **백업 필수**: 작업 전 반드시 백업
2. **보안 규칙**: 마이그레이션 후 보안 규칙 재설정
3. **인덱스**: Firebase 콘솔에서 인덱스 설정 확인
4. **환경 변수**: 앱의 `.env.local` 파일 업데이트

## 🎉 **장점**

- ✅ **초간단**: 명령어 2-3개로 완료
- ✅ **안전함**: Firebase 공식 도구 사용
- ✅ **빠름**: 직접 Firebase 서버 간 전송
- ✅ **검증됨**: 수많은 프로젝트에서 사용

이 방법이 **가장 간단하고 안전**합니다! 🚀
