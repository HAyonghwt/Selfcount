"use client";
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

interface ProcessedPlayer {
    id: string;
    group: string;
    jo: number;
    name: string;
    affiliation: string;
    courseScores: { [courseId: string]: number };
    total: number;
    rank: number;
}

// Helper function for tie-breaking using back-count method
const tieBreak = (a: any, b: any, activeCourses: any[]) => {
    // 1. Total score (lower is better)
    if (a.total !== b.total) {
        return a.total - b.total;
    }

    // Sort courses by ID descending to check last course first
    const sortedCourses = [...activeCourses].sort((c1, c2) => c2.id - c1.id);

    // 2. Compare course by course totals, from last to first
    for (const course of sortedCourses) {
        const courseId = course.id;
        const aCourseScore = a.courseScores[courseId] || 0;
        const bCourseScore = b.courseScores[courseId] || 0;
        if (aCourseScore !== bCourseScore) {
            return aCourseScore - bCourseScore;
        }
    }

    // 3. If still tied, compare hole by hole, from last hole of last course to first hole of first course
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

    // If still tied, they are equal.
    return 0;
};


export default function AdminDashboard() {
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

    const processedData = useMemo(() => {
        const activeCourses = Object.values(courses).filter((c: any) => c.isActive);
        const processedPlayers = Object.entries(players).map(([id, player]: [string, any]) => {
            const playerScoresData = scores[id] || {};
            let total = 0;
            const courseScores: { [courseId: string]: number } = {};
            const detailedScores: { [courseId: string]: { [holeNumber: string]: number } } = {};

            activeCourses.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                detailedScores[courseId] = scoresForCourse;
                const courseSum = Object.values(scoresForCourse).reduce((a, b) => (a as number) + (b as number), 0) as number;
                courseScores[courseId] = courseSum;
                total += courseSum;
            });
            
            return {
                id,
                group: player.group,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                affiliation: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                courseScores,
                total,
                detailedScores
            };
        });

        const groupedAndRanked: { [groupName: string]: ProcessedPlayer[] } = {};
        const allGroups = [...new Set(processedPlayers.map(p => p.group))].filter(g => g);

        allGroups.forEach(groupName => {
            const groupPlayers = processedPlayers
                .filter(p => p.group === groupName)
                .sort((a, b) => tieBreak(a, b, activeCourses));
            
            const rankedPlayers: ProcessedPlayer[] = [];
            groupPlayers.forEach((player, index) => {
                let rank;
                if (index > 0 && tieBreak(player, groupPlayers[index - 1], activeCourses) === 0) {
                    rank = rankedPlayers[index - 1].rank;
                } else {
                    rank = index + 1;
                }
                const { detailedScores, ...restOfPlayer } = player;
                rankedPlayers.push({ ...restOfPlayer, rank });
            });
            groupedAndRanked[groupName] = rankedPlayers;
        });
        
        return groupedAndRanked;
    }, [players, scores, courses]);
    
    const activeCoursesList = Object.values(courses).filter((c: any) => c.isActive);
    const allGroupsList = Object.keys(processedData);
    const progress = useMemo(() => {
        const totalHoles = activeCoursesList.length * 9;
        if(totalHoles === 0 || Object.keys(scores).length === 0) return 0;
        
        const totalScores = Object.values(scores).reduce((acc: number, courseScores: any) => {
           return acc + Object.values(courseScores).reduce((cAcc: number, holeScores: any) => cAcc + Object.keys(holeScores).length, 0);
        }, 0);
        
        const totalPossibleScores = Object.keys(players).length * totalHoles;
        if (totalPossibleScores === 0) return 0;

        return Math.round((totalScores / totalPossibleScores) * 100);

    }, [scores, players, activeCoursesList]);


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
                        <Button disabled>
                            <Download className="mr-2 h-4 w-4" />
                            엑셀로 다운로드 (개발중)
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {(filterGroup === 'all' ? allGroupsList : [filterGroup]).map(groupName => (
                <Card key={groupName}>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-bold font-headline">{groupName}</CardTitle>
                            <CardDescription>진행률: {progress}%</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-center">순위</TableHead>
                                        <TableHead>선수명</TableHead>
                                        <TableHead>소속</TableHead>
                                        <TableHead>조</TableHead>
                                        {activeCoursesList.map((course: any) => (
                                            <TableHead key={course.id} className="text-center">{course.name}</TableHead>
                                        ))}
                                        <TableHead className="text-center">합계</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(processedData[groupName] || []).map(player => (
                                        <TableRow key={player.id}>
                                            <TableCell className="text-center font-bold text-lg">{player.rank}</TableCell>
                                            <TableCell className="font-medium">{player.name}</TableCell>
                                            <TableCell>{player.affiliation}</TableCell>
                                            <TableCell className="text-center">{player.jo}</TableCell>
                                            {activeCoursesList.map((course: any) => (
                                                <TableCell key={course.id} className="text-center">{player.courseScores[course.id] || '-'}</TableCell>
                                            ))}
                                            <TableCell className="text-center font-bold text-primary">{player.total}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
