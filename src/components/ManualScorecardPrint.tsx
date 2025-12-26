"use client"

import { useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

interface ManualScorecardPrintProps {
    tournament: any
    selectedDate: string
    selectedGroup: string
    selectedCourses: { [key: string]: boolean }
    groups: any
    courses: any[]
    players: any[]
    onClose: () => void
}

// 코스별 테마색
const getCourseTheme = (courseName: string): { border: string; bg: string; text: string } => {
    const name = courseName.toUpperCase()
    if (name.includes('A')) {
        return { border: '#dc3545', bg: '#ffebee', text: '#000000' }
    } else if (name.includes('B')) {
        return { border: '#0d6efd', bg: '#e3f2fd', text: '#000000' }
    } else if (name.includes('C')) {
        return { border: '#FEE500', bg: '#fff8e1', text: '#000000' }
    } else if (name.includes('D')) {
        return { border: '#e8e8e8', bg: '#f5f5f5', text: '#000000' }
    }
    // 기본값
    return { border: '#e8e8e8', bg: '#f5f5f5', text: '#000000' }
}

export default function ManualScorecardPrint({
    tournament,
    selectedDate,
    selectedGroup,
    selectedCourses,
    groups,
    courses,
    players,
    onClose
}: ManualScorecardPrintProps) {
    // PDF 파일명을 그룹명으로 설정
    useEffect(() => {
        const originalTitle = document.title
        if (selectedGroup) {
            document.title = `${selectedGroup}_수기채점표`
        }

        return () => {
            document.title = originalTitle
        }
    }, [selectedGroup])

    // 선택된 코스 필터링 및 정렬 (그룹에 배정된 코스의 order로 정렬)
    const selectedCourseList = useMemo(() => {
        if (!selectedGroup || !groups[selectedGroup]) {
            // 그룹이 선택되지 않았거나 그룹 정보가 없으면 기존 방식으로 정렬
            return courses
                .filter(c => selectedCourses[c.id])
                .sort((a, b) => (a.order || 0) - (b.order || 0))
        }

        // 그룹에 배정된 코스 정보 가져오기
        const groupCourses = groups[selectedGroup]?.courses || {}

        // 배정된 코스의 order 정보를 포함한 배열 생성
        const coursesWithGroupOrder = courses
            .filter(c => selectedCourses[c.id])
            .map(c => {
                const groupOrder = groupCourses[c.id]
                // groupOrder가 number이고 0보다 크면 사용, 아니면 코스의 기본 order 사용
                const order = (typeof groupOrder === 'number' && groupOrder > 0)
                    ? groupOrder
                    : (c.order || 999)
                return { ...c, groupOrder: order }
            })
            .sort((a, b) => a.groupOrder - b.groupOrder)

        return coursesWithGroupOrder
    }, [courses, selectedCourses, selectedGroup, groups])

    // 선택된 그룹의 모든 조 가져오기
    const josInGroup = useMemo(() => {
        if (!selectedGroup) return []
        const groupPlayers = players.filter(p => p.group === selectedGroup)
        const jos = new Set<string>()
        groupPlayers.forEach(p => {
            if (p.jo) {
                jos.add(String(p.jo))
            }
        })
        return Array.from(jos).sort((a, b) => {
            const numA = parseInt(a)
            const numB = parseInt(b)
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB
            }
            if (!isNaN(numA)) return -1
            if (!isNaN(numB)) return 1
            return a.localeCompare(b)
        })
    }, [selectedGroup, players])

    // 조별 선수 목록
    const getPlayersByJo = (jo: string) => {
        return players
            .filter(p => p.group === selectedGroup && String(p.jo) === jo)
            .sort((a, b) => {
                // uploadOrder가 있으면 그것으로 정렬
                if (a.uploadOrder !== undefined && b.uploadOrder !== undefined) {
                    return (a.uploadOrder || 0) - (b.uploadOrder || 0)
                }
                // 없으면 이름으로 정렬
                const nameA = a.type === 'team' ? `${a.p1_name}/${a.p2_name}` : a.name
                const nameB = b.type === 'team' ? `${b.p1_name}/${b.p2_name}` : b.name
                return nameA.localeCompare(nameB)
            })
    }

    // 날짜 포맷팅
    const formatDate = (dateStr: string) => {
        if (!dateStr) return ""
        const date = new Date(dateStr)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}년 ${month}월 ${day}일`
    }

    // 그룹명 영어 번역
    const translateGroupName = (groupName: string): string => {
        if (!groupName) return ""

        const name = groupName.trim()

        // 남시니어 → Male Senior
        if (name === "남시니어" || name.includes("남시니어")) {
            return "Male Senior"
        }
        // 남자일반 → Men's General
        if (name === "남자일반" || name.includes("남자일반")) {
            return "Men's General"
        }
        // 여시니어 → Female Senior
        if (name === "여시니어" || name.includes("여시니어")) {
            return "Female Senior"
        }
        // 여자일반 → Women's General
        if (name === "여자일반" || name.includes("여자일반")) {
            return "Women's General"
        }
        // 남자부 → Men's Division
        if (name === "남자부" || name.includes("남자부")) {
            return "Men's Division"
        }
        // 여자부 → Women's Division
        if (name === "여자부" || name.includes("여자부")) {
            return "Women's Division"
        }
        // 남자 → Male
        if (name === "남자" || name.startsWith("남자")) {
            return name.replace("남자", "Male")
        }
        // 여자 → Female
        if (name === "여자" || name.startsWith("여자")) {
            return name.replace("여자", "Female")
        }

        // 기본값: 그룹명 그대로 반환
        return name
    }

    // 코스를 3개씩 묶어서 페이지 단위로 나누기
    const coursePages = useMemo(() => {
        const pages: any[][] = []
        for (let i = 0; i < selectedCourseList.length; i += 3) {
            pages.push(selectedCourseList.slice(i, i + 3))
        }
        return pages
    }, [selectedCourseList])

    if (selectedCourseList.length === 0 || josInGroup.length === 0) {
        return (
            <div className="p-6">
                <p>인쇄할 데이터가 없습니다.</p>
                <Button onClick={onClose} className="mt-4">
                    <X className="mr-2 h-4 w-4" />
                    닫기
                </Button>
            </div>
        )
    }

    return (
        <>
            <style jsx global>{`
                @page {
                    size: A4 landscape;
                    margin: 0;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .print-page {
                        page-break-after: always;
                        width: 297mm;
                        height: 210mm;
                        padding: 1mm;
                        box-sizing: border-box;
                        display: flex;
                        flex-direction: column;
                    }
                    .print-page:last-child {
                        page-break-after: auto;
                    }
                    .course-container {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        min-height: 0;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                    /* 사이드바 및 불필요한 레이아웃 인쇄 시 숨기기 */
                    [data-sidebar="trigger"], 
                    .sidebar-wrapper,
                    nav,
                    header {
                        display: none !important;
                    }
                }
                @media screen {
                    .print-page {
                        width: 297mm;
                        height: 210mm;
                        padding: 1mm;
                        margin: 20px auto;
                        background: white;
                        box-shadow: 0 0 10px rgba(0,0,0,0.1);
                        display: flex;
                        flex-direction: column;
                    }
                    .course-container {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        min-height: 0;
                    }
                }
            `}</style>
            <div className="no-print fixed top-4 right-4 z-50">
                <Button onClick={onClose} variant="outline">
                    <X className="mr-2 h-4 w-4" />
                    닫기
                </Button>
            </div>

            {josInGroup.map((jo, joIndex) => (
                coursePages.map((pageCourses, pageIndex) => (
                    <div key={`${jo}-${pageIndex}`} className="print-page">
                        {/* 헤더 */}
                        <div className="mb-1" style={{ flexShrink: 0 }}>
                            {/* 큰 제목: 대회명 가운데 정렬 */}
                            <h1 className="text-2xl font-bold text-center mb-1">
                                {tournament?.name || '파크골프 토너먼트'}
                            </h1>

                            <div className="flex justify-between items-start">
                                {/* 왼쪽: 그룹명과 조 이름 */}
                                <div>
                                    <div className="text-2xl font-bold">
                                        그룹: {selectedGroup}
                                    </div>
                                    <div className="text-sm text-gray-600 mt-0.5">
                                        Group: {translateGroupName(selectedGroup)}
                                    </div>
                                    <div className="text-2xl font-bold mt-2">
                                        {jo} 조
                                    </div>
                                    <div className="text-sm text-gray-600 mt-0.5">
                                        Team: {jo}
                                    </div>
                                </div>

                                {/* 오른쪽: 심판 확인 및 날짜 */}
                                <div className="flex items-end gap-4">
                                    <div className="text-right pb-1">
                                        <div className="text-xs text-gray-600">
                                            날짜: {formatDate(selectedDate)}
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            Date: {selectedDate}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-semibold">
                                            심판 확인
                                        </div>
                                        <div className="text-[10px] text-gray-600 mb-1">
                                            Referee Confirmation
                                        </div>
                                        <div className="border-2 border-black" style={{ width: '130px', height: '45px' }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 코스별 채점표 - 가로로 3개 배치 */}
                        <div className="flex-1 grid grid-cols-3 gap-1" style={{ minHeight: 0 }}>
                            {[0, 1, 2].map((slotIndex) => {
                                const course = pageCourses[slotIndex]
                                // 빈 슬롯인 경우 placeholder 표시
                                if (!course) {
                                    const coursePlayers = getPlayersByJo(jo)
                                    
                                    // 조명 생성: 조 이름만 표시 (예: A-1-3)
                                    // 모든 빈 슬롯에 조명 표시 (Good luck이 있던 자리)
                                    // 조 이름만 표시
                                    const joNameText = jo
                                    
                                    return (
                                        <div
                                            key={`placeholder-${slotIndex}`}
                                            className="course-container"
                                            style={{
                                                border: `3px solid #f9fafb`,
                                                backgroundColor: '#ffffff',
                                                padding: '6px',
                                                borderRadius: '4px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                minHeight: 0,
                                                position: 'relative'
                                            }}
                                        >
                                            {/* 조명 표시 (모든 빈 슬롯에 - Good luck이 있던 자리) */}
                                            {coursePlayers.length > 0 && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '50%',
                                                    left: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    zIndex: 10,
                                                    pointerEvents: 'none',
                                                    userSelect: 'none',
                                                    textAlign: 'center',
                                                    lineHeight: '1.3'
                                                }}>
                                                    <div style={{
                                                        fontSize: '40px',
                                                        fontWeight: 'bold',
                                                        color: '#a8a7a7',
                                                        whiteSpace: 'nowrap',
                                                        textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                    }}>
                                                        {joNameText}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 코스 헤더 */}
                                            <div
                                                className="text-sm font-bold py-1 mb-1"
                                                style={{
                                                    backgroundColor: '#f9fafb',
                                                    color: '#f2f3f6',
                                                    borderRadius: '2px',
                                                    flexShrink: 0,
                                                    position: 'relative',
                                                    textAlign: 'center',
                                                    paddingLeft: '8px',
                                                    paddingRight: '8px'
                                                }}
                                            >
                                                <span>코스</span>
                                            </div>

                                            {/* 점수표 */}
                                            <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
                                                <table className="w-full border-collapse text-xs" style={{ border: `2px solid #f9fafb`, height: '100%' }}>
                                                    <thead>
                                                        {/* 공색상 입력 칸 */}
                                                        <tr>
                                                            <td colSpan={2} className="px-1 py-0.5 text-center text-xs" style={{ backgroundColor: '#f9fafb', color: '#f2f3f6', border: `1px solid #f9fafb` }}>
                                                                공색상 (Ball Color)
                                                            </td>
                                                            {[0, 1, 2, 3].map((idx) => (
                                                                <td key={idx} className="px-0.5 py-0.5" style={{ height: '16px', border: `1px solid #f9fafb` }}>
                                                                    <div className="h-4 w-full"></div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        <tr style={{ backgroundColor: '#f9fafb', color: '#f2f3f6' }}>
                                                            <th className="px-1 py-0.5 text-center font-bold" style={{ width: '8%', border: `1px solid #f9fafb` }}>
                                                                Hole
                                                            </th>
                                                            <th className="px-1 py-0.5 text-center font-bold" style={{ width: '8%', border: `1px solid #f9fafb` }}>
                                                                Par
                                                            </th>
                                                            {[0, 1, 2, 3].map((idx) => (
                                                                <th key={idx} className="px-0.5 text-center font-bold" style={{
                                                                    width: '21%',
                                                                    height: '28px',
                                                                    fontSize: '14px',
                                                                    padding: '4px 2px',
                                                                    verticalAlign: 'middle',
                                                                    border: `1px solid #f9fafb`
                                                                }}>
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((holeNum) => (
                                                            <tr key={holeNum} style={{ height: '32px' }}>
                                                                <td className="px-1 text-center font-bold" style={{ backgroundColor: '#f9fafb', color: '#f2f3f6', padding: '2px', verticalAlign: 'middle', border: `1px solid #f9fafb` }}>
                                                                    {holeNum}
                                                                </td>
                                                                <td className="px-1 text-center font-semibold" style={{ padding: '2px', verticalAlign: 'middle', color: '#f2f3f6', border: `1px solid #f9fafb` }}>
                                                                    3
                                                                </td>
                                                                {[0, 1, 2, 3].map((idx) => (
                                                                    <td key={idx} className="" style={{ padding: '0', height: '32px', verticalAlign: 'top', border: `1px solid #f9fafb` }}>
                                                                        <div className="w-full relative" style={{ display: 'flex', height: '100%', minHeight: '32px' }}>
                                                                            <div className="flex-1" style={{ borderRight: '1px solid #f9fafb', height: '100%', margin: 0 }}></div>
                                                                            <div className="flex-1" style={{ height: '100%', margin: 0 }}></div>
                                                                        </div>
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                        {/* 합계 행 */}
                                                        <tr style={{ height: '32px' }}>
                                                            <td colSpan={2} className="px-1 text-center font-bold text-xs" style={{ padding: '2px', verticalAlign: 'middle', color: '#f2f3f6', border: `1px solid #f9fafb` }}>
                                                                합계 (Total)
                                                            </td>
                                                            {[0, 1, 2, 3].map((idx) => (
                                                                <td key={idx} className="" style={{ padding: '0', height: '32px', verticalAlign: 'top', border: `1px solid #f9fafb` }}>
                                                                    <div className="h-full w-full"></div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        {/* 선수 사인 행 */}
                                                        <tr style={{ height: '18px' }}>
                                                            <td colSpan={2} className="px-1 text-center font-bold text-xs" style={{ padding: '2px', verticalAlign: 'middle', color: '#f2f3f6', border: `1px solid #f9fafb` }}>
                                                                선수 사인 (Player Signature)
                                                            </td>
                                                            {[0, 1, 2, 3].map((idx) => (
                                                                <td key={idx} className="" style={{ padding: '0', height: '18px', verticalAlign: 'top', border: `1px solid #f9fafb` }}>
                                                                    <div className="h-full w-full"></div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )
                                }

                                // 실제 코스 데이터가 있는 경우
                                const theme = getCourseTheme(course.name || '')
                                const coursePlayers = getPlayersByJo(jo)

                                return (
                                    <div
                                        key={course.id}
                                        className="course-container"
                                        style={{
                                            border: `3px solid ${theme.border}`,
                                            backgroundColor: theme.bg,
                                            padding: '6px',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            minHeight: 0
                                        }}
                                    >
                                        {/* 코스 헤더 */}
                                        <div
                                            className="text-sm font-bold py-1 mb-1"
                                            style={{
                                                backgroundColor: theme.border,
                                                color: theme.bg === '#ffffff' || theme.bg === '#fff8e1' || theme.bg === '#f5f5f5' ? '#000000' : '#ffffff',
                                                borderRadius: '2px',
                                                flexShrink: 0,
                                                position: 'relative',
                                                textAlign: 'center',
                                                paddingLeft: '8px',
                                                paddingRight: '8px'
                                            }}
                                        >
                                            <span>{course.name || `코스 ${course.id}`}</span>
                                            <span style={{
                                                position: 'absolute',
                                                right: '8px',
                                                fontSize: '10px',
                                                fontWeight: 'normal',
                                                opacity: 0.8
                                            }}>
                                                {course.name ? (course.name.includes('A') ? 'Course A' :
                                                    course.name.includes('B') ? 'Course B' :
                                                        course.name.includes('C') ? 'Course C' :
                                                            course.name.includes('D') ? 'Course D' :
                                                                'Course') : 'Course'}
                                            </span>
                                        </div>

                                        {/* 점수표 */}
                                        <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
                                            <table className="w-full border-collapse text-xs" style={{ border: `2px solid ${theme.border}`, height: '100%' }}>
                                                <thead>
                                                    {/* 공색상 입력 칸 - 선수 이름 위에 배치 */}
                                                    <tr>
                                                        <td colSpan={2} className="border border-gray-700 px-1 py-0.5 text-center text-xs" style={{ backgroundColor: theme.border, color: theme.bg === '#ffffff' || theme.bg === '#fff8e1' || theme.bg === '#f5f5f5' ? '#000000' : '#ffffff' }}>
                                                            공색상 (Ball Color)
                                                        </td>
                                                        {[0, 1, 2, 3].map((idx) => (
                                                            <td key={idx} className="border border-gray-700 px-0.5 py-0.5" style={{ height: '16px' }}>
                                                                <div className="h-4 w-full"></div>
                                                            </td>
                                                        ))}
                                                    </tr>
                                                    <tr style={{ backgroundColor: theme.border, color: theme.bg === '#ffffff' || theme.bg === '#fff8e1' || theme.bg === '#f5f5f5' ? '#000000' : '#ffffff' }}>
                                                        <th className="border border-gray-700 px-1 py-0.5 text-center font-bold" style={{ width: '8%' }}>
                                                            Hole
                                                        </th>
                                                        <th className="border border-gray-700 px-1 py-0.5 text-center font-bold" style={{ width: '8%' }}>
                                                            Par
                                                        </th>
                                                        {/* 항상 4칸으로 선수 헤더 표시 */}
                                                        {[0, 1, 2, 3].map((idx) => {
                                                            const player = coursePlayers[idx]
                                                            const playerName = player ? (
                                                                player.type === 'team'
                                                                    ? `${player.p1_name}/${player.p2_name}`
                                                                    : player.name
                                                            ) : ''
                                                            // 영어 이름이 긴 경우 감지 (공백이나 대문자로 구분)
                                                            const isLongName = playerName && (playerName.length > 10 || /[A-Za-z]{10,}/.test(playerName))
                                                            return (
                                                                <th key={idx} className="border border-gray-700 px-0.5 text-center font-bold" style={{
                                                                    width: '21%',
                                                                    height: '28px',
                                                                    fontSize: isLongName ? '10px' : '14px',
                                                                    padding: '4px 2px',
                                                                    verticalAlign: 'middle',
                                                                    lineHeight: isLongName ? '1.2' : '1.4',
                                                                    wordBreak: 'break-word',
                                                                    overflowWrap: 'break-word',
                                                                    whiteSpace: isLongName ? 'normal' : 'nowrap'
                                                                }}>
                                                                    {playerName}
                                                                </th>
                                                            )
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((holeNum) => {
                                                        // pars 배열은 0부터 시작하므로 holeNum - 1을 사용해야 함
                                                        const parIndex = holeNum - 1;
                                                        const holeData = course.pars?.[parIndex] ?? 3;
                                                        return (
                                                            <tr key={holeNum} style={{ height: '32px' }}>
                                                                <td className="border border-gray-700 px-1 text-center font-bold" style={{ backgroundColor: theme.border, color: theme.bg === '#ffffff' || theme.bg === '#fff8e1' || theme.bg === '#f5f5f5' ? '#000000' : '#ffffff', padding: '2px', verticalAlign: 'middle' }}>
                                                                    {holeNum}
                                                                </td>
                                                                <td className="border border-gray-700 px-1 text-center font-semibold" style={{ padding: '2px', verticalAlign: 'middle' }}>
                                                                    {holeData}
                                                                </td>
                                                                {/* 항상 4칸으로 점수 입력 칸 표시 (가운데 세로줄로 2칸으로 나눔) */}
                                                                {[0, 1, 2, 3].map((idx) => {
                                                                    return (
                                                                        <td key={idx} className="border border-gray-700" style={{ padding: '0', height: '32px', verticalAlign: 'top' }}>
                                                                            <div className="w-full relative" style={{ display: 'flex', height: '100%', minHeight: '32px' }}>
                                                                                <div className="flex-1" style={{ borderRight: '1px solid #000000', height: '100%', margin: 0 }}></div>
                                                                                <div className="flex-1" style={{ height: '100%', margin: 0 }}></div>
                                                                            </div>
                                                                        </td>
                                                                    )
                                                                })}
                                                            </tr>
                                                        )
                                                    })}
                                                    {/* 합계 행 */}
                                                    <tr style={{ height: '32px' }}>
                                                        <td colSpan={2} className="border border-gray-700 px-1 text-center font-bold text-xs" style={{ padding: '2px', verticalAlign: 'middle' }}>
                                                            합계 (Total)
                                                        </td>
                                                        {/* 항상 4칸으로 합계 입력 칸 표시 (세로줄 없음) */}
                                                        {[0, 1, 2, 3].map((idx) => {
                                                            return (
                                                                <td key={idx} className="border border-gray-700" style={{ padding: '0', height: '32px', verticalAlign: 'top' }}>
                                                                    <div className="h-full w-full"></div>
                                                                </td>
                                                            )
                                                        })}
                                                    </tr>
                                                    {/* 선수 사인 행 */}
                                                    <tr style={{ height: '18px' }}>
                                                        <td colSpan={2} className="border border-gray-700 px-1 text-center font-bold text-xs" style={{ padding: '2px', verticalAlign: 'middle' }}>
                                                            선수 사인 (Player Signature)
                                                        </td>
                                                        {/* 항상 4칸으로 선수 사인 칸 표시 */}
                                                        {[0, 1, 2, 3].map((idx) => {
                                                            return (
                                                                <td key={idx} className="border border-gray-700" style={{ padding: '0', height: '18px', verticalAlign: 'top' }}>
                                                                    <div className="h-full w-full"></div>
                                                                </td>
                                                            )
                                                        })}
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))
            ))}
        </>
    )
}

