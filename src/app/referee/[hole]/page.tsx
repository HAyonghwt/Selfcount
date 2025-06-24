
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, Lock, Pencil } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
}

export default function RefereePage() {
    const params = useParams();
    const hole = params.hole;
    const { toast } = useToast();

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
    
    // Local state for scoring UI
    const [scores, setScores] = useState<{ [key: string]: ScoreData }>({});
    const [playerToSave, setPlayerToSave] = useState<Player | null>(null);

    // Unlock modal state
    const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
    const [unlockPasswordInput, setUnlockPasswordInput] = useState('');
    const [playerToUnlock, setPlayerToUnlock] = useState<Player | null>(null);

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
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');
        const passwordRef = ref(db, 'config/scoreUnlockPassword');

        const unsubPlayers = onValue(playersRef, (snapshot) => setAllPlayers(Object.entries(snapshot.val() || {}).map(([id, player]) => ({ id, ...player as object } as Player))));
        const unsubScores = onValue(scoresRef, (snapshot) => setAllScores(snapshot.val() || {}));
        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setCourses(data.courses ? Object.values(data.courses).filter((c: any) => c.isActive) : []);
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
    const availableGroups = useMemo(() => Object.keys(groupsData).sort(), [groupsData]);
    
    const availableCoursesForGroup = useMemo(() => {
        if (!selectedGroup) return [];
        const group = groupsData[selectedGroup];
        if (!group || !group.courses) return [];
        const assignedCourseIds = Object.keys(group.courses).filter(id => group.courses[id]);
        return courses.filter(c => assignedCourseIds.includes(c.id.toString()));
    }, [selectedGroup, groupsData, courses]);

    const availableJos = useMemo(() => {
        if (!selectedGroup) return [];
        const groupPlayers = allPlayers.filter(p => p.group === selectedGroup);
        return [...new Set(groupPlayers.map(p => p.jo))].sort((a, b) => a - b);
    }, [allPlayers, selectedGroup]);
    
    const currentPlayers = useMemo(() => {
        if (!selectedJo) return [];
        return allPlayers.filter(p => p.group === selectedGroup && p.jo.toString() === selectedJo);
    }, [allPlayers, selectedGroup, selectedJo]);
    
    const completedJos = useMemo(() => {
        if (!selectedGroup || !selectedCourse || !hole) return new Set<number>();
    
        const completed = new Set<number>();
    
        availableJos.forEach(joNum => {
            const playersInThisJo = allPlayers.filter(p => p.group === selectedGroup && p.jo === joNum);
    
            if (playersInThisJo.length === 0) return;
    
            const allInJoAreScored = playersInThisJo.every(player => {
                return allScores[player.id]?.[selectedCourse]?.[hole] !== undefined;
            });
    
            if (allInJoAreScored) {
                completed.add(joNum);
            }
        });
    
        return completed;
    }, [allPlayers, allScores, availableJos, selectedGroup, selectedCourse, hole]);

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

        const newScoresState: { [key: string]: ScoreData } = {};
        currentPlayers.forEach((player) => {
            const existingScoreFromDb = allScores[player.id]?.[selectedCourse]?.[hole];
            
            if (existingScoreFromDb !== undefined) {
                newScoresState[player.id] = { score: Number(existingScoreFromDb), status: 'locked' };
            } else {
                const interimScore = savedInterimScores[player.id];
                if (interimScore && interimScore.status === 'editing') {
                    newScoresState[player.id] = { score: Number(interimScore.score), status: 'editing'};
                } else {
                    newScoresState[player.id] = { score: 1, status: 'editing' };
                }
            }
        });
        setScores(newScoresState);
        
    }, [view, selectedJo, selectedCourse, hole, allScores, currentPlayers]);

    // Prevent accidental navigation when scoring
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (view === 'scoring') {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [view]);

    // ---- Handlers ----
    const handleStartScoring = () => {
        if (selectedGroup && selectedCourse && selectedJo) {
            setView('scoring');
        }
    };
    
    const handleReturnToJoSelection = () => {
        const storageKey = getLocalStorageScoresKey();
        if (storageKey) {
            localStorage.removeItem(storageKey);
        }
        setView('selection');
        setSelectedJo(''); 
    };

    const updateScore = (id: string, delta: number) => {
        if (scores[id]?.status === 'editing') {
            setScores(prev => ({
                ...prev,
                [id]: { ...prev[id], score: Math.max(0, prev[id].score + delta) }
            }));
        }
    };

    const handleSavePress = (player: Player) => {
        const scoreData = scores[player.id];
        if (!scoreData || scoreData.status !== 'editing') return;
        setPlayerToSave(player);
    };

    const handleConfirmSave = () => {
        if (!playerToSave) return;
        
        const scoreData = scores[playerToSave.id];
        if (!scoreData || scoreData.status !== 'editing') return;

        const scoreRef = ref(db, `/scores/${playerToSave.id}/${selectedCourse}/${hole}`);
        
        set(scoreRef, scoreData.score).catch(err => {
            console.error("Failed to save score:", err);
            toast({
                title: "저장 실패",
                description: `점수를 저장하는 중 오류가 발생했습니다: ${err.message}`,
                variant: "destructive",
            });
        }).finally(() => {
            setPlayerToSave(null);
        });
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
    
    if (loading) {
        return (
             <div className="bg-slate-50 min-h-screen p-2 sm:p-4 flex flex-col font-body">
                <header className="text-center mb-4">
                    <h1 className="text-3xl font-extrabold text-primary break-keep leading-tight">{hole}번홀 점수 기록</h1>
                    <p className="text-muted-foreground text-base">담당 심판용 페이지</p>
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
                    <CardDescription className="text-sm">점수를 기록할 그룹, 코스, 조를 선택하세요.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Select value={selectedGroup} onValueChange={v => {setSelectedGroup(v); setSelectedCourse(''); setSelectedJo('');}} >
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder="1. 그룹 선택" /></SelectTrigger>
                        <SelectContent position="item-aligned">
                            {availableGroups.map(g => <SelectItem key={g} value={g} className="text-base">{g}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={selectedCourse} onValueChange={v => {setSelectedCourse(v); setSelectedJo('');}} disabled={!selectedGroup || availableCoursesForGroup.length === 0}>
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder={!selectedGroup ? "그룹 먼저 선택" : (availableCoursesForGroup.length === 0 ? "배정된 코스 없음" : "2. 코스 선택")} /></SelectTrigger>
                        <SelectContent position="item-aligned">
                            {availableCoursesForGroup.map(c => <SelectItem key={c.id} value={c.id.toString()} className="text-base">{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                     <Select value={selectedJo} onValueChange={setSelectedJo} disabled={!selectedCourse || availableJos.length === 0}>
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder={!selectedCourse ? "코스 먼저 선택" : (availableJos.length === 0 ? "배정된 선수 없음" : "3. 조 선택")} /></SelectTrigger>
                        <SelectContent position="item-aligned">
                            {availableJos.map(jo => {
                                const isCompleted = completedJos.has(jo);
                                return (
                                    <SelectItem key={jo} value={jo.toString()}>
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

    const renderScoringScreen = () => (
        <div className="flex-1 flex flex-col space-y-3">
            {currentPlayers.map(player => {
                const scoreData = scores[player.id];
                if (!scoreData) return null;

                const isLocked = scoreData.status === 'locked';

                return (
                    <Card key={player.id} className="overflow-hidden">
                        <CardContent className="p-2" onDoubleClick={isLocked ? () => handleUnlockRequest(player) : undefined}>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                    {player.type === 'team' ? (
                                        <div>
                                            <p className="font-semibold text-lg truncate">{player.p1_name}</p>
                                            <p className="font-semibold text-lg truncate">{player.p2_name}</p>
                                        </div>
                                    ) : (
                                        <p className="font-semibold text-xl truncate">{player.name}</p>
                                    )}
                                </div>
                                <div className="flex-shrink-0 flex items-center gap-1.5">
                                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-md" onClick={() => updateScore(player.id, -1)} disabled={isLocked}>
                                        <Minus className="h-4 w-4" />
                                    </Button>
                                    <span className="text-2xl font-bold tabular-nums w-8 text-center">{scoreData.score}</span>
                                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-md" onClick={() => updateScore(player.id, 1)} disabled={isLocked}>
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        className={cn("h-9 w-9 rounded-md", {
                                            'bg-muted hover:bg-muted cursor-not-allowed': isLocked,
                                        })}
                                        onClick={() => {
                                            if (isLocked) return;
                                            handleSavePress(player);
                                        }}
                                    >
                                        {isLocked ? <Lock className="h-4 w-4 text-green-500" /> : <Save className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );

    return (
        <>
            <div className="bg-slate-50 min-h-screen p-2 sm:p-4 flex flex-col font-body">
                <header className="text-center mb-4">
                    <h1 className="text-3xl font-extrabold text-primary break-keep leading-tight">{hole}번홀 점수 기록</h1>
                    <p className="text-muted-foreground text-base">담당 심판용 페이지</p>
                </header>

                <div className="flex-1 flex flex-col space-y-4">
                    {view === 'scoring' && (
                        <Card>
                            <CardHeader className="p-3">
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
                                    <div className="text-lg sm:text-xl font-bold text-center break-keep">
                                        <span>{selectedGroup}</span>
                                        <span className="text-muted-foreground mx-1 sm:mx-2">/</span>
                                        <span>{selectedCourseName}</span>
                                        <span className="text-muted-foreground mx-1 sm:mx-2">/</span>
                                        <span>{selectedJo}조</span>
                                    </div>
                                    <Button variant="outline" onClick={handleReturnToJoSelection} className="w-full sm:w-auto">
                                        <Pencil className="mr-2 h-4 w-4" />
                                        선택 변경
                                    </Button>
                                </div>
                            </CardHeader>
                        </Card>
                    )}

                    {view === 'selection' ? renderSelectionScreen() : renderScoringScreen()}
                </div>
            </div>
            
            <AlertDialog open={!!playerToSave} onOpenChange={(open) => !open && setPlayerToSave(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-bold text-center" style={{ fontSize: '1.7rem', lineHeight: '2.0rem' }}>
                            {playerToSave ? getPlayerName(playerToSave) : ''}
                        </AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="flex flex-col items-center justify-center p-0 text-center">
                        {playerToSave && scores[playerToSave.id] && (
                             <div className="flex items-baseline my-2">
                                <span className="font-extrabold text-destructive leading-none" style={{ fontSize: '3.5rem', lineHeight: '1' }}>{scores[playerToSave.id].score}</span>
                                <span className="font-bold ml-2 text-base">점</span>
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
        </>
    );
}
