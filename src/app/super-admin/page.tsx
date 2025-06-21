"use client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, LogOut } from "lucide-react";
import Link from 'next/link';

export default function SuperAdminPage() {
    // In a real app, these values would be fetched from and saved to a secure database.
    const firebaseConfigExample = `{
  "apiKey": "AIzaSyAM6GtB8HB8pw0VPSmZxk7xOxB2n1iXFP8",
  "authDomain": "dehoi-1.firebaseapp.com",
  "projectId": "dehoi-1",
  "storageBucket": "dehoi-1.firebasestorage.app",
  "messagingSenderId": "81139018391",
  "appId": "1:81139018391:web:88d8e15e245181c2c557d2"
}`;

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
                                <Input id="appName" defaultValue="00파크골프" placeholder="예: 행복 파크골프" />
                                <p className="text-xs text-muted-foreground">이 이름은 앱의 여러 곳에 표시됩니다.</p>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="userDomain">사용자 이메일 도메인 (XXX)</Label>
                                <div className="flex items-center">
                                    <span className="p-2 bg-muted rounded-l-md text-muted-foreground">admin@</span>
                                    <Input id="userDomain" defaultValue="parkgolf.com" className="rounded-l-none" />
                                </div>
                                 <p className="text-xs text-muted-foreground">admin@XXX.com 및 refereeN@XXX.com의 XXX 부분을 설정합니다.</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>대회 제한 설정</CardTitle>
                             <CardDescription>대회 운영에 대한 제한을 설정합니다.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="maxPlayers">최대 등록 선수</Label>
                                <Input id="maxPlayers" type="number" defaultValue="200" />
                                <p className="text-xs text-muted-foreground">한 대회에 등록할 수 있는 총 선수 인원을 제한합니다.</p>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="maxCourses">최대 코스 수</Label>
                                <Input id="maxCourses" type="number" defaultValue="4" />
                                <p className="text-xs text-muted-foreground">관리자가 추가할 수 있는 최대 코스 수를 제한합니다.</p>
                            </div>
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
                            <Textarea id="firebaseConfig" rows={12} defaultValue={firebaseConfigExample} className="font-mono text-sm" />
                        </div>
                        <Button size="lg" className="w-full">
                            <Save className="mr-2 h-5 w-5" />
                            모든 설정 저장
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
