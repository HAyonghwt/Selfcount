"use client"
import { useState, useEffect } from "react";
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
import { db } from "@/lib/firebase";
import { ref, onValue, push, remove, update } from "firebase/database";
import { useToast } from "@/hooks/use-toast";

const initialIndividualState = Array(4).fill({ name: '', affiliation: '' });
const initialTeamState = Array(2).fill({ p1_name: '', p1_affiliation: '', p2_name: '', p2_affiliation: '' });

export default function PlayerManagementPage() {
    const { toast } = useToast();
    const [allPlayers, setAllPlayers] = useState<any[]>([]);
    
    // Form states
    const [individualGroup, setIndividualGroup] = useState('');
    const [individualJo, setIndividualJo] = useState('');
    const [individualFormData, setIndividualFormData] = useState(initialIndividualState);

    const [teamGroup, setTeamGroup] = useState('');
    const [teamJo, setTeamJo] = useState('');
    const [teamFormData, setTeamFormData] = useState(initialTeamState);

    // Config states
    const [maxPlayers, setMaxPlayers] = useState(200);
    const [configLoading, setConfigLoading] = useState(true);

    useEffect(() => {
        const playersRef = ref(db, 'players');
        const unsubscribe = onValue(playersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const loadedPlayers = Object.entries(data).map(([id, player]) => ({ id, ...player as object }));
                setAllPlayers(loadedPlayers);
            } else {
                setAllPlayers([]);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const configRef = ref(db, 'config');
        const unsubscribe = onValue(configRef, (snapshot) => {
            const data = snapshot.val();
            if (data && data.maxPlayers) {
                setMaxPlayers(data.maxPlayers);
            }
            setConfigLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const individualPlayers = allPlayers.filter(p => p.type === 'individual');
    const teamPlayers = allPlayers.filter(p => p.type === 'team');

    const handleIndividualFormChange = (index: number, field: string, value: string) => {
        const newForm = [...individualFormData];
        newForm[index] = { ...newForm[index], [field]: value };
        setIndividualFormData(newForm);
    };

    const handleTeamFormChange = (index: number, field: string, value: string) => {
        const newForm = [...teamFormData];
        newForm[index] = { ...newForm[index], [field]: value };
        setTeamFormData(newForm);
    };

    const handleSaveIndividualPlayers = () => {
        if (!individualGroup || !individualJo) {
            toast({ title: '입력 오류', description: '그룹과 조 번호를 모두 입력해주세요.', variant: 'destructive' });
            return;
        }
        const playersToSave = individualFormData.filter(p => p.name.trim() !== '' && p.affiliation.trim() !== '');
        if (playersToSave.length === 0) {
            toast({ title: '정보 없음', description: '저장할 선수 정보가 없습니다.', variant: 'destructive' });
            return;
        }

        if (allPlayers.length + playersToSave.length > maxPlayers) {
            toast({
                title: '선수 등록 제한',
                description: `최대 참가 인원(${maxPlayers}명)을 초과합니다. 현재 ${allPlayers.length}명 등록됨.`,
                variant: 'destructive'
            });
            return;
        }

        const updates: { [key: string]: any } = {};
        playersToSave.forEach(player => {
            const newPlayerKey = push(ref(db, 'players')).key;
            updates[`/players/${newPlayerKey}`] = {
                type: 'individual',
                group: individualGroup,
                jo: Number(individualJo),
                name: player.name,
                affiliation: player.affiliation,
            };
        });

        update(ref(db), updates)
            .then(() => {
                toast({ title: '성공', description: '개인전 선수들이 저장되었습니다.', className: 'bg-green-500 text-white' });
                setIndividualFormData(initialIndividualState);
            })
            .catch(err => toast({ title: '저장 실패', description: err.message, variant: 'destructive' }));
    };

    const handleSaveTeamPlayers = () => {
        if (!teamGroup || !teamJo) {
            toast({ title: '입력 오류', description: '그룹과 조 번호를 모두 입력해주세요.', variant: 'destructive' });
            return;
        }
        const teamsToSave = teamFormData.filter(t => t.p1_name.trim() !== '' && t.p2_name.trim() !== '');
         if (teamsToSave.length === 0) {
            toast({ title: '정보 없음', description: '저장할 팀 정보가 없습니다.', variant: 'destructive' });
            return;
        }

        if (allPlayers.length + teamsToSave.length > maxPlayers) {
            toast({
                title: '팀 등록 제한',
                description: `최대 참가 인원(${maxPlayers}명)을 초과합니다. 현재 ${allPlayers.length}팀/명 등록됨.`,
                variant: 'destructive'
            });
            return;
        }

        const updates: { [key: string]: any } = {};
        teamsToSave.forEach(team => {
            const newTeamKey = push(ref(db, 'players')).key;
            updates[`/players/${newTeamKey}`] = {
                type: 'team',
                group: teamGroup,
                jo: Number(teamJo),
                p1_name: team.p1_name,
                p1_affiliation: team.p1_affiliation,
                p2_name: team.p2_name,
                p2_affiliation: team.p2_affiliation,
            };
        });

        update(ref(db), updates)
            .then(() => {
                toast({ title: '성공', description: '2인 1팀 선수들이 저장되었습니다.', className: 'bg-green-500 text-white' });
                setTeamFormData(initialTeamState);
            })
            .catch(err => toast({ title: '저장 실패', description: err.message, variant: 'destructive' }));
    };

    const handleDeletePlayer = (id: string) => {
        remove(ref(db, `players/${id}`));
    };
    
    const handleResetAllPlayers = () => {
        remove(ref(db, 'players'))
            .then(() => toast({ title: '초기화 완료', description: '모든 선수 명단이 삭제되었습니다.', className: 'bg-green-500 text-white'}))
            .catch(err => toast({ title: '초기화 실패', description: err.message, variant: 'destructive' }));
    };

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl font-bold font-headline">선수 관리</CardTitle>
                <CardDescription>개인전 또는 2인 1팀 선수를 등록하고 관리합니다. 수동으로 등록하거나 엑셀 파일로 일괄 업로드할 수 있습니다. <br />
                <span className="font-bold text-primary">현재 총 등록 인원: {allPlayers.length} / {configLoading ? '...' : maxPlayers} 명</span>
                </CardDescription>
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
                                <Button disabled><Upload className="mr-2 h-4 w-4" /> 엑셀 파일 업로드 (개발중)</Button>
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
                                        <Select value={individualGroup} onValueChange={setIndividualGroup}>
                                            <SelectTrigger><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="남자 개인전">남자 개인전</SelectItem>
                                                <SelectItem value="여자 개인전">여자 개인전</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="jo-individual">조 번호</Label>
                                        <Input id="jo-individual" type="number" placeholder="예: 1" value={individualJo} onChange={e => setIndividualJo(e.target.value)} />
                                    </div>
                                </div>
                                <div className="space-y-4 pt-4">
                                    {individualFormData.map((p, i) => (
                                        <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                                            <div className="space-y-2">
                                                <Label htmlFor={`p${i}-name`}>선수 {i + 1} 이름</Label>
                                                <Input id={`p${i}-name`} placeholder="홍길동" value={p.name} onChange={e => handleIndividualFormChange(i, 'name', e.target.value)} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor={`p${i}-affiliation`}>선수 {i + 1} 소속</Label>
                                                <Input id={`p${i}-affiliation`} placeholder="소속 클럽" value={p.affiliation} onChange={e => handleIndividualFormChange(i, 'affiliation', e.target.value)} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <Button size="lg" className="mt-4" onClick={handleSaveIndividualPlayers} disabled={configLoading}><UserPlus className="mr-2 h-4 w-4" /> 선수 저장</Button>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader>
                                <CardTitle>등록된 개인전 선수 목록</CardTitle>
                                <CardDescription>{individualPlayers.length}명의 개인전 선수가 등록되었습니다.</CardDescription>
                            </CardHeader>
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
                                                    <Button variant="outline" size="icon" disabled><Edit className="h-4 w-4" /></Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader><AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>{p.name} 선수의 정보를 삭제합니다.</AlertDialogDescription></AlertDialogHeader>
                                                            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePlayer(p.id)}>삭제</AlertDialogAction></AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
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
                                <Button disabled><Upload className="mr-2 h-4 w-4" /> 엑셀 파일 업로드 (개발중)</Button>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle className="text-lg">수동 등록</CardTitle><CardDescription>한 조(최대 2팀)씩 수동으로 등록합니다.</CardDescription></CardHeader>
                             <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>그룹</Label>
                                        <Select value={teamGroup} onValueChange={setTeamGroup}>
                                            <SelectTrigger><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="2인 1팀 혼성">2인 1팀 혼성</SelectItem>
                                                <SelectItem value="2인 1팀 부부">2인 1팀 부부</SelectItem>
                                                <SelectItem value="2인 1팀 남자">2인 1팀 남자</SelectItem>
                                                <SelectItem value="2인 1팀 여자">2인 1팀 여자</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="jo-team">조 번호</Label>
                                        <Input id="jo-team" type="number" placeholder="예: 1" value={teamJo} onChange={e => setTeamJo(e.target.value)} />
                                    </div>
                                </div>
                                {teamFormData.map((team, i) => (
                                    <div key={i} className="space-y-4 border-t pt-4">
                                        <h4 className="font-semibold text-primary">{i + 1}팀 정보</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Input placeholder="선수 1 이름" value={team.p1_name} onChange={e => handleTeamFormChange(i, 'p1_name', e.target.value)} />
                                            <Input placeholder="선수 1 소속" value={team.p1_affiliation} onChange={e => handleTeamFormChange(i, 'p1_affiliation', e.target.value)} />
                                            <Input placeholder="선수 2 이름" value={team.p2_name} onChange={e => handleTeamFormChange(i, 'p2_name', e.target.value)} />
                                            <Input placeholder="선수 2 소속" value={team.p2_affiliation} onChange={e => handleTeamFormChange(i, 'p2_affiliation', e.target.value)} />
                                        </div>
                                    </div>
                                ))}
                                <Button size="lg" className="mt-4" onClick={handleSaveTeamPlayers} disabled={configLoading}><UserPlus className="mr-2 h-4 w-4" /> 팀 저장</Button>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>등록된 2인 1팀 목록</CardTitle>
                                <CardDescription>{teamPlayers.length}개의 팀이 등록되었습니다.</CardDescription>
                            </CardHeader>
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
                                                    <Button variant="outline" size="icon" disabled><Edit className="h-4 w-4" /></Button>
                                                     <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader><AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>{t.p1_name}, {t.p2_name} 팀의 정보를 삭제합니다.</AlertDialogDescription></AlertDialogHeader>
                                                            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePlayer(t.id)}>삭제</AlertDialogAction></AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
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
                            <AlertDialogAction onClick={handleResetAllPlayers} className="bg-destructive hover:bg-destructive/90">초기화</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    </div>
  )
}
