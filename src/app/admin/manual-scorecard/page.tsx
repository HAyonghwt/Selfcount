"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/lib/firebase"
import { ref, get, onValue } from "firebase/database"
import { Printer } from "lucide-react"
import ManualScorecardPrint from "@/components/ManualScorecardPrint"

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
                const tournamentRef = ref(db, 'tournaments/current')
                const tournamentSnap = await get(tournamentRef)
                if (tournamentSnap.exists()) {
                    setTournament(tournamentSnap.val())
                }

                // 그룹 정보 로드
                const groupsRef = ref(db, 'tournaments/current/groups')
                const groupsSnap = await get(groupsRef)
                if (groupsSnap.exists()) {
                    setGroups(groupsSnap.val())
                }

                // 코스 정보 로드
                const coursesRef = ref(db, 'tournaments/current/courses')
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
                const playersRef = ref(db, 'players')
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
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>채점표 인쇄 설정</DialogTitle>
                        <DialogDescription>
                            날짜, 그룹, 코스를 선택하고 인쇄 버튼을 클릭하세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
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
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPrintModalOpen(false)}>
                            취소
                        </Button>
                        <Button onClick={handlePrint}>
                            <Printer className="mr-2 h-4 w-4" />
                            인쇄
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}


