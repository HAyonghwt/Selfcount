
"use client"

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { getFirestoreDb } from '@/lib/firebase';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, EyeOff, Copy, Check, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateRefereePassword } from '@/lib/auth';
// @ts-ignore
import QRCode from 'qrcode.react';

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
    const [editingPassword, setEditingPassword] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [tournamentCourses, setTournamentCourses] = useState<any[]>([]);
    const [groupsData, setGroupsData] = useState<{ [key: string]: any }>({});
    const qrRef = useRef<HTMLDivElement>(null);

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

    // 대회 코스 정보 및 그룹 정보 불러오기
    useEffect(() => {
        if (!db) return;
        const tournamentRef = ref(db, 'tournaments/current');
        
        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val();
            if (data?.courses) {
                const selectedCourses = Object.values(data.courses)
                    .filter((course: any) => course.isActive)
                    .map((course: any) => ({
                        ...course,
                        order: course.order !== undefined ? course.order : 999 // order가 없으면 뒤로
                    }))
                    .sort((a: any, b: any) => (a.order || 999) - (b.order || 999)); // order 기준으로 정렬
                setTournamentCourses(selectedCourses);
            } else {
                setTournamentCourses([]);
            }
            
            // 그룹 데이터도 함께 로드
            if (data?.groups) {
                setGroupsData(data.groups);
            } else {
                setGroupsData({});
            }
        });

        return () => {
            unsubTournament();
        };
    }, []);

    // 심판 계정 목록 불러오기 (Firestore 실시간 리스너 사용)
    useEffect(() => {
        const fs = getFirestoreDb();
        const refereesRef = collection(fs, 'referees');
        
        // Firestore 실시간 리스너 설정
        const unsubscribe = onSnapshot(refereesRef, (querySnapshot) => {
            const accounts: any[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data() as any;
                // isActive 값을 명시적으로 boolean으로 변환
                let isActiveValue: boolean;
                if (data.isActive === undefined || data.isActive === null) {
                    isActiveValue = true; // 기본값
                } else if (typeof data.isActive === 'boolean') {
                    isActiveValue = data.isActive;
                } else if (typeof data.isActive === 'string') {
                    isActiveValue = data.isActive === 'true' || data.isActive === '1';
                } else {
                    isActiveValue = Boolean(data.isActive);
                }
                
                accounts.push({
                    ...data,
                    id: data.id || doc.id,
                    isActive: isActiveValue
                });
            });
            
            // hole 순서로 정렬
            const sortedAccounts = accounts.sort((a, b) => a.hole - b.hole);
            setRefereeAccounts(sortedAccounts);
        }, (error) => {
            console.error('심판 계정 목록 실시간 업데이트 실패:', error);
        });
        
        return () => unsubscribe();
    }, []);

    // 수동 새로고침 함수 (버튼용)
    const loadRefereeAccounts = async () => {
        const fs = getFirestoreDb();
        const refereesRef = collection(fs, 'referees');
        
        // 일회성 조회 (getDocs 사용)
        try {
            const querySnapshot = await getDocs(refereesRef);
            const accounts: any[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data() as any;
                let isActiveValue: boolean;
                if (data.isActive === undefined || data.isActive === null) {
                    isActiveValue = true;
                } else if (typeof data.isActive === 'boolean') {
                    isActiveValue = data.isActive;
                } else if (typeof data.isActive === 'string') {
                    isActiveValue = data.isActive === 'true' || data.isActive === '1';
                } else {
                    isActiveValue = Boolean(data.isActive);
                }
                
                accounts.push({
                    ...data,
                    id: data.id || doc.id,
                    isActive: isActiveValue
                });
            });
            
            const sortedAccounts = accounts.sort((a, b) => a.hole - b.hole);
            setRefereeAccounts(sortedAccounts);
        } catch (error) {
            console.error('심판 계정 목록 불러오기 실패:', error);
        }
    };

    // 심판 계정 비밀번호 변경
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
            await updateRefereePassword(koreanId, newPassword);
            toast({
                title: "성공",
                description: `${koreanId} 계정의 비밀번호가 변경되었습니다.`,
            });
            setEditingPassword(null);
            setNewPassword('');
            // Firestore 실시간 리스너가 자동으로 업데이트하므로 별도 새로고침 불필요
        } catch (error: any) {
            toast({
                title: "비밀번호 변경 실패",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    // 코스에 배정된 그룹 목록을 가져오는 함수
    const getAssignedGroupsForCourse = (courseId: string) => {
        const assignedGroups: string[] = [];
        
        Object.entries(groupsData).forEach(([groupName, groupData]: [string, any]) => {
            if (groupData?.courses) {
                const courseAssignment = groupData.courses[courseId];
                // courseAssignment가 true이거나 number > 0이면 배정된 것
                if (courseAssignment === true || (typeof courseAssignment === 'number' && courseAssignment > 0)) {
                    assignedGroups.push(groupName);
                }
            }
        });
        
        return assignedGroups.sort(); // 알파벳 순으로 정렬
    };

    // 심판 계정을 코스별로 그룹화하는 함수
    const getRefereesByCourse = () => {
        const refereesByCourse: { [courseName: string]: any[] } = {};
        
        tournamentCourses.forEach((course, courseIndex) => {
            const courseReferees: any[] = [];
            // 코스 order를 사용하여 심판 ID 생성 (order가 1이면 첫번째 코스, 2이면 두번째 코스...)
            const courseOrder = course.order || (courseIndex + 1);
            
            for (let hole = 1; hole <= 9; hole++) {
                // 코스별로 다른 심판 ID 패턴 사용
                // 첫번째 코스(order === 1): 1번홀심판, 2번홀심판, ...
                // 두번째 코스(order === 2): 1번홀심판1, 2번홀심판1, ...
                // 세번째 코스(order === 3): 1번홀심판2, 2번홀심판2, ...
                const refereeId = courseOrder === 1 
                    ? `${hole}번홀심판` 
                    : `${hole}번홀심판${courseOrder - 1}`;
                
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

    const handleDownloadQR = () => {
        const canvas = qrRef.current?.querySelector("canvas");
        if (canvas) {
            const urlImg = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = urlImg;
            a.download = "심판용주소.png";
            a.click();
        } else {
            toast({
                title: '다운로드 실패',
                description: 'QR코드를 생성할 수 없습니다.',
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
                            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                                <div className="flex gap-2 items-center flex-1 w-full">
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
                                {/* QR 코드 영역 */}
                                <div className="flex flex-col items-center justify-center md:ml-4" style={{ minWidth: 120 }}>
                                    <div ref={qrRef} className="bg-white p-2 rounded shadow mb-2">
                                        {QRCode ? (
                                            <QRCode value={mainUrl} size={90} level="H" includeMargin={false} />
                                        ) : (
                                            <div style={{color: 'red', fontSize: 12, width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>QR코드 라이브러리 로드 실패</div>
                                        )}
                                    </div>
                                    <Button variant="outline" onClick={handleDownloadQR} size="sm" style={{ width: 140 }}>
                                        <Download className="w-4 h-4 mr-1" /> QR코드 다운로드
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>심판 계정 목록</CardTitle>
                            <CardDescription>
                                대회에서 선택된 코스별로 심판 계정을 표시합니다. 
                                {tournamentCourses.length === 0 && " 먼저 대회 및 코스 관리에서 코스를 선택해주세요."}
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadRefereeAccounts}
                            className="ml-4"
                        >
                            목록 새로고침
                        </Button>
                    </div>
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
                            Object.entries(getRefereesByCourse()).map(([courseName, referees]) => {
                                // 코스 ID 찾기
                                const course = tournamentCourses.find(c => c.name === courseName);
                                const courseId = course?.id || '';
                                const assignedGroups = getAssignedGroupsForCourse(courseId);
                                
                                return (
                                <div key={courseName} className="space-y-3">
                                    <div className="flex flex-col items-center gap-2 border-b pb-3">
                                        <h3 className="text-lg font-semibold text-primary">{courseName}</h3>
                                        {assignedGroups.length > 0 ? (
                                            <div className="flex flex-wrap items-center gap-2 justify-center">
                                                <span className="text-sm font-medium text-muted-foreground">할당 그룹:</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {assignedGroups.map((groupName) => (
                                                        <span 
                                                            key={groupName}
                                                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"
                                                        >
                                                            {groupName}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">할당된 그룹 없음</span>
                                        )}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="font-bold whitespace-nowrap">홀</TableHead>
                                                    <TableHead className="font-bold">심판 아이디</TableHead>
                                                    <TableHead className="font-bold">비밀번호</TableHead>
                                                    <TableHead className="w-20 font-bold">상태</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {referees.map(referee => (
                                                    <TableRow key={referee.id} className={!referee.isActive ? 'bg-gray-50' : ''}>
                                                        <TableCell className="font-medium whitespace-nowrap">{referee.displayHole}</TableCell>
                                                        <TableCell>
                                                            <code className="bg-muted px-2 py-1 rounded-md text-base">{referee.id}</code>
                                                            {!referee.isActive && !referee.isPlaceholder && <span className="ml-2 text-sm text-gray-500">(비활성화)</span>}
                                                            {referee.isPlaceholder && <span className="ml-2 text-sm text-gray-500">(미생성)</span>}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                {editingPassword === referee.id ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <Input
                                                                            type="text"
                                                                            placeholder="새 비밀번호"
                                                                            value={newPassword}
                                                                            onChange={(e) => setNewPassword(e.target.value)}
                                                                            className="w-24 text-xs"
                                                                            onKeyPress={(e) => e.key === 'Enter' && handleUpdatePassword(referee.id)}
                                                                            onFocus={(e) => e.target.select()}
                                                                            autoFocus
                                                                        />
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={() => handleUpdatePassword(referee.id)}
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
                                                                        <span className="font-mono text-base">
                                                                            {referee.isPlaceholder ? '••••••' : 
                                                                             showPasswords[referee.id] ? referee.password : referee.password.replace(/./g, '•')}
                                                                        </span>
                                                                        {!referee.isPlaceholder && (
                                                                            <>
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
                                                                                <Button
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    onClick={() => {
                                                                                        setEditingPassword(referee.id);
                                                                                        setNewPassword(referee.password || '123456');
                                                                                    }}
                                                                                    className="text-xs"
                                                                                    disabled={!referee.isActive || referee.isPlaceholder}
                                                                                >
                                                                                    변경
                                                                                </Button>
                                                                            </>
                                                                        )}
                                                                    </>
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
                                );
                            })
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
