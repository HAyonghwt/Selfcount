"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function SelfScoringGameSetupPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [gameMode, setGameMode] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [selectedJo, setSelectedJo] = useState('');
    const [groupsData, setGroupsData] = useState<any>({});
    const [captainEmail, setCaptainEmail] = useState('');

    useEffect(() => {
        // 로그인 상태 확인
        const loggedInCaptain = sessionStorage.getItem('selfScoringCaptain');
        if (!loggedInCaptain) {
            router.push('/self-scoring');
            return;
        }
        setCaptainEmail(loggedInCaptain);

        // Firebase 데이터 로드 (심판 페이지와 동일한 방식)
        setLoading(true);
        const dbInstance = db as import('firebase/database').Database;
        const tournamentRef = ref(dbInstance, 'tournaments/current');

        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            console.log('Firebase 데이터:', data);
            console.log('그룹 데이터:', data.groups);
            setGroupsData(data.groups || {});
            setLoading(false);
        });

        return () => {
            unsubTournament();
        };
    }, [router]);

    // 자율채점에서는 아이디에 따라 조 범위를 제한
    const availableGroups = useMemo(() => {
        const allGroups = Object.values(groupsData)
            .map((g: any) => g.name)
            .filter(Boolean)
            .sort();
        
        // 아이디에서 번호 추출 (player1@yongin.com -> 1)
        const playerNumber = parseInt(captainEmail.match(/player(\d+)@/)?.[1] || '1');
        
        // 각 아이디당 10개 조씩 할당
        const startGroup = (playerNumber - 1) * 10 + 1;
        const endGroup = playerNumber * 10;
        
        // 조 이름에서 숫자 추출 (다양한 형식 지원)
        return allGroups.filter(group => {
            // "1조", "A조", "1", "A" 등 다양한 형식 지원
            const groupNumber = parseInt(group.match(/(\d+)/)?.[1] || '0');
            if (groupNumber > 0) {
                return groupNumber >= startGroup && groupNumber <= endGroup;
            }
            
            // 숫자가 없는 경우 (A조, B조 등) 모든 그룹 허용
            return true;
        });
    }, [groupsData, captainEmail]);

    // 선택된 그룹에 해당하는 조 목록 계산
    const availableJos = useMemo(() => {
        if (!selectedGroup) return [];
        
        // 아이디에서 번호 추출 (player1@yongin.com -> 1)
        const playerNumber = parseInt(captainEmail.match(/player(\d+)@/)?.[1] || '1');
        
        // 각 아이디당 10개 조씩 할당
        const startGroup = (playerNumber - 1) * 10 + 1;
        const endGroup = playerNumber * 10;
        
        // 1부터 100까지의 조 번호 생성 (실제로는 더 많을 수 있음)
        const allJos = Array.from({ length: 100 }, (_, i) => (i + 1).toString());
        
        return allJos.filter(jo => {
            const joNumber = parseInt(jo);
            return joNumber >= startGroup && joNumber <= endGroup;
        });
    }, [selectedGroup, captainEmail]);

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

        // 점수 입력 페이지로 이동
        router.push('/self-scoring/scoring');
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
            <div className="min-h-screen bg-slate-100 p-4">
                <div className="max-w-2xl mx-auto space-y-6">
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
        <div className="min-h-screen bg-slate-100 p-4">
            <div className="max-w-2xl mx-auto space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold">자율채점 설정</CardTitle>
                        <CardDescription>
                            조장: {captainEmail} | 경기방식과 그룹/조를 선택하여 점수 입력을 시작하세요.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">경기방식</label>
                            <Select value={gameMode} onValueChange={(value) => {
                                setGameMode(value);
                                setSelectedGroup('');
                                setSelectedJo('');
                            }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="경기방식을 선택하세요" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="individual">개인전</SelectItem>
                                    <SelectItem value="team">2인1팀</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">그룹</label>
                            <Select value={selectedGroup} onValueChange={(value) => {
                                setSelectedGroup(value);
                                setSelectedJo('');
                            }} disabled={!gameMode}>
                                <SelectTrigger>
                                    <SelectValue placeholder={gameMode ? "그룹을 선택하세요" : "경기방식을 먼저 선택하세요"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableGroups.map(group => (
                                        <SelectItem key={group} value={group}>
                                            {group}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">조 선택</label>
                            <Select value={selectedJo} onValueChange={setSelectedJo} disabled={!selectedGroup}>
                                <SelectTrigger>
                                    <SelectValue placeholder={selectedGroup ? "조를 선택하세요" : "그룹을 먼저 선택하세요"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableJos.map(jo => (
                                        <SelectItem key={jo} value={jo}>
                                            {jo}조
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex gap-4 pt-4">
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
        </div>
    );
}
