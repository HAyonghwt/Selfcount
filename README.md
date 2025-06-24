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

### 4. 환경 변수 설정

프로젝트를 Firebase에 연결하려면 환경 변수 설정이 필요합니다.

1.  프로젝트 루트에 있는 `.env.local.example` 파일의 복사본을 만들어 `.env.local`이라는 이름으로 저장합니다.

    ```bash
    cp .env.local.example .env.local
    ```

2.  Firebase 콘솔에서 프로젝트의 웹 앱 구성 값을 찾아 `.env.local` 파일에 채워넣습니다.

    ```dotenv
    NEXT_PUBLIC_FIREBASE_API_KEY="your-api-key"
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-auth-domain"
    NEXT_PUBLIC_FIREBASE_DATABASE_URL="your-database-url"
    NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-messaging-sender-id"
    NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"
    ```

### 5. 개발 서버 실행

이제 개발 서버를 시작할 수 있습니다.

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 앱을 확인하세요.
