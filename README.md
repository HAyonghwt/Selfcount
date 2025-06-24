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

이 앱을 Firebase 프로젝트에 연결하려면, 소스 코드의 특정 파일을 수정해야 합니다.

1.  **`src/lib/firebase.ts`** 파일을 엽니다.
2.  파일 안에 있는 `firebaseConfig` 객체를 찾습니다.
3.  `your-api-key`, `your-project-id` 등으로 되어 있는 **플레이스홀더 값들을 실제 사용자의 Firebase 프로젝트 값으로 교체**합니다. 이 값들은 Firebase 콘솔의 프로젝트 설정에서 찾을 수 있습니다.

    ```typescript
    // src/lib/firebase.ts

    const firebaseConfig: FirebaseOptions = {
      apiKey: "여기에-실제-API-키를-넣으세요",
      authDomain: "여기에-실제-인증-도메인을-넣으세요",
      // ... 다른 값들도 모두 채워주세요
    };
    ```

**경고:** 이 파일에는 민감한 정보가 포함되어 있으므로, 이 코드를 공개된 GitHub 저장소에 올릴 경우 키가 노출될 위험이 있습니다. 비공개 저장소를 사용하거나, 프로덕션 환경에서는 환경 변수를 사용하는 것을 강력히 권장합니다.

### 5. 개발 서버 실행

이제 개발 서버를 시작할 수 있습니다.

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 앱을 확인하세요.
