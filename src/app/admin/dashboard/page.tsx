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
        const processedPlayers: Omit<ProcessedPlayer, 'rank'>[] = Object.entries(players).map(([id, player]: [string, any]) => {
            const playerScores = scores[id] || {};
            let total = 0;
            const courseScores: { [courseId: string]: number } = {};

            activeCourses.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScores[courseId] ? Object.values(playerScores[courseId]) as number[] : [];
                const courseSum = scoresForCourse.reduce((a, b) => a + b, 0);
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
            };
        });

        const groupedAndRanked: { [groupName: string]: ProcessedPlayer[] } = {};
        const allGroups = [...new Set(processedPlayers.map(p => p.group))];

        allGroups.forEach(groupName => {
            if (!groupName) return;
            const groupPlayers = processedPlayers
                .filter(p => p.group === groupName)
                .sort((a, b) => a.total - b.total); // Add back-count tie-breaking later
            
            groupedAndRanked[groupName] = groupPlayers.map((player, index) => ({
                ...player,
                rank: index + 1 // Simplified ranking
            }));
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
