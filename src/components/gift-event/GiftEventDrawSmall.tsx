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
  drawStartTime?: number | null;
  logoUrl?: string;
  logoSettings?: {
    enabled: boolean;
    size: number;
    opacity: number;
    offsetX: number;
    offsetY: number;
    saturation?: number;
    intensity?: number;
  };
}

export default function GiftEventDrawSmall({ winner, onAnimationEnd, drawStartTime, logoUrl, logoSettings }: GiftEventDrawSmallProps) {
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

    // 타임스탬프 기반 동기화 로직
    const now = Date.now();
    const startTime = drawStartTime || now; // 없으면 현재 시간(기존 로직 호환)
    const elapsedAtStart = now - startTime;
    const ANIMATION_DURATION = 3500; // 전체 애니메이션 시간 (2.5초 + 1초 대기)

    // 이미 애니메이션이 끝난 시간이면 바로 결과 표시
    if (drawStartTime && elapsedAtStart >= 2500) {
      setRolling(false);
      setFinal(true);
      setShowWinnerList(true);
      setTimeout(() => onAnimationEnd(), 100);
      return;
    }

    setRolling(true);
    setFinal(false);
    setShowWinnerList(false);
    setCurrentIndex(0);

    let animationId: number;
    let localStartTime = performance.now() - (drawStartTime ? elapsedAtStart : 0);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - localStartTime;

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
  }, [winner, participants, onAnimationEnd, drawStartTime]);

  if (!winner || participants.length === 0) return null;

  // 로고 스타일 생성
  const getLogoStyle = () => {
    if (!logoUrl || !logoSettings?.enabled) return {};

    return {
      position: 'absolute' as const,
      top: '50%',
      left: '50%',
      transform: `translate(-50%, -50%) translate(${logoSettings.offsetX / 20}vw, ${logoSettings.offsetY / 20}vh) scale(${logoSettings.size})`,
      width: '60%',
      height: '60%',
      backgroundImage: `url('${logoUrl.replace(/'/g, "\\'")}')`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'contain',
      opacity: logoSettings.opacity,
      filter: `grayscale(100%) sepia(100%) saturate(${logoSettings.saturation ?? 400}%) hue-rotate(-10deg) brightness(${(logoSettings.intensity ?? 200) / 100}) contrast(${(logoSettings.intensity ?? 200) / 100})`,
      pointerEvents: 'none' as const,
      zIndex: 0
    };
  };

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
            <div className="bg-gradient-to-r from-yellow-400 to-orange-400 p-4 rounded-xl shadow-lg mb-4 mx-4 relative overflow-hidden">
              {/* 로고 오버레이 (미리보기용) */}
              {logoUrl && logoSettings?.enabled && (
                <div style={getLogoStyle()} />
              )}

              <div className="relative z-10">
                <div className="text-4xl font-bold text-white mb-2">
                  🎉
                </div>
                {/* PC뷰: 가로 배치 */}
                <div className="hidden md:flex items-center justify-center gap-3">
                  <div className="text-xl text-white/90">
                    {winner.club}
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {winner.name}
                  </div>
                </div>
                {/* 모바일뷰: 세로 배치 */}
                <div className="md:hidden flex flex-col items-center justify-center gap-1">
                  <div className="text-lg text-white/90">
                    {winner.club}
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {winner.name}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-lg text-yellow-200 font-bold animate-pulse">
              축하합니다! 🎊
            </div>
          </div>
        ) : (
          /* 슬롯머신 애니메이션 */
          <div className="relative flex-1 overflow-hidden rounded-lg bg-gradient-to-b from-purple-800/50 to-blue-800/50 backdrop-blur-sm border border-white/20 mx-4 mb-4">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-full h-full flex justify-center">
                {/* 슬롯머신 카드 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-56 md:w-64 h-32 md:h-40 bg-gradient-to-r from-white/90 to-gray-100/90 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-yellow-400/60 flex flex-col items-center justify-center text-center p-3 md:p-4">
                    {/* 슬롯머신 소속 + 이름 표시 */}
                    <div className="flex flex-col items-center justify-center gap-2 md:gap-3">
                      {/* 소속 슬롯 (위에) */}
                      <div className="w-20 md:w-24 h-10 md:h-12 bg-gradient-to-b from-red-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg border-2 border-red-500">
                        <span className="text-sm md:text-base font-bold text-white">
                          {rolling ? participants[currentIndex]?.club || '크로바' : winner?.club || ''}
                        </span>
                      </div>

                      {/* 이름 슬롯들 (아래에) */}
                      <div className="flex items-center justify-center gap-2 md:gap-3">
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
                              <div className="w-12 md:w-14 h-12 md:h-14 bg-gradient-to-b from-yellow-400 to-orange-400 rounded-lg flex items-center justify-center shadow-lg border-2 border-yellow-500">
                                <span className="text-lg md:text-xl font-bold text-white leading-none">{slot1}</span>
                              </div>
                              {/* 이름 첫글자 슬롯 */}
                              <div className="w-12 md:w-14 h-12 md:h-14 bg-gradient-to-b from-blue-400 to-purple-400 rounded-lg flex items-center justify-center shadow-lg border-2 border-blue-500">
                                <span className="text-lg md:text-xl font-bold text-white leading-none">{slot2}</span>
                              </div>
                              {/* 이름 둘째글자 슬롯 */}
                              <div className="w-12 md:w-14 h-12 md:h-14 bg-gradient-to-b from-green-400 to-teal-400 rounded-lg flex items-center justify-center shadow-lg border-2 border-green-500">
                                <span className="text-lg md:text-xl font-bold text-white leading-none">{slot3}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {rolling && (
                      <div className="text-xs md:text-sm text-yellow-600 font-semibold animate-pulse mt-1">
                        추첨 중...
                      </div>
                    )}
                  </div>
                </div>

                {/* 중앙 하이라이트 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-56 md:w-64 h-32 md:h-40 bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-2xl border-2 border-yellow-400/40 animate-pulse"></div>
                </div>
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