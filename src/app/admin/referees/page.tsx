
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

    return (
        <div className="space-y-6">
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
                                                <span className="font-mono text-base">{refereePassword}</span>
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
