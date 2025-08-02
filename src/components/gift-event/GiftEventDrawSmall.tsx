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

interface GiftEventDrawSmallProps {
  winner: Participant | null;
  onAnimationEnd: () => void;
}

export default function GiftEventDrawSmall({ winner, onAnimationEnd }: GiftEventDrawSmallProps) {
  const [rolling, setRolling] = useState(false);
  const [final, setFinal] = useState(false);
  const [winners, setWinners] = useState<Participant[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
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
      
      // 1단계: 빠른 회전 (0-0.75초)
      if (elapsed <= 750) {
        setCurrentIndex(prev => (prev + 1) % participants.length);
        animationId = requestAnimationFrame(animate);
      }
      // 2단계: 서서히 느려짐 (0.75-1.5초)
      else if (elapsed <= 1500) {
        const progress = (elapsed - 750) / 750; // 0-1
        // 속도를 점진적으로 늦춤: 50ms -> 150ms -> 400ms
        const delay = 50 + progress * 350;
        setTimeout(() => {
          setCurrentIndex(prev => (prev + 1) % participants.length);
          animationId = requestAnimationFrame(animate);
        }, delay);
      }
      // 3단계: 매우 느리게 (1.5-2.5초) - 탁탁탁 효과
      else if (elapsed <= 2500) {
        const progress = (elapsed - 1500) / 1000; // 0-1
        // 속도를 매우 느리게: 400ms -> 1200ms -> 2000ms
        const delay = 400 + progress * 1600;
        setTimeout(() => {
          setCurrentIndex(prev => (prev + 1) % participants.length);
          animationId = requestAnimationFrame(animate);
        }, delay);
      }
      // 4단계: 최종 멈춤
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

  // 물레방아처럼 돌아가는 참가자 목록 생성
  const createWheelList = () => {
    const wheel = [];
    // 2바퀴 정도로 충분한 목록 생성
    for (let i = 0; i < 2; i++) {
      wheel.push(...participants);
    }
    return wheel;
  };

  const wheelList = createWheelList();

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 rounded-lg overflow-hidden">
      {/* 배경 효과 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-indigo-500/20 animate-pulse"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-yellow-400 rounded-full animate-ping"
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
      <div className="relative z-10 w-full h-full flex flex-col">
        {/* 헤더 */}
        <div className="text-center p-4">
          <h1 className="text-lg font-bold text-white mb-2 flex items-center justify-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            경품 추첨
            <Trophy className="w-4 h-4 text-yellow-400" />
          </h1>
          <div className="text-sm text-yellow-200 font-medium">
            {rolling ? "추첨 중..." : final ? "축하합니다!" : "잠시만요..."}
          </div>
        </div>

        {/* 추첨 결과 표시 */}
        {final ? (
          <div className="text-center flex-1 flex flex-col justify-center">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-400 p-4 rounded-xl shadow-lg mb-4 mx-4">
              <div className="text-4xl font-bold text-white mb-2">
                🎉
              </div>
              <div className="flex items-center justify-center gap-3">
                <div className="text-xl text-white/90">
                  {winner.club}
                </div>
                <div className="text-3xl font-bold text-white">
                  {winner.name}
                </div>
              </div>
            </div>
            <div className="text-lg text-yellow-200 font-bold animate-pulse">
              축하합니다! 🎊
            </div>
          </div>
        ) : (
          /* 물레방아 애니메이션 */
          <div className="relative flex-1 overflow-hidden rounded-lg bg-gradient-to-b from-purple-800/50 to-blue-800/50 backdrop-blur-sm border border-white/20 mx-4 mb-4">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-full h-full">
                {/* 물레방아처럼 돌아가는 참가자 목록 */}
                <div 
                  className="absolute left-1/2 transform -translate-x-1/2"
                  style={{
                    transform: `translateX(-50%) translateY(${rolling ? -currentIndex * 50 : 0}px)`,
                  }}
                >
                  {wheelList.map((participant, index) => {
                    const distance = Math.abs(index - currentIndex);
                    const opacity = Math.max(0.1, 1 - distance * 0.25);
                    const scale = Math.max(0.7, 1 - distance * 0.2);
                    const blur = distance * 1;
                    
                    return (
                      <div
                        key={`${participant.id}_${index}`}
                        className="absolute left-1/2 transform -translate-x-1/2 w-64 md:w-72"
                        style={{
                          top: `${index * 50}px`,
                          opacity,
                          transform: `scale(${scale})`,
                          filter: `blur(${blur}px)`,
                          zIndex: 1000 - distance,
                        }}
                      >
                        <div className="bg-gradient-to-r from-white/90 to-gray-100/90 backdrop-blur-sm rounded-xl p-4 md:p-6 shadow-lg border border-white/30">
                          <div className="flex items-center justify-center gap-2 md:gap-3">
                            <div className="text-sm md:text-base text-gray-600">
                              {participant.club}
                            </div>
                            <div className="text-lg md:text-xl font-bold text-gray-800">
                              {participant.name}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* 중앙 하이라이트 */}
                <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 md:w-72 h-20 bg-gradient-to-r from-yellow-400/30 to-orange-400/30 rounded-full border-2 border-yellow-400/60 animate-pulse"></div>
              </div>
            </div>
          </div>
        )}


      </div>

      {/* 폭죽 효과 */}
      {final && (
        <Confetti
          gravity={0.1}
          numberOfPieces={100}
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={true}
          style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 30 }}
          colors={['#FFD700', '#FF69B4', '#FFFACD', '#FF6347', '#87CEFA', '#ADFF2F', '#00E6B8', '#FFB347', '#B39DDB', '#FF6B6B']}
          initialVelocityY={15}
          initialVelocityX={8}
          run={true}
        />
      )}

      {/* 추가 폭죽 효과 */}
      {final && (
        <Confetti
          gravity={0.05}
          numberOfPieces={50}
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={true}
          style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 31 }}
          colors={['#FFD700', '#FF69B4', '#FFFACD', '#FF6347', '#87CEFA']}
          initialVelocityY={10}
          initialVelocityX={5}
          run={true}
        />
      )}
    </div>
  );
} 