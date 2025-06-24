
"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, Lock, ArrowLeft } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from '@/components/ui/progress';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

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
    status: 'editing' | 'saved' | 'locked';
    savedAt?: number;
}

export default function RefereePage() {
    const params = useParams();
    const hole = params.hole;

    // Data from Firebase
    const [allPlayers, setAllPlayers] = useState<Player[]>([]);
    const [allScores, setAllScores] = useState<any>({});
    const [courses, setCourses] = useState<Course[]>([]);
    const [groupsData, setGroupsData] = useState<any>({});
    const [loading, setLoading] = useState(true);

    // UI State
    const [view, setView] = useState<'selection' | 'scoring'>('selection');
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [selectedJo, setSelectedJo] = useState<string>('');
    
    // Local state for scoring UI
    const [scores, setScores] = useState<{ [key: string]: ScoreData }>({});
    const [confirmingPlayer, setConfirmingPlayer] = useState<{ player: Player; score: number; } | null>(null);
    const { toast } = useToast();
    const [now, setNow] = useState(Date.now());
    const saveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hole]);
    
    // Save state to localStorage when scoring
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
            // Clear the state if we are back to selection view
            localStorage.removeItem(`refereeState_${hole}`);
        }
    }, [view, selectedGroup, selectedCourse, selectedJo, hole]);

    // Data fetching
    useEffect(() => {
        setLoading(true);
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');

        const unsubPlayers = onValue(playersRef, (snapshot) => setAllPlayers(Object.entries(snapshot.val() || {}).map(([id, player]) => ({ id, ...player as object } as Player))));
        const unsubScores = onValue(scoresRef, (snapshot) => setAllScores(snapshot.val() || {}));
        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setCourses(data.courses ? Object.values(data.courses).filter((c: any) => c.isActive) : []);
            setGroupsData(data.groups || {});
            setLoading(false);
        });

        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
        };
    }, []);

    // Timer for "saved" state progress bar, only runs in scoring view.
    useEffect(() => {
        let interval: NodeJS.Timeout | undefined;
        if (view === 'scoring' && Object.values(scores).some(s => s.status === 'saved')) {
            interval = setInterval(() => setNow(Date.now()), 50);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [view, scores]);

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

    // When view changes to 'scoring', or when players for a Jo are determined, initialize or sync the scores state.
    useEffect(() => {
        if (view !== 'scoring' || !currentPlayers.length) return;

        setScores(currentScores => {
            const newScoresState: { [key: string]: ScoreData } = {};
            currentPlayers.forEach((player) => {
                const existingScoreFromDb = allScores[player.id]?.[selectedCourse]?.[hole];
                const currentLocalScoreData = currentScores[player.id];

                if (existingScoreFromDb !== undefined) {
                    newScoresState[player.id] = { score: existingScoreFromDb, status: 'locked' };
                } else if (currentLocalScoreData) {
                    // If no DB score, but we have a local one, keep it.
                    newScoresState[player.id] = currentLocalScoreData;
                } else {
                    // Only initialize if no DB and no local score exists.
                    newScoresState[player.id] = { score: 1, status: 'editing' };
                }
            });
            return newScoresState;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, currentPlayers, allScores, selectedCourse, hole]);
    
    // Delayed saving logic
    useEffect(() => {
        const timers = saveTimers.current;

        Object.entries(scores).forEach(([playerId, scoreData]) => {
            if (scoreData.status === 'saved' && !timers.has(playerId)) {
                const timer = setTimeout(() => {
                    const scoreRef = ref(db, `/scores/${playerId}/${selectedCourse}/${hole}`);
                    set(scoreRef, scoreData.score).then(() => {
                        setScores(prev => (prev[playerId]?.status === 'saved') ? { ...prev, [playerId]: { ...prev[playerId], status: 'locked' } } : prev);
                        timers.delete(playerId);
                    }).catch(err => {
                        setScores(prev => ({...prev, [playerId]: {...prev[playerId], status: 'editing'}}));
                        timers.delete(playerId);
                    });
                }, 10000); // 10 seconds delay
                timers.set(playerId, timer);
            }
        });

        return () => {
            timers.forEach(timer => clearTimeout(timer));
        };
    }, [scores, selectedCourse, hole]);


    // ---- Handlers ----
    const handleStartScoring = () => {
        if (selectedGroup && selectedCourse && selectedJo) {
            setView('scoring');
        }
    };
    
    const handleReturnToJoSelection = () => {
        const timers = saveTimers.current;
        const savePromises: Promise<void>[] = [];

        Object.entries(scores).forEach(([playerId, scoreData]) => {
            if (scoreData.status === 'saved') {
                if (timers.has(playerId)) {
                    clearTimeout(timers.get(playerId)!);
                    timers.delete(playerId);
                }
                const scoreRef = ref(db, `scores/${playerId}/${selectedCourse}/${hole}`);
                savePromises.push(set(scoreRef, scoreData.score));
            }
        });

        Promise.all(savePromises).finally(() => {
            setView('selection');
            setSelectedJo(''); 
            setScores({}); 
        });
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
        if (scores[player.id]?.status === 'editing') {
            setConfirmingPlayer({ player, score: scores[player.id].score });
        }
    };

    const handleConfirmFinalSave = () => {
        if (!confirmingPlayer) return;
        const { player, score } = confirmingPlayer;
        const playerIdToSave = player.id;
        const timers = saveTimers.current;

        const playersToLockImmediately: { pid: string; scoreData: ScoreData }[] = [];

        // Find all other players currently in 'saved' state
        Object.entries(scores).forEach(([pid, scoreData]) => {
            if (pid !== playerIdToSave && scoreData.status === 'saved') {
                playersToLockImmediately.push({ pid, scoreData });
            }
        });

        // Immediately save and lock them
        const dbPromises = playersToLockImmediately.map(({ pid, scoreData }) => {
            if (timers.has(pid)) {
                clearTimeout(timers.get(pid)!);
                timers.delete(pid);
            }
            const scoreRef = ref(db, `scores/${pid}/${selectedCourse}/${hole}`);
            return set(scoreRef, scoreData.score);
        });
        
        Promise.all(dbPromises).then(() => {
            setScores(currentScores => {
                const newScoresState = { ...currentScores };

                // Update the state of the now locked players
                playersToLockImmediately.forEach(({ pid, scoreData }) => {
                    if (newScoresState[pid]) {
                        newScoresState[pid] = { ...scoreData, status: 'locked' };
                    }
                });

                // Set the newly saved player to 'saved' state
                newScoresState[playerIdToSave] = { score, status: 'saved', savedAt: Date.now() };

                return newScoresState;
            });
        }).catch(err => {
            // Do not show toast.
        });

        setConfirmingPlayer(null);
    };

    const handleImmediateLock = (playerId: string) => {
        const scoreData = scores[playerId];
        if (scoreData?.status !== 'saved') return;

        const timers = saveTimers.current;
        if (timers.has(playerId)) {
            clearTimeout(timers.get(playerId)!);
            timers.delete(playerId);
        }

        const scoreRef = ref(db, `/scores/${playerId}/${selectedCourse}/${hole}`);
        set(scoreRef, scoreData.score)
            .then(() => {
                setScores(prev => ({
                    ...prev,
                    [playerId]: { ...prev[playerId], status: 'locked' }
                }));
            })
            .catch(err => {
                setScores(prev => ({...prev, [playerId]: {...prev[playerId], status: 'editing'}}));
            });
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
                                    <SelectItem key={jo} value={jo.toString()} disabled={isCompleted && Object.values(scores).some(s => s.status === 'saved')}>
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

                const isEditing = scoreData.status === 'editing';
                const isSaved = scoreData.status === 'saved';
                const isLocked = scoreData.status === 'locked';

                const progressValue = isSaved && scoreData.savedAt 
                    ? ((now - scoreData.savedAt) / 10000) * 100
                    : 0;

                return (
                    <Card key={player.id} className="overflow-hidden">
                      <CardContent className="p-2">
                        <div className="flex items-center gap-2 w-full">
                            <div className="flex-1 truncate pr-2">
                                <p className="font-bold text-lg truncate">{getPlayerName(player)}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="outline" size="icon" className="w-11 h-11 rounded-lg border-2 flex-shrink-0" onClick={() => updateScore(player.id, -1)} disabled={!isEditing}><Minus className="h-6 w-6" /></Button>
                                <div className="relative w-10 text-center">
                                    <span className={`text-4xl font-bold tabular-nums`}>{scoreData.score}</span>
                                </div>
                                <Button variant="outline" size="icon" className="w-11 h-11 rounded-lg border-2 flex-shrink-0" onClick={() => updateScore(player.id, 1)} disabled={!isEditing}><Plus className="h-6 w-6" /></Button>
                            </div>
                            <div className="w-24 h-11 flex-shrink-0">
                                {isEditing && <Button variant="default" size="icon" className="w-full h-full rounded-lg" onClick={() => handleSavePress(player)}><Save className="h-6 w-6" /></Button>}
                                {isSaved && (
                                    <Button variant="secondary" className="w-full h-full text-center relative border border-dashed border-primary/50 rounded-lg cursor-pointer text-xs leading-tight font-bold" onClick={() => handleImmediateLock(player.id)}>
                                        <div className='absolute bottom-0 left-0 top-0 bg-primary/30' style={{width: `${progressValue}%`}}></div>
                                        <span className="relative">즉시잠금</span>
                                    </Button>
                                )}
                                {isLocked && (
                                    <div className="flex items-center justify-center h-full w-full bg-muted text-muted-foreground rounded-lg">
                                        <Lock className="w-6 h-6 text-green-500" />
                                    </div>
                                )}
                            </div>
                        </div>
                      </CardContent>
                    </Card>
                )
            })}
        </div>
    );

    return (
        <div className="bg-slate-50 min-h-screen p-2 sm:p-4 flex flex-col font-body">
            <header className="text-center mb-4">
                <h1 className="text-3xl font-extrabold text-primary break-keep leading-tight">{hole}번홀 점수 기록</h1>
                <p className="text-muted-foreground text-base">담당 심판용 페이지</p>
            </header>

            <div className="flex-1 flex flex-col space-y-4">
                {view === 'scoring' && (
                     <Card>
                        <CardHeader className="p-3">
                            <div className="flex justify-between items-center gap-2">
                                <div className="text-lg sm:text-xl font-bold text-center break-keep">
                                    <span>{selectedGroup}</span> 
                                    <span className="text-muted-foreground mx-1">/</span> 
                                    <span>{selectedCourseName}</span>
                                    <span className="text-muted-foreground mx-1">/</span>
                                    <span>{selectedJo}조</span>
                                </div>
                                <Button variant="outline" size="sm" onClick={handleReturnToJoSelection}>
                                    <ArrowLeft className="mr-1 h-3 w-3" />
                                    다른 조 선택
                                </Button>
                            </div>
                        </CardHeader>
                    </Card>
                )}

                {view === 'selection' ? renderSelectionScreen() : renderScoringScreen()}
            </div>
            
            <AlertDialog open={!!confirmingPlayer} onOpenChange={(open) => !open && setConfirmingPlayer(null)}>
                <AlertDialogContent className="border-foreground/20">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-center text-4xl sm:text-5xl font-extrabold leading-tight truncate text-foreground">
                            {confirmingPlayer?.player ? getPlayerName(confirmingPlayer.player) : ''}
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                             <div className="text-center !mt-4 space-y-2">
                                <span className="text-base text-muted-foreground block">점수 확인</span>
                                 <span className="block">
                                     <span className="font-extrabold text-8xl sm:text-9xl text-primary">
                                        {confirmingPlayer?.score}
                                    </span>
                                    <span className="text-4xl sm:text-5xl text-foreground ml-2">
                                        점
                                    </span>
                                 </span>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="grid grid-cols-2 gap-4 !mt-8">
                        <AlertDialogCancel onClick={() => setConfirmingPlayer(null)} className="h-14 sm:h-16 text-xl sm:text-2xl font-bold">취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmFinalSave} className="h-14 sm:h-16 text-xl sm:text-2xl font-bold">저장</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
