const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue } = require('firebase/database');

// Firebase 설정 (환경변수에서 가져오기)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

exports.handler = async (event, context) => {
  // SSE 응답 헤더 설정
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  };

  // Firebase 초기화
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  // SSE 응답 시작
  const response = {
    statusCode: 200,
    headers,
    body: ''
  };

  // Firebase 실시간 리스너 설정
  const playersRef = ref(db, 'players');
  const scoresRef = ref(db, 'scores');
  const tournamentRef = ref(db, 'tournaments/current');

  // 변경사항을 클라이언트에게 전송하는 함수
  const sendUpdate = (data) => {
    const updateData = `data: ${JSON.stringify(data)}\n\n`;
    response.body += updateData;
  };

  // 초기 데이터 전송
  sendUpdate({
    type: 'connected',
    message: 'SSE 연결 성공',
    timestamp: new Date().toISOString()
  });

  // Firebase 데이터 변경 감지
  onValue(playersRef, (snapshot) => {
    sendUpdate({
      type: 'players_update',
      data: snapshot.val(),
      timestamp: new Date().toISOString()
    });
  });

  onValue(scoresRef, (snapshot) => {
    sendUpdate({
      type: 'scores_update',
      data: snapshot.val(),
      timestamp: new Date().toISOString()
    });
  });

  onValue(tournamentRef, (snapshot) => {
    sendUpdate({
      type: 'tournament_update',
      data: snapshot.val(),
      timestamp: new Date().toISOString()
    });
  });

  return response;
};
