"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { db, ensureAuthenticated } from "@/lib/firebase"
import { ref, get, onValue, set } from "firebase/database"
import { Printer } from "lucide-react"
import ManualScorecardPrint from "@/components/ManualScorecardPrint"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import { createRoot } from "react-dom/client"
import { Download, Loader2 } from "lucide-react"

export default function ManualScorecardPage() {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [tournament, setTournament] = useState<any>(null)
    const [groups, setGroups] = useState<any>({})
    const [courses, setCourses] = useState<any[]>([])
    const [players, setPlayers] = useState<any[]>([])

    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
    const [selectedDate, setSelectedDate] = useState("")
    const [selectedGroup, setSelectedGroup] = useState("")
    const [selectedCourses, setSelectedCourses] = useState<{ [key: string]: boolean }>({})
    const [showPrintView, setShowPrintView] = useState(false)
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
    const [isSavingImage, setIsSavingImage] = useState(false)

    // 로고 설정 state
    const [logoEnabled, setLogoEnabled] = useState(false)
    const [logoSize, setLogoSize] = useState(0.6)
    const [logoOpacity, setLogoOpacity] = useState(0.10)
    const [logoOffsetX, setLogoOffsetX] = useState(0)
    const [logoOffsetY, setLogoOffsetY] = useState(0)
    const [backgroundLogoUrl, setBackgroundLogoUrl] = useState<string>('')

    // 날짜 기본값 설정 (오늘 날짜)
    useEffect(() => {
        const today = new Date()
        const year = today.getFullYear()
        const month = String(today.getMonth() + 1).padStart(2, '0')
        const day = String(today.getDate()).padStart(2, '0')
        setSelectedDate(`${year}-${month}-${day}`)
    }, [])

    // Firebase 데이터 로드
    useEffect(() => {
        if (!db) return

        const loadData = async () => {
            try {
                setLoading(true)

                // 대회 정보 로드
                const tournamentRef = ref(db!, 'tournaments/current')
                const tournamentSnap = await get(tournamentRef)
                if (tournamentSnap.exists()) {
                    setTournament(tournamentSnap.val())
                }

                // 그룹 정보 로드
                const groupsRef = ref(db!, 'tournaments/current/groups')
                const groupsSnap = await get(groupsRef)
                if (groupsSnap.exists()) {
                    setGroups(groupsSnap.val())
                }

                // 코스 정보 로드
                const coursesRef = ref(db!, 'tournaments/current/courses')
                const coursesSnap = await get(coursesRef)
                if (coursesSnap.exists()) {
                    const coursesData = coursesSnap.val()
                    const coursesArray = Object.entries(coursesData)
                        .map(([id, course]: [string, any]) => ({
                            id: id,
                            ...course
                        }))
                        .filter((c: any) => c.isActive !== false)
                        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                    setCourses(coursesArray)

                    // 선택된 코스 초기화
                    const initialSelected: { [key: string]: boolean } = {}
                    coursesArray.forEach((c: any) => {
                        initialSelected[c.id] = false
                    })
                    setSelectedCourses(initialSelected)
                }

                // 선수 정보 로드
                const playersRef = ref(db!, 'players')
                const playersSnap = await get(playersRef)
                if (playersSnap.exists()) {
                    const playersData = playersSnap.val()
                    const playersArray = Object.entries(playersData)
                        .map(([id, player]: [string, any]) => ({
                            id,
                            ...player
                        }))
                    setPlayers(playersArray)
                }

                setLoading(false)
            } catch (error) {
                console.error('데이터 로드 실패:', error)
                toast({
                    title: '오류',
                    description: '데이터를 불러오는데 실패했습니다.',
                    variant: 'destructive'
                })
                setLoading(false)
            }
        }

        loadData()
    }, [toast])

    // 로고 불러오기
    useEffect(() => {
        const loadLogo = async () => {
            if (!db) return;
            try {
                await ensureAuthenticated();
                const logosRef = ref(db!, 'logos');
                const snapshot = await get(logosRef);
                if (snapshot.exists()) {
                    const logosData = snapshot.val();
                    const firstLogo = Object.values(logosData)[0] as any;
                    if (firstLogo?.url) {
                        setBackgroundLogoUrl(firstLogo.url);
                    }
                }
            } catch (error) {
                console.error('로고 불러오기 실패:', error);
            }
        };
        loadLogo();
    }, []);

    // 로고 설정 불러오기 및 저장
    useEffect(() => {
        if (!db) return;

        const loadInitialData = async () => {
            try {
                await ensureAuthenticated();
                const settingsSnapshot = await get(ref(db!, 'manualScorecard/settings'));
                if (settingsSnapshot.exists()) {
                    const settings = settingsSnapshot.val();
                    setLogoEnabled(settings.logoEnabled ?? false);
                    setLogoSize(settings.logoSize ?? 0.6);
                    setLogoOpacity(settings.logoOpacity ?? 0.10);
                    setLogoOffsetX(settings.logoOffsetX ?? 0);
                    setLogoOffsetY(settings.logoOffsetY ?? 0);
                }
            } catch (error) {
                console.error('로고 설정 불러오기 실패:', error);
            }
        };

        loadInitialData();

        // 실시간 구독으로 설정 변경 감지
        const unsubSettings = onValue(ref(db!, 'manualScorecard/settings'), (snapshot) => {
            if (snapshot.exists()) {
                const settings = snapshot.val();
                setLogoEnabled(settings.logoEnabled ?? false);
                setLogoSize(settings.logoSize ?? 0.6);
                setLogoOpacity(settings.logoOpacity ?? 0.10);
                setLogoOffsetX(settings.logoOffsetX ?? 0);
                setLogoOffsetY(settings.logoOffsetY ?? 0);
            }
        });

        return () => {
            unsubSettings();
        };
    }, []);

    // 로고 설정 업데이트 함수
    const updateLogoSettings = async (newSettings: { logoEnabled?: boolean; logoSize?: number; logoOpacity?: number; logoOffsetX?: number; logoOffsetY?: number }) => {
        if (!db) return;

        try {
            // Firebase에서 현재 설정을 불러와서 병합
            const currentSettingsSnapshot = await get(ref(db!, 'manualScorecard/settings'));
            let finalSettings;

            if (currentSettingsSnapshot.exists()) {
                const currentSettings = currentSettingsSnapshot.val();
                finalSettings = {
                    logoEnabled: currentSettings.logoEnabled ?? false,
                    logoSize: currentSettings.logoSize ?? 0.6,
                    logoOpacity: currentSettings.logoOpacity ?? 0.10,
                    logoOffsetX: currentSettings.logoOffsetX ?? 0,
                    logoOffsetY: currentSettings.logoOffsetY ?? 0,
                    ...newSettings
                };
            } else {
                finalSettings = {
                    logoEnabled: logoEnabled,
                    logoSize: logoSize,
                    logoOpacity: logoOpacity,
                    logoOffsetX: logoOffsetX,
                    logoOffsetY: logoOffsetY,
                    ...newSettings
                };
            }

            const settingsToSave = {
                logoEnabled: finalSettings.logoEnabled ?? false,
                logoSize: finalSettings.logoSize ?? 0.6,
                logoOpacity: finalSettings.logoOpacity ?? 0.10,
                logoOffsetX: finalSettings.logoOffsetX ?? 0,
                logoOffsetY: finalSettings.logoOffsetY ?? 0
            };

            // Firebase에 먼저 저장
            await set(ref(db!, 'manualScorecard/settings'), settingsToSave);

            // 그 다음 state 업데이트
            setLogoEnabled(settingsToSave.logoEnabled);
            setLogoSize(settingsToSave.logoSize);
            setLogoOpacity(settingsToSave.logoOpacity);
            setLogoOffsetX(settingsToSave.logoOffsetX);
            setLogoOffsetY(settingsToSave.logoOffsetY);
        } catch (error) {
            console.error('로고 설정 저장 실패:', error);
        }
    };

    const handleCourseToggle = (courseId: string) => {
        setSelectedCourses(prev => ({
            ...prev,
            [courseId]: !prev[courseId]
        }))
    }

    const handlePrint = () => {
        if (!selectedDate) {
            toast({
                title: '입력 오류',
                description: '날짜를 선택해주세요.',
                variant: 'destructive'
            })
            return
        }

        if (!selectedGroup) {
            toast({
                title: '입력 오류',
                description: '그룹을 선택해주세요.',
                variant: 'destructive'
            })
            return
        }

        const selectedCourseIds = Object.keys(selectedCourses).filter(id => selectedCourses[id])
        if (selectedCourseIds.length === 0) {
            toast({
                title: '입력 오류',
                description: '최소 하나의 코스를 선택해주세요.',
                variant: 'destructive'
            })
            return
        }

        setShowPrintView(true)
        setIsPrintModalOpen(false)

        // 인쇄 대화상자 열기
        setTimeout(() => {
            window.print()
        }, 500)
    }

    const handleClosePrintView = () => {
        setShowPrintView(false)
    }

    const handlePdfDownload = async () => {
        if (!selectedDate || !selectedGroup || Object.keys(selectedCourses).filter(id => selectedCourses[id]).length === 0) {
            toast({
                title: '입력 오류',
                description: '날짜, 그룹, 코스를 모두 선택해주세요.',
                variant: 'destructive'
            })
            return
        }

        try {
            setIsGeneratingPdf(true)
            toast({
                title: "PDF 생성 시작",
                description: "고화질 인쇄 데이터를 준비하고 있습니다..."
            })

            // 1. 임시 컨테이너 생성 (화면 밖)
            const container = document.createElement('div')
            container.style.position = 'fixed'
            container.style.left = '-9999px'
            container.style.top = '0'
            container.style.zIndex = '-9999'
            // A4 가로 크기보다 약간 크게 설정하여 짤림 방지
            container.style.width = '300mm'
            document.body.appendChild(container)

            // 2. ManualScorecardPrint 컴포넌트 렌더링
            const root = createRoot(container)

            // Promise를 사용하여 렌더링 및 이미지 로드 대기
            await new Promise<void>((resolve) => {
                root.render(
                    <ManualScorecardPrint
                        tournament={tournament}
                        selectedDate={selectedDate}
                        selectedGroup={selectedGroup}
                        selectedCourses={selectedCourses}
                        groups={groups}
                        courses={courses}
                        players={players}
                        onClose={() => { }} // 다운로드용이라 동작 안함
                        logoEnabled={logoEnabled}
                        logoSize={logoSize}
                        logoOpacity={logoOpacity}
                        logoOffsetX={logoOffsetX}
                        logoOffsetY={logoOffsetY}
                        backgroundLogoUrl={backgroundLogoUrl}
                    />
                )
                // 렌더링 및 로고 이미지 로딩 시간 대기 (넉넉하게)
                setTimeout(resolve, 2000)
            })

            // 3. 페이지별로 캡처하여 PDF 생성
            const pages = container.querySelectorAll('.print-page')
            if (pages.length === 0) {
                throw new Error('인쇄할 페이지가 없습니다.')
            }

            // A4 가로: 297mm x 210mm
            const pdf = new jsPDF('l', 'mm', 'a4')
            const pdfWidth = pdf.internal.pageSize.getWidth() // 297
            const pdfHeight = pdf.internal.pageSize.getHeight() // 210

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i] as HTMLElement

                toast({
                    description: `${i + 1}/${pages.length} 페이지 변환 중...`
                })

                // html2canvas로 캡처
                const canvas = await html2canvas(page, {
                    scale: 2, // 고해상도
                    logging: false,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff'
                })

                const imgData = canvas.toDataURL('image/png')

                if (i > 0) {
                    pdf.addPage()
                }

                // PDF에 이미지 추가 (여백 없이 꽉 차게)
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
            }

            // 4. 저장
            const fileName = `${selectedGroup}_${selectedDate}_수기채점표.pdf`
            pdf.save(fileName)

            toast({
                title: "PDF 저장 완료",
                description: "성공적으로 다운로드되었습니다."
            })

            // 정리
            setTimeout(() => {
                root.unmount()
                document.body.removeChild(container)
            }, 100)

        } catch (error) {
            console.error('PDF 생성 실패:', error)
            toast({
                title: 'PDF 생성 실패',
                description: '오류가 발생했습니다.',
                variant: 'destructive'
            })
        } finally {
            setIsGeneratingPdf(false)
        }
    }

    const handleSaveImage = async () => {
        if (!selectedDate || !selectedGroup || Object.keys(selectedCourses).filter(id => selectedCourses[id]).length === 0) {
            toast({
                title: '입력 오류',
                description: '날짜, 그룹, 코스를 모두 선택해주세요.',
                variant: 'destructive'
            })
            return
        }

        try {
            setIsSavingImage(true)
            toast({
                title: "이미지 변환 시작",
                description: "채점표를 이미지로 변환하고 있습니다..."
            })

            const container = document.createElement('div')
            container.style.position = 'fixed'
            container.style.left = '-9999px'
            container.style.top = '0'
            container.style.zIndex = '-9999'
            container.style.width = '300mm'
            document.body.appendChild(container)

            const root = createRoot(container)

            await new Promise<void>((resolve) => {
                root.render(
                    <ManualScorecardPrint
                        tournament={tournament}
                        selectedDate={selectedDate}
                        selectedGroup={selectedGroup}
                        selectedCourses={selectedCourses}
                        groups={groups}
                        courses={courses}
                        players={players}
                        onClose={() => { }}
                        logoEnabled={logoEnabled}
                        logoSize={logoSize}
                        logoOpacity={logoOpacity}
                        logoOffsetX={logoOffsetX}
                        logoOffsetY={logoOffsetY}
                        backgroundLogoUrl={backgroundLogoUrl}
                    />
                )
                setTimeout(resolve, 2000)
            })

            const pages = container.querySelectorAll('.print-page')
            if (pages.length === 0) throw new Error('페이지 없음')

            for (let i = 0; i < pages.length; i++) {
                toast({ description: `${i + 1}/${pages.length}장 저장 중...` })

                const page = pages[i] as HTMLElement
                const canvas = await html2canvas(page, {
                    scale: 2,
                    logging: false,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff'
                })

                const link = document.createElement('a')
                link.download = `${selectedGroup}_${selectedDate}_수기채점표_${i + 1}.png`
                link.href = canvas.toDataURL('image/png')
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)

                // 브라우저 부하 방지용 딜레이
                if (i < pages.length - 1) {
                    await new Promise(r => setTimeout(r, 500))
                }
            }

            toast({
                title: "이미지 저장 완료",
                description: "모든 페이지가 저장되었습니다."
            })

            setTimeout(() => {
                root.unmount()
                document.body.removeChild(container)
            }, 100)

        } catch (error) {
            console.error('이미지 저장 실패:', error)
            toast({
                title: '저장 실패',
                description: '오류가 발생했습니다.',
                variant: 'destructive'
            })
        } finally {
            setIsSavingImage(false)
        }
    }
    const getEmptySlotForPreview = () => {
        if (!selectedGroup) return null;

        const selectedCourseIds = Object.keys(selectedCourses).filter(id => selectedCourses[id]);
        if (selectedCourseIds.length === 0) return null;

        // 선택된 코스를 정렬
        const selectedCoursesSorted = courses
            .filter(c => selectedCourseIds.includes(c.id))
            .sort((a, b) => {
                if (!selectedGroup || !groups[selectedGroup]) {
                    return (a.order || 0) - (b.order || 0);
                }
                const groupCourses = groups[selectedGroup]?.courses || {};
                const orderA = (typeof groupCourses[a.id] === 'number' && groupCourses[a.id] > 0)
                    ? groupCourses[a.id]
                    : (a.order || 999);
                const orderB = (typeof groupCourses[b.id] === 'number' && groupCourses[b.id] > 0)
                    ? groupCourses[b.id]
                    : (b.order || 999);
                return orderA - orderB;
            });

        // 첫 페이지의 코스들 (최대 3개)
        const firstPageCourses = selectedCoursesSorted.slice(0, 3);

        // 빈 슬롯 찾기 (0, 1, 2 중에서)
        for (let i = 0; i < 3; i++) {
            if (!firstPageCourses[i]) {
                return i; // 빈 슬롯 인덱스 반환
            }
        }

        // 첫 페이지가 모두 채워져 있으면 첫 번째 슬롯(인덱스 0) 반환
        return 0;
    }

    const emptySlotIndex = getEmptySlotForPreview();

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>수기 채점표</CardTitle>
                        <CardDescription>로딩 중...</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        )
    }

    if (showPrintView) {
        return (
            <ManualScorecardPrint
                tournament={tournament}
                selectedDate={selectedDate}
                selectedGroup={selectedGroup}
                selectedCourses={selectedCourses}
                groups={groups}
                courses={courses}
                players={players}
                onClose={handleClosePrintView}
                logoEnabled={logoEnabled}
                logoSize={logoSize}
                logoOpacity={logoOpacity}
                logoOffsetX={logoOffsetX}
                logoOffsetY={logoOffsetY}
                backgroundLogoUrl={backgroundLogoUrl}
            />
        )
    }

    const groupNames = Object.keys(groups).sort()

    return (
        <div className="container mx-auto p-6">
            <Card>
                <CardHeader>
                    <CardTitle>수기 채점표</CardTitle>
                    <CardDescription>인쇄할 채점표를 설정하세요.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Button onClick={() => setIsPrintModalOpen(true)}>
                            <Printer className="mr-2 h-4 w-4" />
                            채점표 인쇄 설정
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isPrintModalOpen} onOpenChange={setIsPrintModalOpen}>
                <DialogContent className="max-w-[95vw] w-full lg:max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader className="flex flex-row items-center justify-between pb-4 border-b mb-4 space-y-0 shrink-0">
                        <div className="space-y-1 text-left">
                            <DialogTitle>채점표 인쇄 설정</DialogTitle>
                            <DialogDescription>
                                날짜, 그룹, 코스를 선택하고 인쇄 버튼을 클릭하세요.
                            </DialogDescription>
                        </div>
                        {backgroundLogoUrl && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-600">배경 로고 설정</span>
                                <Button
                                    size="sm"
                                    variant={logoEnabled ? 'default' : 'outline'}
                                    onClick={() => {
                                        const newEnabled = !logoEnabled;
                                        updateLogoSettings({ logoEnabled: newEnabled });
                                    }}
                                    className={`h-8 w-16 ${logoEnabled ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                                >
                                    {logoEnabled ? 'ON' : 'OFF'}
                                </Button>
                            </div>
                        )}
                    </DialogHeader>

                    <div className="flex gap-4 flex-1 min-h-0 overflow-hidden flex-row">
                        {/* 좌측: 설정 */}
                        <div className="w-[350px] shrink-0 border rounded-lg p-4 bg-gray-50 overflow-y-auto">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="date">날짜 (Date)</Label>
                                    <Input
                                        id="date"
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>그룹 (Group)</Label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-4">
                                        {groupNames.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">그룹이 없습니다.</p>
                                        ) : (
                                            groupNames.map((groupName) => (
                                                <div key={groupName} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`group-${groupName}`}
                                                        checked={selectedGroup === groupName}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedGroup(groupName)
                                                            } else {
                                                                setSelectedGroup("")
                                                            }
                                                        }}
                                                    />
                                                    <Label
                                                        htmlFor={`group-${groupName}`}
                                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                                    >
                                                        {groupName}
                                                    </Label>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>코스 (Course)</Label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-4">
                                        {courses.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">코스가 없습니다.</p>
                                        ) : (
                                            courses.map((course) => (
                                                <div key={course.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`course-${course.id}`}
                                                        checked={selectedCourses[course.id] || false}
                                                        onCheckedChange={() => handleCourseToggle(course.id)}
                                                    />
                                                    <Label
                                                        htmlFor={`course-${course.id}`}
                                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                                    >
                                                        {course.name || `코스 ${course.id}`}
                                                    </Label>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 중앙: 미리보기 + 우측 패널 */}
                        <div className="flex-1 min-w-0 border rounded-lg p-4 bg-gray-50 flex flex-col">
                            <div className="flex items-center justify-between mb-2 shrink-0">
                                <label className="text-sm font-medium">미리보기</label>
                            </div>

                            <div className="flex gap-4 h-full min-h-0">
                                {/* Preview Box */}
                                <div className="flex-1 border rounded bg-gray-100 p-4 flex items-center justify-center overflow-hidden relative">
                                    <div
                                        className="bg-white shadow-lg relative transition-all duration-300 origin-center"
                                        style={{
                                            aspectRatio: '297/210', // A4 landscape
                                            height: '100%',
                                            maxHeight: '450px',
                                            width: 'auto',
                                            position: 'relative',
                                        }}
                                    >
                                        {/* Logo Overlay는 빈 슬롯 내부에 표시되므로 여기서는 제거 */}

                                        {/* Scaled Content */}
                                        <div style={{
                                            zoom: 0.25,
                                            width: '100%',
                                            height: '100%',
                                            position: 'relative',
                                            zIndex: 1,
                                            padding: '4mm',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column'
                                        }}>
                                            {/* 헤더 */}
                                            <div className="mb-1" style={{ flexShrink: 0 }}>
                                                <div className="text-lg font-bold text-center mb-1">
                                                    {tournament?.name || '파크골프 토너먼트'}
                                                </div>
                                                <div className="flex justify-between items-start mb-1">
                                                    <div>
                                                        <div className="text-sm font-bold">
                                                            그룹: {selectedGroup || '그룹명'}
                                                        </div>
                                                        <div className="text-xs font-bold">
                                                            1조
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-gray-600">
                                                            날짜: {selectedDate || new Date().toISOString().slice(0, 10)}
                                                        </div>
                                                        <div className="text-xs font-semibold">
                                                            심판 확인
                                                        </div>
                                                        <div className="border border-black" style={{ width: '50px', height: '20px' }}></div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 코스별 채점표 - 가로로 3개 배치 (빈 슬롯 포함) */}
                                            <div className="flex-1 grid grid-cols-3 gap-1" style={{ minHeight: 0 }}>
                                                {[0, 1, 2].map((slotIndex) => {
                                                    const selectedCourseIds = Object.keys(selectedCourses).filter(id => selectedCourses[id]);
                                                    const selectedCoursesSorted = courses
                                                        .filter(c => selectedCourseIds.includes(c.id))
                                                        .sort((a, b) => {
                                                            if (!selectedGroup || !groups[selectedGroup]) {
                                                                return (a.order || 0) - (b.order || 0);
                                                            }
                                                            const groupCourses = groups[selectedGroup]?.courses || {};
                                                            const orderA = (typeof groupCourses[a.id] === 'number' && groupCourses[a.id] > 0)
                                                                ? groupCourses[a.id]
                                                                : (a.order || 999);
                                                            const orderB = (typeof groupCourses[b.id] === 'number' && groupCourses[b.id] > 0)
                                                                ? groupCourses[b.id]
                                                                : (b.order || 999);
                                                            return orderA - orderB;
                                                        });
                                                    const firstPageCourses = selectedCoursesSorted.slice(0, 3);
                                                    const course = firstPageCourses[slotIndex];

                                                    // 빈 슬롯인 경우 (로고가 들어갈 위치)
                                                    if (!course || (emptySlotIndex !== null && emptySlotIndex === slotIndex)) {
                                                        return (
                                                            <div
                                                                key={`preview-empty-${slotIndex}`}
                                                                className="course-container"
                                                                style={{
                                                                    border: '3px solid #f9fafb',
                                                                    backgroundColor: '#ffffff',
                                                                    padding: '6px',
                                                                    borderRadius: '4px',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    minHeight: 0,
                                                                    position: 'relative'
                                                                }}
                                                            >
                                                                {/* 배경 로고 (빈 슬롯에만 표시) */}
                                                                {logoEnabled && backgroundLogoUrl && (
                                                                    <img
                                                                        src={backgroundLogoUrl}
                                                                        alt=""
                                                                        className="logo-background"
                                                                        style={{
                                                                            position: 'absolute',
                                                                            top: `calc(50% + ${logoOffsetY}px)`,
                                                                            left: `calc(50% + ${logoOffsetX}px)`,
                                                                            transform: 'translate(-50%, -50%)',
                                                                            width: `${logoSize * 100}%`,
                                                                            height: 'auto',
                                                                            maxWidth: `${logoSize * 100}%`,
                                                                            maxHeight: `${logoSize * 100}%`,
                                                                            objectFit: 'contain',
                                                                            opacity: logoOpacity,
                                                                            zIndex: 1,
                                                                            pointerEvents: 'none',
                                                                            userSelect: 'none'
                                                                        }}
                                                                    />
                                                                )}

                                                                {/* 빈 슬롯 표시 - 조명 */}
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    top: '50%',
                                                                    left: '50%',
                                                                    transform: 'translate(-50%, -50%)',
                                                                    zIndex: 20,
                                                                    pointerEvents: 'none',
                                                                    textAlign: 'center',
                                                                    fontSize: '24px',
                                                                    fontWeight: 'bold',
                                                                    color: '#a8a7a7'
                                                                }}>
                                                                    1조
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    // 채워진 슬롯
                                                    return (
                                                        <div
                                                            key={`preview-course-${slotIndex}`}
                                                            className="course-container"
                                                            style={{
                                                                border: '2px solid #e2e8f0',
                                                                backgroundColor: '#f8fafc',
                                                                padding: '6px',
                                                                borderRadius: '4px',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                minHeight: 0
                                                            }}
                                                        >
                                                            <div className="text-xs font-bold mb-1" style={{ color: '#334155' }}>
                                                                {course.name || `코스 ${course.id}`}
                                                            </div>
                                                            <div className="border border-slate-200 rounded-sm overflow-hidden flex-1">
                                                                <div className="bg-slate-100 p-1 border-b border-slate-200 grid grid-cols-3 gap-1 text-xs">
                                                                    <div className="font-bold text-slate-500">이름</div>
                                                                    <div className="font-bold text-slate-500">소속</div>
                                                                    <div className="font-bold text-slate-500">점수</div>
                                                                </div>
                                                                <div className="bg-white">
                                                                    <div className="p-1 border-b border-slate-200 grid grid-cols-3 gap-1 text-xs">
                                                                        <div className="text-slate-600">홍길동</div>
                                                                        <div className="text-slate-600">소속1</div>
                                                                        <div className="text-slate-600">-</div>
                                                                    </div>
                                                                    <div className="p-1 grid grid-cols-3 gap-1 text-xs">
                                                                        <div className="text-slate-600">김철수</div>
                                                                        <div className="text-slate-600">소속2</div>
                                                                        <div className="text-slate-600">-</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 우측: 로고 설정 패널 (ON일 때만 표시) */}
                                {logoEnabled && backgroundLogoUrl && (
                                    <div className="w-[280px] shrink-0 border rounded-lg p-4 bg-blue-50 overflow-y-auto">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="font-semibold text-sm">로고 상세 설정</h4>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">로고 크기 ({Math.round(logoSize * 100)}%)</Label>
                                                <Input
                                                    type="range"
                                                    min="0.1"
                                                    max="1.0"
                                                    step="0.05"
                                                    value={logoSize}
                                                    onChange={(e) => updateLogoSettings({ logoSize: Number(e.target.value) })}
                                                    className="w-full h-8"
                                                />
                                                <Input
                                                    type="number"
                                                    min="0.1"
                                                    max="1.0"
                                                    step="0.05"
                                                    value={logoSize}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value);
                                                        if (val >= 0.1 && val <= 1.0) {
                                                            updateLogoSettings({ logoSize: val });
                                                        }
                                                    }}
                                                    className="w-full text-xs h-8"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">로고 진하기 ({Math.round(logoOpacity * 100)}%)</Label>
                                                <Input
                                                    type="range"
                                                    min="0.0"
                                                    max="1.0"
                                                    step="0.01"
                                                    value={logoOpacity}
                                                    onChange={(e) => updateLogoSettings({ logoOpacity: Number(e.target.value) })}
                                                    className="w-full h-8"
                                                />
                                                <Input
                                                    type="number"
                                                    min="0.0"
                                                    max="1.0"
                                                    step="0.01"
                                                    value={logoOpacity}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value);
                                                        if (val >= 0.0 && val <= 1.0) {
                                                            updateLogoSettings({ logoOpacity: val });
                                                        }
                                                    }}
                                                    className="w-full text-xs h-8"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">가로 위치 (X: {logoOffsetX}px)</Label>
                                                <Input
                                                    type="range"
                                                    min="-100"
                                                    max="100"
                                                    step="1"
                                                    value={logoOffsetX}
                                                    onChange={(e) => updateLogoSettings({ logoOffsetX: Number(e.target.value) })}
                                                    className="w-full h-8"
                                                />
                                                <Input
                                                    type="number"
                                                    min="-100"
                                                    max="100"
                                                    step="1"
                                                    value={logoOffsetX}
                                                    onChange={(e) => updateLogoSettings({ logoOffsetX: Number(e.target.value) })}
                                                    className="w-full text-xs h-8"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">세로 위치 (Y: {logoOffsetY}px)</Label>
                                                <Input
                                                    type="range"
                                                    min="-100"
                                                    max="100"
                                                    step="1"
                                                    value={logoOffsetY}
                                                    onChange={(e) => updateLogoSettings({ logoOffsetY: Number(e.target.value) })}
                                                    className="w-full h-8"
                                                />
                                                <Input
                                                    type="number"
                                                    min="-100"
                                                    max="100"
                                                    step="1"
                                                    value={logoOffsetY}
                                                    onChange={(e) => updateLogoSettings({ logoOffsetY: Number(e.target.value) })}
                                                    className="w-full text-xs h-8"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="flex gap-2 shrink-0 mt-4">
                        <Button variant="outline" onClick={() => setIsPrintModalOpen(false)}>
                            취소
                        </Button>
                        <Button onClick={handlePrint}>
                            <Printer className="mr-2 h-4 w-4" />
                            인쇄
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handlePdfDownload}
                            disabled={isGeneratingPdf || isSavingImage}
                            className="bg-orange-500 hover:bg-orange-600 text-white"
                        >
                            {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            PDF 저장(백업용)
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleSaveImage}
                            disabled={isGeneratingPdf || isSavingImage}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                            {isSavingImage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            이미지 저장
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}


