"use client"
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, UserPlus, Trash2, Edit, AlertTriangle, RotateCcw, Users, PlusCircle, X, Save } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { db } from "@/lib/firebase";
import { ref, onValue, push, remove, update, set } from "firebase/database";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';

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

    // Group management states
    const [groups, setGroups] = useState<string[]>([]);
    const [newGroupName, setNewGroupName] = useState("");

    // Editing states
    const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
    const [editingPlayerData, setEditingPlayerData] = useState<any | null>(null);
    
    const individualFileInputRef = useRef<HTMLInputElement>(null);
    const teamFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const playersRef = ref(db, 'players');
        const configRef = ref(db, 'config');
        const groupsRef = ref(db, 'tournaments/current/groups');
        
        const unsubPlayers = onValue(playersRef, (snapshot) => {
            const data = snapshot.val();
            setAllPlayers(data ? Object.entries(data).map(([id, player]) => ({ id, ...player as object })) : []);
        });
        
        const unsubConfig = onValue(configRef, (snapshot) => {
            const data = snapshot.val();
            if (data && data.maxPlayers) {
                setMaxPlayers(data.maxPlayers);
            }
            setConfigLoading(false);
        });

        const unsubGroups = onValue(groupsRef, (snapshot) => {
            const data = snapshot.val();
            setGroups(data ? Object.keys(data) : []);
        });

        return () => {
            unsubPlayers();
            unsubConfig();
            unsubGroups();
        };
    }, []);
    
    const handleDownloadTemplate = (type: 'individual' | 'team') => {
        const wb = XLSX.utils.book_new();
        let filename;

        if (type === 'individual') {
            const ws1_data = [
                ["조", "이름", "소속"],
                ["1", "홍길동", "중앙 파크골프"],
                ["1", "김철수", "강남 클럽"],
                ["2", "이영희", "행복 파크골프"],
                ["2", "박지성", "대한 파크골프"],
            ];
            const ws2_data = [
                ["조", "이름", "소속"],
                ["10", "김연아", "피겨 클럽"],
                ["10", "류현진", "야구 클럽"],
            ];
            const ws1 = XLSX.utils.aoa_to_sheet(ws1_data);
            const ws2 = XLSX.utils.aoa_to_sheet(ws2_data);
            XLSX.utils.book_append_sheet(wb, ws1, "A그룹 (예시)");
            XLSX.utils.book_append_sheet(wb, ws2, "B그룹 (예시)");
            filename = "개인전_선수등록_양식.xlsx";
        } else { // team
            const ws1_data = [
                ["조", "선수1 이름", "선수1 소속", "선수2 이름", "선수2 소속"],
                ["1", "홍길동", "중앙 파크골프", "김철수", "중앙 파크골프"],
                ["2", "이영희", "강남 클럽", "박지성", "대한 파크골프"],
            ];
            const ws2_data = [
                ["조", "선수1 이름", "선수1 소속", "선수2 이름", "선수2 소속"],
                ["5", "나팀", "팀플레이", "너팀", "팀플레이"],
            ];
            const ws1 = XLSX.utils.aoa_to_sheet(ws1_data);
            const ws2 = XLSX.utils.aoa_to_sheet(ws2_data);
            XLSX.utils.book_append_sheet(wb, ws1, "시니어팀 (예시)");
            XLSX.utils.book_append_sheet(wb, ws2, "일반팀 (예시)");
            filename = "2인1팀_선수등록_양식.xlsx";
        }

        XLSX.writeFile(wb, filename);
    };
    
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'individual' | 'team') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                const wb = XLSX.read(data, { type: 'binary' });
                let newPlayers: any[] = [];

                wb.SheetNames.forEach(sheetName => {
                    const groupName = sheetName;
                    const ws = wb.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(ws);
                    
                    if (jsonData.length < 1) return;

                    if (type === 'individual') {
                        jsonData.forEach((row: any) => {
                            const name = row['이름']?.toString().trim();
                            const affiliation = row['소속']?.toString().trim();
                            if (name && affiliation && row['조']) {
                                newPlayers.push({
                                    type: 'individual',
                                    group: groupName,
                                    jo: Number(row['조']),
                                    name: name,
                                    affiliation: affiliation,
                                });
                            }
                        });
                    } else { // team
                         jsonData.forEach((row: any) => {
                            const p1_name = row['선수1 이름']?.toString().trim();
                            const p2_name = row['선수2 이름']?.toString().trim();
                            if (p1_name && p2_name && row['조']) {
                                newPlayers.push({
                                    type: 'team',
                                    group: groupName,
                                    jo: Number(row['조']),
                                    p1_name: p1_name,
                                    p1_affiliation: row['선수1 소속']?.toString().trim() || '',
                                    p2_name: p2_name,
                                    p2_affiliation: row['선수2 소속']?.toString().trim() || '',
                                });
                            }
                        });
                    }
                });

                if (newPlayers.length === 0) {
                    toast({ title: '오류', description: '파일에서 유효한 선수 정보를 찾을 수 없습니다.', variant: 'destructive' });
                    return;
                }

                if (allPlayers.length + newPlayers.length > maxPlayers) {
                    toast({
                        title: '선수 등록 제한',
                        description: `엑셀 파일의 선수(${newPlayers.length}명)를 추가하면 최대 인원(${maxPlayers}명)을 초과합니다. 현재 ${allPlayers.length}명 등록됨.`,
                        variant: 'destructive'
                    });
                    return;
                }
                
                const updates: { [key: string]: any } = {};
                newPlayers.forEach(player => {
                    const newPlayerKey = push(ref(db, 'players')).key;
                    if(newPlayerKey) {
                        updates[`/players/${newPlayerKey}`] = player;
                    }
                });

                update(ref(db), updates)
                    .then(() => {
                        toast({ title: '성공', description: `${newPlayers.length}명의 선수가 성공적으로 등록되었습니다.`, className: 'bg-green-500 text-white' });
                    })
                    .catch(err => toast({ title: '저장 실패', description: err.message, variant: 'destructive' }));

            } catch (error) {
                console.error("Excel upload error:", error);
                toast({ title: '파일 처리 오류', description: '엑셀 파일을 처리하는 중 오류가 발생했습니다. 파일 형식이 올바른지 확인해주세요.', variant: 'destructive' });
            } finally {
                if(e.target) e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

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
    
    const handleAddGroup = () => {
        const trimmedName = newGroupName.trim();
        if (trimmedName === "") {
            toast({ title: '오류', description: '그룹 이름을 입력해주세요.', variant: 'destructive' });
            return;
        }
        const groupRef = ref(db, `tournaments/current/groups/${trimmedName}`);
        set(groupRef, true)
            .then(() => {
                toast({ title: '성공', description: '새 그룹이 추가되었습니다.', className: 'bg-green-500 text-white' });
                setNewGroupName("");
            })
            .catch(err => toast({ title: '오류', description: err.message, variant: 'destructive' }));
    };

    const handleDeleteGroup = (groupName: string) => {
        const groupRef = ref(db, `tournaments/current/groups/${groupName}`);
        remove(groupRef)
            .then(() => toast({ title: '성공', description: `'${groupName}' 그룹이 삭제되었습니다.`, variant: 'destructive' }))
            .catch(err => toast({ title: '오류', description: err.message, variant: 'destructive' }));
    };

    const handleEditClick = (player: any) => {
        setEditingPlayerId(player.id);
        setEditingPlayerData(player);
    };

    const handleCancelEdit = () => {
        setEditingPlayerId(null);
        setEditingPlayerData(null);
    };

    const handleEditingFormChange = (field: string, value: string | number) => {
        setEditingPlayerData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleUpdatePlayer = () => {
        if (!editingPlayerId || !editingPlayerData) return;

        const { id, ...dataToUpdate } = editingPlayerData;

        if (dataToUpdate.jo && typeof dataToUpdate.jo === 'string') {
            dataToUpdate.jo = Number(dataToUpdate.jo);
        }

        update(ref(db, `players/${editingPlayerId}`), dataToUpdate)
            .then(() => {
                toast({ title: '성공', description: '선수 정보가 수정되었습니다.', className: 'bg-green-500 text-white' });
                handleCancelEdit();
            })
            .catch(err => toast({ title: '수정 실패', description: err.message, variant: 'destructive' }));
    };

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl font-bold font-headline">선수 관리</CardTitle>
                <CardDescription>대회 그룹을 설정하고, 개인전 또는 2인 1팀 선수를 등록하고 관리합니다. <br />
                <span className="font-bold text-primary">현재 총 등록 인원: {allPlayers.length} / {configLoading ? '...' : maxPlayers} 명</span>
                </CardDescription>
            </CardHeader>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>그룹 관리</CardTitle>
                <CardDescription>대회에 사용할 그룹을 추가하거나 삭제합니다. 여기서 추가된 그룹을 선수 등록 시 선택할 수 있습니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="새 그룹 이름 (예: A-1 그룹, 시니어부)" onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()} />
                    <Button onClick={handleAddGroup}><PlusCircle className="mr-2 h-4 w-4" />추가</Button>
                </div>
                <div className="space-y-2">
                    <Label>현재 그룹 목록</Label>
                    <div className="flex flex-wrap gap-2">
                        {groups.length > 0 ? (
                            groups.map(group => (
                                <div key={group} className="flex items-center gap-1 bg-secondary text-secondary-foreground pl-3 pr-1 py-1 rounded-full text-sm font-medium">
                                    <span>{group}</span>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                             <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full"><X className="h-4 w-4 text-muted-foreground hover:text-destructive" /></Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>그룹을 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>'{group}' 그룹을 삭제합니다. 이 그룹에 속한 선수는 그대로 유지되지만, 그룹 필터링 등에 영향을 줄 수 있습니다.</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteGroup(group)}>삭제</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground pt-2">등록된 그룹이 없습니다. 위에서 새 그룹을 추가해주세요.</p>
                        )}
                    </div>
                </div>
            </CardContent>
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
                        <CardDescription>엑셀 또는 수동으로 개인전 선수를 등록합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Card className="bg-muted/30">
                            <CardHeader>
                                <CardTitle className="text-lg">엑셀로 일괄 등록</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col sm:flex-row gap-4">
                                <Button variant="outline" onClick={() => handleDownloadTemplate('individual')}><Download className="mr-2 h-4 w-4" /> 엑셀 양식 다운로드</Button>
                                <Button onClick={() => individualFileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> 엑셀 파일 업로드</Button>
                                <input type="file" ref={individualFileInputRef} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'individual')} />
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
                                        <Select value={individualGroup} onValueChange={setIndividualGroup} disabled={groups.length === 0}>
                                            <SelectTrigger><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                                            <SelectContent>
                                                {groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
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
                                            <TableHead className="px-4 py-2">그룹</TableHead><TableHead className="px-4 py-2">조</TableHead><TableHead className="px-4 py-2">선수명</TableHead><TableHead className="px-4 py-2">소속</TableHead><TableHead className="text-right px-4 py-2">관리</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {individualPlayers.map(p => (
                                            editingPlayerId === p.id ? (
                                                <TableRow key={p.id} className="bg-muted/30">
                                                    <TableCell className="px-4 py-2">
                                                        <Select value={editingPlayerData.group} onValueChange={(value) => handleEditingFormChange('group', value)}>
                                                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                            <SelectContent>{groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2"><Input value={editingPlayerData.jo} type="number" onChange={(e) => handleEditingFormChange('jo', e.target.value)} className="h-9 w-20" /></TableCell>
                                                    <TableCell className="px-4 py-2"><Input value={editingPlayerData.name} onChange={(e) => handleEditingFormChange('name', e.target.value)} className="h-9" /></TableCell>
                                                    <TableCell className="px-4 py-2"><Input value={editingPlayerData.affiliation} onChange={(e) => handleEditingFormChange('affiliation', e.target.value)} className="h-9" /></TableCell>
                                                    <TableCell className="text-right space-x-1 px-4 py-2">
                                                        <Button variant="ghost" size="icon" onClick={handleUpdatePlayer}><Save className="h-4 w-4 text-primary" /></Button>
                                                        <Button variant="ghost" size="icon" onClick={handleCancelEdit}><X className="h-4 w-4 text-muted-foreground" /></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                <TableRow key={p.id}>
                                                    <TableCell className="px-4 py-2">{p.group}</TableCell><TableCell className="px-4 py-2">{p.jo}</TableCell><TableCell className="px-4 py-2">{p.name}</TableCell><TableCell className="px-4 py-2">{p.affiliation}</TableCell>
                                                    <TableCell className="text-right space-x-2 px-4 py-2">
                                                        <Button variant="outline" size="icon" onClick={() => handleEditClick(p)}><Edit className="h-4 w-4" /></Button>
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
                                            )
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
                               <Button variant="outline" onClick={() => handleDownloadTemplate('team')}><Download className="mr-2 h-4 w-4" /> 엑셀 양식 다운로드</Button>
                                <Button onClick={() => teamFileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> 엑셀 파일 업로드</Button>
                                <input type="file" ref={teamFileInputRef} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'team')} />
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle className="text-lg">수동 등록</CardTitle><CardDescription>한 조(최대 2팀)씩 수동으로 등록합니다.</CardDescription></CardHeader>
                             <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>그룹</Label>
                                        <Select value={teamGroup} onValueChange={setTeamGroup} disabled={groups.length === 0}>
                                            <SelectTrigger><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                                            <SelectContent>
                                                {groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
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
                                            <TableHead className="px-4 py-2">그룹</TableHead><TableHead className="px-4 py-2">조</TableHead><TableHead className="px-4 py-2">팀원</TableHead><TableHead className="px-4 py-2">소속</TableHead><TableHead className="text-right px-4 py-2">관리</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {teamPlayers.map(t => (
                                            editingPlayerId === t.id ? (
                                                <TableRow key={t.id} className="bg-muted/30">
                                                    <TableCell className="px-4 py-2 align-top">
                                                        <Select value={editingPlayerData.group} onValueChange={(value) => handleEditingFormChange('group', value)}>
                                                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                            <SelectContent>{groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2 align-top"><Input value={editingPlayerData.jo} type="number" onChange={(e) => handleEditingFormChange('jo', e.target.value)} className="h-9 w-20" /></TableCell>
                                                    <TableCell className="px-4 py-2">
                                                        <div className="space-y-1">
                                                            <Input value={editingPlayerData.p1_name} onChange={(e) => handleEditingFormChange('p1_name', e.target.value)} className="h-9" placeholder="선수1 이름" />
                                                            <Input value={editingPlayerData.p2_name} onChange={(e) => handleEditingFormChange('p2_name', e.target.value)} className="h-9" placeholder="선수2 이름" />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2">
                                                        <div className="space-y-1">
                                                            <Input value={editingPlayerData.p1_affiliation} onChange={(e) => handleEditingFormChange('p1_affiliation', e.target.value)} className="h-9" placeholder="선수1 소속" />
                                                            <Input value={editingPlayerData.p2_affiliation} onChange={(e) => handleEditingFormChange('p2_affiliation', e.target.value)} className="h-9" placeholder="선수2 소속" />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right space-x-1 px-4 py-2 align-top">
                                                        <Button variant="ghost" size="icon" onClick={handleUpdatePlayer}><Save className="h-4 w-4 text-primary" /></Button>
                                                        <Button variant="ghost" size="icon" onClick={handleCancelEdit}><X className="h-4 w-4 text-muted-foreground" /></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                <TableRow key={t.id}>
                                                    <TableCell className="px-4 py-2">{t.group}</TableCell><TableCell className="px-4 py-2">{t.jo}</TableCell>
                                                    <TableCell className="px-4 py-2">{t.p1_name}, {t.p2_name}</TableCell>
                                                    <TableCell className="px-4 py-2">{t.p1_affiliation}{t.p2_affiliation ? ` / ${t.p2_affiliation}` : ''}</TableCell>
                                                    <TableCell className="text-right space-x-2 px-4 py-2">
                                                        <Button variant="outline" size="icon" onClick={() => handleEditClick(t)}><Edit className="h-4 w-4" /></Button>
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
                                            )
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
