import { db } from './firebase';
import { ref, push, set, get, query, orderByChild, equalTo } from 'firebase/database';

export interface ScoreLog {
  id?: string;
  matchId: string;  // 해당 경기 ID
  playerId: string; // 선수 ID
  scoreType: string; // 점수 유형 (예: 'holeScore', 'difficulty', 'execution' 등)
  holeNumber?: number; // 홀 번호 (홀 점수인 경우)
  oldValue: number;  // 변경 전 점수
  newValue: number;  // 변경 후 점수
  modifiedBy: string; // 수정자 ID
  modifiedByType: 'admin' | 'judge' | 'captain'; // 수정자 유형
  modifiedAt: number;  // 수정 일시 (timestamp)
  comment?: string;   // 추가 설명 (선택사항)
  courseId?: string;  // 코스 ID (선택사항)
}

/**
 * 점수 수정 내역을 기록하는 함수
 */
export const logScoreChange = async (logData: Omit<ScoreLog, 'id' | 'modifiedAt'>): Promise<void> => {
  if (!db) throw new Error('Firebase DB 연결 오류');
  try {
    const logsRef = ref(db, 'scoreLogs');
    const newLogRef = push(logsRef);
    
    const logWithTimestamp: ScoreLog = {
      ...logData,
      id: newLogRef.key || '',
      modifiedAt: Date.now()
    };
    
    await set(newLogRef, logWithTimestamp);
  } catch (error) {
    throw error;
  }
};

/**
 * 특정 선수의 점수 수정 내역을 가져오는 함수
 */
export const getPlayerScoreLogs = async (playerId: string): Promise<ScoreLog[]> => {
  if (!db) throw new Error('Firebase DB 연결 오류');
  try {
    const logsRef = ref(db, 'scoreLogs');
    const playerLogsQuery = query(
      logsRef,
      orderByChild('playerId'),
      equalTo(playerId)
    );
    
    const snapshot = await get(playerLogsQuery);
    if (!snapshot.exists()) {
      return [];
    }
    
    const logs: ScoreLog[] = [];
    snapshot.forEach((childSnapshot) => {
      logs.push({
        id: childSnapshot.key || '',
        ...childSnapshot.val()
      });
    });
    
    // 최신 수정 내역이 먼저 오도록 정렬
    return logs.sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch (error) {
    throw error;
  }
};

/**
 * 특정 경기의 점수 수정 내역을 가져오는 함수
 */
export const getMatchScoreLogs = async (matchId: string): Promise<ScoreLog[]> => {
  if (!db) throw new Error('Firebase DB 연결 오류');
  try {
    const logsRef = ref(db, 'scoreLogs');
    const matchLogsQuery = query(
      logsRef,
      orderByChild('matchId'),
      equalTo(matchId)
    );
    
    const snapshot = await get(matchLogsQuery);
    if (!snapshot.exists()) {
      return [];
    }
    
    const logs: ScoreLog[] = [];
    snapshot.forEach((childSnapshot) => {
      logs.push({
        id: childSnapshot.key || '',
        ...childSnapshot.val()
      });
    });
    
    // 최신 수정 내역이 먼저 오도록 정렬
    return logs.sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch (error) {
    throw error;
  }
};

/**
 * 자율채점 관련 로그를 가져오는 함수 (조장이 수정한 로그)
 */
export const getSelfScoringLogs = async (): Promise<ScoreLog[]> => {
  if (!db) throw new Error('Firebase DB 연결 오류');
  try {
    const logsRef = ref(db, 'scoreLogs');
    
    // 모든 로그를 가져온 후 클라이언트에서 필터링
    const snapshot = await get(logsRef);
    if (!snapshot.exists()) {
      return [];
    }
    
    const logs: ScoreLog[] = [];
    snapshot.forEach((childSnapshot) => {
      const logData = childSnapshot.val();
      // modifiedByType이 'captain'인 로그만 필터링
      if (logData.modifiedByType === 'captain') {
        logs.push({
          id: childSnapshot.key || '',
          ...logData
        });
      }
    });
    
    // 최신 수정 내역이 먼저 오도록 정렬
    return logs.sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch (error) {
    throw error;
  }
};

// ===== 새로운 최적화 함수들 (기존 함수와 별개) =====

// 캐시 인터페이스
interface LogCache {
  data: ScoreLog[];
  timestamp: number;
  type: string;
}

// 메모리 캐시 (컴포넌트 간 공유)
const logCache = new Map<string, LogCache>();
const CACHE_DURATION = 2 * 60 * 1000; // 2분

/**
 * 새로운 함수: 최적화된 선수 로그 가져오기 (캐시 적용)
 */
export const getPlayerScoreLogsOptimized = async (playerId: string): Promise<ScoreLog[]> => {
  if (!db) throw new Error('Firebase DB 연결 오류');
  
  const cacheKey = `player_${playerId}`;
  const now = Date.now();
  
  // 캐시 확인
  if (logCache.has(cacheKey)) {
    const cached = logCache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  }
  
  try {
    // 기존 함수 사용 (안전성 보장)
    const logs = await getPlayerScoreLogs(playerId);
    
    // 캐시 업데이트
    logCache.set(cacheKey, {
      data: logs,
      timestamp: now,
      type: 'player'
    });
    
    return logs;
  } catch (error) {
    throw error;
  }
};

/**
 * 새로운 함수: 최적화된 경기 로그 가져오기 (캐시 적용)
 */
export const getMatchScoreLogsOptimized = async (matchId: string): Promise<ScoreLog[]> => {
  if (!db) throw new Error('Firebase DB 연결 오류');
  
  const cacheKey = `match_${matchId}`;
  const now = Date.now();
  
  // 캐시 확인
  if (logCache.has(cacheKey)) {
    const cached = logCache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  }
  
  try {
    // 기존 함수 사용 (안전성 보장)
    const logs = await getMatchScoreLogs(matchId);
    
    // 캐시 업데이트
    logCache.set(cacheKey, {
      data: logs,
      timestamp: now,
      type: 'match'
    });
    
    return logs;
  } catch (error) {
    throw error;
  }
};

/**
 * 새로운 함수: 최적화된 자율채점 로그 가져오기 (캐시 적용)
 */
export const getSelfScoringLogsOptimized = async (): Promise<ScoreLog[]> => {
  if (!db) throw new Error('Firebase DB 연결 오류');
  
  const cacheKey = 'self_scoring';
  const now = Date.now();
  
  // 캐시 확인
  if (logCache.has(cacheKey)) {
    const cached = logCache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  }
  
  try {
    // 기존 함수 사용 (안전성 보장)
    const logs = await getSelfScoringLogs();
    
    // 캐시 업데이트
    logCache.set(cacheKey, {
      data: logs,
      timestamp: now,
      type: 'self_scoring'
    });
    
    return logs;
  } catch (error) {
    throw error;
  }
};

/**
 * 새로운 함수: 특정 선수의 기권 타입을 효율적으로 가져오기 (캐시 적용)
 */
export const getPlayerForfeitTypeOptimized = async (playerId: string, courseId: string, holeNumber: string): Promise<'absent' | 'disqualified' | 'forfeit' | null> => {
  if (!db) throw new Error('Firebase DB 연결 오류');
  
  const cacheKey = `forfeit_${playerId}_${courseId}_${holeNumber}`;
  const now = Date.now();
  
  // 캐시 확인
  if (logCache.has(cacheKey)) {
    const cached = logCache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.data[0]?.forfeitType || null;
    }
  }
  
  try {
    // 기존 함수 사용하여 로그 가져오기
    const logs = await getPlayerScoreLogs(playerId);
    
    // 기존과 동일한 필터링 로직
    const forfeitLogs = logs
      .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment)
      .filter(l => l.comment?.includes(`코스: ${courseId}`) || l.comment?.includes(`홀: ${holeNumber}`))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
    
    if (forfeitLogs.length === 0) {
      return null;
    }
    
    // 기존과 동일한 기권 타입 추출 로직
    const latestLog = forfeitLogs[0];
    let forfeitType: 'absent' | 'disqualified' | 'forfeit' | null = null;
    
    if (latestLog.comment?.includes('불참')) forfeitType = 'absent';
    else if (latestLog.comment?.includes('실격')) forfeitType = 'disqualified';
    else if (latestLog.comment?.includes('기권')) forfeitType = 'forfeit';
    
    // 캐시 업데이트
    logCache.set(cacheKey, {
      data: [{ forfeitType } as any],
      timestamp: now,
      type: 'forfeit'
    });
    
    return forfeitType;
  } catch (error) {
    console.error('기권 타입 가져오기 실패:', error);
    return null;
  }
};

/**
 * 캐시 무효화 함수 (새로운 로그가 추가될 때 호출)
 */
export const invalidateLogCache = (type?: string): void => {
  if (type) {
    // 특정 타입의 캐시만 무효화
    for (const [key, value] of logCache.entries()) {
      if (value.type === type) {
        logCache.delete(key);
      }
    }
  } else {
    // 모든 캐시 무효화
    logCache.clear();
  }
};

/**
 * 점수 변경시 로그 캐시 자동 무효화 (새로운 로그 추가시 호출)
 */
export const logScoreChangeWithCacheInvalidation = async (logData: Omit<ScoreLog, 'id' | 'modifiedAt'>): Promise<void> => {
  try {
    // 기존 함수로 로그 저장
    await logScoreChange(logData);
    
    // 캐시 무효화하여 실시간 업데이트 보장
    invalidateLogCache();
  } catch (error) {
    throw error;
  }
};

/**
 * 실시간 업데이트를 위한 점수 변경 감지 함수
 * 점수가 변경될 때마다 해당 선수의 로그 캐시를 무효화
 */
export const invalidatePlayerLogCache = (playerId: string): void => {
  const cacheKey = `player_${playerId}`;
  if (logCache.has(cacheKey)) {
    logCache.delete(cacheKey);
  }
};

/**
 * 실시간 업데이트를 위한 경기 로그 캐시 무효화
 */
export const invalidateMatchLogCache = (matchId: string): void => {
  const cacheKey = `match_${matchId}`;
  if (logCache.has(cacheKey)) {
    logCache.delete(cacheKey);
    console.log(`[캐시 무효화] 경기 ${matchId} 로그 캐시 삭제됨`);
  }
};

/**
 * 실시간 업데이트를 위한 자율채점 로그 캐시 무효화
 */
export const invalidateSelfScoringLogCache = (): void => {
  const cacheKey = 'self_scoring';
  if (logCache.has(cacheKey)) {
    logCache.delete(cacheKey);
    console.log(`[캐시 무효화] 자율채점 로그 캐시 삭제됨`);
  }
};

/**
 * 점수 변경 시 자동으로 관련 로그 캐시를 무효화하는 함수
 * 이 함수를 사용하면 실시간 업데이트가 자동으로 보장됨
 */
export const logScoreChangeWithRealTimeUpdate = async (logData: Omit<ScoreLog, 'id' | 'modifiedAt'>): Promise<void> => {
  try {
    // 기존 함수로 로그 저장
    await logScoreChange(logData);
    
    // 실시간 업데이트를 위한 캐시 무효화
    if (logData.playerId) {
      invalidatePlayerLogCache(logData.playerId);
    }
    if (logData.matchId) {
      invalidateMatchLogCache(logData.matchId);
    }
    if (logData.modifiedByType === 'self') {
      invalidateSelfScoringLogCache();
    }
    
    console.log(`[실시간 업데이트] 점수 변경 로그 저장 및 캐시 무효화 완료`);
  } catch (error) {
    throw error;
  }
};

/**
 * 실시간 구독 최적화를 위한 함수
 * 점수 변경 시 자동으로 로그 캐시를 무효화하여 실시간 업데이트 보장
 */
export const setupRealTimeScoreUpdate = (onScoreChange: (playerId: string) => void): void => {
  if (typeof window === 'undefined') return;
  
  // 전역 이벤트 리스너 설정
  const handleScoreChange = (event: CustomEvent) => {
    const { playerId } = event.detail;
    if (playerId) {
      invalidatePlayerLogCache(playerId);
      onScoreChange(playerId);
    }
  };
  
  window.addEventListener('scoreChange', handleScoreChange as EventListener);
  
  // 클린업 함수 반환 (사용하지 않음 - 전역 이벤트이므로)
  console.log(`[실시간 업데이트] 점수 변경 이벤트 리스너 설정 완료`);
};
