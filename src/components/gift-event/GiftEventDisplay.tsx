"use client";
import React, { useEffect, useState } from "react";
import Confetti from "react-confetti";
import { db } from "@/lib/firebase";
import { ref, onValue, get, update } from "firebase/database";
import GiftEventDraw from './GiftEventDraw';
import { Trophy, Sparkles, Crown, Star } from "lucide-react";

interface Participant {
  id: string;
  name: string;
  club: string;
}

export default function GiftEventDisplay() {
  const [status, setStatus] = useState("waiting");
  const [winners, setWinners] = useState([]);
  const [currentWinner, setCurrentWinner] = useState<any>(null);
  const [lastWinner, setLastWinner] = useState(null);
  const [showWinners, setShowWinners] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [drawStartTime, setDrawStartTime] = useState<number | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [logoSettings, setLogoSettings] = useState({
    enabled: false,
    size: 1,
    opacity: 1.0,
    offsetX: 0,
    offsetY: 0,
    saturation: 400,
    intensity: 200
  });

  useEffect(() => {
    if (!db) return;
    const statusRef = ref(db, "giftEvent/status");
    const winnersRef = ref(db, "giftEvent/winners");
    const currentWinnerRef = ref(db, "giftEvent/currentWinner");
    const drawStartTimeRef = ref(db, "giftEvent/drawStartTime");

    const unsubStatus = onValue(statusRef, snap => setStatus(snap.val() || "waiting"));
    const unsubWinners = onValue(winnersRef, snap => setWinners(snap.val() || []));
    const unsubCurrentWinner = onValue(currentWinnerRef, snap => setCurrentWinner(snap.val() || null));
    const unsubDrawStartTime = onValue(drawStartTimeRef, snap => setDrawStartTime(snap.val() || null));
    
    // 초기 로드 시 설정과 로고 URL을 함께 불러오기
    const loadInitialData = async () => {
      try {
        // 로고 설정 불러오기
        const settingsSnapshot = await get(ref(db, "giftEvent/settings"));
        if (settingsSnapshot.exists()) {
          const settings = settingsSnapshot.val();
          setLogoSettings({
            enabled: settings.enabled ?? false,
            size: settings.size ?? 1,
            opacity: settings.opacity ?? 0.3,
            offsetX: settings.offsetX ?? 0,
            offsetY: settings.offsetY ?? 0,
            saturation: settings.saturation ?? 600,
            intensity: settings.intensity ?? 200,
            isBlackAndWhite: settings.isBlackAndWhite ?? false
          });
        }
        
        // 로고 URL 불러오기
        const logosSnapshot = await get(ref(db, 'logos'));
        if (logosSnapshot.exists()) {
          const data = logosSnapshot.val();
          const firstLogo = Object.values(data)[0] as any;
          if (firstLogo?.url) {
            setLogoUrl(firstLogo.url);
          }
        } else {
          console.log('[GiftEventDisplay] No logos found in Firebase (initial load)');
        }
      } catch (error) {
        console.error('[GiftEventDisplay] Error loading initial data:', error);
      }
    };
    
    loadInitialData();
    
    // 실시간 구독으로 설정 변경 감지 (초기 로드 후에도 작동)
    const unsubSettings = onValue(ref(db, "giftEvent/settings"), snap => {
      if (snap.exists()) {
        const settings = snap.val();
        // Merge with defaults to ensure all properties exist
        const updatedSettings = {
          enabled: settings.enabled ?? false,
          size: settings.size ?? 1,
          opacity: settings.opacity ?? 0.3,
          offsetX: settings.offsetX ?? 0,
          offsetY: settings.offsetY ?? 0,
          saturation: settings.saturation ?? 600,
          intensity: settings.intensity ?? 200,
          isBlackAndWhite: settings.isBlackAndWhite ?? false
        };
        setLogoSettings(updatedSettings);
      }
    });

    return () => {
      unsubStatus();
      unsubWinners();
      unsubCurrentWinner();
      unsubDrawStartTime();
      unsubSettings();
    };
  }, []);

  // currentWinner가 null로 바뀌더라도 마지막 당첨자를 lastWinner로 보존
  useEffect(() => {
    if (currentWinner) {
      setLastWinner(currentWinner);
      setShowWinners(false);
    }
    if (status === "waiting") {
      setLastWinner(null);
      setShowWinners(false);
    }
  }, [currentWinner, status]);

  // 이펙트 제거: 부모 컴포넌트에서 별도로 타이머를 돌리면 자식 컴포넌트의 애니메이션(6초)과 충돌함.
  // 당첨자 발표는 오직 GiftEventDraw 컴포넌트의 onAnimationEnd 콜백에 의해서만 실행되어야 함.

  // 당첨자 발표 시 DB에 기록하는 함수 (Hook 규칙 준수를 위해 상단 이동)
  const handleWinnerAnnounce = React.useCallback(async () => {
    if (!currentWinner || !db) return;

    try {
      const winnersRef = ref(db, "giftEvent/winners");
      const winnersSnap = await get(winnersRef);
      const winnersList: Participant[] = winnersSnap.exists() && Array.isArray(winnersSnap.val())
        ? winnersSnap.val()
        : [];

      const alreadyExists = winnersList.some(w => w.id === currentWinner.id);
      const updatedWinners = alreadyExists ? winnersList : [...winnersList, currentWinner];

      const remainingRef = ref(db, "giftEvent/remaining");
      const remainingSnap = await get(remainingRef);
      const remainingList: string[] = remainingSnap.exists() && Array.isArray(remainingSnap.val())
        ? remainingSnap.val()
        : [];

      const updatedRemaining = remainingList.filter(id => id !== currentWinner.id);

      await update(ref(db, 'giftEvent'), {
        status: updatedRemaining.length === 0 ? 'finished' : 'winner',
        remaining: updatedRemaining,
        winners: updatedWinners,
        currentWinner: null,
      });
      setShowWinners(true);
    } catch (error) {
      console.error("Error updating winner:", error);
    }
  }, [currentWinner]);

  // 대기 화면 - 더 크고 웅장하게
  if (status === "waiting") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center overflow-hidden">
        <div className="text-center relative z-10">
          <div className="mb-12">
            <Trophy className="w-32 h-32 md:w-48 md:h-48 text-yellow-400 mx-auto mb-10 animate-bounce drop-shadow-[0_0_30px_rgba(250,204,21,0.5)]" />
            <h1 className="text-6xl md:text-[8rem] font-black text-white mb-6 tracking-tighter drop-shadow-2xl">
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-yellow-100 to-yellow-500">
                경품 추첨 대기 중
              </span>
            </h1>
            <p className="text-2xl md:text-5xl text-yellow-200 font-bold tracking-[0.2em] mb-4">
              RAFFLE WAITING
            </p>
            <p className="text-xl md:text-2xl text-white/60 font-medium animate-pulse">
              잠시 후 경품 추첨이 시작됩니다
            </p>
          </div>

          {/* 배경 장식 요소 */}
          <div className="flex justify-center gap-8">
            <Sparkles className="w-12 h-12 text-yellow-300 animate-spin-slow" />
            <Crown className="w-12 h-12 text-yellow-300 animate-bounce" />
            <Star className="w-12 h-12 text-yellow-300 animate-pulse" />
          </div>
        </div>

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

        <style jsx>{`
          @keyframes spin-slow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .animate-spin-slow {
            animation: spin-slow 8s linear infinite;
          }
        `}</style>
      </div>
    );
  }



  // 추첨 애니메이션/축하 메시지 화면
  if (currentWinner || (status === "winner" && lastWinner)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <GiftEventDraw
          winner={currentWinner || lastWinner}
          onAnimationEnd={handleWinnerAnnounce}
          drawStartTime={drawStartTime}
          logoUrl={logoUrl}
          logoSettings={logoSettings}
        />
      </div>
    );
  }

  // 추첨이 시작되었거나 당첨자가 발표된 상태
  if (status === "winner" || status === "started") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-8">
            <Trophy className="w-32 h-32 md:w-48 md:h-48 text-yellow-400 mx-auto mb-10 animate-pulse drop-shadow-2xl" />
            <h1 className="text-5xl md:text-8xl font-black text-white mb-6 drop-shadow-lg uppercase tracking-tighter">
              경품 추첨 대기 중
            </h1>
            <p className="text-2xl md:text-4xl text-yellow-200 font-bold tracking-[0.3em] mb-4 animate-pulse">
              RAFFLE WAITING
            </p>
            <p className="text-xl md:text-2xl text-white/60 font-medium">
              DETERMINING THE WINNER...
            </p>
          </div>

          {/* 당첨자 명단 (오른쪽 아래) */}
          {showWinners && (
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
                      {winners.slice(-8).map((w: any, index: number) => (
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

          {/* 배경 효과 */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-indigo-500/20 animate-pulse"></div>
            <div className="absolute top-0 left-0 w-full h-full">
              {[...Array(20)].map((_, i) => (
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
        </div>
      </div>
    );
  }

  // 기본 화면
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="text-center">
        <div className="mb-8">
          <Trophy className="w-32 h-32 md:w-48 md:h-48 text-yellow-400 mx-auto mb-10 drop-shadow-2xl animate-bounce" />
          <h1 className="text-5xl md:text-8xl font-black text-white mb-6 tracking-tighter drop-shadow-lg">
            경품 추첨 대기 중
          </h1>
          <p className="text-2xl md:text-4xl text-yellow-200 font-bold tracking-[0.2em] mb-4">
            RAFFLE WAITING
          </p>
          <p className="text-xl md:text-2xl text-white/60 font-medium animate-pulse">
            READY TO START
          </p>
        </div>

        {/* 당첨자 명단 (오른쪽 아래) */}
        {showWinners && (
          <div className="fixed bottom-4 right-4 z-50">
            <div className="bg-black/80 backdrop-blur-sm rounded-lg border border-yellow-500/50 p-3 max-w-64">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-yellow-400" />
                <h3 className="font-bold text-yellow-400 text-sm">당첨자 명단</h3>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {winners.length === 0 ? (
                  <p className="text-gray-500 text-sm">아직 없음</p>
                ) : (
                  <div className="space-y-2">
                    {winners.slice(-10).map((w: any, index: number) => (
                      <div key={`${w.id}_${index}`} className="flex items-center gap-2 p-2 bg-yellow-500/10 rounded border border-yellow-500/30">
                        <div className="w-6 h-6 bg-yellow-500 text-black rounded-full flex items-center justify-center text-xs font-bold">
                          {winners.length - index}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white text-sm truncate">{w.name}</div>
                          <div className="text-yellow-300 text-xs truncate">{w.club}</div>
                        </div>
                        <Trophy className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 배경 효과 */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-indigo-500/20 animate-pulse"></div>
          <div className="absolute top-0 left-0 w-full h-full">
            {[...Array(15)].map((_, i) => (
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
      </div>
    </div>
  );
}
