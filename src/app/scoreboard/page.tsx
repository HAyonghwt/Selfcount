"use client"
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db, ensureAuthenticated } from '@/lib/firebase';
import { ref, onValue, onChildChanged, off, query, orderByKey, limitToLast } from 'firebase/database';
import { Flame, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import GiftEventDisplay from '@/components/gift-event/GiftEventDisplay';
import GiftEventStandby from '@/components/gift-event/GiftEventStandby';
import { getPlayerScoreLogs, getPlayerScoreLogsOptimized, ScoreLog, invalidatePlayerLogCache } from '@/lib/scoreLogs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';



interface ProcessedPlayer {
    id: string;
    jo: number;
    name: string;
    club: string;
    group: string;
    type: 'individual' | 'team';
    totalScore: number;
    rank: number | null;
    hasAnyScore: boolean;
    hasForfeited: boolean;
    coursesData: {
        [courseId: string]: {
            courseName: string;
            courseTotal: number;
            holeScores: (number | null)[];
        }
    };
    total: number;
    courseScores: { [courseId: string]: number };
    detailedScores: { [courseId: string]: { [holeNumber: string]: number } };
    assignedCourses: any[];
    allAssignedCourses: any[]; // 전체 배정 코스(온오프 무관)
}

const tieBreak = (a: any, b: any, sortedCourses: any[]) => {
    if (a.hasForfeited && !b.hasForfeited) return 1;
    if (!a.hasForfeited && b.hasForfeited) return -1;

    if (!a.hasAnyScore && !b.hasAnyScore) return 0;
    if (!a.hasAnyScore) return 1;
    if (!b.hasAnyScore) return -1;
    
    if (a.total !== b.total) {
        return a.total - b.total;
    }

    for (const course of sortedCourses) {
        const courseId = course.id;
        const aCourseScore = a.courseScores[courseId] || 0;
        const bCourseScore = b.courseScores[courseId] || 0;
        if (aCourseScore !== bCourseScore) {
            return aCourseScore - bCourseScore;
        }
    }
    
    if (sortedCourses.length > 0) {
        const lastCourseId = sortedCourses[0].id;
        const aHoleScores = a.detailedScores[lastCourseId] || {};
        const bHoleScores = b.detailedScores[lastCourseId] || {};
        for (let i = 9; i >= 1; i--) {
            const hole = i.toString();
            const aHole = aHoleScores[hole] || 0;
            const bHole = bHoleScores[hole] || 0;
            if (aHole !== bHole) {
                return aHole - bHole;
            }
        }
    }

    return 0;
};

// Par 계산 함수
function getParForHole(tournament: any, courseId: string, holeIdx: number) {
  const course = tournament?.courses?.[courseId];
  if (!course || !Array.isArray(course.pars)) return null;
  return course.pars[holeIdx] ?? null;
}
function getTotalParForPlayer(tournament: any, assignedCourses: any[]) {
  let total = 0;
  assignedCourses.forEach(course => {
    const courseData = tournament?.courses?.[course.id];
    if (courseData && Array.isArray(courseData.pars)) {
      total += courseData.pars.reduce((a: number, b: number) => a + (b || 0), 0);
    }
  });
  return total;
}

// 코스별 합계 및 ±타수 계산 함수
function getCourseSumAndPlusMinus(tournament: any, course: any, holeScores: (number | null)[]) {
  let sum = 0;
  let parSum = 0;
  if (!course || !Array.isArray(course.pars)) return { sum: 0, pm: null };
  for (let i = 0; i < 9; i++) {
    const score = holeScores[i];
    const par = course.pars[i] ?? null;
    if (score !== null && score !== undefined && par !== null && par !== undefined) {
      sum += score;
      parSum += par;
    }
  }
  return { sum, pm: parSum > 0 ? sum - parSum : null };
}

// 총타수/±타수 계산을 '입력된 홀만' 기준으로 변경
function getPlayerTotalAndPlusMinus(tournament: any, player: any) {
  let total = 0;
  let parTotal = 0;
  let playedHoles = 0;
  player.assignedCourses.forEach((course: any) => {
    const courseData = tournament?.courses?.[course.id];
    const holeScores = player.coursesData[course.id]?.holeScores || [];
    if (courseData && Array.isArray(courseData.pars)) {
      for (let i = 0; i < 9; i++) {
        const score = holeScores[i];
        const par = courseData.pars[i] ?? null;
        if (score !== null && score !== undefined && par !== null && par !== undefined) {
          total += score;
          parTotal += par;
          playedHoles++;
        }
      }
    }
  });
  // playedHoles가 0이면 null 반환
  return playedHoles > 0 ? { total, pm: total - parTotal } : { total: 0, pm: null };
}

// getPlayerTotalAndPlusMinusAllCourses 함수 추가 (assignedCourses가 아니라 전체 배정 코스 기준)
function getPlayerTotalAndPlusMinusAllCourses(tournament: any, player: any, allAssignedCourses: any[]) {
  let total = 0;
  let parTotal = 0;
  let playedHoles = 0;
  allAssignedCourses.forEach((course: any) => {
    const courseData = tournament?.courses?.[course.id];
    const scoresForCourse = (player.detailedScores?.[course.id]) || {};
    if (courseData && Array.isArray(courseData.pars)) {
      for (let i = 0; i < 9; i++) {
        const score = scoresForCourse[(i + 1).toString()];
        const par = courseData.pars[i] ?? null;
        if (score !== null && score !== undefined && par !== null && par !== undefined) {
          total += score;
          parTotal += par;
          playedHoles++;
        }
      }
    }
  });
  return playedHoles > 0 ? { total, pm: total - parTotal } : { total: 0, pm: null };
}

export default function ScoreboardPage() {
  const [giftEventStatus, setGiftEventStatus] = useState<string>('');
  const [giftEventData, setGiftEventData] = useState<any>({});
  
  useEffect(() => {
    if (!db) return;
    
    const giftEventRef = ref(db, 'giftEvent');
    const unsub = onValue(giftEventRef, snap => {
      const data = snap.val() || {};
      setGiftEventStatus(data.status || '');
      setGiftEventData(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    console.log('giftEventStatus:', giftEventStatus);
  }, [giftEventStatus]);

  if (giftEventStatus === 'waiting') {
    return <GiftEventStandby />;
  }
  if (giftEventStatus === 'started' || giftEventStatus === 'running' || giftEventStatus === 'drawing' || giftEventStatus === 'winner') {
    return <GiftEventDisplay />;
  }
  // 점수표 기본 화면
  return <ExternalScoreboard />;
}

// 기권 타입을 로그에서 추출하는 함수
const getForfeitTypeFromLogs = (logs: ScoreLog[]): 'absent' | 'disqualified' | 'forfeit' | null => {
    // 가장 최근의 기권 처리 로그를 찾음
    const forfeitLogs = logs
        .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment)
        .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬
    
    if (forfeitLogs.length === 0) return null;
    
    const latestLog = forfeitLogs[0];
    if (latestLog.comment?.includes('불참')) return 'absent';
    if (latestLog.comment?.includes('실격')) return 'disqualified';
    if (latestLog.comment?.includes('기권')) return 'forfeit';
    
    return null;
};

// 기존 점수표 함수는 이름만 변경해서 아래에 유지
function ExternalScoreboard() {
    const [loading, setLoading] = useState(true);
    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [tournament, setTournament] = useState<any>({});
    const [groupsData, setGroupsData] = useState<any>({});
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<any>(null);
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<any>(null);
    const [individualBackcountApplied, setIndividualBackcountApplied] = useState<boolean>(false);
    const [teamBackcountApplied, setTeamBackcountApplied] = useState<boolean>(false);
    const [individualNTPData, setIndividualNTPData] = useState<any>(null);
    const [teamNTPData, setTeamNTPData] = useState<any>(null);
    const [filterGroup, setFilterGroup] = useState('all');
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    
    // 캐싱을 위한 상태 추가
    const [lastScoresHash, setLastScoresHash] = useState('');
    const [lastPlayersHash, setLastPlayersHash] = useState('');
    const [lastTournamentHash, setLastTournamentHash] = useState('');
    
    // 최적화된 데이터 구독을 위한 상태
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
    // 탭 비활성화 최적화: 현재 활성 구독 언서브 보관 및 재시작 트리거
    const activeUnsubsRef = useRef<(() => void)[]>([]);
    const [resumeSeq, setResumeSeq] = useState(0);

    const stopSubscriptions = () => {
        try {
            activeUnsubsRef.current.forEach(u => { try { u(); } catch {} });
        } finally {
            activeUnsubsRef.current = [];
        }
    };

    useEffect(() => {
        if (!db) {
            setLoading(false);
            return;
        }
        // 기존 구독 정리 후 시작
        stopSubscriptions();

        // 익명 인증 후에만 구독 시작
        ensureAuthenticated().then((isAuthenticated) => {
            if (!isAuthenticated) {
                setLoading(false);
                return;
            }
            const dbInstance = db as any;

            // 초기 데이터 로딩 (빠른 로딩을 위해 병렬 처리)
            if (!initialDataLoaded) {
                const playersRef = ref(dbInstance, 'players');
                const scoresRef = ref(dbInstance, 'scores');
                const tournamentRef = ref(dbInstance, 'tournaments/current');
                
                let loadedCount = 0;
                const checkAllLoaded = () => {
                    loadedCount++;
                    if (loadedCount >= 3) {
                        setInitialDataLoaded(true);
                        setLoading(false);
                    }
                };
                
                const unsubInitialPlayers = onValue(playersRef, snap => {
                    const data = snap.val() || {};
                    setPlayers(data);
                    setLastPlayersHash(JSON.stringify(data));
                    checkAllLoaded();
                });
                
                const unsubInitialScores = onValue(scoresRef, snap => {
                    const data = snap.val() || {};
                    setScores(data);
                    setLastScoresHash(JSON.stringify(data));
                    checkAllLoaded();
                });
                
                const unsubInitialTournament = onValue(tournamentRef, snap => {
                    const data = snap.val() || {};
                    setTournament(data);
                    setGroupsData(data.groups || {});
                    setLastTournamentHash(JSON.stringify(data));
                    checkAllLoaded();
                });
                
                // 3초 후에도 로딩이 안 되면 강제로 로딩 완료
                const fallbackTimer = setTimeout(() => {
                    if (!initialDataLoaded) {
                        setInitialDataLoaded(true);
                        setLoading(false);
                    }
                }, 3000);
                // 언서브/타이머 해제 등록
                activeUnsubsRef.current.push(unsubInitialPlayers);
                activeUnsubsRef.current.push(unsubInitialScores);
                activeUnsubsRef.current.push(unsubInitialTournament);
                activeUnsubsRef.current.push(() => clearTimeout(fallbackTimer));
            }
            
            // 초기 데이터 로딩 후 실시간 업데이트 (점수는 항상 실시간 반영 보장)
            if (initialDataLoaded) {
                // 선수 데이터: 변경사항만 감지하되 안전하게
                const playersRef = ref(dbInstance, 'players');
                const unsubPlayers = onChildChanged(playersRef, snap => {
                    const playerId = snap.key;
                    const playerData = snap.val();
                    if (playerId && playerData) {
                        setPlayers((prev: any) => {
                            const newPlayers = { ...prev, [playerId]: playerData };
                            const newHash = JSON.stringify(newPlayers);
                            if (newHash !== lastPlayersHash) {
                                setLastPlayersHash(newHash);
                                return newPlayers;
                            }
                            return prev;
                        });
                    }
                });
                
                // 점수 데이터: 실시간 반영을 위해 onValue 유지 (가장 중요!)
                const scoresRef = ref(dbInstance, 'scores');
                const unsubScores = onValue(scoresRef, snap => {
                    const data = snap.val() || {};
                    setScores((prev: any) => {
                        // 해시 비교로 중복 데이터만 차단
                        const newHash = JSON.stringify(data);
                        if (newHash !== lastScoresHash) {
                            setLastScoresHash(newHash);
                            setLastUpdateTime(Date.now());
                            
                            // 점수 변경 감지 시 해당 선수들의 로그 캐시 무효화
                            if (prev && Object.keys(prev).length > 0) {
                                const changedPlayerIds = Object.keys(data).filter(playerId => {
                                    const prevScores = prev[playerId] || {};
                                    const newScores = data[playerId] || {};
                                    return JSON.stringify(prevScores) !== JSON.stringify(newScores);
                                });
                                
                                // 변경된 선수들의 로그 캐시 무효화
                                changedPlayerIds.forEach(playerId => {
                                    invalidatePlayerLogCache(playerId);
                                });
                            }
                            
                            return data;
                        }
                        return prev;
                    });
                });
                
                // 토너먼트 설정: 변경사항만 감지
                const tournamentRef = ref(dbInstance, 'tournaments/current');
                const unsubTournament = onChildChanged(tournamentRef, snap => {
                    const key = snap.key;
                    const value = snap.val();
                    if (key && value) {
                        setTournament((prev: any) => {
                            const newTournament = { ...prev, [key]: value };
                            if (key === 'groups') {
                                setGroupsData(value);
                            }
                            const newHash = JSON.stringify(newTournament);
                            if (newHash !== lastTournamentHash) {
                                setLastTournamentHash(newHash);
                                return newTournament;
                            }
                            return prev;
                        });
                    }
                });
                
                // 코스 활성/비활성 상태 실시간 반영 (isActive 변경 감지)
                const coursesRef = ref(dbInstance, 'tournaments/current/courses');
                const unsubCourses = onValue(coursesRef, snap => {
                    const coursesData = snap.val() || {};
                    setTournament((prev: any) => {
                        const newTournament = { ...prev, courses: coursesData };
                        const newHash = JSON.stringify(newTournament);
                        if (newHash !== lastTournamentHash) {
                            setLastTournamentHash(newHash);
                            return newTournament;
                        }
                        return prev;
                    });
                });
                
                // 언서브 등록
                activeUnsubsRef.current.push(unsubPlayers);
                activeUnsubsRef.current.push(unsubScores);
                activeUnsubsRef.current.push(unsubTournament);
                activeUnsubsRef.current.push(unsubCourses);
            }
        });
        // 클린업: 이 이펙트가 재실행/언마운트 시 구독 해제
        return () => stopSubscriptions();
    }, [initialDataLoaded, lastScoresHash, lastPlayersHash, lastTournamentHash, resumeSeq]);

    // 탭 비활성화 시 구독 일시 중단, 다시 보이면 재개
    useEffect(() => {
        const onVisibilityChange = () => {
            if (typeof document === 'undefined') return;
            if (document.hidden) {
                stopSubscriptions();
            } else {
                setResumeSeq((s) => s + 1);
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    // 서든데스 데이터 최적화된 구독 (활성화된 경우에만)
    useEffect(() => {
        if (!db || !initialDataLoaded) return;
        
        const dbInstance = db as any;
        const individualSuddenDeathRef = ref(dbInstance, 'tournaments/current/suddenDeath/individual');
        const teamSuddenDeathRef = ref(dbInstance, 'tournaments/current/suddenDeath/team');
        const individualBackcountRef = ref(dbInstance, 'tournaments/current/backcountApplied/individual');
        const teamBackcountRef = ref(dbInstance, 'tournaments/current/backcountApplied/team');
        const individualNTPRef = ref(dbInstance, 'tournaments/current/nearestToPin/individual');
        const teamNTPRef = ref(dbInstance, 'tournaments/current/nearestToPin/team');
        
        let unsubIndividualDetails: (() => void) | null = null;
        let unsubTeamDetails: (() => void) | null = null;
        
        // 개인전 서든데스 상태 확인 후 구독
        const unsubIndividualStatus = onValue(individualSuddenDeathRef, snap => {
            const data = snap.val();
            if (data?.isActive) {
                setIndividualSuddenDeathData(data);
                // 활성화된 경우에만 상세 데이터 구독
                if (!unsubIndividualDetails) {
                    unsubIndividualDetails = onValue(individualSuddenDeathRef, snap => {
                        setIndividualSuddenDeathData(snap.val());
                    });
                }
            } else {
                setIndividualSuddenDeathData(null);
                // 비활성화된 경우 구독 해제
                if (unsubIndividualDetails) {
                    unsubIndividualDetails();
                    unsubIndividualDetails = null;
                }
            }
        });
        
        // 팀 서든데스 상태 확인 후 구독
        const unsubTeamStatus = onValue(teamSuddenDeathRef, snap => {
            const data = snap.val();
            if (data?.isActive) {
                setTeamSuddenDeathData(data);
                // 활성화된 경우에만 상세 데이터 구독
                if (!unsubTeamDetails) {
                    unsubTeamDetails = onValue(teamSuddenDeathRef, snap => {
                        setTeamSuddenDeathData(snap.val());
                    });
                }
            } else {
                setTeamSuddenDeathData(null);
                // 비활성화된 경우 구독 해제
                if (unsubTeamDetails) {
                    unsubTeamDetails();
                    unsubTeamDetails = null;
                }
            }
        });
        
        // 백카운트 상태 구독
        const unsubIndividualBackcount = onValue(individualBackcountRef, snap => {
            setIndividualBackcountApplied(snap.val() || false);
        });
        const unsubTeamBackcount = onValue(teamBackcountRef, snap => {
            setTeamBackcountApplied(snap.val() || false);
        });
        
        // NTP 상태 구독
        const unsubIndividualNTP = onValue(individualNTPRef, snap => {
            setIndividualNTPData(snap.val());
        });
        const unsubTeamNTP = onValue(teamNTPRef, snap => {
            setTeamNTPData(snap.val());
        });
        
        return () => {
            unsubIndividualStatus();
            unsubTeamStatus();
            unsubIndividualBackcount();
            unsubTeamBackcount();
            unsubIndividualNTP();
            unsubTeamNTP();
            if (unsubIndividualDetails) unsubIndividualDetails();
            if (unsubTeamDetails) unsubTeamDetails();
        };
    }, [initialDataLoaded]);

    const processedDataByGroup = useMemo(() => {
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);
        if (Object.keys(players).length === 0) return {};

        // 그룹 필터링 최적화: 선택된 그룹의 선수만 우선 처리
        const playersToProcess = filterGroup === 'all' 
            ? Object.entries(players)
            : Object.entries(players).filter(([_, player]: [string, any]) => player.group === filterGroup);

        const allProcessedPlayers: any[] = playersToProcess.map(([playerId, player]: [string, any]) => {
            const playerGroupData = groupsData[player.group];
            const assignedCourseIds = playerGroupData?.courses 
                ? Object.keys(playerGroupData.courses).filter((id: string) => playerGroupData.courses[id]) 
                : [];
            
            const allAssignedCoursesForPlayer = allCourses.filter((c: any) => assignedCourseIds.includes(c.id.toString()));
            const activeCoursesForPlayer = allAssignedCoursesForPlayer.filter((c: any) => c.isActive !== false);

            const playerScoresData = (scores as any)[playerId] || {};
            
            let hasAnyScore = false;
            let hasForfeited = false;
            let totalScore = 0;
            const coursesData: any = {};
            const courseScoresForTieBreak: { [courseId: string]: number } = {};
            const detailedScoresForTieBreak: { [courseId: string]: { [holeNumber: string]: number } } = {};

            // 총타수는 모든 배정된 코스의 합계로 계산 (전광판 표시 여부와 무관)
            allAssignedCoursesForPlayer.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                detailedScoresForTieBreak[courseId] = scoresForCourse;

                let courseTotal = 0;
                for (let i = 0; i < 9; i++) {
                    const holeScore = scoresForCourse[(i + 1).toString()];
                    if (holeScore !== undefined && holeScore !== null) {
                        const scoreNum = Number(holeScore);
                        if (scoreNum === 0) {
                            hasForfeited = true;
                        }
                        courseTotal += scoreNum;
                        hasAnyScore = true;
                    }
                }
                
                totalScore += courseTotal;
                courseScoresForTieBreak[courseId] = courseTotal;
            });
            
            // 전광판 표시용 코스 데이터는 활성 코스만 포함
            activeCoursesForPlayer.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                const holeScores: (number | null)[] = Array(9).fill(null);
                let courseTotal = 0;
                for (let i = 0; i < 9; i++) {
                    const holeScore = scoresForCourse[(i + 1).toString()];
                    if (holeScore !== undefined && holeScore !== null) {
                        const scoreNum = Number(holeScore);
                        holeScores[i] = scoreNum;
                        courseTotal += scoreNum;
                    }
                }
                coursesData[courseId] = { courseName: course.name, courseTotal, holeScores };
            });

            return {
                id: playerId,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                club: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                group: player.group,
                type: player.type,
                totalScore,
                coursesData,
                hasAnyScore,
                hasForfeited,
                total: totalScore,
                courseScores: courseScoresForTieBreak,
                detailedScores: detailedScoresForTieBreak,
                assignedCourses: activeCoursesForPlayer,
                allAssignedCourses: allAssignedCoursesForPlayer // 전체 배정 코스(온오프 무관)
            };
        });

        const groupedData = allProcessedPlayers.reduce((acc: Record<string, any[]>, player: any) => {
            const groupName = player.group || '미지정';
            if (!acc[groupName]) {
                acc[groupName] = [];
            }
            acc[groupName].push(player);
            return acc;
        }, {} as Record<string, any[]>);

        // 순위 정렬: 이븐 대비 ±타수 기준(작은 순)
        const rankedData: { [key: string]: ProcessedPlayer[] } = {};
        for (const groupName in groupedData) {
            // 코스 추가 역순으로 백카운트
            const coursesForGroup = [...(groupedData[groupName][0]?.assignedCourses || [])].filter(c => c && c.id !== undefined).reverse();
            const playersToSort = groupedData[groupName].filter((p: any) => p.hasAnyScore && !p.hasForfeited);
            const otherPlayers = groupedData[groupName].filter((p: any) => !p.hasAnyScore || p.hasForfeited);
            // 1위 동점자 모두 1위, 그 다음 등수부터 백카운트로 순위 부여
            if (playersToSort.length > 0) {
                // plusMinus(±타수) 기준 오름차순 정렬, tieBreak(백카운트) 적용
                playersToSort.sort((a: any, b: any) => {
                    const aPM = getPlayerTotalAndPlusMinusAllCourses(tournament, a, a.allAssignedCourses).pm ?? 0;
                    const bPM = getPlayerTotalAndPlusMinusAllCourses(tournament, b, b.allAssignedCourses).pm ?? 0;
                    if (aPM !== bPM) return aPM - bPM;
                    return tieBreak(a, b, coursesForGroup);
                });
                // 1위 동점자 처리: 최소 pm만 1위
                const minPM = getPlayerTotalAndPlusMinusAllCourses(tournament, playersToSort[0], playersToSort[0].allAssignedCourses).pm;
                let rank = 1;
                let oneRankCount = 0;
                for (let i = 0; i < playersToSort.length; i++) {
                    const currPM = getPlayerTotalAndPlusMinusAllCourses(tournament, playersToSort[i], playersToSort[i].allAssignedCourses).pm;
                    if (currPM === minPM) {
                        playersToSort[i].rank = 1;
                        oneRankCount++;
                    } else {
                        break;
                    }
                }
                // 2위 이하(실제로는 1위 동점자 수+1 등수부터) 백카운트 등수 부여
                rank = oneRankCount + 1;
                for (let i = oneRankCount; i < playersToSort.length; i++) {
                    const prev = playersToSort[i - 1];
                    const curr = playersToSort[i];
                    const prevPM = getPlayerTotalAndPlusMinusAllCourses(tournament, prev, prev.allAssignedCourses).pm;
                    const currPM = getPlayerTotalAndPlusMinusAllCourses(tournament, curr, curr.allAssignedCourses).pm;
                    if (
                        currPM === prevPM &&
                        tieBreak(curr, prev, coursesForGroup) === 0
                    ) {
                        curr.rank = playersToSort[i - 1].rank;
                    } else {
                        curr.rank = rank;
                    }
                    rank++;
                }
            }
            const finalPlayers = [...playersToSort, ...otherPlayers.map((p: any) => ({ ...p, rank: null }))];
            rankedData[groupName] = finalPlayers;
        }
        
        return rankedData;
    }, [players, scores, tournament, groupsData, individualSuddenDeathData, teamSuddenDeathData]);
    
    const allGroupsList = Object.keys(processedDataByGroup).sort();
    
    const groupProgress = useMemo(() => {
        const progressByGroup: { [key: string]: number } = {};
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);

        // 선택된 그룹만 우선 계산 (최적화)
        const groupsToCalculate = filterGroup === 'all' 
            ? Object.keys(processedDataByGroup)
            : [filterGroup];

        for (const groupName of groupsToCalculate) {
            const groupPlayers = processedDataByGroup[groupName];
            if (!groupPlayers || groupPlayers.length === 0) {
                progressByGroup[groupName] = 0; continue;
            }
            const playerGroupData = groupsData[groupName];
            const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter((id: string) => playerGroupData.courses[id]) : [];
            const coursesForGroup = allCourses.filter((c: any) => assignedCourseIds.includes(c.id.toString()) && c.isActive !== false);

            if (!coursesForGroup || coursesForGroup.length === 0) {
                progressByGroup[groupName] = 0; continue;
            }
            const totalPossibleScoresInGroup = groupPlayers.length * coursesForGroup.length * 9;
            if (totalPossibleScoresInGroup === 0) {
                progressByGroup[groupName] = 0; continue;
            }
            let totalScoresEnteredInGroup = 0;
            groupPlayers.forEach((player: any) => {
                 if ((scores as any)[player.id]) {
                    const allAssignedCourseIds = coursesForGroup.map((c: any) => c.id.toString());
                    for (const courseId in (scores as any)[player.id]) {
                        if (allAssignedCourseIds.includes(courseId)) {
                             totalScoresEnteredInGroup += Object.keys((scores as any)[player.id][courseId]).length;
                        }
                    }
                 }
            });
            const progress = Math.round((totalScoresEnteredInGroup / totalPossibleScoresInGroup) * 100);
            progressByGroup[groupName] = isNaN(progress) ? 0 : progress;
        }
        return progressByGroup;
    }, [processedDataByGroup, scores, groupsData, tournament.courses, filterGroup]);

    const processSuddenDeath = (suddenDeathData: any) => {
        if (!suddenDeathData?.isActive || !suddenDeathData.players || !Array.isArray(suddenDeathData.holes)) return [];
        
        const participatingPlayerIds = Object.keys(suddenDeathData.players).filter(id => suddenDeathData.players[id]);
        const allPlayersMap = new Map(Object.entries(players).map(([id, p]) => [id, p]));

        const results: any[] = participatingPlayerIds.map(id => {
            const playerInfo: any = allPlayersMap.get(id);
            if (!playerInfo) return null;

            const name = playerInfo.type === 'team' ? `${playerInfo.p1_name} / ${playerInfo.p2_name}` : playerInfo.name;
            const club = playerInfo.type === 'team' ? playerInfo.p1_affiliation : playerInfo.affiliation;

            const scoresPerHole: { [hole: string]: number | null } = {};
            let totalScore = 0;
            let holesPlayed = 0;
            suddenDeathData.holes.forEach((hole:number) => {
                const score = suddenDeathData.scores?.[id]?.[hole];
                if (score !== undefined && score !== null) {
                    scoresPerHole[hole] = score;
                    totalScore += score;
                    holesPlayed++;
                } else {
                    scoresPerHole[hole] = null;
                }
            });
            return { id, name, club, scoresPerHole, totalScore, holesPlayed };
        }).filter(Boolean);

        results.sort((a, b) => {
            if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed;
            if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
            return a.name.localeCompare(b.name);
        });

        let rank = 1;
        for (let i = 0; i < results.length; i++) {
            if (i > 0 && (results[i].holesPlayed < results[i - 1].holesPlayed || (results[i].holesPlayed === results[i-1].holesPlayed && results[i].totalScore > results[i - 1].totalScore))) {
                rank = i + 1;
            }
            results[i].rank = rank;
        }

        return results;
    };
    
    const processedIndividualSuddenDeathData = useMemo(() => processSuddenDeath(individualSuddenDeathData), [individualSuddenDeathData, players]);
    const processedTeamSuddenDeathData = useMemo(() => processSuddenDeath(teamSuddenDeathData), [teamSuddenDeathData, players]);

    // 백카운트/NTP 적용된 1위 동점자들의 순위를 다시 계산하는 함수 (기존 로직 활용)
    const applyPlayoffRanking = (data: any) => {
        const finalData = JSON.parse(JSON.stringify(data));
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);

        for (const groupName in finalData) {
            const groupPlayers = finalData[groupName];
            if (!groupPlayers || groupPlayers.length === 0) continue;

            // 1위 동점자들 찾기
            const firstPlacePlayers = groupPlayers.filter((p: any) => p.rank === 1);
            
            if (firstPlacePlayers.length > 1) {
                const playerType = firstPlacePlayers[0].type;
                const isIndividual = playerType === 'individual';
                
                // NTP 순위 적용 확인
                const ntpData = isIndividual ? individualNTPData : teamNTPData;
                const shouldApplyNTP = ntpData?.isActive && ntpData?.rankings;
                
                // 백카운트 적용 확인
                const shouldApplyBackcount = (isIndividual && individualBackcountApplied) ||
                                          (!isIndividual && teamBackcountApplied);

                if (shouldApplyNTP) {
                    // NTP 순위 적용
                    const ntpRankings = ntpData.rankings;
                    firstPlacePlayers.forEach((player: any) => {
                        if (ntpRankings[player.id]) {
                            player.rank = ntpRankings[player.id];
                        }
                    });

                    // 전체 그룹을 다시 정렬
                    groupPlayers.sort((a: any, b: any) => {
                        const rankA = a.rank === null ? Infinity : a.rank;
                        const rankB = b.rank === null ? Infinity : b.rank;
                        if (rankA !== rankB) return rankA - rankB;

                        const scoreA = a.hasAnyScore && !a.hasForfeited ? a.totalScore : Infinity;
                        const scoreB = b.hasAnyScore && !b.hasForfeited ? b.totalScore : Infinity;
                        return scoreA - scoreB;
                    });
                } else if (shouldApplyBackcount) {
                    // 플레이오프 백카운트: 마지막 코스부터 역순으로 비교
                    const coursesForGroup = firstPlacePlayers[0]?.assignedCourses || allCourses;
                    // 코스를 역순으로 정렬 (마지막 코스부터)
                    const sortedCoursesForBackcount = [...coursesForGroup].sort((c1, c2) => {
                        const name1 = c1?.name || '';
                        const name2 = c2?.name || '';
                        return name2.localeCompare(name1); // 역순 정렬
                    });
                    
                    firstPlacePlayers.sort((a: any, b: any) => {
                        if (a.plusMinus !== b.plusMinus) return a.plusMinus - b.plusMinus;
                        // 백카운트: 마지막 코스부터 역순으로 비교
                        for (const course of sortedCoursesForBackcount) {
                            if (!course || course.id === undefined || course.id === null) continue;
                            const courseId = course.id;
                            const aCourseScore = (a.courseScores || {})[courseId] ?? 0;
                            const bCourseScore = (b.courseScores || {})[courseId] ?? 0;
                            if (aCourseScore !== bCourseScore) {
                                return aCourseScore - bCourseScore; // 작은 타수가 상위
                            }
                        }
                        // 모든 코스 합계가 같으면 마지막 코스의 홀 점수를 역순으로 비교
                        if (sortedCoursesForBackcount.length > 0) {
                            const lastCourse = sortedCoursesForBackcount[0];
                            if (lastCourse && lastCourse.id !== undefined && lastCourse.id !== null) {
                                const lastCourseId = lastCourse.id;
                                const aHoleScores = (a.detailedScores || {})[lastCourseId] || {};
                                const bHoleScores = (b.detailedScores || {})[lastCourseId] || {};
                                for (let i = 9; i >= 1; i--) {
                                    const hole = i.toString();
                                    const aHole = aHoleScores[hole] || 0;
                                    const bHole = bHoleScores[hole] || 0;
                                    if (aHole !== bHole) {
                                        return aHole - bHole; // 작은 타수가 상위
                                    }
                                }
                            }
                        }
                        return 0;
                    });
                    
                    // 새로운 순위 부여
                    let rank = 1;
                    firstPlacePlayers[0].rank = rank;
                    for (let i = 1; i < firstPlacePlayers.length; i++) {
                        const prev = firstPlacePlayers[i-1];
                        const curr = firstPlacePlayers[i];
                        // plusMinus가 다르거나 백카운트 비교 결과가 다르면 순위 증가
                        if (curr.plusMinus !== prev.plusMinus) {
                            rank = i + 1;
                        } else {
                            // 백카운트 비교
                            let isDifferent = false;
                            for (const course of sortedCoursesForBackcount) {
                                if (!course || course.id === undefined || course.id === null) continue;
                                const courseId = course.id;
                                const currCourseScore = (curr.courseScores || {})[courseId] ?? 0;
                                const prevCourseScore = (prev.courseScores || {})[courseId] ?? 0;
                                if (currCourseScore !== prevCourseScore) {
                                    isDifferent = true;
                                    break;
                                }
                            }
                            if (!isDifferent && sortedCoursesForBackcount.length > 0) {
                                const lastCourse = sortedCoursesForBackcount[0];
                                if (lastCourse && lastCourse.id !== undefined && lastCourse.id !== null) {
                                    const lastCourseId = lastCourse.id;
                                    const currHoleScores = (curr.detailedScores || {})[lastCourseId] || {};
                                    const prevHoleScores = (prev.detailedScores || {})[lastCourseId] || {};
                                    for (let i = 9; i >= 1; i--) {
                                        const hole = i.toString();
                                        if ((currHoleScores[hole] || 0) !== (prevHoleScores[hole] || 0)) {
                                            isDifferent = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            if (isDifferent) {
                                rank = i + 1;
                            }
                        }
                        curr.rank = rank;
                    }

                    // 전체 그룹을 다시 정렬
                    groupPlayers.sort((a: any, b: any) => {
                        const rankA = a.rank === null ? Infinity : a.rank;
                        const rankB = b.rank === null ? Infinity : b.rank;
                        if (rankA !== rankB) return rankA - rankB;

                        const scoreA = a.hasAnyScore && !a.hasForfeited ? a.totalScore : Infinity;
                        const scoreB = b.hasAnyScore && !b.hasForfeited ? b.totalScore : Infinity;
                        return scoreA - scoreB;
                    });
                }
            }
        }

        return finalData;
    };

    const finalDataByGroup = useMemo(() => {
        const individualRankMap = new Map(processedIndividualSuddenDeathData.map(p => [p.id, p.rank]));
        const teamRankMap = new Map(processedTeamSuddenDeathData.map(p => [p.id, p.rank]));
        const combinedRankMap = new Map([...individualRankMap, ...teamRankMap]);

        let finalData = processedDataByGroup;

        // 서든데스 순위가 있는 경우 적용
        if (combinedRankMap.size > 0) {
            finalData = JSON.parse(JSON.stringify(processedDataByGroup));

            for (const groupName in finalData) {
                finalData[groupName].forEach((player: ProcessedPlayer) => {
                    if (combinedRankMap.has(player.id)) {
                        player.rank = combinedRankMap.get(player.id) as number;
                    }
                });
                
                finalData[groupName].sort((a: any, b: any) => {
                    const rankA = a.rank === null ? Infinity : a.rank;
                    const rankB = b.rank === null ? Infinity : b.rank;
                    if (rankA !== rankB) return rankA - rankB;

                    const scoreA = a.hasAnyScore && !a.hasForfeited ? a.totalScore : Infinity;
                    const scoreB = b.hasAnyScore && !b.hasForfeited ? b.totalScore : Infinity;
                    return scoreA - scoreB;
                })
            }
        }

        // 백카운트/NTP 적용
        finalData = applyPlayoffRanking(finalData);

        return finalData;
    }, [processedDataByGroup, processedIndividualSuddenDeathData, processedTeamSuddenDeathData, individualBackcountApplied, teamBackcountApplied, individualNTPData, teamNTPData, tournament.courses, filterGroup]);
    
    const visibleGroups = Object.keys(finalDataByGroup).filter(groupName => finalDataByGroup[groupName]?.some((player: any) => player.assignedCourses.length > 0));
    
    const groupsToDisplay = useMemo(() => {
        if (filterGroup === 'all') {
            return visibleGroups;
        }
        return visibleGroups.filter(g => g === filterGroup);
    }, [filterGroup, visibleGroups]);

    // 선수별 점수 로그 캐시 상태 (playerId별)
    const [playerScoreLogs, setPlayerScoreLogs] = useState<{ [playerId: string]: ScoreLog[] }>({});
    // 로딩 상태
    const [logsLoading, setLogsLoading] = useState(false);

    // 선수별 로그 최적화된 로딩 (점수 변경 시 즉시 로딩)
    useEffect(() => {
        const fetchLogs = async () => {
            if (Object.keys(finalDataByGroup).length === 0) return;
            
            setLogsLoading(true);
            console.log('기본 로그 로딩 시작 - finalDataByGroup 변경 감지');
            
            // 수정된 점수가 있는 선수만 로그 로딩 (최적화)
            const playersWithScores = Object.values(finalDataByGroup).flat()
                .filter((p: any) => p.hasAnyScore) // 점수가 있는 선수만
                .map((p: any) => p.id);
            
            console.log('로그 로딩할 선수들:', playersWithScores);
            
            const logsMap: { [playerId: string]: ScoreLog[] } = {};
            
            // 기존 로그 캐시 유지하면서 새로운 선수만 로딩
            const existingPlayerIds = Object.keys(playerScoreLogs);
            const newPlayerIds = playersWithScores.filter(pid => !existingPlayerIds.includes(pid));
            
            console.log('새로 로딩할 선수들:', newPlayerIds);
            
            // 새로운 선수만 로그 로딩 (병렬 처리로 성능 향상)
            if (newPlayerIds.length > 0) {
                await Promise.all(newPlayerIds.map(async (pid) => {
                    try {
                        const logs = await getPlayerScoreLogsOptimized(pid);
                        logsMap[pid] = logs;
                        console.log(`기본 로그 로딩 완료 - 선수 ${pid}:`, logs.length, '개');
                    } catch (error) {
                        console.error(`기본 로그 로딩 실패 - 선수 ${pid}:`, error);
                        logsMap[pid] = [];
                    }
                }));
                
                // 기존 로그와 새로운 로그 병합
                setPlayerScoreLogs((prev: any) => ({
                    ...prev,
                    ...logsMap
                }));
            }
            
            setLogsLoading(false);
        };
        
        // 점수 변경 시 즉시 로그 로딩 (실시간성 보장)
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finalDataByGroup, lastUpdateTime]);

    // 실시간 업데이트를 위한 점수 변경 감지 (최적화됨)
    useEffect(() => {
        if (Object.keys(scores).length === 0) return;
        
        const updateLogsForChangedScores = async () => {
            // 점수가 변경된 선수들의 로그를 즉시 업데이트
            const playersWithChangedScores = Object.keys(scores);
            
            for (const playerId of playersWithChangedScores) {
                try {
                    // 최적화된 함수로 로그 가져오기 (캐시 적용)
                    const logs = await getPlayerScoreLogsOptimized(playerId);
                    
                    setPlayerScoreLogs((prev: any) => ({
                        ...prev,
                        [playerId]: logs
                    }));
                } catch (error) {
                    console.error(`로그 로딩 실패 - 선수 ${playerId}:`, error);
                    // 에러 발생 시 빈 배열로 설정
                    setPlayerScoreLogs((prev: any) => ({
                        ...prev,
                        [playerId]: []
                    }));
                }
            }
        };
        
        updateLogsForChangedScores();
    }, [scores]); // scores 변경 시에만 실행

    // 모바일 툴팁 상태 관리 (셀별로 open)
    const [openTooltip, setOpenTooltip] = useState<{ playerId: string; courseId: string; holeIndex: number } | null>(null);
    const touchStartTimeRef = useRef<{ [key: string]: number }>({});
    const touchTimerRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

    // 모바일 외부 터치 시 툴팁 닫기
    useEffect(() => {
        if (!openTooltip) return;
        const handleTouch = (e: TouchEvent) => {
            // 셀 내부 터치면 무시
            const tooltipEl = document.getElementById('score-tooltip-' + openTooltip.playerId + '-' + openTooltip.courseId + '-' + openTooltip.holeIndex);
            if (tooltipEl && e.target instanceof Node && tooltipEl.contains(e.target)) return;
            setOpenTooltip(null);
        };
        document.addEventListener('touchstart', handleTouch, { passive: true });
        return () => document.removeEventListener('touchstart', handleTouch);
    }, [openTooltip]);


    const handleScroll = (amount: number) => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({
                top: amount,
                left: 0,
                behavior: 'smooth'
            });
        }
    };
    
    if (loading) {
        return (
            <div className="bg-black min-h-screen text-white p-8 flex items-center justify-center">
                <p className="text-2xl font-bold">전광판 데이터를 불러오는 중입니다...</p>
            </div>
        );
    }
    
    const NoDataContent = () => (
        <div className="bg-black min-h-screen text-white p-8">
            <div className="text-center py-20">
                <h1 className="text-4xl font-bold">{tournament.name || '파크골프 토너먼트'}</h1>
                <p className="mt-4 text-2xl text-gray-400">
                    {Object.keys(players).length === 0 
                        ? "표시할 선수 데이터가 없습니다. 선수를 먼저 등록해주세요."
                        : (groupsToDisplay.length === 0 && filterGroup !== 'all' ? `선택한 '${filterGroup}' 그룹에 표시할 데이터가 없습니다.` : "그룹에 배정된 코스가 없거나, 표시하도록 설정된 코스가 없습니다.")
                    }
                </p>
            </div>
        </div>
    );

    const SuddenDeathTable = ({ type, data, processedData }: { type: 'individual' | 'team', data: any, processedData: any[] }) => {
        const title = type === 'individual' ? '개인전 서든데스 플레이오프' : '2인 1팀 서든데스 플레이오프';
        const courseName = data?.courseId && tournament?.courses?.[data.courseId]?.name;
        
        return (
            <div className="mb-6">
                <header className="flex flex-col justify-center items-center border-b-4 border-red-500 pb-2 mb-2 text-center">
                    <h1 className="text-2xl md:text-4xl font-bold text-red-400 flex items-center gap-3">
                        <Flame className="h-8 w-8 animate-pulse" />
                        {title}
                        <Flame className="h-8 w-8 animate-pulse" />
                    </h1>
                    {courseName && (
                        <p className="text-lg md:text-xl font-semibold text-gray-300 mt-1">
                            ({courseName})
                        </p>
                    )}
                </header>
                <div className="overflow-x-auto bg-gray-900/50 rounded-lg border-2 border-red-500/50">
                    <table className="w-full text-center border-collapse">
                        <thead className="text-red-300 text-base">
                            <tr className="border-b-2 border-red-600/70">
                                <th className="py-2 px-2 w-48 text-center align-middle font-bold border-r border-red-800/50">선수명(팀명)</th>
                                <th className="py-2 px-2 w-48 text-center align-middle font-bold border-r border-red-800/50">소속</th>
                                {data.holes?.sort((a:number,b:number) => a-b).map((hole:number) => <th key={hole} className="py-2 px-2 w-16 text-center align-middle font-bold border-r border-red-800/50">{hole}홀</th>)}
                                <th className="py-2 px-2 min-w-[5rem] text-center align-middle font-bold border-r border-red-800/50">합계</th>
                                <th className="py-2 px-2 min-w-[5rem] text-center align-middle font-bold">순위</th>
                            </tr>
                        </thead>
                        <tbody className="text-xl">
                            {processedData.map(player => (
                                <tr key={player.id} className="border-b border-red-800/50 last:border-0">
                                    <td className="py-1 px-2 text-center align-middle font-semibold border-r border-red-800/50">{player.name}</td>
                                    <td className="py-1 px-2 text-center align-middle text-gray-400 border-r border-red-800/50">{player.club}</td>
                                    {data.holes.map((hole:number) => <td key={hole} className="py-1 px-2 align-middle font-mono font-bold text-2xl border-r border-red-800/50">{player.scoresPerHole[hole] ?? '-'}</td>)}
                                    <td className="py-1 px-2 align-middle font-bold text-2xl border-r border-red-800/50">{player.totalScore}</td>
                                    <td className="py-1 px-2 align-middle font-bold text-yellow-300 text-2xl">{player.rank}위</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    // 그룹별 현재 진행중인 코스와 진행률 계산 함수
    const getCurrentCourseAndProgress = (groupName: string) => {
        const groupPlayers = finalDataByGroup[groupName];
        if (!groupPlayers || groupPlayers.length === 0) return { courseName: null, progress: null };
        const playerGroupData = groupsData[groupName];
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);
        const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter((id: string) => playerGroupData.courses[id]) : [];
        const coursesForGroup = allCourses.filter((c: any) => assignedCourseIds.includes(c.id.toString()) && c.isActive !== false);
        if (!coursesForGroup || coursesForGroup.length === 0) return { courseName: null, progress: null };
        // 진행중인 코스: 9홀 모두 입력되지 않은 첫 번째 코스
        let currentCourse: any = null;
        let currentProgress: number | null = null;
        for (const course of coursesForGroup as any[]) {
            let totalScoresEntered = 0;
            groupPlayers.forEach((player: any) => {
                const scoresForCourse = (scores as any)[player.id]?.[course.id];
                if (scoresForCourse) {
                    totalScoresEntered += Object.keys(scoresForCourse).length;
                }
            });
            const totalPossible = groupPlayers.length * 9;
            if (totalScoresEntered < totalPossible) {
                currentCourse = course;
                currentProgress = Math.round((totalScoresEntered / totalPossible) * 100);
                break;
            }
        }
        // 모두 완료된 경우 마지막 코스 기준
        if (!currentCourse) {
            currentCourse = coursesForGroup[coursesForGroup.length - 1];
            let totalScoresEntered = 0;
            groupPlayers.forEach((player: any) => {
                const scoresForCourse = (scores as any)[player.id]?.[currentCourse.id];
                if (scoresForCourse) {
                    totalScoresEntered += Object.keys(scoresForCourse).length;
                }
            });
            const totalPossible = groupPlayers.length * 9;
            currentProgress = Math.round((totalScoresEntered / totalPossible) * 100);
        }
        return { courseName: currentCourse && typeof currentCourse === 'object' && 'name' in currentCourse ? currentCourse.name : null, progress: currentProgress };
    };

    return (
        <>
            <style>{`
                .scoreboard-container::-webkit-scrollbar { display: none; }
                .scoreboard-container { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
            <div ref={scrollContainerRef} className="scoreboard-container bg-black h-screen overflow-y-auto text-gray-200 p-2 sm:p-4 md:p-6 font-sans">
                {individualSuddenDeathData?.isActive && (
                    <SuddenDeathTable type="individual" data={individualSuddenDeathData} processedData={processedIndividualSuddenDeathData} />
                )}
                {teamSuddenDeathData?.isActive && (
                    <SuddenDeathTable type="team" data={teamSuddenDeathData} processedData={processedTeamSuddenDeathData} />
                )}
                
                {groupsToDisplay.length === 0 ? (
                     <NoDataContent />
                ) : groupsToDisplay.map((groupName) => {
                    const groupPlayers = finalDataByGroup[groupName];
                    if (!groupPlayers || groupPlayers.length === 0) return null;

                    return (
                        <div key={groupName} className="mb-8">
                            <header className="flex justify-between items-baseline border-b-2 border-gray-700">
                                <h1 className="text-xl md:text-2xl font-bold text-yellow-300">
                                    {tournament.name || '파크골프 토너먼트'} ({groupName})
                                </h1>
                                <div className="text-xl md:text-2xl font-bold text-green-400">
                                    {(() => {
                                        const { courseName, progress } = getCurrentCourseAndProgress(groupName);
                                        if (courseName && progress !== null) {
                                            return <span>{courseName}: {progress}% 진행&nbsp;|&nbsp;전체: {groupProgress[groupName]}% 진행</span>;
                                        } else {
                                            return <span>전체: {groupProgress[groupName]}% 진행</span>;
                                        }
                                    })()}
                                </div>
                            </header>
                            <div className="overflow-x-auto">
                                <table className="w-full text-center border-collapse border-l border-r border-gray-800">
                                    <thead className="text-gray-400 text-sm">
                                        <tr className="border-b-2 border-gray-600">
                                            <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-12">조</th>
                                            <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-28 md:w-32 lg:w-36">선수명(팀명)</th>
                                            <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-20 md:w-24 lg:w-28">소속</th>
                                            <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-16 md:w-20 lg:w-24">코스</th>
                                            <th colSpan={9} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-auto">HOLE</th>
                                            <th rowSpan={2} className="py-1 px-1 min-w-[4rem] text-center align-middle font-bold border-r border-gray-800">합계</th>
                                            <th rowSpan={2} className="py-1 px-1 min-w-[4rem] text-center align-middle font-bold text-yellow-400 border-r border-gray-800">총타수</th>
                                            <th rowSpan={2} className="py-1 px-1 min-w-[4rem] text-center align-middle font-bold">순위</th>
                                        </tr>
                                        <tr className="border-b border-gray-600">
                                            {Array.from({length: 9}).map((_, i) => <th key={i} className={`py-1 px-1 font-bold text-base align-middle border-r border-gray-800 min-w-[2.5rem] ${i % 2 !== 0 ? 'bg-gray-800/50' : ''}`}>{i + 1}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="text-base">
                                        {groupPlayers.map((player: ProcessedPlayer) => (
                                            <React.Fragment key={player.id}>
                                                 {player.assignedCourses.length > 0 ? player.assignedCourses.map((course: any, courseIndex: number) => (
                                                    <tr key={`${player.id}-${course.id}`} className="border-b border-gray-800 last:border-0">
                                                        {courseIndex === 0 && (
                                                            <>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 align-middle font-bold border-r border-gray-800 w-12 truncate">{player.jo}</td>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 text-center align-middle font-semibold border-r border-gray-800 w-28 md:w-32 lg:w-36 truncate">{player.name}</td>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 text-center align-middle text-gray-400 border-r border-gray-800 w-20 md:w-24 lg:w-28 truncate">{player.club}</td>
                                                            </>
                                                        )}
                                                        <td className="py-0.5 px-1 align-middle text-center border-r border-gray-800 w-16 md:w-20 lg:w-24 truncate">{player.coursesData[course.id]?.courseName}</td>
                                                        {player.coursesData[course.id]?.holeScores.map((score: any, i: number) => {
  // 해당 셀(플레이어/코스/홀)에 대한 최근 로그 찾기
  const logs = playerScoreLogs[player.id] || [];
  const cellLog = logs.find(l => {
    // courseId가 있으면 그것으로 비교
    if ((l as any).courseId) {
      return String((l as any).courseId) === String(course.id) && Number(l.holeNumber) === i + 1;
    }
    // courseId가 없으면 comment에서 코스 정보 추출
    if (l.comment && l.comment.includes(`코스: ${course.id}`)) {
      return Number(l.holeNumber) === i + 1;
    }
    // holeNumber와 코스 정보가 모두 일치하는지 확인
    if (l.holeNumber && l.comment) {
      const holeMatch = Number(l.holeNumber) === i + 1;
      const courseMatch = l.comment.includes(`코스: ${course.id}`) || l.comment.includes(`코스:${course.id}`);
      return holeMatch && courseMatch;
    }
    return false;
  });
  
  // 실제로 수정된 경우만 빨간색으로 표시 (oldValue가 0이고 newValue가 점수인 경우는 제외)
  const isModified = !!cellLog && cellLog.oldValue !== 0 && cellLog.oldValue !== cellLog.newValue;
  
  // 디버깅: 수정된 점수 정보 로깅
  if (isModified && cellLog) {
    console.log(`수정된 점수 발견 - 선수: ${player.id}, 코스: ${course.id}, 홀: ${i + 1}`, {
      oldValue: cellLog.oldValue,
      newValue: cellLog.newValue,
      modifiedBy: cellLog.modifiedBy,
      modifiedByType: cellLog.modifiedByType,
      comment: cellLog.comment
    });
  }
  
  // 임시 디버깅: 모든 점수에 대해 로그 확인
  if (score !== null && score !== undefined && score !== 0) {
    console.log(`점수 셀 정보 - 선수: ${player.id}, 코스: ${course.id}, 홀: ${i + 1}`, {
      score,
      logs: logs.length,
      cellLog: cellLog ? '있음' : '없음',
      isModified
    });
  }
  
  // 툴팁 내용 구성
  const tooltipContent = cellLog ? (
    <div>
      <div><b>수정자:</b> {
        cellLog.modifiedByType === 'admin' ? '관리자' : 
        cellLog.modifiedByType === 'captain' ? (cellLog.modifiedBy || '조장') : 
        (cellLog.modifiedBy && cellLog.modifiedBy !== 'referee' ? cellLog.modifiedBy : '심판')
      }</div>
      <div><b>일시:</b> {cellLog.modifiedAt ? new Date(cellLog.modifiedAt).toLocaleString('ko-KR') : ''}</div>
      <div><b>변경:</b> {cellLog.oldValue} → {cellLog.newValue}</div>
      {cellLog.comment && <div><b>비고:</b> {cellLog.comment}</div>}
    </div>
  ) : null;

  // 모바일: 셀 터치 시 툴팁 토글
  const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const tooltipOpen = openTooltip && openTooltip.playerId === player.id && openTooltip.courseId === course.id && openTooltip.holeIndex === i;

  const par = getParForHole(tournament, course.id, i);
  let pm = null;
  if (par !== null && score !== null && score !== undefined) {
    pm = score - par;
  }

  return (
    <td
      key={i}
      className={cn(
        `py-0.5 px-1 align-middle font-mono font-bold border-r border-gray-800 ${i % 2 !== 0 ? 'bg-gray-800/50' : ''}`,
        score === 0 ? 'text-xs' : 'text-xl',
        isModified ? 'text-red-600 font-bold cursor-pointer' : ''
      )}
      style={isModified ? { position: 'relative', zIndex: 10 } : {}}
      onTouchStart={isModified && isMobile ? (e) => {
        const cellKey = `${player.id}-${course.id}-${i}`;
        touchStartTimeRef.current[cellKey] = Date.now();
        touchTimerRef.current[cellKey] = setTimeout(() => {
          if (tooltipOpen) setOpenTooltip(null);
          else setOpenTooltip({ playerId: player.id, courseId: course.id, holeIndex: i });
        }, 500);
      } : undefined}
      onTouchEnd={isModified && isMobile ? (e) => {
        const cellKey = `${player.id}-${course.id}-${i}`;
        if (touchTimerRef.current[cellKey]) {
          clearTimeout(touchTimerRef.current[cellKey]);
          delete touchTimerRef.current[cellKey];
        }
        delete touchStartTimeRef.current[cellKey];
      } : undefined}
      onTouchCancel={isModified && isMobile ? (e) => {
        const cellKey = `${player.id}-${course.id}-${i}`;
        if (touchTimerRef.current[cellKey]) {
          clearTimeout(touchTimerRef.current[cellKey]);
          delete touchTimerRef.current[cellKey];
        }
        delete touchStartTimeRef.current[cellKey];
      } : undefined}
      id={isModified ? `score-tooltip-${player.id}-${course.id}-${i}` : undefined}
    >
      <TooltipProvider delayDuration={0}>
        <Tooltip open={isMobile && isModified ? (tooltipOpen ? true : false) : undefined}>
          <TooltipTrigger asChild>
            <span>
              {score === null ?
                '-' :
                score === 0 ?
                  <span className="text-xs">0</span> :
                  <>
                    {String(score)}
                    {pm !== null && (
                      <span
                        className={cn(
                          "ml-1 text-xs align-middle",
                          pm < 0 ? "text-blue-400" : pm > 0 ? "text-red-400" : "text-gray-400"
                        )}
                        style={{ fontSize: '0.7em', fontWeight: 600 }}
                      >
                        {pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm)}
                      </span>
                    )}
                  </>
              }
            </span>
          </TooltipTrigger>
          {isModified && tooltipContent && (
            <TooltipContent side="top" className="whitespace-pre-line">
              {tooltipContent}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </td>
  );
})}
                                                        {(() => {
  let courseSumElem: string | JSX.Element = '-';
  if (player.hasAnyScore && !player.hasForfeited) {
    const courseData = tournament?.courses?.[course.id];
    const { sum, pm } = getCourseSumAndPlusMinus(tournament, courseData, player.coursesData[course.id]?.holeScores || []);
    courseSumElem = (
      <span>
        {sum}
        {pm !== null && (
          <span className={cn("ml-1 align-middle text-xs", pm < 0 ? "text-blue-400" : pm > 0 ? "text-red-400" : "text-gray-400")} style={{ fontSize: '0.7em', fontWeight: 600 }}>
            {pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm)}
          </span>
        )}
      </span>
    );
  } else if (player.hasForfeited) {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitType = getForfeitTypeFromLogs(logs);
    if (forfeitType === 'absent') {
      courseSumElem = '불참';
    } else if (forfeitType === 'disqualified') {
      courseSumElem = '실격';
    } else {
      courseSumElem = '기권';
    }
  }
  return <td className={cn("py-0.5 px-1 align-middle font-bold text-gray-300 border-r border-gray-800", player.hasForfeited ? 'text-xs' : 'text-xl')}>{courseSumElem}</td>;
})()}
                                                        {courseIndex === 0 && (
                                                            <>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 align-middle font-bold text-yellow-300 text-2xl border-r border-gray-800">
  {player.hasForfeited ? (() => {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitType = getForfeitTypeFromLogs(logs);
    if (forfeitType === 'absent') return '불참';
    if (forfeitType === 'disqualified') return '실격';
    return '기권';
  })() : (player.hasAnyScore ? (
    <span>
      {isValidNumber(player.totalScore) ? player.totalScore : '-'}
      {(() => {
        const { pm } = getPlayerTotalAndPlusMinusAllCourses(tournament, player, player.allAssignedCourses);
        if (pm === null || pm === undefined) return null;
        return (
          <span
            className={
              'ml-1 align-middle text-xs ' +
              (pm < 0 ? 'text-blue-400' : pm > 0 ? 'text-red-400' : 'text-gray-400')
            }
            style={{ fontSize: '0.67em', fontWeight: 600 }}
          >
            {pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm)}
          </span>
        );
      })()}
    </span>
  ) : '-')}
</td>
                                                                <td rowSpan={player.assignedCourses.length || 1} className={cn("py-0.5 px-1 align-middle font-bold", player.hasForfeited ? "text-xs" : "text-xl")}>{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (() => {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitType = getForfeitTypeFromLogs(logs);
    if (forfeitType === 'absent') return '불참';
    if (forfeitType === 'disqualified') return '실격';
    return '기권';
  })() : '')}</td>
                                                            </>
                                                        )}
                                                    </tr>
                                                )) : (
                                                    <tr className="border-b border-gray-800 last:border-0">
                                                        <td className="py-0.5 px-1 align-middle font-bold border-r border-gray-800 w-12 truncate">{player.jo}</td>
                                                        <td className="py-0.5 px-1 text-center align-middle font-semibold border-r border-gray-800 w-28 md:w-32 lg:w-36 truncate">{player.name}</td>
                                                        <td className="py-0.5 px-1 text-center align-middle text-gray-400 border-r border-gray-800 w-20 md:w-24 lg:w-28 truncate">{player.club}</td>
                                                        <td colSpan={11} className="py-0.5 px-1 align-middle text-center text-gray-500 border-r border-gray-800">표시하도록 설정된 코스가 없습니다.</td>
                                                        <td className={cn("py-0.5 px-1 align-middle font-bold text-yellow-400 border-r border-gray-800", player.hasForfeited ? "text-xs" : "text-xl")}>{player.hasForfeited ? (() => {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitType = getForfeitTypeFromLogs(logs);
    if (forfeitType === 'absent') return '불참';
    if (forfeitType === 'disqualified') return '실격';
    return '기권';
  })() : (player.hasAnyScore ? player.totalScore : '-')}</td>
                                                        <td className={cn("py-0.5 px-1 align-middle font-bold", player.hasForfeited ? "text-xs" : "text-xl")}>{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (() => {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitType = getForfeitTypeFromLogs(logs);
    if (forfeitType === 'absent') return '불참';
    if (forfeitType === 'disqualified') return '실격';
    return '기권';
  })() : '')}</td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                })}
            </div>
            
            <div className="fixed top-4 right-4 flex items-center gap-4 z-50 group">
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <Label htmlFor="group-filter" className="font-bold text-sm text-gray-300">그룹 선택</Label>
                    <Select value={filterGroup} onValueChange={setFilterGroup}>
                        <SelectTrigger id="group-filter" className="w-[200px] h-9 bg-gray-800/80 backdrop-blur-sm border-gray-600 text-white focus:ring-yellow-400">
                            <SelectValue placeholder="그룹을 선택하세요" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 text-white border-gray-700">
                            <SelectItem value="all">모든 그룹 보기</SelectItem>
                            {allGroupsList.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={() => handleScroll(-50)}
                        aria-label="Scroll Up"
                        className="bg-gray-800/70 text-white p-2 rounded-full hover:bg-gray-700 transition-opacity opacity-0 group-hover:opacity-100 duration-300"
                    >
                        <ChevronUp className="h-6 w-6" />
                    </button>
                    <button
                        onClick={() => handleScroll(50)}
                        aria-label="Scroll Down"
                        className="bg-gray-800/70 text-white p-2 rounded-full hover:bg-gray-700 transition-opacity opacity-0 group-hover:opacity-100 duration-300"
                    >
                        <ChevronDown className="h-6 w-6" />
                    </button>
                </div>
            </div>
        </>
    );
}

function isValidNumber(v: any) { return typeof v === 'number' && !isNaN(v); }

    

    