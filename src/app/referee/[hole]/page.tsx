
"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, Lock, Trophy, ArrowLeft } from 'lucide-react';
import { db, ensureAuthenticated } from '@/lib/firebase';
import { ref, onValue, set, get } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { logScoreChange } from '@/lib/scoreLogs';
import QRCodeViewer from '@/components/QRCodeViewer';

interface Player {
    id: string;
    name?: string;
    type: 'individual' | 'team';
    jo: number;
    group: string;
    p1_name?: string;
    p2_name?: string;
}
interface Course { id: number; name:string; isActive: boolean; }
interface ScoreData {
    score: number;
    status: 'editing' | 'locked';
    forfeitType?: 'absent' | 'disqualified' | 'forfeit' | null; // 추가: 기권 타입
}

// 캐시 인터페이스 추가
interface DataCache {
    players: { [groupId: string]: Player[] };
    scores: { [courseId: string]: { [playerId: string]: any } };
    tournament: any;
    lastUpdated: { [key: string]: number };
}

export default function RefereePage() {
    const params = useParams();
    const router = useRouter();
    const hole = String(params.hole ?? '');
    const { toast } = useToast();
    const [refereeData, setRefereeData] = useState<any>(null);

    // 캐시 상태 추가
    const dataCache = useRef<DataCache>({
        players: {},
        scores: {},
        tournament: null,
        lastUpdated: {}
    });

    // Data from Firebase - 최적화된 상태 관리
    const [allPlayers, setAllPlayers] = useState<Player[]>([]);
    const [allScores, setAllScores] = useState<any>({});
    const [courses, setCourses] = useState<Course[]>([]);
    const [groupsData, setGroupsData] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [unlockPasswordFromDb, setUnlockPasswordFromDb] = useState('');

    // 구독 관리용 ref 추가
    const subscriptions = useRef<{ [key: string]: () => void }>({});

    // UI State
    const [view, setView] = useState<'selection' | 'scoring'>('selection');
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [selectedJo, setSelectedJo] = useState<string>('');
    const [selectedType, setSelectedType] = useState<'individual' | 'team' | ''>('');

    // 임시: 뒤로가기 경고 다이얼로그 상태
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [pendingBackType, setPendingBackType] = useState<'button'|'popstate'|null>(null);

    // leave confirm용 함수 (JSX에서 참조)
    const confirmLeave = () => {
        setShowLeaveConfirm(false);
        setPendingBackType(null);
        setView('selection');
        setSelectedGroup('');
        setSelectedCourse('');
        setSelectedJo('');
    };
    const cancelLeave = () => {
        setShowLeaveConfirm(false);
        setPendingBackType(null);
    };

    // Local state for scoring UI
    const [scores, setScores] = useState<{ [key: string]: ScoreData }>({});
    const [playerToSave, setPlayerToSave] = useState<Player | null>(null);
    
    // scores 상태를 참조하기 위한 ref (무한 렌더링 방지)
    const scoresRef = useRef(scores);
    scoresRef.current = scores;

    // Unlock modal state
    const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
    const [unlockPasswordInput, setUnlockPasswordInput] = useState('');
    const [playerToUnlock, setPlayerToUnlock] = useState<Player | null>(null);
    
    // 1. 추가: 저장 안된 선수 체크 및 이동 시도 카운트 상태
    const [unsavedMoveCount, setUnsavedMoveCount] = useState<{ [playerId: string]: number }>({});
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [unsavedPlayers, setUnsavedPlayers] = useState<Player[]>([]);

    // 안내 모달 상태 추가
    const [showAllJosCompleteModal, setShowAllJosCompleteModal] = useState(false);
    
    // completedJos를 별도 상태로 관리
    const [completedJosState, setCompletedJosState] = useState<Set<string>>(new Set());

    // 구독 해제 함수
    const unsubscribeFrom = (key: string) => {
        if (subscriptions.current[key]) {
            subscriptions.current[key]();
            delete subscriptions.current[key];
        }
    };

    // 모든 구독 해제 함수
    const unsubscribeAll = () => {
        Object.keys(subscriptions.current).forEach(key => {
            unsubscribeFrom(key);
        });
    };



    // 로그인 상태 확인 및 Firebase 인증
    useEffect(() => {
        const loggedInReferee = sessionStorage.getItem('refereeData');
        if (!loggedInReferee) {
            router.push('/referee/login');
            return;
        }

        try {
            const referee = JSON.parse(loggedInReferee);
            setRefereeData(referee);
            
            // 로그인한 심판의 홀과 현재 페이지 홀이 다르면 리다이렉트
            if (referee.hole !== parseInt(hole)) {
                router.push(`/referee/${referee.hole}`);
                return;
            }
            
            // Firebase 인증 수행
            ensureAuthenticated().then(success => {
                if (!success) {
                    console.warn('Firebase 인증 실패 - 점수 저장 시 재시도됩니다.');
                }
            });
        } catch (error) {
            console.error('심판 데이터 파싱 오류:', error);
            router.push('/referee/login');
            return;
        }
    }, [hole, router]);

    // 최적화된 데이터 페칭 - 토너먼트 설정은 한 번만 로드
    useEffect(() => {
        setLoading(true);
        const dbInstance = db as import('firebase/database').Database;
        
        // 토너먼트 설정은 한 번만 로드 (캐시 확인)
        const loadTournamentData = async () => {
            const cacheKey = 'tournament';
            const now = Date.now();
            const cacheAge = now - (dataCache.current.lastUpdated[cacheKey] || 0);
            
            // 캐시가 30분 이내면 캐시 사용 (토너먼트 설정은 거의 바뀌지 않음)
            if (dataCache.current.tournament && cacheAge < 30 * 60 * 1000) {
                const cached = dataCache.current.tournament;
                setCourses(cached.courses ? Object.values(cached.courses) : []);
                setGroupsData(cached.groups || {});
                setLoading(false);
                return;
            }

            // 캐시가 없거나 오래된 경우 새로 로드 (한 번만)
            const tournamentRef = ref(dbInstance, 'tournaments/current');
            const passwordRef = ref(dbInstance, 'config/scoreUnlockPassword');

            // 최적화: 한 번만 로드하여 캐시에 저장
            const loadTournamentOnce = async () => {
                try {
                    const [tournamentSnapshot, passwordSnapshot] = await Promise.all([
                        get(tournamentRef),
                        get(passwordRef)
                    ]);
                    
                    const data = tournamentSnapshot.val() || {};
                    const password = passwordSnapshot.val() || '';
                    
                    dataCache.current.tournament = data;
                    dataCache.current.lastUpdated[cacheKey] = Date.now();
                    setCourses(data.courses ? Object.values(data.courses) : []);
                    setGroupsData(data.groups || {});
                    setUnlockPasswordFromDb(password);
                    setLoading(false);
                } catch (error) {
                    console.error('토너먼트 데이터 로드 실패:', error);
                    setLoading(false);
                }
            };

            loadTournamentOnce();

            // 구독 해제 함수는 빈 함수로 설정 (한 번만 로드하므로)
            subscriptions.current['tournament'] = () => {};
            subscriptions.current['password'] = () => {};
        };

        loadTournamentData();

        return () => {
            unsubscribeFrom('tournament');
            unsubscribeFrom('password');
        };
    }, []);

    // 선택된 그룹의 선수만 구독하는 최적화된 로직
    useEffect(() => {
        if (!selectedGroup || !selectedType) {
            setAllPlayers([]);
            return;
        }

        const cacheKey = `players_${selectedGroup}`;
        const now = Date.now();
        const cacheAge = now - (dataCache.current.lastUpdated[cacheKey] || 0);
        
        // 캐시가 5분 이내면 캐시 사용 (선수 정보는 자주 바뀌지 않음)
        if (dataCache.current.players[selectedGroup] && cacheAge < 5 * 60 * 1000) {
            setAllPlayers(dataCache.current.players[selectedGroup]);
            return;
        }

        const dbInstance = db as import('firebase/database').Database;
        // 최적화: 전체 players 대신 한 번만 로드하여 그룹별로 필터링
        const playersRef = ref(dbInstance, 'players');

        // 최적화: 전체 players 대신 특정 그룹 선수만 조회하려 시도, 실패 시 전체에서 필터링
        const loadPlayersOnce = async () => {
            try {
                let groupPlayers: Player[] = [];
                
                // 방법 1: 특정 그룹 경로로 직접 조회 시도 (데이터 최소화)
                try {
                    const groupPlayersRef = ref(dbInstance, `playersByGroup/${selectedGroup}`);
                    const groupSnapshot = await get(groupPlayersRef);
                    if (groupSnapshot.exists()) {
                        groupPlayers = Object.entries(groupSnapshot.val()).map(([id, player]) => ({ id, ...player as object } as Player));
                    }
                } catch (groupError) {
                    // 그룹별 인덱스가 없는 경우 무시하고 다음 방법 시도
                }
                
                // 방법 2: 그룹별 인덱스가 없으면 전체에서 필터링 (최소한의 fallback)
                if (groupPlayers.length === 0) {
                    const snapshot = await get(playersRef);
                    const allPlayersData = Object.entries(snapshot.val() || {}).map(([id, player]) => ({ id, ...player as object } as Player));
                    groupPlayers = allPlayersData.filter(p => p.group === selectedGroup);
                }
                
                // 캐시 업데이트
                dataCache.current.players[selectedGroup] = groupPlayers;
                dataCache.current.lastUpdated[cacheKey] = Date.now();
                
                setAllPlayers(groupPlayers);
            } catch (error) {
                console.error('선수 데이터 로드 실패:', error);
                setAllPlayers([]);
            }
        };

        loadPlayersOnce();

        // 구독 해제 함수는 빈 함수로 설정 (한 번만 로드하므로)
        subscriptions.current['players'] = () => {};

        return () => {
            unsubscribeFrom('players');
        };
    }, [selectedGroup, selectedType]);

    // 현재 선수들의 현재 코스만 구독하는 최적화된 로직
    useEffect(() => {
        if (!selectedCourse || !selectedGroup || !selectedJo || !allPlayers.length) {
            setAllScores({});
            return;
        }

        const cacheKey = `scores_${selectedCourse}`;
        const now = Date.now();
        const cacheAge = now - (dataCache.current.lastUpdated[cacheKey] || 0);
        
        // 캐시가 30초 이내면 캐시 사용
        if (dataCache.current.scores[selectedCourse] && cacheAge < 30 * 1000) {
            setAllScores(dataCache.current.scores[selectedCourse]);
            return;
        }

        const dbInstance = db as import('firebase/database').Database;
        const filteredPlayers = allPlayers.filter(p => p.group === selectedGroup && p.jo.toString() === selectedJo);
        


        // 현재 선수들의 현재 코스만 개별 구독 (최소 데이터)
        const courseScores: any = {};
        
        filteredPlayers.forEach(player => {
            const playerCourseRef = ref(dbInstance, `scores/${player.id}/${selectedCourse}`);
            const unsubscribe = onValue(playerCourseRef, (snapshot) => {
                const playerCourseScores = snapshot.val();
                if (playerCourseScores) {
                    courseScores[player.id] = { [selectedCourse]: playerCourseScores };
                } else {
                    // 점수가 없는 경우 빈 객체로 설정
                    courseScores[player.id] = { [selectedCourse]: {} };
                }
                
                // 전체 상태 업데이트
                setAllScores({ ...courseScores });
                

            });
            
            subscriptions.current[`score_${player.id}`] = unsubscribe;
        });

        // 캐시 업데이트
        dataCache.current.scores[selectedCourse] = courseScores;
        dataCache.current.lastUpdated[cacheKey] = Date.now();

        return () => {
            // 개별 점수 구독 해제
            filteredPlayers.forEach(player => {
                unsubscribeFrom(`score_${player.id}`);
            });
        };
    }, [selectedCourse, selectedGroup, selectedJo, allPlayers, hole]);

    // 컴포넌트 언마운트 시 모든 구독 해제
    useEffect(() => {
        return () => {
            unsubscribeAll();
        };
    }, []);

    // handleNextGroup 함수 수정
    const handleNextGroup = async (forceMoveOverride?: boolean) => {
        // 저장 안된 선수(잠금 안된 선수) 찾기
        const unsaved = currentPlayers.filter(p => scores[p.id]?.status !== 'locked');
        if (unsaved.length > 0 && !forceMoveOverride) {
            setUnsavedPlayers(unsaved);
            setShowUnsavedModal(true);
            return;
        }
        // 3회 이상 강제 이동 시 자동 기권 처리
        if (unsaved.length > 0 && forceMoveOverride) {
            let autoForfeitPlayers: string[] = [];
            for (const p of unsaved) {
                const count = (unsavedMoveCount[p.id] || 0) + 1;
                if (count >= 3) {
                    // 자동 기권 처리: 남은 홀 0점 입력
                    for (let h = 1; h <= 9; h++) {
                        const hStr = h.toString();
                        if (!allScores[p.id]?.[(selectedCourse || '')]?.[hStr]) {
                            await set(ref(db as import('firebase/database').Database, `/scores/${p.id}/${selectedCourse || ''}/${hStr}`), 0);
                                            }
                }
                const playerName = getPlayerName(p);
                if (playerName) {
                    autoForfeitPlayers.push(playerName);
                }
                }
                unsavedMoveCount[p.id] = count;
            }
            setUnsavedMoveCount({ ...unsavedMoveCount });
            if (autoForfeitPlayers.length > 0) {
                toast({
                    title: '자동 기권 처리',
                    description: `${autoForfeitPlayers.join(', ')} 선수(들)가 3회 이상 점수 미저장으로 자동 기권 처리되었습니다.`,
                    variant: 'destructive',
                });
            }
        }
        // --- 등록 순서 기준 조 이동 로직 ---
        const allJos = availableJos;
        const currentIdx = allJos.findIndex(j => j === selectedJo);
        let nextJo = '';
        for (let i = 1; i <= allJos.length; i++) {
            const idx = (currentIdx + i) % allJos.length;
            const candidateJo = allJos[idx];
            if (!completedJosState.has(candidateJo)) {
                nextJo = candidateJo;
                break;
            }
        }
        if (!nextJo) {
            setShowAllJosCompleteModal(true);
            return;
        }
        setSelectedJo(nextJo);
    };

    // popstate(브라우저 뒤로가기)에서 경고 다이얼로그
    useEffect(() => {
        const onPopState = (e: PopStateEvent) => {
            if (view === 'scoring') {
                setPendingBackType('popstate');
                setShowLeaveConfirm(true);
                window.history.pushState(null, '', window.location.href);
            }
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('popstate', onPopState);
            if (view === 'scoring') window.history.pushState(null, '', window.location.href);
        }
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('popstate', onPopState);
            }
        };
    }, [view]);

    // Restore state from localStorage on initial load
    useEffect(() => {
        try {
            const savedStateJSON = localStorage.getItem(`refereeState_${hole}`);
            if (savedStateJSON) {
                const savedState = JSON.parse(savedStateJSON);
                if (savedState.group && savedState.course && savedState.jo && savedState.view === 'scoring') {
                    setSelectedGroup(savedState.group);
                    setSelectedCourse(savedState.course);
                    setSelectedJo(savedState.jo);
                    setView(savedState.view);
                    if (savedState.selectedType) {
                        setSelectedType(savedState.selectedType);
                    }
                } else {
                    localStorage.removeItem(`refereeState_${hole}`);
                }
            }
        } catch (error) {
            console.error("Failed to restore referee state from localStorage", error);
            localStorage.removeItem(`refereeState_${hole}`);
        }
    }, [hole]);
    
    // Save view state to localStorage
    useEffect(() => {
        if (view === 'scoring' && selectedGroup && selectedCourse && selectedJo) {
            const stateToSave = {
                group: selectedGroup,
                course: selectedCourse,
                jo: selectedJo,
                view: 'scoring',
                selectedType
            };
            localStorage.setItem(`refereeState_${hole}`, JSON.stringify(stateToSave));
        } else if (view === 'selection') {
            localStorage.removeItem(`refereeState_${hole}`);
        }
    }, [view, selectedGroup, selectedCourse, selectedJo, selectedType, hole]);

    // Derived data
    const availableGroups = useMemo(() => {
        if (!selectedType) return [];
        return Object.values(groupsData)
            .filter((g: any) => g.type === selectedType)
            .map((g: any) => g.name)
            .filter(Boolean)
            .sort();
    }, [groupsData, selectedType]);
    
    const availableCoursesForGroup = useMemo(() => {
        if (!selectedGroup) return [];
        const group = groupsData[selectedGroup as string];
        if (!group || !group.courses) return [];
        const assignedCourseIds = Object.keys(group.courses).filter(id => group.courses[id]);
        return courses.filter(c => assignedCourseIds.includes(c.id.toString()));
    }, [selectedGroup, groupsData, courses]);

    const availableJos = useMemo(() => {
        if (!selectedGroup) return [];
        const groupPlayers = allPlayers.filter(p => p.group === selectedGroup);
        const seen = new Set<string>();
        const orderedJos: string[] = [];
        groupPlayers.forEach(p => {
            const joStr = p.jo.toString();
            if (!seen.has(joStr)) {
                seen.add(joStr);
                orderedJos.push(joStr);
            }
        });
        return orderedJos;
    }, [allPlayers, selectedGroup]);
    
    const currentPlayers = useMemo(() => {
        if (!selectedJo) return [];
        return allPlayers.filter(p => p.group === selectedGroup && p.jo.toString() === selectedJo);
    }, [allPlayers, selectedGroup, selectedJo]);
    
    // 완료된 조들을 확인하는 함수 (재사용 가능하도록 분리)
    const checkCompletedJos = useCallback(async () => {
        if (!selectedGroup || !selectedCourse || !hole || !allPlayers.length) {
            setCompletedJosState(new Set());
            return;
        }
    
        const groupPlayers = allPlayers.filter(p => p.group === selectedGroup);
        const josInGroup = [...new Set(groupPlayers.map(p => p.jo.toString()))];
        const completed = new Set<string>();
        const dbInstance = db as import('firebase/database').Database;

        for (const joNum of josInGroup) {
            const playersInThisJo = groupPlayers.filter(p => p.jo.toString() === joNum);

            if (playersInThisJo.length === 0) continue;

            let allInJoAreScored = true;
            
            for (const player of playersInThisJo) {
                try {
                    // Firebase에서 직접 확인 (더 정확한 데이터를 위해)
                    const playerHoleRef = ref(dbInstance, `scores/${player.id}/${selectedCourse}/${hole}`);
                    const snapshot = await get(playerHoleRef);
                    const hasScore = snapshot.val() !== undefined && snapshot.val() !== null;
                    
                    if (!hasScore) {
                        allInJoAreScored = false;
                        break;
                    }
                } catch (error) {
                    console.warn(`선수 ${player.id} 점수 확인 실패:`, error);
                    allInJoAreScored = false;
                    break;
                }
            }
            
            if (allInJoAreScored) {
                completed.add(joNum);
            }
        }
        
        setCompletedJosState(completed);
    }, [selectedGroup, selectedCourse, hole, allPlayers]);

    // 완료된 조들을 확인하는 useEffect
    useEffect(() => {
        checkCompletedJos();
    }, [checkCompletedJos]);

    // completedJos는 이제 단순히 상태를 반환
    const completedJos = completedJosState;

    const isCourseCompleteForThisHole = useMemo(() => {
        if (!selectedCourse || !hole || !allPlayers.length || !Object.keys(groupsData).length) {
            return false;
        }

        // 현재 그룹의 모든 조가 완료되었는지 확인
        const groupPlayers = allPlayers.filter(p => p.group === selectedGroup);
        const josInGroup = [...new Set(groupPlayers.map(p => p.jo.toString()))];
        
        // 모든 조가 완료되었으면 코스 완료
        return josInGroup.length > 0 && josInGroup.every(jo => completedJosState.has(jo));

    }, [selectedCourse, hole, allPlayers, selectedGroup, completedJosState]);

    const hasUnsavedChanges = useMemo(() => {
        return Object.values(scores).some(s => s.status === 'editing');
    }, [scores]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = ''; // Required for most browsers
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [hasUnsavedChanges]);


    const getLocalStorageScoresKey = () => {
        if (!hole || !selectedGroup || !selectedCourse || !selectedJo) return null;
        return `refereeScores_${hole}_${selectedGroup}_${selectedCourse}_${selectedJo}`;
    }

    // Save interim scores to localStorage
    useEffect(() => {
        const key = getLocalStorageScoresKey();
        if (key && view === 'scoring' && Object.keys(scores).length > 0) {
            const scoresToSave = Object.entries(scores).reduce((acc, [playerId, data]) => {
                if (data.status === 'editing') {
                    acc[playerId] = data;
                }
                return acc;
            }, {} as {[key: string]: ScoreData});
            if (Object.keys(scoresToSave).length > 0) {
                localStorage.setItem(key, JSON.stringify(scoresToSave));
            } else {
                localStorage.removeItem(key);
            }
        }
    }, [scores, hole, selectedGroup, selectedCourse, selectedJo, view]);

    // Initialize or sync the scores state.
    useEffect(() => {
        if (view !== 'scoring' || !selectedJo || !currentPlayers.length) {
            setScores({});
            return;
        }

        const storageKey = getLocalStorageScoresKey();
        const savedInterimScores = storageKey ? JSON.parse(localStorage.getItem(storageKey) || '{}') : {};

        const initializeScores = async () => {
            const newScoresState: { [key: string]: ScoreData } = {};
            
            for (const player of currentPlayers) {
                // 먼저 Firebase에서 직접 확인 (allScores가 불완전할 수 있음)
                let existingScoreFromDb = allScores[player.id]?.[selectedCourse as string]?.[hole as string];
                
                // allScores에 없으면 Firebase에서 직접 확인
                if (existingScoreFromDb === undefined) {
                    try {
                        const dbInstance = db as import('firebase/database').Database;
                        const playerHoleRef = ref(dbInstance, `scores/${player.id}/${selectedCourse}/${hole}`);
                        const snapshot = await get(playerHoleRef);
                        existingScoreFromDb = snapshot.val();
                    } catch (error) {
                        console.warn(`선수 ${player.id} 점수 직접 확인 실패:`, error);
                    }
                }
                
                if (existingScoreFromDb !== undefined && existingScoreFromDb !== null) {
                    // 저장된 점수가 있으면 잠금 상태로 설정
                    let forfeitType: 'absent' | 'disqualified' | 'forfeit' | null = null;
                    if (Number(existingScoreFromDb) === 0) {
                        forfeitType = await getForfeitTypeFromLogs(player.id, selectedCourse as string, hole as string);
                    }
                    
                    newScoresState[player.id] = { 
                        score: Number(existingScoreFromDb), 
                        status: 'locked',
                        forfeitType: forfeitType
                    };
                } else {
                    // 저장된 점수가 없으면 편집 상태로 설정
                    const interimScore = savedInterimScores[player.id];
                    if (interimScore && interimScore.status === 'editing') {
                        newScoresState[player.id] = { 
                            score: Number(interimScore.score), 
                            status: 'editing',
                            forfeitType: interimScore.forfeitType || null
                        };
                    } else {
                        newScoresState[player.id] = { score: 1, status: 'editing', forfeitType: null };
                    }
                }
            }
            
            setScores(newScoresState);
        };
        
        initializeScores();
        
    }, [view, selectedJo, selectedCourse, hole, allScores, currentPlayers]);

    // allScores 변경 시 실격 복구를 위한 scores 상태 업데이트
    useEffect(() => {
        if (view !== 'scoring' || !selectedJo || !currentPlayers.length || Object.keys(scores).length === 0) {
            return;
        }


        
        // 현재 선수들의 실격 복구 체크
        currentPlayers.forEach(player => {
            const currentScoreState = scores[player.id];
            const firebaseScore = allScores[player.id]?.[selectedCourse as string]?.[hole as string];
            
            // 실격 복구 감지: scores에서는 0점이지만 Firebase에서는 0이 아닌 점수
            if (currentScoreState && 
                currentScoreState.score === 0 && 
                firebaseScore !== undefined && 
                Number(firebaseScore) > 0) {
                

                
                setScores(prev => ({
                    ...prev,
                    [player.id]: {
                        score: Number(firebaseScore),
                        status: 'editing',
                        forfeitType: null
                    }
                }));
            }
        });
    }, [allScores, view, selectedJo, selectedCourse, hole, currentPlayers, scores]);


    // ---- Handlers ----
    const handleStartScoring = () => {
        if (selectedGroup && selectedCourse && selectedJo) {
            setView('scoring');
        }
    };
    
    const handleBackToSelectionClick = () => {
        setView('selection');
        setSelectedGroup('');
        setSelectedCourse('');
        setSelectedJo('');
    };

    const updateScore = (id: string, delta: number) => {
        if (scores[id]?.status === 'editing') {
            const currentScore = scores[id].score;
            const newScore = Math.max(0, currentScore + delta);
            
            // 0점이 되었을 때 기권 타입 순환 처리
            let newForfeitType = scores[id].forfeitType;
            if (newScore === 0 && currentScore > 0) {
                // 처음 0점이 되면 '불참'
                newForfeitType = 'absent';
            } else if (newScore === 0 && currentScore === 0) {
                // 0점 상태에서 -버튼 누르면 순환
                if (scores[id].forfeitType === 'absent') {
                    newForfeitType = 'disqualified';
                } else if (scores[id].forfeitType === 'disqualified') {
                    newForfeitType = 'forfeit';
                } else if (scores[id].forfeitType === 'forfeit') {
                    newForfeitType = 'absent'; // 다시 처음으로 순환
                } else {
                    newForfeitType = 'absent'; // 기본값
                }
            } else if (newScore > 0) {
                // 점수가 0보다 크면 기권 타입 초기화
                newForfeitType = null;
            }
            
            setScores(prev => ({
                ...prev,
                [id]: { 
                    ...prev[id], 
                    score: newScore,
                    forfeitType: newForfeitType
                }
            }));
        }
    };

    const handleSavePress = (player: Player) => {
        const scoreData = scores[player.id];
        if (!scoreData || scoreData.status !== 'editing') return;
        setPlayerToSave(player);
    };

    const handleConfirmSave = async () => {
        if (!playerToSave) return;
        const scoreData = scores[playerToSave.id];
        if (!scoreData || scoreData.status !== 'editing') return;
        
        try {
            // Firebase 인증 확인
            const isAuthenticated = await ensureAuthenticated();
            if (!isAuthenticated) {
                toast({ 
                    title: "인증 실패", 
                    description: "Firebase 인증에 실패했습니다. 페이지를 새로고침하고 다시 시도해주세요.",
                    variant: "destructive" 
                });
                return;
            }
            
            // 모바일 환경 감지 및 Firebase 인증 재시도 로직
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const maxRetries = isMobile ? 3 : 1;
            let attempt = 0;
            
            while (attempt < maxRetries) {
                try {
                    const dbInstance = db as import('firebase/database').Database;
                    const scoreRef = ref(dbInstance, `/scores/${playerToSave.id}/${selectedCourse}/${hole}`);
                    const prevScore = allScores[playerToSave.id]?.[selectedCourse as string]?.[hole as string] ?? null;
                    
                    // 모바일에서는 잠시 대기 후 재시도
                    if (isMobile && attempt > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                    
                    await set(scoreRef, scoreData.score);
                    
                    // 점수 변경 로그 기록
                    if (prevScore !== scoreData.score) {
                        await logScoreChange({
                            matchId: 'tournaments/current',
                            playerId: playerToSave.id,
                            scoreType: 'holeScore',
                            holeNumber: Number(hole),
                            oldValue: prevScore !== null && prevScore !== undefined ? prevScore : 0,
                            newValue: scoreData.score !== null && scoreData.score !== undefined ? scoreData.score : 0,
                            modifiedBy: 'referee', // 필요시 실제 심판 id로 대체
                            modifiedByType: 'judge',
                            comment: `코스: ${selectedCourse}`,
                            courseId: selectedCourse
                        });
                    }
                    
                    // 0점 입력 시, 소속 그룹의 모든 코스/홀에 0점 처리
                    if (scoreData.score === 0) {
                        // 대량 0 입력 전에 선수 점수 백업 저장(1회성)
                        try {
                            const playerScoresSnap = await get(ref(db as import('firebase/database').Database, `/scores/${playerToSave.id}`));
                            if (playerScoresSnap.exists()) {
                                const backupRef = ref(db as import('firebase/database').Database, `backups/scoresBeforeForfeit/${playerToSave.id}`);
                                const backupSnap = await get(backupRef);
                                if (!backupSnap.exists()) {
                                    await set(backupRef, { data: playerScoresSnap.val(), createdAt: Date.now() });
                                }
                            }
                        } catch (e) {
                            console.warn('심판페이지 백업 저장 실패(무시):', e);
                        }

                        // 그룹 정보에서 배정된 코스 id 목록 추출
                        const group = groupsData[playerToSave.group];
                        const assignedCourseIds = group && group.courses ? Object.keys(group.courses).filter((cid: any) => group.courses[cid]) : [];
                        for (const cid of assignedCourseIds) {
                            const courseObj = courses.find((c: any) => c.id.toString() === cid.toString());
                            const courseName = courseObj ? courseObj.name : cid;
                            for (let h = 1; h <= 9; h++) {
                                const existing = allScores[playerToSave.id]?.[cid]?.[h.toString()];
                                if (cid === selectedCourse && h === Number(hole)) {
                                    // 직접 입력한 코스/홀
                                    await set(ref(dbInstance, `/scores/${playerToSave.id}/${cid}/${h}`), 0);
                                    await logScoreChange({
                                        matchId: 'tournaments/current',
                                        playerId: playerToSave.id,
                                        scoreType: 'holeScore',
                                        holeNumber: h,
                                        oldValue: existing === undefined || existing === null || existing === '' || isNaN(Number(existing)) ? 0 : Number(existing),
                                        newValue: 0,
                                        modifiedBy: 'referee',
                                        modifiedByType: 'judge',
                                        comment: `심판 직접 ${scoreData.forfeitType === 'absent' ? '불참' : scoreData.forfeitType === 'disqualified' ? '실격' : '기권'} (코스: ${courseName}, 홀: ${h})`,
                                        courseId: cid
                                    });
                                } else if (existing === undefined || existing === null || existing === '' || isNaN(Number(existing))) {
                                    // 나머지 미입력 홀만 0점 처리 (기존 점수는 보존)
                                    await set(ref(dbInstance, `/scores/${playerToSave.id}/${cid}/${h}`), 0);
                                    await logScoreChange({
                                        matchId: 'tournaments/current',
                                        playerId: playerToSave.id,
                                        scoreType: 'holeScore',
                                        holeNumber: h,
                                        oldValue: existing === undefined || existing === null || existing === '' || isNaN(Number(existing)) ? 0 : Number(existing),
                                        newValue: 0,
                                        modifiedBy: 'referee',
                                        modifiedByType: 'judge',
                                        comment: `심판페이지에서 ${scoreData.forfeitType === 'absent' ? '불참' : scoreData.forfeitType === 'disqualified' ? '실격' : '기권'} 처리 (코스: ${courseName}, 홀: ${h})`,
                                        courseId: cid
                                    });
                                }
                                // 기존 점수가 있는 홀은 그대로 보존 (0점으로 덮어쓰지 않음)
                            }
                        }
                    }
                    
                    // 0점 처리 후에는 refreshScoresData()가 호출되므로 별도 캐시 무효화 불필요
                    
                    // 성공하면 루프 종료
                    break;
                    
                } catch (e: any) {
                    attempt++;
                    
                    // Permission denied 오류이고 재시도 가능한 경우 (다양한 오류 형태 대응)
                    const isPermissionError = e?.code === 'PERMISSION_DENIED' || 
                                             e?.message?.includes('permission_denied') ||
                                             e?.message?.includes('Permission denied');
                    
                    if (isPermissionError && attempt < maxRetries && isMobile) {
                        continue;
                    }
                    
                    // 최종 실패 또는 다른 오류
                    const errorMsg = e?.code === 'PERMISSION_DENIED' 
                      ? '점수 저장 권한이 없습니다. 페이지를 새로고침하고 다시 로그인해주세요.'
                      : (e?.message || "점수 저장에 실패했습니다.");
                    
                    toast({ 
                      title: "저장 실패", 
                      description: errorMsg,
                      variant: "destructive" 
                    });
                    return;
                }
            }
            
                                // 성공 토스트 메시지
                    toast({ 
                        title: '저장 완료', 
                        description: '점수가 저장되었습니다.',
                        duration: 1000
                    });
                    
                    // 성공 후 상태 업데이트
                    setScores(prev => ({
                        ...prev,
                        [playerToSave.id]: { ...prev[playerToSave.id], status: 'locked' }
                    }));
                    
                    // 캐시 업데이트 - 점수 데이터 갱신
                    if (dataCache.current.scores[selectedCourse]) {
                        if (!dataCache.current.scores[selectedCourse][playerToSave.id]) {
                            dataCache.current.scores[selectedCourse][playerToSave.id] = {};
                        }
                        dataCache.current.scores[selectedCourse][playerToSave.id][selectedCourse] = {
                            ...dataCache.current.scores[selectedCourse][playerToSave.id][selectedCourse],
                            [hole]: scoreData.score
                        };
                        dataCache.current.lastUpdated[`scores_${selectedCourse}`] = Date.now();
                    }

                    // 점수 저장 후 완료된 조 상태 즉시 업데이트
                    setTimeout(() => {
                        checkCompletedJos();
                    }, 500); // Firebase 동기화를 위한 약간의 지연
            
        } catch (error) {
            console.error('점수 저장 중 오류:', error);
            toast({ 
                title: '저장 실패', 
                description: '점수 저장 중 오류가 발생했습니다.',
                variant: 'destructive' 
            });
        } finally {
            setPlayerToSave(null);
        }
    };
    
    const handleUnlockRequest = (player: Player) => {
        if (scores[player.id]?.status === 'locked') {
            setPlayerToUnlock(player);
            setIsUnlockModalOpen(true);
        }
    };

    const handleConfirmUnlock = () => {
        if (!playerToUnlock || !unlockPasswordFromDb) {
            toast({ title: '오류', description: '잠금 해제 비밀번호가 설정되지 않았습니다.', variant: 'destructive' });
            return;
        }

        if (unlockPasswordInput === unlockPasswordFromDb) {
            setScores(prev => ({
                ...prev,
                [playerToUnlock.id]: { ...prev[playerToUnlock.id], status: 'editing' }
            }));
            toast({ title: '성공', description: '잠금이 해제되었습니다. 점수를 수정하세요.' });
            setIsUnlockModalOpen(false);
            setUnlockPasswordInput('');
            setPlayerToUnlock(null);
        } else {
            toast({ title: '오류', description: '비밀번호가 올바르지 않습니다.', variant: 'destructive' });
            setUnlockPasswordInput('');
        }
    };


    const getPlayerName = (player: Player) => player.type === 'team' ? `${player.p1_name}/${player.p2_name}` : player.name;
    const selectedCourseName = useMemo(() => courses.find(c => c.id.toString() === selectedCourse)?.name || '', [courses, selectedCourse]);
    
    // 기권 타입에 따른 표시 텍스트 반환 함수
    const getForfeitDisplayText = (forfeitType: string | null | undefined) => {
        switch (forfeitType) {
            case 'absent': return '불참';
            case 'disqualified': return '실격';
            case 'forfeit': return '기권';
            default: return '기권';
        }
    };
    
    // 로그에서 기권 타입을 추출하는 함수
    const getForfeitTypeFromLogs = async (playerId: string, courseId: string, holeNumber: string) => {
        try {
            const { getPlayerScoreLogs } = await import('@/lib/scoreLogs');
            const logs = await getPlayerScoreLogs(playerId);
            
            // 해당 홀의 기권 처리 로그 찾기
            const forfeitLogs = logs
                .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment)
                .filter(l => l.comment?.includes(`코스: ${courseId}`) || l.comment?.includes(`홀: ${holeNumber}`))
                .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬
            
            if (forfeitLogs.length > 0) {
                const latestLog = forfeitLogs[0];
                if (latestLog.comment?.includes('불참')) return 'absent';
                if (latestLog.comment?.includes('실격')) return 'disqualified';
                if (latestLog.comment?.includes('기권')) return 'forfeit';
            }
            return null;
        } catch (error) {
            console.error('로그에서 기권 타입 추출 실패:', error);
            return null;
        }
    };
    
    if (loading) {
        return (
             <div className="bg-slate-50 min-h-screen p-2 sm:p-4 flex flex-col font-body">
                <header className="text-center mb-4">
                    <h1 className="text-3xl font-extrabold text-primary break-keep leading-tight">{hole}번홀 심판</h1>
                </header>
                <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-48 w-full" />
                </div>
            </div>
        )
    }

    const renderSelectionScreen = () => {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">심사 조 선택</CardTitle>
                    <CardDescription className="text-sm">점수를 기록할 경기 형태, 그룹, 코스, 조를 선택하세요.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Select value={selectedType as string} onValueChange={v => {
                        const val = (v || '').toString();
                        if (val === 'individual' || val === 'team') {
                            setSelectedType(val);
                        } else {
                            setSelectedType('');
                        }
                        setSelectedGroup(''); setSelectedCourse(''); setSelectedJo('');
                    }}>
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder="1. 경기 형태 선택" /></SelectTrigger>
                        <SelectContent position="item-aligned">
                            <SelectItem value="individual" className="text-base">개인전</SelectItem>
                            <SelectItem value="team" className="text-base">2인1팀</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select
                      value={selectedGroup}
                      onValueChange={v => {
                        setSelectedGroup((v ?? '') as string);
                        setSelectedCourse('');
                        setSelectedJo('');
                      }}
                    >
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder={selectedType === '' ? "경기 형태 먼저 선택" : "2. 그룹 선택"} /></SelectTrigger>
                        <SelectContent position="item-aligned">
                            {availableGroups.map(g => <SelectItem key={g} value={g.toString()} className="text-base">{g}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={selectedCourse || ''} onValueChange={v => {setSelectedCourse((v || '').toString()); setSelectedJo('');}} disabled={!selectedGroup || availableCoursesForGroup.length === 0}>
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder={selectedGroup === '' ? "그룹 먼저 선택" : (availableCoursesForGroup.length === 0 ? "배정된 코스 없음" : "3. 코스 선택")} /></SelectTrigger>
                        <SelectContent position="item-aligned">
                            {availableCoursesForGroup.map(c => <SelectItem key={c.id} value={c.id.toString()} className="text-base">{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={selectedJo || ''} onValueChange={v => setSelectedJo((v || '').toString())} disabled={!selectedCourse || availableJos.length === 0}>
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder={selectedCourse === '' ? "코스 먼저 선택" : (availableJos.length === 0 ? "배정된 선수 없음" : "4. 조 선택")} /></SelectTrigger>
                        <SelectContent position="item-aligned">
                            {availableJos.map(jo => {
                                const isCompleted = completedJosState.has(jo);
                                return (
                                    <SelectItem key={jo} value={jo}>
                                        <div className="flex items-center justify-between w-full">
                                            <span>{jo}조</span>
                                            {isCompleted && <Lock className="h-4 w-4 text-muted-foreground" />}
                                        </div>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>

                    {/* 조 선택 후 선수 명단 표시 */}
                    {selectedJo && currentPlayers.length > 0 && (
                        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <h3 className="text-lg font-bold text-blue-800 mb-3">
                                {selectedJo}조 선수 명단
                            </h3>
                            <div className="space-y-2">
                                {currentPlayers.map((player, index) => (
                                    <div key={player.id} className="flex items-center p-2 bg-white rounded border">
                                        <span className="w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center font-bold text-sm mr-3">
                                            {index + 1}
                                        </span>
                                        <div className="flex-1">
                                            {player.type === 'team' ? (
                                                <div className="text-base font-semibold">
                                                    <div>{player.p1_name}</div>
                                                    <div>{player.p2_name}</div>
                                                </div>
                                            ) : (
                                                <div className="text-base font-semibold">{player.name}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 조 선택했지만 선수가 없을 때 */}
                    {selectedJo && currentPlayers.length === 0 && allPlayers.length > 0 && (
                        <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                            <div className="text-yellow-800 font-semibold">
                                ⚠️ {selectedJo}조에 등록된 선수가 없습니다
                            </div>
                            <div className="text-yellow-600 text-sm mt-1">
                                다른 조를 선택해주세요.
                            </div>
                        </div>
                    )}


                </CardContent>
                <CardFooter className="flex-col gap-2">
                     <Button className="w-full h-14 text-xl font-bold" onClick={handleStartScoring} disabled={!selectedJo || currentPlayers.length === 0}>점수기록 시작</Button>
                </CardFooter>
            </Card>
        );
    }

    const renderScoringScreen = () => {
        return (
            <div className="flex-1 flex flex-col space-y-3">
                {isCourseCompleteForThisHole && (
                    <Card className="border-green-400 bg-green-50 text-green-900 mt-4">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-2xl">
                                <Trophy className="h-8 w-8 text-yellow-500" />
                                {selectedCourseName} 심사 완료!
                            </CardTitle>
                            <CardDescription className="text-green-800 pt-2 text-base">
                                이 홀의 모든 조 점수 입력이 완료되었습니다. 수고하셨습니다!
                            </CardDescription>
                        </CardHeader>
                    </Card>
                )}

                {currentPlayers.map(player => {
                    const scoreData = scores[player.id];
                    if (!scoreData) return null;

                    // 기권 여부: 이전 홀 중 0점이 하나라도 있으면 true
                    const currentHoleNum = Number(hole);
                    let isForfeited = false;
                    if (allScores[player.id] && allScores[player.id][selectedCourse as string]) {
                        for (let h = 1; h < currentHoleNum; h++) {
                            const prevScore = allScores[player.id]?.[selectedCourse as string]?.[h.toString()];
                            if (prevScore === 0) {
                                isForfeited = true;
                                break;
                            }
                        }
                    }

                    const isLocked = scoreData.status === 'locked' || isForfeited;
                    const isZeroScore = scoreData.score === 0;
                    const forfeitText = isZeroScore ? getForfeitDisplayText(scoreData.forfeitType || null) : '';

                    return (
                        <Card key={player.id} className="overflow-hidden">
                            <CardContent className="p-2" onDoubleClick={isLocked && !isForfeited ? () => handleUnlockRequest(player) : undefined}>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        {player.type === 'team' ? (
                                            <div>
                                                <p className="font-semibold text-xl break-words leading-tight">{player.p1_name}</p>
                                                <p className="font-semibold text-xl break-words leading-tight">{player.p2_name}</p>
                                            </div>
                                        ) : (
                                            <p className="font-semibold text-xl break-words leading-tight">{player.name}</p>
                                        )}
                                    </div>
                                    <div className="flex-shrink-0 flex items-center gap-1.5">
                                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-md" onClick={() => updateScore(player.id, -1)} disabled={isLocked}>
                                            <Minus className="h-5 w-5" />
                                        </Button>
                                        <span className={isZeroScore ? "text-xs font-bold w-12 text-center text-red-600" : "text-3xl font-bold tabular-nums w-12 text-center"}>
                                            {isZeroScore ? forfeitText : scoreData.score}
                                        </span>
                                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-md" onClick={() => updateScore(player.id, 1)} disabled={isLocked}>
                                            <Plus className="h-5 w-5" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            className={cn("h-10 w-10 rounded-md", {
                                                'bg-muted hover:bg-muted cursor-not-allowed': isLocked,
                                            })}
                                            onClick={() => {
                                                if (isLocked) return;
                                                handleSavePress(player);
                                            }}
                                            disabled={isLocked}
                                        >
                                            {isLocked ? <Lock className="h-5 w-5 text-green-500" /> : <Save className="h-5 w-5" />}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
                {/* 다음 조로 이동 버튼 추가 */}
                <Button
                    className="w-full h-14 text-xl font-bold mt-6 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => handleNextGroup()}
                >
                    다음 조로 이동
                </Button>
            </div>
        );
    }

    return (
        <>
            <div className="bg-slate-50 min-h-screen p-2 sm:p-4 flex flex-col font-body">
                 <header className="flex justify-between items-center mb-4">
                     <h1 className="text-2xl sm:text-3xl font-extrabold text-primary break-keep leading-tight">
                         {refereeData?.id || `${hole}번홀 심판`}
                     </h1>
                     <div className="flex gap-2 items-center">
                         {view === 'scoring' && (
                             <Button variant="outline" onClick={handleBackToSelectionClick} className="h-9 text-base sm:text-lg font-bold flex-shrink-0">
                                 <ArrowLeft className="mr-1 sm:mr-2 h-4 w-4" />
                                 그룹/코스 변경
                             </Button>
                         )}
                         {view === 'selection' && (
                             <Button variant="destructive" onClick={() => {
                                 // 세션/로컬스토리지 정리 및 심판 로그인 페이지로 이동
                                 if (typeof window !== 'undefined') {
                                     localStorage.clear();
                                     sessionStorage.clear();
                                     router.replace('/referee/login');
                                 }
                             }} className="h-9 text-base sm:text-lg font-bold flex-shrink-0 ml-2">로그아웃</Button>
                         )}
                     </div>
                 </header>

                <div className="flex-1 flex flex-col space-y-4">
                    {view === 'scoring' && (
                       <Card>
                            <CardHeader className="p-3 space-y-2">
                                <div className="text-xl sm:text-2xl font-extrabold text-center text-foreground break-words flex items-center justify-center gap-3">
                                    <div>
                                        <span>{selectedGroup}</span>
                                        <span className="mx-1">/</span>
                                        <span>{selectedCourseName}</span>
                                    </div>

                                    <QRCodeViewer 
                                        group={selectedGroup} 
                                        jo={selectedJo} 
                                        courseName={selectedCourseName} 
                                    />
                                </div>
                                <Select value={selectedJo} onValueChange={setSelectedJo}>
                                    <SelectTrigger className="w-full h-12 text-lg font-bold">
                                        <SelectValue placeholder="조 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableJos.map(jo => {
                                            const isCompleted = completedJosState.has(jo);
                                            return (
                                                <SelectItem key={jo} value={jo}>
                                                    <div className="flex items-center justify-between w-full gap-4">
                                                        <span>{jo}조</span>
                                                        {isCompleted && <Lock className="h-4 w-4 text-muted-foreground" />}
                                                    </div>
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </CardHeader>
                        </Card>
                    )}

                    {view === 'selection' ? renderSelectionScreen() : renderScoringScreen()}
                </div>
            </div>
            
            <AlertDialog open={!!playerToSave} onOpenChange={(open) => !open && setPlayerToSave(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-bold text-center break-words leading-tight" style={{ fontSize: '1.7rem', lineHeight: '2.0rem' }}>
                            {playerToSave ? getPlayerName(playerToSave) : ''}
                        </AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="flex flex-col items-center justify-center p-0 text-center">
                        {playerToSave && scores[playerToSave.id] && (
                             <div className="flex items-baseline my-6">
                                <span className="font-extrabold text-destructive leading-none" style={{ fontSize: '7rem', lineHeight: '1' }}>
                                  {scores[playerToSave.id].score === 0 ? getForfeitDisplayText(scores[playerToSave.id].forfeitType || null) : scores[playerToSave.id].score}
                                </span>
                                <span className="font-bold ml-4 text-4xl">{scores[playerToSave.id].score === 0 ? "" : "점"}</span>
                            </div>
                        )}
                        
                        <AlertDialogDescription className="text-xs font-semibold mt-2 text-muted-foreground">
                            저장하시겠습니까?
                        </AlertDialogDescription>
                    </div>
                    <AlertDialogFooter className="grid grid-cols-2 gap-2 pt-4">
                        <AlertDialogCancel onClick={() => setPlayerToSave(null)} className="h-11 px-6 text-sm mt-0">취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmSave} className="h-11 px-6 text-sm">확인</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <AlertDialog open={isUnlockModalOpen} onOpenChange={setIsUnlockModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>점수 잠금 해제</AlertDialogTitle>
                        <AlertDialogDescription>
                            이 점수는 이미 저장되어 잠겨있습니다. 수정하려면 관리자가 설정한 잠금 해제 비밀번호를 입력하세요.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2 py-2">
                        <Label htmlFor="unlock-password-input">비밀번호</Label>
                        <Input
                            id="unlock-password-input"
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={unlockPasswordInput}
                            onChange={e => setUnlockPasswordInput(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmUnlock()}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setUnlockPasswordInput('')}>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmUnlock}>확인</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        {/* 나가기 경고 다이얼로그 */}
        <AlertDialog open={showLeaveConfirm} onOpenChange={(open) => { if (!open) cancelLeave(); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>심판중인 페이지에서 나가겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>
                        입력 중인 점수가 저장되지 않을 수 있습니다.<br />정말 나가시겠습니까?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={cancelLeave}>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmLeave}>확인</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        {showUnsavedModal && (
    <AlertDialog open={showUnsavedModal} onOpenChange={setShowUnsavedModal}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle className="text-xl font-bold text-destructive flex items-center gap-2">
                    <span>⚠️</span> 점수 저장이 안된 선수가 있습니다
                </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="py-2">
                {unsavedPlayers.map(p => (
                    <div key={p.id} className="font-bold text-red-600 text-lg mb-1 break-words leading-tight">
                      {getPlayerName(p)}<span className="ml-1 text-gray-700">의 점수를 저장하고 이동하세요</span>
                    </div>
                ))}
                <div className="mt-2 text-base text-yellow-700 font-semibold">
                    만약 기권자가 있으면 기권(점수0)으로 저장해 주세요
                </div>
            </div>
            <AlertDialogFooter>
                <AlertDialogAction onClick={() => setShowUnsavedModal(false)} className="bg-blue-600 hover:bg-blue-700 text-white">확인</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
)}
        {/* 모든 조 입력 완료 안내 모달 */}
        {showAllJosCompleteModal && (
    <AlertDialog open={showAllJosCompleteModal} onOpenChange={setShowAllJosCompleteModal}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle className="text-xl font-bold text-green-700 flex items-center gap-2">
                    <span>🎉</span> 이 그룹의 모든 조의 점수가 입력되었습니다
                </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="py-2 text-lg text-center text-green-800 font-semibold">
                수고하셨습니다!
            </div>
            <AlertDialogFooter>
                <AlertDialogAction onClick={() => setShowAllJosCompleteModal(false)} className="bg-green-600 hover:bg-green-700 text-white">확인</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
)}
        </>
    );
}
