"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, EyeOff, Copy, Check, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getSelfScoringLogs, ScoreLog } from '@/lib/scoreLogs';
import { getCaptainAccounts } from '@/lib/auth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const MAX_CAPTAINS = 10;

export default function SelfScoringManagementPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [userDomain, setUserDomain] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [selfScoringLogs, setSelfScoringLogs] = useState<ScoreLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [captainAccounts, setCaptainAccounts] = useState<any[]>([]);
    const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});

    useEffect(() => {
        if (!db) return;
        
        // 자율채점 조장은 yongin.com 도메인 사용
        setUserDomain('yongin.com');
        setLoading(false);
    }, []);

    // 자율채점 로그 불러오기
    const loadSelfScoringLogs = async () => {
        setLogsLoading(true);
        try {
            const logs = await getSelfScoringLogs();
            setSelfScoringLogs(logs);
        } catch (error) {
            console.error('자율채점 로그 불러오기 오류:', error);
            toast({
                title: '로그 불러오기 실패',
                description: '자율채점 로그를 불러오는데 실패했습니다.',
                variant: 'destructive',
            });
        } finally {
            setLogsLoading(false);
        }
    };

    useEffect(() => {
        loadSelfScoringLogs();
    }, []);

    // 조장 계정 목록 불러오기
    useEffect(() => {
        const loadCaptainAccounts = async () => {
            try {
                const accounts = await getCaptainAccounts();
                setCaptainAccounts(accounts);
            } catch (error) {
                console.error('조장 계정 목록 불러오기 실패:', error);
            }
        };
        loadCaptainAccounts();
    }, []);

    // 모바일(iOS 사파리 포함)에서도 동작하도록 클립보드 복사 유틸
    const copyTextUniversal = async (text: string): Promise<boolean> => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch {}
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.top = '-1000px';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch {
            return false;
        }
    };

    const handleCopyUrl = async (index: number) => {
        const url = `${window.location.origin}/`;
        const ok = await copyTextUniversal(url);
        if (ok) {
            setCopiedIndex(index);
            toast({ title: '주소 복사 완료', description: '메인페이지 주소가 클립보드에 복사되었습니다.' });
            setTimeout(() => setCopiedIndex(null), 2000);
        } else {
            toast({ title: '복사 실패', description: '주소 복사에 실패했습니다. 주소를 길게 눌러 수동 복사해 주세요.', variant: 'destructive' });
        }
    };




    // 로그를 조장별로 그룹화
    const logsByCaptain = selfScoringLogs.reduce((acc, log) => {
        const captainEmail = log.captainEmail || log.modifiedBy;
        if (!acc[captainEmail]) {
            acc[captainEmail] = [];
        }
        acc[captainEmail].push(log);
        return acc;
    }, {} as { [key: string]: ScoreLog[] });

    if (loading) {
        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle><Skeleton className="h-6 w-48" /></CardTitle>
                        <CardDescription><Skeleton className="h-4 w-64" /></CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle><Skeleton className="h-6 w-40" /></CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-96 w-full" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold">자율채점 조장 관리</CardTitle>
                    <CardDescription>
                        자율채점 조장들의 아이디와 비밀번호를 확인합니다.
                        아래 메인페이지 주소를 조장에게 전달하고 조장1, 조장2 등으로 로그인 하게 합니다
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <Input
                            value={`${window.location.origin}/`}
                            readOnly
                            className="flex-1"
                        />
                        <Button onClick={() => handleCopyUrl(-1)}>
                            {copiedIndex === -1 ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            복사하기
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="accounts" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="accounts">조장 계정</TabsTrigger>
                    <TabsTrigger value="logs">점수 입력 내역</TabsTrigger>
                </TabsList>
                
                <TabsContent value="accounts">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">자율채점 조장 계정 목록</CardTitle>
                            <CardDescription>
                                조장 계정목록은 한개의 계정을 여러명의 조장이 사용해도 됩니다
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-16">번호</TableHead>
                                        <TableHead>조장용 아이디</TableHead>
                                        <TableHead className="w-32">비밀번호</TableHead>
                                        <TableHead className="w-24">복사</TableHead>
                                        <TableHead className="w-20">상태</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {captainAccounts.length > 0 ? (
                                        captainAccounts.map((account) => (
                                            <TableRow key={account.id} className={!account.isActive ? 'bg-gray-50' : ''}>
                                                <TableCell className="font-medium">{account.jo}번</TableCell>
                                                <TableCell className="font-mono">
                                                    {account.id}
                                                    {!account.isActive && <span className="ml-2 text-sm text-gray-500">(비활성화)</span>}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-2">
                                                        <span className="font-mono">
                                                            {showPasswords[account.id] ? account.password : '••••••'}
                                                        </span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setShowPasswords(prev => ({
                                                                ...prev,
                                                                [account.id]: !prev[account.id]
                                                            }))}
                                                        >
                                                            {showPasswords[account.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleCopyUrl(account.jo)}
                                                    >
                                                        {copiedIndex === account.jo ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                        account.isActive 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {account.isActive ? '활성' : '비활성'}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        Array.from({ length: 10 }, (_, i) => i + 1).map(number => (
                                            <TableRow key={number}>
                                                <TableCell className="font-medium">{number}번</TableCell>
                                                <TableCell className="font-mono">조장{number}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-2">
                                                        <span className="font-mono">••••••</span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                        미생성
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="logs">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">자율채점 점수 입력 내역</CardTitle>
                            <CardDescription>
                                조장들이 입력한 점수 내역을 확인할 수 있습니다.
                            </CardDescription>
                            <div className="flex justify-end">
                                <Button 
                                    onClick={loadSelfScoringLogs} 
                                    disabled={logsLoading}
                                    variant="outline"
                                    size="sm"
                                >
                                    <RefreshCw className={`h-4 w-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
                                    새로고침
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {logsLoading ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-full" />
                                </div>
                            ) : selfScoringLogs.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    아직 입력된 점수가 없습니다.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {Object.entries(logsByCaptain).map(([captainEmail, logs]) => (
                                        <div key={captainEmail} className="border rounded-lg p-4">
                                            <h3 className="font-semibold text-lg mb-3">{captainEmail}</h3>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>선수명</TableHead>
                                                        <TableHead>코스</TableHead>
                                                        <TableHead>홀</TableHead>
                                                        <TableHead>점수</TableHead>
                                                        <TableHead>입력시간</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {logs.map((log) => (
                                                        <TableRow key={log.id}>
                                                            <TableCell className="font-medium">{log.playerId}</TableCell>
                                                            <TableCell>{log.courseId}</TableCell>
                                                            <TableCell>{log.holeNumber}홀</TableCell>
                                                            <TableCell className="font-mono">{log.newValue}</TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {new Date(log.modifiedAt).toLocaleString('ko-KR')}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
