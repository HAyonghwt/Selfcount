
"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, Lock, Edit, CheckCircle2, ArrowLeft } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';

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
    const { toast } = useToast();

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
    const [now, setNow] = useState(Date.now());
    const saveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
    
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

    // Automatically reset selections when a group is fully scored.
    useEffect(() => {
        if (selectedGroup && availableJos.length > 0 && availableJos.length === completedJos.size) {
            toast({
                title: "그룹 심사 완료",
                description: `'${selectedGroup}' 그룹의 모든 조의 점수 입력이 완료되었습니다. 다른 그룹을 선택하세요.`,
                duration: 5000,
            });
            setView('selection');
            setScores({});
            setSelectedGroup('');
            setSelectedCourse('');
            setSelectedJo('');
        }
    }, [completedJos, availableJos, selectedGroup, toast]);


    const selectedCourseName = useMemo(() => courses.find(c => c.id.toString() === selectedCourse)?.name || '', [courses, selectedCourse]);
    
    // When view changes to 'scoring', initialize or intelligently update the scores state
    useEffect(() => {
        if (view === 'scoring' && selectedGroup && selectedCourse && selectedJo) {
            let restoredScores: { [key: string]: ScoreData } = {};
            try {
                const storageKey = `parkscore-referee-scores-${selectedGroup}-${selectedCourse}-${selectedJo}`;
                const savedScoresJSON = localStorage.getItem(storageKey);
                if (savedScoresJSON) {
                    restoredScores = JSON.parse(savedScoresJSON);
                }
            } catch (e) {
                console.error("Could not restore scores from localStorage:", e);
            }
            
            const finalScoresState: { [key: string]: ScoreData } = {};
            currentPlayers.forEach((player) => {
                const existingScoreFromDb = allScores[player.id]?.[selectedCourse]?.[hole];
                const restoredPlayerData = restoredScores[player.id];

                if (existingScoreFromDb !== undefined) {
                    finalScoresState[player.id] = { score: existingScoreFromDb, status: 'locked' };
                } else if (restoredPlayerData) {
                    finalScoresState[player.id] = {
                        ...restoredPlayerData,
                        status: restoredPlayerData.status === 'locked' ? 'editing' : restoredPlayerData.status
                    };
                } else {
                    finalScoresState[player.id] = { score: 1, status: 'editing' };
                }
            });

            setScores(finalScoresState);
        }
    }, [view, currentPlayers, allScores, selectedCourse, selectedJo, hole, selectedGroup]);


    // Persist scores to localStorage on change to prevent data loss on refresh
    useEffect(() => {
        if (view === 'scoring' && Object.keys(scores).length > 0 && selectedGroup && selectedCourse && selectedJo) {
            try {
                const storageKey = `parkscore-referee-scores-${selectedGroup}-${selectedCourse}-${selectedJo}`;
                localStorage.setItem(storageKey, JSON.stringify(scores));
            } catch (e) {
                console.error("Failed to save scores to localStorage", e);
            }
        }
    }, [scores, view, selectedGroup, selectedCourse, selectedJo]);


    // Cleanup localStorage when all players in the Jo are locked
    useEffect(() => {
        if (view === 'scoring' && currentPlayers.length > 0) {
            const allLocked = currentPlayers.every(p => scores[p.id]?.status === 'locked');
            if (allLocked) {
                try {
                    const storageKey = `parkscore-referee-scores-${selectedGroup}-${selectedCourse}-${selectedJo}`;
                    localStorage.removeItem(storageKey);
                } catch (e) {
                    console.error("Failed to clear localStorage after all scores locked.", e);
                }
            }
        }
    }, [scores, view, currentPlayers, selectedGroup, selectedCourse, selectedJo]);

    // Delayed saving logic
    useEffect(() => {
        const timers = saveTimers.current;

        Object.entries(scores).forEach(([playerId, scoreData]) => {
            if (scoreData.status === 'saved' && !timers.has(playerId)) {
                const timer = setTimeout(() => {
                    const scoreRef = ref(db, `/scores/${playerId}/${selectedCourse}/${hole}`);
                    set(scoreRef, scoreData.score).then(() => {
                        setScores(prev => (prev[playerId]?.status === 'saved') ? { ...prev, [playerId]: { ...prev[playerId], status: 'locked' } } : prev);
                        const player = currentPlayers.find(p => p.id === playerId);
                        if (player) {
                            toast({
                                title: "최종 저장 완료",
                                description: `${getPlayerName(player)} 선수의 점수가 최종 저장되었습니다.`
                            });
                        }
                        timers.delete(playerId);
                    }).catch(err => {
                        setScores(prev => ({...prev, [playerId]: {...prev[playerId], status: 'editing'}}));
                        toast({ title: "저장 실패", description: err.message, variant: "destructive" });
                        timers.delete(playerId);
                    });
                }, 10000); // 10 seconds delay
                timers.set(playerId, timer);
            }
        });

        return () => {
            timers.forEach(timer => clearTimeout(timer));
        };
    }, [scores, selectedCourse, hole, currentPlayers, toast]);


    // ---- Handlers ----
    const handleStartScoring = () => {
        if (selectedGroup && selectedCourse && selectedJo) {
            setView('scoring');
        } else {
            toast({
                title: "선택 필요",
                description: "그룹, 코스, 조를 모두 선택해주세요.",
            });
        }
    };
    
    const handleReturnToJoSelection = () => {
        try {
            if(selectedGroup && selectedCourse && selectedJo) {
                const storageKey = `parkscore-referee-scores-${selectedGroup}-${selectedCourse}-${selectedJo}`;
                localStorage.removeItem(storageKey);
            }
        } catch(e) {
            console.error("Failed to clear localStorage for Jo", e);
        }

        setView('selection');
        setSelectedJo(''); 
        setScores({}); 
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

        setScores(prev => ({ ...prev, [player.id]: { score, status: 'saved', savedAt: Date.now() } }));
        toast({
            title: "임시 저장 완료", 
            description: "10초 후 자동 저장됩니다. 그 전에 수정할 수 있습니다.",
            duration: 3000,
        });
        setConfirmingPlayer(null);
    };

    const handleScoreClickToEdit = (player: Player) => {
        if (scores[player.id]?.status === 'saved') {
            const timers = saveTimers.current;
            if (timers.has(player.id)) {
                clearTimeout(timers.get(player.id)!);
                timers.delete(player.id);
            }
            
            setScores(prev => ({
                ...prev,
                [player.id]: { ...prev[player.id], status: 'editing' }
            }));
            toast({ title: "수정 모드", description: `${getPlayerName(player)} 선수의 점수를 다시 수정합니다.` });
        }
    }

    const getPlayerName = (player: Player) => player.type === 'team' ? `${player.p1_name}/${player.p2_name}` : player.name;
    
    const renderSelectionScreen = () => {
        const isGroupSelectionDisabled = availableGroups.length > 0 && !!selectedGroup;
        const isCourseSelectionDisabled = !selectedGroup || !!selectedCourse || availableCoursesForGroup.length === 0;

        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">심사 조 선택</CardTitle>
                    <CardDescription className="text-sm">점수를 기록할 그룹, 코스, 조를 선택하세요.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Select value={selectedGroup} onValueChange={v => {setSelectedGroup(v); setSelectedCourse(''); setSelectedJo('');}} disabled={isGroupSelectionDisabled}>
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder="1. 그룹 선택" /></SelectTrigger>
                        <SelectContent position="item-aligned">
                            {availableGroups.map(g => <SelectItem key={g} value={g} className="text-base">{g}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={selectedCourse} onValueChange={v => {setSelectedCourse(v); setSelectedJo('');}} disabled={isCourseSelectionDisabled}>
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
                                    <SelectItem key={jo} value={jo.toString()} disabled={isCompleted}>
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
                     {isGroupSelectionDisabled && (
                        <Button variant="outline" className="w-full" onClick={() => { setSelectedGroup(''); setSelectedCourse(''); setSelectedJo(''); }}>그룹/코스 변경</Button>
                     )}
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
                    ? ((Date.now() - scoreData.savedAt) / 10000) * 100
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
                                <div className="relative w-10 text-center" onClick={() => handleScoreClickToEdit(player)}>
                                    <span className={`text-4xl font-bold tabular-nums ${isSaved ? 'cursor-pointer' : ''}`}>{scoreData.score}</span>
                                </div>
                                <Button variant="outline" size="icon" className="w-11 h-11 rounded-lg border-2 flex-shrink-0" onClick={() => updateScore(player.id, 1)} disabled={!isEditing}><Plus className="h-6 w-6" /></Button>
                            </div>
                            <div className="w-11 h-11 flex-shrink-0">
                                {isEditing && <Button variant="default" size="icon" className="w-full h-full rounded-lg" onClick={() => handleSavePress(player)}><Save className="h-6 w-6" /></Button>}
                                {isSaved && (
                                    <div className="flex flex-col items-center justify-center h-full w-full text-center relative border border-dashed border-primary/50 rounded-lg cursor-pointer" onClick={() => handleScoreClickToEdit(player)}>
                                        <Edit className="absolute top-1 right-1 w-3 h-3 text-primary animate-pulse" />
                                        <p className="text-xs text-primary font-bold leading-tight">수정</p>
                                        <Progress value={progressValue} className="h-0.5 mt-0.5 w-10/12 mx-auto" />
                                    </div>
                                )}
                                {isLocked && (
                                    <div className="flex items-center justify-center h-full w-full bg-muted text-muted-foreground rounded-lg">
                                        <CheckCircle2 className="w-6 h-6 text-green-500" />
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
