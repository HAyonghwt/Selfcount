"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { loginWithKoreanId } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function SelfScoringLoginPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [loginLoading, setLoginLoading] = useState(false);
    const [koreanId, setKoreanId] = useState('');
    const [password, setPassword] = useState('');
    const [gameMode, setGameMode] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [selectedCourse, setSelectedCourse] = useState('');
    const [groups, setGroups] = useState<any>({});
    const [courses, setCourses] = useState<any>({});
    const [userDomain, setUserDomain] = useState('');

    useEffect(() => {
        if (!db) return;
        
        const configRef = ref(db, 'config');
        const tournamentRef = ref(db, 'tournaments/current');

        const unsubConfig = onValue(configRef, (snapshot) => {
            const data = snapshot.val() || {};
            setUserDomain(data.userDomain || 'parkgolf.com');
            setLoading(false);
        });

        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setGroups(data.groups || {});
            setCourses(data.courses || {});
        });

        return () => {
            unsubConfig();
            unsubTournament();
        };
    }, []);

    const handleLogin = async () => {
        if (!koreanId || !password) {
            toast({
                title: '로그인 실패',
                description: '아이디와 비밀번호를 입력해주세요.',
                variant: 'destructive',
            });
            return;
        }

        // 한글 아이디 형식 검증 (조장1, 조장2, ... 형식)
        const koreanIdPattern = /^조장\d+$/;
        if (!koreanIdPattern.test(koreanId)) {
            toast({
                title: '로그인 실패',
                description: '올바른 아이디 형식이 아닙니다. (예: 조장1, 조장2, ...)',
                variant: 'destructive',
            });
            return;
        }

        setLoginLoading(true);
        try {
            // Firestore 기반 한글 아이디 로그인
            const captainData = await loginWithKoreanId(koreanId, password);
            
            // 로그인 성공 시 세션에 저장
            sessionStorage.setItem('selfScoringCaptain', JSON.stringify(captainData));
            
            toast({
                title: '로그인 성공',
                description: '자율채점 페이지로 이동합니다.',
            });

            // 경기방식과 그룹/코스 선택 페이지로 이동
            router.push('/self-scoring/game');
        } catch (error: any) {
            let errorMessage = '로그인 중 오류가 발생했습니다.';
            if (error.message) {
                errorMessage = error.message;
            }
            toast({
                title: '로그인 실패',
                description: errorMessage,
                variant: 'destructive',
            });
        } finally {
            setLoginLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle><Skeleton className="h-6 w-32" /></CardTitle>
                        <CardDescription><Skeleton className="h-4 w-48" /></CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold text-center">자율채점 조장 로그인</CardTitle>
                    <CardDescription className="text-center">
                        자율채점 조장 계정으로 로그인하여 점수를 입력하세요.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="koreanId">아이디</Label>
                        <Input
                            id="koreanId"
                            type="text"
                            placeholder="조장1"
                            value={koreanId}
                            onChange={(e) => setKoreanId(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                        />
                        <p className="text-xs text-muted-foreground">
                            형식: 조장1, 조장2, 조장3, ... (조장1~조장100)
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">비밀번호</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="비밀번호 입력"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                        />
                    </div>
                    <Button 
                        onClick={handleLogin} 
                        disabled={loginLoading}
                        className="w-full"
                    >
                        {loginLoading ? '로그인 중...' : '로그인'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
