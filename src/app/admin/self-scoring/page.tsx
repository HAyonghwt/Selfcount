"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const MAX_CAPTAINS = 10;

export default function SelfScoringManagementPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [userDomain, setUserDomain] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!db) return;
        
        // 자율채점 조장은 yongin.com 도메인 사용
        setUserDomain('yongin.com');
        setLoading(false);
    }, []);

    const handleCopyUrl = async (index: number) => {
        const url = `${window.location.origin}/self-scoring`;
        try {
            await navigator.clipboard.writeText(url);
            setCopiedIndex(index);
            toast({
                title: '주소 복사 완료',
                description: '자율채점 페이지 주소가 클립보드에 복사되었습니다.',
            });
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch (error) {
            toast({
                title: '복사 실패',
                description: '주소 복사에 실패했습니다.',
                variant: 'destructive',
            });
        }
    };

    const captainAccounts = [
        { number: 1, email: `player1@${userDomain}`, password: '123456' },
        { number: 2, email: `player2@${userDomain}`, password: '234567' },
        { number: 3, email: `player3@${userDomain}`, password: '345678' },
        { number: 4, email: `player4@${userDomain}`, password: '456789' },
        { number: 5, email: `player5@${userDomain}`, password: '567890' },
        { number: 6, email: `player6@${userDomain}`, password: '678901' },
        { number: 7, email: `player7@${userDomain}`, password: '789012' },
        { number: 8, email: `player8@${userDomain}`, password: '890123' },
        { number: 9, email: `player9@${userDomain}`, password: '901234' },
        { number: 10, email: `player10@${userDomain}`, password: '012345' }
    ];

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
                        아래 주소를 조장에게 전달하고 아이디와 비밀번호를 이용해서 로그인 하게 합니다
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <Input
                            value={`${window.location.origin}/self-scoring`}
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
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {captainAccounts.map((account) => (
                                <TableRow key={account.number}>
                                    <TableCell className="font-medium">{account.number}번</TableCell>
                                    <TableCell className="font-mono">{account.email}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center space-x-2">
                                            <span className="font-mono">
                                                {showPassword ? account.password : '••••••'}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleCopyUrl(account.number)}
                                        >
                                            {copiedIndex === account.number ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
