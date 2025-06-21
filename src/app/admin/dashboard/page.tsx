"use client";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Mock Data - In a real app, this would come from Firebase/Firestore
const mockPlayers = [
    { id: 1, group: '남자 개인전', jo: 1, name: '김철수', affiliation: '서울클럽', scores: { 'A': [4,3,4,5,3,4,4,5,3], 'B': [3,3,4,4,3,4,5,4,3] }, total: 69, rank: 1 },
    { id: 2, group: '남자 개인전', jo: 1, name: '이영민', affiliation: '부산클럽', scores: { 'A': [5,4,4,5,4,4,4,5,4], 'B': [4,3,4,4,3,5,5,4,3] }, total: 73, rank: 3 },
    { id: 3, group: '남자 개인전', jo: 2, name: '박현우', affiliation: '대구클럽', scores: { 'A': [4,3,5,5,3,4,4,5,3], 'B': [3,4,4,4,3,4,5,4,3] }, total: 70, rank: 2 },
    { id: 4, group: '여자 개인전', jo: 3, name: '최지아', affiliation: '인천클럽', scores: { 'A': [4,3,4,5,3,4,4,5,3], 'B': [3,3,4,4,3,4,5,4,3] }, total: 69, rank: 1 },
    { id: 5, group: '2인 1팀', jo: 4, name: '나영희 / 황인성', affiliation: '대전클럽', scores: { 'A': [4,3,4,5,3,4,4,5,3], 'B': [3,3,4,4,3,4,5,4,3] }, total: 69, rank: 1 },
];

const mockCourses = [
    { id: 'A', name: '햇살코스', pars: [4,3,4,5,3,4,4,5,3] },
    { id: 'B', name: '바람코스', pars: [3,3,4,4,3,4,5,4,3] }
];

export default function AdminDashboard() {
    const [activeCourses, setActiveCourses] = useState(['A', 'B']);
    const [progress, setProgress] = useState(85); // Mock progress

    const getScoreDisplay = (score: number, par: number) => {
        const diff = score - par;
        if (diff < -1) return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">이글</Badge>;
        if (diff === -1) return <Badge variant="default" className="bg-sky-500 hover:bg-sky-600">버디</Badge>;
        if (diff === 0) return <Badge variant="secondary">파</Badge>;
        if (diff === 1) return <Badge variant="destructive" className="bg-red-400 hover:bg-red-500">보기</Badge>;
        if (diff > 1) return <Badge variant="destructive">더블보기+</Badge>;
        return score;
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
                             <Select defaultValue="all">
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="그룹 필터" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">모든 그룹</SelectItem>
                                    <SelectItem value="men">남자 개인전</SelectItem>
                                    <SelectItem value="women">여자 개인전</SelectItem>
                                    <SelectItem value="team">2인 1팀</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button>
                            <Download className="mr-2 h-4 w-4" />
                            엑셀로 다운로드
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {['남자 개인전', '여자 개인전', '2인 1팀'].map(groupName => (
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
                                        {activeCourses.map(courseId => {
                                            const course = mockCourses.find(c => c.id === courseId);
                                            return <TableHead key={courseId} className="text-center">{course?.name}</TableHead>
                                        })}
                                        <TableHead className="text-center">합계</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mockPlayers.filter(p => p.group === groupName).map(player => (
                                        <TableRow key={player.id}>
                                            <TableCell className="text-center font-bold text-lg">{player.rank}</TableCell>
                                            <TableCell className="font-medium">{player.name}</TableCell>
                                            <TableCell>{player.affiliation}</TableCell>
                                            <TableCell className="text-center">{player.jo}</TableCell>
                                            {activeCourses.map(courseId => {
                                                const course = mockCourses.find(c => c.id === courseId);
                                                // @ts-ignore
                                                const courseScores = player.scores[courseId] || [];
                                                const courseSum = courseScores.reduce((a: number, b: number) => a + b, 0);
                                                return <TableCell key={courseId} className="text-center">{courseSum}</TableCell>
                                            })}
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
