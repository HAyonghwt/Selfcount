
"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';

const MAX_HOLES = 9;

export default function RefereeManagementPage() {
    const [loading, setLoading] = useState(true);
    const [userDomain, setUserDomain] = useState('');
    const [refereePassword, setRefereePassword] = useState('');

    useEffect(() => {
        const configRef = ref(db, 'config');

        const unsubConfig = onValue(configRef, (snapshot) => {
            const data = snapshot.val() || {};
            setUserDomain(data.userDomain || 'parkgolf.com');
            setRefereePassword(data.refereePassword || '');
            setLoading(false);
        });

        return () => {
            unsubConfig();
        };
    }, []);

    const renderSkeleton = () => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-24">홀</TableHead>
                    <TableHead>심판 아이디</TableHead>
                    <TableHead>비밀번호</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );

    // 점수 수정 잠금해제 설정 상태 및 이벤트
    const [unlockPassword, setUnlockPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string|null>(null);

    const handleSaveUnlockPassword = async () => {
        if (unlockPassword.trim() === '') {
            setSaveMsg('비밀번호를 입력해주세요.');
            return;
        }
        setSaving(true);
        try {
            await import('firebase/database').then(({ ref, set }) => set(ref(db, 'config/scoreUnlockPassword'), unlockPassword));
            setSaveMsg('잠금 해제 비밀번호가 저장되었습니다.');
        } catch (err: any) {
            setSaveMsg('저장 실패: ' + (err?.message || '오류'));
        }
        setSaving(false);
    };

    return (
        <div className="space-y-6">
            {/* 점수 수정 잠금해제 설정 카드 */}
            <Card>
                <CardHeader>
                    <CardTitle>심판점수 수정 잠금해제 설정</CardTitle>
                    <CardDescription>심판 페이지에서 잠긴 점수를 수정할 때 사용할 숫자 비밀번호를 설정합니다.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="space-y-2 flex-1 w-full">
                        <label htmlFor="unlock-password">잠금 해제 비밀번호 (4자리 숫자)</label>
                        <div className="relative">
                            <input
                                id="unlock-password"
                                type={showPassword ? 'text' : 'password'}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={unlockPassword === '' ? refereePassword : unlockPassword}
                                onChange={e => setUnlockPassword(e.target.value)}
                                placeholder="숫자 비밀번호 입력"
                                className="pr-10 border rounded px-2 py-1 w-full"
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="absolute inset-y-0 right-0 h-full w-auto px-3 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowPassword(prev => !prev)}
                                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                            >
                                {showPassword ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>
                    <button className="bg-primary text-white px-4 py-2 rounded" onClick={handleSaveUnlockPassword} disabled={saving}>
                        저장
                    </button>
                    {saveMsg && <div className="text-sm text-muted-foreground ml-2">{saveMsg}</div>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline">심판 계정 관리</CardTitle>
                    <CardDescription>
                        대회 심판들의 아이디와 비밀번호를 확인합니다.
                    </CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>심판 계정 목록</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        {loading ? renderSkeleton() : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-24 font-bold">홀</TableHead>
                                        <TableHead className="font-bold">심판 아이디</TableHead>
                                        <TableHead className="font-bold">비밀번호</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Array.from({ length: MAX_HOLES }, (_, i) => i + 1).map(hole => (
                                        <TableRow key={hole}>
                                            <TableCell className="font-medium">{hole}번홀</TableCell>
                                            <TableCell>
                                                <code className="bg-muted px-2 py-1 rounded-md text-base">referee{hole}@{userDomain}</code>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-base">
                                                    {showPassword ? refereePassword : refereePassword.replace(/./g, '•')}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
