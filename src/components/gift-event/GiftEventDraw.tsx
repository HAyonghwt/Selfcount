"use client";
import React, { useEffect, useState } from "react";
import Confetti from "react-confetti";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import { Trophy, Sparkles, Star, Crown } from "lucide-react";

interface Participant {
  id: string;
  name: string;
  club: string;
}

interface GiftEventDrawProps {
  winner: Participant | null;
  onAnimationEnd: () => void;
}

export default function GiftEventDraw({ winner, onAnimationEnd }: GiftEventDrawProps) {
  const [rolling, setRolling] = useState(false);
  const [final, setFinal] = useState(false);
  const [winners, setWinners] = useState<Participant[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [showWinnerList, setShowWinnerList] = useState(false);

  // 당첨자 명단 구독
  useEffect(() => {
    if (!db) return;
    const winnersRef = ref(db, "giftEvent/winners");
    const unsub = onValue(winnersRef, snap => setWinners(Array.isArray(snap.val()) ? snap.val() : []));
    return () => unsub();
  }, []);

  // 참가자 목록 구독 (실제 참가자 데이터 사용)
  useEffect(() => {
    if (!db) return;
    const playersRef = ref(db, "players");
    const unsub = onValue(playersRef, snap => {
      const playersData = snap.val() || {};
      const participantsList: Participant[] = Object.entries(playersData).map(([id, player]: [string, any]) => ({
        id,
        name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
        club: player.type === 'team' ? player.p1_affiliation : player.affiliation
      }));
      setParticipants(participantsList);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });
  }, []);

  // 물레방아 애니메이션 시작
  useEffect(() => {
    if (!winner || participants.length === 0) return;
    
    setRolling(true);
    setFinal(false);
    setShowWinnerList(false);
    setCurrentIndex(0);
    
    const startTime = performance.now();
    let animationId: number;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      
      // 1단계: 빠른 회전 (0-1초)
      if (elapsed <= 1000) {
        setCurrentIndex(prev => (prev + 1) % participants.length);
        animationId = requestAnimationFrame(animate);
      }
      // 2단계: 서서히 느려짐 (1-2초)
      else if (elapsed <= 2000) {
        const progress = (elapsed - 1000) / 1000; // 0-1
        // 속도를 점진적으로 늦춤: 50ms -> 200ms -> 500ms
        const delay = 50 + progress * 450;
        setTimeout(() => {
          setCurrentIndex(prev => (prev + 1) % participants.length);
          animationId = requestAnimationFrame(animate);
        }, delay);
      }
      // 3단계: 느리게 (2-3.5초) - 글자가 조금씩 보임
      else if (elapsed <= 3500) {
        const progress = (elapsed - 2000) / 1500; // 0-1
        // 속도를 느리게: 500ms -> 800ms -> 1200ms
        const delay = 500 + progress * 700;
        setTimeout(() => {
          setCurrentIndex(prev => (prev + 1) % participants.length);
          animationId = requestAnimationFrame(animate);
        }, delay);
      }
      // 4단계: 매우 느리게 (3.5-5초) - 탁탁탁 효과, 글자 식별 가능
      else if (elapsed <= 5000) {
        const progress = (elapsed - 3500) / 1500; // 0-1
        // 속도를 매우 느리게: 1200ms -> 2000ms -> 3000ms
        const delay = 1200 + progress * 1800;
        setTimeout(() => {
          setCurrentIndex(prev => (prev + 1) % participants.length);
          animationId = requestAnimationFrame(animate);
        }, delay);
      }
      // 5단계: 최종 멈춤
      else {
        setRolling(false);
        setFinal(true);
        setShowWinnerList(true);
        setTimeout(() => {
          onAnimationEnd();
        }, 1000); // 1초 후 결과 처리
        return;
      }
    };
    
    // 애니메이션 시작
    animationId = requestAnimationFrame(animate);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [winner, participants, onAnimationEnd]);

  if (!winner || participants.length === 0) return null;



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* 배경 효과 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-indigo-500/20 animate-pulse"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-ping"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      </div>

              {/* 메인 컨테이너 */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 flex flex-col items-center">
        {/* 헤더 */}
        <div className="text-center mb-8 w-full">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 flex items-center justify-center gap-4">
            <Trophy className="w-12 h-12 md:w-16 md:h-16 text-yellow-400" />
            경품 추첨
            <Trophy className="w-12 h-12 md:w-16 md:h-16 text-yellow-400" />
          </h1>
          <div className="text-xl md:text-2xl text-yellow-200 font-medium">
            {rolling ? "추첨 중..." : final ? "축하합니다!" : "잠시만요..."}
          </div>
        </div>

        {/* 추첨 결과 표시 */}
        {final ? (
          <div className="text-center">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-400 p-8 md:p-12 rounded-3xl shadow-2xl mb-8 animate-bounce">
              <div className="text-8xl md:text-9xl font-bold text-white mb-4">
                🎉
              </div>
              {/* PC뷰: 가로 배치 (기존과 동일) */}
              <div className="hidden md:flex items-center justify-center gap-4 md:gap-6">
                <div className="text-4xl md:text-6xl text-white/90">
                  {winner.club}
                </div>
                <div className="text-6xl md:text-8xl font-bold text-white">
                  {winner.name}
                </div>
              </div>
              {/* 모바일뷰: 세로 배치 (소속 위, 이름 아래) */}
              <div className="md:hidden flex flex-col items-center justify-center gap-3 w-full max-w-sm">
                <div className="text-4xl text-white/90">
                  {winner.club}
                </div>
                <div className="text-6xl font-bold text-white">
                  {winner.name}
                </div>
              </div>
            </div>
            <div className="text-3xl md:text-4xl text-yellow-200 font-bold animate-pulse">
              축하합니다! 🎊
            </div>
          </div>
        ) : (
          /* 슬롯머신 애니메이션 */
          <div className="relative h-96 md:h-[500px] w-full max-w-sm md:max-w-2xl mx-auto overflow-hidden rounded-3xl bg-gradient-to-b from-purple-800/50 to-blue-800/50 backdrop-blur-sm border border-white/20">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-full h-full flex justify-center">
                {/* 슬롯머신 카드 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-80 md:w-96 h-56 md:h-64 bg-gradient-to-r from-white/90 to-gray-100/90 backdrop-blur-sm rounded-3xl shadow-2xl border-2 border-yellow-400/60 flex flex-col items-center justify-center text-center p-6 md:p-8">
                    {/* 슬롯머신 소속 + 이름 표시 */}
                    <div className="flex flex-col items-center justify-center gap-4 md:gap-6">
                      {/* 소속 슬롯 (위에 크게) */}
                      <div className="w-32 md:w-40 h-16 md:h-20 bg-gradient-to-b from-red-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg border-2 border-red-500">
                        <span className="text-2xl md:text-3xl font-bold text-white">
                          {rolling ? participants[currentIndex]?.club || '크로바' : winner?.club || ''}
                        </span>
                      </div>
                      
                      {/* 이름 슬롯들 (아래에 아주 크게) */}
                      <div className="flex items-center justify-center gap-3 md:gap-4">
                        {(() => {
                          const currentName = rolling ? participants[currentIndex]?.name || '김철수' : winner?.name || '';
                          const nameArray = currentName.split('');
                          
                          // 3개 슬롯으로 나누기 (성씨, 첫글자, 둘째글자)
                          const slot1 = nameArray[0] || '김';
                          const slot2 = nameArray[1] || '철';
                          const slot3 = nameArray[2] || '수';
                          
                          return (
                            <>
                              {/* 성씨 슬롯 */}
                              <div className="w-20 md:w-24 h-24 md:h-28 bg-gradient-to-b from-yellow-400 to-orange-400 rounded-2xl flex items-center justify-center shadow-lg border-2 border-yellow-500">
                                <span className="text-5xl md:text-7xl font-bold text-white leading-none">{slot1}</span>
                              </div>
                              {/* 이름 첫글자 슬롯 */}
                              <div className="w-20 md:w-24 h-24 md:h-28 bg-gradient-to-b from-blue-400 to-purple-400 rounded-2xl flex items-center justify-center shadow-lg border-2 border-blue-500">
                                <span className="text-5xl md:text-7xl font-bold text-white leading-none">{slot2}</span>
                              </div>
                              {/* 이름 둘째글자 슬롯 */}
                              <div className="w-20 md:w-24 h-24 md:h-28 bg-gradient-to-b from-green-400 to-teal-400 rounded-2xl flex items-center justify-center shadow-lg border-2 border-green-500">
                                <span className="text-5xl md:text-7xl font-bold text-white leading-none">{slot3}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    
                    {rolling && (
                      <div className="text-lg md:text-xl text-yellow-600 font-semibold animate-pulse">
                        추첨 중...
                      </div>
                    )}
                  </div>
                </div>
                
                {/* 중앙 하이라이트 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-80 md:w-96 h-56 md:h-64 bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-3xl border-2 border-yellow-400/40 animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 당첨자 명단 (오른쪽 아래) - 외부 전광판용 */}
        {showWinnerList && (
          <div className="fixed bottom-4 right-4 z-50 hidden md:block">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 md:p-6 shadow-2xl border border-white/30 max-w-2xl">
              <div className="flex items-center gap-2 mb-3">
                <Crown className="w-5 h-5 text-yellow-600" />
                <h3 className="font-bold text-gray-800 text-lg">당첨자 명단</h3>
              </div>
              <div className="space-y-2">
                {winners.length === 0 ? (
                  <p className="text-gray-500 text-sm">아직 없음</p>
                ) : (
                  <div className="space-y-2">
                    {winners.slice(-8).map((w, index) => (
                      <div key={`${w.id}_${index}`} className="flex items-center gap-2 p-2 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg">
                        <div className="w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                          {winners.length - 8 + index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800 text-sm truncate">{w.name}</div>
                          <div className="text-xs text-gray-500 truncate">{w.club}</div>
                        </div>
                        <Star className="w-4 h-4 text-yellow-500" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* 폭죽 효과 */}
      {final && (
        <Confetti
          gravity={0.1}
          numberOfPieces={200}
          width={windowSize.width}
          height={windowSize.height}
          recycle={true}
          style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 30 }}
          colors={['#FFD700', '#FF69B4', '#FFFACD', '#FF6347', '#87CEFA', '#ADFF2F', '#00E6B8', '#FFB347', '#B39DDB', '#FF6B6B']}
          initialVelocityY={20}
          initialVelocityX={10}
          run={true}
        />
      )}

      {/* 추가 폭죽 효과 */}
      {final && (
        <Confetti
          gravity={0.05}
          numberOfPieces={100}
          width={windowSize.width}
          height={windowSize.height}
          recycle={true}
          style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 31 }}
          colors={['#FFD700', '#FF69B4', '#FFFACD', '#FF6347', '#87CEFA']}
          initialVelocityY={15}
          initialVelocityX={5}
          run={true}
        />
      )}
    </div>
  );
}
