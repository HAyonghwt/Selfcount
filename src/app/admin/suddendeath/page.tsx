
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
import { Flame, Play, RotateCcw, User, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Player {
    id: string;
    jo: number;
    name: string;
    affiliation: string;
    group: string;
    type: 'individual' | 'team';
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

    // Sudden death states (separated for individual and team)
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<Partial<SuddenDeathData>>({});
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<Partial<SuddenDeathData>>({});

    // Processed data
    const [tiedIndividualPlayers, setTiedIndividualPlayers] = useState<Player[]>([]);
    const [tiedTeamPlayers, setTiedTeamPlayers] = useState<Player[]>([]);

    // UI states for individual tab
    const [selectedIndividualPlayers, setSelectedIndividualPlayers] = useState<{ [key: string]: boolean }>({});
    const [selectedIndividualCourseId, setSelectedIndividualCourseId] = useState<string>('');
    const [selectedIndividualHoles, setSelectedIndividualHoles] = useState<number[]>([]);
    const [individualSuddenDeathScores, setIndividualSuddenDeathScores] = useState<{ [key: string]: { [key: string]: string } }>({});

    // UI states for team tab
    const [selectedTeamPlayers, setSelectedTeamPlayers] = useState<{ [key: string]: boolean }>({});
    const [selectedTeamCourseId, setSelectedTeamCourseId] = useState<string>('');
    const [selectedTeamHoles, setSelectedTeamHoles] = useState<number[]>([]);
    const [teamSuddenDeathScores, setTeamSuddenDeathScores] = useState<{ [key: string]: { [key: string]: string } }>({});

    // Tie-breaking logic from dashboard (needed to find tied players)
    const tieBreak = (a: any, b: any, coursesForGroup: any[]) => {
        if (a.hasForfeited && !b.hasForfeited) return 1;
        if (!a.hasForfeited && b.hasForfeited) return -1;
        if (!a.hasAnyScore && !b.hasAnyScore) return 0;
        if (!a.hasAnyScore) return 1;
        if (!b.hasAnyScore) return -1;
        if (a.total !== b.total) return a.total - b.total;
        const sortedCourses = [...coursesForGroup].sort((c1, c2) => {
            const name1 = c1?.name || '';
            const name2 = c2?.name || '';
            return name2.localeCompare(name1);
        });
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
        const individualSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/individual');
        const teamSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/team');

        const unsubPlayers = onValue(playersRef, snap => setPlayers(snap.val() || {}));
        const unsubScores = onValue(scoresRef, snap => setScores(snap.val() || {}));
        const unsubTournament = onValue(tournamentRef, snap => {
            const data = snap.val() || {};
            setCourses(Object.values(data.courses || {}));
            setGroupsData(data.groups || {});
        });

        const setupSuddenDeathListener = (setter: Function, scoreSetter: Function) => (snap: any) => {
            const data = snap.val();
            setter(data || { isActive: false });
            if (data?.scores) {
                const stringScores: any = {};
                Object.entries(data.scores).forEach(([pId, hScores]: [string, any]) => {
                    stringScores[pId] = {};
                    Object.entries(hScores).forEach(([h, s]) => {
                        stringScores[pId][h] = String(s);
                    });
                });
                scoreSetter(stringScores);
            } else {
                scoreSetter({});
            }
        };

        const unsubIndividualSuddenDeath = onValue(individualSuddenDeathRef, setupSuddenDeathListener(setIndividualSuddenDeathData, setIndividualSuddenDeathScores));
        const unsubTeamSuddenDeath = onValue(teamSuddenDeathRef, setupSuddenDeathListener(setTeamSuddenDeathData, setTeamSuddenDeathScores));

        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
            unsubIndividualSuddenDeath();
            unsubTeamSuddenDeath();
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
                type: player.type,
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

        const individualTies: Player[] = [];
        const teamTies: Player[] = [];

        for (const groupName in rankedData) {
            const playersInGroup = rankedData[groupName];
            if (!playersInGroup || playersInGroup.length === 0) continue;

            const firstPlacePlayers = playersInGroup.filter(p => p.rank === 1);
            
            if (firstPlacePlayers.length > 1) {
                if (firstPlacePlayers[0].type === 'individual') {
                    individualTies.push(...firstPlacePlayers);
                } else if (firstPlacePlayers[0].type === 'team') {
                    teamTies.push(...firstPlacePlayers);
                }
            }
        }
        
        setTiedIndividualPlayers(individualTies);
        setTiedTeamPlayers(teamTies);

    }, [players, scores, courses, groupsData]);

    const handleStartSuddenDeath = (type: 'individual' | 'team') => {
        const isIndividual = type === 'individual';
        const activePlayers = Object.keys(isIndividual ? selectedIndividualPlayers : selectedTeamPlayers).filter(id => (isIndividual ? selectedIndividualPlayers : selectedTeamPlayers)[id]);
        const courseId = isIndividual ? selectedIndividualCourseId : selectedTeamCourseId;
        const holes = isIndividual ? selectedIndividualHoles : selectedTeamHoles;

        if (activePlayers.length < 2) {
            toast({ title: "오류", description: "서든데스를 진행할 선수를 2명 이상 선택해주세요." });
            return;
        }
        if (!courseId) {
            toast({ title: "오류", description: "코스를 선택해주세요." });
            return;
        }
        if (holes.length === 0) {
            toast({ title: "오류", description: "하나 이상의 홀을 선택해주세요." });
            return;
        }

        const suddenDeathSetup = {
            isActive: true,
            players: isIndividual ? selectedIndividualPlayers : selectedTeamPlayers,
            courseId: courseId,
            holes: holes.sort((a,b) => a - b),
            scores: {},
        };

        set(ref(db, `tournaments/current/suddenDeath/${type}`), suddenDeathSetup)
            .then(() => toast({ title: "성공", description: `${isIndividual ? '개인전' : '2인 1팀'} 서든데스 플레이오프가 시작되었습니다.` }))
            .catch(err => toast({ title: "오류", description: err.message }));
    };
    
    const handleResetSuddenDeath = (type: 'individual' | 'team') => {
        remove(ref(db, `tournaments/current/suddenDeath/${type}`))
            .then(() => toast({ title: "초기화 완료", description: "서든데스 정보가 초기화되었습니다." }))
            .catch(err => toast({ title: "오류", description: err.message }));
    };

    const handleSuddenDeathScoreChange = (type: 'individual' | 'team', playerId: string, hole: number, value: string) => {
        const isIndividual = type === 'individual';
        const setScores = isIndividual ? setIndividualSuddenDeathScores : setTeamSuddenDeathScores;
        
        setScores(prevScores => {
            const newScores = { ...prevScores };
            if (!newScores[playerId]) newScores[playerId] = {};
            newScores[playerId][hole] = value;
            return newScores;
        });

        const scoreRef = ref(db, `tournaments/current/suddenDeath/${type}/scores/${playerId}/${hole}`);
        const numericValue = parseInt(value, 10);
        if (!isNaN(numericValue)) {
            set(scoreRef, numericValue);
        } else if (value === '') {
            remove(scoreRef);
        }
    };

    const processSuddenDeathData = (suddenDeathData: Partial<SuddenDeathData> | null) => {
        if (!suddenDeathData?.isActive || !suddenDeathData.players || !suddenDeathData.holes || !Array.isArray(suddenDeathData.holes)) return [];

        const participatingPlayerIds = Object.keys(suddenDeathData.players).filter(id => suddenDeathData.players![id]);
        const allPlayersMap = new Map(Object.entries(players).map(([id, p]) => [id, p]));

        const results: any[] = participatingPlayerIds.map(id => {
            const playerInfo: any = allPlayersMap.get(id);
            if (!playerInfo) return null;

            const name = playerInfo.type === 'team' ? `${playerInfo.p1_name} / ${playerInfo.p2_name}` : playerInfo.name;
            
            const scoresPerHole: { [hole: string]: number | null } = {};
            let totalScore = 0;
            let holesPlayed = 0;

            suddenDeathData.holes!.forEach(hole => {
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
    }
    
    const processedIndividualSuddenDeathData = useMemo(() => processSuddenDeathData(individualSuddenDeathData), [individualSuddenDeathData, players]);
    const processedTeamSuddenDeathData = useMemo(() => processSuddenDeathData(teamSuddenDeathData), [teamSuddenDeathData, players]);

    const holeOptions = Array.from({ length: 9 }, (_, i) => ({ value: (i + 1).toString(), label: `${i + 1}홀` }));

    const renderSuddenDeathInterface = (type: 'individual' | 'team') => {
        const isIndividual = type === 'individual';
        const tiedPlayers = isIndividual ? tiedIndividualPlayers : tiedTeamPlayers;
        const selectedPlayers = isIndividual ? selectedIndividualPlayers : selectedTeamPlayers;
        const setSelectedPlayers = isIndividual ? setSelectedIndividualPlayers : setSelectedTeamPlayers;
        const selectedCourseId = isIndividual ? selectedIndividualCourseId : selectedTeamCourseId;
        const setSelectedCourseId = isIndividual ? setSelectedIndividualCourseId : setSelectedTeamCourseId;
        const selectedHoles = isIndividual ? selectedIndividualHoles : selectedTeamHoles;
        const setSelectedHoles = isIndividual ? setSelectedIndividualHoles : setSelectedTeamHoles;
        const suddenDeathData = isIndividual ? individualSuddenDeathData : teamSuddenDeathData;
        const processedData = isIndividual ? processedIndividualSuddenDeathData : processedTeamSuddenDeathData;
        const suddenDeathScores = isIndividual ? individualSuddenDeathScores : teamSuddenDeathScores;

        const playersGroupedByGroup = tiedPlayers.reduce((acc, player) => {
            const groupName = player.group || '미지정';
            if (!acc[groupName]) {
                acc[groupName] = [];
            }
            acc[groupName].push(player);
            return acc;
        }, {} as Record<string, Player[]>);

        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>플레이오프 설정</CardTitle>
                        <CardDescription>플레이오프를 진행할 선수, 코스, 홀을 선택하고 시작하세요.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {Object.keys(playersGroupedByGroup).length > 0 ? (
                            <div className="space-y-6">
                                <div>
                                    <Label className="font-semibold text-base">1. 참가 선수 선택</Label>
                                    <div className="space-y-4 mt-2">
                                        {Object.entries(playersGroupedByGroup).map(([groupName, tiedPlayersInGroup]) => (
                                            <div key={groupName} className="p-4 border rounded-md">
                                                <p className="font-bold mb-3">{groupName} 그룹 ({tiedPlayersInGroup.length}명 동점)</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {tiedPlayersInGroup.map(player => (
                                                        <div key={player.id} className="flex items-center space-x-3">
                                                            <Checkbox
                                                                id={`${type}-player-${player.id}`}
                                                                checked={selectedPlayers[player.id] || false}
                                                                onCheckedChange={(checked) => setSelectedPlayers(prev => ({...prev, [player.id]: !!checked}))}
                                                                disabled={suddenDeathData?.isActive}
                                                            />
                                                            <Label htmlFor={`${type}-player-${player.id}`} className="font-medium text-base">
                                                                {player.name} <span className="text-muted-foreground text-sm">({player.affiliation})</span>
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor={`${type}-course-select`} className="font-semibold">2. 코스 선택</Label>
                                        <Select 
                                            value={selectedCourseId}
                                            onValueChange={setSelectedCourseId}
                                            disabled={suddenDeathData?.isActive}
                                        >
                                            <SelectTrigger id={`${type}-course-select`}><SelectValue placeholder="코스 선택" /></SelectTrigger>
                                            <SelectContent>
                                                {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`${type}-hole-select`} className="font-semibold">3. 홀 선택</Label>
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
                                    <Button onClick={() => handleStartSuddenDeath(type)} disabled={suddenDeathData?.isActive} size="lg">
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
                                                <AlertDialogAction onClick={() => handleResetSuddenDeath(type)}>초기화</AlertDialogAction>
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
                                        {processedData.map(player => (
                                            <TableRow key={player.id}>
                                                <TableCell className="font-semibold">{player.name}</TableCell>
                                                {suddenDeathData.holes?.map(hole => (
                                                    <TableCell key={hole} className="text-center">
                                                        <Input
                                                            type="number"
                                                            className="w-16 h-10 mx-auto text-center text-base"
                                                            value={suddenDeathScores[player.id]?.[hole] ?? ''}
                                                            onChange={(e) => handleSuddenDeathScoreChange(type, player.id, hole, e.target.value)}
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

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline flex items-center gap-2"><Flame className="text-destructive"/>서든데스 관리</CardTitle>
                    <CardDescription>1위 동점자를 대상으로 서든데스 플레이오프를 설정하고 점수를 관리합니다.</CardDescription>
                </CardHeader>
            </Card>

            <Tabs defaultValue="individual" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="individual" className="py-2.5 text-base font-semibold">
                        <User className="mr-2 h-5 w-5" /> 개인전
                    </TabsTrigger>
                    <TabsTrigger value="team" className="py-2.5 text-base font-semibold">
                        <Users className="mr-2 h-5 w-5" /> 2인 1팀
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="individual" className="mt-6">
                    {renderSuddenDeathInterface('individual')}
                </TabsContent>
                <TabsContent value="team" className="mt-6">
                    {renderSuddenDeathInterface('team')}
                </TabsContent>
            </Tabs>
        </div>
    );
}
