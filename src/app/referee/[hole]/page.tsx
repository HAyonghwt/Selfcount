
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, Lock, Trophy, ArrowLeft } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { logScoreChange } from '@/lib/scoreLogs';

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

export default function RefereePage() {
    const params = useParams();
    const router = useRouter();
    const hole = String(params.hole ?? '');
    const { toast } = useToast();
    const [refereeData, setRefereeData] = useState<any>(null);

    // Data from Firebase
    const [allPlayers, setAllPlayers] = useState<Player[]>([]);
    const [allScores, setAllScores] = useState<any>({});
    const [courses, setCourses] = useState<Course[]>([]);
    const [groupsData, setGroupsData] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [unlockPasswordFromDb, setUnlockPasswordFromDb] = useState('');

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

    // 로그인 상태 확인
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
        } catch (error) {
            console.error('심판 데이터 파싱 오류:', error);
            router.push('/referee/login');
            return;
        }
    }, [hole, router]);

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
            if (!completedJos.has(candidateJo)) {
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
                view: 'scoring'
            };
            localStorage.setItem(`refereeState_${hole}`, JSON.stringify(stateToSave));
        } else if (view === 'selection') {
            localStorage.removeItem(`refereeState_${hole}`);
        }
    }, [view, selectedGroup, selectedCourse, selectedJo, hole]);

    // Data fetching
    useEffect(() => {
        setLoading(true);
        const dbInstance = db as import('firebase/database').Database;
        const playersRef = ref(dbInstance, 'players');
        const scoresRef = ref(dbInstance, 'scores');
        const tournamentRef = ref(dbInstance, 'tournaments/current');
        const passwordRef = ref(dbInstance, 'config/scoreUnlockPassword');

        const unsubPlayers = onValue(playersRef, (snapshot) => setAllPlayers(Object.entries(snapshot.val() || {}).map(([id, player]) => ({ id, ...player as object } as Player))));
        const unsubScores = onValue(scoresRef, (snapshot) => setAllScores(snapshot.val() || {}));
        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setCourses(data.courses ? Object.values(data.courses) : []);
            setGroupsData(data.groups || {});
            setLoading(false);
        });
        const unsubPassword = onValue(passwordRef, (snapshot) => setUnlockPasswordFromDb(snapshot.val() || ''));

        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
            unsubPassword();
        };
    }, []);

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
    
    const completedJos = useMemo(() => {
        if (!selectedGroup || !selectedCourse || !hole || !allPlayers.length || !Object.keys(allScores).length) {
            return new Set<string>();
        }
    
        const groupPlayers = allPlayers.filter(p => p.group === selectedGroup);
        const josInGroup = [...new Set(groupPlayers.map(p => p.jo.toString()))];
    
        const completed = new Set<string>();
    
        josInGroup.forEach(joNum => {
            const playersInThisJo = groupPlayers.filter(p => p.jo.toString() === joNum);
    
            if (playersInThisJo.length === 0) return;
    
            const allInJoAreScored = playersInThisJo.every(player => {
                return allScores[player.id]?.[selectedCourse as string]?.[hole as string] !== undefined;
            });
    
            if (allInJoAreScored) {
                completed.add(joNum);
            }
        });
    
        return completed;
    }, [allPlayers, allScores, selectedGroup, selectedCourse, hole]);

    const isCourseCompleteForThisHole = useMemo(() => {
        if (!selectedCourse || !hole || !allPlayers.length || !Object.keys(groupsData).length) {
            return false;
        }

        const playersOnCourse = allPlayers.filter(player => {
            const playerGroup = groupsData[player.group];
            return playerGroup?.courses?.[selectedCourse];
        });

        if (playersOnCourse.length === 0) {
            return false;
        }

        return playersOnCourse.every(player => {
            return allScores[player.id]?.[selectedCourse as string]?.[hole as string] !== undefined;
        });

    }, [selectedCourse, hole, allPlayers, allScores, groupsData]);

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
                const existingScoreFromDb = allScores[player.id]?.[selectedCourse as string]?.[hole as string];
                
                if (existingScoreFromDb !== undefined) {
                    // 저장된 점수가 0점인 경우 forfeitType을 로그에서 추출
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
        const dbInstance = db as import('firebase/database').Database;
        const scoreRef = ref(dbInstance, `/scores/${playerToSave.id}/${selectedCourse}/${hole}`);
        const prevScore = allScores[playerToSave.id]?.[selectedCourse as string]?.[hole as string] ?? null;
        try {
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
        } catch (err: any) {
            console.error("Failed to save score:", err);
            toast({
                title: "저장 실패",
                description: `점수를 저장하는 중 오류가 발생했습니다: ${err.message}`,
                variant: "destructive",
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
                                const isCompleted = completedJos.has(jo);
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
                </CardContent>
                <CardFooter className="flex-col gap-2">
                     <Button className="w-full h-14 text-xl font-bold" onClick={handleStartScoring} disabled={!selectedJo}>점수기록 시작</Button>
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
                                <div className="text-xl sm:text-2xl font-extrabold text-center text-foreground break-words">
                                    <span>{selectedGroup}</span>
                                    <span className="mx-1">/</span>
                                    <span>{selectedCourseName}</span>
                                </div>
                                <Select value={selectedJo} onValueChange={setSelectedJo}>
                                    <SelectTrigger className="w-full h-12 text-lg font-bold">
                                        <SelectValue placeholder="조 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableJos.map(jo => {
                                            const isCompleted = completedJos.has(jo);
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
