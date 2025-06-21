"use client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, UserPlus, Trash2, Edit, AlertTriangle, RotateCcw, Users } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const individualPlayers = [
    { id: 'p1', group: '남자 개인전', jo: 1, name: '김철수', affiliation: '서울클럽' },
    { id: 'p2', group: '남자 개인전', jo: 1, name: '이영민', affiliation: '부산클럽' },
    { id: 'p3', group: '여자 개인전', jo: 2, name: '최지아', affiliation: '인천클럽' },
];

const teamPlayers = [
    { id: 't1', group: '2인 1팀 혼성', jo: 1, p1_name: '나영희', p1_affiliation: '대전클럽', p2_name: '황인성', p2_affiliation: '대전클럽' },
    { id: 't2', group: '2인 1팀 부부', jo: 2, p1_name: '이하나', p1_affiliation: '광주클럽', p2_name: '강민준', p2_affiliation: '광주클럽' },
];

export default function PlayerManagementPage() {
  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl font-bold font-headline">선수 관리</CardTitle>
                <CardDescription>개인전 또는 2인 1팀 선수를 등록하고 관리합니다. 수동으로 등록하거나 엑셀 파일로 일괄 업로드할 수 있습니다.</CardDescription>
            </CardHeader>
        </Card>
        <Tabs defaultValue="individual">
            <TabsList className="grid w-full grid-cols-2 h-12">
                <TabsTrigger value="individual" className="h-10 text-base"><UserPlus className="mr-2"/>개인전 선수 등록</TabsTrigger>
                <TabsTrigger value="team" className="h-10 text-base"><Users className="mr-2"/>2인 1팀 선수 등록</TabsTrigger>
            </TabsList>
            <TabsContent value="individual">
                <Card>
                    <CardHeader>
                        <CardTitle>개인전 선수 등록</CardTitle>
                        <CardDescription>새로운 개인전 선수를 등록합니다. 엑셀 업로드 또는 수동 등록이 가능합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Card className="bg-muted/30">
                            <CardHeader>
                                <CardTitle className="text-lg">엑셀로 일괄 등록</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col sm:flex-row gap-4">
                                <Button variant="outline"><Download className="mr-2 h-4 w-4" /> 엑셀 양식 다운로드 (.xlsx)</Button>
                                <Button><Upload className="mr-2 h-4 w-4" /> 엑셀 파일 업로드</Button>
                            </CardContent>
                        </Card>
                        <Card>
                             <CardHeader>
                                <CardTitle className="text-lg">수동 등록</CardTitle>
                                <CardDescription>한 조(최대 4명)씩 수동으로 등록합니다.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div className="space-y-2">
                                        <Label>그룹</Label>
                                        <Select>
                                            <SelectTrigger><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="men-s">남자 개인전</SelectItem>
                                                <SelectItem value="women-s">여자 개인전</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="jo-individual">조 번호</Label>
                                        <Input id="jo-individual" type="number" placeholder="예: 1" />
                                    </div>
                                </div>
                                <div className="space-y-4 pt-4">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                                            <div className="space-y-2">
                                                <Label htmlFor={`p${i}-name`}>선수 {i} 이름</Label>
                                                <Input id={`p${i}-name`} placeholder="홍길동" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor={`p${i}-affiliation`}>선수 {i} 소속</Label>
                                                <Input id={`p${i}-affiliation`} placeholder="소속 클럽" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <Button size="lg" className="mt-4"><UserPlus className="mr-2 h-4 w-4" /> 선수 저장</Button>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle>등록된 개인전 선수 목록</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>그룹</TableHead><TableHead>조</TableHead><TableHead>선수명</TableHead><TableHead>소속</TableHead><TableHead className="text-right">관리</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {individualPlayers.map(p => (
                                            <TableRow key={p.id}>
                                                <TableCell>{p.group}</TableCell><TableCell>{p.jo}</TableCell><TableCell>{p.name}</TableCell><TableCell>{p.affiliation}</TableCell>
                                                <TableCell className="text-right space-x-2">
                                                    <Button variant="outline" size="icon"><Edit className="h-4 w-4" /></Button>
                                                    <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="team">
                <Card>
                    <CardHeader><CardTitle>2인 1팀 선수 등록</CardTitle><CardDescription>엑셀 또는 수동으로 2인 1팀을 등록합니다.</CardDescription></CardHeader>
                    <CardContent className="space-y-6">
                        <Card className="bg-muted/30">
                            <CardHeader><CardTitle className="text-lg">엑셀로 일괄 등록</CardTitle></CardHeader>
                            <CardContent className="flex flex-col sm:flex-row gap-4">
                               <Button variant="outline"><Download className="mr-2 h-4 w-4" /> 엑셀 양식 다운로드 (.xlsx)</Button>
                                <Button><Upload className="mr-2 h-4 w-4" /> 엑셀 파일 업로드</Button>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle className="text-lg">수동 등록</CardTitle><CardDescription>한 조(최대 2팀)씩 수동으로 등록합니다.</CardDescription></CardHeader>
                             <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>그룹</Label>
                                        <Select>
                                            <SelectTrigger><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="mixed">2인 1팀 혼성</SelectItem>
                                                <SelectItem value="couple">2인 1팀 부부</SelectItem>
                                                <SelectItem value="male">2인 1팀 남자</SelectItem>
                                                <SelectItem value="female">2인 1팀 여자</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="jo-team">조 번호</Label>
                                        <Input id="jo-team" type="number" placeholder="예: 1" />
                                    </div>
                                </div>
                                {[1, 2].map(teamNum => (
                                    <div key={teamNum} className="space-y-4 border-t pt-4">
                                        <h4 className="font-semibold text-primary">{teamNum}팀 정보</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Input placeholder="선수 1 이름" /><Input placeholder="선수 1 소속" />
                                            <Input placeholder="선수 2 이름" /><Input placeholder="선수 2 소속" />
                                        </div>
                                    </div>
                                ))}
                                <Button size="lg" className="mt-4"><UserPlus className="mr-2 h-4 w-4" /> 팀 저장</Button>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>등록된 2인 1팀 목록</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>그룹</TableHead><TableHead>조</TableHead><TableHead>팀원</TableHead><TableHead>소속</TableHead><TableHead className="text-right">관리</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {teamPlayers.map(t => (
                                            <TableRow key={t.id}>
                                                <TableCell>{t.group}</TableCell><TableCell>{t.jo}</TableCell>
                                                <TableCell>{t.p1_name}, {t.p2_name}</TableCell>
                                                <TableCell>{t.p1_affiliation}</TableCell>
                                                <TableCell className="text-right space-x-2">
                                                    <Button variant="outline" size="icon"><Edit className="h-4 w-4" /></Button>
                                                    <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        <Card>
            <CardHeader>
                <CardTitle>선수 데이터 초기화</CardTitle>
                <CardDescription>
                    모든 등록된 선수 및 팀 정보를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive"><RotateCcw className="mr-2 h-4 w-4" /> 선수 명단 전체 초기화</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/>정말 초기화하시겠습니까?</AlertDialogTitle>
                            <AlertDialogDescription>
                                이 작업은 되돌릴 수 없습니다. 모든 개인전 및 2인 1팀 선수 명단이 영구적으로 삭제됩니다.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive hover:bg-destructive/90">초기화</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    </div>
  )
}
