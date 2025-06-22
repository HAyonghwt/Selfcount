"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Save, ChevronDown, CheckCircle, Lock } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { db } from '@/lib/firebase';
import { ref, onValue, update } from 'firebase/database';

interface Player { id: string; name?: string; type: 'individual' | 'team'; players?: any[]; jo: number; group: string; p1_name?: string; p2_name?: string }
interface Course { id: number; name: string; isActive: boolean; }

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

    const [scores, setScores] = useState<{[key: string]: number}>({});
    const [showConfirm, setShowConfirm] = useState(false);
    const [locked, setLocked] = useState(false);
    const [lockTimer, setLockTimer] = useState(10);

    useEffect(() => {
        const playersRef = ref(db, 'players');
        const tournamentRef = ref(db, 'tournaments/current');

        const unsubscribePlayers = onValue(playersRef, (snapshot) => {
            const data = snapshot.val() || {};
            setAllPlayers(Object.entries(data).map(([id, player]) => ({ id, ...player as object } as Player)));
        });

        const unsubscribeTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setCourses(data.courses ? Object.values(data.courses).filter((c:any) => c.isActive) : []);
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
        return [...new Set(allPlayers.filter(p => p.group === selectedGroup).map(p => p.jo))].sort((a,b) => a - b);
    }, [allPlayers, selectedGroup]);
    
    const currentPlayers = useMemo(() => {
        if (!selectedGroup || !selectedJo) return [];
        return allPlayers.filter(p => p.group === selectedGroup && p.jo.toString() === selectedJo);
    }, [allPlayers, selectedGroup, selectedJo]);

    useEffect(() => {
        if (currentPlayers.length > 0) {
            const initialScores: {[key: string]: number} = {};
            // Set initial score to par (3), or fetch it from db if available
            // For now, let's stick to 3.
            currentPlayers.forEach((p: Player) => initialScores[p.id] = 3);
            setScores(initialScores);
            setLocked(false);
            setLockTimer(10); // Reset timer
        } else {
            setScores({});
        }
    }, [currentPlayers]);

     useEffect(() => {
        let timerId: NodeJS.Timeout;
        if (locked) {
            setLockTimer(10); // Start from 10
            timerId = setInterval(() => {
                setLockTimer(prev => {
                    if (prev <= 1) {
                        clearInterval(timerId);
                        toast({ title: "점수 입력이 최종 마감되었습니다." });
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timerId);
    }, [locked, toast]);

    const updateScore = (id: string, delta: number) => {
        if (locked && lockTimer === 0) return;
        setScores(prev => ({ ...prev, [id]: Math.max(1, (prev[id] || 0) + delta) }));
    };

    const handleFinalSave = () => {
        if (!selectedCourse) {
             toast({ title: "오류", description: "코스가 선택되지 않았습니다.", variant: "destructive" });
             return;
        }
        const updates: { [key: string]: any } = {};
        currentPlayers.forEach(player => {
            updates[`/scores/${player.id}/${selectedCourse}/${hole}`] = scores[player.id];
        });

        update(ref(db), updates).then(() => {
            setLocked(true);
            toast({ title: "점수가 저장되었습니다.", description: "10초 후 점수 수정이 불가능합니다.", className:"bg-green-500 text-white" });
            setShowConfirm(false);
        }).catch(err => toast({ title: "저장 실패", description: err.message, variant: "destructive" }));
    }
    
    const getPlayerName = (player: Player) => {
        return player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name;
    }

    const isReady = selectedCourse && selectedGroup && selectedJo && currentPlayers.length > 0;

    return (
        <div className="bg-slate-50 min-h-screen p-4 flex flex-col font-body">
            <header className="text-center mb-4">
                <h1 className="text-4xl md:text-5xl font-extrabold text-primary break-keep">{hole}번홀 점수 기록</h1>
                <p className="text-muted-foreground text-lg">담당 심판용 페이지</p>
            </header>

            <Card className="flex-1 flex flex-col">
                <CardHeader>
                    <CardTitle className="text-2xl">조 선택</CardTitle>
                    <CardDescription className="text-base">점수를 기록할 그룹, 코스, 조를 선택하세요.</CardDescription>
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                        <Select value={selectedGroup} onValueChange={val => { setSelectedGroup(val); setSelectedCourse(''); setSelectedJo(''); setScores({}) }}>
                            <SelectTrigger className="h-16 text-xl"><SelectValue placeholder="1. 그룹 선택" /></SelectTrigger>
                            <SelectContent>{availableGroups.map(g => <SelectItem key={g} value={g} className="text-xl">{g}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedCourse} onValueChange={setSelectedCourse} disabled={!selectedGroup || availableCoursesForGroup.length === 0}>
                            <SelectTrigger className="h-16 text-xl"><SelectValue placeholder={selectedGroup && availableCoursesForGroup.length === 0 ? "배정된 코스 없음" : "2. 코스 선택"} /></SelectTrigger>
                            <SelectContent>{availableCoursesForGroup.map(c => <SelectItem key={c.id} value={c.id.toString()} className="text-xl">{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedJo} onValueChange={setSelectedJo} disabled={!selectedGroup || availableJos.length === 0}>
                            <SelectTrigger className="h-16 text-xl"><SelectValue placeholder={selectedGroup && availableJos.length === 0 ? "배정된 조 없음" : "3. 조 선택"} /></SelectTrigger>
                            <SelectContent>{availableJos.map(j => <SelectItem key={j} value={j.toString()} className="text-xl">{j}조</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center">
                    {!isReady ? (
                         <div className="text-center text-muted-foreground py-16">
                            <ChevronDown className="mx-auto h-16 w-16 animate-bounce"/>
                            <p className="mt-4 text-2xl">상단에서 그룹, 코스, 조를 순서대로 선택해주세요.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {currentPlayers.map(item => (
                                <Card key={item.id} className="p-6 shadow-lg">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="font-bold text-4xl flex-1 break-words">
                                            {getPlayerName(item)}
                                            <p className="text-2xl text-muted-foreground mt-1">{item.group}</p>
                                        </div>
                                        <div className="flex items-center gap-2 sm:gap-4">
                                            <Button size="icon" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full" variant="outline" onClick={() => updateScore(item.id, -1)} disabled={locked && lockTimer === 0}>
                                                <Minus className="h-10 w-10"/>
                                            </Button>
                                            <span className="text-8xl sm:text-9xl font-bold w-28 text-center tabular-nums">{scores[item.id]}</span>
                                             <Button size="icon" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full" variant="outline" onClick={() => updateScore(item.id, 1)} disabled={locked && lockTimer === 0}>
                                                <Plus className="h-10 w-10"/>
                                            </Button>
                                        </div>
                                    </div>
                                    {locked && lockTimer > 0 && (
                                        <div className="mt-4">
                                            <p className="text-sm text-center text-destructive">잠금까지 {lockTimer}초 남음</p>
                                            <Progress value={(10 - lockTimer) * 10} className="h-2 mt-1" />
                                        </div>
                                    )}
                                     {locked && lockTimer === 0 && (
                                        <div className="text-center mt-4 text-green-600 font-bold flex items-center justify-center gap-2 text-lg"><Lock className="w-5 h-5"/>점수 확정됨</div>
                                    )}
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="mt-4">
                <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                    <AlertDialogTrigger asChild>
                        <Button className="w-full h-24 text-3xl font-bold" disabled={!isReady || (locked && lockTimer === 0)}>
                            <Save className="mr-4 h-10 w-10"/> 최종 점수 저장
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-md">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-center text-4xl">최종 점수 확인</AlertDialogTitle>
                            <AlertDialogDescription className="text-center text-xl pt-2">{hole}번홀 점수를 저장하시겠습니까?</AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="my-6 space-y-4">
                            {currentPlayers.map(item => (
                                <div key={item.id} className="flex justify-between items-center text-3xl">
                                    <span className="font-medium">{getPlayerName(item)}</span>
                                    <span className="font-extrabold text-6xl text-destructive">{scores[item.id]}</span>
                                </div>
                            ))}
                        </div>
                        <AlertDialogFooter className="grid grid-cols-2 gap-2">
                            <AlertDialogCancel className="h-14 text-xl">취소</AlertDialogCancel>
                            <AlertDialogAction onClick={handleFinalSave} className="h-14 text-xl">
                                <CheckCircle className="mr-2 h-7 w-7"/> 확인 및 저장
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
