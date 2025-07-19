"use client";
import React, { useEffect, useState } from "react";
import Confetti from "react-confetti";

interface Participant {
  id: string;
  name: string;
  club: string;
}

interface GiftEventDrawProps {
  winner: Participant | null;
  onAnimationEnd: () => void;
}

import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

export default function GiftEventDraw({ winner, onAnimationEnd }: GiftEventDrawProps) {
  const [showConfettiPowder, setShowConfettiPowder] = useState(false);
  // 임시 더미 리스트 (실제 구현시 상위에서 참가자 리스트를 prop으로 받으면 됨)
  const dummyList: Participant[] = [
    { id: "dummy1", name: "홍길동", club: "파크A" },
    { id: "dummy2", name: "김철수", club: "파크B" },
    { id: "dummy3", name: "이영희", club: "파크C" },
    { id: "dummy4", name: "박민수", club: "파크D" },
    { id: "dummy5", name: "최수정", club: "파크E" },
    { id: "dummy6", name: "오세훈", club: "파크F" },
    { id: "dummy7", name: "정유진", club: "파크G" },
    { id: "dummy8", name: "한지민", club: "파크H" },
    { id: "dummy9", name: "강유나", club: "파크I" },
    { id: "dummy10", name: "이준호", club: "파크J" },
  ];

  const [rollingIndex, setRollingIndex] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [final, setFinal] = useState(false);
  const [winners, setWinners] = useState<Participant[]>([]);
  const [rolledWinnerId, setRolledWinnerId] = useState<string | null>(null);

  // 당첨자 명단 구독 (Firebase)
  useEffect(() => {
    const winnersRef = ref(db, "giftEvent/winners");
    const unsub = onValue(winnersRef, snap => setWinners(Array.isArray(snap.val()) ? snap.val() : []));
    return () => unsub();
  }, []);

  // 몇 줄을 화면에 보여줄지 (항상 홀수로, 중앙이 당첨 칸)
  const visibleRows = 7;
  const centerRow = Math.floor(visibleRows / 2);

  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });
  }, []);

  // winner가 null이 되면 rolledWinnerId도 null로 리셋
  useEffect(() => {
    if (!winner) setRolledWinnerId(null);
  }, [winner]);

  // rolling, winner 상태에 따라 꽃가루 ON/OFF 항상 보장
  useEffect(() => {
    if (!winner || rolling) {
      setShowConfettiPowder(false);
    } else if (winner && !rolling) {
      setShowConfettiPowder(true);
    }
  }, [winner, rolling]);

  // winner가 바뀔 때마다 roll() 반드시 실행
  useEffect(() => {
    if (!winner) return;
    setRolledWinnerId(winner.id);
    setRolling(true);
    setFinal(false);
    setShowConfetti(false);
    let idxList = [...dummyList, winner];
    let i = 0;
    let interval = 30;
    let slowSteps = [10, 18, 23, 26, 28, 29, 30, 31, 32, 33, 34];
    let maxSteps = 35;
    let timer: NodeJS.Timeout;
    function roll() {
      setRollingIndex(i % idxList.length);
      i++;
      if (i < maxSteps) {
        if (slowSteps.includes(i)) interval += 40;
        timer = setTimeout(roll, interval);
      } else {
        setRollingIndex(idxList.length - 1);
        setRolling(false);
        setFinal(true);
        setShowConfetti(true);
      }
    }
    roll();
    return () => {
      clearTimeout(timer);
    };
  }, [winner]);

  if (!winner) return null;

  // rollingIndex 기준으로 visibleRows만큼 위아래로 보여줄 리스트 생성
  // dummyList에 이미 winner가 있으면 중복 추가하지 않음
  const idxList = dummyList.some(p => p.id === winner.id)
    ? [...dummyList]
    : [...dummyList, winner];
  const total = idxList.length;
  let rows: (Participant | null)[] = [];
  let usedIds = new Set<string>();
  let tries = 0;
  for (let i = -centerRow; i <= centerRow; i++) {
    let idx = (rolling ? rollingIndex : total - 1) + i;
    if (idx < 0) idx += total;
    if (idx >= total) idx -= total;
    const candidate = idxList[idx];
    // 중복 id는 건너뛰고, 무한루프 방지 tries
    if (usedIds.has(candidate.id)) {
      tries++;
      if (tries > total * 2) break;
      rows.push(null); // 빈 칸
      continue;
    }
    rows.push(candidate);
    usedIds.add(candidate.id);
  }
  // rows가 visibleRows보다 짧으면 빈 칸(null)으로 채움
  while (rows.length < visibleRows) {
    rows.push(null);
  }

  return (
    <div className={typeof window !== 'undefined' && window.innerWidth <= 639 ? 'gift-mobile-draw mobile-draw-ui' : ''} className="w-full flex flex-col items-center justify-center my-6" style={typeof window !== 'undefined' && window.innerWidth <= 639 ? {fontSize: 12} : {}}>
      <div className="relative w-full max-w-xl flex flex-col items-center justify-center bg-gradient-to-br from-gray-900/95 via-gray-800/80 to-gray-700/70 rounded-2xl shadow-2xl p-8 border border-gray-600">
        <div className="text-2xl font-semibold mb-8 text-blue-200 tracking-widest uppercase" style={typeof window !== 'undefined' && window.innerWidth <= 639 ? {fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'} : {}}>Prize Draw</div>
        {final ? (
          <div className="flex flex-col items-center justify-center h-full prize-card" style={{ minHeight: 420 }}>
            <div className="flex flex-row items-center justify-center gap-8 w-full">
              <div className="text-4xl md:text-5xl font-medium text-yellow-200 text-right min-w-[150px] tracking-tight drop-shadow-[0_2px_8px_rgba(255,255,200,0.18)]"
  style={typeof window !== 'undefined' && window.innerWidth <= 639
    ? {fontSize: 36, minWidth: 60, maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}
    : {}}
>{winner.club}</div>
              <div className="text-6xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-200 animate-pulse drop-shadow-[0_4px_24px_rgba(180,160,50,0.18)]"
  style={typeof window !== 'undefined' && window.innerWidth <= 639
    ? {fontSize: 60, letterSpacing: '-0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180}
    : {letterSpacing: '-0.05em'}}
>{winner.name}</div>
            </div>
            <div className="mt-12 text-3xl font-bold text-yellow-100 animate-fade-in tracking-wide drop-shadow-[0_2px_8px_rgba(255,255,200,0.32)] prize-message"
  style={typeof window !== 'undefined' && window.innerWidth <= 639
    ? {fontSize: 32, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360}
    : {}}
>축하합니다!</div>
          </div>
        ) : (
          <div className="relative w-full">
            <div className="overflow-hidden h-[420px] flex flex-col items-stretch w-full">
              {rows.map((p, i) => {
                // 그라데이션은 리스트 맨 위/아래만 적용, 중앙~중간은 선명
                const distance = Math.abs(i - centerRow);
                let opacity = 1;
                let blur = 0;
                if (i === 0 || i === rows.length - 1) {
                  opacity = 0.2;
                  blur = 3;
                } else if (i === 1 || i === rows.length - 2) {
                  opacity = 0.45;
                  blur = 1.5;
                }
                const scale = i === centerRow ? 1.12 : 1;
                const color = i === centerRow
                  ? "text-gray-900"
                  : "text-gray-400";
                const clubColor = i === centerRow
                  ? "text-gray-500"
                  : "text-gray-300";
                const bg = i === centerRow ? "bg-white border border-gray-200 shadow-lg" : "";
                if (p) {
                  return (
                    <div
                      key={`${p.id}_${i}_${rolling ? rollingIndex : 'final'}`}
                      className={`draw-list-row flex flex-row items-center justify-between px-8 py-2 rounded-xl transition-all duration-200 ${bg} ${i === centerRow ? 'center' : ''}`}
                      style={{
                        fontSize: (typeof window !== 'undefined' && window.innerWidth <= 639) ? (i === centerRow ? 26 : 16) : (i === centerRow ? 40 : 24),
                        height: i === centerRow ? 64 : 44,
                        opacity,
                        filter: `blur(${blur}px)`,
                        transform: `scale(${scale})`,
                        zIndex: i === centerRow ? 10 : 1,
                      }}
                    >
                      <div className={`font-medium ${clubColor} transition-all duration-200`} style={{letterSpacing:'-0.01em'}}>
                        {p.club}
                      </div>
                      <div className={`font-bold ${color} transition-all duration-200`} style={{letterSpacing:'-0.03em'}}>
                        {p.name}
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div
                      key={`empty_${i}_${rolling ? rollingIndex : 'final'}`}
                      className="flex flex-row items-center justify-between px-8 py-2 rounded-xl bg-transparent"
                      style={{
                        fontSize: 24,
                        height: 44,
                        opacity: 0.2,
                        filter: 'blur(2px)',
                        zIndex: 0,
                      }}
                    >
                      <div className="font-medium text-gray-200">&nbsp;</div>
                      <div className="font-bold text-gray-200">&nbsp;</div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        )}
        {/* 오른쪽 위에 당첨자 명단 항상 표시 */}
        <div className={`winner-list-box${typeof window !== 'undefined' && window.innerWidth <= 639 ? ' mobile-winner-list' : ''}`} style={{ position: 'fixed', right: typeof window !== 'undefined' && window.innerWidth <= 639 ? 4 : 32, top: typeof window !== 'undefined' && window.innerWidth <= 639 ? 4 : 32, zIndex: 60 }}>
          <div className={`bg-white/80 rounded-xl shadow-lg ${typeof window !== 'undefined' && window.innerWidth <= 639 ? 'px-2 py-2 text-xs min-w-[90px] max-w-[40vw] h-[180px]' : 'px-6 py-4 text-base min-w-[180px] max-w-xs h-[504px]'} text-gray-700 overflow-hidden`}>
            <div className="font-bold mb-2 text-gray-800 text-lg">당첨자 명단</div>
            {(() => {
              const visibleWinners = final ? winners : winners.slice(0, -1);
              if (typeof window !== 'undefined' && window.innerWidth <= 639) {
                // 모바일: 최근 6명만, 최신순(최근 당첨자가 맨 위)
                const last6 = visibleWinners.slice(-6);
                return (
                  <ul className="space-y-2">
                    {last6.length === 0 && <li className="text-gray-400">아직 없음</li>}
                    {last6.map((w, i) => (
                      <li key={`${w.id}_${i}`} className="flex flex-row items-center gap-2">
                        <span className="font-semibold text-yellow-600">{w.club}</span>
                        <span className="font-bold text-pink-700">{w.name}</span>
                      </li>
                    ))}
                  </ul>
                );
              } else {
                // PC: 기존대로 최대 14명, 오래된 순서
                const last14 = visibleWinners.slice(-14);
                return (
                  <ul className="space-y-2">
                    {last14.length === 0 && <li className="text-gray-400">아직 없음</li>}
                    {last14.map((w, i) => (
                      <li key={`${w.id}_${i}`} className="flex flex-row items-center gap-2">
                        <span className="font-semibold text-yellow-600">{w.club}</span>
                        <span className="font-bold text-pink-700">{w.name}</span>
                      </li>
                    ))}
                  </ul>
                );
              }
            })()}
          </div>
        </div>
        <>
  {/* 폭죽(Confetti) - 당첨자 확정 후에만 */}
  {winner && !rolling && (
    <Confetti
      gravity={0.08}
      numberOfPieces={300}
      width={typeof window !== 'undefined' ? window.innerWidth : 1920}
      height={typeof window !== 'undefined' ? window.innerHeight : 1080}
      recycle={true}
      style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 50 }}
      colors={['#FFD700', '#FF69B4', '#FFFACD', '#FF6347', '#87CEFA', '#ADFF2F', '#00E6B8', '#FFB347', '#B39DDB']}
      initialVelocityY={18}
      initialVelocityX={8}
      run={true}
    />
  )}
  {/* 축포 가루(조각) - 당첨자 확정 시 3초간만 */}
  {showConfettiPowder && winner && !rolling && (
    <Confetti
      gravity={0.04}
      numberOfPieces={50}
      width={typeof window !== 'undefined' ? window.innerWidth : 1920}
      height={typeof window !== 'undefined' ? window.innerHeight : 1080}
      recycle={true}
      style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 51 }}
      colors={['#FFD700', '#FF69B4', '#FFFACD', '#FF6347', '#87CEFA', '#ADFF2F', '#00E6B8', '#FFB347', '#B39DDB']}
      initialVelocityY={8}
      initialVelocityX={2}
      run={true}
    />
  )}
</>
      </div>
    </div>
  );
}
