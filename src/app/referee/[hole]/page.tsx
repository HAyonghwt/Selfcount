
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, Lock, Edit } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { db } from '@/lib/firebase';
import { ref, onValue, update } from 'firebase/database';

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

    const [allPlayers, setAllPlayers] = useState<Player[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [groupsData, setGroupsData] = useState<any>({});

    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [selectedJo, setSelectedJo] = useState<string>('');

    const [scores, setScores] = useState<{ [key: string]: ScoreData }>({});
    const [confirmingPlayer, setConfirmingPlayer] = useState<{ player: Player; score: number; } | null>(null);

    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const playersRef = ref(db, 'players');
        const tournamentRef = ref(db, 'tournaments/current');

        const unsubscribePlayers = onValue(playersRef, (snapshot) => {
            const data = snapshot.val() || {};
            setAllPlayers(Object.entries(data).map(([id, player]) => ({ id, ...player as object } as Player)));
        });

        const unsubscribeTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setCourses(data.courses ? Object.values(data.courses).filter((c: any) => c.isActive) : []);
            setGroupsData(data.groups || {});
        });

        return () => {
            unsubscribePlayers();
            unsubscribeTournament();
        };
    }, []);
    
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
        if (groupPlayers.length === 0) return [];
        return [...new Set(groupPlayers.map(p => p.jo))].sort((a, b) => a - b);
    }, [allPlayers, selectedGroup]);

    const currentPlayers = useMemo(() => {
        if (!selectedGroup || !selectedJo) return [];
        return allPlayers.filter(p => p.group === selectedGroup && p.jo.toString() === selectedJo);
    }, [allPlayers, selectedGroup, selectedJo]);
    
    const selectedCourseName = useMemo(() => {
        if (!selectedCourse) return '';
        const course = courses.find(c => c.id.toString() === selectedCourse);
        return course ? course.name : '';
    }, [courses, selectedCourse]);

    const isReady = selectedCourse && selectedGroup && selectedJo && currentPlayers.length > 0;

    useEffect(() => {
        if (!isReady) return;
        const newScores: { [key: string]: ScoreData } = {};
        currentPlayers.forEach((p: Player) => {
            if (!scores[p.id]) {
                newScores[p.id] = { score: 1, status: 'editing' };
            }
        });
        if(Object.keys(newScores).length > 0) {
            setScores(prev => ({...prev, ...newScores}));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPlayers, isReady]);

    useEffect(() => {
        const timers: NodeJS.Timeout[] = [];
        Object.entries(scores).forEach(([playerId, scoreData]) => {
            if (scoreData.status === 'saved') {
                const timer = setTimeout(() => {
                    setScores(prev => {
                        if (prev[playerId]?.status === 'saved') {
                           return { ...prev, [playerId]: { ...prev[playerId], status: 'locked' } }
                        }
                        return prev;
                    });
                }, 10000);
                timers.push(timer);
            }
        });
        return () => timers.forEach(clearTimeout);
    }, [scores]);

    const updateScore = (id: string, delta: number) => {
        const currentData = scores[id];
        if (currentData.status !== 'editing') return;
        setScores(prev => ({
            ...prev,
            [id]: { ...prev[id], score: Math.max(1, (prev[id].score || 0) + delta) }
        }));
    };

    const getPlayerName = (player: Player) => player.type === 'team' ? `${player.p1_name}/${player.p2_name}` : player.name;

    const handleSavePress = (player: Player) => {
        if (scores[player.id]?.status === 'editing') {
            setConfirmingPlayer({ player, score: scores[player.id].score });
        }
    };

    const handleConfirmFinalSave = () => {
        if (!confirmingPlayer || !selectedCourse) return;
        const { player, score } = confirmingPlayer;

        const updates: { [key:string]: any } = {};
        updates[`/scores/${player.id}/${selectedCourse}/${hole}`] = score;

        update(ref(db), updates).then(() => {
            setScores(prev => ({
                ...prev,
                [player.id]: { score, status: 'saved' }
            }));
            toast({ title: "점수 저장 완료", description: "10초 내에 점수를 더블클릭하여 수정할 수 있습니다.", className: "bg-green-500 text-white" });
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
    
    const handleResetSelection = () => {
        setSelectedGroup('');
        setSelectedCourse('');
        setSelectedJo('');
        setScores({});
    };

    return (
        <div className="bg-slate-50 min-h-screen p-2 sm:p-4 flex flex-col font-body">
            <header className="text-center mb-4">
                <h1 className="text-3xl font-extrabold text-primary break-keep leading-tight">{hole}번홀 점수 기록</h1>
                <p className="text-muted-foreground text-base">담당 심판용 페이지</p>
            </header>

            {!isReady ? (
                 <Card className="flex-1 flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-xl">조 선택</CardTitle>
                        <CardDescription className="text-sm">점수를 기록할 그룹, 코스, 조를 선택하세요.</CardDescription>
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                            <Select value={selectedGroup} onValueChange={val => { setSelectedGroup(val); setSelectedCourse(''); setSelectedJo(''); }}>
                                <SelectTrigger className="h-12 text-base"><SelectValue placeholder="1. 그룹 선택" /></SelectTrigger>
                                <SelectContent>{availableGroups.map(g => <SelectItem key={g} value={g} className="text-base">{g}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedCourse} onValueChange={setSelectedCourse} disabled={!selectedGroup || availableCoursesForGroup.length === 0}>
                                <SelectTrigger className="h-12 text-base"><SelectValue placeholder={!selectedGroup ? "그룹 먼저 선택" : (availableCoursesForGroup.length === 0 ? "배정된 코스 없음" : "2. 코스 선택")} /></SelectTrigger>
                                <SelectContent>{availableCoursesForGroup.map(c => <SelectItem key={c.id} value={c.id.toString()} className="text-base">{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedJo} onValueChange={setSelectedJo} disabled={!selectedGroup || availableJos.length === 0}>
                                <SelectTrigger className="h-12 text-base"><SelectValue placeholder={!selectedGroup ? "그룹 먼저 선택" : (availableJos.length === 0 ? "배정된 조 없음" : "3. 조 선택")} /></SelectTrigger>
                                <SelectContent>{availableJos.map(j => <SelectItem key={j} value={j.toString()} className="text-base">{j}조</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col pt-4">
                        <div className="text-center text-muted-foreground py-10 flex-1 flex flex-col justify-center items-center">
                            <p className="mt-4 text-lg">상단에서 그룹, 코스, 조를 순서대로 선택해주세요.</p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card className="mb-4">
                        <CardHeader className="p-3">
                            <div className="flex flex-col items-center gap-2">
                                <h2 className="text-base sm:text-lg font-bold text-center break-keep">
                                    {selectedGroup} / {selectedCourseName} - {selectedJo}조
                                </h2>
                                <Button variant="outline" size="sm" onClick={handleResetSelection}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    선택 변경
                                </Button>
                            </div>
                        </CardHeader>
                    </Card>

                    <div className="flex-1 space-y-2">
                        {currentPlayers.map(player => {
                            const scoreData = scores[player.id];
                            if (!scoreData) return null;

                            const isEditing = scoreData.status === 'editing';
                            const isSaved = scoreData.status === 'saved';
                            const isLocked = scoreData.status === 'locked';

                            return (
                            <div key={player.id} className="bg-white rounded-lg shadow p-2">
                                <div className="flex items-center justify-between gap-2 w-full">
                                    
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-xl truncate w-24 flex-shrink-0">{getPlayerName(player)}</p>
                                        
                                        <div className="flex items-center gap-1.5">
                                            <Button variant="outline" size="icon" className="w-14 h-14 rounded-lg border-2" onClick={() => updateScore(player.id, -1)} disabled={!isEditing}>
                                                <Minus className="h-8 w-8" />
                                            </Button>
                                            <div className="relative w-12 text-center" onDoubleClick={() => handleScoreDoubleClick(player)}>
                                                <span className={`text-5xl font-bold tabular-nums ${isSaved ? 'cursor-pointer' : ''}`}>
                                                    {scoreData.score}
                                                </span>
                                            </div>
                                            <Button variant="outline" size="icon" className="w-14 h-14 rounded-lg border-2" onClick={() => updateScore(player.id, 1)} disabled={!isEditing}>
                                                <Plus className="h-8 w-8" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="w-14 h-14 flex-shrink-0">
                                        {isEditing && (
                                            <Button variant="default" size="icon" className="w-full h-full rounded-lg" onClick={() => handleSavePress(player)}>
                                                <Save className="h-7 w-7" />
                                            </Button>
                                        )}
                                        {isSaved && (
                                            <div className="flex flex-col items-center justify-center h-full w-full text-center relative border border-dashed border-primary/50 rounded-lg cursor-pointer" onDoubleClick={() => handleScoreDoubleClick(player)}>
                                                    <Edit className="absolute top-1 right-1 w-3 h-3 text-primary animate-pulse" />
                                                    <p className="text-xs text-primary font-bold leading-tight">저장됨</p>
                                                    <Progress value={(now % 10000) / 100} className="h-1 mt-1 w-10/12 mx-auto" />
                                            </div>
                                        )}
                                        {isLocked && (
                                            <div className="flex items-center justify-center h-full w-full bg-muted text-muted-foreground rounded-lg">
                                                <Lock className="w-7 w-7" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )})}
                    </div>
                </>
            )}

            <AlertDialog open={!!confirmingPlayer} onOpenChange={(open) => !open && setConfirmingPlayer(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-center text-2xl sm:text-3xl leading-tight">{confirmingPlayer?.player ? getPlayerName(confirmingPlayer.player) : ''}님</AlertDialogTitle>
                         <AlertDialogDescription className="text-center !mt-4">
                            <span className="font-extrabold text-8xl sm:text-9xl text-destructive">{confirmingPlayer?.score}</span>
                            <span className="text-4xl sm:text-5xl text-foreground ml-2">점</span>
                         </AlertDialogDescription>
                         <p className="text-center text-lg sm:text-xl text-muted-foreground pt-2">이 점수로 저장하시겠습니까?</p>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="grid grid-cols-2 gap-4 !mt-8">
                        <AlertDialogCancel className="h-14 sm:h-16 text-xl sm:text-2xl font-bold">취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmFinalSave} className="h-14 sm:h-16 text-xl sm:text-2xl font-bold">
                            확인
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );

    