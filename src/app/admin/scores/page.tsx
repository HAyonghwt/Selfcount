
"use client";
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Save, Eye, EyeOff } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';

interface ScoreEntry {
  id: string; // Composite key: playerId-courseId-hole
  playerId: string;
  courseId: string;
  group: string;
  jo: number;
  name: string;
  course: string;
  hole: number;
  score: number;
}

export default function ScoreManagementPage() {
    const [allScores, setAllScores] = useState({});
    const [allPlayers, setAllPlayers] = useState({});
    const [allCourses, setAllCourses] = useState({});
    const [flatScores, setFlatScores] = useState<ScoreEntry[]>([]);
    const [unlockPassword, setUnlockPassword] = useState(''); // 초기값을 빈 문자열로 유지 (345678 제거)
    const [showPassword, setShowPassword] = useState(false);

    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<number | string>('');
    const [scoreToUpdate, setScoreToUpdate] = useState<ScoreEntry | null>(null);
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState(''); // 초기값을 빈 문자열로 유지 (admin@test.cpm 제거)
    const [filterGroup, setFilterGroup] = useState('all');
    const [filterCourse, setFilterCourse] = useState('all');


    useEffect(() => {
        const scoresRef = ref(db, 'scores');
        const playersRef = ref(db, 'players');
        const coursesRef = ref(db, 'tournaments/current/courses');

        const unsubScores = onValue(scoresRef, snap => setAllScores(snap.val() || {}));
        const unsubPlayers = onValue(playersRef, snap => setAllPlayers(snap.val() || {}));
        const unsubCourses = onValue(coursesRef, snap => setAllCourses(snap.val() || {}));

        return () => {
            unsubScores();
            unsubPlayers();
            unsubCourses();
        };
    }, []);

    useEffect(() => {
        const playersMap = new Map(Object.entries(allPlayers));
        const coursesMap = new Map(Object.values(allCourses).map((c: any) => [c.id, c.name]));
        
        const newFlatScores: ScoreEntry[] = [];

        for (const playerId in allScores) {
            const player = playersMap.get(playerId);
            if (!player) continue;

            for (const courseId in allScores[playerId]) {
                const courseName = coursesMap.get(Number(courseId));
                if (!courseName) continue;

                for (const hole in allScores[playerId][courseId]) {
                    newFlatScores.push({
                        id: `${playerId}-${courseId}-${hole}`,
                        playerId,
                        courseId,
                        group: player.group,
                        jo: player.jo,
                        name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                        course: courseName,
                        hole: Number(hole),
                        score: allScores[playerId][courseId][hole],
                    });
                }
            }
        }
        setFlatScores(newFlatScores.sort((a,b) => a.jo - b.jo || a.hole - b.hole));
    }, [allScores, allPlayers, allCourses]);

    const filteredScores = useMemo(() => {
        return flatScores.filter(score => {
            const nameMatch = score.name.toLowerCase().includes(searchTerm.toLowerCase());
            const groupMatch = filterGroup === 'all' || score.group === groupMatch;
            const courseMatch = filterCourse === 'all' || score.course === filterCourse;
            return nameMatch && groupMatch && courseMatch;
        });
    }, [flatScores, searchTerm, filterGroup, filterCourse]);

    const handleDoubleClick = (score: ScoreEntry) => {
        setEditingCell(score.id);
        setEditValue(score.score);
    };

    const handleUpdateAttempt = (score: ScoreEntry) => {
        setScoreToUpdate({ ...score, score: Number(editValue) });
    };

    const handleConfirmUpdate = () => {
        if (!scoreToUpdate) return;
        
        const scoreRef = ref(db, `scores/${scoreToUpdate.playerId}/${scoreToUpdate.courseId}/${scoreToUpdate.hole}`);
        set(scoreRef, scoreToUpdate.score).then(() => {
            toast({
                title: "점수 수정 완료",
                description: `${scoreToUpdate.group} ${scoreToUpdate.jo}조 ${scoreToUpdate.name} 선수의 ${scoreToUpdate.course} ${scoreToUpdate.hole}홀 점수가 ${scoreToUpdate.score}점으로 수정되었습니다.`,
            });
            setEditingCell(null);
            setScoreToUpdate(null);
        }).catch(err => {
            toast({ title: "수정 실패", description: err.message });
        });
    };
    
    const handleSaveUnlockPassword = () => {
        if (unlockPassword.trim() === '') {
            toast({ title: '오류', description: '비밀번호를 입력해주세요.', variant: 'destructive' });
            return;
        }
        set(ref(db, 'config/scoreUnlockPassword'), unlockPassword)
            .then(() => toast({ title: '성공', description: '잠금 해제 비밀번호가 저장되었습니다.' }))
            .catch(err => toast({ title: '저장 실패', description: err.message, variant: 'destructive' }));
    };

    const availableGroups = [...new Set(flatScores.map(s => s.group))];
    const availableCourses = [...new Set(flatScores.map(s => s.course))];

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline">점수 관리</CardTitle>
                    <CardDescription>선수별 점수를 확인하고 수정합니다. 수정하려면 점수 셀을 더블 클릭하세요.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 p-4 bg-muted/50 rounded-lg">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input 
                                id="score-search"
                                name="score-search"
                                placeholder="선수명으로 검색..." 
                                className="pl-10 h-12" 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                autoComplete="new-password" />
                        </div>
                        <Select value={filterGroup} onValueChange={setFilterGroup}><SelectTrigger className="w-full md:w-[180px] h-12"><SelectValue placeholder="그룹 선택" /></SelectTrigger><SelectContent><SelectItem value="all">모든 그룹</SelectItem>{availableGroups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
                        <Select value={filterCourse} onValueChange={setFilterCourse}><SelectTrigger className="w-full md:w-[180px] h-12"><SelectValue placeholder="코스 선택" /></SelectTrigger><SelectContent><SelectItem value="all">모든 코스</SelectItem>{availableCourses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>점수 수정 잠금해제 설정</CardTitle>
                    <CardDescription>심판 페이지에서 잠긴 점수를 수정할 때 사용할 숫자 비밀번호를 설정합니다.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="space-y-2 flex-1 w-full">
                        <Label htmlFor="unlock-password">잠금 해제 비밀번호 (숫자)</Label>
                        <div className="relative">
                            <Input
                                id="unlock-password"
                                type={showPassword ? 'text' : 'password'}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={unlockPassword}
                                onChange={e => setUnlockPassword(e.target.value)}
                                placeholder="숫자 비밀번호 입력"
                                className="pr-10"
                                autoComplete="new-password"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute inset-y-0 right-0 h-full w-auto px-3 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowPassword(prev => !prev)}
                                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                            >
                                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </Button>
                        </div>
                    </div>
                    <Button onClick={handleSaveUnlockPassword}>
                        <Save className="mr-2 h-4 w-4" />
                        비밀번호 저장
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>전체 점수 현황</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>그룹</TableHead>
                                    <TableHead>조</TableHead>
                                    <TableHead>선수/팀</TableHead>
                                    <TableHead>코스</TableHead>
                                    <TableHead>홀</TableHead>
                                    <TableHead className="text-center">점수</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredScores.map((score) => (
                                    <TableRow key={score.id}>
                                        <TableCell>{score.group}</TableCell>
                                        <TableCell>{score.jo}</TableCell>
                                        <TableCell className="font-medium">{score.name}</TableCell>
                                        <TableCell>{score.course}</TableCell>
                                        <TableCell>{score.hole}</TableCell>
                                        <TableCell className="text-center" onDoubleClick={() => handleDoubleClick(score)}>
                                            {editingCell === score.id ? (
                                                <AlertDialog open={!!scoreToUpdate} onOpenChange={(open) => !open && setScoreToUpdate(null)}>
                                                    <form onSubmit={(e) => { e.preventDefault(); handleUpdateAttempt(score); }} className="flex items-center justify-center gap-2">
                                                        <Input
                                                            type="number"
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            className="h-8 w-16 text-center"
                                                            autoFocus
                                                            onBlur={() => setEditingCell(null)}
                                                        />
                                                         <Button type="submit" size="sm">저장</Button>
                                                    </form>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>점수를 수정하시겠습니까?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                <div className="space-y-1 my-4 text-base text-foreground">
                                                                    <p><strong>그룹:</strong> {scoreToUpdate?.group}</p>
                                                                    <p><strong>선수:</strong> {scoreToUpdate?.name}</p>
                                                                    <p><strong>코스:</strong> {scoreToUpdate?.course} {scoreToUpdate?.hole}홀</p>
                                                                    <p><strong>점수:</strong> <span className="font-bold text-lg text-destructive">{score.score}</span> → <span className="font-bold text-lg text-primary">{scoreToUpdate?.score}</span></p>
                                                                </div>
                                                                이 작업은 즉시 전체 순위에 반영됩니다.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel onClick={() => setScoreToUpdate(null)}>취소</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleConfirmUpdate}>확인 및 저장</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            ) : (
                                                <span className="font-bold text-lg cursor-pointer p-2 rounded-md hover:bg-accent/20">{score.score}</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
