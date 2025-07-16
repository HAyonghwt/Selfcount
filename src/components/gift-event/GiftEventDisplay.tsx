"use client";
import React, { useEffect, useState } from "react";
import Confetti from "react-confetti";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import GiftEventDraw from './GiftEventDraw';

export default function GiftEventDisplay() {
  const [status, setStatus] = useState("waiting");
  const [winners, setWinners] = useState([]);
  const [currentWinner, setCurrentWinner] = useState(null);
  const [lastWinner, setLastWinner] = useState(null);
  const [showWinners, setShowWinners] = useState(false);
  const [showWinner, setShowWinner] = useState(false);

  useEffect(() => {
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
      setShowWinners(false); // 추첨 애니메이션이 시작되면 명단 숨김
    }
    // 오직 "waiting"일 때만 lastWinner를 null로 초기화
    if (status === "waiting") {
      setLastWinner(null);
      setShowWinners(false); // 대기상태 진입 시 명단 숨김
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

  if (status === "waiting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300">
        <div className="text-6xl font-extrabold text-yellow-600 mb-8 text-center">
          경품 추첨 대기 중
        </div>
        <div className="text-4xl font-semibold text-gray-700 text-center">
          잠시 후 경품 추첨이 있겠습니다
        </div>
      </div>
    );
  }

  // 당첨자 발표 시 DB에 기록하는 함수
  const handleWinnerAnnounce = async () => {
    if (!currentWinner) return;
    // winners 명단에 추가
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
    // remaining에서 당첨자 제외
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
    // 상태 업데이트
    await import("firebase/database").then(m => m.update(ref(db, 'giftEvent'), {
      status: updatedRemaining.length === 0 ? 'finished' : 'winner',
      remaining: updatedRemaining,
      winners: updatedWinners,
      currentWinner: null,
    }));
    setShowWinners(true); // 애니메이션 종료 후 명단 노출
  };

  if ((status === "drawing" && currentWinner) || (status === "winner" && lastWinner)) {
    // 추첨 애니메이션/축하 메시지/꽃가루 화면을 계속 고정 (마지막 당첨자도 유지)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-yellow-100 to-pink-100">
        <GiftEventDraw winner={currentWinner || lastWinner} onAnimationEnd={handleWinnerAnnounce} />
      </div>
    );
  }

  // 추첨이 시작되었거나 당첨자가 발표된 상태(단, currentWinner가 없을 때)는 명단만 고정 표시
  if (status === "winner" || status === "started") {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-yellow-100 to-pink-100">
        {showWinners && (
          <div className="absolute right-8 top-8 z-50">
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <div className="text-lg font-bold mb-2 text-gray-700">당첨자 명단</div>
              <ul className="space-y-2">
                {winners.length === 0 && <li className="text-gray-400">아직 당첨자가 없습니다.</li>}
                {winners.slice(-14).map((w: any, i: number) => (
                  <li key={`${w.id}_${i}`} className="flex items-center gap-2">
                    <span className="font-semibold text-yellow-600">{w.club}</span>
                    <span className="font-bold text-pink-700">{w.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 그 외(예외)에는 기본적으로 명단만 보여줌
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-yellow-100 to-pink-100">
      {showWinners && (
        <div className="absolute right-8 top-8 z-50">
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="text-lg font-bold mb-2 text-gray-700">당첨자 명단</div>
            <ul className="space-y-2">
              {winners.length === 0 && <li className="text-gray-400">아직 당첨자가 없습니다.</li>}
              {winners.slice(-14).map((w: any, i: number) => (
                <li key={`${w.id}_${i}`} className="flex items-center gap-2">
                  <span className="font-semibold text-yellow-600">{w.club}</span>
                  <span className="font-bold text-pink-700">{w.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
