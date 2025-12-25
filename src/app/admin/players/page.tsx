
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
    const [allScores, setAllScores] = useState<any>({});
    const [playerRanks, setPlayerRanks] = useState<{ [playerId: string]: number | null }>({});
    
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
    
    // 조 편성표 다운로드 모달 상태 (기존 코드와 완전히 분리)
    const [rosterDownloadModal, setRosterDownloadModal] = useState({
        open: false,
        type: 'individual' as 'individual' | 'team',
        paperSize: 'A4' as 'A4' | 'A3', // 용지 크기 추가
        groupSettings: {} as { [groupName: string]: { date: string; courses: string[] } } // courses는 선택 순서대로 저장
    });
    
    // Course assignment modal states
    const [isGroupCourseModalOpen, setGroupCourseModalOpen] = useState(false);
    const [currentEditingGroup, setCurrentEditingGroup] = useState<any>(null);
    const [assignedCourses, setAssignedCourses] = useState<{[key: string]: number}>({}); // 0 = 선택 안함, 1 = 첫번째, 2 = 두번째, ...


    // Editing states
    const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
    const [editingPlayerData, setEditingPlayerData] = useState<any | null>(null);
    
    // 조 이동 모달 상태
    const [joMoveModal, setJoMoveModal] = useState<{
        open: boolean;
        playerId: string | null;
        currentJo: string;
        currentGroup: string;
        isNewJo?: boolean;
    }>({
        open: false,
        playerId: null,
        currentJo: '',
        currentGroup: '',
        isNewJo: false
    });

    // 조별 인원 초과 경고 모달 상태
    const [joLimitWarningModal, setJoLimitWarningModal] = useState<{
        open: boolean;
        type: 'individual' | 'team';
        overList: string[];
    }>({
        open: false,
        type: 'individual',
        overList: []
    });
    
    // Refs for file inputs, compatible with React 19
    const [individualFileInput, setIndividualFileInput] = useState<HTMLInputElement | null>(null);
    const [teamFileInput, setTeamFileInput] = useState<HTMLInputElement | null>(null);
    const [individualReorganizeFileInput, setIndividualReorganizeFileInput] = useState<HTMLInputElement | null>(null);
    const [teamReorganizeFileInput, setTeamReorganizeFileInput] = useState<HTMLInputElement | null>(null);

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
        const scoresRef = ref(db!, 'scores');
        
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

        const unsubScores = onValue(scoresRef, (snapshot) => {
            const data = snapshot.val();
            setAllScores(data || {});
        });

        const ranksRef = ref(db!, 'tournaments/current/ranks');
        const unsubRanks = onValue(ranksRef, (snapshot) => {
            const data = snapshot.val();
            setPlayerRanks(data || {});
        });

        return () => {
            unsubPlayers();
            unsubConfig();
            unsubTournament();
            unsubScores();
            unsubRanks();
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

    // 조 재편성용 엑셀 다운로드 함수
    const handleDownloadReorganizeTemplate = async (type: 'individual' | 'team') => {
        try {
            // Firebase에 저장된 순위 사용 (전광판과 동일한 순위)

            const wb = XLSX.utils.book_new();
            const groupList = Object.values(groupsData)
                .filter((g: any) => g.type === type)
                .map((g: any) => g.name);

            if (groupList.length === 0) {
                toast({
                    title: '오류',
                    description: '등록된 그룹이 없습니다.',
                    variant: 'destructive'
                });
                return;
            }

            // 순위 데이터 확인
            const hasRanks = Object.keys(playerRanks).length > 0;
            if (!hasRanks) {
                const confirmDownload = window.confirm(
                    '순위 데이터가 아직 없습니다.\n\n' +
                    '순위를 포함하려면 먼저 "외부 전광판" 또는 "홈 전광판" 페이지를 방문하여 순위가 계산되도록 해주세요.\n\n' +
                    '순위 없이 다운로드하시겠습니까?'
                );
                if (!confirmDownload) {
                    return;
                }
            }

            groupList.forEach((groupName: string) => {
                const groupPlayers = allPlayers.filter((p: any) => 
                    p.group === groupName && 
                    p.type === type
                );

                if (groupPlayers.length === 0) return;

                // Firebase에 저장된 순위 사용
                const playersWithRank = groupPlayers.map((player: any) => {
                    const rank = playerRanks[player.id] ?? null;
                    // 디버깅: 순위가 없는 경우 로그 출력
                    if (rank === null && hasRanks) {
                        console.log(`순위 없음: ${player.name || player.p1_name} (ID: ${player.id})`);
                    }
                    return {
                        ...player,
                        rank: rank
                    };
                });

                // 순위순으로 정렬 (순위가 없는 선수는 맨 뒤로)
                playersWithRank.sort((a: any, b: any) => {
                    if (a.rank === null && b.rank === null) return 0;
                    if (a.rank === null) return 1;
                    if (b.rank === null) return -1;
                    return a.rank - b.rank;
                });

                let sheetData: any[][] = [];

                if (type === 'individual') {
                    sheetData = [['조', '이름', '소속', '순위']];
                    playersWithRank.forEach((player: any) => {
                        sheetData.push([
                            player.jo || '',
                            player.name || '',
                            player.affiliation || '무소속',
                            player.rank !== null && player.rank !== undefined ? player.rank : ''
                        ]);
                    });
                } else { // team
                    sheetData = [['조', '선수1 이름', '선수1 소속', '선수2 이름', '선수2 소속', '순위']];
                    playersWithRank.forEach((player: any) => {
                        sheetData.push([
                            player.jo || '',
                            player.p1_name || '',
                            player.p1_affiliation || '무소속',
                            player.p2_name || '',
                            player.p2_affiliation || '무소속',
                            player.rank !== null && player.rank !== undefined ? player.rank : ''
                        ]);
                    });
                }

                const ws = XLSX.utils.aoa_to_sheet(sheetData);
                
                if (type === 'individual') {
                    ws['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 8 }];
                } else {
                    ws['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 8 }];
                }

                XLSX.utils.book_append_sheet(wb, ws, groupName);
            });

            const filename = type === 'individual' 
                ? '개인전_조재편성용_양식.xlsx' 
                : '2인1팀_조재편성용_양식.xlsx';
            
            XLSX.writeFile(wb, filename);
            
            toast({
                title: '다운로드 완료',
                description: `${filename} 파일이 다운로드되었습니다.`,
            });
        } catch (error) {
            console.error('다운로드 오류:', error);
            toast({
                title: '오류',
                description: '파일 다운로드 중 오류가 발생했습니다.',
                variant: 'destructive'
            });
        }
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

                // 각 그룹에 이미 다른 타입의 선수가 있는지 확인
                const typeConflicts: string[] = [];
                sheetNames.forEach((groupName: string) => {
                    const groupData = groupsData[groupName];
                    if (!groupData) return; // 그룹이 없으면 다음 단계에서 처리됨
                    
                    // 그룹 타입 확인
                    if (groupData.type !== type) {
                        typeConflicts.push(`${groupName} (그룹 타입: ${groupData.type === 'individual' ? '개인전' : '2인1팀'}, 업로드 타입: ${type === 'individual' ? '개인전' : '2인1팀'})`);
                    }
                    
                    // 기존 선수 타입 확인
                    const existingPlayers = allPlayers.filter((p: any) => p.group === groupName);
                    if (existingPlayers.length > 0) {
                        const existingType = existingPlayers[0].type;
                        if (existingType !== type) {
                            typeConflicts.push(`${groupName} (기존 선수 타입: ${existingType === 'individual' ? '개인전' : '2인1팀'}, 업로드 타입: ${type === 'individual' ? '개인전' : '2인1팀'})`);
                        }
                    }
                });
                
                if (typeConflicts.length > 0) {
                    toast({
                        title: '타입 불일치',
                        description: `다음 그룹에서 타입이 일치하지 않습니다:\n${typeConflicts.join('\n')}\n\n올바른 타입의 그룹을 선택하거나 기존 선수를 먼저 삭제해주세요.`,
                        variant: 'destructive'
                    });
                    return;
                }

                // 그룹별 조 순서 추적 (엑셀 파일에서 나타나는 순서)
                const groupJoOrder: { [groupName: string]: { [jo: string]: number } } = {};
                // 그룹별 조별 선수 순서 추적 (엑셀 파일에서 나타나는 순서)
                const groupJoPlayerOrder: { [groupName: string]: { [jo: string]: number } } = {};

                wb.SheetNames.forEach(sheetName => {
                    const groupName = sheetName;
                    const ws = wb.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(ws);
                    
                    if (jsonData.length < 1) return;

                    // 조 순서 추적을 위한 변수
                    const seenJos = new Set<string>();
                    let joOrderIndex = 1;

                    if (type === 'individual') {
                        jsonData.forEach((row: any) => {
                            const name = row['이름']?.toString().trim();
                            const jo = row['조'];
                            const affiliation = row['소속']?.toString().trim() || '무소속';

                            if (name && jo) {
                                const joStr = jo.toString();
                                // 조 순서 추적 (처음 나타나는 조만 순서 저장)
                                if (!seenJos.has(joStr)) {
                                    if (!groupJoOrder[groupName]) groupJoOrder[groupName] = {};
                                    groupJoOrder[groupName][joStr] = joOrderIndex++;
                                    seenJos.add(joStr);
                                }
                                
                                // 조별 선수 순서 추적
                                if (!groupJoPlayerOrder[groupName]) groupJoPlayerOrder[groupName] = {};
                                if (!groupJoPlayerOrder[groupName][joStr]) groupJoPlayerOrder[groupName][joStr] = 0;
                                const playerOrder = ++groupJoPlayerOrder[groupName][joStr];
                                
                                newPlayers.push({
                                    type: 'individual',
                                    group: groupName,
                                    jo: joStr,
                                    name: name,
                                    affiliation: affiliation,
                                    uploadOrder: playerOrder, // 엑셀 순서 정보 추가
                                });
                            }
                        });
                    } else { // team
                         jsonData.forEach((row: any) => {
                            const p1_name = row['선수1 이름']?.toString().trim();
                            const p2_name = row['선수2 이름']?.toString().trim();
                            if (p1_name && p2_name && row['조']) {
                                const joStr = row['조'].toString();
                                // 조 순서 추적 (처음 나타나는 조만 순서 저장)
                                if (!seenJos.has(joStr)) {
                                    if (!groupJoOrder[groupName]) groupJoOrder[groupName] = {};
                                    groupJoOrder[groupName][joStr] = joOrderIndex++;
                                    seenJos.add(joStr);
                                }
                                
                                // 조별 선수 순서 추적
                                if (!groupJoPlayerOrder[groupName]) groupJoPlayerOrder[groupName] = {};
                                if (!groupJoPlayerOrder[groupName][joStr]) groupJoPlayerOrder[groupName][joStr] = 0;
                                const playerOrder = ++groupJoPlayerOrder[groupName][joStr];
                                
                                newPlayers.push({
                                    type: 'team',
                                    group: groupName,
                                    jo: joStr,
                                    p1_name: p1_name,
                                    p1_affiliation: row['선수1 소속']?.toString().trim() || '무소속',
                                    p2_name: p2_name,
                                    p2_affiliation: row['선수2 소속']?.toString().trim() || '무소속',
                                    uploadOrder: playerOrder, // 엑셀 순서 정보 추가
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

                // 새로운 그룹들 자동 생성 및 조 순서 정보 저장
                const allGroupsInFile = [...new Set(newPlayers.map(p => p.group))];
                allGroupsInFile.forEach(groupName => {
                    if (!groupsData[groupName]) {
                        // 코스 순서를 자동으로 설정 (코스의 order 값 또는 코스 ID를 기준으로)
                        const defaultCourses = courses.reduce((acc, course) => {
                            const courseOrder = course.order || course.id || 0;
                            if (courseOrder > 0) {
                                acc[course.id] = courseOrder;
                            }
                            return acc;
                        }, {});
                        updates[`/tournaments/current/groups/${groupName}`] = {
                            name: groupName,
                            type: type,
                            courses: defaultCourses,
                            joOrder: groupJoOrder[groupName] || {}
                        };
                    } else {
                        // 기존 그룹이면 조 순서 정보만 업데이트
                        if (groupJoOrder[groupName]) {
                            updates[`/tournaments/current/groups/${groupName}/joOrder`] = groupJoOrder[groupName];
                        }
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

    // 조 재편성 업로드 함수 (기존 선수 조 번호만 업데이트, 엑셀 파일의 새 조 편성만 검증)
    const handleReorganizeFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'individual' | 'team') => {
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

                // 그룹별 조 순서 추적 (엑셀 파일에서 나타나는 순서)
                const groupJoOrder: { [groupName: string]: { [jo: string]: number } } = {};
                // 그룹별 조별 선수 순서 추적 (엑셀 파일에서 나타나는 순서)
                const groupJoPlayerOrder: { [groupName: string]: { [jo: string]: number } } = {};

                wb.SheetNames.forEach(sheetName => {
                    const groupName = sheetName;
                    const ws = wb.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(ws);
                    
                    if (jsonData.length < 1) return;

                    // 조 순서 추적을 위한 변수
                    const seenJos = new Set<string>();
                    let joOrderIndex = 1;

                    if (type === 'individual') {
                        jsonData.forEach((row: any) => {
                            const name = row['이름']?.toString().trim();
                            const jo = row['조'];
                            const affiliation = row['소속']?.toString().trim() || '무소속';

                            if (name && jo) {
                                const joStr = jo.toString();
                                // 조 순서 추적 (처음 나타나는 조만 순서 저장)
                                if (!seenJos.has(joStr)) {
                                    if (!groupJoOrder[groupName]) groupJoOrder[groupName] = {};
                                    groupJoOrder[groupName][joStr] = joOrderIndex++;
                                    seenJos.add(joStr);
                                }
                                
                                // 조별 선수 순서 추적
                                if (!groupJoPlayerOrder[groupName]) groupJoPlayerOrder[groupName] = {};
                                if (!groupJoPlayerOrder[groupName][joStr]) groupJoPlayerOrder[groupName][joStr] = 0;
                                const playerOrder = ++groupJoPlayerOrder[groupName][joStr];
                                
                                newPlayers.push({
                                    type: 'individual',
                                    group: groupName,
                                    jo: joStr,
                                    name: name,
                                    affiliation: affiliation,
                                    uploadOrder: playerOrder, // 엑셀 순서 정보 추가
                                });
                            }
                        });
                    } else { // team
                         jsonData.forEach((row: any) => {
                            const p1_name = row['선수1 이름']?.toString().trim();
                            const p2_name = row['선수2 이름']?.toString().trim();
                            if (p1_name && p2_name && row['조']) {
                                const joStr = row['조'].toString();
                                // 조 순서 추적 (처음 나타나는 조만 순서 저장)
                                if (!seenJos.has(joStr)) {
                                    if (!groupJoOrder[groupName]) groupJoOrder[groupName] = {};
                                    groupJoOrder[groupName][joStr] = joOrderIndex++;
                                    seenJos.add(joStr);
                                }
                                
                                // 조별 선수 순서 추적
                                if (!groupJoPlayerOrder[groupName]) groupJoPlayerOrder[groupName] = {};
                                if (!groupJoPlayerOrder[groupName][joStr]) groupJoPlayerOrder[groupName][joStr] = 0;
                                const playerOrder = ++groupJoPlayerOrder[groupName][joStr];
                                
                                newPlayers.push({
                                    type: 'team',
                                    group: groupName,
                                    jo: joStr,
                                    p1_name: p1_name,
                                    p1_affiliation: row['선수1 소속']?.toString().trim() || '무소속',
                                    p2_name: p2_name,
                                    p2_affiliation: row['선수2 소속']?.toString().trim() || '무소속',
                                    uploadOrder: playerOrder, // 엑셀 순서 정보 추가
                                });
                            }
                        });
                    }
                });

                if (newPlayers.length === 0) {
                    toast({ title: '오류', description: '파일에서 유효한 선수 정보를 찾을 수 없습니다.' });
                    return;
                }

                // 기존 선수 찾기 및 업데이트/추가 구분
                const playersToUpdate: Array<{ playerId: string; newJo: string }> = [];
                const playersToAdd: any[] = [];
                
                newPlayers.forEach(newPlayer => {
                    // 같은 그룹 내에서 기존 선수 찾기
                    let existingPlayer: any = null;
                    
                    if (type === 'individual') {
                        // 개인전: 이름 + 소속 + 그룹으로 식별
                        existingPlayer = allPlayers.find((p: any) => 
                            p.type === 'individual' &&
                            p.group === newPlayer.group &&
                            p.name?.toString().trim() === newPlayer.name &&
                            (p.affiliation || '무소속') === newPlayer.affiliation
                        );
                    } else {
                        // 팀전: 선수1이름 + 선수1소속 + 선수2이름 + 선수2소속 + 그룹으로 식별
                        existingPlayer = allPlayers.find((p: any) => 
                            p.type === 'team' &&
                            p.group === newPlayer.group &&
                            p.p1_name?.toString().trim() === newPlayer.p1_name &&
                            (p.p1_affiliation || '무소속') === newPlayer.p1_affiliation &&
                            p.p2_name?.toString().trim() === newPlayer.p2_name &&
                            (p.p2_affiliation || '무소속') === newPlayer.p2_affiliation
                        );
                    }
                    
                    if (existingPlayer) {
                        // 기존 선수 발견: 조 번호만 업데이트
                        playersToUpdate.push({
                            playerId: existingPlayer.id,
                            newJo: newPlayer.jo
                        });
                    } else {
                        // 기존 선수 없음: 새로 추가
                        playersToAdd.push(newPlayer);
                    }
                });

                // --- 조별 인원(팀) 제한 검증 시작 (조 재편성용: 엑셀 파일의 새 조 편성만 검증) ---
                const groupJoLimit = type === 'individual' ? 4 : 2;
                // 엑셀 파일에 있는 선수들의 새 조 편성만 검증 (조 재편성은 엑셀 파일 기준으로 덮어쓰기)
                const newJoMap: { [key: string]: { [key: string]: number } } = {};
                
                // 엑셀 파일의 모든 선수들(newPlayers)을 새 조 기준으로 집계
                newPlayers.forEach((p: any) => {
                    const g = p.group || '';
                    const j = p.jo || '';
                    if (g && j) {
                        if (!newJoMap[g]) newJoMap[g] = {};
                        if (!newJoMap[g][j]) newJoMap[g][j] = 0;
                        newJoMap[g][j]++;
                    }
                });
                
                // 초과 조 찾기 (엑셀 파일의 새 조 편성만 검증)
                const overList: string[] = [];
                Object.entries(newJoMap).forEach(([g, jos]: [string, any]) => {
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

                // 최대 인원 제한 검증 (새로 추가되는 선수만 카운트)
                if (allPlayers.length + playersToAdd.length > maxPlayers) {
                    toast({
                        title: '선수 등록 제한',
                        description: `엑셀 파일의 새 선수(${playersToAdd.length}명)를 추가하면 최대 인원(${maxPlayers}명)을 초과합니다. 현재 ${allPlayers.length}명 등록됨.`,
                    });
                    return;
                }
                
                const updates: { [key: string]: any } = {};
                
                // 기존 선수 조 번호 및 순서 정보 업데이트
                playersToUpdate.forEach(({ playerId, newJo }) => {
                    updates[`/players/${playerId}/jo`] = newJo;
                    
                    // 순서 정보도 업데이트 (newPlayers에서 찾기)
                    const player = newPlayers.find((p: any) => {
                        const existingPlayer = allPlayers.find((ep: any) => ep.id === playerId);
                        if (!existingPlayer) return false;
                        
                        if (type === 'individual') {
                            return existingPlayer.name === p.name && 
                                   existingPlayer.affiliation === p.affiliation &&
                                   p.group === existingPlayer.group;
                        } else {
                            return existingPlayer.p1_name === p.p1_name && 
                                   existingPlayer.p1_affiliation === p.p1_affiliation &&
                                   existingPlayer.p2_name === p.p2_name && 
                                   existingPlayer.p2_affiliation === p.p2_affiliation &&
                                   p.group === existingPlayer.group;
                        }
                    });
                    
                    if (player && player.uploadOrder !== undefined) {
                        updates[`/players/${playerId}/uploadOrder`] = player.uploadOrder;
                    }
                });
                
                // 새 선수 추가
                playersToAdd.forEach(player => {
                    const newPlayerKey = push(ref(db!, 'players')).key;
                    if(newPlayerKey) {
                        updates[`/players/${newPlayerKey}`] = player;
                    }
                });

                // 새로운 그룹들 자동 생성 및 조 순서 정보 저장
                const allGroupsInFile = [...new Set(newPlayers.map(p => p.group))];
                allGroupsInFile.forEach(groupName => {
                    if (!groupsData[groupName]) {
                        // 코스 순서를 자동으로 설정 (코스의 order 값 또는 코스 ID를 기준으로)
                        const defaultCourses = courses.reduce((acc, course) => {
                            const courseOrder = course.order || course.id || 0;
                            if (courseOrder > 0) {
                                acc[course.id] = courseOrder;
                            }
                            return acc;
                        }, {});
                        updates[`/tournaments/current/groups/${groupName}`] = {
                            name: groupName,
                            type: type,
                            courses: defaultCourses,
                            joOrder: groupJoOrder[groupName] || {}
                        };
                    } else {
                        // 기존 그룹이면 조 순서 정보만 업데이트
                        if (groupJoOrder[groupName]) {
                            updates[`/tournaments/current/groups/${groupName}/joOrder`] = groupJoOrder[groupName];
                        }
                    }
                });

                update(ref(db!), updates)
                    .then(() => {
                        const updateCount = playersToUpdate.length;
                        const addCount = playersToAdd.length;
                        let message = '';
                        if (updateCount > 0 && addCount > 0) {
                            message = `${updateCount}명의 선수 조 번호가 업데이트되고, ${addCount}명의 선수가 새로 등록되었습니다.`;
                        } else if (updateCount > 0) {
                            message = `${updateCount}명의 선수 조 번호가 업데이트되었습니다.`;
                        } else {
                            message = `${addCount}명의 선수가 성공적으로 등록되었습니다.`;
                        }
                        toast({ title: '성공', description: message });
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
            
            Object.entries(grouped).forEach(([groupName, playerList]) => {
                // 그룹 데이터에서 조 순서 정보 가져오기
                const groupData = groupsData[groupName];
                const joOrder = groupData?.joOrder || {};
                
                playerList.sort((a: any, b: any) => {
                    // 조 번호로 먼저 정렬
                    if (a.jo !== b.jo) {
                        const joA = String(a.jo);
                        const joB = String(b.jo);
                        
                        // joOrder가 있으면 엑셀 순서대로 정렬
                        if (Object.keys(joOrder).length > 0) {
                            const orderA = joOrder[joA] || 999;
                            const orderB = joOrder[joB] || 999;
                            if (orderA !== orderB) {
                                return orderA - orderB;
                            }
                            // 순서 정보가 같으면 조 번호로 정렬 (숫자 우선, 그 다음 문자열)
                            const numA = parseInt(joA);
                            const numB = parseInt(joB);
                            if (!isNaN(numA) && !isNaN(numB)) {
                                return numA - numB;
                            }
                            if (!isNaN(numA)) return -1;
                            if (!isNaN(numB)) return 1;
                            return joA.localeCompare(joB);
                        } else {
                            // joOrder가 없으면 기존 정렬 (숫자 우선, 그 다음 문자열)
                            const numA = parseInt(joA);
                            const numB = parseInt(joB);
                            if (!isNaN(numA) && !isNaN(numB)) {
                                return numA - numB;
                            }
                            if (!isNaN(numA)) return -1;
                            if (!isNaN(numB)) return 1;
                            return joA.localeCompare(joB);
                        }
                    }
                    
                    // 같은 조 내에서는 엑셀 순서 우선, 없으면 이름으로 정렬
                    const orderA = a.uploadOrder ?? null;
                    const orderB = b.uploadOrder ?? null;
                    
                    if (orderA !== null && orderB !== null) {
                        // 둘 다 순서 정보가 있으면 순서로 정렬
                        return orderA - orderB;
                    } else if (orderA !== null) {
                        // A만 순서 정보가 있으면 A가 먼저
                        return -1;
                    } else if (orderB !== null) {
                        // B만 순서 정보가 있으면 B가 먼저
                        return 1;
                    } else {
                        // 둘 다 순서 정보가 없으면 이름으로 정렬
                        const nameA = a.name || a.p1_name || '';
                        const nameB = b.name || b.p1_name || '';
                        return nameA.localeCompare(nameB);
                    }
                });
            });

            return grouped;
        };

        return {
            groupedIndividualPlayers: createGroupedData(individual),
            groupedTeamPlayers: createGroupedData(team),
        };
    }, [allPlayers, groupsData]);

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
            // 코스 순서를 자동으로 설정 (코스의 order 값 또는 코스 ID를 기준으로)
            const defaultCourses = courses.reduce((acc, course) => {
                const courseOrder = course.order || course.id || 0;
                if (courseOrder > 0) {
                    acc[course.id] = courseOrder;
                }
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
            // 코스 순서를 자동으로 설정 (코스의 order 값 또는 코스 ID를 기준으로)
            const defaultCourses = courses.reduce((acc, course) => {
                const courseOrder = course.order || course.id || 0;
                if (courseOrder > 0) {
                    acc[course.id] = courseOrder;
                }
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

        // 해당 그룹에 이미 다른 타입의 선수가 있는지 확인
        const existingPlayersInGroup = allPlayers.filter((p: any) => p.group === trimmedName);
        if (existingPlayersInGroup.length > 0) {
            const conflictingType = existingPlayersInGroup[0].type;
            const conflictingTypeName = conflictingType === 'individual' ? '개인전' : '2인1팀';
            const newTypeName = type === 'individual' ? '개인전' : '2인1팀';
            
            toast({
                title: '타입 불일치',
                description: `'${trimmedName}' 그룹에 이미 ${conflictingTypeName} 선수가 ${existingPlayersInGroup.length}명 등록되어 있습니다.\n${newTypeName} 그룹을 생성하려면 먼저 기존 선수를 삭제하거나 다른 그룹으로 이동시켜주세요.`,
                variant: 'destructive'
            });
            return;
        }

        const groupRef = ref(db!, `tournaments/current/groups/${trimmedName}`);
        // 코스 순서를 자동으로 설정 (코스의 order 값 또는 코스 ID를 기준으로)
        const defaultCourses = courses.reduce((acc, course) => {
            // 코스의 order 값이 있으면 그 값을 사용, 없으면 코스 ID를 사용
            const courseOrder = course.order || course.id || 0;
            if (courseOrder > 0) {
                acc[course.id] = courseOrder;
            }
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
        const existingCourses = group.courses || {};
        const convertedCourses: {[key: string]: number} = {};
        
        // 기존 설정이 있는 코스와 없는 코스를 구분
        const coursesWithExistingOrder: Array<{courseId: string, order: number}> = [];
        const coursesWithoutOrder: Array<{courseId: string, courseOrder: number}> = [];
        
        // 모든 코스를 확인
        courses.forEach(course => {
            const courseIdStr = String(course.id);
            const existingOrder = existingCourses[courseIdStr];
            
            // 기존 설정이 있고 number 타입이고 0보다 큰 경우
            if (typeof existingOrder === 'number' && existingOrder > 0) {
                coursesWithExistingOrder.push({ courseId: courseIdStr, order: existingOrder });
            } else {
                // 기존 설정이 없거나 boolean true인 경우 → 코스의 order 값을 기본값으로 사용
                // 코스의 order가 없으면 코스 ID를 기준으로 순서 할당 (대회 및 코스 관리에서 생성된 순서)
                let courseOrder = course.order;
                if (!courseOrder || courseOrder <= 0) {
                    // 코스의 order가 없으면 코스 ID를 기준으로 순서 할당
                    // 코스 ID가 1, 2, 3, 4... 순서대로 생성되었다고 가정
                    courseOrder = course.id || 0;
                }
                if (courseOrder > 0) {
                    coursesWithoutOrder.push({ courseId: courseIdStr, courseOrder });
                } else {
                    // 코스의 order도 없으면 0 (선택 안함)
                    convertedCourses[courseIdStr] = 0;
                }
            }
        });
        
        // 기존 설정이 있는 코스는 기존 순서대로 정렬
        coursesWithExistingOrder.sort((a, b) => a.order - b.order);
        
        // 기존 설정이 없는 코스는 코스의 order 기준으로 정렬
        coursesWithoutOrder.sort((a, b) => a.courseOrder - b.courseOrder);
        
        // 기존 설정이 있는 코스의 순서를 먼저 할당
        const usedOrders = new Set<number>();
        coursesWithExistingOrder.forEach((item) => {
            if (usedOrders.has(item.order)) {
                // 중복 발견: 다음 사용 가능한 순서로 재할당
                let nextOrder = item.order;
                while (usedOrders.has(nextOrder)) {
                    nextOrder++;
                }
                convertedCourses[item.courseId] = nextOrder;
                usedOrders.add(nextOrder);
            } else {
                convertedCourses[item.courseId] = item.order;
                usedOrders.add(item.order);
            }
        });
        
        // 기존 설정이 없는 코스는 코스의 order를 기준으로 순차적으로 할당
        // 단, 기존 설정과 겹치지 않도록 다음 사용 가능한 순서로 할당
        coursesWithoutOrder.forEach((item) => {
            // 코스의 order를 기준으로 시작하되, 이미 사용된 순서는 건너뛰기
            let targetOrder = item.courseOrder;
            while (usedOrders.has(targetOrder)) {
                targetOrder++;
            }
            convertedCourses[item.courseId] = targetOrder;
            usedOrders.add(targetOrder);
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

    // 조 이동 모달: 선택된 그룹의 조 목록 계산
    const availableJosForMove = useMemo(() => {
        if (!joMoveModal.currentGroup) return [];
        const groupPlayers = allPlayers.filter((p: any) => p.group === joMoveModal.currentGroup);
        const seen = new Set<string>();
        const orderedJos: string[] = [];
        groupPlayers.forEach((p: any) => {
            const joStr = p.jo?.toString() || '';
            if (joStr && !seen.has(joStr)) {
                seen.add(joStr);
                orderedJos.push(joStr);
            }
        });
        
        // 그룹 데이터에서 조 순서 정보 가져오기
        const groupData = groupsData[joMoveModal.currentGroup];
        const joOrder = groupData?.joOrder || {};
        
        // 조 순서 정보가 있으면 엑셀 순서대로 정렬
        if (Object.keys(joOrder).length > 0) {
            orderedJos.sort((a, b) => {
                const orderA = joOrder[a] || 999;
                const orderB = joOrder[b] || 999;
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                // 순서 정보가 같으면 조 번호로 정렬 (숫자 우선, 그 다음 문자열)
                const numA = parseInt(a);
                const numB = parseInt(b);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                if (!isNaN(numA)) return -1;
                if (!isNaN(numB)) return 1;
                return a.localeCompare(b);
            });
        } else {
            // joOrder가 없으면 기존 정렬 (숫자 우선, 그 다음 문자열)
            orderedJos.sort((a, b) => {
                const numA = parseInt(a);
                const numB = parseInt(b);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                if (!isNaN(numA)) return -1;
                if (!isNaN(numB)) return 1;
                return a.localeCompare(b);
            });
        }
        
        return orderedJos;
    }, [joMoveModal.currentGroup, allPlayers, groupsData]);

    // 조 이동 핸들러 함수
    const handleMovePlayerJo = (playerId: string, newJo: string, newGroup?: string) => {
        if (!playerId || !newJo || newJo.trim() === '') {
            toast({ title: '입력 오류', description: '조 번호를 입력해주세요.' });
            return;
        }

        const finalGroup = newGroup && newGroup.trim() !== '' ? newGroup.trim() : null;
        const finalJo = newJo.trim();
        
        // 이동할 조에 이미 있는 선수들의 uploadOrder 확인
        // 현재 선수의 그룹 정보 가져오기
        const currentPlayer = allPlayers.find((p: any) => p.id === playerId);
        const targetGroup = finalGroup || (currentPlayer?.group || '');
        
        const playersInTargetJo = allPlayers.filter((p: any) => {
            const pGroup = p.group || '';
            const pJo = p.jo?.toString() || '';
            return pGroup === targetGroup && pJo === finalJo && p.id !== playerId;
        });
        
        // 해당 조의 최대 uploadOrder 찾기
        let maxUploadOrder = 0;
        playersInTargetJo.forEach((p: any) => {
            if (p.uploadOrder && typeof p.uploadOrder === 'number' && p.uploadOrder > maxUploadOrder) {
                maxUploadOrder = p.uploadOrder;
            }
        });
        
        // 새 조로 이동하는 선수에게 다음 순서 부여
        const newUploadOrder = maxUploadOrder + 1;

        const updates: { [key: string]: any } = {};
        updates[`/players/${playerId}/jo`] = finalJo;
        updates[`/players/${playerId}/uploadOrder`] = newUploadOrder;
        
        // 그룹도 변경하는 경우
        if (finalGroup) {
            updates[`/players/${playerId}/group`] = finalGroup;
            
            // 그룹이 없으면 자동으로 생성
            if (!groupsData[finalGroup]) {
                // 코스 순서를 자동으로 설정 (코스의 order 값 또는 코스 ID를 기준으로)
                const defaultCourses = courses.reduce((acc, course) => {
                    const courseOrder = course.order || course.id || 0;
                    if (courseOrder > 0) {
                        acc[course.id] = courseOrder;
                    }
                    return acc;
                }, {});
                updates[`/tournaments/current/groups/${finalGroup}`] = {
                    name: finalGroup,
                    type: 'individual',
                    courses: defaultCourses
                };
            }
        }

        update(ref(db!), updates)
            .then(() => {
                toast({ 
                    title: '성공', 
                    description: '선수가 이동되었습니다.',
                    duration: 2000
                });
            })
            .catch(err => {
                toast({ 
                    title: '이동 실패', 
                    description: err.message,
                    variant: 'destructive'
                });
            });
    };

    // 전체 조별 인원 확인 함수
    const handleCheckAllJos = (type: 'individual' | 'team') => {
        const groupJoLimit = type === 'individual' ? 4 : 2;
        const groupJoMap: { [key: string]: { [key: string]: number } } = {};
        
        // 모든 선수를 그룹/조별로 집계
        allPlayers.filter((p: any) => p.type === type).forEach((p: any) => {
            const g = p.group || '';
            const j = p.jo?.toString() || '';
            if (g && j) {
                if (!groupJoMap[g]) groupJoMap[g] = {};
                if (!groupJoMap[g][j]) groupJoMap[g][j] = 0;
                groupJoMap[g][j]++;
            }
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
            // 경고 모달 표시
            setJoLimitWarningModal({
                open: true,
                type,
                overList
            });
        } else {
            toast({ 
                title: '확인 완료', 
                description: '모든 조가 인원 제한을 준수합니다.',
                duration: 2000
            });
        }
    };

    // 그룹명 영어 번역 함수
    const getGroupNameEnglish = (groupName: string): string => {
        const translations: { [key: string]: string } = {
            '여자부': "Women's Division",
            '남자부': "Men's Division",
            '남자 시니어': "Men's Senior",
            '여자 시니어': "Women's Senior",
            '남자일반': "Men's General",
            '여자일반': "Women's General",
            '부부대항': "Couples",
            '2인1조': "2-Person Team"
        };
        return translations[groupName] || groupName;
    };

    // 조편성표 다운로드 모달 열기 (기존 함수는 모달 열기로 변경)
    const handleOpenRosterDownloadModal = (type: 'individual' | 'team') => {
        const targetGroups = groupList.filter((g: any) => g.type === type);
        if (targetGroups.length === 0) {
            toast({ 
                title: "알림", 
                description: `${type === 'individual' ? '개인전' : '2인1팀'} 그룹이 없습니다.` 
            });
            return;
        }
        
        // 그룹별 기본 설정 초기화
        const initialSettings: { [groupName: string]: { date: string; courses: string[] } } = {};
        targetGroups.forEach((group: any) => {
            initialSettings[group.name] = {
                date: '',
                courses: []
            };
        });
        
        setRosterDownloadModal({
            open: true,
            type,
            groupSettings: initialSettings
        });
    };

    // 조편성표 이미지 다운로드 함수 (모달에서 호출)
    const handleDownloadRosterWithSettings = async () => {
        if (isDownloadingRoster) return;
        
        setIsDownloadingRoster(true);
        try {
            // html2canvas 동적 임포트
            const html2canvas = (await import('html2canvas')).default;

            const tournamentName = tournament?.name || '파크골프 토너먼트';
            const printDate = new Date().toLocaleString('ko-KR');
            const type = rosterDownloadModal.type;
            
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

            // 용지 크기에 따른 크기 설정
            const paperSize = rosterDownloadModal.paperSize || 'A4';
            const PAPER_SIZES = {
                A4: { width: 794, height: 1123 }, // 210mm x 297mm, 96dpi 기준
                A3: { width: 1123, height: 1587 }  // 297mm x 420mm, 96dpi 기준
            };
            const PAPER_WIDTH = PAPER_SIZES[paperSize].width;
            const PAPER_HEIGHT = PAPER_SIZES[paperSize].height;
            const HEADER_HEIGHT = 120; // 헤더 높이
            const GROUP_HEADER_HEIGHT = 50; // 그룹 헤더 높이
            const TABLE_HEADER_HEIGHT = 40; // 테이블 헤더 높이
            const ROW_HEIGHT = type === 'individual' ? 35 : 40; // 행 높이
            const FOOTER_HEIGHT = 30; // 푸터 높이
            const MARGIN = 20; // 여백
            const BOTTOM_MARGIN = 40; // 하단 여백 (셀이 잘리지 않도록 추가 여백)

            // 한 페이지에 들어갈 수 있는 행 수 계산 (하단 여백 고려)
            const availableHeight = PAPER_HEIGHT - HEADER_HEIGHT - GROUP_HEADER_HEIGHT - TABLE_HEADER_HEIGHT - FOOTER_HEIGHT - (MARGIN * 2) - BOTTOM_MARGIN;
            const maxRowsPerPage = Math.floor(availableHeight / ROW_HEIGHT);

            // 그룹별로 처리
            for (let groupIdx = 0; groupIdx < targetGroups.length; groupIdx++) {
                const group = targetGroups[groupIdx] as any;
                const groupName = group.name;
                
                // 해당 그룹의 선수들 가져오기 (시뮬레이션 데이터 포함)
                const groupPlayers = allPlayers.filter((p: any) => {
                    // 타입과 그룹이 일치하는지 확인
                    const typeMatch = p.type === type;
                    const groupMatch = p.group === groupName;
                    
                    // 디버깅: 시뮬레이션 데이터 확인
                    if (p.name?.includes('시뮬') || p.affiliation?.includes('시뮬')) {
                        console.log('시뮬레이션 선수 발견:', {
                            id: p.id,
                            name: p.name,
                            group: p.group,
                            type: p.type,
                            jo: p.jo,
                            targetGroup: groupName,
                            targetType: type,
                            typeMatch,
                            groupMatch
                        });
                    }
                    
                    return typeMatch && groupMatch;
                });

                if (groupPlayers.length === 0) {
                    console.warn(`그룹 "${groupName}"에 ${type === 'individual' ? '개인전' : '2인1팀'} 선수가 없습니다.`);
                    continue;
                }
                
                console.log(`그룹 "${groupName}" 조편성표 생성: ${groupPlayers.length}명`);

                // 조별로 그룹화
                const playersByJo: { [jo: string]: any[] } = {};
                groupPlayers.forEach((player: any) => {
                    const jo = player.jo?.toString() || '미지정';
                    if (!playersByJo[jo]) {
                        playersByJo[jo] = [];
                    }
                    playersByJo[jo].push(player);
                });

                // 그룹 데이터에서 조 순서 정보 가져오기
                const groupData = groupsData[groupName];
                const joOrder = groupData?.joOrder || {};

                // 조 번호 정렬 (joOrder가 있으면 엑셀 순서대로, 없으면 숫자 우선)
                const sortedJos = Object.keys(playersByJo).sort((a, b) => {
                    // joOrder가 있으면 엑셀 순서대로 정렬
                    if (Object.keys(joOrder).length > 0) {
                        const orderA = joOrder[a] || 999;
                        const orderB = joOrder[b] || 999;
                        if (orderA !== orderB) {
                            return orderA - orderB;
                        }
                        // 순서 정보가 같으면 조 번호로 정렬 (숫자 우선, 그 다음 문자열)
                        const numA = parseInt(a);
                        const numB = parseInt(b);
                        if (!isNaN(numA) && !isNaN(numB)) {
                            return numA - numB;
                        }
                        if (!isNaN(numA)) return -1;
                        if (!isNaN(numB)) return 1;
                        return a.localeCompare(b);
                    } else {
                        // joOrder가 없으면 기존 정렬 (숫자 우선, 그 다음 문자열)
                        const numA = parseInt(a);
                        const numB = parseInt(b);
                        if (!isNaN(numA) && !isNaN(numB)) {
                            return numA - numB;
                        }
                        if (!isNaN(numA)) return -1;
                        if (!isNaN(numB)) return 1;
                        return a.localeCompare(b);
                    }
                });

                // 조별로 행 수 계산하여 페이지 분할
                let currentPageJoList: string[] = [];
                let pageNumber = 1;

                const createPage = async (jos: string[], pageNum: number, isLastPage: boolean, totalPages: number, totalPlayers: number) => {
                    const container = document.createElement('div');
                    container.style.cssText = `
                        position: absolute; 
                        left: -9999px; 
                        top: 0; 
                        width: ${PAPER_WIDTH}px !important; 
                        min-width: ${PAPER_WIDTH}px !important; 
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
                                padding: 14px 6px; 
                                border: 1px solid #e2e8f0;
                                vertical-align: middle;
                                font-size: 14px;
                                text-align: center;
                                line-height: 1.4;
                            }
                            .roster-table th .header-korean {
                                display: block;
                                font-size: 14px;
                                margin-bottom: 3px;
                            }
                            .roster-table th .header-english {
                                display: block;
                                font-size: 11px;
                                font-weight: 500;
                                color: #64748b;
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
                                word-wrap: break-word;
                                word-break: break-word;
                                overflow-wrap: break-word;
                                white-space: normal;
                                min-height: 35px;
                            }
                            .jo-header {
                                background-color: #e0f2fe !important;
                                font-weight: 800;
                                color: #0369a1;
                                white-space: nowrap;
                            }
                            .jo-tbody {
                                page-break-inside: avoid;
                            }
                            .text-center { text-align: center; }
                            .text-left { text-align: left; }
                            .font-bold { font-weight: 700; }
                            @media print {
                                .jo-tbody {
                                    page-break-inside: avoid;
                                }
                            }
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
                    
                    // 그룹별 설정 가져오기 (코스는 선택 순서대로)
                    const groupSettings = rosterDownloadModal.groupSettings[groupName] || { date: '', courses: [] };
                    
                    // 날짜를 한글 형식으로 변환
                    let scheduleText = '일정 미지정';
                    let scheduleTextEnglish = 'Schedule Not Set';
                    if (groupSettings.date) {
                        try {
                            const dateStr = groupSettings.date;
                            let date: Date | null = null;
                            
                            // ISO 형식 (YYYY-MM-DD) 파싱
                            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                date = new Date(dateStr);
                            } else {
                                // 한글 날짜 형식 파싱 (예: "2026년 2월 26일")
                                const match = dateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
                                if (match) {
                                    date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                                } else {
                                    // 다른 형식 시도
                                    date = new Date(dateStr);
                                }
                            }
                            
                            if (date && !isNaN(date.getTime())) {
                                // 한글 형식: "2026년 2월 26일"
                                scheduleText = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
                                
                                // 영어 형식: "February 26, 2026"
                                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                                scheduleTextEnglish = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                            } else {
                                scheduleText = dateStr; // 파싱 실패 시 원본 표시
                                scheduleTextEnglish = dateStr;
                            }
                        } catch (e) {
                            scheduleText = groupSettings.date; // 오류 시 원본 표시
                            scheduleTextEnglish = groupSettings.date;
                        }
                    }
                    // 코스는 선택한 순서대로 표시
                    const coursesText = groupSettings.courses.length > 0 
                        ? groupSettings.courses.map((cid: string) => {
                            const course = courses.find((c: any) => c.id === cid);
                            return course?.name || cid;
                        }).join(', ')
                        : '코스 미지정';
                    // 코스명을 영어로 변환 (한글 "코스" → "Course")
                    const coursesTextEnglish = groupSettings.courses.length > 0 
                        ? groupSettings.courses.map((cid: string) => {
                            const course = courses.find((c: any) => c.id === cid);
                            const courseName = course?.name || cid;
                            // "코스"를 "Course"로 변경
                            return courseName.replace(/코스/g, 'Course');
                        }).join(', ')
                        : 'Course Not Set';
                    
                    const groupNameEnglish = getGroupNameEnglish(groupName);
                    
                    htmlContent += `
                            <div class="group-section">
                                <span class="group-icon">📋</span>
                                <span class="group-title">${groupName} 조편성표 ${groupNameEnglish ? `<span style="font-size: 18px; font-weight: 500; color: #64748b; margin-left: 8px;">${groupNameEnglish}</span>` : ''}</span>
                            </div>
                            <div style="margin-bottom: 15px; padding: 12px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6;">
                                <div style="font-size: 14px; font-weight: 600; color: #334155; margin-bottom: 6px;">📅 일정: ${scheduleText} <span style="font-size: 12px; font-weight: 500; color: #64748b; margin-left: 8px;">(${scheduleTextEnglish})</span></div>
                                <div style="font-size: 14px; font-weight: 600; color: #334155;">⛳ 코스: ${coursesText} <span style="font-size: 12px; font-weight: 500; color: #64748b; margin-left: 8px;">(${coursesTextEnglish})</span></div>
                            </div>
                            <table class="roster-table">
                                <colgroup>
                                    <col style="width: 100px;">
                                    <col style="width: auto;">
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>
                                            <span class="header-korean">조</span>
                                            <span class="header-english">Group</span>
                                        </th>
                                        <th>
                                            <span class="header-korean">조 구성원</span>
                                            <span class="header-english">Group Members</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    // 조별로 행 추가 (한 줄에 모든 구성원 나열) - 조 셀 분리 방지를 위해 tbody로 묶기
                    jos.forEach((jo) => {
                        let playersInJo = playersByJo[jo];
                        
                        if (!playersInJo || playersInJo.length === 0) {
                            console.warn(`조 ${jo}에 선수가 없습니다.`);
                            return;
                        }
                        
                        // 엑셀 업로드 순서(uploadOrder)를 기준으로 정렬
                        playersInJo = [...playersInJo].sort((a: any, b: any) => {
                            const orderA = a.uploadOrder ?? 999999;
                            const orderB = b.uploadOrder ?? 999999;
                            return orderA - orderB;
                        });
                        
                        const membersList: string[] = [];
                        
                        playersInJo.forEach((player: any) => {
                            if (type === 'individual') {
                                const name = player.name || player.id || '-';
                                const affiliation = player.affiliation || '무소속';
                                // 시뮬레이션 데이터도 정상적으로 표시
                                // 각 이름을 nowrap으로 감싸서 이름 중간에 줄바꿈 방지
                                membersList.push(`<span style="white-space: nowrap;">${name}(<span style="color: #64748b;">${affiliation}</span>)</span>`);
                            } else {
                                const p1Name = player.p1_name || '-';
                                const p1Affiliation = player.p1_affiliation || '무소속';
                                const p2Name = player.p2_name || '-';
                                const p2Affiliation = player.p2_affiliation || '무소속';
                                // 각 이름을 nowrap으로 감싸서 이름 중간에 줄바꿈 방지
                                membersList.push(`<span style="white-space: nowrap;">${p1Name}(<span style="color: #64748b;">${p1Affiliation}</span>)</span> <span style="white-space: nowrap;">${p2Name}(<span style="color: #64748b;">${p2Affiliation}</span>)</span>`);
                            }
                        });
                        
                        if (membersList.length === 0) {
                            console.warn(`조 ${jo}의 구성원 목록이 비어있습니다.`);
                            return;
                        }
                        
                        // 조 셀 분리 방지를 위해 각 조를 tbody로 묶기
                        htmlContent += `<tbody class="jo-tbody">`;
                        htmlContent += `<tr>`;
                        htmlContent += `<td class="jo-header text-center font-bold">${jo}</td>`;
                        htmlContent += `<td class="text-center">${membersList.join('   ')}</td>`;
                        htmlContent += `</tr>`;
                        htmlContent += `</tbody>`;
                    });

                    // 테이블 맨 아래에 헤더와 같은 배경색의 빈 행 추가 (보기 좋게)
                    const menuRowHeight = Math.floor(ROW_HEIGHT / 3); // 메뉴 두께의 1/3
                    htmlContent += `<tr style="height: ${menuRowHeight}px;">`;
                    htmlContent += `<td colspan="2" style="background-color: #f1f5f9; border: 1px solid #e2e8f0;"></td>`;
                    htmlContent += `</tr>`;

                    htmlContent += `
                                </tbody>
                            </table>
                            <div class="page-footer" style="margin-top: 40px; padding-bottom: 20px;">
                                ${isLastPage ? `총 ${totalPlayers}${type === 'individual' ? '명' : '팀'}` : ''} - ${pageNum}/${totalPages}페이지
                            </div>
                        </div>
                    `;

                    container.innerHTML = htmlContent;

                    // 실제 렌더링된 높이 측정 (렌더링 완료 대기)
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const actualHeight = container.scrollHeight || container.offsetHeight || PAPER_HEIGHT;
                    
                    // 실제 높이를 사용하되, 최대 높이 제한 (너무 긴 경우 방지)
                    const canvasHeight = Math.min(actualHeight + 50, PAPER_HEIGHT * 2);

                    // 이미지 생성
                    const canvas = await html2canvas(container, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        windowWidth: PAPER_WIDTH,
                        width: PAPER_WIDTH,
                        height: canvasHeight,
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
                // 첫 페이지는 15조까지만, 이후 페이지는 첫 페이지 높이 기준으로 분할
                // 조는 중간에 잘리지 않도록 조 단위로만 분할
                const FIRST_PAGE_MAX_JO = 15; // 첫 페이지 최대 조 수
                const SUBSEQUENT_PAGE_MAX_JO = 15; // 이후 페이지 최대 조 수 (줄바꿈 고려하여 첫 페이지와 동일하게)
                let currentPageRowCount = 0;
                let isFirstPage = true;
                const totalJos = sortedJos.length; // 전체 조 수
                let totalPages = 1; // 총 페이지 수 (계산용)
                
                // 총 페이지 수 미리 계산
                if (totalJos > FIRST_PAGE_MAX_JO) {
                    const remainingJos = totalJos - FIRST_PAGE_MAX_JO;
                    totalPages = 1 + Math.ceil(remainingJos / SUBSEQUENT_PAGE_MAX_JO);
                }
                
                console.log(`그룹 "${groupName}" 조편성표: 총 ${totalJos}조, 예상 페이지 수: ${totalPages}`);
                
                for (let i = 0; i < sortedJos.length; i++) {
                    const jo = sortedJos[i];
                    const playersInJo = playersByJo[jo];
                    
                    // 조당 1행이므로 항상 1행으로 계산
                    const joRows = 1;
                    
                    // 첫 페이지는 15조까지만
                    if (isFirstPage && currentPageJoList.length >= FIRST_PAGE_MAX_JO) {
                        // 첫 페이지 저장
                        await createPage(currentPageJoList, pageNumber, false, totalPages, groupPlayers.length);
                        pageNumber++;
                        currentPageJoList = [];
                        currentPageRowCount = 0;
                        isFirstPage = false;
                    }
                    // 이후 페이지는 첫 페이지와 동일한 조 수로 분할 (줄바꿈 고려)
                    else if (!isFirstPage && currentPageJoList.length >= SUBSEQUENT_PAGE_MAX_JO) {
                        // 현재 페이지 저장
                        await createPage(currentPageJoList, pageNumber, false, totalPages, groupPlayers.length);
                        pageNumber++;
                        currentPageJoList = [];
                        currentPageRowCount = 0;
                    }

                    // 현재 조 추가
                    currentPageJoList.push(jo);
                    currentPageRowCount += joRows;
                    
                    // 디버깅: 조별 선수 수 확인
                    if (playersInJo.length === 0) {
                        console.warn(`조 ${jo}에 선수가 없습니다.`);
                    } else {
                        console.log(`조 ${jo}: ${playersInJo.length}명 - ${playersInJo.map((p: any) => p.name).join(', ')}`);
                    }
                }

                // 마지막 페이지 저장 (모든 조 포함 확인)
                if (currentPageJoList.length > 0) {
                    await createPage(currentPageJoList, pageNumber, true, totalPages, groupPlayers.length);
                }
                
                // 모든 조가 포함되었는지 확인
                const processedJosCount = sortedJos.length;
                const expectedTotalPlayers = processedJosCount * 4; // 조당 4명 가정
                console.log(`그룹 "${groupName}" 조편성표 완료:`);
                console.log(`  - 총 조 수: ${processedJosCount}조`);
                console.log(`  - 총 페이지 수: ${pageNumber}페이지`);
                console.log(`  - 총 선수 수: ${groupPlayers.length}${type === 'individual' ? '명' : '팀'}`);
                console.log(`  - 처리된 조 목록: ${sortedJos.join(', ')}`);
                
                if (processedJosCount * 4 !== groupPlayers.length) {
                    console.warn(`⚠️ 경고: 조 수(${processedJosCount}) × 4 ≠ 총 선수 수(${groupPlayers.length})`);
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

    // 조 편성표 인쇄 함수 (모달에서 호출)
    const handlePrintRosterWithSettings = async () => {
        if (isDownloadingRoster) return;
        
        setIsDownloadingRoster(true);
        try {
            const tournamentName = tournament?.name || '파크골프 토너먼트';
            const type = rosterDownloadModal.type;
            const targetGroups = groupList.filter((g: any) => g.type === type);
            
            if (targetGroups.length === 0) {
                toast({ 
                    title: "알림", 
                    description: `${type === 'individual' ? '개인전' : '2인1팀'} 그룹이 없습니다.` 
                });
                setIsDownloadingRoster(false);
                return;
            }

            // 인쇄용 HTML 생성
            let printContent = '';
            
            targetGroups.forEach((group: any, groupIdx: number) => {
                const groupName = group.name;
                const groupPlayers = allPlayers.filter((p: any) => p.type === type && p.group === groupName);
                
                if (groupPlayers.length === 0) return;
                
                // 그룹별 설정 (코스는 선택 순서대로)
                const groupSettings = rosterDownloadModal.groupSettings[groupName] || { date: '', courses: [] };
                
                // 날짜를 한글 형식으로 변환
                let scheduleText = '일정 미지정';
                let scheduleTextEnglish = 'Schedule Not Set';
                if (groupSettings.date) {
                    try {
                        const dateStr = groupSettings.date;
                        let date: Date | null = null;
                        
                        // ISO 형식 (YYYY-MM-DD) 파싱
                        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            date = new Date(dateStr);
                        } else {
                            // 한글 날짜 형식 파싱 (예: "2026년 2월 26일")
                            const match = dateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
                            if (match) {
                                date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                            } else {
                                // 다른 형식 시도
                                date = new Date(dateStr);
                            }
                        }
                        
                        if (date && !isNaN(date.getTime())) {
                            // 한글 형식: "2026년 2월 26일"
                            scheduleText = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
                            
                            // 영어 형식: "February 26, 2026"
                            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                            scheduleTextEnglish = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                        } else {
                            scheduleText = dateStr; // 파싱 실패 시 원본 표시
                            scheduleTextEnglish = dateStr;
                        }
                    } catch (e) {
                        scheduleText = groupSettings.date; // 오류 시 원본 표시
                        scheduleTextEnglish = groupSettings.date;
                    }
                }
                // 코스는 선택한 순서대로 표시
                const coursesText = groupSettings.courses.length > 0 
                    ? groupSettings.courses.map((cid: string) => {
                        const course = courses.find((c: any) => c.id === cid);
                        return course?.name || cid;
                    }).join(', ')
                    : '코스 미지정';
                // 코스명을 영어로 변환 (한글 "코스" → "Course")
                const coursesTextEnglish = groupSettings.courses.length > 0 
                    ? groupSettings.courses.map((cid: string) => {
                        const course = courses.find((c: any) => c.id === cid);
                        const courseName = course?.name || cid;
                        // "코스"를 "Course"로 변경
                        return courseName.replace(/코스/g, 'Course');
                    }).join(', ')
                    : 'Course Not Set';
                
                // 조별로 그룹화
                const playersByJo: { [jo: string]: any[] } = {};
                groupPlayers.forEach((player: any) => {
                    const jo = player.jo?.toString() || '미지정';
                    if (!playersByJo[jo]) playersByJo[jo] = [];
                    playersByJo[jo].push(player);
                });
                
                // 그룹 데이터에서 조 순서 정보 가져오기
                const groupData = groupsData[groupName];
                const joOrder = groupData?.joOrder || {};
                
                // 조 번호 정렬 (joOrder가 있으면 엑셀 순서대로, 없으면 숫자 우선)
                const sortedJos = Object.keys(playersByJo).sort((a, b) => {
                    // joOrder가 있으면 엑셀 순서대로 정렬
                    if (Object.keys(joOrder).length > 0) {
                        const orderA = joOrder[a] || 999;
                        const orderB = joOrder[b] || 999;
                        if (orderA !== orderB) {
                            return orderA - orderB;
                        }
                        // 순서 정보가 같으면 조 번호로 정렬 (숫자 우선, 그 다음 문자열)
                        const numA = parseInt(a);
                        const numB = parseInt(b);
                        if (!isNaN(numA) && !isNaN(numB)) {
                            return numA - numB;
                        }
                        if (!isNaN(numA)) return -1;
                        if (!isNaN(numB)) return 1;
                        return a.localeCompare(b);
                    } else {
                        // joOrder가 없으면 기존 정렬 (숫자 우선, 그 다음 문자열)
                        const numA = parseInt(a);
                        const numB = parseInt(b);
                        if (!isNaN(numA) && !isNaN(numB)) {
                            return numA - numB;
                        }
                        if (!isNaN(numA)) return -1;
                        if (!isNaN(numB)) return 1;
                        return a.localeCompare(b);
                    }
                });
                
                if (groupIdx > 0) {
                    printContent += '<div style="page-break-before: always;"></div>';
                }
                
                const groupNameEnglish = getGroupNameEnglish(groupName);
                printContent += `
                    <div style="margin-bottom: 30px;">
                        <h1 style="font-size: 32px; font-weight: 800; margin-bottom: 20px; text-align: center;">⛳ ${tournamentName}</h1>
                        <div style="margin-bottom: 20px;">
                            <h2 style="font-size: 24px; font-weight: 700; color: #334155; margin-bottom: 12px;">
                                📋 ${groupName} 조편성표 ${groupNameEnglish ? `<span style="font-size: 18px; font-weight: 500; color: #64748b; margin-left: 8px;">${groupNameEnglish}</span>` : ''}
                            </h2>
                            <div style="padding: 12px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6; margin-bottom: 20px;">
                                <div style="font-size: 14px; font-weight: 600; color: #334155; margin-bottom: 6px;">📅 일정: ${scheduleText} <span style="font-size: 12px; font-weight: 500; color: #64748b; margin-left: 8px;">(${scheduleTextEnglish})</span></div>
                                <div style="font-size: 14px; font-weight: 600; color: #334155;">⛳ 코스: ${coursesText} <span style="font-size: 12px; font-weight: 500; color: #64748b; margin-left: 8px;">(${coursesTextEnglish})</span></div>
                            </div>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <thead>
                                <tr>
                                    <th style="background-color: #f1f5f9; padding: 14px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700;">
                                        <div style="display: block; font-size: 14px; margin-bottom: 3px;">조</div>
                                        <div style="display: block; font-size: 11px; font-weight: 500; color: #64748b;">Group</div>
                                    </th>
                                    <th style="background-color: #f1f5f9; padding: 14px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700;">
                                        <div style="display: block; font-size: 14px; margin-bottom: 3px;">조 구성원</div>
                                        <div style="display: block; font-size: 11px; font-weight: 500; color: #64748b;">Group Members</div>
                                    </th>
                                </tr>
                            </thead>
                `;
                
                sortedJos.forEach((jo) => {
                    const playersInJo = playersByJo[jo];
                    const membersList: string[] = [];
                    
                    playersInJo.forEach((player: any) => {
                        if (type === 'individual') {
                            const name = player.name || '-';
                            const affiliation = player.affiliation || '무소속';
                            // 각 이름을 nowrap으로 감싸서 이름 중간에 줄바꿈 방지
                            membersList.push(`<span style="white-space: nowrap;">${name}(${affiliation})</span>`);
                        } else {
                            const p1Name = player.p1_name || '-';
                            const p1Affiliation = player.p1_affiliation || '무소속';
                            const p2Name = player.p2_name || '-';
                            const p2Affiliation = player.p2_affiliation || '무소속';
                            // 각 이름을 nowrap으로 감싸서 이름 중간에 줄바꿈 방지
                            membersList.push(`<span style="white-space: nowrap;">${p1Name}(${p1Affiliation})</span> <span style="white-space: nowrap;">${p2Name}(${p2Affiliation})</span>`);
                        }
                    });
                    
                    printContent += `
                        <tbody style="page-break-inside: avoid;">
                            <tr>
                                <td style="background-color: #e0f2fe; padding: 12px; border: 1px solid #e2e8f0; text-align: center; font-weight: 800; color: #0369a1; white-space: nowrap;">${jo}</td>
                                <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; min-height: 35px;">${membersList.join('   ')}</td>
                            </tr>
                        </tbody>
                    `;
                });
                
                printContent += `
                        </table>
                    </div>
                `;
            });
            
            // 인쇄 창 열기
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                toast({ title: '인쇄 실패', description: '팝업이 차단되었습니다.', variant: 'destructive' });
                setIsDownloadingRoster(false);
                return;
            }
            
            const paperSize = rosterDownloadModal.paperSize || 'A4';
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>${tournamentName} 조편성표</title>
                    <style>
                        @media print {
                            @page {
                                size: ${paperSize};
                                margin: 1cm;
                            }
                            tbody {
                                page-break-inside: avoid;
                            }
                        }
                        body {
                            font-family: 'Pretendard', 'Malgun Gothic', sans-serif;
                            padding: 20px;
                        }
                    </style>
                </head>
                <body>
                    ${printContent}
                </body>
                </html>
            `;
            
            printWindow.document.write(fullHtml);
            printWindow.document.close();
            printWindow.focus();
            
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
            
            setRosterDownloadModal({ ...rosterDownloadModal, open: false });
            toast({ title: '인쇄 준비 완료', description: '인쇄 다이얼로그가 열립니다.' });
            
        } catch (error) {
            console.error('인쇄 실패:', error);
            toast({ 
                title: "인쇄 실패", 
                description: "인쇄 중 오류가 발생했습니다.", 
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
                                    onClick={() => handleOpenRosterDownloadModal('individual')}
                                    disabled={allPlayers.filter((p: any) => p.type === 'individual').length === 0}
                                >
                                    <FileDown className="mr-2 h-4 w-4" /> 
                                    조 편성표 다운
                                </Button>
                                <input type="file" ref={setIndividualFileInput} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'individual')} />
                            </CardContent>
                        </Card>
                        <Card className="bg-blue-50 border-blue-200">
                            <CardHeader>
                                <CardTitle className="text-lg">조 재편성 일괄 등록</CardTitle>
                                <CardDescription className="text-sm text-muted-foreground">
                                    기존 선수들의 조 번호만 업데이트합니다. 조별 인원 제한 검증은 엑셀 파일의 새 조 편성만 검증합니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col sm:flex-row gap-4">
                                <Button 
                                    variant="default" 
                                    className="bg-orange-600 hover:bg-orange-700 text-white"
                                    onClick={() => individualReorganizeFileInput?.click()}
                                >
                                    <Upload className="mr-2 h-4 w-4" /> 조 재편성 엑셀 파일 업로드
                                </Button>
                                <Button 
                                    variant="default" 
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => handleDownloadReorganizeTemplate('individual')}
                                >
                                    <Download className="mr-2 h-4 w-4" /> 조 재편성용 다운
                                </Button>
                                <input type="file" ref={setIndividualReorganizeFileInput} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleReorganizeFileUpload(e, 'individual')} />
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
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>등록된 개인전 선수 목록</CardTitle>
                                        <CardDescription>
                                            총 {individualPlayersCount}명의 개인전 선수가 등록되었습니다.
                                            {Object.keys(groupedIndividualPlayers).length > 0 && ` (${Object.entries(groupedIndividualPlayers).map(([group, players]) => `${group}: ${players.length}명`).join(', ')})`}
                                        </CardDescription>
                                    </div>
                                    <Button 
                                        onClick={() => handleCheckAllJos('individual')}
                                        className="bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        <Check className="mr-2 h-4 w-4" />
                                        필수: 조 이동 후 최대 인원확인
                                    </Button>
                                </div>
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
                                                            <Button 
                                                                variant="outline" 
                                                                size="icon" 
                                                                onClick={() => setJoMoveModal({ 
                                                                    open: true, 
                                                                    playerId: p.id, 
                                                                    currentJo: p.jo?.toString() || '', 
                                                                    currentGroup: p.group || '', 
                                                                    isNewJo: false 
                                                                })}
                                                            >
                                                                <Users className="h-4 w-4" />
                                                            </Button>
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
                                    onClick={() => handleOpenRosterDownloadModal('team')}
                                    disabled={allPlayers.filter((p: any) => p.type === 'team').length === 0}
                                >
                                    <FileDown className="mr-2 h-4 w-4" /> 
                                    조 편성표 다운
                                </Button>
                                <input type="file" ref={setTeamFileInput} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'team')} />
                            </CardContent>
                        </Card>
                        <Card className="bg-blue-50 border-blue-200">
                            <CardHeader>
                                <CardTitle className="text-lg">조 재편성 일괄 등록</CardTitle>
                                <CardDescription className="text-sm text-muted-foreground">
                                    기존 선수들의 조 번호만 업데이트합니다. 조별 인원 제한 검증은 엑셀 파일의 새 조 편성만 검증합니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col sm:flex-row gap-4">
                                <Button 
                                    variant="default" 
                                    className="bg-orange-600 hover:bg-orange-700 text-white"
                                    onClick={() => teamReorganizeFileInput?.click()}
                                >
                                    <Upload className="mr-2 h-4 w-4" /> 조 재편성 엑셀 파일 업로드
                                </Button>
                                <Button 
                                    variant="default" 
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => handleDownloadReorganizeTemplate('team')}
                                >
                                    <Download className="mr-2 h-4 w-4" /> 조 재편성용 다운
                                </Button>
                                <input type="file" ref={setTeamReorganizeFileInput} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleReorganizeFileUpload(e, 'team')} />
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
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>등록된 2인 1팀 목록</CardTitle>
                                        <CardDescription>
                                            총 {teamPlayersCount}개의 팀이 등록되었습니다.
                                            {Object.keys(groupedTeamPlayers).length > 0 && ` (${Object.entries(groupedTeamPlayers).map(([group, players]) => `${group}: ${players.length}팀`).join(', ')})`}
                                        </CardDescription>
                                    </div>
                                    <Button 
                                        onClick={() => handleCheckAllJos('team')}
                                        className="bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        <Check className="mr-2 h-4 w-4" />
                                        필수: 조 이동 후 최대 인원확인
                                    </Button>
                                </div>
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
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Button variant="ghost" size="sm" onClick={() => handleEditClick(t)}><Edit className="w-4 h-4" /></Button>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="sm" 
                                                                    onClick={() => setJoMoveModal({ 
                                                                        open: true, 
                                                                        playerId: t.id, 
                                                                        currentJo: t.jo?.toString() || '', 
                                                                        currentGroup: t.group || '', 
                                                                        isNewJo: false 
                                                                    })}
                                                                >
                                                                    <Users className="w-4 h-4" />
                                                                </Button>
                                                                <Button variant="ghost" size="sm" onClick={() => handleDeletePlayer(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                                            </div>
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

        {/* 조 편성표 다운로드 모달 (기존 코드와 완전히 분리) */}
        <Dialog open={rosterDownloadModal.open} onOpenChange={(open) => setRosterDownloadModal({ ...rosterDownloadModal, open })}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>📋 조 편성표 다운로드 설정</DialogTitle>
                    <DialogDescription>
                        각 그룹별로 일정과 코스를 지정한 후 이미지 다운로드 또는 인쇄를 진행하세요.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                    <Tabs defaultValue={groupList.filter((g: any) => g.type === rosterDownloadModal.type)[0]?.name || ''}>
                        <TabsList className="grid w-full grid-cols-auto gap-2 overflow-x-auto">
                            {groupList
                                .filter((g: any) => g.type === rosterDownloadModal.type)
                                .map((group: any) => (
                                    <TabsTrigger key={group.name} value={group.name} className="whitespace-nowrap">
                                        {group.name}
                                    </TabsTrigger>
                                ))}
                        </TabsList>
                        
                        {groupList
                            .filter((g: any) => g.type === rosterDownloadModal.type)
                            .map((group: any) => {
                                const groupName = group.name;
                                const currentSettings = rosterDownloadModal.groupSettings[groupName] || { date: '', courses: [] };
                                
                                return (
                                    <TabsContent key={groupName} value={groupName} className="space-y-4">
                                        <div className="space-y-4 p-4 border rounded-lg bg-blue-50/50">
                                            <div className="mb-4 pb-3 border-b">
                                                <h3 className="text-lg font-bold text-primary">{groupName} 그룹 설정</h3>
                                                <p className="text-sm text-muted-foreground mt-1">이 그룹만의 일정과 코스를 설정합니다.</p>
                                            </div>
                                            <div>
                                                <Label htmlFor={`date-${groupName}`} className="text-base font-semibold">
                                                    📅 일정 <span className="text-sm font-normal text-muted-foreground">(Schedule)</span>
                                                </Label>
                                                <Input
                                                    id={`date-${groupName}`}
                                                    type="date"
                                                    value={currentSettings.date}
                                                    onChange={(e) => {
                                                        setRosterDownloadModal({
                                                            ...rosterDownloadModal,
                                                            groupSettings: {
                                                                ...rosterDownloadModal.groupSettings,
                                                                [groupName]: {
                                                                    ...currentSettings,
                                                                    date: e.target.value
                                                                }
                                                            }
                                                        });
                                                    }}
                                                    className="mt-2"
                                                />
                                            </div>
                                            
                                            <div>
                                                <Label className="text-base font-semibold mb-2 block">
                                                    ⛳ 코스 선택 (복수 선택 가능) <span className="text-sm font-normal text-muted-foreground">(Course Selection - Multiple Selection Available)</span>
                                                </Label>
                                                {currentSettings.courses.length > 0 && (
                                                    <div className="text-sm text-muted-foreground mb-2">
                                                        선택 순서: {currentSettings.courses.map((cid: string) => {
                                                            const course = courses.find((c: any) => c.id === cid);
                                                            return course?.name || cid;
                                                        }).join(' → ')}
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                                                    {courses.map((course: any) => {
                                                        const isSelected = currentSettings.courses.includes(course.id);
                                                        return (
                                                            <div key={course.id} className="flex items-center space-x-2">
                                                                <Checkbox
                                                                    id={`course-${groupName}-${course.id}`}
                                                                    checked={isSelected}
                                                                    onCheckedChange={(checked) => {
                                                                        const newCourses = checked
                                                                            ? [...currentSettings.courses, course.id]
                                                                            : currentSettings.courses.filter((cid: string) => cid !== course.id);
                                                                        setRosterDownloadModal({
                                                                            ...rosterDownloadModal,
                                                                            groupSettings: {
                                                                                ...rosterDownloadModal.groupSettings,
                                                                                [groupName]: {
                                                                                    ...currentSettings,
                                                                                    courses: newCourses
                                                                                }
                                                                            }
                                                                        });
                                                                    }}
                                                                />
                                                                <Label
                                                                    htmlFor={`course-${groupName}-${course.id}`}
                                                                    className="text-sm font-normal cursor-pointer"
                                                                >
                                                                    {course.name}
                                                                </Label>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {courses.length === 0 && (
                                                    <p className="text-sm text-muted-foreground mt-2">
                                                        코스가 없습니다. 코스 관리 페이지에서 코스를 먼저 추가해주세요.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </TabsContent>
                                );
                            })}
                    </Tabs>
                </div>
                
                <div className="mb-4 p-4 border rounded-lg bg-gray-50">
                    <Label className="text-base font-semibold mb-2 block">
                        📄 용지 크기 <span className="text-sm font-normal text-muted-foreground">(Paper Size)</span>
                    </Label>
                    <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                            <input
                                type="radio"
                                id="paper-a4"
                                name="paperSize"
                                value="A4"
                                checked={rosterDownloadModal.paperSize === 'A4'}
                                onChange={(e) => setRosterDownloadModal({ ...rosterDownloadModal, paperSize: e.target.value as 'A4' | 'A3' })}
                                className="w-4 h-4"
                            />
                            <Label htmlFor="paper-a4" className="text-sm font-normal cursor-pointer">A4 (210mm × 297mm)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                type="radio"
                                id="paper-a3"
                                name="paperSize"
                                value="A3"
                                checked={rosterDownloadModal.paperSize === 'A3'}
                                onChange={(e) => setRosterDownloadModal({ ...rosterDownloadModal, paperSize: e.target.value as 'A4' | 'A3' })}
                                className="w-4 h-4"
                            />
                            <Label htmlFor="paper-a3" className="text-sm font-normal cursor-pointer">A3 (297mm × 420mm)</Label>
                        </div>
                    </div>
                </div>
                
                <DialogFooter className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setRosterDownloadModal({ ...rosterDownloadModal, open: false })}
                    >
                        취소
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handlePrintRosterWithSettings}
                        disabled={isDownloadingRoster}
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        인쇄
                    </Button>
                    <Button
                        onClick={handleDownloadRosterWithSettings}
                        disabled={isDownloadingRoster}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        {isDownloadingRoster ? '생성 중...' : '이미지 다운로드'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* 조 이동 모달 */}
        <Dialog open={joMoveModal.open} onOpenChange={(open) => {
            if (!open) {
                setJoMoveModal({ open: false, playerId: null, currentJo: '', currentGroup: '', isNewJo: false });
            }
        }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>조 이동</DialogTitle>
                    <DialogDescription>선수를 다른 조로 이동시킵니다.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>그룹</Label>
                        <Select 
                            value={joMoveModal.currentGroup || undefined} 
                            onValueChange={(value) => {
                                // 그룹 변경 시 조 선택 초기화
                                setJoMoveModal({ ...joMoveModal, currentGroup: value, currentJo: '', isNewJo: false });
                            }}
                        >
                            <SelectTrigger><SelectValue placeholder="그룹 선택" /></SelectTrigger>
                            <SelectContent>
                                {groupNameList.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>이동할 조 선택</Label>
                        {joMoveModal.currentGroup ? (
                            <>
                                {availableJosForMove.length > 0 ? (
                                    <Select 
                                        value={joMoveModal.isNewJo ? '__new__' : (joMoveModal.currentJo || undefined)} 
                                        onValueChange={(value) => {
                                            if (value === '__new__') {
                                                // 새 조 만들기 선택 시 Input 표시
                                                setJoMoveModal({ ...joMoveModal, currentJo: '', isNewJo: true });
                                            } else {
                                                setJoMoveModal({ ...joMoveModal, currentJo: value, isNewJo: false });
                                            }
                                        }}
                                    >
                                        <SelectTrigger><SelectValue placeholder="조 선택" /></SelectTrigger>
                                        <SelectContent>
                                            {availableJosForMove.map(jo => (
                                                <SelectItem key={jo} value={jo}>{jo}조</SelectItem>
                                            ))}
                                            <SelectItem value="__new__">+ 새 조 만들기</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">이 그룹에는 조가 없습니다. 새 조를 만들어주세요.</p>
                                        <Input 
                                            value={joMoveModal.currentJo} 
                                            onChange={(e) => setJoMoveModal({ ...joMoveModal, currentJo: e.target.value, isNewJo: true })}
                                            placeholder="새 조 이름 입력 (예: 1, A-1)"
                                        />
                                    </div>
                                )}
                                {joMoveModal.isNewJo && availableJosForMove.length > 0 && (
                                    <Input 
                                        value={joMoveModal.currentJo} 
                                        onChange={(e) => setJoMoveModal({ ...joMoveModal, currentJo: e.target.value })}
                                        placeholder="새 조 이름 입력 (예: 1, A-1)"
                                        className="mt-2"
                                    />
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">먼저 그룹을 선택해주세요.</p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">취소</Button>
                    </DialogClose>
                    <Button 
                        onClick={() => {
                            if (!joMoveModal.playerId) {
                                toast({ title: '오류', description: '선수 정보가 없습니다.', variant: 'destructive' });
                                return;
                            }
                            if (!joMoveModal.currentGroup) {
                                toast({ title: '오류', description: '그룹을 선택해주세요.', variant: 'destructive' });
                                return;
                            }
                            if (!joMoveModal.currentJo || joMoveModal.currentJo.trim() === '') {
                                toast({ title: '오류', description: '조를 선택하거나 입력해주세요.', variant: 'destructive' });
                                return;
                            }
                            handleMovePlayerJo(
                                joMoveModal.playerId, 
                                joMoveModal.currentJo.trim(), 
                                joMoveModal.currentGroup
                            );
                            setJoMoveModal({ open: false, playerId: null, currentJo: '', currentGroup: '', isNewJo: false });
                        }}
                    >
                        이동
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* 조별 인원 초과 경고 모달 */}
        <AlertDialog open={joLimitWarningModal.open} onOpenChange={(open) => {
            if (!open) {
                setJoLimitWarningModal({ open: false, type: 'individual', overList: [] });
            }
        }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>조별 인원 초과</AlertDialogTitle>
                    <AlertDialogDescription>
                        <div className="space-y-2">
                            <p>다음 조들이 인원 제한을 초과했습니다:</p>
                            <ul className="list-disc list-inside mt-2 space-y-1 max-h-60 overflow-y-auto">
                                {joLimitWarningModal.overList.map((item, idx) => (
                                    <li key={idx} className="text-destructive font-medium">{item}</li>
                                ))}
                            </ul>
                            <p className="mt-4">조를 조정하여 모든 조가 {joLimitWarningModal.type === 'individual' ? '4명' : '2팀'} 이하가 되도록 해주세요.</p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={() => setJoLimitWarningModal({ open: false, type: 'individual', overList: [] })}>
                        확인
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </div>
  )
}
