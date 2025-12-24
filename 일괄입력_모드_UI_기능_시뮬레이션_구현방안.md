# 일괄 입력 모드 UI 기능 시뮬레이션 구현 방안

## 현재 일괄 입력 모드의 주요 UI 기능

### 1. 홀 자동 잠금 (Hole Auto-Lock)
- **기능**: 모든 선수의 특정 홀 점수가 입력되면 자동으로 해당 홀 잠금
- **구현 위치**: `src/app/self-scoring/batch-scoring/page.tsx`
- **핵심 로직**:
  ```typescript
  const [holeLocks, setHoleLocks] = useState<boolean[]>(Array(9).fill(false));
  
  // useEffect로 batchInputScores와 tableScores를 모니터링
  useEffect(() => {
    const newLocks = Array(9).fill(false);
    for (let hi = 0; hi < 9; hi++) {
      // 모든 선수의 해당 홀 점수가 입력되었는지 확인
      const allFilled = renderColumns.every((_, pi) => {
        const hasScore = batchInputScores[pi]?.[hi] != null || 
                        tableScores[pi]?.[hi] != null;
        return hasScore;
      });
      newLocks[hi] = allFilled;
    }
    setHoleLocks(newLocks);
  }, [batchInputScores, tableScores]);
  ```

### 2. 수동 해제 (Manual Unlock)
- **기능**: 더블 클릭으로 잠긴 점수 해제하여 수정 가능하게 함
- **구현 위치**: `handleDoubleClickUnlock` 함수
- **핵심 로직**:
  ```typescript
  const manuallyUnlockedHolesRef = useRef<Set<number>>(new Set());
  const editingCellsRef = useRef<Set<string>>(new Set());
  
  const handleDoubleClickUnlock = (e) => {
    // 1. batchInputScores와 draftScores를 null로 초기화
    // 2. 해당 홀의 잠금 해제
    // 3. manuallyUnlockedHolesRef에 추가 (자동 재잠금 방지)
    // 4. editingCellsRef에 추가 (자동 커서 이동 방지)
  };
  ```

### 3. 저장된 점수 표시 (Saved Score Visual)
- **기능**: 저장된 점수는 연한 회색 배경 + 자물쇠 아이콘 표시
- **구현 위치**: 렌더링 부분
- **핵심 로직**:
  ```typescript
  const isSaved = (typeof committedVal === 'number' && 
                  batchVal === null && 
                  draftVal === null) || 
                 (typeof committedVal === 'number' && isLocked);
  
  // CSS 클래스: 'saved'
  // 스타일: color: '#a8aaac', background: '#e5e7eb'
  // 자물쇠 아이콘: SVG (position: absolute, right: 2px)
  ```

### 4. 일괄 저장 후 잠금 (Lock After Batch Save)
- **기능**: 일괄 저장 후 저장된 점수가 있는 홀은 자동 잠금
- **구현 위치**: `handleBatchSave` 함수
- **핵심 로직**:
  ```typescript
  // 저장된 셀이 있는 홀은 잠금 상태로 설정
  savedHoles.forEach(hi => {
    newLocks[hi] = true;
    manuallyUnlockedHolesRef.current.delete(hi);
  });
  ```

### 5. 자동 커서 이동 (Auto Cursor Movement)
- **기능**: 점수 입력 후 자동으로 다음 칸으로 이동 (옆으로 → 다음 홀)
- **구현 위치**: `onChange` 핸들러
- **핵심 로직**:
  ```typescript
  // 수정 중인 셀이면 자동 커서 이동하지 않음
  if (editingCellsRef.current.has(`${pi}-${hi}`)) {
    return;
  }
  
  // 유효한 점수 입력 시 다음 칸으로 이동
  if (newVal >= 1 && newVal <= 20) {
    // 같은 홀의 다음 선수, 없으면 다음 홀의 첫 선수
  }
  ```

---

## 시뮬레이션 도구에 추가할 구현 사항

### 옵션 1: 완전한 UI 시뮬레이션 (권장하지 않음)
- **설명**: 시뮬레이션 도구 내부에 실제 일괄 입력 모드와 동일한 UI를 구현
- **장점**: 모든 UI 기능을 시뮬레이션 가능
- **단점**: 
  - 코드 중복 (일괄 입력 모드 코드를 거의 그대로 복사)
  - 유지보수 어려움 (두 곳에서 동일한 로직 관리)
  - 시뮬레이션 도구의 목적과 맞지 않음 (백그라운드 점수 생성이 목적)

### 옵션 2: 점수 생성 후 잠금 상태 시뮬레이션 (권장)
- **설명**: 시뮬레이션 도구가 점수를 생성할 때, 실제 일괄 입력 모드에서 잠금되는 상태를 시뮬레이션
- **구현 방법**:
  1. 시뮬레이션 도구가 점수를 생성할 때, 모든 선수의 특정 홀 점수를 한 번에 생성
  2. 점수 생성 후, 해당 홀의 잠금 상태를 확인하는 로직 추가
  3. 잠금된 홀의 점수를 수정하려고 시도하는 시뮬레이션 추가

### 옵션 3: 실제 일괄 입력 모드에서 테스트 (가장 권장)
- **설명**: 시뮬레이션 도구는 점수만 생성하고, 실제 일괄 입력 모드 페이지에서 UI 기능 테스트
- **장점**:
  - 실제 사용 환경과 동일하게 테스트 가능
  - 코드 중복 없음
  - 유지보수 용이
- **구현 방법**:
  1. 시뮬레이션 도구로 점수 생성
  2. 실제 일괄 입력 모드 페이지(`/self-scoring/batch-scoring`)에서 접속
  3. 잠금/해제 기능을 실제로 테스트

---

## 구체적인 구현 방안 (옵션 2 선택 시)

### 1. 시뮬레이션 도구에 잠금 상태 확인 기능 추가

```typescript
// SimulationTool.tsx에 추가

// 홀 잠금 상태 확인 함수
const checkHoleLocks = async (groupName: string, courseId: string) => {
  const playersSnapshot = await get(ref(db, 'players'));
  const scoresSnapshot = await get(ref(db, 'scores'));
  const players = Object.entries(playersSnapshot.val() || {})
    .map(([id, player]) => ({ id, ...player as any }))
    .filter(p => p.group === groupName && isSimulationData(p));
  
  const holeLocks = Array(9).fill(false);
  
  for (let hi = 0; hi < 9; hi++) {
    // 모든 선수의 해당 홀 점수가 있는지 확인
    const allFilled = players.every(player => {
      const score = scoresSnapshot.val()?.[player.id]?.[courseId]?.[String(hi + 1)];
      return score != null && score > 0;
    });
    holeLocks[hi] = allFilled;
  }
  
  return holeLocks;
};

// 조장 점수 등록 후 잠금 상태 확인
const registerCaptainScores = async (day: 1 | 2) => {
  // ... 기존 점수 등록 로직 ...
  
  await update(ref(db), updates);
  
  // 잠금 상태 확인 및 보고
  const maleGroupLocks = await checkHoleLocks('남자부', courseA.id);
  const femaleGroupLocks = await checkHoleLocks('여자부', courseC.id);
  
  const lockedHolesCount = maleGroupLocks.filter(Boolean).length + 
                          femaleGroupLocks.filter(Boolean).length;
  
  toast({
    title: '점수 등록 완료',
    description: `${day}일차 조장 점수가 등록되었습니다. 잠금된 홀: ${lockedHolesCount}개`
  });
};
```

### 2. 잠금 해제 시뮬레이션 기능 추가

```typescript
// 특정 홀의 점수를 수정하는 시뮬레이션 (잠금 해제 테스트)
const simulateUnlockAndModify = async (
  groupName: string, 
  courseId: string, 
  holeNumber: number,
  playerIndex: number,
  newScore: number
) => {
  const playersSnapshot = await get(ref(db, 'players'));
  const players = Object.entries(playersSnapshot.val() || {})
    .map(([id, player]) => ({ id, ...player as any }))
    .filter(p => p.group === groupName && isSimulationData(p))
    .sort((a, b) => a.name.localeCompare(b.name));
  
  if (players.length <= playerIndex) {
    toast({ title: '오류', description: '선수를 찾을 수 없습니다.', variant: 'destructive' });
    return;
  }
  
  const targetPlayer = players[playerIndex];
  const scoreRef = ref(db, `scores/${targetPlayer.id}/${courseId}/${holeNumber}`);
  
  // 점수 수정 (잠금 해제 후 수정 시뮬레이션)
  await set(scoreRef, newScore);
  
  toast({
    title: '점수 수정 완료',
    description: `${targetPlayer.name}의 ${courseId} 코스 ${holeNumber}번 홀 점수를 ${newScore}로 수정했습니다.`
  });
};
```

### 3. UI 버튼 추가

```typescript
// SimulationTool.tsx의 UI 부분에 추가

<Button
  onClick={() => simulateUnlockAndModify('남자부', courseA.id, 1, 0, 5)}
  disabled={simulationState.isRunning}
  className="bg-yellow-600 hover:bg-yellow-700"
>
  <RotateCcw className="mr-2 h-4 w-4" />
  잠금 해제 시뮬레이션 (남자부 A코스 1번홀)
</Button>
```

---

## 권장 사항

### 가장 효율적인 방법: 옵션 3 (실제 페이지에서 테스트)

1. **시뮬레이션 도구의 역할**:
   - 점수 데이터 생성만 담당
   - 실제 일괄 입력 모드에서 테스트할 수 있는 데이터 생성

2. **실제 테스트 절차**:
   ```
   1. 시뮬레이션 도구로 선수 등록 (300명)
   2. 시뮬레이션 도구로 조장 점수 등록 (1일차)
   3. 실제 일괄 입력 모드 페이지 접속 (/self-scoring/batch-scoring)
   4. 조장 ID로 로그인
   5. 그룹/조 선택
   6. 점수 입력 및 잠금/해제 기능 테스트
   ```

3. **추가 검증 기능** (선택적):
   - 시뮬레이션 도구에 "잠금 상태 확인" 버튼 추가
   - 생성된 점수가 실제로 잠금 상태인지 확인하는 보고서 생성

---

## 결론

**일괄 입력 모드의 UI 기능(잠금, 해제 등)을 완전히 시뮬레이션하는 것은 권장하지 않습니다.**

**이유**:
1. 시뮬레이션 도구는 백그라운드에서 점수를 생성하는 도구
2. UI 기능은 실제 일괄 입력 모드 페이지에서 테스트하는 것이 더 정확
3. 코드 중복과 유지보수 문제 방지

**대신**:
- 시뮬레이션 도구는 점수 데이터 생성에 집중
- 실제 일괄 입력 모드 페이지에서 UI 기능 테스트
- 필요시 잠금 상태 확인 기능만 추가

이렇게 하면 실제 사용 환경과 동일하게 테스트할 수 있고, 코드 유지보수도 용이합니다.

