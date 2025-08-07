"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db, auth } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function SelfScoringLoginPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [loginLoading, setLoginLoading] = useState(false);
    const [email, setEmail] = useState('');
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
        if (!email || !password) {
            toast({
                title: '로그인 실패',
                description: '이메일과 비밀번호를 입력해주세요.',
                variant: 'destructive',
            });
            return;
        }

        // 이메일 형식 검증 (player1@yongin.com 형식)
        const emailPattern = /^player\d+@yongin\.com$/;
        if (!emailPattern.test(email)) {
            toast({
                title: '로그인 실패',
                description: '올바른 이메일 형식이 아닙니다. (예: player1@yongin.com)',
                variant: 'destructive',
            });
            return;
        }

        setLoginLoading(true);
        try {
            // Firebase Authentication을 사용한 로그인
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            if (user) {
                // 로그인 성공 시 세션에 저장
                sessionStorage.setItem('selfScoringCaptain', email);
                
                toast({
                    title: '로그인 성공',
                    description: '자율채점 페이지로 이동합니다.',
                });

                // 경기방식과 그룹/코스 선택 페이지로 이동
                router.push('/self-scoring/game');
            }
        } catch (authError: any) {
            let errorMessage = '로그인 중 오류가 발생했습니다.';
            switch (authError.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    errorMessage = '잘못된 이메일 또는 비밀번호입니다.';
                    break;
                case 'auth/user-disabled':
                    errorMessage = '이 사용자 계정은 비활성화되었습니다.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = '유효하지 않은 이메일 주소 형식입니다.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';
                    break;
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
                        <Label htmlFor="email">이메일</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder={`player1@${userDomain}`}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                        />
                        <p className="text-xs text-muted-foreground">
                            형식: player1@{userDomain}, player2@{userDomain}, ...
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
