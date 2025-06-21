"use client";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const mockScores = [
    { id: 's1', group: '남자 개인전', jo: 1, name: '김철수', course: '햇살코스', hole: 1, score: 4 },
    { id: 's2', group: '남자 개인전', jo: 1, name: '김철수', course: '햇살코스', hole: 2, score: 3 },
    { id: 's3', group: '남자 개인전', jo: 1, name: '김철수', course: '햇살코스', hole: 3, score: 4 },
    { id: 's4', group: '여자 개인전', jo: 2, name: '최지아', course: '바람코스', hole: 1, score: 3 },
    { id: 's5', group: '여자 개인전', jo: 2, name: '최지아', course: '바람코스', hole: 2, score: 3 },
    { id: 's6', group: '2인 1팀 혼성', jo: 3, name: '나영희/황인성', course: '햇살코스', hole: 1, score: 4 },
];

interface EditableScore {
  id: string;
  group: string;
  jo: number;
  name: string;
  course: string;
  hole: number;
  score: number;
}

export default function ScoreManagementPage() {
    const [scores, setScores] = useState(mockScores);
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<number | string>('');
    const [scoreToUpdate, setScoreToUpdate] = useState<EditableScore | null>(null);
    const { toast } = useToast();

    const handleDoubleClick = (score: EditableScore) => {
        setEditingCell(score.id);
        setEditValue(score.score);
    };

    const handleUpdateAttempt = (score: EditableScore) => {
        setScoreToUpdate({ ...score, score: Number(editValue) });
    };

    const handleConfirmUpdate = () => {
        if (!scoreToUpdate) return;
        
        // In a real app, update the database here.
        setScores(scores.map(s => s.id === scoreToUpdate.id ? scoreToUpdate : s));
        
        toast({
            title: "점수 수정 완료",
            description: `${scoreToUpdate.group} ${scoreToUpdate.jo}조 ${scoreToUpdate.name} 선수의 ${scoreToUpdate.course} ${scoreToUpdate.hole}홀 점수가 ${scoreToUpdate.score}점으로 수정되었습니다.`,
            className: "bg-green-500 text-white",
        });

        setEditingCell(null);
        setScoreToUpdate(null);
    };

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
                            <Input placeholder="선수명으로 검색..." className="pl-10 h-12" />
                        </div>
                        <Select><SelectTrigger className="w-full md:w-[180px] h-12"><SelectValue placeholder="그룹 선택" /></SelectTrigger><SelectContent><SelectItem value="all">모든 그룹</SelectItem></SelectContent></Select>
                        <Select><SelectTrigger className="w-full md:w-[180px] h-12"><SelectValue placeholder="코스 선택" /></SelectTrigger><SelectContent><SelectItem value="all">모든 코스</SelectItem></SelectContent></Select>
                        <Button className="h-12"><Search className="mr-2 h-4 w-4" /> 검색</Button>
                    </div>
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
                                {scores.map((score) => (
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
