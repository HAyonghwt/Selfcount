"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginRefereeWithKoreanId } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { safeSessionStorageGetItem, safeSessionStorageSetItem } from '@/lib/utils';
import { ensureAuthenticated } from '@/lib/firebase';

export default function RefereeLoginPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [loginLoading, setLoginLoading] = useState(false);
    const [koreanId, setKoreanId] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        // Firebase 익명 인증 먼저 수행
        const initializeAuth = async () => {
            try {
                await ensureAuthenticated();
            } catch (error) {
                console.warn('Firebase 익명 인증 실패 (계속 진행):', error);
            }

            // 로그인 상태 확인
            const loggedInReferee = safeSessionStorageGetItem('refereeData');
            if (loggedInReferee) {
                try {
                    const referee = JSON.parse(loggedInReferee);
                    // 이미 로그인된 경우 즉시 이동
                    window.location.href = `/referee/${referee.hole}`;
                    return;
                } catch (error) {
                    console.error('심판 데이터 파싱 오류:', error);
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        };

        initializeAuth();
    }, [router]);

    const handleLogin = async () => {
        if (!koreanId || !password) {
            toast({
                title: '로그인 실패',
                description: '아이디와 비밀번호를 입력해주세요.',
                variant: 'destructive',
            });
            return;
        }

        // 한글 아이디 형식 검증 (1번홀심판, 1번홀심판1, 2번홀심판2, ... 형식)
        const koreanIdPattern = /^\d+번홀심판\d*$/;
        if (!koreanIdPattern.test(koreanId)) {
            toast({
                title: '로그인 실패',
                description: '올바른 아이디 형식이 아닙니다. (예: 1번홀심판, 1번홀심판1, 2번홀심판2, ...)',
                variant: 'destructive',
            });
            return;
        }

        setLoginLoading(true);
        try {
            // Firestore 접근 전에 익명 인증 먼저 수행
            const authenticated = await ensureAuthenticated();
            if (!authenticated) {
                toast({
                    title: '로그인 실패',
                    description: 'Firebase 인증에 실패했습니다. 페이지를 새로고침하고 다시 시도해주세요.',
                    variant: 'destructive',
                });
                setLoginLoading(false);
                return;
            }

            // Firestore 기반 한글 아이디 로그인
            const refereeData = await loginRefereeWithKoreanId(koreanId, password);
            
            // 로그인 성공 시 세션에 저장 (여러 번 시도)
            let saved = false;
            for (let i = 0; i < 5; i++) {
                saved = safeSessionStorageSetItem('refereeData', JSON.stringify(refereeData));
                if (saved) {
                    // 저장 성공 확인을 위해 읽기 테스트
                    const verify = safeSessionStorageGetItem('refereeData');
                    if (verify && verify === JSON.stringify(refereeData)) {
                        break;
                    }
                }
                // 저장 실패 시 잠시 대기 후 재시도
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (!saved) {
                // sessionStorage 저장 실패 시 URL 파라미터로 데이터 전달
                console.warn('sessionStorage 저장 실패, URL 파라미터로 데이터 전달');
                const encodedData = encodeURIComponent(JSON.stringify(refereeData));
                const targetUrl = `/referee/${refereeData.hole}?refereeData=${encodedData}`;
                window.location.href = targetUrl;
                return;
            }
            
            toast({
                title: '로그인 성공',
                description: '심판 페이지로 이동합니다.',
                duration: 500, // 짧게 표시
            });

            // 해당 홀의 심판 페이지로 즉시 이동 (window.location.href 사용)
            // router.replace보다 더 확실하게 작동
            const targetUrl = `/referee/${refereeData.hole}`;
            
            // sessionStorage 저장 확인 후 이동 (토스트 메시지 표시를 위해)
            setTimeout(() => {
                window.location.href = targetUrl;
            }, 500);
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
                    <CardTitle className="text-2xl font-bold text-center">심판 로그인</CardTitle>
                    <CardDescription className="text-center">
                        심판 계정으로 로그인하여 점수를 입력하세요.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="koreanId">아이디</Label>
                        <Input
                            id="koreanId"
                            type="text"
                            placeholder="1번홀심판 또는 1번홀심판1"
                            value={koreanId}
                            onChange={(e) => setKoreanId(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                        />
                        <p className="text-xs text-muted-foreground">
                            형식: 1번홀심판, 1번홀심판1, 2번홀심판2, ... (코스별 구분 가능)
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
