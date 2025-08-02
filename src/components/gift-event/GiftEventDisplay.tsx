"use client";
import React, { useEffect, useState } from "react";
import Confetti from "react-confetti";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import GiftEventDraw from './GiftEventDraw';
import { Trophy, Sparkles, Crown, Star } from "lucide-react";

export default function GiftEventDisplay() {
  const [status, setStatus] = useState("waiting");
  const [winners, setWinners] = useState([]);
  const [currentWinner, setCurrentWinner] = useState(null);
  const [lastWinner, setLastWinner] = useState(null);
  const [showWinners, setShowWinners] = useState(false);
  const [showWinner, setShowWinner] = useState(false);

  useEffect(() => {
    if (!db) return;
    const statusRef = ref(db, "giftEvent/status");
    const winnersRef = ref(db, "giftEvent/winners");
    const currentWinnerRef = ref(db, "giftEvent/currentWinner");
    const unsubStatus = onValue(statusRef, snap => setStatus(snap.val() || "waiting"));
    const unsubWinners = onValue(winnersRef, snap => setWinners(snap.val() || []));
    const unsubCurrentWinner = onValue(currentWinnerRef, snap => setCurrentWinner(snap.val() || null));
    return () => {
      unsubStatus();
      unsubWinners();
      unsubCurrentWinner();
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

  useEffect(() => {
    if ((status === "drawing" || status === "winner") && currentWinner) {
      const timer = setTimeout(() => {
        handleWinnerAnnounce();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, currentWinner]);

  // 대기 화면
  if (status === "waiting") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-8">
            <Trophy className="w-24 h-24 md:w-32 md:h-32 text-yellow-400 mx-auto mb-6 animate-pulse" />
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
          경품 추첨 대기 중
            </h1>
            <p className="text-xl md:text-2xl text-yellow-200 font-medium">
              잠시 후 경품 추첨이 있겠습니다
            </p>
          </div>
          
          {/* 배경 효과 */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-indigo-500/20 animate-pulse"></div>
            <div className="absolute top-0 left-0 w-full h-full">
              {[...Array(30)].map((_, i) => (
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

  // 당첨자 발표 시 DB에 기록하는 함수
  const handleWinnerAnnounce = async () => {
    if (!currentWinner || !db) return;
    
    const winnersRef = ref(db, "giftEvent/winners");
    let winnersList: any[] = [];
    try {
      const snap = await import("firebase/database").then(m => m.get(winnersRef));
      winnersList = snap.exists() ? snap.val() : [];
      if (!Array.isArray(winnersList)) winnersList = [];
    } catch {
      winnersList = [];
    }
    const alreadyExists = winnersList.some((w: any) => w.id === currentWinner.id);
    const updatedWinners = alreadyExists ? winnersList : [...winnersList, currentWinner];
    
    const remainingRef = ref(db, "giftEvent/remaining");
    let remainingList: string[] = [];
    try {
      const snap = await import("firebase/database").then(m => m.get(remainingRef));
      remainingList = snap.exists() ? snap.val() : [];
      if (!Array.isArray(remainingList)) remainingList = [];
    } catch {
      remainingList = [];
    }
    const updatedRemaining = remainingList.filter(id => id !== currentWinner.id);
    
    await import("firebase/database").then(m => m.update(ref(db, 'giftEvent'), {
      status: updatedRemaining.length === 0 ? 'finished' : 'winner',
      remaining: updatedRemaining,
      winners: updatedWinners,
      currentWinner: null,
    }));
    setShowWinners(true);
  };

  // 추첨 애니메이션/축하 메시지 화면
  if (currentWinner || (status === "winner" && lastWinner)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <GiftEventDraw winner={currentWinner || lastWinner} onAnimationEnd={handleWinnerAnnounce} />
      </div>
    );
  }

  // 추첨이 시작되었거나 당첨자가 발표된 상태
  if (status === "winner" || status === "started") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-8">
            <Trophy className="w-24 h-24 md:w-32 md:h-32 text-yellow-400 mx-auto mb-6" />
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
              경품 추첨 진행 중
            </h1>
            <p className="text-xl md:text-2xl text-yellow-200 font-medium">
              잠시만 기다려주세요
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
          <Trophy className="w-24 h-24 md:w-32 md:h-32 text-yellow-400 mx-auto mb-6" />
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            경품 추첨
          </h1>
          <p className="text-xl md:text-2xl text-yellow-200 font-medium">
            준비 중입니다
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
