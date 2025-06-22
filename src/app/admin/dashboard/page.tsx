"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';

interface ProcessedPlayer {
    id: string;
    jo: number;
    name: string;
    affiliation: string;
    group: string;
    totalScore: number;
    rank: number;
    hasAnyScore: boolean;
    coursesData: {
        [courseId: string]: {
            courseName: string;
            courseTotal: number;
            holeScores: (number | null)[];
        }
    };
    total: number; // For tie-breaking
    courseScores: { [courseId: string]: number };
    detailedScores: { [courseId: string]: { [holeNumber: string]: number } };
}

// Helper function for tie-breaking using back-count method
const tieBreak = (a: any, b: any, activeCourses: any[]) => {
    if (!a.hasAnyScore && !b.hasAnyScore) return 0;
    if (!a.hasAnyScore) return 1;
    if (!b.hasAnyScore) return -1;
    
    if (a.total !== b.total) {
        return a.total - b.total;
    }
    const sortedCourses = [...activeCourses].sort((c1, c2) => c2.id - c1.id);
    for (const course of sortedCourses) {
        const courseId = course.id;
        const aCourseScore = a.courseScores[courseId] || 0;
        const bCourseScore = b.courseScores[courseId] || 0;
        if (aCourseScore !== bCourseScore) {
            return aCourseScore - bCourseScore;
        }
    }
    for (const course of sortedCourses) {
        const courseId = course.id;
        const aHoleScores = a.detailedScores[courseId] || {};
        const bHoleScores = b.detailedScores[courseId] || {};
        for (let i = 9; i >= 1; i--) {
            const hole = i.toString();
            const aHole = aHoleScores[hole] || 0;
            const bHole = bHoleScores[hole] || 0;
            if (aHole !== bHole) {
                return aHole - bHole;
            }
        }
    }
    return 0;
};


export default function AdminDashboard() {
    const { toast } = useToast();
    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [courses, setCourses] = useState({});
    const [filterGroup, setFilterGroup] = useState('all');

    useEffect(() => {
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const coursesRef = ref(db, 'tournaments/current/courses');

        const unsubPlayers = onValue(playersRef, snap => setPlayers(snap.val() || {}));
        const unsubScores = onValue(scoresRef, snap => setScores(snap.val() || {}));
        const unsubCourses = onValue(coursesRef, snap => setCourses(snap.val() || {}));
        
        return () => {
            unsubPlayers();
            unsubScores();
            unsubCourses();
        }
    }, []);
    
    const activeCoursesList = useMemo(() => 
        Object.values(courses).filter((c: any) => c.isActive)
    , [courses]);

    const processedDataByGroup = useMemo(() => {
        if (Object.keys(players).length === 0 || activeCoursesList.length === 0) return {};

        const allProcessedPlayers: any[] = Object.entries(players).map(([playerId, player]: [string, any]) => {
            const playerScoresData = scores[playerId] || {};
            let totalScore = 0;
            const coursesData: any = {};
            const courseScoresForTieBreak: { [courseId: string]: number } = {};
            const detailedScoresForTieBreak: { [courseId: string]: { [holeNumber: string]: number } } = {};
            let hasAnyScore = false;

            activeCoursesList.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                detailedScoresForTieBreak[courseId] = scoresForCourse;

                const holeScores: (number | null)[] = Array(9).fill(null);
                let courseTotal = 0;
                for (let i = 0; i < 9; i++) {
                    const holeScore = scoresForCourse[(i + 1).toString()];
                    if (holeScore !== undefined && holeScore !== null) {
                        holeScores[i] = Number(holeScore);
                        courseTotal += Number(holeScore);
                        hasAnyScore = true;
                    }
                }
                
                totalScore += courseTotal;
                courseScoresForTieBreak[courseId] = courseTotal;
                coursesData[courseId] = { courseName: course.name, courseTotal, holeScores };
            });

            return {
                id: playerId,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                affiliation: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                group: player.group,
                totalScore,
                coursesData,
                hasAnyScore,
                total: totalScore,
                courseScores: courseScoresForTieBreak,
                detailedScores: detailedScoresForTieBreak
            };
        });

        const groupedData = allProcessedPlayers.reduce((acc, player) => {
            const groupName = player.group || '미지정';
            if (!acc[groupName]) {
                acc[groupName] = [];
            }
            acc[groupName].push(player);
            return acc;
        }, {} as Record<string, any[]>);

        const rankedData: { [key: string]: ProcessedPlayer[] } = {};
        for (const groupName in groupedData) {
            const groupPlayers = groupedData[groupName].sort((a,b) => tieBreak(a, b, activeCoursesList));
            
            const rankedPlayers: ProcessedPlayer[] = [];
            groupPlayers.forEach((player, index) => {
                let rank;
                if (index > 0 && player.hasAnyScore && groupPlayers[index-1].hasAnyScore && tieBreak(player, groupPlayers[index - 1], activeCoursesList) === 0) {
                    rank = rankedPlayers[index - 1].rank;
                } else {
                    rank = index + 1;
                }
                rankedPlayers.push({ ...player, rank });
            });
            rankedData[groupName] = rankedPlayers;
        }
        
        return rankedData;
    }, [players, scores, courses, activeCoursesList]);
    
    const allGroupsList = Object.keys(processedDataByGroup);

    const progress = useMemo(() => {
        const totalHoles = activeCoursesList.length * 9;
        if(totalHoles === 0 || Object.keys(scores).length === 0 || Object.keys(players).length === 0) return 0;
        
        const totalScoresEntered = Object.values(scores).reduce((acc: number, courseScores: any) => {
           return acc + Object.values(courseScores).reduce((cAcc: number, holeScores: any) => cAcc + Object.keys(holeScores).length, 0);
        }, 0);
        
        const totalPossibleScores = Object.keys(players).length * totalHoles;
        if (totalPossibleScores === 0) return 0;

        return Math.round((totalScoresEntered / totalPossibleScores) * 100);
    }, [scores, players, activeCoursesList]);

    const handleExportToExcel = async () => {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();

        const dataToExport = (filterGroup === 'all') 
            ? processedDataByGroup 
            : { [filterGroup]: processedDataByGroup[filterGroup] };

        for (const groupName in dataToExport) {
            const groupPlayers = dataToExport[groupName];
            if (!groupPlayers || groupPlayers.length === 0) continue;

            const headers = [
                '순위', '조', '선수명(팀명)', '소속', '코스', 
                '1', '2', '3', '4', '5', '6', '7', '8', '9',
                '코스 합계', '총타수'
            ];
            
            const sheetData = [headers];

            groupPlayers.forEach(player => {
                activeCoursesList.forEach((course: any, courseIndex: number) => {
                    const courseData = player.coursesData[course.id];
                    const row: (string|number)[] = [];

                    if (courseIndex === 0) {
                        row.push(
                            player.hasAnyScore ? player.rank : '',
                            player.jo,
                            player.name,
                            player.affiliation
                        );
                    } else {
                        row.push('', '', '', '');
                    }

                    row.push(
                        courseData?.courseName || course.name,
                        ...(courseData?.holeScores.map(s => s === null ? '-' : s) || Array(9).fill('-')),
                        player.hasAnyScore ? (courseData?.courseTotal || 0) : '-',
                    );

                    if (courseIndex === 0) {
                        row.push(player.hasAnyScore ? player.totalScore : '-');
                    } else {
                        row.push('');
                    }
                    sheetData.push(row);
                });
            });

            const ws = XLSX.utils.aoa_to_sheet(sheetData);

            ws['!cols'] = [
                { wch: 5 }, { wch: 5 }, { wch: 25 }, { wch: 25 }, { wch: 10 },
                ...Array(9).fill({ wch: 4 }),
                { wch: 10 }, { wch: 10 },
            ];
            
            XLSX.utils.book_append_sheet(wb, ws, groupName);
        }

        if (wb.SheetNames.length === 0) {
            toast({
                title: "내보내기 실패",
                description: "엑셀로 내보낼 데이터가 없습니다.",
                variant: "destructive"
            });
            return;
        }

        XLSX.writeFile(wb, `ParkScore_전체결과_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline">홈 전광판 (관리자용)</CardTitle>
                    <CardDescription>현재 진행중인 대회의 실시간 점수 현황입니다.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 justify-between items-center p-4 bg-muted/50 rounded-lg">
                        <div className="flex gap-4 items-center">
                            <Filter className="w-5 h-5 text-muted-foreground" />
                             <Select value={filterGroup} onValueChange={setFilterGroup}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="그룹 필터" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">모든 그룹</SelectItem>
                                    {allGroupsList.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleExportToExcel} disabled={Object.keys(players).length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            엑셀로 다운로드
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {(filterGroup === 'all' ? allGroupsList : [filterGroup]).map(groupName => {
                const groupPlayers = processedDataByGroup[groupName];
                if (!groupPlayers || groupPlayers.length === 0) return null;

                return (
                    <Card key={groupName}>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-xl font-bold font-headline">{groupName}</CardTitle>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-primary">{progress}%</p>
                                <p className="text-sm text-muted-foreground">진행률</p>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-16 text-center">순위</TableHead>
                                            <TableHead className="w-16 text-center">조</TableHead>
                                            <TableHead className="w-48">선수명(팀명)</TableHead>
                                            <TableHead className="w-48">소속</TableHead>
                                            <TableHead className="w-24">코스</TableHead>
                                            {Array.from({length: 9}).map((_, i) => <TableHead key={i} className="text-center">{i + 1}</TableHead>)}
                                            <TableHead className="w-24 text-center">합계</TableHead>
                                            <TableHead className="w-24 text-center">총타수</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {groupPlayers.map((player) => (
                                            <React.Fragment key={player.id}>
                                                {activeCoursesList.map((course: any, courseIndex: number) => (
                                                    <TableRow key={`${player.id}-${course.id}`} className="text-base">
                                                        {courseIndex === 0 && (
                                                            <TableCell rowSpan={activeCoursesList.length || 1} className="text-center align-middle font-bold text-lg">{player.hasAnyScore ? `${player.rank}위` : '-'}</TableCell>
                                                        )}
                                                         {courseIndex === 0 && (
                                                            <TableCell rowSpan={activeCoursesList.length || 1} className="text-center align-middle font-medium">{player.jo}</TableCell>
                                                        )}
                                                         {courseIndex === 0 && (
                                                            <TableCell rowSpan={activeCoursesList.length || 1} className="align-middle font-semibold">{player.name}</TableCell>
                                                        )}
                                                         {courseIndex === 0 && (
                                                            <TableCell rowSpan={activeCoursesList.length || 1} className="align-middle text-muted-foreground">{player.affiliation}</TableCell>
                                                        )}
                                                        
                                                        <TableCell className="font-medium">{player.coursesData[course.id]?.courseName}</TableCell>
                                                        
                                                        {player.coursesData[course.id]?.holeScores.map((score, i) => <TableCell key={i} className="text-center font-mono">{score === null ? '-' : score}</TableCell>)}
                                                        
                                                        <TableCell className="text-center font-bold">{player.hasAnyScore ? player.coursesData[course.id]?.courseTotal : '-'}</TableCell>

                                                        {courseIndex === 0 && (
                                                            <TableCell rowSpan={activeCoursesList.length || 1} className="text-center align-middle font-bold text-primary text-lg">{player.hasAnyScore ? player.totalScore : '-'}</TableCell>
                                                        )}
                                                    </TableRow>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    );
}
