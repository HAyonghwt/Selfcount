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
