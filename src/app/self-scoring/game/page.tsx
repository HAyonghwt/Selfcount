"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function SelfScoringGameSetupPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [gameMode, setGameMode] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [selectedJo, setSelectedJo] = useState('');
    const [groupsData, setGroupsData] = useState<any>({});
    const [courses, setCourses] = useState<any[]>([]);
    const [allPlayers, setAllPlayers] = useState<any[]>([]);
    const [activeCourseTab, setActiveCourseTab] = useState<string>('');
    const [captainData, setCaptainData] = useState<any>(null);
    // 뒤로가기 확인
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const exitGuardRef = React.useRef(false);

    useEffect(() => {
        // 로그인 상태 확인
        const loggedInCaptain = sessionStorage.getItem('selfScoringCaptain');
        if (!loggedInCaptain) {
            router.push('/self-scoring');
            return;
        }
        
        try {
            const captain = JSON.parse(loggedInCaptain);
            setCaptainData(captain);
        } catch (error) {
            console.error('조장 데이터 파싱 오류:', error);
            router.push('/self-scoring');
            return;
        }

        // Firebase 데이터 로드 (심판 페이지와 동일한 방식)
        setLoading(true);
        const dbInstance = db as import('firebase/database').Database;
        const tournamentRef = ref(dbInstance, 'tournaments/current');
        const playersRef = ref(dbInstance, 'players');

        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            console.log('Firebase 데이터:', data);
            console.log('그룹 데이터:', data.groups);
            setGroupsData(data.groups || {});
            setCourses(data.courses ? Object.values(data.courses) : []);
            setLoading(false);
        });

        const unsubPlayers = onValue(playersRef, (snapshot) => {
            const data = snapshot.val();
            setAllPlayers(data ? Object.entries(data).map(([id, player]) => ({ id, ...(player as any) })) : []);
        });

        return () => {
            unsubTournament();
            unsubPlayers();
        };
    }, [router]);

    // 모바일/브라우저 뒤로가기 시 확인창 표시
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const onPopState = (e: PopStateEvent) => {
            if (exitGuardRef.current) return;
            setShowLeaveConfirm(true);
            // 현재 페이지를 유지하기 위해 다시 push
            window.history.pushState(null, '', window.location.href);
        };
        window.addEventListener('popstate', onPopState);
        // 초기 더미 state 추가
        window.history.pushState(null, '', window.location.href);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // 자율채점에서는 아이디에 따라 조 범위를 제한
    const availableGroups = useMemo(() => {
        // 그룹은 객체 형태: { [groupName]: { name, type, courses, ... } }
        const entries = Object.entries(groupsData || {});
        const filteredByMode = entries
            .filter(([_, g]: any) => !gameMode || g?.type === gameMode)
            .map(([key, g]: any) => g?.name || key)
            .filter(Boolean) as string[];

        const allGroups = filteredByMode.sort();

        // 조장 데이터에서 조 번호 추출
        const captainJo = captainData?.jo || 1;
        const startGroup = Math.floor((captainJo - 1) / 10) * 10 + 1;
        const endGroup = Math.min(startGroup + 9, 100);

        // 조 이름에서 숫자 추출(다양한 형식 지원) + 범위 필터
        return allGroups.filter(group => {
            const groupNumber = parseInt(group.match(/(\d+)/)?.[1] || '0');
            if (groupNumber > 0) {
                return groupNumber >= startGroup && groupNumber <= endGroup;
            }
            return true;
        });
    }, [groupsData, captainData, gameMode]);

    // 선택된 그룹에 해당하는 조 목록 계산
    const availableJos = useMemo(() => {
        if (!selectedGroup) return [];
        
        // 조장 데이터에서 조 번호 추출
        const captainJo = captainData?.jo || 1;
        const startGroup = Math.floor((captainJo - 1) / 10) * 10 + 1;
        const endGroup = Math.min(startGroup + 9, 100);
        
        // 1부터 100까지의 조 번호 생성 (실제로는 더 많을 수 있음)
        const allJos = Array.from({ length: 100 }, (_, i) => (i + 1).toString());
        
        return allJos.filter(jo => {
            const joNumber = parseInt(jo);
            return joNumber >= startGroup && joNumber <= endGroup;
        });
    }, [selectedGroup, captainData]);

    // 선택된 그룹의 배정 코스 목록 계산 (활성 코스만)
    const assignedCourseList = useMemo(() => {
        if (!selectedGroup) return [] as any[];
        const map = groupsData?.[selectedGroup]?.courses || {};
        const ids = Object.entries(map)
            .filter(([_, v]) => !!v)
            .map(([id]) => Number(id));
        return courses
            .filter((c: any) => ids.includes(Number(c.id)) && (c.isActive !== false))
            .sort((a: any, b: any) => Number(a.id) - Number(b.id));
    }, [groupsData, courses, selectedGroup]);

    // 조원 목록 계산 (경기방식에 따라 필드가 다름)
    const joMembers = useMemo(() => {
        if (!selectedGroup || !selectedJo) return [] as string[];
        if (gameMode === 'team') {
            const teams = allPlayers.filter((p: any) => p.type === 'team' && p.group === selectedGroup && String(p.jo) === String(selectedJo));
            const names: string[] = [];
            teams.forEach((t: any) => {
                if (t.p1_name) names.push(t.p1_name);
                if (t.p2_name) names.push(t.p2_name);
            });
            return names;
        }
        // default: individual
        return allPlayers
            .filter((p: any) => p.type === 'individual' && p.group === selectedGroup && String(p.jo) === String(selectedJo))
            .map((p: any) => p.name)
            .filter(Boolean);
    }, [allPlayers, gameMode, selectedGroup, selectedJo]);

    // 테마색 순환: 빨강, 파랑, 노랑, 아이보리
    const themeForIndex = (index: number) => {
        const cycle = [
            { bg: '#ffebee', fg: '#b71c1c', ring: '#ef9a9a' },
            { bg: '#e3f2fd', fg: '#0d47a1', ring: '#90caf9' },
            { bg: '#fff8e1', fg: '#f57f17', ring: '#ffe082' },
            { bg: '#fffaf0', fg: '#6b4f1d', ring: '#f3e8c9' },
        ];
        return cycle[index % cycle.length];
    };

    // 코스 탭 기본값 설정
    useEffect(() => {
        if (assignedCourseList.length > 0) {
            setActiveCourseTab(String(assignedCourseList[0].id));
        } else {
            setActiveCourseTab('');
        }
    }, [assignedCourseList]);

    const handleStartScoring = () => {
        if (!gameMode || !selectedGroup || !selectedJo) {
            toast({
                title: '설정 오류',
                description: '경기방식, 그룹, 조를 모두 선택해주세요.',
                variant: 'destructive',
            });
            return;
        }

        // 선택한 정보를 세션에 저장
        sessionStorage.setItem('selfScoringGameMode', gameMode);
        sessionStorage.setItem('selfScoringGroup', selectedGroup);
        sessionStorage.setItem('selfScoringJo', selectedJo);

        // 조원 이름을 스코어 시트에 전달 (최대 4명, 부족하면 플레이스홀더)
        const names = [...joMembers].slice(0, 4);
        while (names.length < 4) names.push(`이름${names.length + 1}`);
        try {
            sessionStorage.setItem('selfScoringNames', JSON.stringify(names));
            // 선택된 그룹에 배정된 코스 목록(이름, pars) 전달
            const courseTabs = assignedCourseList.map((c: any) => ({ id: String(c.id), name: c.name, pars: c.pars }));
            sessionStorage.setItem('selfScoringCourses', JSON.stringify(courseTabs));
            if (courseTabs.length > 0) sessionStorage.setItem('selfScoringActiveCourseId', String(courseTabs[0].id));
        } catch {}

        // 점수 입력 페이지를 새창으로 열기
        if (typeof window !== 'undefined') {
            window.open('/self-scoring/scoring', '_blank');
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('selfScoringCaptain');
        sessionStorage.removeItem('selfScoringGameMode');
        sessionStorage.removeItem('selfScoringGroup');
        sessionStorage.removeItem('selfScoringJo');
        router.push('/self-scoring');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 p-2 sm:p-4">
                <div className="max-w-lg mx-auto space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle><Skeleton className="h-6 w-32" /></CardTitle>
                            <CardDescription><Skeleton className="h-4 w-48" /></CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-12" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                            <Skeleton className="h-10 w-full" />
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 p-2 sm:p-4">
            <div className="max-w-lg mx-auto space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold">자율채점 설정</CardTitle>
                        <CardDescription>
                            조장: {captainData?.id || '알 수 없음'} | 경기방식과 그룹/조를 선택하여 점수 입력을 시작하세요.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 sm:space-y-6">
                        <div className="space-y-2">
                            <label className="text-base font-bold">경기방식</label>
                            <Select value={gameMode} onValueChange={(value) => {
                                setGameMode(value);
                                setSelectedGroup('');
                                setSelectedJo('');
                            }}>
                                <SelectTrigger className="text-base">
                                    <SelectValue placeholder="경기방식을 선택하세요" />
                                </SelectTrigger>
                                <SelectContent position="popper" className="max-h-[60vh] overflow-y-auto">
                                    <SelectItem value="individual">개인전</SelectItem>
                                    <SelectItem value="team">2인1팀</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-base font-bold">그룹</label>
                            <Select value={selectedGroup} onValueChange={(value) => {
                                setSelectedGroup(value);
                                setSelectedJo('');
                            }} disabled={!gameMode}>
                                <SelectTrigger className="text-base">
                                    <SelectValue placeholder={gameMode ? "그룹을 선택하세요" : "경기방식을 먼저 선택하세요"} />
                                </SelectTrigger>
                                <SelectContent position="popper" className="max-h-[60vh] overflow-y-auto">
                                    {availableGroups.map(group => (
                                        <SelectItem key={group} value={group}>
                                            {group}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-base font-bold">조 선택</label>
                            <Select value={selectedJo} onValueChange={setSelectedJo} disabled={!selectedGroup}>
                                <SelectTrigger className="text-base">
                                    <SelectValue placeholder={selectedGroup ? "조를 선택하세요" : "그룹을 먼저 선택하세요"} />
                                </SelectTrigger>
                                <SelectContent position="popper" className="max-h-[60vh] overflow-y-auto">
                                    {availableJos.map(jo => (
                                        <SelectItem key={jo} value={jo}>
                                            {jo}조
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 선택된 그룹/조 기준 조원 표시 */}
                        {selectedGroup && selectedJo && assignedCourseList.length > 0 && (
                            <Card>
                                <CardContent className="p-3 sm:p-6">
                                    <div className="text-base sm:text-lg break-keep">
                                        {joMembers.length > 0 ? joMembers.join(', ') : '등록된 조원이 없습니다.'}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <div className="flex gap-3 sm:gap-4 pt-3 sm:pt-4 sticky bottom-2 z-10 bg-slate-100/80 backdrop-blur rounded-xl p-2">
                            <Button 
                                onClick={handleStartScoring}
                                disabled={!gameMode || !selectedGroup || !selectedJo}
                                className="flex-1"
                            >
                                점수기록 시작
                            </Button>
                            <Button 
                                onClick={handleLogout}
                                variant="outline"
                            >
                                로그아웃
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
            {/* 뒤로가기 확인 다이얼로그 */}
            <AlertDialog open={showLeaveConfirm} onOpenChange={(open) => { if (!open) setShowLeaveConfirm(false); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>이 페이지에서 나가시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            설정을 마치지 않았다면 취소를 눌러 계속 진행하세요.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowLeaveConfirm(false)}>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            exitGuardRef.current = true;
                            setShowLeaveConfirm(false);
                            try {
                                if (typeof window !== 'undefined') {
                                    if (window.history.length > 2) {
                                        window.history.go(-2);
                                    } else {
                                        window.location.href = '/self-scoring';
                                    }
                                }
                            } finally {
                                setTimeout(() => { exitGuardRef.current = false; }, 800);
                            }
                        }}>확인</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
