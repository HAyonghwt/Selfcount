import { Handler } from '@netlify/functions';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { credential } from 'firebase-admin';

// Firebase Admin 초기화
if (!process.env.FIREBASE_ADMIN_CREDENTIALS) {
  throw new Error('FIREBASE_ADMIN_CREDENTIALS 환경변수가 설정되지 않았습니다.');
}

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);

if (!initializeApp.length) {
  initializeApp({
    credential: credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://your-project.firebaseio.com'
  });
}

const db = getDatabase();

// 메모리에 마지막 점수 상태 저장 (실제 운영에서는 Redis 등 사용 권장)
const lastScoresState = new Map<string, any>();

export const handler: Handler = async (event, context) => {
  // CORS 헤더 설정
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // 그룹 파라미터 추출
  const group = event.queryStringParameters?.group || 'all';
  const lastUpdate = event.queryStringParameters?.lastUpdate || '0';
  
  try {
    // 점수 데이터 가져오기
    const scoresRef = db.ref('scores');
    const snapshot = await scoresRef.once('value');
    const currentScores = snapshot.val() || {};
    
    // 마지막 상태와 비교하여 변경사항만 반환
    const lastState = lastScoresState.get(group) || {};
    const changes = detectScoreChanges(lastState, currentScores, group);
    
    // 현재 상태 저장
    lastScoresState.set(group, currentScores);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        group,
        changes,
        timestamp: Date.now(),
        hasChanges: Object.keys(changes).length > 0
      })
    };

  } catch (error) {
    console.error('점수 폴링 API 에러:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// 점수 변경사항 감지 함수
function detectScoreChanges(lastState: any, currentState: any, group: string): any {
  const changes: any = {};
  
  // 모든 선수 ID에 대해 변경사항 확인
  const allPlayerIds = new Set([
    ...Object.keys(lastState),
    ...Object.keys(currentState)
  ]);
  
  for (const playerId of allPlayerIds) {
    const lastPlayerScores = lastState[playerId] || {};
    const currentPlayerScores = currentState[playerId] || {};
    
    // 해당 선수가 그룹에 속하는지 확인 (실제 구현에서는 players 데이터 참조 필요)
    if (group === 'all' || isPlayerInGroup(playerId, group)) {
      const playerChanges = detectPlayerScoreChanges(lastPlayerScores, currentPlayerScores);
      if (Object.keys(playerChanges).length > 0) {
        changes[playerId] = playerChanges;
      }
    }
  }
  
  return changes;
}

// 선수별 점수 변경사항 감지
function detectPlayerScoreChanges(lastScores: any, currentScores: any): any {
  const changes: any = {};
  const allCourseIds = new Set([
    ...Object.keys(lastScores),
    ...Object.keys(currentScores)
  ]);
  
  for (const courseId of allCourseIds) {
    const lastCourseScores = lastScores[courseId] || {};
    const currentCourseScores = currentScores[courseId] || {};
    
    const courseChanges = detectCourseScoreChanges(lastCourseScores, currentCourseScores);
    if (Object.keys(courseChanges).length > 0) {
      changes[courseId] = courseChanges;
    }
  }
  
  return changes;
}

// 코스별 홀 점수 변경사항 감지
function detectCourseScoreChanges(lastHoleScores: any, currentHoleScores: any): any {
  const changes: any = {};
  const allHoleNumbers = new Set([
    ...Object.keys(lastHoleScores),
    ...Object.keys(currentHoleScores)
  ]);
  
  for (const holeNumber of allHoleNumbers) {
    const lastScore = lastHoleScores[holeNumber];
    const currentScore = currentHoleScores[holeNumber];
    
    if (lastScore !== currentScore) {
      changes[holeNumber] = {
        oldValue: lastScore,
        newValue: currentScore,
        changed: true
      };
    }
  }
  
  return changes;
}

// 선수가 특정 그룹에 속하는지 확인 (실제 구현에서는 players 데이터 참조 필요)
function isPlayerInGroup(playerId: string, group: string): boolean {
  // 이 함수는 실제 구현에서 players 데이터를 참조하여 구현
  // 현재는 기본적으로 true 반환
  return true;
}
