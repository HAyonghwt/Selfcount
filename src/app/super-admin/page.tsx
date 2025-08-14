"use client"
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, LogOut, Users } from "lucide-react";
import Link from 'next/link';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from "@/lib/firebase";
import { ref, set, get, onValue } from "firebase/database";
import { createUserWithEmailAndPassword, updatePassword } from "firebase/auth";
import { createBulkCaptainAccounts, getCaptainAccounts, deactivateCaptainAccount, activateCaptainAccount, updateCaptainPassword, createBulkRefereeAccounts, getRefereeAccounts, updateRefereePassword } from "@/lib/auth";
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
        captainPassword: '',
    });
    const [captainAccounts, setCaptainAccounts] = useState<any[]>([]);
    const [creatingCaptains, setCreatingCaptains] = useState(false);
    const [editingPassword, setEditingPassword] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [refereeAccounts, setRefereeAccounts] = useState<any[]>([]);
    const [creatingReferees, setCreatingReferees] = useState(false);
    const [editingRefereePassword, setEditingRefereePassword] = useState<string | null>(null);
    const [newRefereePassword, setNewRefereePassword] = useState('');
    const [replaceCaptains, setReplaceCaptains] = useState(false);
    const [replaceReferees, setReplaceReferees] = useState(false);
    const [addMoreCaptains, setAddMoreCaptains] = useState(false);
    const [addMoreReferees, setAddMoreReferees] = useState(false);
    const [selectedCaptains, setSelectedCaptains] = useState<string[]>([]);
    const [selectedReferees, setSelectedReferees] = useState<string[]>([]);

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
                    captainPassword: data.captainPassword || '',
                });
            } else {
                 setConfig({
                    appName: 'ParkScore',
                    userDomain: 'parkgolf.com',
                    maxCourses: 10,
                    maxPlayers: 200,
                    refereePassword: '',
                    captainPassword: '',
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
                captainPassword: config.captainPassword.trim(),
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

    // 조장 계정 목록 불러오기
    const loadCaptainAccounts = async () => {
        try {
            const accounts = await getCaptainAccounts();
            setCaptainAccounts(accounts);
        } catch (error) {
            console.error('조장 계정 목록 불러오기 실패:', error);
        }
    };

    // 100명 조장 계정 일괄 생성
    const handleCreateBulkCaptains = async () => {
        let action = '생성';
        let description = '조장1부터 조장100까지 생성됩니다';
        
        if (replaceCaptains) {
            action = '기존 계정을 삭제하고 새로 생성';
            description = '조장1부터 조장100까지 재생성됩니다';
        } else if (addMoreCaptains) {
            action = '추가로 생성';
            description = '기존 계정 이후부터 100개 추가 생성됩니다';
        }
        
        if (!confirm(`정말로 100명의 조장 계정을 ${action}하시겠습니까?\n\n- ${description}\n- 기본 비밀번호: 123456\n- 10명씩 그룹으로 분할됩니다${replaceCaptains ? '\n- 기존 계정은 모두 삭제됩니다' : ''}`)) {
            return;
        }

        setCreatingCaptains(true);
        try {
            await createBulkCaptainAccounts(replaceCaptains, addMoreCaptains);
            toast({
                title: "성공",
                description: `100명의 조장 계정이 성공적으로 ${replaceCaptains ? '재생성' : addMoreCaptains ? '추가 생성' : '생성'}되었습니다.`,
            });
            await loadCaptainAccounts(); // 목록 새로고침
        } catch (error: any) {
            toast({
                title: "조장 계정 생성 실패",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setCreatingCaptains(false);
        }
    };

    // 조장 계정 비활성화/활성화
    const handleToggleCaptainStatus = async (koreanId: string, isActive: boolean) => {
        const action = isActive ? '비활성화' : '활성화';
        if (!confirm(`정말로 ${koreanId} 계정을 ${action}하시겠습니까?`)) {
            return;
        }

        try {
            if (isActive) {
                await deactivateCaptainAccount(koreanId);
            } else {
                await activateCaptainAccount(koreanId);
            }
            toast({
                title: "성공",
                description: `${koreanId} 계정이 ${action}되었습니다.`,
            });
            await loadCaptainAccounts(); // 목록 새로고침
        } catch (error: any) {
            toast({
                title: `계정 ${action} 실패`,
                description: error.message,
                variant: "destructive",
            });
        }
    };

    // 일괄 관리 함수들
    const handleSelectAllCaptains = (checked: boolean) => {
        if (checked) {
            setSelectedCaptains(captainAccounts.map(account => account.id));
        } else {
            setSelectedCaptains([]);
        }
    };

    const handleSelectCaptain = (koreanId: string, checked: boolean) => {
        if (checked) {
            setSelectedCaptains(prev => [...prev, koreanId]);
        } else {
            setSelectedCaptains(prev => prev.filter(id => id !== koreanId));
        }
    };

    const handleBulkToggleCaptains = async (activate: boolean) => {
        if (selectedCaptains.length === 0) {
            toast({
                title: "선택된 계정 없음",
                description: "선택된 조장 계정이 없습니다.",
                variant: "destructive",
            });
            return;
        }

        const action = activate ? '활성화' : '비활성화';
        if (!confirm(`정말로 선택된 ${selectedCaptains.length}개 조장 계정을 ${action}하시겠습니까?`)) {
            return;
        }

        try {
            const promises = selectedCaptains.map(koreanId => 
                activate ? activateCaptainAccount(koreanId) : deactivateCaptainAccount(koreanId)
            );
            await Promise.all(promises);
            
            toast({
                title: "성공",
                description: `${selectedCaptains.length}개 조장 계정이 ${action}되었습니다.`,
            });
            
            setSelectedCaptains([]);
            await loadCaptainAccounts();
        } catch (error: any) {
            toast({
                title: "일괄 처리 실패",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    const handleSelectAllReferees = (checked: boolean) => {
        if (checked) {
            setSelectedReferees(refereeAccounts.map(account => account.id));
        } else {
            setSelectedReferees([]);
        }
    };

    const handleSelectReferee = (koreanId: string, checked: boolean) => {
        if (checked) {
            setSelectedReferees(prev => [...prev, koreanId]);
        } else {
            setSelectedReferees(prev => prev.filter(id => id !== koreanId));
        }
    };

    const handleBulkToggleReferees = async (activate: boolean) => {
        if (selectedReferees.length === 0) {
            toast({
                title: "선택된 계정 없음",
                description: "선택된 심판 계정이 없습니다.",
                variant: "destructive",
            });
            return;
        }

        const action = activate ? '활성화' : '비활성화';
        if (!confirm(`정말로 선택된 ${selectedReferees.length}개 심판 계정을 ${action}하시겠습니까?`)) {
            return;
        }

        try {
            const promises = selectedReferees.map(koreanId => 
                activate ? activateCaptainAccount(koreanId) : deactivateCaptainAccount(koreanId)
            );
            await Promise.all(promises);
            
            toast({
                title: "성공",
                description: `${selectedReferees.length}개 심판 계정이 ${action}되었습니다.`,
            });
            
            setSelectedReferees([]);
            await loadRefereeAccounts();
        } catch (error: any) {
            toast({
                title: "일괄 처리 실패",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    // 조장 계정 비밀번호 변경
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
            await updateCaptainPassword(koreanId, newPassword);
            toast({
                title: "성공",
                description: `${koreanId} 계정의 비밀번호가 변경되었습니다.`,
            });
            setEditingPassword(null);
            setNewPassword('');
            await loadCaptainAccounts(); // 목록 새로고침
        } catch (error: any) {
            toast({
                title: "비밀번호 변경 실패",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    // 심판 계정 목록 불러오기
    const loadRefereeAccounts = async () => {
        try {
            const accounts = await getRefereeAccounts();
            setRefereeAccounts(accounts);
        } catch (error) {
            console.error('심판 계정 목록 불러오기 실패:', error);
        }
    };

    // 9명 심판 계정 일괄 생성
    const handleCreateBulkReferees = async () => {
        let action = '생성';
        let description = '1번홀심판부터 9번홀심판까지 생성됩니다';
        
        if (replaceReferees) {
            action = '기존 계정을 삭제하고 새로 생성';
            description = '1번홀심판부터 9번홀심판까지 재생성됩니다';
        } else if (addMoreReferees) {
            action = '추가로 생성';
            description = '기존 계정 이후부터 9개 추가 생성됩니다';
        }
        
        if (!confirm(`정말로 9명의 심판 계정을 ${action}하시겠습니까?\n\n- ${description}\n- 기본 비밀번호: 123456${replaceReferees ? '\n- 기존 계정은 모두 삭제됩니다' : ''}`)) {
            return;
        }

        setCreatingReferees(true);
        try {
            await createBulkRefereeAccounts(replaceReferees, addMoreReferees);
            toast({
                title: "성공",
                description: `9명의 심판 계정이 성공적으로 ${replaceReferees ? '재생성' : addMoreReferees ? '추가 생성' : '생성'}되었습니다.`,
            });
            await loadRefereeAccounts(); // 목록 새로고침
        } catch (error: any) {
            toast({
                title: "심판 계정 생성 실패",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setCreatingReferees(false);
        }
    };



    // 심판 계정 비밀번호 변경
    const handleUpdateRefereePassword = async (koreanId: string) => {
        if (!newRefereePassword.trim()) {
            toast({
                title: "비밀번호 변경 실패",
                description: "새 비밀번호를 입력해주세요.",
                variant: "destructive",
            });
            return;
        }

        if (newRefereePassword.length < 4) {
            toast({
                title: "비밀번호 변경 실패",
                description: "비밀번호는 최소 4자 이상이어야 합니다.",
                variant: "destructive",
            });
            return;
        }

        try {
            await updateRefereePassword(koreanId, newRefereePassword);
            toast({
                title: "성공",
                description: `${koreanId} 계정의 비밀번호가 변경되었습니다.`,
            });
            setEditingRefereePassword(null);
            setNewRefereePassword('');
            await loadRefereeAccounts(); // 목록 새로고침
        } catch (error: any) {
            toast({
                title: "비밀번호 변경 실패",
                description: error.message,
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
                <div className="flex gap-2">
                    <Button onClick={handleSaveChanges} disabled={loading}>
                        <Save className="mr-2 h-4 w-4" />
                        {loading ? '저장 중...' : '설정 저장'}
                    </Button>
                     <Button variant="outline" asChild>
                        <Link href="/admin">
                            <LogOut className="mr-2 h-4 w-4" />
                            관리자 패널로 돌아가기
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
                                <p className="text-xs text-muted-foreground">모든 심판 계정(referee1, referee2...)의 공용 비밀번호입니다. 설정 후 Firebase 콘솔에서 각 심판 계정의 비밀번호를 직접 변경해주셔야 합니다.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="captainPassword">자율채점 조장 공용 비밀번호</Label>
                                <Input id="captainPassword" value={config.captainPassword} onChange={handleInputChange} placeholder="예: 123456" />
                                <p className="text-xs text-muted-foreground">모든 자율채점 조장 계정(player1, player2...)의 공용 비밀번호입니다. 설정 후 Firebase 콘솔에서 각 조장 계정의 비밀번호를 직접 변경해주셔야 합니다.</p>
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

                                         <Card>
                         <CardHeader>
                             <CardTitle>조장 계정 관리</CardTitle>
                             <CardDescription>한글 아이디를 사용하는 조장 계정을 관리합니다.</CardDescription>
                         </CardHeader>
                         <CardContent className="space-y-4">
                                                         <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id="replaceCaptains" 
                                            checked={replaceCaptains}
                                            onCheckedChange={(checked) => {
                                                setReplaceCaptains(checked as boolean);
                                                if (checked) setAddMoreCaptains(false);
                                            }}
                                        />
                                        <Label htmlFor="replaceCaptains" className="text-sm">
                                            기존 계정 삭제 후 새로 생성
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id="addMoreCaptains" 
                                            checked={addMoreCaptains}
                                            onCheckedChange={(checked) => {
                                                setAddMoreCaptains(checked as boolean);
                                                if (checked) setReplaceCaptains(false);
                                            }}
                                        />
                                        <Label htmlFor="addMoreCaptains" className="text-sm">
                                            추가로 생성 (기존 계정 이후부터)
                                        </Label>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button 
                                        onClick={handleCreateBulkCaptains} 
                                        disabled={creatingCaptains}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        {creatingCaptains ? '생성 중...' : '100명 조장 계정 생성'}
                                    </Button>
                                    <Button 
                                        onClick={loadCaptainAccounts} 
                                        variant="outline"
                                    >
                                        목록 새로고침
                                    </Button>
                                </div>
                            </div>
                             
                             {captainAccounts.length > 0 && (
                                 <div className="mt-4">
                                     <div className="flex items-center justify-between mb-2">
                                         <h4 className="font-semibold">생성된 조장 계정 ({captainAccounts.length}개)</h4>
                                         <div className="flex gap-2">
                                             <Button
                                                 size="sm"
                                                 variant="outline"
                                                 onClick={() => handleBulkToggleCaptains(true)}
                                                 disabled={selectedCaptains.length === 0}
                                                 className="text-xs bg-green-600 hover:bg-green-700 text-white"
                                             >
                                                 선택 활성화 ({selectedCaptains.length})
                                             </Button>
                                             <Button
                                                 size="sm"
                                                 variant="outline"
                                                 onClick={() => handleBulkToggleCaptains(false)}
                                                 disabled={selectedCaptains.length === 0}
                                                 className="text-xs bg-red-600 hover:bg-red-700 text-white"
                                             >
                                                 선택 비활성화 ({selectedCaptains.length})
                                             </Button>
                                         </div>
                                     </div>
                                     <div className="max-h-60 overflow-y-auto border rounded p-2 bg-muted/30">
                                         <div className="grid grid-cols-1 gap-2 text-sm">
                                             <div className="flex items-center gap-2 p-2 bg-gray-100 rounded border-b">
                                                 <Checkbox
                                                     checked={selectedCaptains.length === captainAccounts.length && captainAccounts.length > 0}
                                                     onCheckedChange={handleSelectAllCaptains}
                                                 />
                                                 <span className="text-xs font-medium">전체 선택</span>
                                             </div>
                                             {captainAccounts.map((account) => (
                                                 <div key={account.id} className={`flex items-center justify-between p-3 rounded border ${account.isActive ? 'bg-white' : 'bg-gray-100'}`}>
                                                     <div className="flex items-center gap-2 flex-1">
                                                         <Checkbox
                                                             checked={selectedCaptains.includes(account.id)}
                                                             onCheckedChange={(checked) => handleSelectCaptain(account.id, checked as boolean)}
                                                         />
                                                         <div>
                                                             <div className={`font-medium ${!account.isActive ? 'text-gray-500' : ''}`}>{account.id}</div>
                                                             <div className="text-xs text-muted-foreground">
                                                                 {account.group} • 조{account.jo}
                                                                 {!account.isActive && <span className="ml-2 text-red-500">(비활성화)</span>}
                                                             </div>
                                                         </div>
                                                     </div>
                                                     <div className="flex gap-2">
                                                         {editingPassword === account.id ? (
                                                             <div className="flex gap-2 items-center">
                                                                 <Input
                                                                     type="text"
                                                                     placeholder="새 비밀번호"
                                                                     value={newPassword}
                                                                     onChange={(e) => setNewPassword(e.target.value)}
                                                                     className="w-24 text-xs"
                                                                     onKeyPress={(e) => e.key === 'Enter' && handleUpdatePassword(account.id)}
                                                                     onFocus={(e) => e.target.select()}
                                                                     autoFocus
                                                                 />
                                                                 <Button
                                                                     size="sm"
                                                                     onClick={() => handleUpdatePassword(account.id)}
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
                                                             <Button
                                                                 size="sm"
                                                                 variant="outline"
                                                                 onClick={() => {
                                                                     setEditingPassword(account.id);
                                                                     setNewPassword(account.password || '123456');
                                                                 }}
                                                                 className="text-xs"
                                                                 disabled={!account.isActive}
                                                             >
                                                                 비밀번호 변경
                                                             </Button>
                                                         )}
                                                         <Button
                                                             size="sm"
                                                             variant={account.isActive ? "destructive" : "default"}
                                                             onClick={() => handleToggleCaptainStatus(account.id, account.isActive)}
                                                             className={`text-xs ${account.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                                                         >
                                                             {account.isActive ? '비활성화' : '활성화'}
                                                         </Button>
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                     <p className="text-xs text-muted-foreground mt-2">
                                         초기 비밀번호: 123456 | 각 조장별로 개별 비밀번호 설정 가능
                                     </p>
                                 </div>
                             )}
                         </CardContent>
                     </Card>

                     <Card>
                         <CardHeader>
                             <CardTitle>심판 계정 관리</CardTitle>
                             <CardDescription>한글 아이디를 사용하는 심판 계정을 관리합니다.</CardDescription>
                         </CardHeader>
                         <CardContent className="space-y-4">
                                                         <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id="replaceReferees" 
                                            checked={replaceReferees}
                                            onCheckedChange={(checked) => {
                                                setReplaceReferees(checked as boolean);
                                                if (checked) setAddMoreReferees(false);
                                            }}
                                        />
                                        <Label htmlFor="replaceReferees" className="text-sm">
                                            기존 계정 삭제 후 새로 생성
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id="addMoreReferees" 
                                            checked={addMoreReferees}
                                            onCheckedChange={(checked) => {
                                                setAddMoreReferees(checked as boolean);
                                                if (checked) setReplaceReferees(false);
                                            }}
                                        />
                                        <Label htmlFor="addMoreReferees" className="text-sm">
                                            추가로 생성 (기존 계정 이후부터)
                                        </Label>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button 
                                        onClick={handleCreateBulkReferees} 
                                        disabled={creatingReferees}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {creatingReferees ? '생성 중...' : '9명 심판 계정 생성'}
                                    </Button>
                                    <Button 
                                        onClick={loadRefereeAccounts} 
                                        variant="outline"
                                    >
                                        목록 새로고침
                                    </Button>
                                </div>
                            </div>
                             
                             {refereeAccounts.length > 0 && (
                                 <div className="mt-4">
                                     <div className="flex items-center justify-between mb-2">
                                         <h4 className="font-semibold">생성된 심판 계정 ({refereeAccounts.length}개)</h4>
                                         <div className="flex gap-2">
                                             <Button
                                                 size="sm"
                                                 variant="outline"
                                                 onClick={() => handleBulkToggleReferees(true)}
                                                 disabled={selectedReferees.length === 0}
                                                 className="text-xs bg-green-600 hover:bg-green-700 text-white"
                                             >
                                                 선택 활성화 ({selectedReferees.length})
                                             </Button>
                                             <Button
                                                 size="sm"
                                                 variant="outline"
                                                 onClick={() => handleBulkToggleReferees(false)}
                                                 disabled={selectedReferees.length === 0}
                                                 className="text-xs bg-red-600 hover:bg-red-700 text-white"
                                             >
                                                 선택 비활성화 ({selectedReferees.length})
                                             </Button>
                                         </div>
                                     </div>
                                     <div className="max-h-60 overflow-y-auto border rounded p-2 bg-muted/30">
                                         <div className="grid grid-cols-1 gap-2 text-sm">
                                             <div className="flex items-center gap-2 p-2 bg-gray-100 rounded border-b">
                                                 <Checkbox
                                                     checked={selectedReferees.length === refereeAccounts.length && refereeAccounts.length > 0}
                                                     onCheckedChange={handleSelectAllReferees}
                                                 />
                                                 <span className="text-xs font-medium">전체 선택</span>
                                             </div>
                                             {refereeAccounts.map((account) => (
                                                 <div key={account.id} className="flex items-center justify-between p-3 bg-white rounded border">
                                                     <div className="flex items-center gap-2 flex-1">
                                                         <Checkbox
                                                             checked={selectedReferees.includes(account.id)}
                                                             onCheckedChange={(checked) => handleSelectReferee(account.id, checked as boolean)}
                                                         />
                                                         <div>
                                                             <div className="font-medium">{account.id}</div>
                                                             <div className="text-xs text-muted-foreground">
                                                                 {account.hole}번 홀 담당
                                                             </div>
                                                         </div>
                                                     </div>
                                                     <div className="flex gap-2">
                                                         {editingRefereePassword === account.id ? (
                                                             <div className="flex gap-2 items-center">
                                                                 <Input
                                                                     type="text"
                                                                     placeholder="새 비밀번호"
                                                                     value={newRefereePassword}
                                                                     onChange={(e) => setNewRefereePassword(e.target.value)}
                                                                     className="w-24 text-xs"
                                                                     onKeyPress={(e) => e.key === 'Enter' && handleUpdateRefereePassword(account.id)}
                                                                     onFocus={(e) => e.target.select()}
                                                                     autoFocus
                                                                 />
                                                                 <Button
                                                                     size="sm"
                                                                     onClick={() => handleUpdateRefereePassword(account.id)}
                                                                     className="text-xs bg-green-600 hover:bg-green-700"
                                                                 >
                                                                     저장
                                                                 </Button>
                                                                 <Button
                                                                     size="sm"
                                                                     variant="outline"
                                                                     onClick={() => {
                                                                         setEditingRefereePassword(null);
                                                                         setNewRefereePassword('');
                                                                     }}
                                                                     className="text-xs"
                                                                 >
                                                                     취소
                                                                 </Button>
                                                             </div>
                                                         ) : (
                                                             <Button
                                                                 size="sm"
                                                                 variant="outline"
                                                                 onClick={() => {
                                                                     setEditingRefereePassword(account.id);
                                                                     setNewRefereePassword(account.password || '123456');
                                                                 }}
                                                                 className="text-xs"
                                                             >
                                                                 비밀번호 변경
                                                             </Button>
                                                         )}
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                     <p className="text-xs text-muted-foreground mt-2">
                                         초기 비밀번호: 123456 | 각 심판별로 개별 비밀번호 설정 가능
                                     </p>
                                 </div>
                             )}
                         </CardContent>
                     </Card>
                </div>
            </div>
        </div>
    );
}
