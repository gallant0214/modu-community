# 모두의 지도사 커뮤니티 - iOS 앱 개발 가이드 (Expo Go)

> 이 가이드는 맥북에서 VS Code + Claude Code를 사용하여, 기존 Android 앱과 동일한 iOS 앱을 Expo(React Native)로 만들기 위한 전체 문서입니다.

---

## 1. 프로젝트 개요

| 항목 | 값 |
|------|-----|
| 서비스명 | 모두의 지도사 커뮤니티 |
| 패키지명 (Android) | com.moduji.app |
| iOS Bundle ID (추천) | com.moduji.community |
| API 서버 | https://moducm.com |
| Firebase 프로젝트 | moducm-f2edf |
| 현재 Android 버전 | 1.9.4 (versionCode 26) |

---

## 2. 맥북 환경 설정

### 2-1. 필수 소프트웨어 설치

```bash
# 1. Homebrew (없으면 설치)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Node.js (18 이상)
brew install node

# 3. Watchman (파일 변경 감지)
brew install watchman

# 4. Xcode (App Store에서 설치 → 반드시 한번 실행하여 라이선스 동의)
# Xcode Command Line Tools
xcode-select --install

# 5. CocoaPods
sudo gem install cocoapods

# 6. EAS CLI (Expo Application Services — 빌드/배포용)
npm install -g eas-cli

# 7. Expo CLI
npm install -g expo-cli
```

### 2-2. Xcode 시뮬레이터 확인

```bash
# 시뮬레이터 목록 확인
xcrun simctl list devices
```

---

## 3. 프로젝트 생성

```bash
# 프로젝트 생성
npx create-expo-app moducm-ios --template blank-typescript

cd moducm-ios

# 필수 패키지 설치
npx expo install expo-router expo-linking expo-constants expo-status-bar

# Firebase
npm install @react-native-firebase/app @react-native-firebase/auth
# 또는 Expo 호환 방식:
npm install firebase

# 네비게이션
npx expo install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context

# 추가 UI
npx expo install expo-haptics expo-web-browser expo-secure-store
npx expo install react-native-gesture-handler react-native-reanimated

# 아이콘
npm install @expo/vector-icons

# 알림 (키워드 알림용)
npx expo install expo-notifications expo-device expo-task-manager expo-background-fetch

# AsyncStorage (로컬 저장소)
npx expo install @react-native-async-storage/async-storage

# Google Sign-In
npx expo install expo-auth-session expo-crypto
```

---

## 4. Firebase 설정

### 4-1. Firebase Console 작업

1. https://console.firebase.google.com → 프로젝트 `moducm-f2edf` 선택
2. **프로젝트 설정** → **앱 추가** → **Apple(iOS)** 클릭
3. Bundle ID: `com.moduji.community` 입력
4. `GoogleService-Info.plist` 다운로드 → 프로젝트 `ios/` 폴더에 저장
5. **Authentication** → **Sign-in method** → Google 활성화 확인
6. **승인된 도메인** 확인: `moducm.com` 있는지 확인

### 4-2. Firebase 설정 값 (이미 존재하는 프로젝트)

```
Project ID: moducm-f2edf
API Key: AIzaSyAzISJaLg6SxDzdv8qZBwQqpC4LMe_xq2k
Auth Domain: moducm-f2edf.firebaseapp.com
Storage Bucket: moducm-f2edf.firebasestorage.app
```

### 4-3. 코드에서 Firebase 초기화

```typescript
// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAzISJaLg6SxDzdv8qZBwQqpC4LMe_xq2k",
  authDomain: "moducm-f2edf.firebaseapp.com",
  projectId: "moducm-f2edf",
  storageBucket: "moducm-f2edf.firebasestorage.app",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
```

---

## 5. API 서버 (동일한 백엔드 사용)

> **중요: 새로운 서버를 만들 필요 없음!**
> Android 앱과 동일한 `https://moducm.com` API를 그대로 사용합니다.

### 5-1. API 클라이언트 설정

```typescript
// lib/api.ts
const BASE_URL = "https://moducm.com";

async function fetchAPI(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  return res.json();
}

// 인증이 필요한 요청
async function fetchWithAuth(path: string, token: string, options?: RequestInit) {
  return fetchAPI(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
}
```

### 5-2. 전체 API 엔드포인트 목록

#### 카테고리/게시글

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/categories` | 종목 목록 | X |
| GET | `/api/categories/{id}/posts?sort=latest&page=1&searchType=title&q=` | 종목별 게시글 | X |
| GET | `/api/post/{postId}` | 게시글 상세 | X |
| POST | `/api/posts` | 게시글 작성 | X (비밀번호 기반) |
| PUT | `/api/post/{postId}` | 게시글 수정 | X (비밀번호) |
| DELETE | `/api/post/{postId}` | 게시글 삭제 | X (비밀번호) |
| POST | `/api/posts/{postId}/like` | 좋아요 토글 | X |
| POST | `/api/posts/{postId}/view` | 조회수 증가 | X |
| POST | `/api/posts/{postId}/bookmark` | 북마크 토글 | O |
| POST | `/api/posts/{postId}/verify-password` | 비밀번호 확인 | X |
| GET | `/api/posts/latest?limit=5` | 최신 게시글 | X |
| GET | `/api/posts/popular?limit=5` | 인기 게시글 | X |

#### 댓글

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/post/{postId}/comments` | 댓글 목록 | X |
| POST | `/api/post/{postId}/comments` | 댓글 작성 | X |
| PUT | `/api/comments/{commentId}` | 댓글 수정 | X |
| DELETE | `/api/comments/{commentId}` | 댓글 삭제 | X |
| POST | `/api/comments/{commentId}/like` | 댓글 좋아요 | X |

#### 구인

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/jobs?region_code=&sort=latest&page=1&q=&searchType=title` | 구인 목록 | X |
| GET | `/api/jobs/{jobId}` | 구인 상세 | X |
| POST | `/api/jobs` | 구인 등록 | O |
| PUT | `/api/jobs/{jobId}` | 구인 수정 | O |
| DELETE | `/api/jobs/{jobId}` | 구인 삭제 | O |
| POST | `/api/jobs/{jobId}/like` | 좋아요 토글 | X |
| POST | `/api/jobs/{jobId}/view` | 조회수 증가 | X |
| POST | `/api/jobs/{jobId}/bookmark` | 북마크 토글 | O |
| GET | `/api/jobs/latest?limit=3` | 최신 구인 | X |
| GET | `/api/jobs/my?uid={uid}` | 내 구인글 | O |
| GET | `/api/jobs/region-counts` | 지역별 수 | X |

#### 닉네임

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/nicknames?uid={uid}` | 내 닉네임 조회 | O |
| GET | `/api/nicknames?name={name}` | 중복 확인 | X |
| POST | `/api/nicknames` | 닉네임 등록/변경 | O |

#### 검색/신고/문의/북마크

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/search?q={query}` | 통합 검색 | X |
| POST | `/api/reports` | 신고 | X |
| GET | `/api/inquiries` | 문의 목록 | X |
| POST | `/api/inquiries` | 문의 작성 | X |
| GET | `/api/bookmarks?type=posts\|jobs` | 내 북마크 | O |
| GET | `/api/posts/my?uid={uid}` | 내 게시글 | O |
| GET | `/api/comments/my?uid={uid}` | 내 댓글 | O |

---

## 6. 앱 화면 구조 (22개 화면)

### 6-1. 하단 탭 네비게이션 (4개)

```
┌─────────┬──────────┬─────────┬─────────┐
│   홈    │ 종목후기  │  구인   │   MY    │
└─────────┴──────────┴─────────┴─────────┘
```

### 6-2. 화면별 상세

#### 탭 1: 홈
- **HomeScreen** — 인기 종목, 인기 게시글, 최신 게시글, 최신 구인 표시
  - → PopularPostsScreen (인기 게시글 더보기, 페이지네이션)
  - → LatestPostsScreen (최신 게시글 더보기, 페이지네이션)
  - → LatestJobsScreen (최신 구인 더보기, 페이지네이션)
  - → PostDetailScreen (게시글 상세)
  - → JobDetailScreen (구인 상세)

#### 탭 2: 종목후기 (커뮤니티)
- **CommunityHomeScreen** — 종목(카테고리) 목록 + 검색
  - → PostListScreen — 선택한 종목의 게시글 목록 (정렬, 검색, 페이지네이션)
    - → PostDetailScreen — 게시글 상세 (댓글, 좋아요, 북마크, 신고)
    - → PostWriteScreen — 게시글 작성 (제목, 내용, 지역, 태그, 비밀번호)
    - → PostEditScreen — 게시글 수정

#### 탭 3: 구인
- **RegionSelectScreen** — 지역 선택 (광역시/도 → 구/시/군 2단계)
  - → JobsListScreen — 선택 지역의 구인 목록 (정렬, 검색)
    - → JobDetailScreen — 구인 상세 (좋아요, 북마크, 연락처)
    - → JobWriteScreen — 구인 등록 (종목, 센터명, 근무형태, 급여, 마감일 등)
    - → JobEditScreen — 구인 수정

#### 탭 4: MY
- **MyScreen** — 비로그인: 게스트 안내 / 로그인: 프로필 + 메뉴
  - → MyActivityScreen — 내 게시글/댓글/좋아요/북마크
  - → InquiryListScreen — 문의 목록
    - → InquiryDetailScreen — 문의 상세
    - → InquiryWriteScreen — 문의 작성
  - → AdminScreen — 관리자 패널 (비밀번호 인증)
  - 닉네임 설정/변경 (모달)
  - 테마 변경 (라이트/다크/시스템)
  - 로그아웃 / 회원탈퇴

---

## 7. 핵심 데이터 모델 (TypeScript)

```typescript
// 카테고리
interface Category {
  id: number;
  name: string;
  emoji: string;
  sort_order: number;
  is_popular: boolean;
  post_count: number;
}

// 게시글
interface Post {
  id: number;
  category_id: number;
  title: string;
  content: string;
  author: string;
  region: string;
  tags: string;
  likes: number;
  comments_count: number;
  is_notice: boolean;
  views: number;
  created_at: string;
  updated_at: string;
  category_name?: string;
}

// 댓글 (대댓글 지원: parent_id)
interface Comment {
  id: number;
  post_id: number;
  parent_id: number | null; // null = 최상위, 숫자 = 대댓글
  author: string;
  content: string;
  likes: number;
  reply_count: number;
  created_at: string;
}

// 구인
interface JobPost {
  id: number;
  title: string;
  description: string;
  center_name: string;
  address: string;
  author_role: string;
  author_name: string;
  contact_type: string;
  contact: string;
  sport: string;
  region_name: string;
  region_code: string;
  employment_type: string;
  salary: string;
  headcount: string;
  benefits: string;
  preferences: string;
  deadline: string;
  likes: number;
  views: number;
  is_closed: boolean;
  bookmark_count: number;
  firebase_uid: string;
  created_at: string;
}

// 지역 구조
interface RegionGroup {
  code: string;
  name: string;
  subRegions: { code: string; name: string }[];
}

// 문의
interface Inquiry {
  id: number;
  author: string;
  email?: string;
  title: string;
  content: string;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
}
```

---

## 8. 주요 기능 구현 포인트

### 8-1. 인증 흐름

```
Google Sign-In (expo-auth-session)
    ↓
Firebase Auth (signInWithCredential)
    ↓
ID Token 획득 (user.getIdToken())
    ↓
API 요청 시 Header에 포함: Authorization: Bearer <token>
```

### 8-2. 게시글 작성 (비로그인 방식)

- 로그인 없이도 게시글 작성 가능
- 작성 시 **닉네임 + 비밀번호** 입력
- 수정/삭제 시 비밀번호 확인 필요
- API: `POST /api/posts` body: `{ category_id, title, content, author, password, region, tags }`

### 8-3. 닉네임 시스템

- 로그인 후 닉네임 설정 (필수)
- Firebase UID ↔ 닉네임 매핑 (서버 저장)
- 앱 ↔ 웹 닉네임 동기화
- 변경 후 3주간 재변경 불가

### 8-4. 북마크

- 게시글 북마크: `POST /api/posts/{id}/bookmark` (Firebase UID 기반)
- 구인 북마크: `POST /api/jobs/{id}/bookmark` (Firebase UID 기반)
- 내 북마크 조회: `GET /api/bookmarks?type=posts|jobs`

### 8-5. 키워드 알림

- 사용자가 키워드 등록 (최대 20개)
- 백그라운드에서 주기적으로 새 글 확인
- 키워드 매칭 시 로컬 푸시 알림
- AsyncStorage에 키워드 저장

### 8-6. 지역 선택 (구인 탭)

- 전국 17개 광역시/도 → 하위 시/군/구 2단계
- 지역 데이터는 클라이언트에 내장 (region-data.ts)
- 선택한 지역 코드로 API 필터링

---

## 9. 빌드 및 배포

### 9-1. 개발 서버 실행

```bash
# Expo 개발 서버 시작
npx expo start

# iOS 시뮬레이터에서 실행
npx expo start --ios

# 실제 기기에서 테스트 (Expo Go 앱 필요)
# QR 코드 스캔
```

### 9-2. EAS Build (앱스토어 배포용)

```bash
# EAS 로그인
eas login

# 빌드 설정 초기화
eas build:configure

# iOS 빌드 (App Store 배포용)
eas build --platform ios --profile production

# App Store 제출
eas submit --platform ios
```

### 9-3. app.json 설정

```json
{
  "expo": {
    "name": "모두의 지도사 커뮤니티",
    "slug": "moducm-community",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "bundleIdentifier": "com.moduji.community",
      "buildNumber": "1",
      "supportsTablet": false,
      "config": {
        "googleSignIn": {
          "reservedClientId": "com.googleusercontent.apps.480587636282-xxxxxxxxx"
        }
      }
    },
    "plugins": [
      "expo-router",
      "expo-secure-store"
    ]
  }
}
```

---

## 10. Apple Developer 계정 필요 작업

1. https://developer.apple.com 에서 개발자 등록 (연 $99)
2. **Certificates, Identifiers & Profiles** 에서:
   - App ID 등록: `com.moduji.community`
   - Push Notification 활성화
   - Sign in with Apple 활성화 (선택)
3. **App Store Connect** 에서 새 앱 생성
4. 앱 스크린샷 (6.7인치, 6.5인치 등) 준비
5. 개인정보처리방침 URL: `https://moducm.com/privacy.html`
6. 지원 URL: `https://moducm.com`

---

## 11. Claude Code에게 전달할 프롬프트 예시

아래 프롬프트를 맥북의 Claude Code에 붙여넣으면 됩니다:

```
나는 '모두의 지도사 커뮤니티'라는 스포츠지도사 수험생/트레이너를 위한 커뮤니티 앱을 만들고 있어.

이미 Android 앱과 웹사이트(moducm.com)가 운영 중이고, 같은 API 서버를 사용하는 iOS 앱을 Expo(React Native)로 만들어야 해.

프로젝트 루트에 있는 iOS_BUILD_GUIDE.md 파일을 읽어줘.
이 파일에 API 엔드포인트, 화면 구조, 데이터 모델, Firebase 설정이 모두 정리되어 있어.

Android 앱의 스크린샷을 첨부할 테니, 동일한 디자인과 기능으로 iOS 앱을 만들어줘.
```

---

## 12. 참고: Android 프로젝트 구조

```
android/app/src/main/java/com/moduji/app/
├── App.kt                      # Application 클래스
├── MainActivity.kt              # 메인 액티비티 (탭 네비게이션)
├── data/
│   ├── model/
│   │   ├── Models.kt            # 구인 관련 데이터 모델
│   │   └── CommunityModels.kt   # 커뮤니티 관련 데이터 모델
│   ├── network/
│   │   ├── RetrofitClient.kt    # API 클라이언트 (BASE_URL: moducm.com)
│   │   ├── CommunityApi.kt      # 커뮤니티 API 인터페이스
│   │   ├── JobsApi.kt           # 구인 API 인터페이스
│   │   └── AuthInterceptor.kt   # Firebase 토큰 자동 삽입
│   └── repository/
│       ├── CommunityRepository.kt
│       └── JobsRepository.kt
├── ui/
│   ├── home/
│   │   └── HomeFragment.kt
│   ├── community/
│   │   ├── CommunityHomeFragment.kt
│   │   ├── PostListFragment.kt
│   │   ├── PostDetailFragment.kt
│   │   ├── PostWriteFragment.kt
│   │   ├── PostEditFragment.kt
│   │   ├── PopularPostsFragment.kt
│   │   ├── LatestPostsFragment.kt
│   │   ├── InquiryListFragment.kt
│   │   ├── InquiryDetailFragment.kt
│   │   ├── InquiryWriteFragment.kt
│   │   └── AdminFragment.kt
│   ├── jobs/
│   │   ├── RegionSelectFragment.kt
│   │   ├── JobsListFragment.kt
│   │   ├── JobDetailFragment.kt
│   │   ├── JobWriteFragment.kt
│   │   ├── JobEditFragment.kt
│   │   └── LatestJobsFragment.kt
│   └── my/
│       ├── MyFragment.kt
│       └── MyActivityListFragment.kt
└── util/
    ├── NicknameManager.kt        # 닉네임 관리 + 서버 동기화
    ├── BookmarkManager.kt        # 북마크 관리
    ├── KeywordAlertManager.kt    # 키워드 알림
    ├── NotificationWorker.kt     # 백그라운드 알림
    ├── ThemeHelper.kt            # 다크모드
    └── AuthManager.kt            # 인증 상태 관리
```

---

**이 파일을 맥북의 iOS 프로젝트 루트에 복사한 뒤, Claude Code에게 읽히면 됩니다.**
