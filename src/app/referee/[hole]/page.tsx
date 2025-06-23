
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, Lock, Edit, CheckCircle2, Trophy, Users } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';

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

    // Selection & Flow State
    const [groupLocked, setGroupLocked] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [selectedJo, setSelectedJo] = useState<string>('');

    // Local state for scoring UI
    const [scores, setScores] = useState<{ [key: string]: ScoreData }>({});
    const [confirmingPlayer, setConfirmingPlayer] = useState<{ player: Player; score: number; } | null>(null);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');

        const unsubPlayers = onValue(playersRef, (snapshot) => setAllPlayers(Object.entries(snapshot.val() || {}).map(([id, player]) => ({ id, ...player as object } as Player))));
        const unsubScores = onValue(scoresRef, (snapshot) => setAllScores(snapshot.val() || {}));
        const unsubscribeTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setCourses(data.courses ? Object.values(data.courses).filter((c: any) => c.isActive) : []);
            setGroupsData(data.groups || {});
        });

        return () => {
            unsubPlayers();
            unsubScores();
            unsubscribeTournament();
        };
    }, []);
    
    // ---- Memoized selectors ----
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
        if (!selectedJo) return [];
        return allPlayers.filter(p => p.group === selectedGroup && p.jo.toString() === selectedJo);
    }, [allPlayers, selectedGroup, selectedJo]);
    
    const selectedCourseName = useMemo(() => courses.find(c => c.id.toString() === selectedCourse)?.name || '', [courses, selectedCourse]);

    // ---- Timers and Side Effects for UI ----
    
    useEffect(() => {
        const newScoresState: { [key: string]: ScoreData } = {};
        currentPlayers.forEach((player) => {
            const existingScore = allScores[player.id]?.[selectedCourse]?.[hole];
            newScoresState[player.id] = {
                score: existingScore || 3,
                status: existingScore !== undefined ? 'locked' : 'editing',
            };
        });
        setScores(newScoresState);
    }, [currentPlayers, allScores, selectedCourse, hole]);

    useEffect(() => {
        const timers: NodeJS.Timeout[] = [];
        Object.entries(scores).forEach(([playerId, scoreData]) => {
            if (scoreData.status === 'saved') {
                const timer = setTimeout(() => {
                    setScores(prev => (prev[playerId]?.status === 'saved') ? { ...prev, [playerId]: { ...prev[playerId], status: 'locked' } } : prev);
                }, 3000);
                timers.push(timer);
            }
        });
        return () => timers.forEach(clearTimeout);
    }, [scores]);


    // ---- Handlers ----
    const handleLockGroupAndCourse = () => {
        if (selectedGroup && selectedCourse) {
            setGroupLocked(true);
        } else {
            toast({ title: "선택 필요", description: "그룹과 코스를 모두 선택해주세요.", variant: "destructive" });
        }
    };
    
    const handleResetGroupAndCourse = () => {
        setGroupLocked(false);
        setSelectedGroup('');
        setSelectedCourse('');
        setSelectedJo('');
        setScores({});
    };

    const handleResetJo = () => {
        setSelectedJo('');
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
            toast({ title: "점수 저장 완료", description: "3초 내에 점수를 더블클릭하여 수정할 수 있습니다.", className: "bg-primary text-primary-foreground" });
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
    
    // ---- Render components ----
    const renderInitialSelection = () => (
        <Card className="flex-1 flex flex-col">
            <CardHeader>
                <CardTitle className="text-xl">심사 조 선택</CardTitle>
                <CardDescription className="text-sm">점수를 기록할 그룹과 코스를 선택하세요.</CardDescription>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    <Select value={selectedGroup} onValueChange={val => { setSelectedGroup(val); setSelectedCourse(''); }}>
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder="1. 그룹 선택" /></SelectTrigger>
                        <SelectContent>{availableGroups.map(g => <SelectItem key={g} value={g} className="text-base">{g}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={selectedCourse} onValueChange={setSelectedCourse} disabled={!selectedGroup || availableCoursesForGroup.length === 0}>
                        <SelectTrigger className="h-12 text-base"><SelectValue placeholder={!selectedGroup ? "그룹 먼저 선택" : (availableCoursesForGroup.length === 0 ? "배정된 코스 없음" : "2. 코스 선택")} /></SelectTrigger>
                        <SelectContent>{availableCoursesForGroup.map(c => <SelectItem key={c.id} value={c.id.toString()} className="text-base">{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col pt-4 justify-end">
                <Button size="lg" className="w-full h-14 text-lg" onClick={handleLockGroupAndCourse} disabled={!selectedGroup || !selectedCourse}>
                    <Lock className="mr-2 h-5 w-5"/>
                    선택 완료하고 점수 기록 시작
                </Button>
            </CardContent>
        </Card>
    );

    const renderJoSelection = () => (
        <Card className="flex-1 flex flex-col">
            <CardHeader>
                <CardTitle className="text-xl">다음 조를 선택하세요</CardTitle>
                {availableJos && availableJos.length > 0 && (
                    <CardDescription>{availableJos.length}개 조가 있습니다.</CardDescription>
                )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center items-center">
                {availableJos && availableJos.length > 0 ? (
                     <Select value={selectedJo} onValueChange={setSelectedJo}>
                        <SelectTrigger className="h-14 text-lg w-full max-w-xs"><SelectValue placeholder="조 선택" /></SelectTrigger>
                        <SelectContent>
                            {availableJos.map(j => (
                                <SelectItem key={j} value={j.toString()} className="text-lg">
                                    {j}조
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                        <Users className="mx-auto h-16 w-16 text-primary" />
                        <p className="mt-4 text-lg font-semibold text-foreground">배정된 선수가 없습니다.</p>
                        <p className="mt-2 text-base">
                            현재 선택하신 '<strong className="text-primary">{selectedGroup}</strong>' 그룹에는<br/>아직 등록되거나 배정된 선수가 없습니다.
                        </p>
                        <p className="mt-4 text-sm">
                            선수 관리 페이지에서 선수를 추가하거나, <br/> 다른 그룹을 선택해주세요.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );

    const renderScoring = () => (
        <div className="flex-1 space-y-4">
            {currentPlayers.map(player => {
                const scoreData = scores[player.id];
                if (!scoreData) return null;

                const isEditing = scoreData.status === 'editing';
                const isSaved = scoreData.status === 'saved';
                const isLocked = scoreData.status === 'locked';

                return (
                    <div key={player.id} className="bg-white rounded-lg shadow p-2">
                        <div className="flex items-center justify-between gap-1 w-full">
                            <div className="flex items-center gap-2">
                                <p className="font-bold text-lg truncate w-20 flex-shrink-0">{getPlayerName(player)}</p>
                                
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" size="icon" className="w-10 h-10 rounded-lg border-2" onClick={() => updateScore(player.id, -1)} disabled={!isEditing}><Minus className="h-5 w-5" /></Button>
                                    <div className="relative w-10 text-center" onDoubleClick={() => handleScoreDoubleClick(player)}>
                                        <span className={`text-3xl font-bold tabular-nums ${isSaved ? 'cursor-pointer' : ''}`}>{scoreData.score}</span>
                                    </div>
                                    <Button variant="outline" size="icon" className="w-10 h-10 rounded-lg border-2" onClick={() => updateScore(player.id, 1)} disabled={!isEditing}><Plus className="h-5 w-5" /></Button>
                                </div>
                            </div>

                            <div className="w-10 h-10 flex-shrink-0">
                                {isEditing && <Button variant="default" size="icon" className="w-full h-full rounded-lg" onClick={() => handleSavePress(player)}><Save className="h-5 w-5" /></Button>}
                                {isSaved && (
                                    <div className="flex flex-col items-center justify-center h-full w-full text-center relative border border-dashed border-primary/50 rounded-lg cursor-pointer" onDoubleClick={() => handleScoreDoubleClick(player)}>
                                        <Edit className="absolute top-0.5 right-0.5 w-2 h-2 text-primary animate-pulse" />
                                        <p className="text-[8px] text-primary font-bold leading-tight">수정가능</p>
                                        <Progress value={(now % 3000) / 30} className="h-0.5 mt-0.5 w-10/12 mx-auto" />
                                    </div>
                                )}
                                {isLocked && (
                                    <div className="flex items-center justify-center h-full w-full bg-muted text-muted-foreground rounded-lg">
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
             <Button variant="secondary" className="w-full" onClick={handleResetJo}>다른 조 기록</Button>
        </div>
    );

    return (
        <div className="bg-slate-50 min-h-screen p-2 sm:p-4 flex flex-col font-body">
            <header className="text-center mb-4">
                <h1 className="text-3xl font-extrabold text-primary break-keep leading-tight">{hole}번홀 점수 기록</h1>
                <p className="text-muted-foreground text-base">담당 심판용 페이지</p>
            </header>

            {!groupLocked ? renderInitialSelection() : (
                <>
                    <Card className="mb-4">
                        <CardHeader className="p-3">
                            <div className="flex justify-between items-center gap-2">
                                <h2 className="text-lg sm:text-xl font-bold text-center break-keep">
                                    {selectedGroup} / {selectedCourseName}
                                </h2>
                                <Button variant="outline" size="sm" onClick={handleResetGroupAndCourse}>
                                    <Edit className="mr-1 h-3 w-3" />
                                    그룹/코스 변경
                                </Button>
                            </div>
                        </CardHeader>
                    </Card>

                    {!selectedJo ? renderJoSelection() : renderScoring()}
                </>
            )}

            <AlertDialog open={!!confirmingPlayer} onOpenChange={(open) => !open && setConfirmingPlayer(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-center text-2xl sm:text-3xl leading-tight">{confirmingPlayer?.player ? getPlayerName(confirmingPlayer.player) : ''}님</AlertDialogTitle>
                         <AlertDialogDescription className="text-center !mt-4">
                            <span className="font-extrabold text-8xl sm:text-9xl text-foreground">{confirmingPlayer?.score}</span>
                            <span className="text-4xl sm:text-5xl text-foreground ml-2">점</span>
                         </AlertDialogDescription>
                         <p className="text-center text-lg sm:text-xl text-muted-foreground pt-2">이 점수로 저장하시겠습니까?</p>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="grid grid-cols-2 gap-4 !mt-8">
                        <AlertDialogCancel onClick={() => setConfirmingPlayer(null)} className="h-14 sm:h-16 text-xl sm:text-2xl font-bold">취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmFinalSave} className="h-14 sm:h-16 text-xl sm:text-2xl font-bold">확인</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
