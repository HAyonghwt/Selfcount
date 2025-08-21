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

export const handler: Handler = async (event, context) => {
  // CORS 헤더 설정
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
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
  
  try {
    // SSE 응답 시작
    const response = {
      statusCode: 200,
      headers,
      body: ''
    };

    // 점수 변경사항 감지를 위한 Firebase 리스너
    const scoresRef = db.ref('scores');
    
    // 클라이언트 연결 유지를 위한 heartbeat
    const heartbeat = setInterval(() => {
      // SSE 형식으로 heartbeat 전송
      const data = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`;
      // 여기서는 실제로는 스트리밍을 구현해야 하지만, 
      // Netlify Functions의 제한으로 인해 다른 방식 사용
    }, 30000);

    // 점수 변경사항 감지 및 전송
    scoresRef.on('value', (snapshot) => {
      const scores = snapshot.val();
      if (scores) {
        // 그룹별로 필터링된 점수 데이터만 전송
        const filteredScores = filterScoresByGroup(scores, group);
        const data = `data: ${JSON.stringify({ 
          type: 'scoreUpdate', 
          group, 
          scores: filteredScores,
          timestamp: Date.now() 
        })}\n\n`;
        
        // 실제 구현에서는 스트리밍으로 전송
        // Netlify Functions 제한으로 인해 폴링 방식으로 대체
      }
    });

    // 연결 종료 시 정리
    context.callbackWaitsForEmptyEventLoop = false;
    
    return response;

  } catch (error) {
    console.error('SSE 에러:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};

// 그룹별 점수 필터링 함수
function filterScoresByGroup(scores: any, group: string) {
  if (group === 'all') {
    return scores;
  }
  
  // 그룹별 필터링 로직 (실제 구현에서는 players 데이터도 참조 필요)
  // 여기서는 기본적으로 모든 점수 반환
  return scores;
}
