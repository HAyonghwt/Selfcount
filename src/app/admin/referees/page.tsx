
"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { getRefereeAccounts } from '@/lib/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const MAX_HOLES = 9;

export default function RefereeManagementPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [userDomain, setUserDomain] = useState('');
    const [refereePassword, setRefereePassword] = useState('');
    const [mainUrl, setMainUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [refereeAccounts, setRefereeAccounts] = useState<any[]>([]);
    const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});
    const [tournamentCourses, setTournamentCourses] = useState<any[]>([]);

    useEffect(() => {
        if (!db) return;
        const configRef = ref(db, 'config');

        const unsubConfig = onValue(configRef, (snapshot) => {
            const data = snapshot.val() || {};
            setUserDomain(data.userDomain || 'parkgolf.com');
            setRefereePassword(data.refereePassword || '');
            setMainUrl(data.mainUrl || window.location.origin);
            setLoading(false);
        });

        return () => {
            unsubConfig();
        };
    }, []);

    // 대회 코스 정보 불러오기
    useEffect(() => {
        if (!db) return;
        const tournamentRef = ref(db, 'tournaments/current');
        
        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val();
            if (data?.courses) {
                const selectedCourses = Object.values(data.courses)
                    .filter((course: any) => course.isActive)
                    .sort((a: any, b: any) => a.name.localeCompare(b.name));
                setTournamentCourses(selectedCourses);
            } else {
                setTournamentCourses([]);
            }
        });

        return () => {
            unsubTournament();
        };
    }, []);

    // 심판 계정 목록 불러오기
    useEffect(() => {
        const loadRefereeAccounts = async () => {
            try {
                const accounts = await getRefereeAccounts();
                setRefereeAccounts(accounts);
            } catch (error) {
                console.error('심판 계정 목록 불러오기 실패:', error);
            }
        };
        loadRefereeAccounts();
    }, []);

    // 심판 계정을 코스별로 그룹화하는 함수
    const getRefereesByCourse = () => {
        const refereesByCourse: { [courseName: string]: any[] } = {};
        
        tournamentCourses.forEach((course, courseIndex) => {
            const courseReferees: any[] = [];
            
            for (let hole = 1; hole <= 9; hole++) {
                // 코스별로 다른 심판 ID 패턴 사용
                const refereeId = courseIndex === 0 
                    ? `${hole}번홀심판` 
                    : `${hole}번홀심판${courseIndex}`;
                
                const referee = refereeAccounts.find(acc => acc.id === refereeId);
                if (referee) {
                    courseReferees.push({
                        ...referee,
                        displayHole: `${course.name} ${hole}번홀`,
                        courseName: course.name,
                        holeNumber: hole
                    });
                } else {
                    // 계정이 없는 경우에도 표시용으로 추가
                    courseReferees.push({
                        id: refereeId,
                        password: '••••••',
                        hole: hole,
                        isActive: false,
                        displayHole: `${course.name} ${hole}번홀`,
                        courseName: course.name,
                        holeNumber: hole,
                        isPlaceholder: true
                    });
                }
            }
            
            refereesByCourse[course.name] = courseReferees;
        });
        
        return refereesByCourse;
    };

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(mainUrl);
            setCopied(true);
            toast({
                title: '복사 완료',
                description: '메인 URL이 클립보드에 복사되었습니다.',
            });
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast({
                title: '복사 실패',
                description: 'URL 복사에 실패했습니다.',
                variant: 'destructive',
            });
        }
    };



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
    // scoreUnlockPassword를 DB에서 읽어와 unlockPassword에 세팅
    useEffect(() => {
        if (!db) return;
        const pwRef = ref(db, 'config/scoreUnlockPassword');
        const unsub = onValue(pwRef, (snap) => {
            const val = snap.val() || '';
            setUnlockPassword(val);
        });
        return () => unsub();
    }, []);
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string|null>(null);

    const handleSaveUnlockPassword = async () => {
        if (!db) return;
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
                                value={unlockPassword}
                                onChange={e => setUnlockPassword(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
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
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">아래 주소를 심판들에게 전달하고 담당 홀의 아이디와 비밀번호를 이용해서 로그인 하게 합니다</label>
                            <div className="flex gap-2">
                                <Input 
                                    value={mainUrl} 
                                    onChange={(e) => setMainUrl(e.target.value)}
                                    placeholder="https://your-domain.com"
                                    className="flex-1"
                                />
                                <Button 
                                    onClick={handleCopyUrl}
                                    variant="outline"
                                    className="min-w-[100px]"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="mr-2 h-4 w-4" />
                                            복사됨
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="mr-2 h-4 w-4" />
                                            복사하기
                                        </>
                                    )}
                                </Button>

                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>심판 계정 목록</CardTitle>
                    <CardDescription>
                        대회에서 선택된 코스별로 심판 계정을 표시합니다. 
                        {tournamentCourses.length === 0 && " 먼저 대회 및 코스 관리에서 코스를 선택해주세요."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        {loading ? (
                            renderSkeleton()
                        ) : tournamentCourses.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <p>대회에서 선택된 코스가 없습니다.</p>
                                <p className="text-sm mt-2">대회 및 코스 관리에서 코스를 먼저 선택해주세요.</p>
                            </div>
                        ) : (
                            Object.entries(getRefereesByCourse()).map(([courseName, referees]) => (
                                <div key={courseName} className="space-y-3">
                                    <h3 className="text-lg font-semibold text-primary border-b pb-2 text-center">{courseName}</h3>
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-32 font-bold">홀</TableHead>
                                                    <TableHead className="font-bold">심판 아이디</TableHead>
                                                    <TableHead className="font-bold">비밀번호</TableHead>
                                                    <TableHead className="w-20 font-bold">상태</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {referees.map(referee => (
                                                    <TableRow key={referee.id} className={!referee.isActive ? 'bg-gray-50' : ''}>
                                                        <TableCell className="font-medium">{referee.displayHole}</TableCell>
                                                        <TableCell>
                                                            <code className="bg-muted px-2 py-1 rounded-md text-base">{referee.id}</code>
                                                            {!referee.isActive && !referee.isPlaceholder && <span className="ml-2 text-sm text-gray-500">(비활성화)</span>}
                                                            {referee.isPlaceholder && <span className="ml-2 text-sm text-gray-500">(미생성)</span>}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-base">
                                                                    {referee.isPlaceholder ? '••••••' : 
                                                                     showPasswords[referee.id] ? referee.password : referee.password.replace(/./g, '•')}
                                                                </span>
                                                                {!referee.isPlaceholder && (
                                                                    <button
                                                                        type="button"
                                                                        className="text-muted-foreground hover:text-foreground"
                                                                        onClick={() => setShowPasswords(prev => ({
                                                                            ...prev,
                                                                            [referee.id]: !prev[referee.id]
                                                                        }))}
                                                                        aria-label={showPasswords[referee.id] ? "비밀번호 숨기기" : "비밀번호 보기"}
                                                                    >
                                                                        {showPasswords[referee.id] ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                                referee.isPlaceholder 
                                                                    ? 'bg-gray-100 text-gray-800'
                                                                    : referee.isActive 
                                                                        ? 'bg-green-100 text-green-800' 
                                                                        : 'bg-red-100 text-red-800'
                                                            }`}>
                                                                {referee.isPlaceholder ? '미생성' : referee.isActive ? '활성' : '비활성'}
                                                            </span>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
