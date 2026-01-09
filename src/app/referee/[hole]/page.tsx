
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
import { cn, safeSessionStorageGetItem, safeSessionStorageSetItem, safeSessionStorageClear, safeLocalStorageGetItem, safeLocalStorageSetItem, safeLocalStorageRemoveItem, safeLocalStorageClear } from '@/lib/utils';
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
interface Course { id: number; name: string; isActive: boolean; }
interface ScoreData {
    score: number;
    status: 'editing' | 'locked';
    forfeitType?: 'absent' | 'disqualified' | 'forfeit' | null; // 추가: 기권 타입
    wasLocked?: boolean; // 원래 잠금 상태였는지 추적 (수정 시 불참 제외용)
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
    const [tournamentCourses, setTournamentCourses] = useState<any[]>([]);

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
    const [pendingBackType, setPendingBackType] = useState<'button' | 'popstate' | null>(null);

    // leave confirm용 함수 (JSX에서 참조)
    // 조 선택 화면으로 돌아갈 때 그룹과 코스는 유지하고 조만 리셋
    const confirmLeave = () => {
        setShowLeaveConfirm(false);
        setPendingBackType(null);

        if (view === 'scoring') {
            setView('selection');
            // 그룹과 코스는 유지하여 완료된 조 체크 표시가 보이도록 함
            setSelectedJo('');
        } else {
            // 선택 화면에서 나가기를 확인하면 로그아웃/이탈 처리
            if (typeof window !== 'undefined') {
                // 뒤로가기 모달에서 확인을 눌렀으므로 나감
                // safeLocalStorageClear(); // 선택 사항: 편의를 위해 유지할지? 로그아웃 버튼과 동일하게 하려면 clear
                // safeSessionStorageClear();
                router.replace('/referee/login');
            }
        }
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



    // 로그인 상태 확인 및 Firebase 인증 (강화된 로직)
    useEffect(() => {
        let mounted = true;
        let retryCount = 0;
        const maxRetries = 5;

        const loadRefereeData = () => {
            // 1. URL 파라미터에서 데이터 확인 (최우선)
            const urlParams = new URLSearchParams(window.location.search);
            const refereeDataFromUrl = urlParams.get('refereeData');

            if (refereeDataFromUrl) {
                try {
                    const referee = JSON.parse(decodeURIComponent(refereeDataFromUrl));

                    // sessionStorage에 저장 시도 (여러 번 재시도)
                    let saved = false;
                    for (let i = 0; i < maxRetries; i++) {
                        try {
                            safeSessionStorageSetItem('refereeData', JSON.stringify(referee));
                            saved = true;
                            break;
                        } catch (e) {
                            console.warn(`sessionStorage 저장 시도 ${i + 1}/${maxRetries} 실패, 재시도...`);
                            if (i < maxRetries - 1) {
                                setTimeout(() => { }, 100 * (i + 1));
                            }
                        }
                    }

                    if (!saved) {
                        console.warn('⚠️ sessionStorage 저장 실패, URL 파라미터로만 사용');
                    }

                    // URL에서 파라미터 제거
                    window.history.replaceState({}, '', window.location.pathname);

                    if (mounted) {
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
                    }
                    return;
                } catch (error) {
                    console.error('❌ URL 파라미터 데이터 파싱 오류:', error);
                }
            }

            // refereeData 처리 함수 (공통)
            const processRefereeData = (data: string) => {
                try {
                    const referee = JSON.parse(data);

                    if (mounted) {
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
                    }
                } catch (error) {
                    console.error('❌ 심판 데이터 파싱 오류:', error);
                    if (mounted) {
                        router.push('/referee/login');
                    }
                }
            };

            // 2. sessionStorage에서 데이터 확인 (여러 번 재시도)
            const tryLoadFromStorage = (attempt: number): void => {
                if (attempt >= maxRetries) {
                    console.error('❌ refereeData를 찾을 수 없음 (최대 재시도 횟수 초과) - 로그인 페이지로 이동');
                    if (mounted) {
                        router.push('/referee/login');
                    }
                    return;
                }

                try {
                    const loggedInReferee = safeSessionStorageGetItem('refereeData');
                    if (loggedInReferee) {
                        processRefereeData(loggedInReferee);
                        return;
                    }
                } catch (e) {
                    console.warn(`sessionStorage 읽기 시도 ${attempt + 1}/${maxRetries} 실패`);
                }

                // 다음 시도 전 대기
                setTimeout(() => {
                    if (mounted) {
                        tryLoadFromStorage(attempt + 1);
                    }
                }, 100 * (attempt + 1));
            };

            tryLoadFromStorage(0);
        };

        loadRefereeData();

        return () => {
            mounted = false;
        };
    }, [hole, router]);

    // 대회 코스 정보 불러오기
    useEffect(() => {
        if (!db) return;
        const tournamentRef = ref(db, 'tournaments/current');

        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val();
            if (data?.courses) {
                const selectedCourses = Object.values(data.courses)
                    .map((course: any) => ({
                        ...course,
                        order: course.order !== undefined ? course.order : 999 // order가 없으면 뒤로
                    }))
                    .sort((a: any, b: any) => (a.order || 999) - (b.order || 999)); // order 기준으로 정렬
                setTournamentCourses(selectedCourses);
                // 초기 로드 완료 시 loading 상태 업데이트
                if (loading) {
                    setLoading(false);
                }
            } else {
                setTournamentCourses([]);
                // 데이터가 없어도 로딩 완료로 처리
                if (loading) {
                    setLoading(false);
                }
            }
        });

        return () => {
            unsubTournament();
        };
    }, []);

    // 최적화된 데이터 페칭 - 토너먼트 설정은 한 번만 로드
    useEffect(() => {
        setLoading(true);
        const dbInstance = db as import('firebase/database').Database;

        // 토너먼트 설정은 한 번만 로드 (캐시 확인)
        const loadTournamentData = async () => {
            // Firebase 익명 인증 먼저 수행
            try {
                await ensureAuthenticated();
            } catch (error) {
                console.warn('Firebase 익명 인증 실패 (계속 진행):', error);
            }

            const cacheKey = 'tournament';
            const now = Date.now();
            const cacheAge = now - (dataCache.current.lastUpdated[cacheKey] || 0);

            // 캐시가 30분 이내면 캐시 사용 (토너먼트 설정은 거의 바뀌지 않음)
            if (dataCache.current.tournament && cacheAge < 30 * 60 * 1000) {
                const cached = dataCache.current.tournament;
                const coursesArray = cached.courses ? Object.values(cached.courses) : [];
                setCourses(coursesArray);

                // tournamentCourses도 함께 업데이트
                if (cached.courses) {
                    const selectedCourses = Object.values(cached.courses)
                        .map((course: any) => ({
                            ...course,
                            order: course.order !== undefined ? course.order : 999
                        }))
                        .sort((a: any, b: any) => (a.order || 999) - (b.order || 999));
                    setTournamentCourses(selectedCourses);
                } else {
                    setTournamentCourses([]);
                }

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
                    // 각 요청을 개별적으로 처리하여 하나가 실패해도 다른 것은 계속 진행
                    let tournamentData = {};
                    let password = '';

                    // 토너먼트 데이터 로드
                    try {
                        const tournamentSnapshot = await get(tournamentRef);
                        tournamentData = tournamentSnapshot.val() || {};
                    } catch (error: any) {
                        console.error('토너먼트 데이터 로드 실패:', error);
                        // 권한 오류인 경우에도 계속 진행 (기본값 사용)
                        if (error.code === 'PERMISSION_DENIED' || error.message?.includes('Permission denied')) {
                            console.warn('토너먼트 데이터 접근 권한이 없습니다. 기본값을 사용합니다.');
                            // 권한 오류 시 재인증 시도
                            try {
                                await ensureAuthenticated();
                                // 재인증 후 재시도
                                const retrySnapshot = await get(tournamentRef);
                                tournamentData = retrySnapshot.val() || {};
                            } catch (retryError) {
                                console.warn('재인증 후 재시도 실패:', retryError);
                            }
                        }
                    }

                    // 비밀번호 데이터 로드 (실패해도 계속 진행)
                    try {
                        const passwordSnapshot = await get(passwordRef);
                        password = passwordSnapshot.val() || '';
                    } catch (error: any) {
                        console.warn('비밀번호 데이터 로드 실패 (무시):', error);
                        // 비밀번호는 선택적이므로 실패해도 계속 진행
                        password = '';
                    }

                    dataCache.current.tournament = tournamentData;
                    dataCache.current.lastUpdated[cacheKey] = Date.now();

                    // courses 설정
                    const coursesArray = tournamentData.courses ? Object.values(tournamentData.courses) : [];
                    setCourses(coursesArray);

                    // tournamentCourses도 함께 업데이트 (assignedCourse 찾기용)
                    if (tournamentData.courses) {
                        const selectedCourses = Object.values(tournamentData.courses)
                            .map((course: any) => ({
                                ...course,
                                order: course.order !== undefined ? course.order : 999
                            }))
                            .sort((a: any, b: any) => (a.order || 999) - (b.order || 999));
                        setTournamentCourses(selectedCourses);
                    } else {
                        setTournamentCourses([]);
                    }

                    setGroupsData(tournamentData.groups || {});
                    setUnlockPasswordFromDb(password);
                    setLoading(false);
                } catch (error) {
                    console.error('토너먼트 데이터 로드 중 예상치 못한 오류:', error);
                    setLoading(false);
                }
            };

            loadTournamentOnce();

            // 구독 해제 함수는 빈 함수로 설정 (한 번만 로드하므로)
            subscriptions.current['tournament'] = () => { };
            subscriptions.current['password'] = () => { };
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
            // 새 배열을 생성하여 React가 상태 변경을 감지하도록 함
            setAllPlayers([...dataCache.current.players[selectedGroup]]);
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
        subscriptions.current['players'] = () => { };

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

                // 함수형 업데이트로 최신 상태 보장 (다른 선수의 점수가 덮어쓰이지 않도록)
                setAllScores(prev => {
                    const updated = { ...prev };
                    if (playerCourseScores) {
                        if (!updated[player.id]) {
                            updated[player.id] = {};
                        }
                        updated[player.id][selectedCourse] = playerCourseScores;
                    } else {
                        // 점수가 없는 경우 빈 객체로 설정
                        if (!updated[player.id]) {
                            updated[player.id] = {};
                        }
                        updated[player.id][selectedCourse] = {};
                    }
                    return updated;
                });
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
            // 모든 뷰에서 뒤로가기 감지
            setPendingBackType('popstate');
            setShowLeaveConfirm(true);
            window.history.pushState(null, '', window.location.href);
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('popstate', onPopState);
            // 모든 뷰에서 history push
            window.history.pushState(null, '', window.location.href);
        }
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('popstate', onPopState);
            }
        };
    }, []); // view 의존성 제거 (마운트 시 한 번만 실행해도 됨, 다만 view 변경 시 history push가 필요할 수도 있음. 하지만 여기서는 모든 뷰 공통이므로 빈 배열도 괜찮음. 단, view 바뀔때마다 pushState하면 stack이 계속 쌓임. 한 번만 하는 게 나을 수 있음. 하지만 view가 바뀌면 '새로운 단계'로 인식될 수 있으니.. 
    // 기존 코드에서는 view가 scoring일 때만 push했음.
    // 이제는 항상 push. 
    // 하지만 view가 바뀔 때마다 listener를 다시 등록할 필요는 없음. 
    // dependency []로 설정하고, 내부에서 pushState는? 
    // 마운트 시 한번만 pushState하면, 사용자가 상호작용 후 뒤로가기 누르면 popstate 발생 -> 모달 -> 취소 -> pushState (다시 유지).
    // 이게 제일 깔끔함.



    // 심판이 담당하는 코스 찾기 (명확하고 확실한 로직)
    const assignedCourse = useMemo(() => {
        // 1. 기본 조건 확인 (refereeData가 아직 로드 중일 수 있으므로 경고만 출력)
        if (!refereeData) {
            // refereeData가 아직 로드되지 않았을 수 있으므로 오류 대신 조용히 null 반환
            return null;
        }

        if (!refereeData.id) {
            console.warn('⚠️ assignedCourse: refereeData.id 없음', refereeData);
            return null;
        }

        // 2. tournamentCourses 우선 사용 (실시간 구독으로 항상 최신)
        const coursesToSearch = tournamentCourses.length > 0 ? tournamentCourses : courses;

        // 3. 코스 데이터가 아직 로드되지 않았을 수 있으므로 로딩 중일 때는 조용히 null 반환
        if (coursesToSearch.length === 0) {
            // 로딩 중이면 조용히 null 반환 (데이터가 아직 로드 중일 수 있음)
            if (loading) {
                return null;
            }
            // 로딩이 완료되었는데도 코스가 없으면 경고 출력
            console.warn('⚠️ assignedCourse: 사용 가능한 코스가 없음 (로딩 완료 후)', {
                tournamentCourses: tournamentCourses.length,
                courses: courses.length,
                loading
            });
            return null;
        }

        // 3. 심판 아이디에서 코스 번호 추출
        // 예: "1번홀심판" -> suffixNumber=0 (첫번째 코스, order=1)
        //     "1번홀심판1" -> suffixNumber=1 (두번째 코스, order=2)
        //     "1번홀심판2" -> suffixNumber=2 (세번째 코스, order=3)
        const match = refereeData.id.match(/(\d+)번홀심판(\d*)/);
        if (!match) {
            console.error('❌ assignedCourse: 심판 아이디 패턴 매칭 실패', refereeData.id);
            return null;
        }

        const suffixNumber = match[2] ? parseInt(match[2]) : 0;
        const targetOrder = suffixNumber === 0 ? 1 : suffixNumber + 1;

        // 4. order 기준으로 정확히 찾기 (가장 확실한 방법)
        let foundCourse = coursesToSearch.find((course: any) => {
            const courseOrder = course.order;
            if (courseOrder !== undefined && courseOrder !== null && typeof courseOrder === 'number' && courseOrder > 0) {
                return courseOrder === targetOrder;
            }
            return false;
        });

        if (foundCourse) {
            return foundCourse;
        }

        // 5. order가 없는 경우 인덱스 방식 (fallback, 하지만 정확도 낮음)
        if (suffixNumber < coursesToSearch.length) {
            foundCourse = coursesToSearch[suffixNumber];
            return foundCourse;
        }

        // 6. 찾지 못함 (fallback 제거 - 잘못된 코스 선택 방지)
        console.error('❌ assignedCourse: 코스를 찾지 못함', {
            refereeId: refereeData.id,
            suffixNumber,
            targetOrder,
            availableCourses: coursesToSearch.length
        });
        return null;
    }, [refereeData, tournamentCourses, courses, loading]);

    // Restore state from localStorage on initial load (assignedCourse와 일치할 때만)
    useEffect(() => {
        // assignedCourse가 로드되지 않았거나 없으면 복원하지 않음
        if (!assignedCourse || loading) {
            return;
        }

        try {
            const savedStateJSON = safeLocalStorageGetItem(`refereeState_${hole}`);
            if (savedStateJSON) {
                const savedState = JSON.parse(savedStateJSON);

                // 저장된 코스가 assignedCourse와 일치하는지 확인
                const savedCourseId = String(savedState.course || '');
                const assignedCourseId = String(assignedCourse.id);

                if (savedCourseId !== assignedCourseId) {
                    // 할당된 코스와 다르면 로컬스토리지 상태 삭제
                    safeLocalStorageRemoveItem(`refereeState_${hole}`);
                    return;
                }

                // 코스가 일치하고 모든 필수 필드가 있으면 복원
                if (savedState.group && savedState.course && savedState.jo && savedState.view === 'scoring') {
                    setSelectedGroup(savedState.group);
                    setSelectedCourse(savedState.course);
                    setSelectedJo(savedState.jo);
                    setView(savedState.view);
                    if (savedState.selectedType) {
                        setSelectedType(savedState.selectedType);
                    }
                } else {
                    // 필수 필드가 없으면 삭제
                    safeLocalStorageRemoveItem(`refereeState_${hole}`);
                }
            }
        } catch (error) {
            console.error("Failed to restore referee state from localStorage", error);
            safeLocalStorageRemoveItem(`refereeState_${hole}`);
        }
    }, [hole, assignedCourse, loading]);

    // Save view state to localStorage (assignedCourse와 일치할 때만)
    useEffect(() => {
        // assignedCourse가 없으면 저장하지 않음
        if (!assignedCourse) {
            return;
        }

        // selectedCourse가 assignedCourse와 일치하는지 확인
        const selectedCourseId = String(selectedCourse || '');
        const assignedCourseId = String(assignedCourse.id);

        if (view === 'scoring' && selectedGroup && selectedCourse && selectedJo) {
            // 코스가 일치할 때만 저장
            if (selectedCourseId === assignedCourseId) {
                const stateToSave = {
                    group: selectedGroup,
                    course: selectedCourse,
                    jo: selectedJo,
                    view: 'scoring',
                    selectedType
                };
                safeLocalStorageSetItem(`refereeState_${hole}`, JSON.stringify(stateToSave));
            } else {
                // 코스가 불일치하면 저장하지 않음 (할당 코스 변경 대비)
                safeLocalStorageRemoveItem(`refereeState_${hole}`);
            }
        } else if (view === 'selection') {
            safeLocalStorageRemoveItem(`refereeState_${hole}`);
        }
    }, [view, selectedGroup, selectedCourse, selectedJo, selectedType, hole, assignedCourse]);

    // 해당 코스가 배정된 경기 형태 찾기 (assignedCourse가 있을 때만)
    const availableTypes = useMemo(() => {
        // assignedCourse가 없으면 빈 배열 반환 (fallback 제거 - 잘못된 타입 선택 방지)
        if (!assignedCourse) {
            return [];
        }

        // groupsData가 아직 로드되지 않았으면 빈 배열 반환
        if (!groupsData || Object.keys(groupsData).length === 0) {
            return [];
        }

        const types = new Set<'individual' | 'team'>();
        const courseIdStr = String(assignedCourse.id);

        Object.values(groupsData).forEach((group: any) => {
            // 코스 배정 확인: boolean true 또는 number > 0
            // 코스 배정 확인: boolean true 또는 number > 0 또는 object { order: >0 }
            const courseAssignment = group.courses && group.courses[courseIdStr];
            let isAssigned = false;

            if (typeof courseAssignment === 'object' && courseAssignment !== null) {
                isAssigned = (courseAssignment.order || 0) > 0;
            } else if (typeof courseAssignment === 'number') {
                isAssigned = courseAssignment > 0;
            } else if (courseAssignment === true) {
                isAssigned = true;
            }

            if (isAssigned) {
                types.add(group.type);
            }
        });

        return Array.from(types);
    }, [assignedCourse, groupsData]);

    // 해당 코스가 배정된 그룹 찾기 (assignedCourse가 있을 때만)
    const availableGroups = useMemo(() => {
        // assignedCourse가 없으면 빈 배열 반환 (fallback 제거 - 잘못된 그룹 선택 방지)
        if (!assignedCourse) {
            return [];
        }

        // groupsData가 아직 로드되지 않았거나, selectedType이 없으면 빈 배열 반환
        if (!groupsData || Object.keys(groupsData).length === 0 || !selectedType) {
            return [];
        }

        const courseIdStr = String(assignedCourse.id);

        const result = Object.values(groupsData)
            .filter((g: any) => {
                // 선택된 경기 형태와 일치하고, 해당 코스가 배정된 그룹만
                const courseAssignment = g.courses && g.courses[courseIdStr];
                let isAssigned = false;

                if (typeof courseAssignment === 'object' && courseAssignment !== null) {
                    isAssigned = (g.courses[courseIdStr].order || 0) > 0;
                } else if (typeof courseAssignment === 'number') {
                    isAssigned = courseAssignment > 0;
                } else if (courseAssignment === true) {
                    isAssigned = true;
                }

                return g.type === selectedType && isAssigned;
            })
            .map((g: any) => g.name)
            .filter(Boolean)
            .sort();

        return result;
    }, [groupsData, selectedType, assignedCourse]);

    const availableCoursesForGroup = useMemo(() => {
        // 심판이 담당하는 코스만 반환
        if (!assignedCourse) return [];
        return [assignedCourse];
    }, [assignedCourse]);

    // 코스 자동 선택 (assignedCourse가 있을 때만)
    useEffect(() => {
        // assignedCourse가 없으면 선택하지 않음 (fallback 제거)
        if (!assignedCourse) {
            // assignedCourse가 없는데 selectedCourse가 있으면 초기화 (할당 코스 변경 대비)
            if (selectedCourse) {
                setSelectedCourse('');
            }
            return;
        }

        const courseIdStr = String(assignedCourse.id);

        // 이미 선택된 코스가 있고, 그것이 assignedCourse와 일치하면 유지
        if (selectedCourse && selectedCourse === courseIdStr) {
            return;
        }

        // assignedCourse가 있으면 자동 선택
        setSelectedCourse(courseIdStr);
    }, [assignedCourse?.id, selectedCourse]);

    // 경기 형태 자동 선택 (1개만 있을 때)
    useEffect(() => {
        if (availableTypes.length === 1 && selectedType !== availableTypes[0]) {
            setSelectedType(availableTypes[0]);
        }
    }, [availableTypes.length]);

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

        // 그룹 데이터에서 조 순서 정보 가져오기
        const groupData = groupsData[selectedGroup];
        const joOrder = groupData?.joOrder || {};

        // 조 순서 정보가 있으면 그 순서대로 정렬, 없으면 기존 정렬 유지
        if (Object.keys(joOrder).length > 0) {
            orderedJos.sort((a, b) => {
                const orderA = joOrder[a] || 999;
                const orderB = joOrder[b] || 999;
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                // 순서 정보가 같으면 조 번호로 정렬 (숫자 우선, 그 다음 문자열)
                const numA = parseInt(a);
                const numB = parseInt(b);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                if (!isNaN(numA)) return -1;
                if (!isNaN(numB)) return 1;
                return a.localeCompare(b);
            });
        } else {
            // 조 순서 정보가 없으면 기존 정렬 (숫자 우선, 그 다음 문자열)
            orderedJos.sort((a, b) => {
                const numA = parseInt(a);
                const numB = parseInt(b);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                if (!isNaN(numA)) return -1;
                if (!isNaN(numB)) return 1;
                return a.localeCompare(b);
            });
        }

        return orderedJos;
    }, [allPlayers, selectedGroup, groupsData]);

    const currentPlayers = useMemo(() => {
        if (!selectedJo) return [];
        return allPlayers.filter(p => p.group === selectedGroup && p.jo.toString() === selectedJo);
    }, [allPlayers, selectedGroup, selectedJo]);

    // assignedCourse가 없을 때 오류 메시지 표시
    useEffect(() => {
        if (!loading && refereeData && !assignedCourse) {
            console.error('❌ 치명적 오류: assignedCourse를 찾을 수 없음', {
                refereeId: refereeData.id,
                tournamentCourses: tournamentCourses.map((c: any) => ({ id: c.id, name: c.name, order: c.order })),
                courses: courses.map((c: any) => ({ id: c.id, name: c.name }))
            });

            toast({
                title: '❌ 코스를 찾을 수 없습니다',
                description: `심판 ID "${refereeData.id}"에 해당하는 코스를 찾을 수 없습니다. 관리자에게 문의하세요.`,
                variant: 'destructive',
                duration: 10000,
            });
        }
    }, [loading, refereeData, assignedCourse, tournamentCourses, courses, toast]);


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
    }, [checkCompletedJos, availableJos.length]);

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
            }, {} as { [key: string]: ScoreData });
            if (Object.keys(scoresToSave).length > 0) {
                safeLocalStorageSetItem(key, JSON.stringify(scoresToSave));
            } else {
                safeLocalStorageRemoveItem(key);
            }
        }
    }, [scores, hole, selectedGroup, selectedCourse, selectedJo, view]);

    // Initialize or sync the scores state.
    useEffect(() => {
        if (view !== 'scoring' || !selectedJo || !currentPlayers.length) {
            setScores({});
            return;
        }

        // 이미 editing 상태인 점수가 하나라도 있으면 초기화하지 않음 (사용자 수정 중 보호)
        const currentScores = scoresRef.current;
        const hasEditingScores = currentPlayers.some(player => {
            const score = currentScores[player.id];
            return score && score.status === 'editing';
        });

        if (hasEditingScores && Object.keys(currentScores).length > 0) {
            return;
        }

        const storageKey = getLocalStorageScoresKey();
        const savedInterimScores = storageKey ? JSON.parse(safeLocalStorageGetItem(storageKey) || '{}') : {};

        const initializeScores = async () => {
            const newScoresState: { [key: string]: ScoreData } = {};

            for (const player of currentPlayers) {
                // 이미 editing 상태인 점수는 절대 덮어쓰지 않음 (사용자가 수정 중인 점수 보호)
                const existingEditingScore = scoresRef.current[player.id];
                if (existingEditingScore && existingEditingScore.status === 'editing') {
                    newScoresState[player.id] = existingEditingScore;
                    continue;
                }

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

                // 불참/실격/기권 처리된 선수는 locked 상태를 유지 (다른 선수의 점수 입력과 관계없이)
                // 단, 관리자 페이지에서 해제한 경우는 Firebase 점수를 반영해야 함
                const existingLockedScore = scoresRef.current[player.id];
                if (existingLockedScore && existingLockedScore.status === 'locked') {
                    const isForfeited = existingLockedScore.forfeitType && existingLockedScore.score === 0;

                    if (isForfeited) {
                        // 관리자 페이지에서 해제했는지 확인
                        // 관리자가 해제하면 모든 홀의 점수가 복원되거나 삭제되므로, 다른 홀의 점수를 확인
                        let wasReleasedByAdmin = false;

                        // 1. 현재 홀의 점수가 null이거나 0이 아니면 관리자가 해제한 것으로 판단
                        if (existingScoreFromDb !== undefined && existingScoreFromDb !== null && Number(existingScoreFromDb) !== 0) {
                            wasReleasedByAdmin = true;
                        } else if (existingScoreFromDb === null || existingScoreFromDb === undefined) {
                            // 2. 현재 홀의 점수가 null이면 다른 홀의 점수를 확인
                            let hasAnyScore = false;
                            let hasZeroScore = false;

                            // allScores에서 다른 홀의 점수 확인
                            if (allScores[player.id] && allScores[player.id][selectedCourse as string]) {
                                for (let h = 1; h <= 9; h++) {
                                    const otherHoleScore = allScores[player.id][selectedCourse as string][h.toString()];
                                    if (otherHoleScore !== undefined && otherHoleScore !== null) {
                                        hasAnyScore = true;
                                        if (otherHoleScore === 0) {
                                            hasZeroScore = true;
                                            break;
                                        }
                                    }
                                }
                            }

                            // 다른 홀에 점수가 있는데 0점이 없으면 관리자가 해제한 것으로 판단
                            if (hasAnyScore && !hasZeroScore) {
                                wasReleasedByAdmin = true;
                            } else if (!hasAnyScore) {
                                // allScores가 비어있으면 Firebase에서 확인
                                try {
                                    const dbInstance = db as import('firebase/database').Database;
                                    const playerCourseRef = ref(dbInstance, `scores/${player.id}/${selectedCourse}`);
                                    const courseSnapshot = await get(playerCourseRef);
                                    if (courseSnapshot.exists()) {
                                        const courseScores = courseSnapshot.val();
                                        for (let h = 1; h <= 9; h++) {
                                            const holeKey = h.toString();
                                            const holeScore = courseScores[h] !== undefined ? courseScores[h] :
                                                courseScores[holeKey] !== undefined ? courseScores[holeKey] :
                                                    null;
                                            if (holeScore !== undefined && holeScore !== null) {
                                                hasAnyScore = true;
                                                if (holeScore === 0 || holeScore === '0' || Number(holeScore) === 0) {
                                                    hasZeroScore = true;
                                                    break;
                                                }
                                            }
                                        }
                                        // 다른 홀에 점수가 있는데 0점이 없으면 관리자가 해제한 것으로 판단
                                        if (hasAnyScore && !hasZeroScore) {
                                            wasReleasedByAdmin = true;
                                        }
                                    }
                                } catch (error) {
                                    console.warn(`관리자 해제 확인 실패:`, error);
                                }
                            }
                        }

                        if (!wasReleasedByAdmin) {
                            // 불참/실격/기권 처리된 선수이고 관리자 페이지에서 해제하지 않은 경우 기존 상태 유지
                            newScoresState[player.id] = existingLockedScore;
                            continue;
                        }
                        // 관리자가 해제한 경우 아래 로직으로 진행하여 편집 상태로 설정
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
                        forfeitType: forfeitType,
                        wasLocked: false // 아직 잠금 해제 안됨 (잠금 해제 시 true로 변경됨)
                    };
                } else {
                    // 저장된 점수가 없으면 편집 상태로 설정 (처음 입력 또는 관리자 해제로 null 복원)

                    // [중요 수정] DB 데이터가 undefined인 경우 (네트워크 지연 등으로 데이터를 못 가져온 경우)
                    // 기존에 로컬에 'locked' 상태로 잘 있던 점수는 절대 초기화하지 말고 유지해야 함
                    const currentLocal = scoresRef.current[player.id];
                    if (existingScoreFromDb === undefined && currentLocal && currentLocal.status === 'locked') {
                        newScoresState[player.id] = currentLocal;
                        continue;
                    }

                    // 관리자 해제로 null로 복원된 경우도 편집 상태로 설정
                    const interimScore = savedInterimScores[player.id];
                    if (interimScore && interimScore.status === 'editing') {
                        newScoresState[player.id] = {
                            score: Number(interimScore.score),
                            status: 'editing',
                            forfeitType: interimScore.forfeitType || null,
                            wasLocked: false // 처음 입력이므로 불참 포함
                        };
                    } else {
                        newScoresState[player.id] = {
                            score: 1,
                            status: 'editing',
                            forfeitType: null,
                            wasLocked: false // 처음 입력 또는 관리자 해제로 null 복원
                        };
                    }
                }
            }

            setScores(newScoresState);
        };

        initializeScores();

    }, [view, selectedJo, selectedCourse, hole, allScores, currentPlayers]);

    // allScores 변경 시 실격 복구 및 기권 해제를 위한 scores 상태 업데이트
    useEffect(() => {
        if (view !== 'scoring' || !selectedJo || !selectedGroup || Object.keys(scores).length === 0) {
            return;
        }

        // currentPlayers를 직접 계산 (dependency에서 제거하여 배열 크기 변경 문제 방지)
        const playersToCheck = allPlayers.filter(p => p.group === selectedGroup && p.jo.toString() === selectedJo);

        if (playersToCheck.length === 0) {
            return;
        }

        // 현재 선수들의 점수 업데이트 체크
        playersToCheck.forEach(player => {
            const currentScoreState = scoresRef.current[player.id];
            const firebaseScore = allScores[player.id]?.[selectedCourse as string]?.[hole as string];

            if (!currentScoreState) return;

            // editing 상태인 점수는 보호 (사용자가 수정 중인 점수)
            if (currentScoreState.status === 'editing') {
                // editing 상태이지만 실격 복구가 필요한 경우에만 업데이트
                // 실격 복구 감지: scores에서는 0점이지만 Firebase에서는 0이 아닌 점수
                if (currentScoreState.score === 0 &&
                    firebaseScore !== undefined &&
                    Number(firebaseScore) > 0) {
                    setScores(prev => ({
                        ...prev,
                        [player.id]: {
                            ...prev[player.id],
                            score: Number(firebaseScore),
                            forfeitType: null
                        }
                    }));
                }
                return; // editing 상태는 여기서 종료
            }

            // locked 상태인 점수는 관리자 페이지에서 변경 시 업데이트
            if (currentScoreState.status === 'locked') {
                // 불참/실격/기권 처리된 선수는 다른 선수의 점수 입력과 관계없이 계속 잠겨 있어야 함
                // forfeitType이 있고 score가 0이면 불참/실격/기권 처리된 것으로 간주
                const isForfeited = currentScoreState.forfeitType && currentScoreState.score === 0;

                const currentScore = currentScoreState.score;

                // 불참/실격/기권 처리된 선수는 Firebase에서 직접 확인하여 관리자 해제 여부 판단
                if (isForfeited) {
                    // allScores가 업데이트될 때 불참 처리된 선수의 점수가 allScores에 없을 수 있음
                    // 이 경우 Firebase에서 직접 확인하여 실제 점수 상태를 확인해야 함
                    (async () => {
                        try {
                            const dbInstance = db as import('firebase/database').Database;
                            const playerHoleRef = ref(dbInstance, `scores/${player.id}/${selectedCourse}/${hole}`);
                            const snapshot = await get(playerHoleRef);
                            const actualFirebaseScore = snapshot.val();

                            // Firebase에서 실제 점수 확인
                            const actualScore = actualFirebaseScore !== undefined && actualFirebaseScore !== null ? Number(actualFirebaseScore) : null;

                            // 관리자 페이지에서 해제한 경우만 업데이트 (실제 Firebase 점수가 null이거나 0이 아닌 값)
                            if (actualScore === null || (actualScore !== null && actualScore !== 0)) {
                                // 관리자 페이지에서 해제한 경우 업데이트
                                if (actualScore === null) {
                                    // null로 변경된 경우 (점수 삭제 - 기권 해제)
                                    setScores(prev => ({
                                        ...prev,
                                        [player.id]: {
                                            score: 1,
                                            status: 'editing',
                                            forfeitType: null,
                                            wasLocked: false
                                        }
                                    }));
                                } else {
                                    // 0이 아닌 점수로 변경된 경우 (기권 해제 - 이전 점수 복구)
                                    setScores(prev => ({
                                        ...prev,
                                        [player.id]: {
                                            ...prev[player.id],
                                            score: actualScore,
                                            forfeitType: null,
                                            status: 'locked' as const,
                                            wasLocked: currentScoreState.wasLocked
                                        }
                                    }));
                                }
                            }
                            // Firebase에서 점수가 여전히 0이면 상태 유지 (다른 선수 점수 입력과 관계없이)
                        } catch (error) {
                            console.warn(`불참 처리된 선수 ${player.id} 점수 확인 실패:`, error);
                            // 에러 발생 시 상태 유지 (안전하게 기존 상태 유지)
                        }
                    })();
                    // 불참 처리된 선수는 allScores 변경과 관계없이 상태 유지
                    return;
                }

                // 불참/실격/기권 처리되지 않은 일반 선수는 allScores에서 점수 확인
                const newScore = firebaseScore !== undefined && firebaseScore !== null ? Number(firebaseScore) : null;

                // 불참/실격/기권 처리되지 않은 일반 선수는 기존 로직대로 처리
                // 점수가 변경된 경우 업데이트
                if (newScore !== currentScore) {
                    if (newScore === null) {
                        // null로 변경된 경우 (점수 삭제 - 기권 해제)

                        // [중요 수정] DB 데이터가 undefined인 경우 (네트워크 지연 등으로 데이터를 못 가져온 경우)
                        // 기존에 로컬에 'locked' 상태로 잘 있던 점수는 절대 초기화하지 말고 유지해야 함
                        if (firebaseScore === undefined) {
                            return;
                        }

                        setScores(prev => ({
                            ...prev,
                            [player.id]: {
                                score: 1,
                                status: 'editing',
                                forfeitType: null,
                                wasLocked: false
                            }
                        }));
                    } else if (newScore === 0) {
                        // 0점으로 변경된 경우 (기권 처리)
                        getForfeitTypeFromLogs(player.id, selectedCourse as string, hole as string).then(ft => {
                            setScores(prev => ({
                                ...prev,
                                [player.id]: {
                                    ...prev[player.id],
                                    score: 0,
                                    forfeitType: ft,
                                    status: 'locked',
                                    wasLocked: currentScoreState.wasLocked
                                }
                            }));
                        });
                    } else {
                        // 0점이 아닌 점수로 변경된 경우 (기권 해제 - 이전 점수 복구)
                        setScores(prev => ({
                            ...prev,
                            [player.id]: {
                                ...prev[player.id],
                                score: newScore,
                                forfeitType: null,
                                status: 'locked',
                                wasLocked: currentScoreState.wasLocked
                            }
                        }));
                    }
                }
            }
        });
    }, [allScores, view, selectedJo, selectedCourse, selectedGroup, hole, allPlayers]);


    // ---- Handlers ----
    const handleStartScoring = () => {
        // assignedCourse가 없으면 작동하지 않음 (치명적 오류 방지)
        if (!assignedCourse) {
            toast({
                title: '❌ 오류',
                description: '담당 코스를 찾을 수 없습니다. 관리자에게 문의하세요.',
                variant: 'destructive',
            });
            return;
        }

        // 코스는 assignedCourse에서 가져옴
        const courseIdStr = String(assignedCourse.id);
        if (!selectedCourse || selectedCourse !== courseIdStr) {
            setSelectedCourse(courseIdStr);
        }

        if (selectedGroup && selectedCourse && selectedJo && currentPlayers.length > 0) {
            setView('scoring');
        } else {
            toast({
                title: '선택 오류',
                description: '그룹, 코스, 조를 모두 선택해주세요.',
                variant: 'destructive',
            });
        }
    };

    const handleBackToSelectionClick = () => {
        setView('selection');
        // 그룹과 코스는 유지하여 완료된 조 체크 표시가 보이도록 함
        setSelectedJo('');
    };

    const updateScore = useCallback((id: string, delta: number) => {
        setScores(prev => {
            const currentScoreData = prev[id];
            if (!currentScoreData || currentScoreData.status !== 'editing') {
                return prev;
            }

            const currentScore = currentScoreData.score;
            const newScore = Math.max(0, currentScore + delta);
            const wasLocked = currentScoreData.wasLocked || false; // 원래 잠금 상태였는지 확인

            // 0점이 되었을 때 기권 타입 순환 처리
            let newForfeitType = currentScoreData.forfeitType;

            if (newScore === 0 && currentScore > 0) {
                // 처음 0점이 되면
                if (wasLocked) {
                    // 수정 시에는 실격으로 시작 (불참 제외)
                    newForfeitType = 'disqualified';
                } else {
                    // 처음 입력 시에는 불참으로 시작
                    newForfeitType = 'absent';
                }
            } else if (newScore === 0 && currentScore === 0 && delta < 0) {
                // 0점 상태에서 -버튼 누르면 순환
                if (wasLocked) {
                    // 수정 시에는 실격 <-> 기권만 순환
                    const currentForfeitType = currentScoreData.forfeitType;
                    if (currentForfeitType === 'disqualified') {
                        newForfeitType = 'forfeit';
                    } else if (currentForfeitType === 'forfeit') {
                        newForfeitType = 'disqualified'; // 다시 실격으로 순환
                    } else {
                        // forfeitType이 없거나 null이면 실격으로 시작
                        newForfeitType = 'disqualified';
                    }
                } else {
                    // 처음 입력 시에는 불참 -> 실격 -> 기권 -> 불참 순환
                    const currentForfeitType = currentScoreData.forfeitType;
                    if (currentForfeitType === 'absent') {
                        newForfeitType = 'disqualified';
                    } else if (currentForfeitType === 'disqualified') {
                        newForfeitType = 'forfeit';
                    } else if (currentForfeitType === 'forfeit') {
                        newForfeitType = 'absent'; // 다시 불참으로 순환
                    } else {
                        newForfeitType = 'absent'; // 기본값은 불참
                    }
                }
            } else if (newScore > 0) {
                // 점수가 0보다 크면 기권 타입 초기화
                newForfeitType = null;
            }

            const updated = {
                ...prev,
                [id]: {
                    ...prev[id],
                    score: newScore,
                    forfeitType: newForfeitType,
                    status: 'editing', // 상태 유지
                    wasLocked: currentScoreData.wasLocked // wasLocked 유지
                }
            };
            // scoresRef를 즉시 업데이트하여 initializeScores가 최신 상태를 참조하도록 함
            scoresRef.current = updated;
            return updated;
        });
    }, []);

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
                    const scorePath = `/scores/${playerToSave.id}/${selectedCourse}/${hole}`;
                    const scoreRef = ref(dbInstance, scorePath);
                    const prevScore = allScores[playerToSave.id]?.[selectedCourse as string]?.[hole as string] ?? null;

                    // 모바일에서는 잠시 대기 후 재시도
                    if (isMobile && attempt > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }

                    await set(scoreRef, scoreData.score);

                    // 점수 변경 로그 기록
                    if (prevScore !== scoreData.score) {
                        const refereeId = (refereeData && refereeData.id) ? refereeData.id : `${hole}번홀심판`;
                        await logScoreChange({
                            matchId: 'tournaments/current',
                            playerId: playerToSave.id,
                            scoreType: 'holeScore',
                            holeNumber: Number(hole),
                            oldValue: prevScore !== null && prevScore !== undefined ? prevScore : 0,
                            newValue: scoreData.score !== null && scoreData.score !== undefined ? scoreData.score : 0,
                            modifiedBy: refereeId,
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
                                // 실격/기권/불참 처리 시 모든 홀의 점수를 0점으로 변경 (기존 점수도 포함)
                                const oldValue = existing === undefined || existing === null || existing === '' || isNaN(Number(existing)) ? 0 : Number(existing);

                                // 모든 홀을 0점으로 설정
                                await set(ref(dbInstance, `/scores/${playerToSave.id}/${cid}/${h}`), 0);
                                const refereeId = (refereeData && refereeData.id) ? refereeData.id : `${hole}번홀심판`;

                                // 직접 입력한 코스/홀과 다른 홀을 구분하여 로그 기록
                                if (cid === selectedCourse && h === Number(hole)) {
                                    await logScoreChange({
                                        matchId: 'tournaments/current',
                                        playerId: playerToSave.id,
                                        scoreType: 'holeScore',
                                        holeNumber: h,
                                        oldValue: oldValue,
                                        newValue: 0,
                                        modifiedBy: refereeId,
                                        modifiedByType: 'judge',
                                        comment: `심판 직접 ${scoreData.forfeitType === 'absent' ? '불참' : scoreData.forfeitType === 'disqualified' ? '실격' : '기권'} (코스: ${courseName}, 홀: ${h})`,
                                        courseId: cid
                                    });
                                } else {
                                    await logScoreChange({
                                        matchId: 'tournaments/current',
                                        playerId: playerToSave.id,
                                        scoreType: 'holeScore',
                                        holeNumber: h,
                                        oldValue: oldValue,
                                        newValue: 0,
                                        modifiedBy: refereeId,
                                        modifiedByType: 'judge',
                                        comment: `심판페이지에서 ${scoreData.forfeitType === 'absent' ? '불참' : scoreData.forfeitType === 'disqualified' ? '실격' : '기권'} 처리 (코스: ${courseName}, 홀: ${h})`,
                                        courseId: cid
                                    });
                                }
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
                description: '',
                duration: 500
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
                if (!dataCache.current.scores[selectedCourse][playerToSave.id][selectedCourse]) {
                    dataCache.current.scores[selectedCourse][playerToSave.id][selectedCourse] = {};
                }
                dataCache.current.scores[selectedCourse][playerToSave.id][selectedCourse][hole] = scoreData.score;
                dataCache.current.lastUpdated[`scores_${selectedCourse}`] = Date.now();
            }

            // allScores 상태도 즉시 업데이트하여 UI 반영
            // Firebase 구독이 자동으로 업데이트하지만, 즉시 반영을 위해 여기서도 업데이트
            // 단, initializeScores useEffect가 불필요하게 재실행되지 않도록 주의
            setAllScores(prev => {
                const updated = { ...prev };
                if (!updated[playerToSave.id]) {
                    updated[playerToSave.id] = {};
                }
                if (!updated[playerToSave.id][selectedCourse as string]) {
                    updated[playerToSave.id][selectedCourse as string] = {};
                }
                // 저장한 점수만 업데이트 (다른 선수나 홀의 점수는 변경하지 않음)
                updated[playerToSave.id][selectedCourse as string][hole as string] = scoreData.score;
                return updated;
            });

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
                [playerToUnlock.id]: {
                    ...prev[playerToUnlock.id],
                    status: 'editing',
                    wasLocked: true, // 잠금 해제 시 수정 모드임을 표시
                    forfeitType: prev[playerToUnlock.id]?.forfeitType || null // forfeitType 보존
                }
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

    // 심판 아이디를 코스명과 함께 표시하는 함수
    const getRefereeDisplayName = () => {
        if (!refereeData?.id || tournamentCourses.length === 0) {
            return refereeData?.id || `${hole}번홀 심판`;
        }

        // 심판 아이디에서 번호 추출 (예: "1번홀심판3" -> 3)
        const match = refereeData.id.match(/(\d+)번홀심판(\d*)/);
        if (!match) return refereeData.id;

        const holeNumber = match[1];
        const suffixNumber = match[2] ? parseInt(match[2]) : 0;

        // 코스 order 기준으로 코스명 결정
        // suffixNumber가 0이면 첫번째 코스(order === 1), 1이면 두번째 코스(order === 2), ...
        const targetOrder = suffixNumber === 0 ? 1 : suffixNumber + 1;

        // 먼저 order 기준으로 찾기
        let targetCourse = tournamentCourses.find((course: any) => {
            const courseOrder = course.order;
            // order가 명시적으로 설정된 경우만 사용
            if (courseOrder !== undefined && courseOrder !== null && typeof courseOrder === 'number') {
                return courseOrder === targetOrder;
            }
            return false;
        });

        // order 기준으로 못 찾았으면 인덱스 방식으로 fallback
        if (!targetCourse && suffixNumber < tournamentCourses.length) {
            targetCourse = tournamentCourses[suffixNumber];
        }

        if (targetCourse) {
            return `${targetCourse.name} ${holeNumber}번홀심판`;
        }

        return refereeData.id;
    };

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
                    {!assignedCourse && !loading && (
                        <Card className="border-red-400 bg-red-50 text-red-900">
                            <CardContent className="p-4">
                                <p className="font-bold text-lg">❌ 오류: 담당 코스를 찾을 수 없습니다</p>
                                <p className="text-sm mt-2">
                                    심판 ID "{refereeData?.id || '알 수 없음'}"에 해당하는 코스를 찾을 수 없습니다.
                                    <br />
                                    관리자에게 문의하세요.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                    <Select
                        value={selectedType as string}
                        onValueChange={v => {
                            const val = (v || '').toString();
                            if (val === 'individual' || val === 'team') {
                                setSelectedType(val);
                            } else {
                                setSelectedType('');
                            }
                            setSelectedGroup(''); setSelectedJo('');
                        }}
                        disabled={availableTypes.length === 0 || (availableTypes.length === 1 && selectedType === availableTypes[0])}
                    >
                        <SelectTrigger className="h-12 text-base">
                            <SelectValue placeholder="1. 경기 형태 선택" />
                        </SelectTrigger>
                        <SelectContent position="item-aligned">
                            {availableTypes.map(type => (
                                <SelectItem key={type} value={type} className="text-base">
                                    {type === 'individual' ? '개인전' : '2인1팀'}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={selectedGroup}
                        onValueChange={v => {
                            setSelectedGroup((v ?? '') as string);
                            setSelectedJo('');
                        }}
                        disabled={!selectedType || availableGroups.length === 0}
                    >
                        <SelectTrigger className="h-12 text-base">
                            <SelectValue placeholder={selectedType === '' ? "경기 형태 먼저 선택" : availableGroups.length === 0 ? "배정된 그룹 없음" : "2. 그룹 선택"} />
                        </SelectTrigger>
                        <SelectContent position="item-aligned" className="max-h-[60vh]">
                            {availableGroups.map(g => <SelectItem key={g} value={g.toString()} className="text-base">{g}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select
                        value={selectedCourse || ''}
                        onValueChange={v => {
                            // assignedCourse와 일치하는지 확인 (비활성화되어 있지만 안전장치)
                            const newCourse = (v || '').toString();
                            if (assignedCourse && String(assignedCourse.id) !== newCourse) {
                                // assignedCourse로 강제 설정
                                setSelectedCourse(String(assignedCourse.id));
                            } else {
                                setSelectedCourse(newCourse);
                            }
                            setSelectedJo('');
                        }}
                        disabled={true}
                    >
                        <SelectTrigger className="h-12 text-base bg-muted">
                            <SelectValue placeholder={
                                assignedCourse
                                    ? `${assignedCourse.name} (${hole}번홀심판)`
                                    : "코스 정보 없음"
                            } />
                        </SelectTrigger>
                        <SelectContent position="item-aligned" className="max-h-[60vh]">
                            {availableCoursesForGroup.map(c => (
                                <SelectItem key={c.id} value={c.id.toString()} className="text-base">
                                    {c.name} ({hole}번홀심판)
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={selectedJo || ''} onValueChange={v => setSelectedJo((v || '').toString())} disabled={!selectedGroup || availableJos.length === 0}>
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder={!selectedGroup ? "그룹 먼저 선택" : (availableJos.length === 0 ? "배정된 선수 없음" : "4. 조 선택")} /></SelectTrigger>
                        <SelectContent position="item-aligned" className="max-h-[60vh]">
                            {availableJos.map(jo => {
                                const isCompleted = completedJosState.has(jo);
                                return (
                                    <SelectItem key={jo} value={jo} className={isCompleted ? "text-muted-foreground" : ""}>
                                        {isCompleted ? `${jo}조 ✓` : `${jo}조`}
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>




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
                    // scores 상태에서 직접 가져오기 (최신 상태 보장)
                    const scoreData = scores[player.id];
                    // 초기 렌더링 시 점수 데이터가 아직 로드되지 않을 수 있음 (정상)
                    if (!scoreData) {
                        return null;
                    }

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
                    // scoreData.score를 직접 사용하여 최신 값 보장
                    const currentScore = scoreData.score;
                    const isZeroScore = currentScore === 0;
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
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 rounded-md"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (!isLocked && scoreData) {
                                                    updateScore(player.id, -1);
                                                }
                                            }}
                                            disabled={isLocked}
                                        >
                                            <Minus className="h-5 w-5" />
                                        </Button>
                                        <span className={isZeroScore ? "text-xs font-bold w-12 text-center text-red-600" : "text-3xl font-bold tabular-nums w-12 text-center"}>
                                            {isZeroScore ? forfeitText : currentScore}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 rounded-md"
                                            onClick={() => updateScore(player.id, 1)}
                                            disabled={isLocked}
                                        >
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
                        {getRefereeDisplayName()}
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
                                    safeLocalStorageClear();
                                    safeSessionStorageClear();
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
