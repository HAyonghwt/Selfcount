"use client"
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, LogOut, Users } from "lucide-react";
import Link from 'next/link';
import { useToast } from "@/hooks/use-toast";
import { db, firebaseConfig as localFirebaseConfig } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { Skeleton } from "@/components/ui/skeleton";

export default function SuperAdminPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState({
        appName: '',
        userDomain: '',
        firebaseConfig: '',
    });

    const firebaseConfigString = JSON.stringify(localFirebaseConfig, null, 2);

    useEffect(() => {
        const configRef = ref(db, 'config');
        get(configRef).then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setConfig({
                    appName: data.appName || '00파크골프',
                    userDomain: data.userDomain || 'parkgolf.com',
                    firebaseConfig: data.firebaseConfig ? JSON.stringify(data.firebaseConfig, null, 2) : firebaseConfigString,
                });
            } else {
                 setConfig({
                    appName: '00파크골프',
                    userDomain: 'parkgolf.com',
                    firebaseConfig: firebaseConfigString,
                });
            }
        }).catch(() => {
             toast({ title: "오류", description: "설정 정보를 불러오는데 실패했습니다.", variant: "destructive" });
             setConfig({
                appName: '00파크골프',
                userDomain: 'parkgolf.com',
                firebaseConfig: firebaseConfigString,
            });
        }).finally(() => {
            setLoading(false);
        });
    }, [firebaseConfigString, toast]);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setConfig(prev => ({ ...prev, [id]: value }));
    };

    const handleSaveChanges = () => {
        try {
            const parsedConfig = JSON.parse(config.firebaseConfig);
            const configRef = ref(db, 'config');
            set(configRef, {
                appName: config.appName,
                userDomain: config.userDomain,
                firebaseConfig: parsedConfig,
            }).then(() => {
                toast({
                    title: "성공",
                    description: "모든 설정이 성공적으로 저장되었습니다. 변경사항을 적용하려면 페이지를 새로고침하세요.",
                    className: "bg-green-500 text-white",
                });
            });
        } catch (error) {
            toast({
                title: "오류",
                description: "Firebase 구성이 유효한 JSON 형식이 아닙니다.",
                variant: "destructive",
            });
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
                        <CardHeader>
                            <CardTitle>기본 설정</CardTitle>
                            <CardDescription>앱의 기본 정보를 설정합니다.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="appName">단체 이름</Label>
                                <Input id="appName" value={config.appName} onChange={handleInputChange} placeholder="예: 행복 파크골프" />
                                <p className="text-xs text-muted-foreground">이 이름은 앱의 여러 곳에 표시됩니다.</p>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="userDomain">사용자 이메일 도메인 (XXX)</Label>
                                <div className="flex items-center">
                                    <span className="p-2 bg-muted rounded-l-md text-muted-foreground">admin@</span>
                                    <Input id="userDomain" value={config.userDomain} onChange={handleInputChange} className="rounded-l-none" />
                                </div>
                                 <p className="text-xs text-muted-foreground">admin@XXX.com 및 refereeN@XXX.com의 XXX 부분을 설정합니다.</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>사용자 계정 관리</CardTitle>
                             <CardDescription>관리자 및 심판 사용자 계정은 Firebase 콘솔에서 직접 관리해야 합니다.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-muted-foreground">
                            <p>보안을 위해 사용자 계정 생성 및 비밀번호 관리는 Firebase 프로젝트의 Authentication 섹션에서 직접 수행해야 합니다.</p>
                            <p>
                                <strong>관리자 계정:</strong> <code className="bg-muted px-1.5 py-0.5 rounded-sm">admin@{config.userDomain}</code><br/>
                                <strong>심판 계정 예시:</strong> <code className="bg-muted px-1.5 py-0.5 rounded-sm">referee1@{config.userDomain}</code>
                            </p>
                             <Button asChild variant="secondary">
                                <a href={`https://console.firebase.google.com/project/${localFirebaseConfig.projectId}/authentication/users`} target="_blank" rel="noopener noreferrer">
                                    <Users className="mr-2 h-4 w-4" /> Firebase 인증 콘솔로 이동
                                </a>
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Firebase 설정</CardTitle>
                        <CardDescription>앱의 데이터베이스 및 서비스 연결을 위한 Firebase 구성 정보를 입력합니다. 변경 시 주의가 필요합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="firebaseConfig">Firebase 구성 (JSON 형식)</Label>
                            <Textarea id="firebaseConfig" rows={12} value={config.firebaseConfig} onChange={handleInputChange} className="font-mono text-sm" />
                        </div>
                        <Button size="lg" className="w-full" onClick={handleSaveChanges}>
                            <Save className="mr-2 h-5 w-5" />
                            모든 설정 저장
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
