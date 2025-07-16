"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, set, get, remove, update } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Users, Gift, Award, RefreshCw } from 'lucide-react';
import GiftEventDraw from './GiftEventDraw'; // This component will be used for the animation

interface Participant {
  id: string;
  name: string;
  club: string;
}

export default function GiftEventAdminPage() {
  const [status, setStatus] = useState('waiting'); // 'waiting', 'started', 'finished'
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [winners, setWinners] = useState<Participant[]>([]);
  const [remaining, setRemaining] = useState<string[]>([]);
  const [currentWinner, setCurrentWinner] = useState<Participant | null>(null);

  // Load initial data from Firebase
  useEffect(() => {
    if (!db) return;

    const giftEventRef = ref(db, 'giftEvent');
    const playersRef = ref(db, 'players');

    // Subscribe to gift event data
    const unsubGiftEvent = onValue(giftEventRef, (snapshot) => {
      const data = snapshot.val() || {};
      setStatus(data.status || 'waiting');
      setWinners(data.winners || []);
      setRemaining(data.remaining || []);
    });

    // Fetch all players once to use as the base participants list
    get(playersRef).then((snapshot) => {
      if (snapshot.exists()) {
        const playersData = snapshot.val();
        let allParticipants: Participant[] = [];
        Object.keys(playersData).forEach(id => {
          const data = playersData[id];
          if (data.type === 'team') {
            // 팀이면 두 명을 각각 개별 참가자로 추가
            allParticipants.push({ id: `${id}_1`, name: data.p1_name, club: data.p1_affiliation });
            allParticipants.push({ id: `${id}_2`, name: data.p2_name, club: data.p2_affiliation });
          } else {
            allParticipants.push({ id, name: data.name, club: data.affiliation });
          }
        });
        setParticipants(allParticipants);
      }
    });

    return () => {
      unsubGiftEvent();
    };
  }, []);

  const handleStartEvent = () => {
    if (!db) return;
    if (participants.length === 0) {
      alert("추첨할 참가자가 없습니다.");
      return;
    }
    const allParticipantIds = participants.map(p => p.id);
    const giftEventRef = ref(db, 'giftEvent');
    set(giftEventRef, {
      status: 'waiting',
      remaining: allParticipantIds,
      winners: [],
    });
  };

  const handleDrawNext = async () => {
    if (!db) return;
    if (remaining.length === 0) return;

    setCurrentWinner(null); // 먼저 null로 초기화(리셋)

    setTimeout(() => {
      const winnerId = remaining[Math.floor(Math.random() * remaining.length)];
      const winnerData = participants.find(p => p.id === winnerId);

      if (winnerData) {
        setCurrentWinner(winnerData); // For animation
        // 1단계: status 'drawing', currentWinner만 먼저 저장 (winners에는 추가X)
        update(ref(db, 'giftEvent'), {
          status: 'drawing',
          currentWinner: winnerData
        });
      }
    }, 50);
  };

  // 애니메이션 종료 후 당첨자 발표
  const handleWinnerAnnounce = async () => {
    if (!db || !currentWinner) return;
    const updatedRemaining = remaining.filter(id => id !== currentWinner.id);
    // winners를 항상 Firebase에서 최신값으로 읽어와서 업데이트
    const winnersRef = ref(db, 'giftEvent/winners');
    let winnersSnapshot = await get(winnersRef);
    let winnersList = winnersSnapshot.exists() ? winnersSnapshot.val() : [];
    if (!Array.isArray(winnersList)) winnersList = [];
    // 이미 winners에 있는 id면 중복 추가하지 않음
    const alreadyExists = winnersList.some(w => w.id === currentWinner.id);
    const updatedWinners = alreadyExists ? winnersList : [...winnersList, currentWinner];
    await update(ref(db, 'giftEvent'), {
      status: updatedRemaining.length === 0 ? 'finished' : 'winner',
      remaining: updatedRemaining,
      winners: updatedWinners,
      currentWinner: null,
    });
    // setCurrentWinner(null); // 당첨자 발표 후에도 화면이 사라지지 않게 주석 처리
  };


  const handleResetEvent = () => { 
    if (!db) return;
    remove(ref(db, 'giftEvent'));
    setCurrentWinner(null);
    setWinners([]); // 초기화 시 당첨자 명단도 즉시 비움
  };

  const remainingParticipants = participants.filter(p => remaining.includes(p.id));

  return (
    <div className="p-4 md:p-8">
      {/* 당첨자 추첨 후에도 GiftEventDraw가 사라지지 않도록 winner가 null이 아니면 항상 표시 */}
      {currentWinner && <GiftEventDraw winner={currentWinner} onAnimationEnd={handleWinnerAnnounce} />}
      <h1 className="text-2xl font-bold mb-6">경품 행사 관리</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>행사 제어</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button onClick={handleStartEvent} disabled={status !== 'waiting'} className="bg-blue-600 hover:bg-blue-700">
            <Gift className="mr-2 h-4 w-4" /> 추첨 준비
          </Button>
          <Button onClick={handleDrawNext} disabled={remaining.length === 0 || !(status === 'winner' || status === 'started' || status === 'drawing' || status === 'waiting')}>
            <Award className="mr-2 h-4 w-4" /> 추첨 시작
          </Button>
          <Button onClick={handleResetEvent} variant="destructive">
            <RefreshCw className="mr-2 h-4 w-4" /> 초기화
          </Button>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="mr-2" /> 추첨 대상자 ({remaining.length}명)
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <ul>
              {remainingParticipants.map(p => (
                  <li key={p.id} className="p-2 border-b last:border-0">
                    {p.name} <span className='text-sm text-gray-500'>({p.club})</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="mr-2" /> 당첨자 ({winners.length}명)
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <ul>
              {winners.map((w, index) => (
                <li key={`${w.id}_${index}`} className="p-2 border-b last:border-0 font-semibold">
                  {index + 1}. {w.name} <span className='text-sm text-gray-400'>({w.club})</span>        
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
