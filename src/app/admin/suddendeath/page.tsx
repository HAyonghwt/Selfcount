"use client"
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Input } from '@/components/ui/input';
import { Flame, AlertTriangle, Play, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


interface Player {
    id: string;
    jo: number;
    name: string;
    affiliation: string;
    group: string;
    totalScore: number;
    rank: number | null;
    hasAnyScore: boolean;
    hasForfeited: boolean;
}

interface Course {
    id: number;
    name: string;
}

interface SuddenDeathData {
    isActive: boolean;
    players: { [key: string]: boolean };
    courseId: string;
    holes: number[];
    scores: { [playerId: string]: { [hole: string]: number } };
}

export default function SuddenDeathPage() {
    const { toast } = useToast();

    // Raw data from Firebase
    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [courses, setCourses] = useState<Course[]>([]);
    const [groupsData, setGroupsData] = useState({});

    // Processed data
    const [tiedPlayers, setTiedPlayers] = useState<Player[]>([]);

    // Sudden death state
    const [suddenDeathData, setSuddenDeathData] = useState<Partial<SuddenDeathData>>({});
    const [selectedPlayers, setSelectedPlayers] = useState<{ [key: string]: boolean }>({});
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [selectedHoles, setSelectedHoles] = useState<number[]>([]);
    const [suddenDeathScores, setSuddenDeathScores] = useState<{ [key: string]: { [key: string]: string } }>({});


    // Tie-breaking logic from dashboard (needed to find tied players)
    const tieBreak = (a: any, b: any, coursesForGroup: any[]) => {
        if (a.hasForfeited && !b.hasForfeited) return 1;
        if (!a.hasForfeited && b.hasForfeited) return -1;
        if (!a.hasAnyScore && !b.hasAnyScore) return 0;
        if (!a.hasAnyScore) return 1;
        if (!b.hasAnyScore) return -1;
        if (a.total !== b.total) return a.total - b.total;
        const sortedCourses = [...coursesForGroup].sort((c1, c2) => c2.name.localeCompare(c1.name));
        for (const course of sortedCourses) {
            const courseId = course.id;
            const aCourseScore = a.courseScores[courseId] || 0;
            const bCourseScore = b.courseScores[courseId] || 0;
            if (aCourseScore !== bCourseScore) return aCourseScore - bCourseScore;
        }
        if (sortedCourses.length > 0) {
            const lastCourseId = sortedCourses[0].id;
            const aHoleScores = a.detailedScores[lastCourseId] || {};
            const bHoleScores = b.detailedScores[lastCourseId] || {};
            for (let i = 9; i >= 1; i--) {
                const hole = i.toString();
                const aHole = aHoleScores[hole] || 0;
                const bHole = bHoleScores[hole] || 0;
                if (aHole !== bHole) return aHole - bHole;
            }
        }
        return 0;
    };


    // Fetch all necessary data
    useEffect(() => {
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');
        const suddenDeathRef = ref(db, 'tournaments/current/suddenDeath');

        const unsubPlayers = onValue(playersRef, snap => setPlayers(snap.val() || {}));
        const unsubScores = onValue(scoresRef, snap => setScores(snap.val() || {}));
        const unsubTournament = onValue(tournamentRef, snap => {
            const data = snap.val() || {};
            setCourses(Object.values(data.courses || {}).filter((c:any) => c.isActive));
            setGroupsData(data.groups || {});
        });
        const unsubSuddenDeath = onValue(suddenDeathRef, snap => {
            const data = snap.val();
            setSuddenDeathData(data || { isActive: false });
            if (data?.scores) {
                const stringScores: any = {};
                Object.entries(data.scores).forEach(([pId, hScores]: [string, any]) => {
                    stringScores[pId] = {};
                    Object.entries(hScores).forEach(([h, s]) => {
                        stringScores[pId][h] = String(s);
                    });
                });
                setSuddenDeathScores(stringScores);
            } else {
                setSuddenDeathScores({});
            }
        });

        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
            unsubSuddenDeath();
        };
    }, []);

    // Calculate tied players
    useEffect(() => {
        const allCoursesList = Object.values(courses);
        if (Object.keys(players).length === 0 || allCoursesList.length === 0) return;

        const allProcessedPlayers: any[] = Object.entries(players).map(([playerId, player]: [string, any]) => {
            const playerGroupData = groupsData[player.group];
            const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter(id => playerGroupData.courses[id]) : [];
            const coursesForPlayer = allCoursesList.filter((c:any) => assignedCourseIds.includes(c.id.toString()));
            const playerScoresData = scores[playerId] || {};
            let totalScore = 0;
            const courseScoresForTieBreak: { [courseId: string]: number } = {};
            const detailedScoresForTieBreak: { [courseId: string]: { [holeNumber: string]: number } } = {};
            let hasAnyScore = false;
            let hasForfeited = false;
            coursesForPlayer.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                detailedScoresForTieBreak[courseId] = scoresForCourse;
                let courseTotal = 0;
                for (let i = 0; i < 9; i++) {
                    const holeScore = scoresForCourse[(i + 1).toString()];
                    if (holeScore !== undefined && holeScore !== null) {
                        const scoreNum = Number(holeScore);
                        courseTotal += scoreNum;
                        hasAnyScore = true;
                        if (scoreNum === 0) hasForfeited = true;
                    }
                }
                totalScore += courseTotal;
                courseScoresForTieBreak[courseId] = courseTotal;
            });
            return {
                id: playerId,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                affiliation: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                group: player.group,
                totalScore,
                hasAnyScore, hasForfeited, total: totalScore, courseScores: courseScoresForTieBreak,
                detailedScores: detailedScoresForTieBreak, assignedCourses: coursesForPlayer
            };
        });

        const rankedData: { [key: string]: Player[] } = {};
        const groupedData = allProcessedPlayers.reduce((acc, player) => {
            const groupName = player.group || '미지정';
            if (!acc[groupName]) acc[groupName] = [];
            acc[groupName].push(player);
            return acc;
        }, {} as Record<string, any[]>);

        for (const groupName in groupedData) {
            const coursesForGroup = groupedData[groupName][0]?.assignedCourses || Object.values(courses);
            const playersToSort = groupedData[groupName].filter(p => p.hasAnyScore && !p.hasForfeited);
            const otherPlayers = groupedData[groupName].filter(p => !p.hasAnyScore || p.hasForfeited);
            if (playersToSort.length > 0) {
                const leaderScore = playersToSort.reduce((min, p) => Math.min(min, p.totalScore), Infinity);
                playersToSort.sort((a, b) => {
                    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
                    if (a.totalScore === leaderScore) return a.name.localeCompare(b.name);
                    return tieBreak(a, b, coursesForGroup);
                });
                let rank = 1;
                playersToSort[0].rank = rank;
                for (let i = 1; i < playersToSort.length; i++) {
                    const prev = playersToSort[i-1], curr = playersToSort[i];
                    let isTied = false;
                    if (curr.totalScore === prev.totalScore) {
                        if (curr.totalScore === leaderScore) isTied = true;
                        else isTied = tieBreak(curr, prev, coursesForGroup) === 0;
                    }
                    if (isTied) curr.rank = prev.rank; else { rank = i + 1; curr.rank = rank; }
                }
            }
            rankedData[groupName] = [...playersToSort, ...otherPlayers.map(p => ({ ...p, rank: null }))];
        }

        const allRankedPlayers = Object.values(rankedData).flat();
        const firstPlacePlayers = allRankedPlayers.filter(p => p.rank === 1);
        setTiedPlayers(firstPlacePlayers.length > 1 ? firstPlacePlayers : []);

    }, [players, scores, courses, groupsData]);

    const handleStartSuddenDeath = () => {
        const activePlayers = Object.keys(selectedPlayers).filter(id => selectedPlayers[id]);
        if (activePlayers.length < 2) {
            toast({ title: "오류", description: "서든데스를 진행할 선수를 2명 이상 선택해주세요." });
            return;
        }
        if (!selectedCourseId) {
            toast({ title: "오류", description: "코스를 선택해주세요." });
            return;
        }
        if (selectedHoles.length === 0) {
            toast({ title: "오류", description: "하나 이상의 홀을 선택해주세요." });
            return;
        }

        const suddenDeathSetup = {
            isActive: true,
            players: selectedPlayers,
            courseId: selectedCourseId,
            holes: selectedHoles.sort((a,b) => a - b),
            scores: {},
        };

        set(ref(db, 'tournaments/current/suddenDeath'), suddenDeathSetup)
            .then(() => toast({ title: "성공", description: "서든데스 플레이오프가 시작되었습니다." }))
            .catch(err => toast({ title: "오류", description: err.message }));
    };
    
    const handleResetSuddenDeath = () => {
        remove(ref(db, 'tournaments/current/suddenDeath'))
            .then(() => toast({ title: "초기화 완료", description: "서든데스 정보가 초기화되었습니다." }))
            .catch(err => toast({ title: "오류", description: err.message }));
    };

    const handleSuddenDeathScoreChange = (playerId: string, hole: number, value: string) => {
        const newScores = { ...suddenDeathScores };
        if (!newScores[playerId]) newScores[playerId] = {};
        newScores[playerId][hole] = value;
        setSuddenDeathScores(newScores);

        const scoreRef = ref(db, `tournaments/current/suddenDeath/scores/${playerId}/${hole}`);
        const numericValue = parseInt(value, 10);
        if (!isNaN(numericValue)) {
            set(scoreRef, numericValue);
        } else if (value === '') {
            remove(scoreRef);
        }
    };

    const processedSuddenDeathData = useMemo(() => {
        if (!suddenDeathData?.isActive || !suddenDeathData.players || !suddenDeathData.holes) return [];

        const participatingPlayerIds = Object.keys(suddenDeathData.players).filter(id => suddenDeathData.players[id]);
        const allPlayersMap = new Map(Object.entries(players).map(([id, p]) => [id, p]));

        const results: any[] = participatingPlayerIds.map(id => {
            const playerInfo: any = allPlayersMap.get(id);
            if (!playerInfo) return null;

            const name = playerInfo.type === 'team' ? `${playerInfo.p1_name} / ${playerInfo.p2_name}` : playerInfo.name;
            
            const scoresPerHole: { [hole: string]: number | null } = {};
            let totalScore = 0;
            let holesPlayed = 0;

            suddenDeathData.holes.forEach(hole => {
                const score = suddenDeathData.scores?.[id]?.[hole];
                if (score !== undefined && score !== null) {
                    scoresPerHole[hole] = score;
                    totalScore += score;
                    holesPlayed++;
                } else {
                    scoresPerHole[hole] = null;
                }
            });

            return { id, name, scoresPerHole, totalScore, holesPlayed };
        }).filter(Boolean);


        // Determine rank
        results.sort((a, b) => {
            if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed;
            if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
            return a.name.localeCompare(b.name);
        });

        let rank = 1;
        for (let i = 0; i < results.length; i++) {
            if (i > 0 && (results[i].totalScore > results[i-1].totalScore || results[i].holesPlayed < results[i-1].holesPlayed)) {
                rank = i + 1;
            }
            results[i].rank = rank;
        }

        return results;
    }, [suddenDeathData, players]);


    const holeOptions = Array.from({ length: 9 }, (_, i) => ({ value: (i + 1).toString(), label: `${i + 1}홀` }));

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline flex items-center gap-2"><Flame className="text-destructive"/>서든데스 관리</CardTitle>
                    <CardDescription>1위 동점자를 대상으로 서든데스 플레이오프를 설정하고 점수를 관리합니다.</CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>서든데스 설정</CardTitle>
                    <CardDescription>플레이오프를 진행할 선수, 코스, 홀을 선택하고 시작하세요.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {tiedPlayers.length > 0 ? (
                        <div className="space-y-4">
                            <div>
                                <Label className="font-semibold">1. 참가 선수 선택 ({tiedPlayers.length}명 동점)</Label>
                                <div className="p-4 border rounded-md grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                                    {tiedPlayers.map(player => (
                                        <div key={player.id} className="flex items-center space-x-3">
                                            <Checkbox
                                                id={`player-${player.id}`}
                                                checked={selectedPlayers[player.id] || false}
                                                onCheckedChange={(checked) => setSelectedPlayers(prev => ({...prev, [player.id]: !!checked}))}
                                                disabled={suddenDeathData?.isActive}
                                            />
                                            <Label htmlFor={`player-${player.id}`} className="font-medium text-base">
                                                {player.name} <span className="text-muted-foreground text-sm">({player.affiliation})</span>
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="course-select" className="font-semibold">2. 코스 선택</Label>
                                    <Select 
                                        value={selectedCourseId}
                                        onValueChange={setSelectedCourseId}
                                        disabled={suddenDeathData?.isActive}
                                    >
                                        <SelectTrigger id="course-select"><SelectValue placeholder="코스 선택" /></SelectTrigger>
                                        <SelectContent>
                                            {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hole-select" className="font-semibold">3. 홀 선택</Label>
                                    <MultiSelect
                                        options={holeOptions}
                                        selected={selectedHoles.map(String)}
                                        onChange={(values) => setSelectedHoles(values.map(Number))}
                                        placeholder="홀 선택..."
                                        disabled={suddenDeathData?.isActive}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <Button onClick={handleStartSuddenDeath} disabled={suddenDeathData?.isActive} size="lg">
                                    <Play className="mr-2 h-4 w-4"/> 서든데스 시작
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="lg" disabled={!suddenDeathData?.isActive}>
                                            <RotateCcw className="mr-2 h-4 w-4"/> 서든데스 초기화
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>정말 초기화하시겠습니까?</AlertDialogTitle>
                                            <AlertDialogDescription>진행 중인 서든데스 플레이오프 정보와 점수가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>취소</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleResetSuddenDeath}>초기화</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            <p>현재 1위 동점자가 없습니다.</p>
                            <p className="text-sm">대회가 진행되어 1위 동점자가 발생하면 여기에 표시됩니다.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {suddenDeathData?.isActive && (
                 <Card>
                    <CardHeader>
                        <CardTitle>서든데스 점수판 (실시간 입력)</CardTitle>
                        <CardDescription>{courses.find(c => c.id == Number(suddenDeathData.courseId))?.name}에서 플레이오프가 진행 중입니다.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <div className="overflow-x-auto border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-48">선수</TableHead>
                                        {suddenDeathData.holes?.sort((a,b) => a-b).map(hole => <TableHead key={hole} className="text-center">{hole}홀</TableHead>)}
                                        <TableHead className="text-center font-bold text-primary">합계</TableHead>
                                        <TableHead className="text-center font-bold text-primary">순위</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {processedSuddenDeathData.map(player => (
                                        <TableRow key={player.id}>
                                            <TableCell className="font-semibold">{player.name}</TableCell>
                                            {suddenDeathData.holes?.map(hole => (
                                                <TableCell key={hole} className="text-center">
                                                    <Input
                                                        type="number"
                                                        className="w-16 h-10 mx-auto text-center text-base"
                                                        value={suddenDeathScores[player.id]?.[hole] ?? ''}
                                                        onChange={(e) => handleSuddenDeathScoreChange(player.id, hole, e.target.value)}
                                                    />
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-center font-bold text-lg">{player.totalScore}</TableCell>
                                            <TableCell className="text-center font-bold text-lg text-primary">{player.rank}위</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                 </Card>
            )}
        </div>
    );
}
