
"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Save, Eye, EyeOff, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db, firebaseConfig } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';

const MAX_HOLES = 9;

export default function RefereeManagementPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [userDomain, setUserDomain] = useState('');
    const [passwords, setPasswords] = useState<{[key: number]: string}>({});
    const [showPassword, setShowPassword] = useState<{[key: number]: boolean}>({});

    useEffect(() => {
        const configRef = ref(db, 'config/userDomain');
        const passwordsRef = ref(db, 'refereeCredentials');

        const unsubDomain = onValue(configRef, (snapshot) => {
            setUserDomain(snapshot.val() || 'parkgolf.com');
        });

        const unsubPasswords = onValue(passwordsRef, (snapshot) => {
            setPasswords(snapshot.val() || {});
            setLoading(false);
        });

        return () => {
            unsubDomain();
            unsubPasswords();
        };
    }, []);
    
    const handlePasswordChange = (hole: number, value: string) => {
        setPasswords(prev => ({...prev, [hole]: value}));
    };

    const toggleShowPassword = (hole: number) => {
        setShowPassword(prev => ({...prev, [hole]: !prev[hole]}));
    };

    const handleSavePassword = (hole: number) => {
        const password = passwords[hole] || '';
        if (password.trim() === '') {
            toast({ title: "오류", description: "비밀번호를 입력해주세요.", variant: 'destructive' });
            return;
        }

        set(ref(db, `refereeCredentials/${hole}`), password)
            .then(() => {
                toast({ title: "저장 완료", description: `${hole}번홀 심판의 비밀번호가 저장되었습니다.` });
            })
            .catch(err => {
                toast({ title: "저장 실패", description: err.message, variant: 'destructive' });
            });
    };

    const renderSkeleton = () => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-24">홀</TableHead>
                    <TableHead>심판 아이디</TableHead>
                    <TableHead>비밀번호 (보관용)</TableHead>
                    <TableHead className="text-right">관리</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-10 w-24 ml-auto" /></TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline">심판 계정 관리</CardTitle>
                    <CardDescription>
                        대회 심판들의 아이디를 확인하고, Firebase 인증 콘솔에서 설정한 비밀번호를 여기에 기록하여 보관할 수 있습니다.
                        <br />
                        <span className="font-semibold text-destructive">주의: 이 페이지는 비밀번호를 실제로 생성하거나 변경하지 않습니다. Firebase 콘솔에서 계정을 먼저 생성/수정한 후, 여기에 기록해주세요.</span>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <Button asChild variant="secondary">
                        <a href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/users`} target="_blank" rel="noopener noreferrer">
                            <Users className="mr-2 h-4 w-4" /> Firebase 인증 콘솔로 이동
                        </a>
                    </Button>
                </CardContent>
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
                                        <TableHead className="font-bold">비밀번호 (보관용)</TableHead>
                                        <TableHead className="text-right font-bold">관리</TableHead>
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
                                                <div className="relative">
                                                    <Input
                                                        id={`password-${hole}`}
                                                        type={showPassword[hole] ? 'text' : 'password'}
                                                        value={passwords[hole] || ''}
                                                        onChange={e => handlePasswordChange(hole, e.target.value)}
                                                        placeholder="Firebase에서 설정한 암호"
                                                        className="pr-10"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute inset-y-0 right-0 h-full w-auto px-3 text-muted-foreground hover:text-foreground"
                                                        onClick={() => toggleShowPassword(hole)}
                                                        aria-label={showPassword[hole] ? "비밀번호 숨기기" : "비밀번호 보기"}
                                                    >
                                                        {showPassword[hole] ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button onClick={() => handleSavePassword(hole)}>
                                                    <Save className="mr-2 h-4 w-4"/> 저장
                                                </Button>
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
