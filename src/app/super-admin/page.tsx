"use client"
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, LogOut, Users } from "lucide-react";
import Link from 'next/link';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from "@/lib/firebase";
import { ref, set, get, onValue } from "firebase/database";
import { createUserWithEmailAndPassword, updatePassword } from "firebase/auth";
import { Skeleton } from "@/components/ui/skeleton";

export default function SuperAdminPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState({
        appName: '',
        userDomain: '',
        maxCourses: 10,
        maxPlayers: 200,
        refereePassword: '',
    });

    useEffect(() => {
        const configRef = ref(db, 'config');
        const unsubscribe = onValue(configRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setConfig({
                    appName: data.appName || 'ParkScore',
                    userDomain: data.userDomain || 'parkgolf.com',
                    maxCourses: data.maxCourses || 10,
                    maxPlayers: data.maxPlayers || 200,
                    refereePassword: data.refereePassword || '',
                });
            } else {
                 setConfig({
                    appName: 'ParkScore',
                    userDomain: 'parkgolf.com',
                    maxCourses: 10,
                    maxPlayers: 200,
                    refereePassword: '',
                });
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setConfig(prev => ({ ...prev, [id]: value }));
    };

    const handleSaveChanges = async () => {
        setLoading(true);
        const configRef = ref(db, 'config');

        try {
            // 1. Save config to Realtime Database
            await set(configRef, {
                appName: config.appName.trim(),
                userDomain: config.userDomain.trim(),
                maxCourses: Number(config.maxCourses),
                maxPlayers: Number(config.maxPlayers),
                refereePassword: config.refereePassword.trim(),
            });

            toast({
                title: "성공",
                description: "모든 설정이 성공적으로 저장되었습니다.",
            });
        } catch (error: any) {
            toast({
                title: "설정 저장 실패",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
                 <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 font-headline">최고 관리자 페이지</h1>
                        <p className="text-muted-foreground">ParkScore 앱의 전역 설정을 관리합니다.</p>
                    </div>
                    <Button variant="outline" asChild>
                        <Link href="/">
                            <LogOut className="mr-2 h-4 w-4" />
                            로그아웃
                        </Link>
                    </Button>
                </header>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-8">
                        <Card>
                            <CardHeader><CardTitle><Skeleton className="h-6 w-32" /></CardTitle><CardDescription><Skeleton className="h-4 w-48 mt-2" /></CardDescription></CardHeader>
                            <CardContent className="space-y-6"><div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-10 w-full" /></div></CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle><Skeleton className="h-6 w-40" /></CardTitle><CardDescription><Skeleton className="h-4 w-56 mt-2" /></CardDescription></CardHeader>
                            <CardContent><Skeleton className="h-10 w-full" /></CardContent>
                        </Card>
                    </div>
                    <Card>
                        <CardHeader><CardTitle><Skeleton className="h-6 w-32" /></CardTitle><CardDescription><Skeleton className="h-4 w-full max-w-md mt-2" /></CardDescription></CardHeader>
                        <CardContent className="space-y-4"><div className="space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-48 w-full" /></div><Skeleton className="h-12 w-full" /></CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
             <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 font-headline">최고 관리자 페이지</h1>
                    <p className="text-muted-foreground">ParkScore 앱의 전역 설정을 관리합니다.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleSaveChanges} disabled={loading}>
                        <Save className="mr-2 h-4 w-4" />
                        {loading ? '저장 중...' : '설정 저장'}
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/">
                            <LogOut className="mr-2 h-4 w-4" />
                            로그아웃
                        </Link>
                    </Button>
                </div>
            </header>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>기본 설정</CardTitle>
                            <CardDescription>앱의 기본 정보를 설정합니다.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="appName">단체 이름</Label>
                                <Input id="appName" value={config.appName} onChange={handleInputChange} placeholder="예: ParkScore" />
                                <p className="text-xs text-muted-foreground">이 이름은 앱의 여러 곳에 표시됩니다.</p>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="userDomain">사용자 이메일 도메인 (XXX)</Label>
                                <div className="flex items-center">
                                    <span className="p-2 bg-muted rounded-l-md text-muted-foreground text-sm">admin@</span>
                                    <Input id="userDomain" value={config.userDomain} onChange={handleInputChange} className="rounded-l-none" />
                                </div>
                                 <p className="text-xs text-muted-foreground">admin@XXX.com 및 refereeN@XXX.com의 XXX 부분을 설정합니다.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="refereePassword">심판 공용 비밀번호</Label>
                                <Input id="refereePassword" value={config.refereePassword} onChange={handleInputChange} placeholder="예: 123456" />
                                <p className="text-xs text-muted-foreground">모든 심판 계정(referee1, referee2...)에 공통으로 사용할 비밀번호입니다.</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>대회 운영 설정</CardTitle>
                            <CardDescription>대회의 최대 코스 수와 참가 인원을 제한합니다.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="maxCourses">최대 코스 수</Label>
                                <Input id="maxCourses" type="number" value={config.maxCourses} onChange={handleInputChange} placeholder="예: 10" />
                                <p className="text-xs text-muted-foreground">대회에 생성할 수 있는 최대 코스 수를 설정합니다.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="maxPlayers">최대 참가 인원 (팀 포함)</Label>
                                <Input id="maxPlayers" type="number" value={config.maxPlayers} onChange={handleInputChange} placeholder="예: 200" />
                                <p className="text-xs text-muted-foreground">대회에 등록할 수 있는 총 선수/팀 수를 제한합니다.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                 <div className="space-y-8">
                     <Card>
                        <CardHeader>
                            <CardTitle>Firebase 연결 정보</CardTitle>
                             <CardDescription>앱과 Firebase를 연결하는 설정입니다. 이 정보는 외부에 노출되지 않도록 주의해야 합니다.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                           <p>Firebase 연결 정보는 <code className="bg-muted px-1.5 py-0.5 rounded-sm">src/lib/firebase.ts</code> 파일에 직접 입력해야 합니다. 아래 버튼을 눌러 Firebase 콘솔에서 프로젝트 설정 정보를 확인하고, 해당 파일에 복사-붙여넣기 하세요.</p>
                             <Button asChild variant="secondary" className="mt-4">
                                <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer">
                                    <Users className="mr-2 h-4 w-4" /> Firebase 콘솔로 이동
                                </a>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
