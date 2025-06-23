
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, Lock, Edit, CheckCircle2, Users, ArrowLeft } from 'lucide-react';
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
    const [flowState, setFlowState] = useState<'initial' | 'jo' | 'scoring'>('initial');
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [selectedJo, setSelectedJo] = useState<string>('');
    
    // Local state for scoring UI
    const [scores, setScores] = useState<{ [key: string]: ScoreData }>({});
    const [confirmingPlayer, setConfirmingPlayer] = useState<{ player: Player; score: number; } | null>(null);
    const [now, setNow] = useState(Date.now());
    
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

     // Reset selections when group/course changes
    useEffect(() => {
        setSelectedJo('');
        setFlowState(selectedGroup && selectedCourse ? 'jo' : 'initial');
    }, [selectedGroup, selectedCourse]);

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
    
    const selectedCourseName = useMemo(() => courses.find(c => c.id.toString() === selectedCourse)?.name || '', [courses, selectedCourse]);

    // Timer for "saved" state progress bar.
    useEffect(() => {
        let interval: NodeJS.Timeout | undefined;
        if (flowState === 'scoring') {
            interval = setInterval(() => setNow(Date.now()), 50);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [flowState]);

    // When view changes to 'scoring', initialize the scores state
    useEffect(() => {
        if (flowState === 'scoring') {
            const newScoresState: { [key: string]: ScoreData } = {};
            currentPlayers.forEach((player) => {
                const existingScore = allScores[player.id]?.[selectedCourse]?.[hole];
                newScoresState[player.id] = {
                    score: existingScore || 1,
                    status: existingScore !== undefined ? 'locked' : 'editing',
                };
            });
            setScores(newScoresState);
        }
    }, [flowState, currentPlayers, allScores, selectedCourse, hole]);

    // Timer to lock scores after saving.
    useEffect(() => {
        const timers: NodeJS.Timeout[] = [];
        Object.entries(scores).forEach(([playerId, scoreData]) => {
            if (scoreData.status === 'saved') {
                const timer = setTimeout(() => {
                    setScores(prev => (prev[playerId]?.status === 'saved') ? { ...prev, [playerId]: { ...prev[playerId], status: 'locked' } } : prev);
                }, 10000); // 10 seconds to edit
                timers.push(timer);
            }
        });
        return () => timers.forEach(clearTimeout);
    }, [scores]);


    // ---- Handlers ----
    const handleJoSelect = (jo: string) => {
        setSelectedJo(jo);
        setFlowState('scoring');
    };
    
    const handleBackToSelection = () => {
        setSelectedJo('');
        setFlowState('jo');
        setScores({});
    };

    const updateScore = (id: string, delta: number) => {
        if (scores[id]?.status === 'editing') {
            setScores(prev => ({
                ...prev,
                [id]: { ...prev[id], score: Math.max(1, prev[id].score + delta) }
            }));
        }
    };

    const handleSavePress = (player: Player) => {
        if (scores[player.id]?.status === 'editing') {
            setConfirmingPlayer({ player, score: scores[player.id].score });
        }
    };

    const handleConfirmFinalSave = () => {
        if (!confirmingPlayer || !selectedCourse) return;
        const { player, score } = confirmingPlayer;

        const scoreRef = ref(db, `/scores/${player.id}/${selectedCourse}/${hole}`);
        set(scoreRef, score).then(() => {
            setScores(prev => ({ ...prev, [player.id]: { score, status: 'saved' } }));
            toast({ title: "점수 저장 완료", description: "10초 내에 점수를 더블클릭하여 수정할 수 있습니다.", className: "bg-primary text-primary-foreground" });
        }).catch(err => toast({ title: "저장 실패", description: err.message, variant: "destructive" }))
        .finally(() => setConfirmingPlayer(null));
    };

    const handleScoreDoubleClick = (player: Player) => {
        if (scores[player.id]?.status === 'saved') {
            setScores(prev => ({
                ...prev,
                [player.id]: { ...prev[player.id], status: 'editing' }
            }));
            toast({ title: "수정 모드", description: `${getPlayerName(player)} 선수의 점수를 다시 수정합니다.` });
        }
    }

    const getPlayerName = (player: Player) => player.type === 'team' ? `${player.p1_name}/${player.p2_name}` : player.name;
    
    const renderInitialSelection = () => (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">심사 조 선택</CardTitle>
                <CardDescription className="text-sm">점수를 기록할 그룹과 코스를 선택하세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                    <SelectTrigger className="h-12 text-base"><SelectValue placeholder="1. 그룹 선택" /></SelectTrigger>
                    <SelectContent position="popper">{availableGroups.map(g => <SelectItem key={g} value={g} className="text-base">{g}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={selectedCourse} onValueChange={setSelectedCourse} disabled={!selectedGroup || availableCoursesForGroup.length === 0}>
                    <SelectTrigger className="h-12 text-base"><SelectValue placeholder={!selectedGroup ? "그룹 먼저 선택" : (availableCoursesForGroup.length === 0 ? "배정된 코스 없음" : "2. 코스 선택")} /></SelectTrigger>
                    <SelectContent position="popper">{availableCoursesForGroup.map(c => <SelectItem key={c.id} value={c.id.toString()} className="text-base">{c.name}</SelectItem>)}</SelectContent>
                </Select>
            </CardContent>
        </Card>
    );

    const renderJoSelection = () => (
         <Card>
            <CardHeader>
                <CardTitle className="text-xl">3. 조 선택</CardTitle>
                <CardDescription className="text-sm">점수를 기록할 조를 선택하세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
               {availableJos.length > 0 ? (
                    availableJos.map(jo => (
                        <Button 
                            key={jo} 
                            variant="outline"
                            className="w-full h-14 text-lg justify-start"
                            onClick={() => handleJoSelect(jo.toString())}
                        >
                            {jo}조
                        </Button>
                    ))
                ) : (
                    <div className="text-center text-muted-foreground py-10">
                        <Users className="mx-auto h-12 w-12" />
                        <p className="mt-4 text-base font-semibold">배정된 선수가 없습니다.</p>
                        <p className="text-sm">선수 관리 페이지에서 이 그룹에 선수를 추가해주세요.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );

    const renderScoringScreen = () => (
        <div className="flex-1 flex flex-col space-y-3">
            {currentPlayers.map(player => {
                const scoreData = scores[player.id];
                if (!scoreData) return null;

                const isEditing = scoreData.status === 'editing';
                const isSaved = scoreData.status === 'saved';
                const isLocked = scoreData.status === 'locked';

                return (
                    <Card key={player.id} className="overflow-hidden">
                      <CardContent className="p-2">
                        <div className="flex items-center justify-between gap-1 w-full">
                            <div className="flex items-center gap-3">
                                <p className="font-bold text-lg truncate w-24 flex-shrink-0">{getPlayerName(player)}</p>
                                
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" size="icon" className="w-12 h-12 rounded-lg border-2" onClick={() => updateScore(player.id, -1)} disabled={!isEditing}><Minus className="h-6 w-6" /></Button>
                                    <div className="relative w-12 text-center" onDoubleClick={() => handleScoreDoubleClick(player)}>
                                        <span className={`text-4xl font-bold tabular-nums ${isSaved ? 'cursor-pointer' : ''}`}>{scoreData.score}</span>
                                    </div>
                                    <Button variant="outline" size="icon" className="w-12 h-12 rounded-lg border-2" onClick={() => updateScore(player.id, 1)} disabled={!isEditing}><Plus className="h-6 w-6" /></Button>
                                </div>
                            </div>

                            <div className="w-12 h-12 flex-shrink-0">
                                {isEditing && <Button variant="default" size="icon" className="w-full h-full rounded-lg" onClick={() => handleSavePress(player)}><Save className="h-6 w-6" /></Button>}
                                {isSaved && (
                                    <div className="flex flex-col items-center justify-center h-full w-full text-center relative border border-dashed border-primary/50 rounded-lg cursor-pointer" onDoubleClick={() => handleScoreDoubleClick(player)}>
                                        <Edit className="absolute top-1 right-1 w-3 h-3 text-primary animate-pulse" />
                                        <p className="text-xs text-primary font-bold leading-tight">수정</p>
                                        <Progress value={(now % 10000) / 100} className="h-0.5 mt-0.5 w-10/12 mx-auto" />
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
                {(flowState === 'jo' || flowState === 'scoring') && (
                     <Card>
                        <CardHeader className="p-3">
                            <div className="flex justify-between items-center gap-2">
                                <div className="text-lg sm:text-xl font-bold text-center break-keep">
                                    <span>{selectedGroup}</span> 
                                    <span className="text-muted-foreground mx-1">/</span> 
                                    <span>{selectedCourseName}</span>
                                    {flowState === 'scoring' && (
                                      <>
                                        <span className="text-muted-foreground mx-1">/</span>
                                        <span>{selectedJo}조</span>
                                      </>
                                    )}
                                </div>
                                <Button variant="outline" size="sm" onClick={() => setFlowState('initial')}>
                                    <ArrowLeft className="mr-1 h-3 w-3" />
                                    그룹/코스 변경
                                </Button>
                            </div>
                        </CardHeader>
                    </Card>
                )}

                {flowState === 'initial' && renderInitialSelection()}
                {flowState === 'jo' && renderJoSelection()}
                {flowState === 'scoring' && renderScoringScreen()}
            </div>
            
            <AlertDialog open={!!confirmingPlayer} onOpenChange={(open) => !open && setConfirmingPlayer(null)}>
                <AlertDialogContent className="bg-card border-primary border-2">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-primary text-center text-2xl sm:text-3xl leading-tight">점수 확인</AlertDialogTitle>
                         <AlertDialogDescription className="text-center !mt-4">
                            <p className="text-base text-primary/80 mb-2">{confirmingPlayer?.player ? getPlayerName(confirmingPlayer.player) : ''}</p>
                            <span className="font-extrabold text-8xl sm:text-9xl text-primary">{confirmingPlayer?.score}</span>
                            <span className="text-4xl sm:text-5xl text-primary ml-2">점</span>
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


