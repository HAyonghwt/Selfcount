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
interface Course { id: number; name: string; }

export default function RefereePage() {
    const params = useParams();
    const hole = params.hole;
    const { toast } = useToast();

    const [allPlayers, setAllPlayers] = useState<Player[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);

    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [selectedJo, setSelectedJo] = useState<string>('');

    const [scores, setScores] = useState<{[key: string]: number}>({});
    const [showConfirm, setShowConfirm] = useState(false);
    const [locked, setLocked] = useState(false);
    const [lockTimer, setLockTimer] = useState(10);

    useEffect(() => {
        const playersRef = ref(db, 'players');
        const unsubscribePlayers = onValue(playersRef, (snapshot) => {
            const data = snapshot.val() || {};
            setAllPlayers(Object.entries(data).map(([id, player]) => ({ id, ...player as object } as Player)));
        });

        const coursesRef = ref(db, 'tournaments/current/courses');
        const unsubscribeCourses = onValue(coursesRef, (snapshot) => {
            const data = snapshot.val() || {};
            setCourses(Object.values(data).filter((c: any) => c.isActive));
        });

        return () => {
            unsubscribePlayers();
            unsubscribeCourses();
        };
    }, []);

    const availableGroups = useMemo(() => [...new Set(allPlayers.map(p => p.group))], [allPlayers]);
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
            currentPlayers.forEach((p: Player) => initialScores[p.id] = 3);
            setScores(initialScores);
            setLocked(false);
        } else {
            setScores({});
        }
    }, [currentPlayers]);

     useEffect(() => {
        let timerId: NodeJS.Timeout;
        if (locked) {
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
        const updates: { [key: string]: any } = {};
        currentPlayers.forEach(player => {
            updates[`/scores/${player.id}/${selectedCourse}/${hole}`] = scores[player.id];
        });

        update(ref(db), updates).then(() => {
            setLocked(true);
            setLockTimer(10);
            toast({ title: "점수가 저장되었습니다.", description: "10초 후 점수 수정이 불가능합니다.", className:"bg-green-500 text-white" });
            setShowConfirm(false);
        }).catch(err => toast({ title: "저장 실패", description: err.message, variant: "destructive" }));
    }
    
    const getPlayerName = (player: Player) => {
        return player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name;
    }

    const isReady = selectedCourse && selectedGroup && selectedJo && currentPlayers.length > 0;

    return (
        <div className="bg-slate-50 min-h-screen p-4 flex flex-col">
            <header className="text-center mb-4">
                <h1 className="text-5xl font-extrabold text-primary">{hole}번홀 점수 기록</h1>
                <p className="text-muted-foreground">담당 심판용 페이지</p>
            </header>

            <Card className="flex-1 flex flex-col">
                <CardHeader>
                    <CardTitle>조 선택</CardTitle>
                    <CardDescription>점수를 기록할 코스, 그룹, 조를 선택하세요.</CardDescription>
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                        <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                            <SelectTrigger className="h-14 text-lg"><SelectValue placeholder="코스 선택" /></SelectTrigger>
                            <SelectContent>{courses.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedGroup} onValueChange={setSelectedGroup} disabled={!selectedCourse}>
                            <SelectTrigger className="h-14 text-lg"><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                            <SelectContent>{availableGroups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedJo} onValueChange={setSelectedJo} disabled={!selectedGroup}>
                            <SelectTrigger className="h-14 text-lg"><SelectValue placeholder="조 선택" /></SelectTrigger>
                            <SelectContent>{availableJos.map(j => <SelectItem key={j} value={j.toString()}>{j}조</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center">
                    {!isReady ? (
                         <div className="text-center text-muted-foreground py-16">
                            <ChevronDown className="mx-auto h-12 w-12 animate-bounce"/>
                            <p className="mt-4 text-lg">상단에서 코스, 그룹, 조를 선택해주세요.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {currentPlayers.map(item => (
                                <Card key={item.id} className="p-4 shadow-md">
                                    <div className="flex items-center justify-between">
                                        <div className="font-bold text-xl">
                                            {getPlayerName(item)}
                                            <p className="text-sm text-muted-foreground">{item.group}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Button size="icon" className="w-16 h-16 rounded-full" variant="outline" onClick={() => updateScore(item.id, -1)} disabled={locked && lockTimer === 0}>
                                                <Minus className="h-8 w-8"/>
                                            </Button>
                                            <span className="text-6xl font-bold w-20 text-center">{scores[item.id]}</span>
                                             <Button size="icon" className="w-16 h-16 rounded-full" variant="outline" onClick={() => updateScore(item.id, 1)} disabled={locked && lockTimer === 0}>
                                                <Plus className="h-8 w-8"/>
                                            </Button>
                                        </div>
                                    </div>
                                    {locked && lockTimer > 0 && (
                                        <div className="mt-2">
                                            <p className="text-xs text-center text-destructive">잠금까지 {lockTimer}초 남음</p>
                                            <Progress value={(10 - lockTimer) * 10} className="h-1 mt-1" />
                                        </div>
                                    )}
                                     {locked && lockTimer === 0 && (
                                        <div className="text-center mt-2 text-green-600 font-bold flex items-center justify-center gap-2"><Lock className="w-4 h-4"/>점수 확정됨</div>
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
                        <Button className="w-full h-20 text-2xl font-bold" disabled={!isReady || (locked && lockTimer === 0)}>
                            <Save className="mr-4 h-8 w-8"/> 최종 점수 저장
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-sm">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-center text-3xl">최종 점수 확인</AlertDialogTitle>
                            <AlertDialogDescription className="text-center text-lg">{hole}번홀 점수를 저장하시겠습니까?</AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="my-6 space-y-4">
                            {currentPlayers.map(item => (
                                <div key={item.id} className="flex justify-between items-center text-2xl">
                                    <span className="font-medium">{getPlayerName(item)}</span>
                                    <span className="font-extrabold text-5xl text-destructive">{scores[item.id]}</span>
                                </div>
                            ))}
                        </div>
                        <AlertDialogFooter className="grid grid-cols-2 gap-2">
                            <AlertDialogCancel className="h-12 text-lg">취소</AlertDialogCancel>
                            <AlertDialogAction onClick={handleFinalSave} className="h-12 text-lg">
                                <CheckCircle className="mr-2"/> 확인 및 저장
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
