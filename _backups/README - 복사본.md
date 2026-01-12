# ParkScore - 파크골프 대회 관리 시스템

이 프로젝트는 Next.js, Firebase, ShadCN UI를 사용하여 구축된 파크골프 대회 점수 관리 시스템입니다.

## 시작하기

프로젝트를 로컬 환경에서 실행하려면 다음 단계를 따르세요.

### 1. 전제 조건

- [Node.js](https://nodejs.org/) (v18 이상 권장)
- [Firebase](https://firebase.google.com/) 계정

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

1.  **Firebase 프로젝트 생성:** 먼저 [Firebase 콘솔](https://console.firebase.google.com/)에서 이 앱을 위한 새 프로젝트를 만듭니다.
2.  **웹 앱 추가:** 프로젝트 설정에서 웹 앱을 추가하고, Firebase가 제공하는 설정 값(apiKey, authDomain 등)을 확인합니다.
3.  **`.env.local` 파일 생성:** 프로젝트의 루트 디렉토리에 있는 `.env.example` 파일을 복사하여 `.env.local`이라는 새 파일을 만듭니다.
4.  **환경 변수 입력:** `.env.local` 파일을 열고, 각 변수에 맞는 실제 Firebase 프로젝트 값을 붙여넣습니다.

    ```bash
    # .env.local 예시

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

---

## Netlify 배포 가이드

이 프로젝트를 Netlify를 통해 웹에 배포할 수 있습니다.

1.  **GitHub 저장소에 푸시:** 로컬에서 변경한 코드를 자신의 GitHub 저장소에 푸시합니다.
2.  **Netlify에서 새 사이트 만들기:** Netlify에 로그인한 후, "Add new site" > "Import an existing project"를 선택하고, 자신의 GitHub 저장소를 연결합니다.
3.  **빌드 설정 확인:** Netlify가 자동으로 Next.js 프로젝트임을 감지합니다. 기본 빌드 설정(`next build`)을 그대로 사용하면 됩니다.
4.  **환경 변수 설정:** 가장 중요한 단계입니다.
    - Netlify 사이트 대시보드에서 `Site configuration` > `Environment variables` 메뉴로 이동합니다.
    - `Add a variable`을 클릭하여, 로컬의 `.env.local` 파일에 있던 모든 `NEXT_PUBLIC_...` 키와 값들을 **하나씩** 똑같이 추가해줍니다.
5.  **사이트 배포:** `Deploys` 탭으로 이동하여 `Trigger deploy` > `Deploy site`를 클릭하여 환경 변수가 적용된 상태로 사이트를 다시 빌드하고 배포합니다.

---

## 여러 대회(지역)를 위한 앱 복제 및 배포 방법

이 앱 하나로 용인, 제천 등 여러 지역의 대회를 독립적으로 운영할 수 있습니다. 각 대회는 별도의 데이터베이스를 가집니다.

1.  **새 Firebase 프로젝트 만들기:** 분리하고 싶은 대회(예: 제천 대회)를 위한 **새로운 Firebase 프로젝트**를 만듭니다.
2.  **새 Netlify 사이트 만들기:**
    - Netlify에서 **새로운 사이트**를 추가합니다.
    - 기존과 **동일한 GitHub 저장소**를 이 새 사이트에 연결합니다.
3.  **새 환경 변수 설정:**
    - 새로 만든 Netlify 사이트의 `Environment variables` 설정으로 갑니다.
    - 1번에서 만든 **'제천'용 Firebase 프로젝트의 키**들을 환경 변수로 등록합니다.
4.  **재배포:** `Trigger deploy`를 통해 새 사이트를 배포합니다.
5.  **(선택) 앱 이름 변경:**
    - 배포된 새 사이트의 `/super-admin` 페이지에 접속합니다.
    - '단체 이름'을 '제천시 파크골프 협회'와 같이 고유한 이름으로 변경하고 저장합니다.

이제 동일한 코드 베이스를 사용하지만, 데이터와 설정이 완전히 분리된 두 개의 독립적인 대회 관리 앱이 생성되었습니다.
