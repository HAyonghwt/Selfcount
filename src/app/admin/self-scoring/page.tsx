"use client"

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, EyeOff, Copy, Check, RefreshCw, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getSelfScoringLogs, ScoreLog } from '@/lib/scoreLogs';
import { getCaptainAccounts, updateCaptainPassword } from '@/lib/auth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
// @ts-ignore
import QRCode from 'qrcode.react';

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
    const [editingPassword, setEditingPassword] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [batchResetPassword, setBatchResetPassword] = useState('');
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [savingReset, setSavingReset] = useState(false);
    const [resetSaveMsg, setResetSaveMsg] = useState<string | null>(null);
    const qrRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!db) return;

        // 자율채점 조장은 yongin.com 도메인 사용
        setUserDomain('yongin.com');

        // 초기화 비밀번호 불러오기
        const pwRef = ref(db, 'config/batchResetPassword');
        const unsub = onValue(pwRef, (snap) => {
            setBatchResetPassword(snap.val() || '');
        });

        setLoading(false);
        return () => unsub();
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
    const loadCaptainAccounts = async () => {
        try {
            const accounts = await getCaptainAccounts();
            setCaptainAccounts(accounts);
        } catch (error) {
            console.error('조장 계정 목록 불러오기 실패:', error);
        }
    };

    useEffect(() => {
        loadCaptainAccounts();
    }, []);

    // 조장 계정 비밀번호 변경
    const handleUpdatePassword = async (koreanId: string) => {
        if (!newPassword.trim()) {
            toast({
                title: "비밀번호 변경 실패",
                description: "새 비밀번호를 입력해주세요.",
                variant: "destructive",
            });
            return;
        }

        if (newPassword.length < 4) {
            toast({
                title: "비밀번호 변경 실패",
                description: "비밀번호는 최소 4자 이상이어야 합니다.",
                variant: "destructive",
            });
            return;
        }

        try {
            await updateCaptainPassword(koreanId, newPassword);
            toast({
                title: "성공",
                description: `${koreanId} 계정의 비밀번호가 변경되었습니다.`,
            });
            setEditingPassword(null);
            setNewPassword('');
            await loadCaptainAccounts(); // 목록 새로고침
        } catch (error: any) {
            toast({
                title: "비밀번호 변경 실패",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    // 모바일(iOS 사파리 포함)에서도 동작하도록 클립보드 복사 유틸
    const copyTextUniversal = async (text: string): Promise<boolean> => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch { }
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

    const handleDownloadQR = () => {
        const canvas = qrRef.current?.querySelector("canvas");
        if (canvas) {
            const urlImg = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = urlImg;
            a.download = "자율채점주소.png";
            a.click();
        } else {
            toast({
                title: '다운로드 실패',
                description: 'QR코드를 생성할 수 없습니다.',
                variant: 'destructive',
            });
        }
    };

    const handleSaveResetPassword = async () => {
        if (!db) return;
        if (batchResetPassword.trim() === '') {
            setResetSaveMsg('비밀번호를 입력해주세요.');
            return;
        }
        setSavingReset(true);
        try {
            const { set } = await import('firebase/database');
            await set(ref(db, 'config/batchResetPassword'), batchResetPassword);
            setResetSaveMsg('초기화 비밀번호가 저장되었습니다.');
            setTimeout(() => setResetSaveMsg(null), 3000);
        } catch (err: any) {
            setResetSaveMsg('저장 실패: ' + (err?.message || '오류'));
        }
        setSavingReset(false);
    };




    // 로그를 조장별로 그룹화
    const logsByCaptain = selfScoringLogs.reduce((acc, log) => {
        const captainEmail = (log as any).captainEmail || log.modifiedBy;
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
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                        <div className="flex gap-2 items-center flex-1 w-full">
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
                        {/* QR 코드 영역 */}
                        <div className="flex flex-col items-center justify-center md:ml-4" style={{ minWidth: 120 }}>
                            <div ref={qrRef} className="bg-white p-2 rounded shadow mb-2">
                                {QRCode ? (
                                    <QRCode value={`${window.location.origin}/`} size={90} level="H" includeMargin={false} />
                                ) : (
                                    <div style={{ color: 'red', fontSize: 12, width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>QR코드 라이브러리 로드 실패</div>
                                )}
                            </div>
                            <Button variant="outline" onClick={handleDownloadQR} size="sm" style={{ width: 140 }}>
                                <Download className="w-4 h-4 mr-1" /> QR코드 다운로드
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 일괄입력 초기화 비밀번호 설정 카드 */}
            <Card>
                <CardHeader>
                    <CardTitle>일괄입력 초기화 비밀번호 설정</CardTitle>
                    <CardDescription>자율채점 일괄 입력 페이지에서 코스 점수를 초기화할 때 사용할 숫자 비밀번호를 설정합니다.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="space-y-2 flex-1 w-full">
                        <label htmlFor="batch-reset-password">초기화 비밀번호 (4자리 숫자)</label>
                        <div className="relative">
                            <input
                                id="batch-reset-password"
                                type={showResetPassword ? 'text' : 'password'}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={batchResetPassword}
                                onChange={e => setBatchResetPassword(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                                placeholder="숫자 비밀번호 입력"
                                className="pr-10 border rounded px-3 py-2 w-full"
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="absolute inset-y-0 right-0 h-full w-auto px-3 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowResetPassword(prev => !prev)}
                                aria-label={showResetPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                            >
                                {showResetPassword ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>
                    <button
                        className="bg-primary text-white px-6 py-2 rounded font-medium hover:bg-primary/90 transition-colors"
                        onClick={handleSaveResetPassword}
                        disabled={savingReset}
                    >
                        {savingReset ? '저장 중...' : '비밀번호 저장'}
                    </button>
                    {resetSaveMsg && <div className="text-sm text-muted-foreground ml-2 mb-2">{resetSaveMsg}</div>}
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
                                                        {editingPassword === account.id ? (
                                                            <div className="flex items-center space-x-2">
                                                                <Input
                                                                    type="text"
                                                                    placeholder="새 비밀번호"
                                                                    value={newPassword}
                                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                                    className="w-24 text-xs"
                                                                    onKeyPress={(e) => e.key === 'Enter' && handleUpdatePassword(account.id)}
                                                                    onFocus={(e) => e.target.select()}
                                                                    autoFocus
                                                                />
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleUpdatePassword(account.id)}
                                                                    className="text-xs bg-green-600 hover:bg-green-700"
                                                                >
                                                                    저장
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        setEditingPassword(null);
                                                                        setNewPassword('');
                                                                    }}
                                                                    className="text-xs"
                                                                >
                                                                    취소
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <>
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
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setEditingPassword(account.id);
                                                                        setNewPassword(account.password || '123456');
                                                                    }}
                                                                    className="text-xs"
                                                                    disabled={!account.isActive}
                                                                >
                                                                    변경
                                                                </Button>
                                                            </>
                                                        )}
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
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${account.isActive
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
