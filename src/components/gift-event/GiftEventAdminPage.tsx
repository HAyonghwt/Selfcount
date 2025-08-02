"use client";

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, set, get, remove, update } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Users, Gift, Award, RefreshCw, Sparkles, Trophy } from 'lucide-react';
import GiftEventDrawSmall from './GiftEventDrawSmall';

interface Participant {
  id: string;
  name: string;
  club: string;
}

export default function GiftEventAdminPage() {
  const [status, setStatus] = useState('waiting');
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
      
      // 현재 당첨자 상태 복원
      if (data.currentWinner) {
        setCurrentWinner(data.currentWinner);
      } else {
        setCurrentWinner(null);
      }
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

    setCurrentWinner(null);

    // 20% 확률로 실제 멈춘 이름이 당첨자가 되도록 수정
    const shouldUseRealWinner = Math.random() < 0.2; // 20% 확률
    
    let winnerData;
    if (shouldUseRealWinner && remaining.length > 0) {
      // 실제 멈춘 이름 중에서 선택 (3~5명 중 하나)
      const realWinnerIndex = Math.floor(Math.random() * Math.min(remaining.length, 5));
      const realWinnerId = remaining[realWinnerIndex];
      winnerData = participants.find(p => p.id === realWinnerId);
    } else {
      // 기존 방식: 완전 랜덤
      const winnerId = remaining[Math.floor(Math.random() * remaining.length)];
      winnerData = participants.find(p => p.id === winnerId);
    }

    if (winnerData) {
      setCurrentWinner(winnerData);
      update(ref(db, 'giftEvent'), {
        status: 'drawing',
        currentWinner: winnerData
      });
    }
  };

  const handleWinnerAnnounce = async () => {
    if (!db || !currentWinner) return;
    const updatedRemaining = remaining.filter(id => id !== currentWinner.id);
    const winnersRef = ref(db, 'giftEvent/winners');
    let winnersSnapshot = await get(winnersRef);
    let winnersList = winnersSnapshot.exists() ? winnersSnapshot.val() : [];
    if (!Array.isArray(winnersList)) winnersList = [];
    const alreadyExists = winnersList.some((w: any) => w.id === currentWinner.id);
    const updatedWinners = alreadyExists ? winnersList : [...winnersList, currentWinner];
    await update(ref(db, 'giftEvent'), {
      status: updatedRemaining.length === 0 ? 'finished' : 'winner',
      remaining: updatedRemaining,
      winners: updatedWinners,
      currentWinner: null,
    });
  };

  const handleResetEvent = () => { 
    if (!db) return;
    remove(ref(db, 'giftEvent'));
    setCurrentWinner(null);
    setWinners([]);
  };

  const remainingParticipants = participants.filter(p => remaining.includes(p.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4 md:p-6">
      {/* 메인 컨테이너 */}
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="text-center mb-4 md:mb-8">
          <h1 className="text-xl md:text-3xl font-bold text-gray-800 mb-1 md:mb-2 flex items-center justify-center gap-2 md:gap-3">
            <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-yellow-500" />
            경품 행사 관리
            <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-yellow-500" />
          </h1>
          <p className="text-gray-600 text-xs md:text-base">실시간 추첨 관리 시스템</p>
        </div>

        {/* 추첨 화면 영역 */}
        <div className="w-full h-60 md:h-80 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center mb-4 md:mb-6">
          {currentWinner ? (
            <div className="w-full h-full">
              <GiftEventDrawSmall winner={currentWinner} onAnimationEnd={handleWinnerAnnounce} />
            </div>
          ) : status === 'winner' && winners.length > 0 ? (
            <div className="w-full h-full">
              <GiftEventDrawSmall winner={winners[winners.length - 1]} onAnimationEnd={() => {}} />
            </div>
          ) : (
            <div className="text-center text-gray-500">
              <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-lg font-semibold">경품 추첨 화면</p>
              <p className="text-sm">추첨 시작 버튼을 눌러주세요</p>
            </div>
          )}
        </div>

        {/* 모바일 최적화된 레이아웃 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* 좌측: 제어 패널 */}
          <div className="lg:col-span-1 space-y-4 md:space-y-6">
            {/* 행사 제어 카드 */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader className="pb-2 md:pb-4">
                <CardTitle className="text-base md:text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <Gift className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                  행사 제어
                </CardTitle>
        </CardHeader>
              <CardContent className="space-y-3 md:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
                  <Button 
                    onClick={handleStartEvent} 
                    disabled={status !== 'waiting'} 
                    className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium h-10 md:h-12 text-sm md:text-base"
                  >
                    추첨 준비
          </Button>
                  
                  <Button 
                    onClick={handleDrawNext} 
                    disabled={remaining.length === 0 || !(status === 'winner' || status === 'drawing' || status === 'waiting')}
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-medium h-10 md:h-12 text-sm md:text-base"
                  >
                    추첨 시작
          </Button>
                  
                  <Button 
                    onClick={handleResetEvent} 
                    variant="destructive"
                    className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium h-10 md:h-12 text-sm md:text-base"
                  >
                    <RefreshCw className="mr-0.5 h-4 w-4" />
                    초기화
          </Button>
                </div>
                
                {/* 상태 표시 */}
                <div className="mt-3 md:mt-4 p-2 md:p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs md:text-sm text-gray-600 mb-1">현재 상태</div>
                  <div className="font-semibold text-gray-800 text-sm md:text-base">
                    {status === 'waiting' && '대기 중'}
                    {status === 'started' && '진행 중'}
                    {status === 'drawing' && '추첨 중'}
                    {status === 'winner' && '당첨자 발표'}
                    {status === 'finished' && '완료'}
                  </div>
                </div>
        </CardContent>
      </Card>

            {/* 통계 카드 */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg md:text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-600" />
                  통계
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{winners.length}</div>
                    <div className="text-sm text-gray-600">당첨자</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{remaining.length}</div>
                    <div className="text-sm text-gray-600">남은 인원</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 우측: 리스트 영역 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 당첨자 리스트 */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg md:text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <User className="w-5 h-5 text-yellow-600" />
                  당첨자 ({winners.length}명)
      </CardTitle>
    </CardHeader>
              <CardContent>
                <div className="max-h-64 md:max-h-80 overflow-y-auto">
                  {winners.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>아직 당첨자가 없습니다</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {winners.map((w, index) => (
                        <div key={`${w.id}_${index}`} className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-800">{w.name}</div>
                              <div className="text-sm text-gray-500">{w.club}</div>
                            </div>
                          </div>
                          <div className="text-yellow-600">
                            <Trophy className="w-5 h-5" />
                          </div>
                        </div>
        ))}
                    </div>
                  )}
                </div>
    </CardContent>
  </Card>

            {/* 추첨 대상자 리스트 */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg md:text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  추첨 대상자 ({remaining.length}명)
      </CardTitle>
    </CardHeader>
              <CardContent>
                <div className="max-h-64 md:max-h-80 overflow-y-auto">
                  {remainingParticipants.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>추첨 대상자가 없습니다</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {remainingParticipants.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                              ?
                            </div>
                            <div>
                              <div className="font-semibold text-gray-800">{p.name}</div>
                              <div className="text-sm text-gray-500">{p.club}</div>
                            </div>
                          </div>
                          <div className="text-blue-600">
                            <Sparkles className="w-5 h-5" />
                          </div>
                        </div>
        ))}
                    </div>
                  )}
                </div>
    </CardContent>
  </Card>
          </div>
        </div>


      </div>
    </div>
  );
}
