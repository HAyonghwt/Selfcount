
"use client"
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, UserPlus, Trash2, Edit, AlertTriangle, RotateCcw, Users, PlusCircle, X, Save, Settings, Check, Columns, Search, FileDown } from "lucide-react";
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
    const [tournament, setTournament] = useState<any>({});
    const [isDownloadingRoster, setIsDownloadingRoster] = useState(false);
    
    // Course assignment modal states
    const [isGroupCourseModalOpen, setGroupCourseModalOpen] = useState(false);
    const [currentEditingGroup, setCurrentEditingGroup] = useState<any>(null);
    const [assignedCourses, setAssignedCourses] = useState<{[key: string]: number}>({}); // 0 = 선택 안함, 1 = 첫번째, 2 = 두번째, ...


    // Editing states
    const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
    const [editingPlayerData, setEditingPlayerData] = useState<any | null>(null);
    
    // Refs for file inputs, compatible with React 19
    const [individualFileInput, setIndividualFileInput] = useState<HTMLInputElement | null>(null);
    const [teamFileInput, setTeamFileInput] = useState<HTMLInputElement | null>(null);

    // Search states
    const [individualSearchTerm, setIndividualSearchTerm] = useState('');
    const [teamSearchTerm, setTeamSearchTerm] = useState('');

    // Group filter states
    const [selectedIndividualGroupFilter, setSelectedIndividualGroupFilter] = useState<string>('all');
    const [selectedTeamGroupFilter, setSelectedTeamGroupFilter] = useState<string>('all');


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
            setTournament(data);
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
            // 남자일반 탭 (20명, 조 번호는 숫자 또는 문자+숫자 조합 가능)
            const ws1_data = [
                ["조", "이름", "소속"],
                [1, "김철수", "서울광진"], [1, "이영호", "경기용인"], [1, "박민수", "강원속초"], [1, "최동현", "경기가평"],
                [2, "정성호", "충남천안"], [2, "윤태영", "경기평택"], [2, "강진우", "강원평창"], [2, "조현석", "서울강남"],
                [3, "임재현", "경기수원"], [3, "한승우", "충북청주"], [3, "오세훈", "전북전주"], [3, "신동욱", "경남부산"],
                [4, "류성민", "인천연수"], [4, "배준호", "경기안양"], [4, "송지훈", "대전유성"], [4, "전민수", "울산남구"],
                [5, "김대현", "서울강동"], [5, "이준호", "경기성남"], [5, "박성민", "강원춘천"], [5, "최영수", "경기고양"],
            ];
            // 여자일반 탭 (20명, 조 번호는 "a-1", "a-2" 형식으로 문자+숫자 조합 가능)
            const ws2_data = [
                ["조", "이름", "소속"],
                ["a-1", "김영희", "서울광진"], ["a-1", "이수진", "경기용인"], ["a-1", "박지은", "강원속초"], ["a-1", "최미영", "경기가평"],
                ["a-2", "정혜진", "충남천안"], ["a-2", "윤서연", "경기평택"], ["a-2", "강민지", "강원평창"], ["a-2", "조은서", "서울강남"],
                ["a-3", "임하늘", "경기수원"], ["a-3", "한소희", "충북청주"], ["a-3", "오나은", "전북전주"], ["a-3", "신다은", "경남부산"],
                ["a-4", "류지원", "인천연수"], ["a-4", "배서윤", "경기안양"], ["a-4", "송예린", "대전유성"], ["a-4", "전채원", "울산남구"],
                ["a-5", "김서연", "서울강동"], ["a-5", "이하늘", "경기성남"], ["a-5", "박예린", "강원춘천"], ["a-5", "최채원", "경기고양"],
            ];
            // 남시니어 탭 (20명, 조 번호는 "ms-1", "ms-2" 형식으로 문자+숫자 조합 가능)
            const ws3_data = [
                ["조", "이름", "소속"],
                ["ms-1", "김대호", "서울광진"], ["ms-1", "이상호", "경기용인"], ["ms-1", "박영수", "강원속초"], ["ms-1", "최성호", "경기가평"],
                ["ms-2", "정만호", "충남천안"], ["ms-2", "윤태호", "경기평택"], ["ms-2", "강인호", "강원평창"], ["ms-2", "조영호", "서울강남"],
                ["ms-3", "임정호", "경기수원"], ["ms-3", "한석호", "충북청주"], ["ms-3", "오동호", "전북전주"], ["ms-3", "신영호", "경남부산"],
                ["ms-4", "류성호", "인천연수"], ["ms-4", "배영호", "경기안양"], ["ms-4", "송만호", "대전유성"], ["ms-4", "전대호", "울산남구"],
                ["ms-5", "김영호", "서울강동"], ["ms-5", "이성호", "경기성남"], ["ms-5", "박대호", "강원춘천"], ["ms-5", "최만호", "경기고양"],
            ];
            // 여시니어 탭 (20명, 조 번호는 숫자 또는 문자+숫자 조합 가능)
            const ws4_data = [
                ["조", "이름", "소속"],
                [1, "김순희", "서울광진"], [1, "이정희", "경기용인"], [1, "박미영", "강원속초"], [1, "최영숙", "경기가평"],
                [2, "정희숙", "충남천안"], [2, "윤미숙", "경기평택"], [2, "강진숙", "강원평창"], [2, "조성희", "서울강남"],
                [3, "임미애", "경기수원"], [3, "한옥희", "충북청주"], [3, "오현숙", "전북전주"], [3, "신영희", "경남부산"],
                [4, "류정희", "인천연수"], [4, "배미영", "경기안양"], [4, "송영숙", "대전유성"], [4, "전순희", "울산남구"],
                [5, "김정희", "서울강동"], [5, "이미영", "경기성남"], [5, "박영숙", "강원춘천"], [5, "최순희", "경기고양"],
            ];
            
            const ws1 = XLSX.utils.aoa_to_sheet(ws1_data);
            const ws2 = XLSX.utils.aoa_to_sheet(ws2_data);
            const ws3 = XLSX.utils.aoa_to_sheet(ws3_data);
            const ws4 = XLSX.utils.aoa_to_sheet(ws4_data);
            
            // 셀 너비 설정 (조 번호가 "a-1", "ms-1" 같은 형식도 가능하므로 조 컬럼을 넓게 설정)
            ws1['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 20 }];
            ws2['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 20 }];
            ws3['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 20 }];
            ws4['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 20 }];
            
            XLSX.utils.book_append_sheet(wb, ws1, "남자일반");
            XLSX.utils.book_append_sheet(wb, ws2, "여자일반");
            XLSX.utils.book_append_sheet(wb, ws3, "남시니어");
            XLSX.utils.book_append_sheet(wb, ws4, "여시니어");
            filename = "개인전_선수등록_양식.xlsx";
        } else { // team
            // 부부대항 탭
            const team1_data = [
                ["조", "선수1 이름", "선수1 소속", "선수2 이름", "선수2 소속"],
                [1, "홍길동", "서울광진", "김순희", "서울광진"],
                [1, "이영희", "경기용인", "정희숙", "경기용인"],
                [2, "김철수", "강원속초", "강진숙", "강원속초"],
                [2, "장선호", "강원화천", "임미숙", "강원화천"],
                [3, "권영운", "경기가평", "김미애", "경기가평"],
                [4, "김영식", "충남천안", "장성희", "충남천안"],
                [5, "손종철", "경기평택", "오선애", "경기평택"],
                [5, "허만덕", "강원평창", "강현숙", "강원평창"],
                [6, "박민수", "서울강남", "이수진", "서울강남"],
                [6, "최동현", "인천연수", "박지은", "인천연수"],
            ];
            // 혼성2인 탭
            const team2_data = [
                ["조", "선수1 이름", "선수1 소속", "선수2 이름", "선수2 소속"],
                [1, "정성호", "충남천안", "윤서연", "경기평택"],
                [1, "강진우", "강원평창", "조은서", "서울강남"],
                [2, "임재현", "경기수원", "한소희", "충북청주"],
                [2, "오세훈", "전북전주", "오나은", "전북전주"],
                [3, "신동욱", "경남부산", "신다은", "경남부산"],
                [4, "류성민", "인천연수", "류지원", "인천연수"],
                [4, "배준호", "경기안양", "배서윤", "경기안양"],
                [5, "송지훈", "대전유성", "송예린", "대전유성"],
                [5, "전민수", "울산남구", "전채원", "울산남구"],
            ];
            
            const ws1 = XLSX.utils.aoa_to_sheet(team1_data);
            const ws2 = XLSX.utils.aoa_to_sheet(team2_data);
            
            // 셀 너비 설정 (2인1팀은 선수 이름이 길 수 있으므로 넓게 설정)
            ws1['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 20 }];
            ws2['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 20 }];
            
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
                        description: `엑셀 파일에 그룹 목록에 없는 ${extraGroups.join(', ')} 그룹이 포함되어 있습니다.\n먼저 그룹과 코스를 등록하고 다시 업로드해 주시기 바랍니다.`,
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
                    if (!window.confirm(`엑셀파일에 그룹이 일부 빠져 있습니다. ${missingGroups.join(', ')}(은)는 추가나 변동없이 이대로 선수 등록을 진행하시겠습니까?`)) {
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
        let filtered: { [key: string]: any[] } = {};
        
        // 그룹 필터링
        if (selectedIndividualGroupFilter === 'all') {
            filtered = { ...groupedIndividualPlayers };
        } else {
            filtered = { [selectedIndividualGroupFilter]: groupedIndividualPlayers[selectedIndividualGroupFilter] || [] };
        }
        
        // 검색어 필터링
        if (!individualSearchTerm) return filtered;
        
        const lowercasedFilter = individualSearchTerm.toLowerCase();
        const searchFiltered: { [key: string]: any[] } = {};
        
        for (const groupName in filtered) {
            const players = filtered[groupName].filter((p: any) => 
                p.name.toLowerCase().includes(lowercasedFilter) ||
                p.affiliation.toLowerCase().includes(lowercasedFilter) ||
                p.jo.toString().includes(individualSearchTerm)
            );
            if (players.length > 0) {
                searchFiltered[groupName] = players;
            }
        }
        return searchFiltered;
    }, [groupedIndividualPlayers, individualSearchTerm, selectedIndividualGroupFilter]);

    const filteredGroupedTeamPlayers = useMemo(() => {
        let filtered: { [key: string]: any[] } = {};
        
        // 그룹 필터링
        if (selectedTeamGroupFilter === 'all') {
            filtered = { ...groupedTeamPlayers };
        } else {
            filtered = { [selectedTeamGroupFilter]: groupedTeamPlayers[selectedTeamGroupFilter] || [] };
        }
        
        // 검색어 필터링
        if (!teamSearchTerm) return filtered;
    
        const lowercasedFilter = teamSearchTerm.toLowerCase();
        const searchFiltered: { [key: string]: any[] } = {};
        
        for (const groupName in filtered) {
            const players = filtered[groupName].filter((t: any) => 
                t.p1_name.toLowerCase().includes(lowercasedFilter) ||
                (t.p2_name && t.p2_name.toLowerCase().includes(lowercasedFilter)) ||
                t.p1_affiliation.toLowerCase().includes(lowercasedFilter) ||
                (t.p2_affiliation && t.p2_affiliation.toLowerCase().includes(lowercasedFilter)) ||
                t.jo.toString().includes(teamSearchTerm)
            );
            if (players.length > 0) {
                searchFiltered[groupName] = players;
            }
        }
        return searchFiltered;
    }, [groupedTeamPlayers, teamSearchTerm, selectedTeamGroupFilter]);


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
            const defaultCourses = courses.reduce((acc, course) => {
                acc[course.id] = true;
                return acc;
            }, {});
            updates[`/tournaments/current/groups/${individualGroup}`] = {
                name: individualGroup,
                type: 'individual',
                courses: defaultCourses
            };
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
        // 모든 코스를 먼저 0으로 초기화 (선택 안함)
        const allCourseIds = courses.map(c => String(c.id));
        const convertedCourses: {[key: string]: number} = {};
        allCourseIds.forEach(courseId => {
            convertedCourses[courseId] = 0; // 기본값: 선택 안함
        });
        
        // 기존 설정된 코스만 값 적용 (number 타입이고 0보다 큰 값만)
        // boolean true는 무시 (기존 호환성을 위해 boolean은 더 이상 사용하지 않음)
        const existingCourses = group.courses || {};
        Object.keys(existingCourses).forEach(courseId => {
            const courseIdStr = String(courseId);
            // number 타입이고 0보다 큰 경우만 적용
            if (typeof existingCourses[courseId] === 'number' && existingCourses[courseId] > 0) {
                convertedCourses[courseIdStr] = existingCourses[courseId];
            }
            // boolean 타입은 무시 (기본값 0 유지)
        });
        
        setAssignedCourses(convertedCourses);
        setGroupCourseModalOpen(true);
    };

    const handleSaveGroupCourses = () => {
        if (!currentEditingGroup) return;
        const groupCoursesRef = ref(db!, `tournaments/current/groups/${currentEditingGroup.name}/courses`);
        set(groupCoursesRef, assignedCourses)
            .then(() => {
                toast({ 
                    title: "저장 완료", 
                    description: `${currentEditingGroup.name} 그룹의 코스 설정이 저장되었습니다.`,
                    duration: 2000
                });
                setGroupCourseModalOpen(false);
                setCurrentEditingGroup(null);
            })
            .catch((err) => toast({ title: "저장 실패", description: err.message }));
    };

    const groupList = Object.values(groupsData).sort((a: any, b: any) => a.name.localeCompare(b.name));
    const groupNameList = groupList.map((g: any) => g.name);

    // 조편성표 이미지 다운로드 함수
    const handleDownloadRoster = async (type: 'individual' | 'team') => {
        if (isDownloadingRoster) return;
        
        setIsDownloadingRoster(true);
        try {
            // html2canvas 동적 임포트
            const html2canvas = (await import('html2canvas')).default;

            const tournamentName = tournament?.name || '파크골프 토너먼트';
            const printDate = new Date().toLocaleString('ko-KR');
            
            // 해당 타입의 그룹만 필터링
            const targetGroups = groupList.filter((g: any) => g.type === type);
            
            if (targetGroups.length === 0) {
                toast({ 
                    title: "알림", 
                    description: `${type === 'individual' ? '개인전' : '2인1팀'} 그룹이 없습니다.` 
                });
                setIsDownloadingRoster(false);
                return;
            }

            toast({ title: "조편성표 생성 시작", description: `${targetGroups.length}개 그룹의 조편성표를 생성합니다...` });

            // A4 사이즈 기준 (210mm x 297mm, 96dpi 기준 약 794px x 1123px)
            // 실제 사용할 크기: 794px 너비 (여백 포함)
            const A4_WIDTH = 794;
            const A4_HEIGHT = 1123;
            const HEADER_HEIGHT = 120; // 헤더 높이
            const GROUP_HEADER_HEIGHT = 50; // 그룹 헤더 높이
            const TABLE_HEADER_HEIGHT = 40; // 테이블 헤더 높이
            const ROW_HEIGHT = type === 'individual' ? 35 : 40; // 행 높이
            const FOOTER_HEIGHT = 30; // 푸터 높이
            const MARGIN = 20; // 여백

            // 한 페이지에 들어갈 수 있는 행 수 계산
            const availableHeight = A4_HEIGHT - HEADER_HEIGHT - GROUP_HEADER_HEIGHT - TABLE_HEADER_HEIGHT - FOOTER_HEIGHT - (MARGIN * 2);
            const maxRowsPerPage = Math.floor(availableHeight / ROW_HEIGHT);

            // 그룹별로 처리
            for (let groupIdx = 0; groupIdx < targetGroups.length; groupIdx++) {
                const group = targetGroups[groupIdx];
                const groupName = group.name;
                
                // 해당 그룹의 선수들 가져오기
                const groupPlayers = allPlayers.filter((p: any) => 
                    p.type === type && p.group === groupName
                );

                if (groupPlayers.length === 0) continue;

                // 조별로 그룹화
                const playersByJo: { [jo: string]: any[] } = {};
                groupPlayers.forEach((player: any) => {
                    const jo = player.jo?.toString() || '미지정';
                    if (!playersByJo[jo]) {
                        playersByJo[jo] = [];
                    }
                    playersByJo[jo].push(player);
                });

                // 조 번호 정렬 (숫자 우선, 그 다음 문자열)
                const sortedJos = Object.keys(playersByJo).sort((a, b) => {
                    const numA = parseInt(a);
                    const numB = parseInt(b);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return numA - numB;
                    }
                    if (!isNaN(numA)) return -1;
                    if (!isNaN(numB)) return 1;
                    return a.localeCompare(b);
                });

                // 조별로 행 수 계산하여 페이지 분할
                let currentPageJoList: string[] = [];
                let pageNumber = 1;

                const createPage = async (jos: string[], pageNum: number, isLastPage: boolean) => {
                    const container = document.createElement('div');
                    container.style.cssText = `
                        position: absolute; 
                        left: -9999px; 
                        top: 0; 
                        width: ${A4_WIDTH}px !important; 
                        min-width: ${A4_WIDTH}px !important; 
                        max-width: none !important;
                        background-color: white; 
                        padding: ${MARGIN}px; 
                        z-index: -1;
                        overflow: visible !important;
                    `;
                    document.body.appendChild(container);

                    const styleContent = `
                        <style>
                            .print-wrapper { 
                                font-family: 'Pretendard', 'Malgun Gothic', sans-serif; 
                                text-align: center; 
                                color: #1e293b; 
                                width: 100%; 
                                box-sizing: border-box; 
                            }
                            .print-header { 
                                background-color: #3b82f6; 
                                color: white; 
                                padding: 30px 20px; 
                                border-radius: 12px; 
                                margin-bottom: 20px;
                                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                                width: 100%;
                                box-sizing: border-box;
                            }
                            .print-title { font-size: 32px; font-weight: 800; margin-bottom: 12px; }
                            .print-date { font-size: 16px; opacity: 0.9; }
                            .group-section { 
                                text-align: left; 
                                margin-bottom: 15px; 
                                margin-top: 20px; 
                                display: flex; 
                                align-items: center; 
                                gap: 8px;
                            }
                            .group-icon { font-size: 24px; }
                            .group-title { font-size: 22px; font-weight: 700; color: #334155; }
                            .roster-table { 
                                width: 100%; 
                                border-collapse: collapse; 
                                margin-bottom: 10px; 
                                background-color: white;
                                font-size: 14px;
                                table-layout: fixed; 
                            }
                            .roster-table th { 
                                background-color: #f1f5f9; 
                                color: #475569; 
                                font-weight: 700; 
                                padding: 12px 6px; 
                                border: 1px solid #e2e8f0;
                                vertical-align: middle;
                                font-size: 14px;
                                text-align: center;
                            }
                            .roster-table td { 
                                padding: 12px 6px; 
                                border: 1px solid #e2e8f0; 
                                vertical-align: middle;
                                color: #334155;
                                font-weight: 500;
                                font-size: 14px;
                                text-align: center;
                                line-height: 1.5;
                            }
                            .jo-header {
                                background-color: #e0f2fe !important;
                                font-weight: 800;
                                color: #0369a1;
                            }
                            .text-center { text-align: center; }
                            .text-left { text-align: left; }
                            .font-bold { font-weight: 700; }
                            .page-footer {
                                margin-top: 15px;
                                font-size: 12px;
                                color: #64748b;
                                text-align: center;
                            }
                        </style>
                    `;

                    let htmlContent = styleContent;
                    
                    // 첫 페이지에만 대회 제목 표시
                    if (pageNum === 1) {
                        htmlContent += `
                            <div class="print-wrapper">
                                <div class="print-header">
                                    <div class="print-title">⛳ ${tournamentName}</div>
                                </div>
                        `;
                    } else {
                        htmlContent += `<div class="print-wrapper">`;
                    }
                    
                    htmlContent += `
                            <div class="group-section">
                                <span class="group-icon">📋</span>
                                <span class="group-title">${groupName} 조편성표</span>
                            </div>
                            <table class="roster-table">
                                <colgroup>
                                    <col style="width: 100px;">
                                    <col style="width: auto;">
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>조</th>
                                        <th>조 구성원</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    // 조별로 행 추가 (한 줄에 모든 구성원 나열)
                    jos.forEach((jo) => {
                        const playersInJo = playersByJo[jo];
                        const membersList: string[] = [];
                        
                        playersInJo.forEach((player: any) => {
                            if (type === 'individual') {
                                const name = player.name || '-';
                                const affiliation = player.affiliation || '무소속';
                                membersList.push(`${name}(<span style="color: #64748b;">${affiliation}</span>)`);
                            } else {
                                const p1Name = player.p1_name || '-';
                                const p1Affiliation = player.p1_affiliation || '무소속';
                                const p2Name = player.p2_name || '-';
                                const p2Affiliation = player.p2_affiliation || '무소속';
                                membersList.push(`${p1Name}(<span style="color: #64748b;">${p1Affiliation}</span>) ${p2Name}(<span style="color: #64748b;">${p2Affiliation}</span>)`);
                            }
                        });
                        
                        htmlContent += `<tr>`;
                        htmlContent += `<td class="jo-header text-center font-bold">${jo}</td>`;
                        htmlContent += `<td class="text-center">${membersList.join('   ')}</td>`;
                        htmlContent += `</tr>`;
                    });

                    htmlContent += `
                                </tbody>
                            </table>
                            <div class="page-footer">
                                ${isLastPage ? `총 ${groupPlayers.length}${type === 'individual' ? '명' : '팀'}` : ''} - ${pageNum}페이지
                            </div>
                        </div>
                    `;

                    container.innerHTML = htmlContent;

                    // 이미지 생성
                    const canvas = await html2canvas(container, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        windowWidth: A4_WIDTH,
                        width: A4_WIDTH,
                        height: A4_HEIGHT,
                        x: 0,
                        scrollX: 0
                    });

                    // 다운로드
                    const image = canvas.toDataURL("image/png");
                    const link = document.createElement("a");
                    link.href = image;
                    const pageSuffix = targetGroups.length > 1 || pageNum > 1 ? `_${pageNum}` : '';
                    link.download = `${tournamentName}_${groupName}_조편성표${pageSuffix}_${new Date().toISOString().slice(0, 10)}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    // 컨테이너 정리
                    document.body.removeChild(container);

                    // 페이지 간 대기
                    if (!isLastPage || groupIdx < targetGroups.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                };

                // 조별로 행 수를 계산하여 페이지 분할
                let currentPageRowCount = 0;
                
                for (let i = 0; i < sortedJos.length; i++) {
                    const jo = sortedJos[i];
                    const playersInJo = playersByJo[jo];
                    const joRows = playersInJo.length;

                    // 현재 페이지에 추가할 수 있는지 확인
                    if (currentPageRowCount + joRows > maxRowsPerPage && currentPageJoList.length > 0) {
                        // 현재 페이지 저장
                        await createPage(currentPageJoList, pageNumber, false);
                        pageNumber++;
                        currentPageJoList = [];
                        currentPageRowCount = 0;
                    }

                    // 현재 조 추가
                    currentPageJoList.push(jo);
                    currentPageRowCount += joRows;
                }

                // 마지막 페이지 저장
                if (currentPageJoList.length > 0) {
                    await createPage(currentPageJoList, pageNumber, true);
                }

                // 그룹 간 대기
                if (groupIdx < targetGroups.length - 1) {
                    toast({ description: `${groupName} 저장 완료... (${groupIdx + 1}/${targetGroups.length})` });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            toast({ title: "조편성표 생성 완료", description: "모든 그룹의 조편성표가 생성되었습니다." });

        } catch (error) {
            console.error('조편성표 생성 실패:', error);
            toast({ 
                title: "생성 실패", 
                description: "조편성표 생성 중 오류가 발생했습니다.", 
                variant: "destructive" 
            });
        } finally {
            setIsDownloadingRoster(false);
        }
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

        <Tabs defaultValue="individual-group" onValueChange={(value) => {
            // 탭 변경 시 그룹 필터 초기화
            if (value === 'individual-group') {
                setSelectedIndividualGroupFilter('all');
            } else if (value === 'team-group') {
                setSelectedTeamGroupFilter('all');
            }
        }}>
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
                                                            (() => {
                                                                // 코스 순서 정보 가져오기 (기존 호환성: boolean → number 변환)
                                                                const coursesOrder = group.courses || {};
                                                                const assignedCourseIds = Object.keys(coursesOrder).filter((cid: string) => {
                                                                    const order = coursesOrder[cid];
                                                                    return typeof order === 'boolean' ? order : (typeof order === 'number' && order > 0);
                                                                });
                                                                // 코스 순서대로 정렬
                                                                const sortedCourses = assignedCourseIds
                                                                    .map(cid => {
                                                                        const course = courses.find(c => c.id.toString() === cid);
                                                                        const order = coursesOrder[cid];
                                                                        const numOrder = typeof order === 'boolean' ? (order ? 1 : 0) : (typeof order === 'number' ? order : 0);
                                                                        return { course, order: numOrder };
                                                                    })
                                                                    .filter(item => item.course)
                                                                    .sort((a, b) => a.order - b.order)
                                                                    .map(item => item.course?.name)
                                                                    .filter(Boolean);
                                                                return sortedCourses.length > 0 ? sortedCourses.join(', ') : '없음';
                                                            })()
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
                                <Button 
                                    variant="default" 
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={() => handleDownloadRoster('individual')}
                                    disabled={isDownloadingRoster || allPlayers.filter((p: any) => p.type === 'individual').length === 0}
                                >
                                    <FileDown className="mr-2 h-4 w-4" /> 
                                    {isDownloadingRoster ? '생성 중...' : '조 편성표 다운'}
                                </Button>
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
                                <div className="space-y-4 mb-4">
                                    {/* 그룹별 필터 */}
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant={selectedIndividualGroupFilter === 'all' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => {
                                                setSelectedIndividualGroupFilter('all');
                                                setIndividualSearchTerm('');
                                            }}
                                        >
                                            전체 그룹
                                        </Button>
                                        {Object.keys(groupedIndividualPlayers).sort().map((groupName) => (
                                            <Button
                                                key={groupName}
                                                variant={selectedIndividualGroupFilter === groupName ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => {
                                                    setSelectedIndividualGroupFilter(groupName);
                                                    setIndividualSearchTerm('');
                                                }}
                                            >
                                                {groupName}
                                            </Button>
                                        ))}
                                    </div>
                                    {/* 검색 */}
                                    <div className="relative">
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
                                                            (() => {
                                                                // 코스 순서 정보 가져오기 (기존 호환성: boolean → number 변환)
                                                                const coursesOrder = group.courses || {};
                                                                const assignedCourseIds = Object.keys(coursesOrder).filter((cid: string) => {
                                                                    const order = coursesOrder[cid];
                                                                    return typeof order === 'boolean' ? order : (typeof order === 'number' && order > 0);
                                                                });
                                                                // 코스 순서대로 정렬
                                                                const sortedCourses = assignedCourseIds
                                                                    .map(cid => {
                                                                        const course = courses.find(c => c.id.toString() === cid);
                                                                        const order = coursesOrder[cid];
                                                                        const numOrder = typeof order === 'boolean' ? (order ? 1 : 0) : (typeof order === 'number' ? order : 0);
                                                                        return { course, order: numOrder };
                                                                    })
                                                                    .filter(item => item.course)
                                                                    .sort((a, b) => a.order - b.order)
                                                                    .map(item => item.course?.name)
                                                                    .filter(Boolean);
                                                                return sortedCourses.length > 0 ? sortedCourses.join(', ') : '없음';
                                                            })()
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
                                <Button 
                                    variant="default" 
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={() => handleDownloadRoster('team')}
                                    disabled={isDownloadingRoster || allPlayers.filter((p: any) => p.type === 'team').length === 0}
                                >
                                    <FileDown className="mr-2 h-4 w-4" /> 
                                    {isDownloadingRoster ? '생성 중...' : '조 편성표 다운'}
                                </Button>
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
                                <div className="space-y-4 mb-4">
                                    {/* 그룹별 필터 */}
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant={selectedTeamGroupFilter === 'all' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => {
                                                setSelectedTeamGroupFilter('all');
                                                setTeamSearchTerm('');
                                            }}
                                        >
                                            전체 그룹
                                        </Button>
                                        {Object.keys(groupedTeamPlayers).sort().map((groupName) => (
                                            <Button
                                                key={groupName}
                                                variant={selectedTeamGroupFilter === groupName ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => {
                                                    setSelectedTeamGroupFilter(groupName);
                                                    setTeamSearchTerm('');
                                                }}
                                            >
                                                {groupName}
                                            </Button>
                                        ))}
                                    </div>
                                    {/* 검색 */}
                                    <div className="relative">
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
                    {courses.length > 0 ? courses.map(course => {
                        const courseIdStr = String(course.id);
                        const currentOrder = assignedCourses[courseIdStr] || 0;
                        // 코스 수만큼 순서 선택 옵션 제공 (최대 코스 수만큼)
                        const maxAvailableOrder = courses.length;
                        const availableOrders = Array.from({ length: maxAvailableOrder }, (_, i) => i + 1);
                        
                        return (
                            <div key={course.id} className="flex items-center justify-between space-x-3">
                                <div className="flex items-center gap-2 flex-1">
                                    <Label htmlFor={`course-${course.id}`} className="text-base font-medium">
                                        {course.name}
                                    </Label>
                                    {currentOrder > 0 && (
                                        <Check className="h-4 w-4 text-primary" />
                                    )}
                                </div>
                                <Select
                                    value={currentOrder.toString()}
                                    onValueChange={(value) => {
                                        const newOrder = parseInt(value, 10);
                                        setAssignedCourses(prev => {
                                            const updated = { ...prev };
                                            
                                            // 같은 순서를 가진 다른 코스가 있으면 0으로 변경
                                            Object.keys(updated).forEach(cid => {
                                                if (cid !== courseIdStr && updated[cid] === newOrder) {
                                                    updated[cid] = 0;
                                                }
                                            });
                                            
                                            updated[courseIdStr] = newOrder;
                                            return updated;
                                        });
                                    }}
                                >
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="순서 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">선택 안함</SelectItem>
                                        {availableOrders.map(order => {
                                            const isSelected = currentOrder === order;
                                            return (
                                                <SelectItem key={order} value={order.toString()}>
                                                    <div className="flex items-center gap-2">
                                                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                                                        <span>{order === 1 ? '첫번째 코스' : order === 2 ? '두번째 코스' : order === 3 ? '세번째 코스' : `${order}번째 코스`}</span>
                                                    </div>
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                        );
                    }) : (
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
