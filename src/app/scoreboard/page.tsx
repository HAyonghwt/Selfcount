"use client"
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { db, ensureAuthenticated } from '@/lib/firebase';
import { ref, onValue, onChildChanged, onChildAdded, off, query, orderByKey, limitToLast, set } from 'firebase/database';
import { Flame, ChevronUp, ChevronDown, Globe } from 'lucide-react';
import { cn, safeLocalStorageGetItem, safeLocalStorageSetItem } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import GiftEventDisplay from '@/components/gift-event/GiftEventDisplay';
import GiftEventStandby from '@/components/gift-event/GiftEventStandby';
import { getPlayerScoreLogs, getPlayerScoreLogsOptimized, ScoreLog, invalidatePlayerLogCache } from '@/lib/scoreLogs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

// 다국어 번역 객체
const translations = {
    ko: {
        progress: '진행',
        total: '전체',
        group: '조',
        playerName: '선수명(팀명)',
        club: '소속',
        course: '코스',
        sum: '합계',
        totalScore: '총타수',
        rank: '순위',
        rankSuffix: '위',
        selectGroup: '그룹 선택',
        viewAllGroups: '모든 그룹 보기',
        language: '언어',
        korean: '한글',
        english: 'English',
        cycle: '순환',
        noData: '표시할 선수 데이터가 없습니다. 선수를 먼저 등록해주세요.',
        noCourse: '그룹에 배정된 코스가 없거나, 표시하도록 설정된 코스가 없습니다.',
        noGroupData: '그룹에 표시할 데이터가 없습니다.',
        loading: '전광판 데이터를 불러오는 중입니다...',
        suddenDeathIndividual: '개인전 서든데스 플레이오프',
        suddenDeathTeam: '2인 1팀 서든데스 플레이오프',
        hole: '홀',
        forfeit: '기권',
        absent: '불참',
        disqualified: '실격',
        noCourseDisplay: '표시하도록 설정된 코스가 없습니다.',
    },
    en: {
        progress: 'Progress',
        total: 'Total',
        group: 'Group',
        playerName: 'Player (Team)',
        club: 'Club',
        course: 'Course',
        sum: 'Sum',
        totalScore: 'Total',
        rank: 'Rank',
        rankSuffix: '',
        selectGroup: 'Select Group',
        viewAllGroups: 'View All Groups',
        language: 'Language',
        korean: '한글',
        english: 'English',
        cycle: 'Cycle',
        noData: 'No player data available. Please register players first.',
        noCourse: 'No courses assigned to the group or no courses set to display.',
        noGroupData: 'No data available for the selected group.',
        loading: 'Loading scoreboard data...',
        suddenDeathIndividual: 'Individual Sudden Death Playoff',
        suddenDeathTeam: 'Team Sudden Death Playoff',
        hole: 'Hole',
        forfeit: 'Forfeit',
        absent: 'Absent',
        disqualified: 'DQ',
        noCourseDisplay: 'No courses set to display.',
    }
};

// 순위 표시 함수 (영어: 1st, 2nd, 3rd... / 한글: 1위, 2위, 3위...)
const formatRank = (rank: number, lang: 'ko' | 'en'): string => {
    if (lang === 'ko') {
        return `${rank}위`;
    }
    // 영어 서수 표현
    if (rank === 1) return '1st';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return `${rank}th`;
};



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
    // 그룹별 서든데스 데이터 (모든 그룹의 서든데스 상태 관리)
    const [allIndividualSuddenDeathData, setAllIndividualSuddenDeathData] = useState<{ [groupName: string]: any }>({});
    const [allTeamSuddenDeathData, setAllTeamSuddenDeathData] = useState<{ [groupName: string]: any }>({});
    const [individualBackcountApplied, setIndividualBackcountApplied] = useState<boolean>(false);
    const [teamBackcountApplied, setTeamBackcountApplied] = useState<boolean>(false);
    const [individualNTPData, setIndividualNTPData] = useState<any>(null);
    const [teamNTPData, setTeamNTPData] = useState<any>(null);
    const [filterGroup, setFilterGroup] = useState('all');
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    
    // 그룹 순환 기능 상태
    const [rotationGroups, setRotationGroups] = useState<string[]>([]);
    const [rotationInterval, setRotationInterval] = useState<number>(30); // 기본 30초
    const [isRotationActive, setIsRotationActive] = useState<boolean>(false);
    const currentRotationIndexRef = useRef<number>(0);
    
    // 다국어 지원 상태
    const [languageMode, setLanguageMode] = useState<'korean' | 'english' | 'cycle'>('korean');
    const [currentLang, setCurrentLang] = useState<'ko' | 'en'>('ko');
    
    // 번역 함수
    const t = useCallback((key: keyof typeof translations.ko) => {
        return translations[currentLang][key];
    }, [currentLang]);
    
    // 순환 모드일 때 5초마다 언어 전환
    useEffect(() => {
        if (languageMode === 'cycle') {
            const interval = setInterval(() => {
                setCurrentLang(prev => prev === 'ko' ? 'en' : 'ko');
            }, 10000);
            return () => clearInterval(interval);
        } else {
            // 순환 모드가 아니면 선택한 언어로 고정
            setCurrentLang(languageMode === 'korean' ? 'ko' : 'en');
        }
    }, [languageMode]);

    // 그룹 순환 로직은 finalDataByGroup 선언 이후로 이동 (아래 참조)
    
    // 캐싱을 위한 상태 추가
    const [lastScoresHash, setLastScoresHash] = useState('');
    const [lastPlayersHash, setLastPlayersHash] = useState('');
    const [lastTournamentHash, setLastTournamentHash] = useState('');
    
    // 최적화된 데이터 구독을 위한 상태
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
    const [changedPlayerIds, setChangedPlayerIds] = useState<string[]>([]); // 변경된 선수 ID 추적
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

                // 순환 설정 불러오기는 별도 useEffect에서 처리 (초기 로딩과 분리)
                
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
                
                // 점수 데이터: 최적화된 실시간 업데이트 (선수별 코스별 개별 구독)
                // 모든 선수와 코스에 대해 개별 구독을 설정하여 변경된 코스의 점수만 전송받음 (데이터 사용량 최소화)
                // onValue를 코스별로 사용하여 중첩 경로 변경(scores/playerId/courseId/hole)도 감지
                const scoreSubscriptions: (() => void)[] = [];
                const allPlayerIds = Object.keys(players);
                
                // 모든 코스 ID 추출 (tournament에서)
                const allCourseIds = tournament?.courses ? Object.keys(tournament.courses) : [];
                
                allPlayerIds.forEach(playerId => {
                    allCourseIds.forEach(courseId => {
                        const playerCourseScoresRef = ref(dbInstance, `scores/${playerId}/${courseId}`);
                        const unsubscribe = onValue(playerCourseScoresRef, snap => {
                            const courseScores = snap.val();
                            
                            setScores((prev: any) => {
                                const newScores = { ...prev };
                                if (!newScores[playerId]) {
                                    newScores[playerId] = {};
                                }
                                // 코스별 점수 업데이트 (null이면 빈 객체로 처리)
                                newScores[playerId][courseId] = courseScores || {};
                                
                                // 해시 비교로 중복 데이터 차단
                                const newHash = JSON.stringify(newScores);
                                if (newHash !== lastScoresHash) {
                                    setLastScoresHash(newHash);
                                    setLastUpdateTime(Date.now());
                                    
                                    // 변경된 선수의 로그 캐시 무효화
                                    invalidatePlayerLogCache(playerId);
                                    
                                    // 변경된 선수 ID 저장 (로그 업데이트용)
                                    setChangedPlayerIds((prevIds: string[]) => {
                                        if (!prevIds.includes(playerId)) {
                                            return [...prevIds, playerId];
                                        }
                                        return prevIds;
                                    });
                                    
                                    return newScores;
                                }
                                return prev;
                            });
                        });
                        scoreSubscriptions.push(unsubscribe);
                    });
                });
                
                // 선수 추가 시 새로운 구독 추가를 위한 리스너
                const playersRefForScores = ref(dbInstance, 'players');
                const unsubNewPlayers = onChildAdded(playersRefForScores, snap => {
                    const newPlayerId = snap.key;
                    if (newPlayerId && !allPlayerIds.includes(newPlayerId)) {
                        allCourseIds.forEach(courseId => {
                            const playerCourseScoresRef = ref(dbInstance, `scores/${newPlayerId}/${courseId}`);
                            const unsubscribe = onValue(playerCourseScoresRef, snap => {
                                const courseScores = snap.val();
                                
                                setScores((prev: any) => {
                                    const newScores = { ...prev };
                                    if (!newScores[newPlayerId]) {
                                        newScores[newPlayerId] = {};
                                    }
                                    newScores[newPlayerId][courseId] = courseScores || {};
                                    
                                    const newHash = JSON.stringify(newScores);
                                    if (newHash !== lastScoresHash) {
                                        setLastScoresHash(newHash);
                                        setLastUpdateTime(Date.now());
                                        invalidatePlayerLogCache(newPlayerId);
                                        setChangedPlayerIds((prevIds: string[]) => {
                                            if (!prevIds.includes(newPlayerId)) {
                                                return [...prevIds, newPlayerId];
                                            }
                                            return prevIds;
                                        });
                                        return newScores;
                                    }
                                    return prev;
                                });
                            });
                            scoreSubscriptions.push(unsubscribe);
                        });
                    }
                });
                
                // 모든 구독을 하나의 함수로 묶어서 반환
                const unsubScores = () => {
                    scoreSubscriptions.forEach(unsub => unsub());
                    unsubNewPlayers();
                };
                
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
        
        // 개인전 서든데스 상태 확인 후 구독 (그룹별 구조 지원)
        const unsubIndividualStatus = onValue(individualSuddenDeathRef, snap => {
            const data = snap.val();
            if (!data) {
                setAllIndividualSuddenDeathData({});
                setIndividualSuddenDeathData(null);
                if (unsubIndividualDetails) {
                    unsubIndividualDetails();
                    unsubIndividualDetails = null;
                }
                return;
            }
            
            // 그룹별 구조: { groupName: { isActive, players, ... } }
            // 또는 레거시 구조: { isActive, players, ... }
            if (data.isActive && !data.groupName) {
                // 레거시 구조 (단일 서든데스) - 모든 그룹에 적용된 것으로 간주
                setAllIndividualSuddenDeathData({ '*': data });
                if (filterGroup === 'all' || filterGroup === '*') {
                    setIndividualSuddenDeathData(data);
                } else {
                    setIndividualSuddenDeathData(null);
                }
                if (!unsubIndividualDetails) {
                    unsubIndividualDetails = onValue(individualSuddenDeathRef, snap => {
                        const updatedData = snap.val();
                        if (updatedData?.isActive && !updatedData.groupName) {
                            setAllIndividualSuddenDeathData({ '*': updatedData });
                            if (filterGroup === 'all' || filterGroup === '*') {
                                setIndividualSuddenDeathData(updatedData);
                            } else {
                                setIndividualSuddenDeathData(null);
                            }
                        } else {
                            setAllIndividualSuddenDeathData({});
                            setIndividualSuddenDeathData(null);
                        }
                    });
                }
            } else if (typeof data === 'object' && !data.isActive) {
                // 그룹별 구조: 모든 그룹의 서든데스 데이터 저장
                setAllIndividualSuddenDeathData(data);
                
                // 선택된 그룹의 서든데스 찾기
                const selectedGroupData = filterGroup !== 'all' ? data[filterGroup] : null;
                if (selectedGroupData?.isActive) {
                    setIndividualSuddenDeathData(selectedGroupData);
                } else {
                    setIndividualSuddenDeathData(null);
                }
                
                if (!unsubIndividualDetails) {
                    unsubIndividualDetails = onValue(individualSuddenDeathRef, snap => {
                        const updatedData = snap.val();
                        if (updatedData && typeof updatedData === 'object' && !updatedData.isActive) {
                            setAllIndividualSuddenDeathData(updatedData);
                            const selectedGroupData = filterGroup !== 'all' ? updatedData[filterGroup] : null;
                            if (selectedGroupData?.isActive) {
                                setIndividualSuddenDeathData(selectedGroupData);
                            } else {
                                setIndividualSuddenDeathData(null);
                            }
                        } else if (updatedData?.isActive && !updatedData.groupName) {
                            setAllIndividualSuddenDeathData({ '*': updatedData });
                            if (filterGroup === 'all' || filterGroup === '*') {
                                setIndividualSuddenDeathData(updatedData);
                            } else {
                                setIndividualSuddenDeathData(null);
                            }
                        } else {
                            setAllIndividualSuddenDeathData({});
                            setIndividualSuddenDeathData(null);
                        }
                    });
                }
            } else {
                setAllIndividualSuddenDeathData({});
                setIndividualSuddenDeathData(null);
                if (unsubIndividualDetails) {
                    unsubIndividualDetails();
                    unsubIndividualDetails = null;
                }
            }
        });
        
        // 팀 서든데스 상태 확인 후 구독 (그룹별 구조 지원)
        const unsubTeamStatus = onValue(teamSuddenDeathRef, snap => {
            const data = snap.val();
            if (!data) {
                setAllTeamSuddenDeathData({});
                setTeamSuddenDeathData(null);
                if (unsubTeamDetails) {
                    unsubTeamDetails();
                    unsubTeamDetails = null;
                }
                return;
            }
            
            // 그룹별 구조: { groupName: { isActive, players, ... } }
            // 또는 레거시 구조: { isActive, players, ... }
            if (data.isActive && !data.groupName) {
                // 레거시 구조 (단일 서든데스) - 모든 그룹에 적용된 것으로 간주
                setAllTeamSuddenDeathData({ '*': data });
                if (filterGroup === 'all' || filterGroup === '*') {
                    setTeamSuddenDeathData(data);
                } else {
                    setTeamSuddenDeathData(null);
                }
                if (!unsubTeamDetails) {
                    unsubTeamDetails = onValue(teamSuddenDeathRef, snap => {
                        const updatedData = snap.val();
                        if (updatedData?.isActive && !updatedData.groupName) {
                            setAllTeamSuddenDeathData({ '*': updatedData });
                            if (filterGroup === 'all' || filterGroup === '*') {
                                setTeamSuddenDeathData(updatedData);
                            } else {
                                setTeamSuddenDeathData(null);
                            }
                        } else {
                            setAllTeamSuddenDeathData({});
                            setTeamSuddenDeathData(null);
                        }
                    });
                }
            } else if (typeof data === 'object' && !data.isActive) {
                // 그룹별 구조: 모든 그룹의 서든데스 데이터 저장
                setAllTeamSuddenDeathData(data);
                
                // 선택된 그룹의 서든데스 찾기
                const selectedGroupData = filterGroup !== 'all' ? data[filterGroup] : null;
                if (selectedGroupData?.isActive) {
                    setTeamSuddenDeathData(selectedGroupData);
                } else {
                    setTeamSuddenDeathData(null);
                }
                
                if (!unsubTeamDetails) {
                    unsubTeamDetails = onValue(teamSuddenDeathRef, snap => {
                        const updatedData = snap.val();
                        if (updatedData && typeof updatedData === 'object' && !updatedData.isActive) {
                            setAllTeamSuddenDeathData(updatedData);
                            const selectedGroupData = filterGroup !== 'all' ? updatedData[filterGroup] : null;
                            if (selectedGroupData?.isActive) {
                                setTeamSuddenDeathData(selectedGroupData);
                            } else {
                                setTeamSuddenDeathData(null);
                            }
                        } else if (updatedData?.isActive && !updatedData.groupName) {
                            setAllTeamSuddenDeathData({ '*': updatedData });
                            if (filterGroup === 'all' || filterGroup === '*') {
                                setTeamSuddenDeathData(updatedData);
                            } else {
                                setTeamSuddenDeathData(null);
                            }
                        } else {
                            setAllTeamSuddenDeathData({});
                            setTeamSuddenDeathData(null);
                        }
                    });
                }
            } else {
                setAllTeamSuddenDeathData({});
                setTeamSuddenDeathData(null);
                if (unsubTeamDetails) {
                    unsubTeamDetails();
                    unsubTeamDetails = null;
                }
            }
        });
        
        // 백카운트 상태 구독 (그룹별 구조 지원)
        const unsubIndividualBackcount = onValue(individualBackcountRef, snap => {
            const data = snap.val();
            if (!data) {
                setIndividualBackcountApplied(false);
                return;
            }
            
            // 그룹별 구조: { groupName: boolean }
            // 또는 레거시 구조: boolean
            if (typeof data === 'boolean') {
                // 레거시 구조
                setIndividualBackcountApplied(data);
            } else if (typeof data === 'object') {
                // 그룹별 구조: 선택된 그룹의 백카운트 확인
                if (filterGroup !== 'all') {
                    setIndividualBackcountApplied(data[filterGroup] || false);
                } else {
                    // 'all'일 때는 첫 번째 활성화된 그룹의 백카운트 확인
                    const activeGroup = Object.entries(data).find(([_, value]) => value === true);
                    setIndividualBackcountApplied(!!activeGroup);
                }
            } else {
                setIndividualBackcountApplied(false);
            }
        });
        const unsubTeamBackcount = onValue(teamBackcountRef, snap => {
            const data = snap.val();
            if (!data) {
                setTeamBackcountApplied(false);
                return;
            }
            
            // 그룹별 구조: { groupName: boolean }
            // 또는 레거시 구조: boolean
            if (typeof data === 'boolean') {
                // 레거시 구조
                setTeamBackcountApplied(data);
            } else if (typeof data === 'object') {
                // 그룹별 구조: 선택된 그룹의 백카운트 확인
                if (filterGroup !== 'all') {
                    setTeamBackcountApplied(data[filterGroup] || false);
                } else {
                    // 'all'일 때는 첫 번째 활성화된 그룹의 백카운트 확인
                    const activeGroup = Object.entries(data).find(([_, value]) => value === true);
                    setTeamBackcountApplied(!!activeGroup);
                }
            } else {
                setTeamBackcountApplied(false);
            }
        });
        
        // NTP 상태 구독 (그룹별 구조 지원)
        const unsubIndividualNTP = onValue(individualNTPRef, snap => {
            const data = snap.val();
            if (!data) {
                setIndividualNTPData(null);
                return;
            }
            
            // 그룹별 구조: { groupName: { isActive, players, rankings } }
            // 또는 레거시 구조: { isActive, players, rankings }
            if (data.isActive && !data.groupName) {
                // 레거시 구조 (단일 NTP)
                setIndividualNTPData(data);
            } else if (typeof data === 'object' && !data.isActive) {
                // 그룹별 구조: 선택된 그룹 또는 첫 번째 활성화된 그룹의 NTP 찾기
                let activeGroupData: any = null;
                if (filterGroup !== 'all') {
                    // 선택된 그룹의 NTP 찾기
                    activeGroupData = data[filterGroup];
                } else {
                    // 모든 그룹 중 첫 번째 활성화된 그룹 찾기
                    activeGroupData = Object.values(data).find((groupData: any) => groupData?.isActive);
                }
                setIndividualNTPData(activeGroupData?.isActive ? activeGroupData : null);
            } else {
                setIndividualNTPData(null);
            }
        });
        const unsubTeamNTP = onValue(teamNTPRef, snap => {
            const data = snap.val();
            if (!data) {
                setTeamNTPData(null);
                return;
            }
            
            // 그룹별 구조: { groupName: { isActive, players, rankings } }
            // 또는 레거시 구조: { isActive, players, rankings }
            if (data.isActive && !data.groupName) {
                // 레거시 구조 (단일 NTP)
                setTeamNTPData(data);
            } else if (typeof data === 'object' && !data.isActive) {
                // 그룹별 구조: 선택된 그룹 또는 첫 번째 활성화된 그룹의 NTP 찾기
                let activeGroupData: any = null;
                if (filterGroup !== 'all') {
                    // 선택된 그룹의 NTP 찾기
                    activeGroupData = data[filterGroup];
                } else {
                    // 모든 그룹 중 첫 번째 활성화된 그룹 찾기
                    activeGroupData = Object.values(data).find((groupData: any) => groupData?.isActive);
                }
                setTeamNTPData(activeGroupData?.isActive ? activeGroupData : null);
            } else {
                setTeamNTPData(null);
            }
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
    }, [initialDataLoaded, filterGroup]);
    
    // filterGroup 변경 시 선택된 그룹의 서든데스 데이터 업데이트
    useEffect(() => {
        // 개인전 서든데스
        if (filterGroup === 'all') {
            // 'all'일 때는 첫 번째 활성화된 그룹의 서든데스 표시
            const activeGroup = Object.entries(allIndividualSuddenDeathData).find(([_, data]: [string, any]) => data?.isActive);
            setIndividualSuddenDeathData(activeGroup ? activeGroup[1] : null);
        } else {
            // 선택된 그룹의 서든데스 표시
            const groupData = allIndividualSuddenDeathData[filterGroup];
            setIndividualSuddenDeathData(groupData?.isActive ? groupData : null);
        }
        
        // 팀 서든데스
        if (filterGroup === 'all') {
            // 'all'일 때는 첫 번째 활성화된 그룹의 서든데스 표시
            const activeGroup = Object.entries(allTeamSuddenDeathData).find(([_, data]: [string, any]) => data?.isActive);
            setTeamSuddenDeathData(activeGroup ? activeGroup[1] : null);
        } else {
            // 선택된 그룹의 서든데스 표시
            const groupData = allTeamSuddenDeathData[filterGroup];
            setTeamSuddenDeathData(groupData?.isActive ? groupData : null);
        }
    }, [filterGroup, allIndividualSuddenDeathData, allTeamSuddenDeathData]);

    const processedDataByGroup = useMemo(() => {
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);
        if (Object.keys(players).length === 0) return {};

        // 그룹 필터링 최적화: 선택된 그룹의 선수만 우선 처리
        const playersToProcess = filterGroup === 'all' 
            ? Object.entries(players)
            : Object.entries(players).filter(([_, player]: [string, any]) => player.group === filterGroup);

        const allProcessedPlayers: any[] = playersToProcess.map(([playerId, player]: [string, any]) => {
            const playerGroupData = groupsData[player.group];
            // 코스 순서 정보 가져오기 (기존 호환성: boolean → number 변환)
            const coursesOrder = playerGroupData?.courses || {};
            const assignedCourseIds = Object.keys(coursesOrder).filter((id: string) => {
                const order = coursesOrder[id];
                // boolean이면 true인 것만, number면 0보다 큰 것만
                return typeof order === 'boolean' ? order : (typeof order === 'number' && order > 0);
            });
            
            const allAssignedCoursesForPlayer = allCourses.filter((c: any) => assignedCourseIds.includes(c.id.toString()));
            // 코스 순서대로 정렬 (order가 큰 것이 마지막 = 백카운트 기준)
            allAssignedCoursesForPlayer.sort((a: any, b: any) => {
                const orderA = coursesOrder[a.id] || 0;
                const orderB = coursesOrder[b.id] || 0;
                const numA = typeof orderA === 'boolean' ? (orderA ? 1 : 0) : (typeof orderA === 'number' ? orderA : 0);
                const numB = typeof orderB === 'boolean' ? (orderB ? 1 : 0) : (typeof orderB === 'number' ? orderB : 0);
                return numA - numB; // 작은 순서가 먼저 (첫번째 코스가 위)
            });
            
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
            // 코스 순서 기반으로 정렬 (order가 큰 것이 마지막 = 백카운트 기준)
            const groupPlayers = groupedData[groupName];
            const groupData = groupsData[groupName];
            const coursesOrder = groupData?.courses || {};
            const allCoursesForGroup = [...(groupPlayers[0]?.allAssignedCourses || [])].filter(c => c && c.id !== undefined);
            // 코스 순서대로 정렬 (order가 큰 것이 마지막)
            const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                const orderA = coursesOrder[a.id] || 0;
                const orderB = coursesOrder[b.id] || 0;
                const numA = typeof orderA === 'boolean' ? (orderA ? 1 : 0) : (typeof orderA === 'number' ? orderA : 0);
                const numB = typeof orderB === 'boolean' ? (orderB ? 1 : 0) : (typeof orderB === 'number' ? orderB : 0);
                return numA - numB; // 작은 순서가 먼저
            });
            // 백카운트는 마지막 코스부터 역순이므로 reverse
            const coursesForBackcount = [...coursesForGroup].reverse();
            
            const playersToSort = groupedData[groupName].filter((p: any) => p.hasAnyScore && !p.hasForfeited);
            const otherPlayers = groupedData[groupName].filter((p: any) => !p.hasAnyScore || p.hasForfeited);
            // 1위 동점자 모두 1위, 그 다음 등수부터 백카운트로 순위 부여
            if (playersToSort.length > 0) {
                // plusMinus(±타수) 기준 오름차순 정렬, tieBreak(백카운트) 적용
                playersToSort.sort((a: any, b: any) => {
                    const aPM = getPlayerTotalAndPlusMinusAllCourses(tournament, a, a.allAssignedCourses).pm ?? 0;
                    const bPM = getPlayerTotalAndPlusMinusAllCourses(tournament, b, b.allAssignedCourses).pm ?? 0;
                    if (aPM !== bPM) return aPM - bPM;
                    return tieBreak(a, b, coursesForBackcount);
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
                        tieBreak(curr, prev, coursesForBackcount) === 0
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
    
    // 모든 그룹 목록 (groupsData에서 가져오기 - 서든데스 진행 여부와 관계없이 모든 그룹 표시)
    const allGroupsList = useMemo(() => {
        const groups = Object.keys(groupsData).filter(groupName => {
            const groupData = (groupsData as any)[groupName];
            return groupData && (groupData.type === 'individual' || groupData.type === 'team');
        });
        return groups.sort();
    }, [groupsData]);
    
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
                
                // 백카운트 적용 확인 (그룹별 구조 지원)
                const backcountState = isIndividual ? individualBackcountApplied : teamBackcountApplied;
                const shouldApplyBackcount = typeof backcountState === 'boolean' 
                    ? backcountState 
                    : (backcountState && (backcountState[groupName] || (filterGroup === 'all' && Object.values(backcountState).some(v => v === true))));

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
                    // 플레이오프 백카운트: 코스 순서 기반으로 마지막 코스부터 역순으로 비교
                    const groupName = firstPlacePlayers[0]?.group;
                    const groupData = groupsData[groupName];
                    const coursesOrder = groupData?.courses || {};
                    const allCoursesForGroup = firstPlacePlayers[0]?.allAssignedCourses || allCourses;
                    // 코스 순서대로 정렬 (order가 큰 것이 마지막)
                    const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                        const orderA = coursesOrder[a.id] || 0;
                        const orderB = coursesOrder[b.id] || 0;
                        const numA = typeof orderA === 'boolean' ? (orderA ? 1 : 0) : (typeof orderA === 'number' ? orderA : 0);
                        const numB = typeof orderB === 'boolean' ? (orderB ? 1 : 0) : (typeof orderB === 'number' ? orderB : 0);
                        return numA - numB; // 작은 순서가 먼저
                    });
                    // 백카운트는 마지막 코스부터 역순이므로 reverse
                    const sortedCoursesForBackcount = [...coursesForGroup].reverse();
                    
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

    // finalDataByGroup의 최신 값을 참조하기 위한 ref
    const finalDataByGroupRef = useRef(finalDataByGroup);
    useEffect(() => {
        finalDataByGroupRef.current = finalDataByGroup;
    }, [finalDataByGroup]);

    // 순환 설정 불러오기 (localStorage에서, 새로고침 시에도 유지)
    // 각 모니터마다 다른 설정을 가질 수 있도록 localStorage 사용
    // initialDataLoaded가 true가 된 후에 설정을 불러와서 순환이 제대로 시작되도록 함
    useEffect(() => {
        if (!initialDataLoaded) return; // 초기 데이터 로딩이 완료된 후에만 실행
        
        try {
            const savedSettings = safeLocalStorageGetItem('scoreboardRotation');
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                // intervalSeconds 먼저 설정
                if (settings.intervalSeconds !== undefined) {
                    setRotationInterval(settings.intervalSeconds);
                }
                // selectedGroups 설정 (순환이 활성화되어 있으면 그룹이 있어야 함)
                if (settings.selectedGroups && Array.isArray(settings.selectedGroups) && settings.selectedGroups.length > 0) {
                    setRotationGroups(settings.selectedGroups);
                    // 순환이 활성화되어 있고 그룹이 있으면 첫 번째 그룹으로 설정
                    if (settings.isActive && settings.selectedGroups.length > 0) {
                        currentRotationIndexRef.current = 0;
                        setFilterGroup(settings.selectedGroups[0]);
                    }
                }
                // isRotationActive는 마지막에 설정하여 순환 로직이 실행되도록 함
                if (settings.isActive !== undefined) {
                    setIsRotationActive(settings.isActive);
                }
            }
        } catch (error) {
            console.error('순환 설정 불러오기 실패:', error);
        }
    }, [initialDataLoaded]); // initialDataLoaded가 true가 되면 실행

    // 그룹 순환 로직 (데이터가 있는 그룹만 순환) - finalDataByGroup 선언 이후에 위치
    // finalDataByGroup을 dependency에서 제거하여 점수 입력 시에도 순환이 멈추지 않도록 함
    useEffect(() => {
        if (!isRotationActive || rotationGroups.length === 0) {
            return;
        }

        const interval = setInterval(() => {
            // finalDataByGroupRef를 통해 최신 값 참조 (점수 입력 시에도 순환 유지)
            const currentFinalData = finalDataByGroupRef.current;
            
            // finalDataByGroup에서 선수가 있는 그룹만 필터링 (점수 유무와 관계없이 선수가 있으면 포함)
            const availableGroups = rotationGroups.filter(group => {
                const groupData = currentFinalData[group];
                // 그룹에 선수가 있으면 순환에 포함 (점수가 없어도 선수 이름이 있으면 표시)
                return groupData && Array.isArray(groupData) && groupData.length > 0;
            });
            
            if (availableGroups.length === 0) {
                // 순환 가능한 그룹이 없으면 순환 중지하지 않고 대기
                // (데이터가 아직 로딩 중일 수 있으므로)
                return;
            }
            
            // 현재 그룹이 availableGroups에 있는지 확인
            const currentGroup = rotationGroups[currentRotationIndexRef.current];
            if (!availableGroups.includes(currentGroup)) {
                // 현재 그룹에 선수가 없으면 availableGroups의 첫 번째 그룹으로 이동
                const newIndex = rotationGroups.indexOf(availableGroups[0]);
                if (newIndex !== -1) {
                    currentRotationIndexRef.current = newIndex;
                    setFilterGroup(availableGroups[0]);
                }
                return;
            }
            
            // 다음 그룹으로 이동 (선수가 있는 그룹만)
            let nextIndex = (currentRotationIndexRef.current + 1) % rotationGroups.length;
            let attempts = 0;
            const maxAttempts = rotationGroups.length;
            
            // 선수가 있는 그룹을 찾을 때까지 순환
            while (!availableGroups.includes(rotationGroups[nextIndex]) && attempts < maxAttempts) {
                nextIndex = (nextIndex + 1) % rotationGroups.length;
                attempts++;
            }
            
            if (attempts < maxAttempts) {
                currentRotationIndexRef.current = nextIndex;
                setFilterGroup(rotationGroups[nextIndex]);
            }
        }, rotationInterval * 1000);

        return () => clearInterval(interval);
    }, [isRotationActive, rotationGroups, rotationInterval]);

    // 선수별 점수 로그 캐시 상태 (playerId별)
    const [playerScoreLogs, setPlayerScoreLogs] = useState<{ [playerId: string]: ScoreLog[] }>({});
    // 로딩 상태
    const [logsLoading, setLogsLoading] = useState(false);

    // 선수별 로그 최적화된 로딩 (점수 변경 시 즉시 로딩)
    useEffect(() => {
        const fetchLogs = async () => {
            if (Object.keys(finalDataByGroup).length === 0) return;
            
            setLogsLoading(true);
            
            // 수정된 점수가 있는 선수만 로그 로딩 (최적화)
            const playersWithScores = Object.values(finalDataByGroup).flat()
                .filter((p: any) => p.hasAnyScore) // 점수가 있는 선수만
                .map((p: any) => p.id);
            
            const logsMap: { [playerId: string]: ScoreLog[] } = {};
            
            // 기존 로그 캐시 유지하면서 새로운 선수만 로딩
            const existingPlayerIds = Object.keys(playerScoreLogs);
            const newPlayerIds = playersWithScores.filter(pid => !existingPlayerIds.includes(pid));
            
            // 새로운 선수만 로그 로딩 (병렬 처리로 성능 향상)
            if (newPlayerIds.length > 0) {
                await Promise.all(newPlayerIds.map(async (pid) => {
                    try {
                        const logs = await getPlayerScoreLogsOptimized(pid);
                        logsMap[pid] = logs;
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

    // 실시간 업데이트를 위한 점수 변경 감지 (Firebase 호출 최소화)
    // 심판 수정과 관리자 수정 모두 동일하게 작동 (처음 작동했던 간단한 버전)
    useEffect(() => {
        if (changedPlayerIds.length === 0) return;
        
        const updateLogsForChangedScores = async () => {
            // 변경된 선수 ID를 복사 (비동기 처리 중 변경 방지)
            const playerIdsToUpdate = [...changedPlayerIds];
            
            if (playerIdsToUpdate.length === 0) return;
            
            // 로그가 Firebase에 저장되는 시간을 고려하여 약간의 지연 추가
            // 점수 변경과 로그 저장이 거의 동시에 일어나므로, 로그 저장 완료를 기다림
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 변경된 선수들의 로그만 업데이트 (Firebase 호출 최소화)
            for (const playerId of playerIdsToUpdate) {
                try {
                    // 캐시가 이미 무효화되었으므로, Firebase에서 최신 로그를 가져옴
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
            
            // 처리 완료된 선수들만 제거 (새로운 변경사항은 유지)
            setChangedPlayerIds((prev: string[]) => {
                return prev.filter(id => !playerIdsToUpdate.includes(id));
            });
        };
        
        updateLogsForChangedScores();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastUpdateTime]); // lastUpdateTime 변경 시 실행 (심판/관리자 모두 동일)

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
                <p className="text-2xl font-bold">{t('loading')}</p>
            </div>
        );
    }
    
    const NoDataContent = () => (
        <div className="bg-black min-h-screen text-white p-8">
            <div className="text-center py-20">
                <h1 className="text-4xl font-bold">{tournament.name || (currentLang === 'ko' ? '파크골프 토너먼트' : 'Park Golf Tournament')}</h1>
                <p className="mt-4 text-2xl text-gray-400">
                    {Object.keys(players).length === 0 
                        ? t('noData')
                        : (groupsToDisplay.length === 0 && filterGroup !== 'all' ? t('noGroupData') : t('noCourse'))
                    }
                </p>
            </div>
        </div>
    );

    const SuddenDeathTable = ({ type, data, processedData }: { type: 'individual' | 'team', data: any, processedData: any[] }) => {
        const title = type === 'individual' ? t('suddenDeathIndividual') : t('suddenDeathTeam');
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
                                <th className="py-2 px-2 w-48 text-center align-middle font-bold border-r border-red-800/50">{t('playerName')}</th>
                                <th className="py-2 px-2 w-48 text-center align-middle font-bold border-r border-red-800/50">{t('club')}</th>
                                {data.holes?.sort((a:number,b:number) => a-b).map((hole:number) => <th key={hole} className="py-2 px-2 w-16 text-center align-middle font-bold border-r border-red-800/50">{hole}{currentLang === 'ko' ? '홀' : ''}</th>)}
                                <th className="py-2 px-2 min-w-[5rem] text-center align-middle font-bold border-r border-red-800/50">{t('sum')}</th>
                                <th className="py-2 px-2 min-w-[5rem] text-center align-middle font-bold">{t('rank')}</th>
                            </tr>
                        </thead>
                        <tbody className="text-xl">
                            {processedData.map(player => (
                                <tr key={player.id} className="border-b border-red-800/50 last:border-0">
                                    <td className="py-1 px-2 text-center align-middle font-semibold border-r border-red-800/50">{player.name}</td>
                                    <td className="py-1 px-2 text-center align-middle text-gray-400 border-r border-red-800/50">{player.club}</td>
                                    {data.holes.map((hole:number) => <td key={hole} className="py-1 px-2 align-middle font-mono font-bold text-2xl border-r border-red-800/50">{player.scoresPerHole[hole] ?? '-'}</td>)}
                                    <td className="py-1 px-2 align-middle font-bold text-2xl border-r border-red-800/50">{player.totalScore}</td>
                                    <td className="py-1 px-2 align-middle font-bold text-yellow-300 text-2xl">{formatRank(player.rank, currentLang)}</td>
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
                                            return <span>{courseName}: {progress}% {t('progress')}&nbsp;|&nbsp;{t('total')}: {groupProgress[groupName]}% {t('progress')}</span>;
                                        } else {
                                            return <span>{t('total')}: {groupProgress[groupName]}% {t('progress')}</span>;
                                        }
                                    })()}
                                </div>
                            </header>
                            <div className="overflow-x-auto">
                                <table className="w-full text-center border-collapse border-l border-r border-gray-800">
                                    <thead className="text-gray-400 text-sm">
                                        <tr className="border-b-2 border-gray-600">
                                            <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-12">{t('group')}</th>
                                            <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-28 md:w-32 lg:w-36">{t('playerName')}</th>
                                            <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-20 md:w-24 lg:w-28">{t('club')}</th>
                                            <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-16 md:w-20 lg:w-24">{t('course')}</th>
                                            <th colSpan={9} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800 w-auto">HOLE</th>
                                            <th rowSpan={2} className="py-1 px-1 min-w-[4rem] text-center align-middle font-bold border-r border-gray-800">{t('sum')}</th>
                                            <th rowSpan={2} className="py-1 px-1 min-w-[4rem] text-center align-middle font-bold text-yellow-400 border-r border-gray-800">{t('totalScore')}</th>
                                            <th rowSpan={2} className="py-1 px-1 min-w-[4rem] text-center align-middle font-bold">{t('rank')}</th>
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
                  <span className={cn("text-xs", isModified ? "text-red-600" : "")}>0</span> :
                  <>
                    <span className={cn(isModified ? "text-red-600" : "")}>{String(score)}</span>
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
      courseSumElem = t('absent');
    } else if (forfeitType === 'disqualified') {
      courseSumElem = t('disqualified');
    } else {
      courseSumElem = t('forfeit');
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
    if (forfeitType === 'absent') return t('absent');
    if (forfeitType === 'disqualified') return t('disqualified');
    return t('forfeit');
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
                                                                <td rowSpan={player.assignedCourses.length || 1} className={cn("py-0.5 px-1 align-middle font-bold", player.hasForfeited ? "text-xs" : "text-xl")}>{player.rank !== null ? formatRank(player.rank, currentLang) : (player.hasForfeited ? (() => {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitType = getForfeitTypeFromLogs(logs);
    if (forfeitType === 'absent') return t('absent');
    if (forfeitType === 'disqualified') return t('disqualified');
    return t('forfeit');
  })() : '')}</td>
                                                            </>
                                                        )}
                                                    </tr>
                                                )) : (
                                                    <tr className="border-b border-gray-800 last:border-0">
                                                        <td className="py-0.5 px-1 align-middle font-bold border-r border-gray-800 w-12 truncate">{player.jo}</td>
                                                        <td className="py-0.5 px-1 text-center align-middle font-semibold border-r border-gray-800 w-28 md:w-32 lg:w-36 truncate">{player.name}</td>
                                                        <td className="py-0.5 px-1 text-center align-middle text-gray-400 border-r border-gray-800 w-20 md:w-24 lg:w-28 truncate">{player.club}</td>
                                                        <td colSpan={11} className="py-0.5 px-1 align-middle text-center text-gray-500 border-r border-gray-800">{t('noCourseDisplay')}</td>
                                                        <td className={cn("py-0.5 px-1 align-middle font-bold text-yellow-400 border-r border-gray-800", player.hasForfeited ? "text-xs" : "text-xl")}>{player.hasForfeited ? (() => {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitType = getForfeitTypeFromLogs(logs);
    if (forfeitType === 'absent') return t('absent');
    if (forfeitType === 'disqualified') return t('disqualified');
    return t('forfeit');
  })() : (player.hasAnyScore ? player.totalScore : '-')}</td>
                                                        <td className={cn("py-0.5 px-1 align-middle font-bold", player.hasForfeited ? "text-xs" : "text-xl")}>{player.rank !== null ? formatRank(player.rank, currentLang) : (player.hasForfeited ? (() => {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitType = getForfeitTypeFromLogs(logs);
    if (forfeitType === 'absent') return t('absent');
    if (forfeitType === 'disqualified') return t('disqualified');
    return t('forfeit');
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
            
            {/* 왼쪽 위: 언어 선택 */}
            <div className="fixed left-4 flex items-center gap-4 z-50 group/lang" style={{ height: '36px', top: '3rem' }}>
                <div className="flex items-center gap-2 opacity-0 group-hover/lang:opacity-100 transition-opacity duration-300 h-full">
                    <Globe className="h-5 w-5 text-gray-400" />
                    <Label htmlFor="language-select" className="font-bold text-sm text-gray-300">{t('language')}</Label>
                    <Select value={languageMode} onValueChange={(v) => setLanguageMode(v as 'korean' | 'english' | 'cycle')}>
                        <SelectTrigger id="language-select" className="w-[120px] h-9 bg-gray-800/80 backdrop-blur-sm border-gray-600 text-white focus:ring-yellow-400">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 text-white border-gray-700">
                            <SelectItem value="korean">{t('korean')}</SelectItem>
                            <SelectItem value="english">{t('english')}</SelectItem>
                            <SelectItem value="cycle">{t('cycle')} (10s)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {/* 순환 모드 표시 */}
                {languageMode === 'cycle' && (
                    <div className="text-xs text-yellow-400 animate-pulse flex items-center h-full">
                        {currentLang === 'ko' ? '🇰🇷' : '🇺🇸'}
                    </div>
                )}
            </div>

            {/* 오른쪽 위: 그룹 선택 */}
            <div className="fixed top-4 right-4 flex flex-col items-end gap-2 z-50 group">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <Label htmlFor="group-filter" className="font-bold text-sm text-gray-300">{t('selectGroup')}</Label>
                        <div className="relative">
                            <Select value={filterGroup} onValueChange={(value) => {
                                setFilterGroup(value);
                                // 순환이 활성화되어 있으면 수동 변경 시 순환 중지
                                if (isRotationActive) {
                                    setIsRotationActive(false);
                                }
                            }}>
                                <SelectTrigger id="group-filter" className="w-[200px] h-9 bg-gray-800/80 backdrop-blur-sm border-gray-600 text-white focus:ring-yellow-400">
                                    <SelectValue placeholder={t('selectGroup')} />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-900 text-white border-gray-700">
                                    <SelectItem value="all">{t('viewAllGroups')}</SelectItem>
                                    {allGroupsList.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {/* 순환 중 표시 */}
                            {isRotationActive && rotationGroups.length > 0 && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                            )}
                        </div>
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

                {/* 그룹 순환 설정 (마우스 오버 시 표시) */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4 min-w-[280px]">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <Label className="font-bold text-sm text-gray-300">그룹 순환</Label>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="rotation-active"
                                    checked={isRotationActive}
                                    onCheckedChange={(checked) => {
                                        const newValue = checked === true;
                                        setIsRotationActive(newValue);
                                        if (newValue && rotationGroups.length > 0) {
                                            // 순환 시작 시 첫 번째 그룹으로 설정
                                            currentRotationIndexRef.current = 0;
                                            setFilterGroup(rotationGroups[0]);
                                        }
                                        // localStorage에 저장 (새로고침 시 유지, 각 모니터별로 독립적)
                                        try {
                                            safeLocalStorageSetItem('scoreboardRotation', JSON.stringify({
                                                isActive: newValue,
                                                intervalSeconds: rotationInterval,
                                                selectedGroups: rotationGroups
                                            }));
                                        } catch (error) {
                                            console.error('순환 설정 저장 실패:', error);
                                        }
                                    }}
                                    className="border-gray-600"
                                />
                                <Label htmlFor="rotation-active" className="text-xs text-gray-400 cursor-pointer">
                                    활성화
                                </Label>
                            </div>
                        </div>

                        {isRotationActive && (
                            <>
                                <div className="flex flex-col gap-2">
                                    <Label className="text-xs text-gray-400">순환할 그룹 선택</Label>
                                    <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                                        {allGroupsList.map(group => (
                                            <div key={group} className="flex items-center gap-2">
                                                <Checkbox
                                                    id={`rotation-group-${group}`}
                                                    checked={rotationGroups.includes(group)}
                                                    onCheckedChange={(checked) => {
                                                        let newGroups: string[];
                                                        if (checked === true) {
                                                            newGroups = [...rotationGroups, group];
                                                            setRotationGroups(newGroups);
                                                        } else {
                                                            newGroups = rotationGroups.filter(g => g !== group);
                                                            setRotationGroups(newGroups);
                                                        }
                                                        // localStorage에 저장 (새로고침 시 유지, 각 모니터별로 독립적)
                                                        try {
                                                            safeLocalStorageSetItem('scoreboardRotation', JSON.stringify({
                                                                isActive: isRotationActive,
                                                                intervalSeconds: rotationInterval,
                                                                selectedGroups: newGroups
                                                            }));
                                                        } catch (error) {
                                                            console.error('순환 설정 저장 실패:', error);
                                                        }
                                                    }}
                                                    className="border-gray-600"
                                                />
                                                <Label htmlFor={`rotation-group-${group}`} className="text-xs text-gray-300 cursor-pointer">
                                                    {group}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-xs text-gray-400">순환 시간</Label>
                                    <Select 
                                        value={rotationInterval.toString()} 
                                        onValueChange={(value) => {
                                            const newInterval = parseInt(value);
                                            setRotationInterval(newInterval);
                                            // localStorage에 저장 (새로고침 시 유지, 각 모니터별로 독립적)
                                            try {
                                                safeLocalStorageSetItem('scoreboardRotation', JSON.stringify({
                                                    isActive: isRotationActive,
                                                    intervalSeconds: newInterval,
                                                    selectedGroups: rotationGroups
                                                }));
                                            } catch (error) {
                                                console.error('순환 설정 저장 실패:', error);
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="w-full h-8 bg-gray-800/80 border-gray-600 text-white text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-900 text-white border-gray-700">
                                            <SelectItem value="10">10초</SelectItem>
                                            <SelectItem value="30">30초</SelectItem>
                                            <SelectItem value="60">1분</SelectItem>
                                            <SelectItem value="120">2분</SelectItem>
                                            <SelectItem value="180">3분</SelectItem>
                                            <SelectItem value="240">4분</SelectItem>
                                            <SelectItem value="300">5분</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

function isValidNumber(v: any) { return typeof v === 'number' && !isNaN(v); }

    

    