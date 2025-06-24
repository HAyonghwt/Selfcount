
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, Lock, ArrowLeft } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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

    // UI State
    const [view, setView] = useState<'selection' | 'scoring'>('selection');
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [selectedJo, setSelectedJo] = useState<string>('');
    
    // Local state for scoring UI
    const [scores, setScores] = useState<{ [key: string]: ScoreData }>({});
    const [playerToSave, setPlayerToSave] = useState<Player | null>(null);

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
            }, {});
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

        setScores((prevScores) => {
            const newScoresState: { [key: string]: ScoreData } = {};
            currentPlayers.forEach((player) => {
                const existingScoreFromDb = allScores[player.id]?.[selectedCourse]?.[hole];
                const interimScore = savedInterimScores[player.id];
                
                if (existingScoreFromDb !== undefined) {
                    newScoresState[player.id] = { score: Number(existingScoreFromDb), status: 'locked' };
                } else if (interimScore && interimScore.status === 'editing') {
                    newScoresState[player.id] = { score: Number(interimScore.score), status: 'editing'};
                } else if (prevScores[player.id]?.status === 'editing' && prevScores[player.id]?.jo === player.jo) {
                    newScoresState[player.id] = prevScores[player.id];
                } else {
                    newScoresState[player.id] = { score: 1, status: 'editing' };
                }
            });
            return newScoresState;
        });
        
    }, [view, selectedJo, selectedCourse, hole, allScores, currentPlayers]);


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
        
        set(scoreRef, scoreData.score).then(() => {
            // Don't show toast, UI change is enough
        }).catch(err => {
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
                      <CardContent className="p-2">
                        <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-lg truncate pr-2">{getPlayerName(player)}</p>
                            </div>
                            
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" size="icon" className="w-11 h-11 rounded-lg border-2" onClick={() => updateScore(player.id, -1)} disabled={isLocked}><Minus className="h-6 w-6" /></Button>
                                    <div className="relative w-10 text-center">
                                        <span className={`text-4xl font-bold tabular-nums`}>{scoreData.score}</span>
                                    </div>
                                    <Button variant="outline" size="icon" className="w-11 h-11 rounded-lg border-2" onClick={() => updateScore(player.id, 1)} disabled={isLocked}><Plus className="h-6 w-6" /></Button>
                                </div>
                                
                                <Button variant="default" size="icon" className="w-11 h-11 rounded-lg" onClick={() => handleSavePress(player)} disabled={isLocked}>
                                    {isLocked ? (
                                        <Lock className="w-6 h-6 text-green-500" />
                                    ) : (
                                        <Save className="h-6 w-6" />
                                    )}
                                </Button>
                            </div>
                        </div>
                      </CardContent>
                    </Card>
                )
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
            </div>
            
            <AlertDialog open={!!playerToSave} onOpenChange={(open) => !open && setPlayerToSave(null)}>
                <AlertDialogContent>
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                        {playerToSave && (
                             <p className="text-2xl font-bold mb-2">{getPlayerName(playerToSave)}</p>
                        )}
                       
                        {playerToSave && scores[playerToSave.id] && (
                             <div className="flex items-baseline my-2">
                                <span className="text-6xl font-extrabold text-destructive leading-none">{scores[playerToSave.id].score}</span>
                                <span className="text-2xl font-bold ml-2">점</span>
                            </div>
                        )}
                        
                        <p className="text-base font-semibold mt-2 text-muted-foreground">저장하시겠습니까?</p>
                    </div>
                    <AlertDialogFooter className="grid grid-cols-2 gap-4 pt-4">
                        <AlertDialogCancel onClick={() => setPlayerToSave(null)} className="h-11 px-6 text-base">취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmSave} className="h-11 px-6 text-base">확인</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
