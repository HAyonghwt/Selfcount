# Firebase 백업 데이터 안전성 확인

## Firebase Realtime Database 구조

### 현재 사용 중인 경로

```
Firebase Realtime Database
├── tournaments/
│   └── current/              # 현재 대회 데이터
├── players/                  # 선수 목록
├── scores/                   # 점수 데이터
├── scoreLogs/                # 점수 수정 로그
├── config/                   # 설정
├── archives/                 # 기록 보관 데이터 (읽기 전용)
│   └── {archiveId}/
├── backups/                  # 임시 백업 (기권 전 점수 백업)
│   └── scoresBeforeForfeit/
│       └── {playerId}/
└── systemBackups/            # 시스템 백업 (새로 추가)
    └── {backupId}/
```

---

## 백업 데이터 저장 경로

### 제안한 경로: `systemBackups/{backupId}`

**완전히 독립적인 경로**:
- ✅ `archives/`와 완전히 분리
- ✅ `backups/`와 완전히 분리
- ✅ 현재 운영 데이터와 완전히 분리

### 경로 분리 확인

| 경로 | 용도 | 충돌 가능성 |
|------|------|------------|
| `archives/{archiveId}` | 기록 보관 (읽기 전용) | ❌ 없음 |
| `backups/scoresBeforeForfeit/{playerId}` | 임시 점수 백업 | ❌ 없음 |
| `systemBackups/{backupId}` | 시스템 전체 백업 | ❌ 없음 |
| `tournaments/current` | 현재 대회 데이터 | ❌ 없음 |
| `players` | 현재 선수 데이터 | ❌ 없음 |
| `scores` | 현재 점수 데이터 | ❌ 없음 |

---

## Firebase Realtime Database의 경로 기반 저장

### 특징

1. **계층 구조**: 경로 기반으로 데이터 저장
2. **완전 분리**: 서로 다른 경로는 완전히 독립적
3. **충돌 없음**: 다른 경로에 저장된 데이터는 서로 영향을 주지 않음

### 예시

```
archives/
  └── 대회명_202412/
      ├── players: {...}
      ├── scores: {...}
      └── ...

systemBackups/
  └── 20241215_143022/
      ├── tournamentData: {...}
      ├── players: {...}
      ├── scores: {...}
      └── ...

tournaments/
  └── current/
      ├── name: "현재 대회"
      ├── courses: {...}
      └── ...
```

**결론**: 각 경로는 완전히 독립적이므로 **충돌이 전혀 없습니다**.

---

## 안전성 보장 요소

### 1. 경로 분리

✅ **완전 분리된 경로 사용**
- `systemBackups/`는 새로운 최상위 경로
- 기존 경로와 전혀 겹치지 않음

### 2. 백업 ID 고유성

✅ **고유한 백업 ID 생성**
- 형식: `YYYYMMDD_HHMMSS` (예: `20241215_143022`)
- 초 단위까지 포함하여 중복 불가능

### 3. 데이터 무결성

✅ **원자적 저장**
- Firebase의 `set()` 함수는 원자적 연산
- 백업 데이터가 완전히 저장되거나 실패하거나 둘 중 하나

### 4. 읽기/쓰기 권한

✅ **인증된 사용자만 접근**
- `database.rules.json`에서 인증된 사용자만 쓰기 가능
- 백업 데이터도 동일한 보안 규칙 적용

---

## 백업 데이터 구조

```typescript
systemBackups/
  └── 20241215_143022/
      ├── backupId: "20241215_143022"
      ├── savedAt: "2024-12-15T14:30:22.000Z"
      ├── tournamentName: "대회명"
      ├── tournamentData: {
      │     name: "대회명",
      │     startDate: "20241215",
      │     courses: {...},
      │     groups: {...},
      │     ...
      │   }
      ├── players: {
      │     "player1": {...},
      │     "player2": {...},
      │     ...
      │   }
      ├── scores: {
      │     "player1": {
      │       "course1": {
      │         "1": 3,
      │         "2": 4,
      │         ...
      │       }
      │     },
      │     ...
      │   }
      └── scoreLogs: {
            "log1": {...},
            "log2": {...},
            ...
          }
```

---

## 기존 데이터와의 충돌 방지

### 1. 기록 보관 데이터 (`archives/`)

**충돌 없음**:
- `archives/`는 읽기 전용 기록 보관용
- `systemBackups/`는 복원 가능한 백업용
- 완전히 다른 용도와 경로

### 2. 임시 백업 데이터 (`backups/`)

**충돌 없음**:
- `backups/scoresBeforeForfeit/`는 개별 선수 점수 백업
- `systemBackups/`는 전체 시스템 백업
- 완전히 다른 범위와 경로

### 3. 현재 운영 데이터

**충돌 없음**:
- `tournaments/current`, `players`, `scores`는 현재 운영 데이터
- `systemBackups/`는 백업 데이터
- 복원 시에만 현재 데이터를 덮어씀

---

## 복원 시 안전성

### 복원 프로세스

1. **백업 데이터 읽기**: `systemBackups/{backupId}`에서 읽기
2. **현재 데이터 삭제**: `tournaments/current`, `players`, `scores` 삭제
3. **백업 데이터 복원**: 백업 데이터를 현재 위치에 저장

### 안전 장치

✅ **사용자 확인 다이얼로그**
- 복원 전 확인 필수
- "현재 모든 데이터가 삭제됩니다" 경고

✅ **원자적 연산**
- Firebase의 `set()` 함수는 원자적
- 복원이 완전히 성공하거나 실패하거나 둘 중 하나

✅ **백업 데이터 보존**
- 복원 후에도 백업 데이터는 그대로 유지
- 복원 실패 시 다시 복원 가능

---

## 결론

### ✅ 완전히 안전하게 보관됨

1. **경로 분리**: `systemBackups/`는 완전히 독립적인 경로
2. **충돌 없음**: 기존 경로와 전혀 겹치지 않음
3. **데이터 무결성**: Firebase의 원자적 연산 보장
4. **보안**: 인증된 사용자만 접근 가능
5. **백업 보존**: 복원 후에도 백업 데이터 유지

### ✅ 기존 데이터와 충돌 없음

- `archives/`: 기록 보관 (읽기 전용) - 충돌 없음
- `backups/`: 임시 백업 (개별 선수) - 충돌 없음
- `systemBackups/`: 시스템 백업 (전체) - 충돌 없음
- 현재 운영 데이터: 복원 시에만 영향

**결론**: Firebase에서 백업 데이터는 **완전히 안전하게 보관**되며, 기존 데이터와 **충돌이 전혀 없습니다**.

