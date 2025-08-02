
"use client"
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, UserPlus, Trash2, Edit, AlertTriangle, RotateCcw, Users, PlusCircle, X, Save, Settings, Check, Columns, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
    const [groupsData, setGroupsData] = useState<any>({});
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupType, setNewGroupType] = useState<'individual' | 'team'>('individual');
    const [courses, setCourses] = useState<any[]>([]);
    
    // Course assignment modal states
    const [isGroupCourseModalOpen, setGroupCourseModalOpen] = useState(false);
    const [currentEditingGroup, setCurrentEditingGroup] = useState<any>(null);
    const [assignedCourses, setAssignedCourses] = useState<{[key: string]: boolean}>({});


    // Editing states
    const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
    const [editingPlayerData, setEditingPlayerData] = useState<any | null>(null);
    
    // Refs for file inputs, compatible with React 19
    const [individualFileInput, setIndividualFileInput] = useState<HTMLInputElement | null>(null);
    const [teamFileInput, setTeamFileInput] = useState<HTMLInputElement | null>(null);

    // Search states
    const [individualSearchTerm, setIndividualSearchTerm] = useState('');
    const [teamSearchTerm, setTeamSearchTerm] = useState('');


    useEffect(() => {
        const playersRef = ref(db!, 'players');
        const configRef = ref(db!, 'config');
        const tournamentRef = ref(db!, 'tournaments/current');
        
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

        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setGroupsData(data.groups || {});
            setCourses(data.courses ? Object.values(data.courses) : []); // isActive 필터 제거
        });

        return () => {
            unsubPlayers();
            unsubConfig();
            unsubTournament();
        };
    }, []);
    
    const handleDownloadTemplate = (type: 'individual' | 'team') => {
        const wb = XLSX.utils.book_new();
        let filename;

        if (type === 'individual') {
            const ws1_data = [
                ["조", "이름", "소속"],
                [1, "김철1", "용인"], [1, "김철2", "김천"], [1, "김철3", "가평"], [1, "김철4", "이천"],
                [2, "김철5", "대구수성"], [2, "김철6", "칠곡"], [2, "김철7", "진주"], [2, "김철8", "수원"],
                [3, "김철9", "용인"], [3, "김철10", "김천"], [3, "김철11", "가평"], [3, "김철12", "이천"],
                [4, "김철13", "대구수성"], [4, "김철14", "칠곡"], [4, "김철15", "진주"], [4, "김철16", "수원"],
            ];
            const ws2_data = [
                ["조", "이름", "소속"],
                [1, "김영1", "용인"], [1, "김영2", "용인"], [1, "김영3", "용인"], [1, "김영4", "용인"],
                [2, "김영5", "용인"], [2, "김영6", "용인"], [2, "김영7", "용인"], [2, "김영8", "용인"],
                [3, "김영9", "용인"], [3, "김영10", "용인"], [3, "김영11", "용인"], [3, "김영12", "용인"],
            ];
            const ws1 = XLSX.utils.aoa_to_sheet(ws1_data);
            const ws2 = XLSX.utils.aoa_to_sheet(ws2_data);
            XLSX.utils.book_append_sheet(wb, ws1, "남자개인전");
            XLSX.utils.book_append_sheet(wb, ws2, "여자개인전");
            filename = "개인전_선수등록_양식.xlsx";
        } else { // team
            const team_data = [
                ["조", "선수1 이름", "선수1 소속", "선수2 이름", "선수2 소속"],
                [1, "홍길동", "서울광진", "김순희", "서울광진"],
                [1, "이영희", "경기용인", "정희숙", "경기용인"],
                [2, "김철수", "강원속초", "강진숙", "강원속초"],
                [2, "장선호", "강원화천", "임미숙", "강원화천"],
                [3, "권영운", "경기가평", "김미애", "경기가평"],
                [4, "김영식", "충남천안", "장성희", "충남천안"],
                [5, "손종철", "경기평택", "오선애", "경기평택"],
                [5, "허만덕", "강원평창", "강현숙", "강원평창"],
            ];
            
            const ws1 = XLSX.utils.aoa_to_sheet(team_data);
            const ws2 = XLSX.utils.aoa_to_sheet(team_data);
            XLSX.utils.book_append_sheet(wb, ws1, "부부대항");
            XLSX.utils.book_append_sheet(wb, ws2, "혼성2인");
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

                // 그룹명 체크 추가
                const sheetNames = wb.SheetNames;
                const groupList = Object.values(groupsData)
                    .filter((g: any) => g.type === type)
                    .map((g: any) => g.name);
                const missingGroups = groupList.filter(g => !sheetNames.includes(g));
                const extraGroups = sheetNames.filter(s => !groupList.includes(s));
                const duplicateGroups = sheetNames.filter((s, i, arr) => arr.indexOf(s) !== i);

                if (extraGroups.length > 0) {
                    toast({
                        title: '그룹명 불일치',
                        description: `엑셀 파일에 그룹 목록에 없는 그룹이 포함되어 있습니다: ${extraGroups.join(', ')}`,
                    });
                    return;
                }
                if (duplicateGroups.length > 0) {
                    toast({
                        title: '그룹명 중복',
                        description: `엑셀 파일에 그룹명이 중복되어 있습니다: ${duplicateGroups.join(', ')}`,
                    });
                    return;
                }
                if (missingGroups.length > 0) {
                    if (!window.confirm(`엑셀 파일에 그룹이 일부 빠져 있습니다: ${missingGroups.join(', ')}\n이대로 선수 등록을 진행하시겠습니까?`)) {
                        return;
                    }
                }

                wb.SheetNames.forEach(sheetName => {
                    const groupName = sheetName;
                    const ws = wb.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(ws);
                    
                    if (jsonData.length < 1) return;

                    if (type === 'individual') {
                        jsonData.forEach((row: any) => {
                            const name = row['이름']?.toString().trim();
                            const jo = row['조'];
                            const affiliation = row['소속']?.toString().trim() || '무소속';

                            if (name && jo) {
                                newPlayers.push({
                                    type: 'individual',
                                    group: groupName,
                                    jo: jo.toString(),
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
                                    jo: row['조'].toString(),
                                    p1_name: p1_name,
                                    p1_affiliation: row['선수1 소속']?.toString().trim() || '무소속',
                                    p2_name: p2_name,
                                    p2_affiliation: row['선수2 소속']?.toString().trim() || '무소속',
                                });
                            }
                        });
                    }
                });

                if (newPlayers.length === 0) {
                    toast({ title: '오류', description: '파일에서 유효한 선수 정보를 찾을 수 없습니다.' });
                    return;
                }

                // --- 조별 인원(팀) 제한 검증 시작 ---
const groupJoLimit = type === 'individual' ? 4 : 2;
// 기존 선수/팀 + 신규 업로드를 그룹/조별로 집계
const groupJoMap: { [key: string]: { [key: string]: number } } = {};
// 기존
allPlayers.filter((p: any) => p.type === type).forEach((p: any) => {
    const g = p.group || '';
    const j = p.jo || '';
    if (!groupJoMap[g]) groupJoMap[g] = {};
    if (!groupJoMap[g][j]) groupJoMap[g][j] = 0;
    groupJoMap[g][j]++;
});
// 신규
newPlayers.forEach((p: any) => {
    const g = p.group || '';
    const j = p.jo || '';
    if (!groupJoMap[g]) groupJoMap[g] = {};
    if (!groupJoMap[g][j]) groupJoMap[g][j] = 0;
    groupJoMap[g][j]++;
});
// 초과 조 찾기
const overList: string[] = [];
Object.entries(groupJoMap).forEach(([g, jos]: [string, any]) => {
    Object.entries(jos).forEach(([j, cnt]: [string, any]) => {
        if (cnt > groupJoLimit) {
            overList.push(`${g} 그룹 ${j}조: ${cnt}${type === 'individual' ? '명' : '팀'} (최대 ${groupJoLimit}${type === 'individual' ? '명' : '팀'})`);
        }
    });
});
if (overList.length > 0) {
    toast({
        title: '조별 인원(팀) 초과',
        description: overList.join('\n') + '\n조별 최대 인원을 초과하여 등록할 수 없습니다.',
    });
    return;
}
// --- 조별 인원(팀) 제한 검증 끝 ---

if (allPlayers.length + newPlayers.length > maxPlayers) {
    toast({
        title: '선수 등록 제한',
        description: `엑셀 파일의 선수(${newPlayers.length}명)를 추가하면 최대 인원(${maxPlayers}명)을 초과합니다. 현재 ${allPlayers.length}명 등록됨.`,
    });
    return;
}
                
                const updates: { [key: string]: any } = {};
                newPlayers.forEach(player => {
                    const newPlayerKey = push(ref(db!, 'players')).key;
                    if(newPlayerKey) {
                        updates[`/players/${newPlayerKey}`] = player;
                    }
                });

                // 새로운 그룹들 자동 생성
                const newGroups = [...new Set(newPlayers.map(p => p.group))];
                newGroups.forEach(groupName => {
                    if (!groupsData[groupName]) {
                        const defaultCourses = courses.reduce((acc, course) => {
                            acc[course.id] = true;
                            return acc;
                        }, {});
                        updates[`/tournaments/current/groups/${groupName}`] = {
                            name: groupName,
                            type: type,
                            courses: defaultCourses
                        };
                    }
                });

                update(ref(db!), updates)
                    .then(() => {
                        toast({ title: '성공', description: `${newPlayers.length}명의 선수가 성공적으로 등록되었습니다.` });
                    })
                    .catch(err => toast({ title: '저장 실패', description: err.message }));

            } catch (error) {
                console.error("Excel upload error:", error);
                toast({ title: '파일 처리 오류', description: '엑셀 파일을 처리하는 중 오류가 발생했습니다. 파일 형식이 올바른지 확인해주세요.' });
            } finally {
                if(e.target) e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const { groupedIndividualPlayers, groupedTeamPlayers } = useMemo(() => {
        const individual = allPlayers.filter(p => p.type === 'individual');
        const team = allPlayers.filter(p => p.type === 'team');

        const createGroupedData = (players: any[]) => {
            const grouped = players.reduce((acc: { [key: string]: any[] }, player: any) => {
                const groupName = player.group || '미지정';
                if (!acc[groupName]) {
                    acc[groupName] = [];
                }
                acc[groupName].push(player);
                return acc;
            }, {} as { [key: string]: any[] });
            
            Object.values(grouped).forEach((playerList: any[]) => {
                playerList.sort((a: any, b: any) => {
                    if (a.jo !== b.jo) return a.jo - b.jo;
                    const nameA = a.name || a.p1_name || '';
                    const nameB = b.name || b.p1_name || '';
                    return nameA.localeCompare(nameB);
                });
            });

            return grouped;
        };

        return {
            groupedIndividualPlayers: createGroupedData(individual),
            groupedTeamPlayers: createGroupedData(team),
        };
    }, [allPlayers]);

    const filteredGroupedIndividualPlayers = useMemo(() => {
        if (!individualSearchTerm) return groupedIndividualPlayers;
        
        const lowercasedFilter = individualSearchTerm.toLowerCase();
        const filtered: { [key: string]: any[] } = {};
        
        for (const groupName in groupedIndividualPlayers) {
            const players = groupedIndividualPlayers[groupName].filter((p: any) => 
                p.name.toLowerCase().includes(lowercasedFilter) ||
                p.affiliation.toLowerCase().includes(lowercasedFilter) ||
                p.jo.toString().includes(individualSearchTerm)
            );
            if (players.length > 0) {
                filtered[groupName] = players;
            }
        }
        return filtered;
    }, [groupedIndividualPlayers, individualSearchTerm]);

    const filteredGroupedTeamPlayers = useMemo(() => {
        if (!teamSearchTerm) return groupedTeamPlayers;
    
        const lowercasedFilter = teamSearchTerm.toLowerCase();
        const filtered: { [key: string]: any[] } = {};
        
        for (const groupName in groupedTeamPlayers) {
            const players = groupedTeamPlayers[groupName].filter((t: any) => 
                t.p1_name.toLowerCase().includes(lowercasedFilter) ||
                (t.p2_name && t.p2_name.toLowerCase().includes(lowercasedFilter)) ||
                t.p1_affiliation.toLowerCase().includes(lowercasedFilter) ||
                (t.p2_affiliation && t.p2_affiliation.toLowerCase().includes(lowercasedFilter)) ||
                t.jo.toString().includes(teamSearchTerm)
            );
            if (players.length > 0) {
                filtered[groupName] = players;
            }
        }
        return filtered;
    }, [groupedTeamPlayers, teamSearchTerm]);


    const individualPlayersCount = allPlayers.filter(p => p.type === 'individual').length;
    const teamPlayersCount = allPlayers.filter(p => p.type === 'team').length;


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
            toast({ title: '입력 오류', description: '그룹과 조 번호를 모두 입력해주세요.' });
            return;
        }
        const playersToSave = individualFormData.filter(p => p.name.trim() !== '');
        if (playersToSave.length === 0) {
            toast({ title: '정보 없음', description: '저장할 선수 정보가 없습니다.' });
            return;
        }

        if (allPlayers.length + playersToSave.length > maxPlayers) {
            toast({
                title: '선수 등록 제한',
                description: `최대 참가 인원(${maxPlayers}명)을 초과합니다. 현재 ${allPlayers.length}명 등록됨.`,
            });
            return;
        }

        const updates: { [key: string]: any } = {};
        playersToSave.forEach(player => {
            const newPlayerKey = push(ref(db!, 'players')).key;
            updates[`/players/${newPlayerKey}`] = {
                type: 'individual',
                group: individualGroup,
                jo: individualJo,
                name: player.name,
                affiliation: player.affiliation || '무소속',
            };
        });

        // 그룹이 없으면 자동으로 생성
        if (!groupsData[individualGroup]) {
            console.log('Creating new group:', individualGroup);
            const defaultCourses = courses.reduce((acc, course) => {
                acc[course.id] = true;
                return acc;
            }, {});
            updates[`/tournaments/current/groups/${individualGroup}`] = {
                name: individualGroup,
                type: 'individual',
                courses: defaultCourses
            };
            console.log('Group creation added to updates:', updates);
        } else {
            console.log('Group already exists:', individualGroup);
        }

        update(ref(db!), updates)
            .then(() => {
                toast({ title: '성공', description: '개인전 선수들이 저장되었습니다.' });
                setIndividualFormData(initialIndividualState);
            })
            .catch(err => toast({ title: '저장 실패', description: err.message }));
    };

    const handleSaveTeamPlayers = () => {
        if (!teamGroup || !teamJo) {
            toast({ title: '입력 오류', description: '그룹과 조 번호를 모두 입력해주세요.' });
            return;
        }
        const teamsToSave = teamFormData.filter(t => t.p1_name.trim() !== '' && t.p2_name.trim() !== '');
         if (teamsToSave.length === 0) {
            toast({ title: '정보 없음', description: '저장할 팀 정보가 없습니다.' });
            return;
        }

        if (allPlayers.length + teamsToSave.length > maxPlayers) {
            toast({
                title: '팀 등록 제한',
                description: `최대 참가 인원(${maxPlayers}명)을 초과합니다. 현재 ${allPlayers.length}팀/명 등록됨.`,
            });
            return;
        }

        const updates: { [key: string]: any } = {};
        teamsToSave.forEach(team => {
            const newTeamKey = push(ref(db!, 'players')).key;
            updates[`/players/${newTeamKey}`] = {
                type: 'team',
                group: teamGroup,
                jo: teamJo,
                p1_name: team.p1_name,
                p1_affiliation: team.p1_affiliation || '무소속',
                p2_name: team.p2_name,
                p2_affiliation: team.p2_affiliation || '무소속',
            };
        });

        // 그룹이 없으면 자동으로 생성
        if (!groupsData[teamGroup]) {
            const defaultCourses = courses.reduce((acc, course) => {
                acc[course.id] = true;
                return acc;
            }, {});
            updates[`/tournaments/current/groups/${teamGroup}`] = {
                name: teamGroup,
                type: 'team',
                courses: defaultCourses
            };
        }

        update(ref(db!), updates)
            .then(() => {
                toast({ title: '성공', description: '2인 1팀 선수들이 저장되었습니다.' });
                setTeamFormData(initialTeamState);
            })
            .catch(err => toast({ title: '저장 실패', description: err.message }));
    };

    const handleDeletePlayer = (id: string) => {
        remove(ref(db!, `players/${id}`));
    };
    
    // 개인전 선수만 초기화
    const handleResetIndividualPlayers = () => {
        const individualPlayers = allPlayers.filter(p => p.type === 'individual');
        const updates: { [key: string]: null } = {};
        individualPlayers.forEach(player => {
            updates[`/players/${player.id}`] = null;
        });
        
        update(ref(db!), updates)
            .then(() => toast({ title: '초기화 완료', description: '개인전 선수 명단이 삭제되었습니다.'}))
            .catch(err => toast({ title: '초기화 실패', description: err.message }));
    };

    // 2인1팀 선수만 초기화
    const handleResetTeamPlayers = () => {
        const teamPlayers = allPlayers.filter(p => p.type === 'team');
        const updates: { [key: string]: null } = {};
        teamPlayers.forEach(player => {
            updates[`/players/${player.id}`] = null;
        });
        
        update(ref(db!), updates)
            .then(() => toast({ title: '초기화 완료', description: '2인1팀 선수 명단이 삭제되었습니다.'}))
            .catch(err => toast({ title: '초기화 실패', description: err.message }));
    };

    // 개인전 그룹만 초기화
    const handleResetIndividualGroups = () => {
        const individualGroups = Object.entries(groupsData)
            .filter(([_, group]: [string, any]) => group.type === 'individual')
            .map(([name, _]) => name);
        
        const updates: { [key: string]: null } = {};
        individualGroups.forEach(groupName => {
            updates[`/tournaments/current/groups/${groupName}`] = null;
        });
        
        update(ref(db!), updates)
            .then(() => toast({ title: '초기화 완료', description: '개인전 그룹이 삭제되었습니다.'}))
            .catch(err => toast({ title: '초기화 실패', description: err.message }));
    };

    // 2인1팀 그룹만 초기화
    const handleResetTeamGroups = () => {
        const teamGroups = Object.entries(groupsData)
            .filter(([_, group]: [string, any]) => group.type === 'team')
            .map(([name, _]) => name);
        
        const updates: { [key: string]: null } = {};
        teamGroups.forEach(groupName => {
            updates[`/tournaments/current/groups/${groupName}`] = null;
        });
        
        update(ref(db!), updates)
            .then(() => toast({ title: '초기화 완료', description: '2인1팀 그룹이 삭제되었습니다.'}))
            .catch(err => toast({ title: '초기화 실패', description: err.message }));
    };
    
    // 그룹 추가 핸들러를 탭 타입에 따라 받도록 수정
    const handleAddGroup = (type: 'individual' | 'team') => {
        const trimmedName = newGroupName.trim();
        if (trimmedName === "") {
            toast({ title: '오류', description: '그룹 이름을 입력해주세요.' });
            return;
        }
        if (groupsData[trimmedName]) {
            toast({ title: '오류', description: '이미 존재하는 그룹 이름입니다.' });
            return;
        }

        const groupRef = ref(db!, `tournaments/current/groups/${trimmedName}`);
        const defaultCourses = courses.reduce((acc, course) => {
            acc[course.id] = true;
            return acc;
        }, {});

        set(groupRef, { name: trimmedName, type, courses: defaultCourses })
            .then(() => {
                toast({ title: '성공', description: `새 그룹 '${trimmedName}'이 추가되었습니다.` });
                setNewGroupName("");
            })
            .catch(err => toast({ title: '오류', description: err.message }));
    };

    const handleDeleteGroup = (groupName: string) => {
        const groupRef = ref(db!, `tournaments/current/groups/${groupName}`);
        remove(groupRef)
            .then(() => toast({ title: '성공', description: `'${groupName}' 그룹이 삭제되었습니다.` }))
            .catch(err => toast({ title: '오류', description: err.message }));
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

        // 조 번호는 문자열로 유지

        update(ref(db!, `players/${editingPlayerId}`), dataToUpdate)
            .then(() => {
                toast({ title: '성공', description: '선수 정보가 수정되었습니다.' });
                handleCancelEdit();
            })
            .catch(err => toast({ title: '수정 실패', description: err.message }));
    };

    const handleOpenCourseModal = (group: any) => {
        setCurrentEditingGroup(group);
        setAssignedCourses(group.courses || {});
        setGroupCourseModalOpen(true);
    };

    const handleSaveGroupCourses = () => {
        if (!currentEditingGroup) return;
        const groupCoursesRef = ref(db!, `tournaments/current/groups/${currentEditingGroup.name}/courses`);
        set(groupCoursesRef, assignedCourses)
            .then(() => {
                toast({ title: "저장 완료", description: `${currentEditingGroup.name} 그룹의 코스 설정이 저장되었습니다.` });
                setGroupCourseModalOpen(false);
                setCurrentEditingGroup(null);
            })
            .catch((err) => toast({ title: "저장 실패", description: err.message }));
    };

    const groupList = Object.values(groupsData).sort((a: any, b: any) => a.name.localeCompare(b.name));
    const groupNameList = groupList.map((g: any) => g.name);

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

        <Tabs defaultValue="individual-group">
            <TabsList className="grid w-full grid-cols-2 h-12 mb-4">
                <TabsTrigger value="individual-group" className="h-10 text-base">개인전 그룹 관리</TabsTrigger>
                <TabsTrigger value="team-group" className="h-10 text-base">2인1팀 그룹 관리</TabsTrigger>
            </TabsList>
            <TabsContent value="individual-group">
                {/* 개인전 그룹 추가/목록/코스설정 */}
                <Card>
                    <CardHeader>
                        <CardTitle>개인전 그룹 관리</CardTitle>
                        <CardDescription>개인전 그룹을 추가하거나 삭제하고, 그룹별 경기 코스를 설정합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2 items-center">
                            <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="새 그룹 이름 (예: A-1 그룹, 시니어부)" onKeyDown={(e) => e.key === 'Enter' && handleAddGroup('individual')} />
                            <Button onClick={() => handleAddGroup('individual')}><PlusCircle className="mr-2 h-4 w-4" />추가</Button>
                        </div>
                        <div className="space-y-2 pt-4">
                            <Label>현재 개인전 그룹 목록</Label>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>그룹명</TableHead>
                                            <TableHead>배정된 코스</TableHead>
                                            <TableHead className="text-right">관리</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {groupList.filter((g: any) => g.type === 'individual').length > 0 ? (
                                            groupList.filter((group: any) => group.type === 'individual').map((group: any) => (
                                                <TableRow key={group.name}>
                                                    <TableCell className="font-medium">{group.name}</TableCell>
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {group.courses ? 
                                                            Object.keys(group.courses).filter(cid => group.courses[cid]).map(cid => courses.find(c => c.id.toString() === cid)?.name).join(', ')
                                                            : '없음'
                                                        }
                                                    </TableCell>
                                                    <TableCell className="text-right space-x-2">
                                                        <Button variant="outline" size="sm" onClick={() => handleOpenCourseModal(group)}><Settings className="mr-2 h-4 w-4"/>코스 설정</Button>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="destructive" size="sm"><Trash2 className="mr-2 h-4 w-4"/>삭제</Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader><AlertDialogTitle>그룹을 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>'{group.name}' 그룹을 삭제합니다. 이 그룹에 속한 선수는 그대로 유지되지만, 그룹 필터링 등에 영향을 줄 수 있습니다.</AlertDialogDescription></AlertDialogHeader>
                                                                <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteGroup(group.name)}>삭제</AlertDialogAction></AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={3} className="text-center h-24 text-muted-foreground">등록된 개인전 그룹이 없습니다.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                {/* 개인전 선수 등록 UI (기존 개인전 탭 내용) */}
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
                                <Button onClick={() => individualFileInput?.click()}><Upload className="mr-2 h-4 w-4" /> 엑셀 파일 업로드</Button>
                                <input type="file" ref={setIndividualFileInput} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'individual')} />
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
                                        <Select value={individualGroup} onValueChange={setIndividualGroup} disabled={groupList.length === 0}>
                                            <SelectTrigger><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                                            <SelectContent>
                                                {groupNameList.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="jo-individual">조 번호</Label>
                                        <Input id="jo-individual" type="text" placeholder="예: 1, A-1-1" value={individualJo} onChange={e => setIndividualJo(e.target.value)} />
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
                                                <Input id={`p${i}-affiliation`} placeholder="소속 클럽 (없으면 '무소속')" value={p.affiliation} onChange={e => handleIndividualFormChange(i, 'affiliation', e.target.value)} />
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
                                <CardDescription>
                                    총 {individualPlayersCount}명의 개인전 선수가 등록되었습니다.
                                    {Object.keys(groupedIndividualPlayers).length > 0 && ` (${Object.entries(groupedIndividualPlayers).map(([group, players]) => `${group}: ${players.length}명`).join(', ')})`}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="individual-player-search"
                                        name="individual-player-search"
                                        placeholder="선수명, 소속, 조 번호로 검색"
                                        value={individualSearchTerm}
                                        onChange={(e) => setIndividualSearchTerm(e.target.value)}
                                        className="pl-10"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="px-4 py-2 w-[60px] text-center">번호</TableHead>
                                            <TableHead className="px-4 py-2">그룹</TableHead>
                                            <TableHead className="px-4 py-2">조</TableHead>
                                            <TableHead className="px-4 py-2">선수명</TableHead>
                                            <TableHead className="px-4 py-2">소속</TableHead>
                                            <TableHead className="text-right px-4 py-2">관리</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {Object.keys(filteredGroupedIndividualPlayers).sort().map((groupName: string) => 
                                            filteredGroupedIndividualPlayers[groupName].map((p: any, index: number) => (
                                                editingPlayerId === p.id ? (
                                                    <TableRow key={p.id} className="bg-muted/30">
                                                        <TableCell className="px-4 py-2 text-center font-medium">{index + 1}</TableCell>
                                                        <TableCell className="px-4 py-2">
                                                            <Select value={editingPlayerData.group} onValueChange={(value) => handleEditingFormChange('group', value)}>
                                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                                <SelectContent>{groupNameList.map((g: string) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell className="px-4 py-2"><Input value={editingPlayerData.jo} type="text" onChange={(e) => handleEditingFormChange('jo', e.target.value)} className="h-9 w-20" /></TableCell>
                                                        <TableCell className="px-4 py-2"><Input value={editingPlayerData.name} onChange={(e) => handleEditingFormChange('name', e.target.value)} className="h-9" /></TableCell>
                                                        <TableCell className="px-4 py-2"><Input value={editingPlayerData.affiliation} onChange={(e) => handleEditingFormChange('affiliation', e.target.value)} className="h-9" /></TableCell>
                                                        <TableCell className="text-right space-x-1 px-4 py-2">
                                                            <Button variant="ghost" size="icon" onClick={handleUpdatePlayer}><Save className="h-4 w-4 text-primary" /></Button>
                                                            <Button variant="ghost" size="icon" onClick={handleCancelEdit}><X className="h-4 w-4 text-muted-foreground" /></Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    <TableRow key={p.id}>
                                                        <TableCell className="px-4 py-2 text-center font-medium">{index + 1}</TableCell>
                                                        <TableCell className="px-4 py-2">{p.group}</TableCell>
                                                        <TableCell className="px-4 py-2">{p.jo}</TableCell>
                                                        <TableCell className="px-4 py-2">{p.name}</TableCell>
                                                        <TableCell className="px-4 py-2">{p.affiliation}</TableCell>
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
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>개인전 초기화</CardTitle>
                                <CardDescription>개인전 관련 데이터만 초기화합니다. 이 작업은 되돌릴 수 없습니다.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-row gap-4">
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" className="w-full"><RotateCcw className="mr-2 h-4 w-4" /> 개인전 그룹 초기화</Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>정말 개인전 그룹을 모두 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>개인전 그룹만 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={handleResetIndividualGroups}>개인전 그룹 초기화</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" className="w-full"><RotateCcw className="mr-2 h-4 w-4" /> 개인전 선수 초기화</Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>정말 개인전 선수 명단을 모두 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>개인전 선수만 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={handleResetIndividualPlayers}>개인전 선수 초기화</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </CardContent>
                        </Card>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="team-group">
                {/* 2인1팀 그룹 추가/목록/코스설정 */}
                <Card>
                    <CardHeader>
                        <CardTitle>2인1팀 그룹 관리</CardTitle>
                        <CardDescription>2인1팀 그룹을 추가하거나 삭제하고, 그룹별 경기 코스를 설정합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2 items-center">
                            <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="새 그룹 이름 (예: A-1 그룹, 시니어부)" onKeyDown={(e) => e.key === 'Enter' && handleAddGroup('team')} />
                            <Button onClick={() => handleAddGroup('team')}><PlusCircle className="mr-2 h-4 w-4" />추가</Button>
                        </div>
                        <div className="space-y-2 pt-4">
                            <Label>현재 2인1팀 그룹 목록</Label>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>그룹명</TableHead>
                                            <TableHead>배정된 코스</TableHead>
                                            <TableHead className="text-right">관리</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {groupList.filter((g: any) => g.type === 'team').length > 0 ? (
                                            groupList.filter((group: any) => group.type === 'team').map((group: any) => (
                                                <TableRow key={group.name}>
                                                    <TableCell className="font-medium">{group.name}</TableCell>
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {group.courses ? 
                                                            Object.keys(group.courses).filter(cid => group.courses[cid]).map(cid => courses.find(c => c.id.toString() === cid)?.name).join(', ')
                                                            : '없음'
                                                        }
                                                    </TableCell>
                                                    <TableCell className="text-right space-x-2">
                                                        <Button variant="outline" size="sm" onClick={() => handleOpenCourseModal(group)}><Settings className="mr-2 h-4 w-4"/>코스 설정</Button>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="destructive" size="sm"><Trash2 className="mr-2 h-4 w-4"/>삭제</Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader><AlertDialogTitle>그룹을 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>'{group.name}' 그룹을 삭제합니다. 이 그룹에 속한 선수는 그대로 유지되지만, 그룹 필터링 등에 영향을 줄 수 있습니다.</AlertDialogDescription></AlertDialogHeader>
                                                                <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteGroup(group.name)}>삭제</AlertDialogAction></AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={3} className="text-center h-24 text-muted-foreground">등록된 2인1팀 그룹이 없습니다.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                {/* 2인1팀 선수 등록 UI (기존 2인1팀 탭 내용) */}
                <Card>
                    <CardHeader><CardTitle>2인 1팀 선수 등록</CardTitle><CardDescription>엑셀 또는 수동으로 2인 1팀을 등록합니다.</CardDescription></CardHeader>
                    <CardContent className="space-y-6">
                        <Card className="bg-muted/30">
                            <CardHeader><CardTitle className="text-lg">엑셀로 일괄 등록</CardTitle></CardHeader>
                            <CardContent className="flex flex-col sm:flex-row gap-4">
                               <Button variant="outline" onClick={() => handleDownloadTemplate('team')}><Download className="mr-2 h-4 w-4" /> 엑셀 양식 다운로드</Button>
                                <Button onClick={() => teamFileInput?.click()}><Upload className="mr-2 h-4 w-4" /> 엑셀 파일 업로드</Button>
                                <input type="file" ref={setTeamFileInput} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'team')} />
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle className="text-lg">수동 등록</CardTitle><CardDescription>한 조(최대 2팀)씩 수동으로 등록합니다.</CardDescription></CardHeader>
                             <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>그룹</Label>
                                        <Select value={teamGroup} onValueChange={setTeamGroup} disabled={groupList.length === 0}>
                                            <SelectTrigger><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                                            <SelectContent>
                                                {groupNameList.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="jo-team">조 번호</Label>
                                        <Input id="jo-team" type="text" placeholder="예: 1, A-1-1" value={teamJo} onChange={e => setTeamJo(e.target.value)} />
                                    </div>
                                </div>
                                {teamFormData.map((team, i) => (
                                    <div key={i} className="space-y-4 border-t pt-4">
                                        <h4 className="font-semibold text-primary">{i + 1}팀 정보</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Input placeholder="선수 1 이름" value={team.p1_name} onChange={e => handleTeamFormChange(i, 'p1_name', e.target.value)} />
                                            <Input placeholder="선수 1 소속 (없으면 '무소속')" value={team.p1_affiliation} onChange={e => handleTeamFormChange(i, 'p1_affiliation', e.target.value)} />
                                            <Input placeholder="선수 2 이름" value={team.p2_name} onChange={e => handleTeamFormChange(i, 'p2_name', e.target.value)} />
                                            <Input placeholder="선수 2 소속 (없으면 '무소속')" value={team.p2_affiliation} onChange={e => handleTeamFormChange(i, 'p2_affiliation', e.target.value)} />
                                        </div>
                                    </div>
                                ))}
                                <Button size="lg" className="mt-4" onClick={handleSaveTeamPlayers} disabled={configLoading}><UserPlus className="mr-2 h-4 w-4" /> 팀 저장</Button>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>등록된 2인 1팀 목록</CardTitle>
                                 <CardDescription>
                                    총 {teamPlayersCount}개의 팀이 등록되었습니다.
                                    {Object.keys(groupedTeamPlayers).length > 0 && ` (${Object.entries(groupedTeamPlayers).map(([group, players]) => `${group}: ${players.length}팀`).join(', ')})`}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="team-player-search"
                                        name="team-player-search"
                                        placeholder="팀원명, 소속, 조 번호로 검색"
                                        value={teamSearchTerm}
                                        onChange={(e) => setTeamSearchTerm(e.target.value)}
                                        className="pl-10"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="px-4 py-2 w-[60px] text-center">번호</TableHead>
                                            <TableHead className="px-4 py-2">그룹</TableHead>
                                            <TableHead className="px-4 py-2">조</TableHead>
                                            <TableHead className="px-4 py-2">팀원</TableHead>
                                            <TableHead className="px-4 py-2">소속</TableHead>
                                            <TableHead className="text-right px-4 py-2">관리</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {Object.keys(filteredGroupedTeamPlayers).sort().map((groupName: string) =>
                                            filteredGroupedTeamPlayers[groupName].map((t: any, index: number) => (
                                                editingPlayerId === t.id ? (
                                                    <TableRow key={t.id} className="bg-muted/30">
                                                        <TableCell className="px-4 py-2 text-center font-medium">{index + 1}</TableCell>
                                                        <TableCell className="px-4 py-2 align-top">
                                                            <Select value={editingPlayerData.group} onValueChange={(value) => handleEditingFormChange('group', value)}>
                                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                                <SelectContent>{groupNameList.map((g: string) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell className="px-4 py-2 align-top"><Input value={editingPlayerData.jo} type="text" onChange={(e) => handleEditingFormChange('jo', e.target.value)} className="h-9 w-20" /></TableCell>
                                                        <TableCell className="px-4 py-2 align-top"><Input value={editingPlayerData.p1_name} onChange={(e) => handleEditingFormChange('p1_name', e.target.value)} className="h-9" /></TableCell>
                                                        <TableCell className="px-4 py-2 align-top"><Input value={editingPlayerData.p1_affiliation} onChange={(e) => handleEditingFormChange('p1_affiliation', e.target.value)} className="h-9" /></TableCell>
                                                        <TableCell className="px-4 py-2 align-top"><Input value={editingPlayerData.p2_name} onChange={(e) => handleEditingFormChange('p2_name', e.target.value)} className="h-9" /></TableCell>
                                                        <TableCell className="px-4 py-2 align-top"><Input value={editingPlayerData.p2_affiliation} onChange={(e) => handleEditingFormChange('p2_affiliation', e.target.value)} className="h-9" /></TableCell>
                                                        <TableCell className="px-4 py-2 text-right align-top">
                                                            <Button variant="outline" size="sm" onClick={handleUpdatePlayer}><Check className="w-4 h-4" /></Button>
                                                            <Button variant="ghost" size="sm" onClick={handleCancelEdit}><X className="w-4 h-4" /></Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    <TableRow key={t.id}>
                                                        <TableCell className="px-4 py-2 text-center font-medium">{index + 1}</TableCell>
                                                        <TableCell className="px-4 py-2 align-top">{t.group}</TableCell>
                                                        <TableCell className="px-4 py-2 align-top">{t.jo}</TableCell>
                                                        <TableCell className="px-4 py-2 align-top">{t.p1_name}</TableCell>
                                                        <TableCell className="px-4 py-2 align-top">{t.p1_affiliation}</TableCell>
                                                        <TableCell className="px-4 py-2 align-top">{t.p2_name}</TableCell>
                                                        <TableCell className="px-4 py-2 align-top">{t.p2_affiliation}</TableCell>
                                                        <TableCell className="px-4 py-2 text-right align-top">
                                                            <Button variant="ghost" size="sm" onClick={() => handleEditClick(t)}><Edit className="w-4 h-4" /></Button>
                                                            <Button variant="ghost" size="sm" onClick={() => handleDeletePlayer(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>2인1팀 초기화</CardTitle>
                                <CardDescription>2인1팀 관련 데이터만 초기화합니다. 이 작업은 되돌릴 수 없습니다.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-row gap-4">
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" className="w-full"><RotateCcw className="mr-2 h-4 w-4" /> 2인1팀 그룹 초기화</Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>정말 2인1팀 그룹을 모두 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>2인1팀 그룹만 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={handleResetTeamGroups}>2인1팀 그룹 초기화</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" className="w-full"><RotateCcw className="mr-2 h-4 w-4" /> 2인1팀 선수 초기화</Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>정말 2인1팀 선수 명단을 모두 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>2인1팀 선수만 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={handleResetTeamPlayers}>2인1팀 선수 초기화</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </CardContent>
                        </Card>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        <Dialog open={isGroupCourseModalOpen} onOpenChange={setGroupCourseModalOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>'{currentEditingGroup?.name}' 코스 설정</DialogTitle>
                    <DialogDescription>이 그룹이 경기할 코스를 선택하세요. 코스 목록은 대회/코스 관리 페이지에서 관리할 수 있습니다.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    {courses.length > 0 ? courses.map(course => (
                        <div key={course.id} className="flex items-center space-x-3">
                            <Checkbox 
                                id={`course-${course.id}`}
                                checked={!!assignedCourses[course.id]}
                                onCheckedChange={(checked) => {
                                    setAssignedCourses(prev => ({...prev, [course.id]: !!checked}))
                                }}
                            />
                            <Label htmlFor={`course-${course.id}`} className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {course.name}
                            </Label>
                        </div>
                    )) : (
                        <p className="text-sm text-center text-muted-foreground py-8">설정 가능한 코스가 없습니다.<br/>코스 관리 페이지에서 코스를 먼저 추가하고 활성화해주세요.</p>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">취소</Button></DialogClose>
                    <Button onClick={handleSaveGroupCourses}><Save className="mr-2 h-4 w-4"/>저장</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>


    </div>
  )
}
