exports.handler = async (event, context) => {
  // SSE 응답 헤더 설정
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  };

  // 간단한 SSE 응답
  const response = {
    statusCode: 200,
    headers,
    body: `data: {"type": "connected", "message": "SSE 테스트 연결 성공", "timestamp": "${new Date().toISOString()}"}\n\n`
  };

  return response;
};
