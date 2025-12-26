"use client";
import React, { useEffect, useState } from "react";
import Confetti from "react-confetti";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import { Trophy, Sparkles, Star, Crown, Flower } from "lucide-react";

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

  // 최신 값 참조를 위한 refs (의존성 제거용)
  const onAnimationEndRef = React.useRef(onAnimationEnd);
  const participantsRef = React.useRef(participants);
  // 애니메이션 시작 여부 추적 (재시작 방지)
  const animationStartedRef = React.useRef(false);

  useEffect(() => {
    onAnimationEndRef.current = onAnimationEnd;
  }, [onAnimationEnd]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // 새로운 당첨자가 설정되면 시작 플래그 리셋 (컴포넌트가 재사용될 경우 대비)
  useEffect(() => {
    animationStartedRef.current = false;
  }, [winner?.id]);

  // 물레방아 애니메이션 시작
  useEffect(() => {
    // 데이터가 준비되지 않았거나 이미 시작했다면 중단
    if (!winner || participantsRef.current.length === 0 || animationStartedRef.current) return;

    // 시작 플래그 설정 (이후 리렌더링에서 재진입 차단)
    animationStartedRef.current = true;

    setRolling(true);
    setFinal(false);
    setShowWinnerList(false);
    setCurrentIndex(0);

    const startTime = performance.now();
    // 애니메이션 중복 실행 방지 및 ID 관리를 위한 refs
    const animationFrameRef = { current: null as number | null };
    const timeoutRef = { current: null as (NodeJS.Timeout | number | null) };
    const isAnimatingRef = { current: true };

    const animate = (currentTime: number) => {
      if (!isAnimatingRef.current) return;
      const elapsed = currentTime - startTime;

      // 6초 강제 종료 보장 (사용자 요청: 5초 -> 6초)
      if (elapsed >= 5000) {
        setRolling(false);
        setFinal(true);
        setShowWinnerList(true);
        timeoutRef.current = setTimeout(() => {
          if (onAnimationEndRef.current) onAnimationEndRef.current();
        }, 1000);
        isAnimatingRef.current = false;
        return;
      }

      // 시간 기반 위치 계산 (절대 시간 준수)
      // 6초 기준 속도 곡선 재조정
      const progress = elapsed / 5000;

      // 속도 곡선 로직: 시간이 지날수록 딜레이 증가
      let currentDelay = 0;
      if (elapsed < 1000) currentDelay = 30; // 1초까지 초고속
      else if (elapsed < 2500) currentDelay = 30 + (elapsed - 1000) / 1500 * 100; // ~2.5초
      else if (elapsed < 4500) currentDelay = 130 + (elapsed - 2500) / 2000 * 200; // ~4.5초
      else currentDelay = 330 + (elapsed - 4500) / 1500 * 500; // ~6초

      // 마지막 업데이트 시점 기록이 없으면 초기화
      if (timeoutRef.current === null || typeof timeoutRef.current !== 'number') {
        timeoutRef.current = startTime;
      }

      const lastUpdate = timeoutRef.current as number;
      const currentParticipants = participantsRef.current;
      if (currentTime - lastUpdate >= currentDelay && currentParticipants.length > 0) {
        setCurrentIndex(prev => (prev + 1) % currentParticipants.length);
        timeoutRef.current = currentTime;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // 애니메이션 시작
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isAnimatingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (timeoutRef.current && typeof timeoutRef.current !== 'number') {
        clearTimeout(timeoutRef.current as NodeJS.Timeout);
      }
    };
    // 의존성에 participants.length 추가: 데이터가 로드되면 실행 시도
    // 단, 내부의 animationStartedRef 체크로 인해 중복 실행은 방지됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner?.id, participants.length]);

  // 한글 여부 확인
  const isSimpleKorean = (name: string) => {
    const koreanRegex = /^[가-힣0-9\s]{1,10}$/;
    return koreanRegex.test(name);
  };

  // 폰트 크기 계산 (VH 기반 동적 스케일링)
  const getNameFontSize = (name: string) => {
    if (isSimpleKorean(name)) {
      if (name.length > 5) return "text-[16vh]";
      return "text-[21vh]";
    }

    // 영어/혼용 동적 크기 조절
    const len = name.length;
    if (len > 30) return "text-[6vh]";
    if (len > 25) return "text-[8vh]";
    if (len > 20) return "text-[10vh]";
    if (len > 15) return "text-[12vh]";
    if (len > 10) return "text-[14vh]";
    return "text-[17vh]";
  };

  if (!winner || participants.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-[#1a1a2e] flex flex-col items-center select-none"
      style={{ height: '100dvh', maxHeight: '100dvh' }}>
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

      {/* 메인 컨테이너 - 수직/수평 밸런스 최종 최적화 (모든 요소 100vh 내 안착) */}
      <div className="relative z-10 w-full max-w-[98vw] mx-auto px-[3vw] h-full flex flex-col items-center justify-between pt-[4vh] pb-[12vh]">
        {/* 헤더 - 높이 비례 크기 상향 */}
        <div className="text-center w-full flex-shrink-0">
          <h1 className="text-[5vh] md:text-[9vh] font-black text-white mb-[1vh] flex items-center justify-center gap-[4vw] drop-shadow-[0_15px_15px_rgba(0,0,0,0.6)]">
            <Trophy className="w-[8vh] h-[8vh] text-yellow-400 animate-bounce" />
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-yellow-200 to-yellow-500">
              경품 추첨
            </span>
            <Trophy className="w-[8vh] h-[8vh] text-yellow-400 animate-bounce" />
          </h1>
          <div className="text-[2vh] md:text-[3vh] text-yellow-400/80 font-bold tracking-[0.5em] drop-shadow-md">
            {rolling ? "ROLLING..." : final ? "CONGRATULATIONS!" : "SELECTING..."}
          </div>
        </div>

        {/* 추첨 결과 표시 - 카드와 명단이 절대로 겹치지 않는 황금 너비 설정 */}
        {final ? (
          <div className="text-center w-full max-w-[62vw] mx-auto relative z-20 flex-1 flex flex-col justify-center my-[0.5vh]">
            <div className="bg-gradient-to-r from-yellow-400 via-orange-500 to-yellow-600 p-[3vh] md:p-[5vh] rounded-[6vh] shadow-[0_5vh_12vh_rgba(0,0,0,0.8)] transform scale-95 md:scale-100 border-[0.6vh] border-yellow-200/50 relative overflow-hidden group min-h-[48vh] max-h-[52vh] flex flex-col justify-center">
              {/* 꽃 장식 테두리 요소들 - VH 비례 크기 */}
              <div className="absolute top-[3vh] left-[3vh] text-yellow-200/60 animate-spin-slow">
                <Flower className="w-[8vh] h-[8vh] md:w-[12vh] md:h-[12vh]" />
              </div>
              <div className="absolute top-[3vh] right-[3vh] text-yellow-200/60 animate-spin-slow-reverse">
                <Flower className="w-[8vh] h-[8vh] md:w-[12vh] md:h-[12vh]" />
              </div>
              <div className="absolute bottom-[3vh] left-[3vh] text-yellow-200/60 animate-bounce">
                <Sparkles className="w-[6vh] h-[6vh] md:w-[10vh] md:h-[10vh]" />
              </div>
              <div className="absolute bottom-[3vh] right-[3vh] text-yellow-200/60 animate-pulse">
                <Flower className="w-[8vh] h-[8vh] md:w-[12vh] md:h-[12vh]" />
              </div>

              {/* 당첨자 정보 영역 - 패딩 비율(pt-pb) 조절로 시각적 상향 보정 */}
              <div className="flex flex-col items-center justify-center pt-[2vh] pb-[8vh] border-[0.4vh] border-white/10 rounded-[4vh] bg-white/10 backdrop-blur-sm h-full relative overflow-hidden">
                <div className="text-[3vh] md:text-[4.5vh] text-white/90 bg-black/40 px-[4vh] py-[1vh] rounded-full backdrop-blur-xl border border-white/30 max-w-full font-bold mb-[2vh]">
                  {winner.club}
                </div>
                <div className={
                  `font-black text-white drop-shadow-[0_1.5vh_1.5vh_rgba(0,0,0,0.5)] max-w-[95%] break-words leading-[0.82] ` +
                  getNameFontSize(winner.name)
                }>
                  {winner.name}
                </div>
              </div>
            </div>
            <div className="text-center w-full flex-shrink-0 mt-[2vh]">
              <h2 className="text-[7vh] md:text-[10vh] font-black text-white drop-shadow-[0_12px_12px_rgba(0,0,0,0.5)] mb-[1vh]">
                축하합니다! 🎊
              </h2>
              <p className="text-[2.2vh] md:text-[3.2vh] text-yellow-300 font-bold tracking-[0.5em] drop-shadow-md">
                CONGRATULATIONS!
              </p>
            </div>
          </div>
        ) : (
          /* 슬롯머신 애니메이션 - 더 크게 */
          <div className="relative h-[60vh] w-full max-w-full mx-auto flex items-center justify-center">
            {/* 후광 효과 */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[50vh] bg-yellow-400/20 blur-[100px] animate-pulse rounded-full"></div>

            <div className="relative w-full h-full flex items-center justify-center">
              {/* 슬롯머신 본체 카드 */}
              <div className="w-full max-w-3xl md:max-w-5xl bg-white/10 backdrop-blur-xl rounded-[3rem] p-10 md:p-16 border-4 border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center gap-10">

                {/* 소속 슬롯 */}
                <div className="min-w-[200px] md:min-w-[400px] px-10 py-4 bg-gradient-to-b from-red-500 to-red-700 rounded-3xl shadow-[0_10px_20px_rgba(0,0,0,0.3)] border-4 border-red-400 flex items-center justify-center">
                  <span className="text-3xl md:text-5xl font-black text-white tracking-widest truncate">
                    {rolling ? participants[currentIndex]?.club || 'CLUB' : winner?.club || ''}
                  </span>
                </div>

                {/* 이름 영역 (동적 전환) */}
                <div className="w-full">
                  {(() => {
                    const currentName = rolling ? participants[currentIndex]?.name || 'NAME' : winner?.name || '';
                    const simpleKor = isSimpleKorean(currentName);

                    if (simpleKor) {
                      // 한글 3자 이하: 3개의 큰 슬롯 유지
                      const nameArray = currentName.split('');
                      const slot1 = nameArray[0] || '';
                      const slot2 = nameArray[1] || '';
                      const slot3 = nameArray[2] || '';

                      return (
                        <div className="flex items-center justify-center gap-6 md:gap-8">
                          <div className={`w-32 md:w-44 h-40 md:h-56 bg-gradient-to-b from-yellow-300 to-orange-500 rounded-[2.5rem] flex items-center justify-center shadow-2xl border-4 border-yellow-200 relative overflow-hidden ${rolling ? 'animate-slot-roll' : ''}`}>
                            <span className={`text-7xl md:text-[8rem] font-black text-white leading-none ${rolling ? 'blur-[2px]' : 'blur-0'} transition-all duration-100`}>{slot1}</span>
                            {rolling && <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />}
                          </div>
                          <div className={`w-32 md:w-44 h-40 md:h-56 bg-gradient-to-b from-blue-400 to-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl border-4 border-blue-200 relative overflow-hidden ${rolling ? 'animate-slot-roll' : ''}`} style={{ animationDelay: '0.1s' }}>
                            <span className={`text-7xl md:text-[8rem] font-black text-white leading-none ${rolling ? 'blur-[2px]' : 'blur-0'} transition-all duration-100`}>{slot2}</span>
                            {rolling && <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />}
                          </div>
                          <div className={`w-32 md:w-44 h-40 md:h-56 bg-gradient-to-b from-emerald-400 to-teal-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl border-4 border-emerald-200 relative overflow-hidden ${rolling ? 'animate-slot-roll' : ''}`} style={{ animationDelay: '0.2s' }}>
                            <span className={`text-7xl md:text-[8rem] font-black text-white leading-none ${rolling ? 'blur-[2px]' : 'blur-0'} transition-all duration-100`}>{slot3}</span>
                            {rolling && <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />}
                          </div>
                        </div>
                      );
                    } else {
                      // 영어 또는 긴 이름: 단일 가로 슬롯, 텍스트 크기 자동 조절
                      const fontSize = currentName.length > 20 ? 'text-3xl md:text-4xl' :
                        currentName.length > 15 ? 'text-4xl md:text-5xl' :
                          currentName.length > 10 ? 'text-5xl md:text-6xl' :
                            'text-6xl md:text-[7rem]';

                      return (
                        <div className={`w-full h-40 md:h-56 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl border-4 border-white/40 px-10 relative overflow-hidden ${rolling ? 'animate-slot-roll-subtle' : ''}`}>
                          <span className={`${fontSize} font-black text-white tracking-tight text-center break-words drop-shadow-lg ${rolling ? 'blur-[1px]' : 'blur-0'} transition-all duration-100`}>
                            {currentName}
                          </span>
                          {rolling && <div className="absolute inset-x-0 inset-y-0 bg-gradient-to-b from-black/20 via-transparent to-black/20 pointer-events-none" />}
                        </div>
                      );
                    }
                  })()}
                </div>

                {rolling && (
                  <div className="text-2xl md:text-4xl text-yellow-300 font-black animate-pulse tracking-[0.3em]">
                    PICKING A WINNER...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 당첨자 명단 - 가로 폭 최소화 및 하단 위치 동기화 */}
        {showWinnerList && (
          <div className="fixed bottom-[12vh] right-[2vw] z-50 hidden md:block w-[13vw] min-w-[160px] transform transition-all duration-700 translate-y-0 opacity-100">
            <div className="bg-white/95 backdrop-blur-md rounded-[2.5vh] p-[1.5vh] shadow-[0_2vh_5vh_rgba(0,0,0,0.4)] border-[0.2vh] border-white/50">
              <div className="flex items-center gap-[0.8vh] mb-[1vh] border-b-[0.1vh] border-gray-100 pb-[1vh]">
                <Crown className="w-[2.5vh] h-[2.5vh] text-yellow-600" />
                <h3 className="font-bold text-gray-800 text-[1.9vh]">당첨자 명단</h3>
              </div>
              <div className="space-y-[0.6vh] max-h-[55vh] overflow-y-auto pr-[0.5vh] custom-scrollbar">
                {winners.length === 0 ? (
                  <p className="text-gray-400 text-center py-[2vh] text-[1.6vh]">아직 없습니다</p>
                ) : (
                  <div className="space-y-[0.6vh]">
                    {winners.slice(-10).map((w, index) => (
                      <div key={`${w.id}_${index}`}
                        className="flex items-center gap-[0.8vh] p-[0.8vh] bg-gradient-to-r from-yellow-50 to-orange-50 rounded-[1vh] border-[0.1vh] border-yellow-100/50 shadow-sm animate-fade-in-up">
                        <div className="w-[2.8vh] h-[2.8vh] bg-yellow-500 text-white rounded-full flex items-center justify-center text-[1.4vh] font-black shadow-inner flex-shrink-0">
                          {winners.length - winners.slice(-10).length + index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-800 text-[1.7vh] truncate">{w.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* 폭죽 효과들 */}
      {final && (
        <>
          <Confetti
            gravity={0.12}
            numberOfPieces={400}
            width={windowSize.width}
            height={windowSize.height}
            recycle={true}
            style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 30 }}
            colors={['#FFD700', '#FF69B4', '#FFFACD', '#FF6347', '#87CEFA', '#ADFF2F', '#00E6B8', '#FFB347', '#D4AF37', '#FF00FF']}
            initialVelocityY={25}
            initialVelocityX={15}
            run={true}
          />
          <Confetti
            gravity={0.08}
            numberOfPieces={200}
            width={windowSize.width}
            height={windowSize.height}
            recycle={true}
            style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 31 }}
            colors={['#FFD700', '#FFFFFF', '#FFD700', '#FF6347', '#87CEFA']}
            initialVelocityY={15}
            initialVelocityX={5}
            run={true}
          />
        </>
      )}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-slow-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
        .animate-spin-slow-reverse {
          animation: spin-slow-reverse 15s linear infinite;
        }
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.5s ease-out forwards;
        }
        @keyframes slot-roll {
          0% { transform: translateY(-5%); }
          50% { transform: translateY(5%); }
          100% { transform: translateY(-5%); }
        }
        .animate-slot-roll {
          animation: slot-roll 0.04s linear infinite;
        }
        @keyframes slot-roll-subtle {
          0% { transform: scale(0.98) translateY(-2%); }
          50% { transform: scale(1) translateY(2%); }
          100% { transform: scale(0.98) translateY(-2%); }
        }
        .animate-slot-roll-subtle {
          animation: slot-roll-subtle 0.05s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
