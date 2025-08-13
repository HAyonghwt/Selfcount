"use client"

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function SelfScoringLoginPage() {
    const router = useRouter();

    useEffect(() => {
        // 자동으로 메인페이지로 리다이렉트
        router.push('/');
    }, [router]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-blue-50 p-4">
            <Card className="w-full max-w-md shadow-2xl border-blue-200">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold text-blue-800">
                        자율채점 로그인
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                    <p className="text-gray-600">
                        자율채점 로그인은 메인페이지에서 통합으로 제공됩니다.
                    </p>
                    <p className="text-sm text-gray-500">
                        메인페이지에서 조장1, 조장2 등으로 로그인하세요.
                    </p>
                    <Button asChild className="w-full">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            메인페이지로 이동
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
