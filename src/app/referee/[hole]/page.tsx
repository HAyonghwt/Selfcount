"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, ChevronDown, CheckCircle, Lock, Edit } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
    affiliation?: string;
    p1_affiliation?: string;
}
interface Course { id: number; name: string; isActive: boolean; }
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

    // For countdown display
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
        return [...new Set(allPlayers.filter(p => p.group === selectedGroup).map(p => p.jo))].sort((a, b) => a - b);
    }, [allPlayers, selectedGroup]);
    
    const currentPlayers = useMemo(() => {
        if (!selectedGroup || !selectedJo) return [];
        return allPlayers.filter(p => p.group === selectedGroup && p.jo.toString() === selectedJo);
    }, [allPlayers, selectedGroup, selectedJo]);

    useEffect(() => {
        const newScores: { [key: string]: ScoreData } = {};
        let needsUpdate = false;
        currentPlayers.forEach((p: Player) => {
            if (!scores[p.id]) {
                newScores[p.id] = { score: 1, status: 'editing' };
                needsUpdate = true;
            }
        });
        if (needsUpdate) {
            setScores(prev => ({...prev, ...newScores}));
        }
    }, [currentPlayers, scores]);

    useEffect(() => {
        const timers: NodeJS.Timeout[] = [];
        Object.entries(scores).forEach(([playerId, scoreData]) => {
            if (scoreData.status === 'saved') {
                const timer = setTimeout(() => {
                    setScores(prev => {
                        if (prev[playerId]?.status === 'saved') { // Check if still 'saved'
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
    
    const getPlayerName = (player: Player) => player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name;
    const getPlayerAffiliation = (player: Player) => player.type === 'team' ? player.p1_affiliation : player.affiliation;

    const handleSavePress = (player: Player) => {
        if (scores[player.id]?.status === 'editing') {
            setConfirmingPlayer({ player, score: scores[player.id].score });
        }
    };
    
    const handleConfirmFinalSave = () => {
        if (!confirmingPlayer || !selectedCourse) return;
        const { player, score } = confirmingPlayer;

        const updates: { [key: string]: any } = {};
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

    const isReady = selectedCourse && selectedGroup && selectedJo && currentPlayers.length > 0;

    return (
        <div className="bg-slate-50 min-h-screen p-4 flex flex-col font-body">
            <header className="text-center mb-4">
                <h1 className="text-4xl font-extrabold text-primary break-keep leading-tight">{hole}번홀 점수 기록</h1>
                <p className="text-muted-foreground text-base">담당 심판용 페이지</p>
            </header>

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
                            <SelectTrigger className="h-12 text-base"><SelectValue placeholder={selectedGroup && availableCoursesForGroup.length === 0 ? "배정된 코스 없음" : "2. 코스 선택"} /></SelectTrigger>
                            <SelectContent>{availableCoursesForGroup.map(c => <SelectItem key={c.id} value={c.id.toString()} className="text-base">{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedJo} onValueChange={setSelectedJo} disabled={!selectedGroup || availableJos.length === 0}>
                            <SelectTrigger className="h-12 text-base"><SelectValue placeholder={selectedGroup && availableJos.length === 0 ? "배정된 조 없음" : "3. 조 선택"} /></SelectTrigger>
                            <SelectContent>{availableJos.map(j => <SelectItem key={j} value={j.toString()} className="text-base">{j}조</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col pt-4">
                    {!isReady ? (
                         <div className="text-center text-muted-foreground py-10 flex-1 flex flex-col justify-center items-center">
                            <ChevronDown className="mx-auto h-12 w-12 animate-bounce"/>
                            <p className="mt-4 text-lg">상단에서 그룹, 코스, 조를 순서대로 선택해주세요.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {currentPlayers.map(player => {
                                const scoreData = scores[player.id];
                                if (!scoreData) return null;
                                
                                const isEditing = scoreData.status === 'editing';
                                const isSaved = scoreData.status === 'saved';
                                const isLocked = scoreData.status === 'locked';

                                return (
                                <div key={player.id} className="bg-white rounded-lg shadow p-2">
                                    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                                        
                                        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                                            {/* Player Info */}
                                            <div>
                                                <p className="font-bold text-xl truncate">{getPlayerName(player)}</p>
                                                <p className="text-sm text-muted-foreground truncate">{getPlayerAffiliation(player)}</p>
                                            </div>

                                            {/* Score Controls */}
                                            <div className="flex items-center gap-1">
                                                <Button variant="outline" size="icon" className="w-12 h-12 border-2 rounded-md" onClick={() => updateScore(player.id, -1)} disabled={!isEditing}>
                                                    <Minus className="h-7 w-7" />
                                                </Button>
                                                <div className="relative w-16 text-center" onDoubleClick={() => handleScoreDoubleClick(player)}>
                                                    <span className={`text-5xl font-bold tabular-nums ${isSaved ? 'cursor-pointer' : ''}`}>
                                                        {scoreData.score}
                                                    </span>
                                                </div>
                                                <Button variant="outline" size="icon" className="w-12 h-12 border-2 rounded-md" onClick={() => updateScore(player.id, 1)} disabled={!isEditing}>
                                                    <Plus className="h-7 w-7" />
                                                </Button>
                                            </div>
                                        </div>
                                        
                                        {/* Action Button/Status */}
                                        <div className="w-12 h-12">
                                            {isEditing && (
                                                <Button variant="default" size="icon" className="w-full h-full rounded-md" onClick={() => handleSavePress(player)}>
                                                    <Save className="h-6 w-6" />
                                                </Button>
                                            )}
                                            {isSaved && (
                                                <div className="flex flex-col items-center justify-center h-full text-center relative" onDoubleClick={() => handleScoreDoubleClick(player)}>
                                                     <Edit className="absolute top-0 right-0 w-4 h-4 text-primary animate-pulse" />
                                                     <p className="text-xs text-primary font-bold">저장됨</p>
                                                     <Progress value={(now % 10000) / 100} className="h-1 mt-1 w-full" />
                                                </div>
                                            )}
                                            {isLocked && (
                                                <div className="flex items-center justify-center h-full bg-muted text-muted-foreground rounded-md">
                                                    <Lock className="w-6 h-6" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <AlertDialog open={!!confirmingPlayer} onOpenChange={(open) => !open && setConfirmingPlayer(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-center text-4xl leading-tight">{confirmingPlayer?.player ? getPlayerName(confirmingPlayer.player) : ''}님</AlertDialogTitle>
                         <AlertDialogDescription className="text-center !mt-4">
                            <span className="font-extrabold text-9xl text-destructive">{confirmingPlayer?.score}</span>
                            <span className="text-5xl text-foreground ml-2">점</span>
                         </AlertDialogDescription>
                         <p className="text-center text-2xl text-muted-foreground pt-2">이 점수로 저장하시겠습니까?</p>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="grid grid-cols-2 gap-4 !mt-8">
                        <AlertDialogCancel className="h-16 text-2xl font-bold">취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmFinalSave} className="h-16 text-2xl font-bold">
                            <CheckCircle className="mr-2 h-7 w-7"/> 확인
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
