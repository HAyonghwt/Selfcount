# ParkScore - 파크골프 대회 관리 시스템

이 프로젝트는 Next.js, Firebase, ShadCN UI를 사용하여 구축된 파크골프 대회 점수 관리 시스템입니다.

## 시작하기

프로젝트를 로컬 환경에서 실행하려면 다음 단계를 따르세요.

### 1. 전제 조건

- [Node.js](https://nodejs.org/) (v18 이상 권장)
- [Firebase](https://firebase.google.com/) 프로젝트

### 2. 저장소 복제

```bash
git clone <repository-url>
cd <repository-directory>
```

### 3. 종속성 설치

```bash
npm install
```

### 4. Firebase 설정

이 앱을 Firebase 프로젝트에 연결하려면, 환경 변수를 설정해야 합니다.

1.  프로젝트의 루트 디렉토리에 있는 `.env.example` 파일을 복사하여 `.env.local`이라는 새 파일을 만듭니다.
2.  Firebase 콘솔의 프로젝트 설정에서 웹 앱의 설정 값을 찾습니다.
3.  `.env.local` 파일을 열고, 각 변수에 맞는 실제 Firebase 프로젝트 값을 붙여넣습니다.

    ```bash
    # .env.local

    NEXT_PUBLIC_FIREBASE_API_KEY="여기에-실제-API-키를-넣으세요"
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="여기에-실제-인증-도메인을-넣으세요"
    # ... 다른 값들도 모두 채워주세요
    ```

**경고:** `.env.local` 파일은 민감한 정보를 포함하고 있으므로, 절대로 공개된 GitHub 저장소에 올리면 안 됩니다. 이 프로젝트의 `.gitignore` 파일에 이미 `.env.local`이 포함되어 있어 자동으로 제외되지만, 항상 주의해야 합니다.

### 5. 개발 서버 실행

이제 개발 서버를 시작할 수 있습니다.

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 앱을 확인하세요.
