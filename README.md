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

## 6. 배포 (Firebase App Hosting)

이 앱은 Firebase App Hosting을 사용하여 쉽게 배포할 수 있도록 설정되어 있습니다. GitHub에 코드를 올린 후, 다음 단계에 따라 실제 웹사이트를 배포할 수 있습니다.

1.  **Firebase 콘솔 연결**:
    *   사용자의 Firebase 프로젝트로 이동하여 왼쪽 메뉴에서 **빌드 > App Hosting**을 선택합니다.
    *   GitHub 계정과 이 프로젝트의 저장소(repository)를 연결하여 새 백엔드를 만듭니다.

2.  **환경 변수 설정**:
    *   백엔드 설정 과정에서 **환경 변수(Environment Variables)**를 구성하는 단계가 나타납니다. 이 단계가 가장 중요합니다.
    *   로컬 컴퓨터에 있는 **`.env.local`** 파일의 내용을 여기에 입력해야 합니다.
    *   예를 들어, Firebase 콘솔에 `NEXT_PUBLIC_FIREBASE_API_KEY`라는 입력란이 보이면, `.env.local` 파일에서 해당 값을 복사하여 붙여넣습니다. 다른 모든 Firebase 관련 변수도 동일하게 설정합니다.

3.  **배포 완료**:
    *   환경 변수 설정을 완료하고 배포를 시작합니다.
    *   이제 Firebase App Hosting이 GitHub에서 코드를 가져와 빌드하고, 우리가 안전하게 입력한 환경 변수(API 키 등)를 주입하여 라이브 앱을 완성합니다.

이 과정을 통해 민감한 정보는 GitHub에 노출되지 않고, 실제 운영되는 서버에만 안전하게 보관됩니다.
