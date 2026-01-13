"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getPlayerScoreLogs, getPlayerScoreLogsOptimized, ScoreLog, logScoreChange, invalidatePlayerLogCache } from '@/lib/scoreLogs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db, auth } from '@/lib/firebase';
import { ref, onValue, set, get, query, limitToLast, onChildChanged, off, update, onChildAdded, onChildRemoved } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import ExternalScoreboardInfo from '@/components/ExternalScoreboardInfo';
import { safeLocalStorageGetItem, safeLocalStorageSetItem, safeLocalStorageRemoveItem, cn } from '@/lib/utils';
import {
    Download, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
    Calendar as CalendarIcon, MapPin, Trophy, Search, Settings, Save, RefreshCw,
    Trash2, Share2, Copy, Check, AlertCircle, Info, ExternalLink, Menu, X, Plus,
    Minus, List, LayoutGrid, Clock, MoreVertical, Eye, EyeOff, Lock, Unlock,
    Gavel, Play, Square, Award, Target, Hash, Users, User
} from 'lucide-react';

// New specialized components and hooks
import ScoreEditModal from './components/ScoreEditModal';
import ArchiveModal from './components/ArchiveModal';
import { useDashboardData } from './hooks/useDashboardData';
import { useScoreProcessing } from './hooks/useScoreProcessing';
import { ProcessedPlayer } from './types';
import { isValidNumber } from './utils/dashboardUtils';


export default function AdminDashboard() {
    // 안전한 number 체크 함수
    const isValidNumber = (v: any) => typeof v === 'number' && !isNaN(v);

    const { toast } = useToast();
    const router = useRouter();

    // 🚀 Use centralized dashboard data hook
    const {
        players,
        scores,
        setScores,
        courses,
        groupsData,
        tournamentName,
        initialDataLoaded,
        individualSuddenDeathData,
        teamSuddenDeathData,
        individualBackcountApplied,
        teamBackcountApplied,
        individualNTPData,
        teamNTPData,
        playerScoreLogs,
        setPlayerScoreLogs,
        lastProcessedResetAt,
        stopSubscriptions
    } = useDashboardData();

    // 🚀 Use centralized score processing hook
    const {
        processedDataByGroup,
        finalDataByGroup,
        groupProgress,
        processedIndividualSuddenDeathData,
        processedTeamSuddenDeathData
    } = useScoreProcessing({
        players,
        scores,
        courses,
        groupsData,
        individualSuddenDeathData,
        teamSuddenDeathData,
        individualBackcountApplied,
        teamBackcountApplied,
        individualNTPData,
        teamNTPData,
        playerScoreLogs
    });

    const [filterGroup, setFilterGroup] = useState('all');
    const [isSavingImage, setIsSavingImage] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [resumeSeq, setResumeSeq] = useState(0);

    const [notifiedSuddenDeathGroups, setNotifiedSuddenDeathGroups] = useState<string[]>([]);
    const [scoreCheckModal, setScoreCheckModal] = useState<{ open: boolean, groupName: string, missingScores: any[], resultMsg?: string }>({ open: false, groupName: '', missingScores: [] });

    // 🚀 데이터 사용량 모니터링
    const [dataUsage, setDataUsage] = useState({
        totalDownloaded: 0,
        lastUpdate: Date.now(),
        downloadsPerMinute: 0
    });

    const [searchPlayer, setSearchPlayer] = useState('');
    const [highlightedPlayerId, setHighlightedPlayerId] = useState<number | null>(null);
    const playerRowRefs = useRef<Record<string, (HTMLTableRowElement | null)[]>>({});

    // 🏆 Archive Modal States
    const [archiveModalOpen, setArchiveModalOpen] = useState(false);
    const [archiveDate, setArchiveDate] = useState('');

    // 🟢 점수 수정 모달 상태
    const [scoreEditModal, setScoreEditModal] = useState({
        open: false,
        playerId: '',
        courseId: '',
        holeIndex: -1,
        score: '',
        forfeitType: null as 'absent' | 'disqualified' | 'forfeit' | null,
        playerName: '',
        courseName: ''
    });

    // 점수 초기화 모달 상태
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // 인쇄 모달 상태
    const [printModal, setPrintModal] = useState({
        open: false,
        orientation: 'portrait' as 'portrait' | 'landscape',
        paperSize: 'A4' as 'A4' | 'A3',
        selectedGroups: [] as string[],
        showAllGroups: true,
        selectedCourses: [] as string[],
        showAllCourses: true
    });

    const [autoFilling, setAutoFilling] = useState(false);

    // 🔥 관리자 권한 활성화 기능
    const handleActivateAdmin = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        // 현재 사용자 확인 (lib/firebase.ts의 auth 객체 사용)
        const currentUser = auth?.currentUser;
        if (!currentUser) {
            toast({ title: '오류', description: '로그인 정보를 찾을 수 없습니다. 페이지를 새로고침 해주세요.', variant: 'destructive' });
            return;
        }

        try {
            // authorizedWriters 노드에 현재 사용자의 UID 등록
            // 규칙: auth.uid === $uid 인 경우 쓰기 가능을 활용
            await set(ref(db, `authorizedWriters/${currentUser.uid}`), {
                role: 'admin',
                email: currentUser.email || 'anonymous',
                registeredAt: Date.now()
            });

            toast({
                title: '권한 활성화 성공',
                description: '관리자 권한이 성공적으로 등록되었습니다. 모든 기능을 사용할 수 있습니다.',
            });

            // 페이지 새로고침하여 상태 반영
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (e: any) {
            console.error('권한 등록 에러:', e);
            toast({
                title: '권한 활성화 실패',
                description: '권한 등록 중 오류가 발생했습니다: ' + (e.message || 'Permission Denied'),
                variant: 'destructive'
            });
        }
    };

    // 🚀 모든 그룹 목록 추출 (스코프 문제 해결)
    const allGroupsList = useMemo(() => {
        return Object.keys(groupsData).sort();
    }, [groupsData]);






    // 기권 처리 모달 상태 - 구현 유실 방지를 위해 주석 유지
    // const [forfeitModal, setForfeitModal] = useState<{ open: boolean, player: any | null }>({ open: false, player: null });

    // 기록 보관하기(아카이브) 확인 시 실행
    const handleConfirmArchive = async (location: string, date: string) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        // 데이터 검증
        if (!players || Object.keys(players).length === 0) {
            toast({ title: '보관 실패', description: '선수 데이터가 없습니다.', variant: 'destructive' });
            return;
        }

        if (!scores || Object.keys(scores).length === 0) {
            toast({ title: '보관 실패', description: '점수 데이터가 없습니다.', variant: 'destructive' });
            return;
        }

        if (!courses || Object.keys(courses).length === 0) {
            toast({ title: '보관 실패', description: '코스 데이터가 없습니다.', variant: 'destructive' });
            return;
        }

        if (!groupsData || Object.keys(groupsData).length === 0) {
            toast({ title: '보관 실패', description: '그룹 데이터가 없습니다.', variant: 'destructive' });
            return;
        }

        try {
            // archiveId: 대회명(공백제거)_YYYYMMDD 형식
            // Firebase 경로는 '.', '#', '$', '[', ']' 를 포함할 수 없음
            const sanitizedTournamentName = (tournamentName || '대회').replace(/[\s.#$\[\]]/g, '');
            const sanitizedDate = date.replace(/[.#$\[\]]/g, '-').replace(/\s/g, '_');
            const archiveId = `${sanitizedTournamentName}_${sanitizedDate}`;

            // 참가자 수
            const playerCount = Object.keys(players).length;

            console.log('Archive Save - Data Check:', {
                archiveId,
                playerCount,
                scoresCount: Object.keys(scores).length,
                coursesCount: Object.keys(courses).length,
                groupsCount: Object.keys(groupsData).length,
                finalDataByGroupKeys: Object.keys(finalDataByGroup)
            });

            // 1. archives-list: 요약 정보 (목록 표시용)
            const summaryData = {
                name: tournamentName || '대회',
                tournamentStartDate: date,
                location: location,
                playerCount: playerCount,
                savedAt: new Date().toISOString()
            };

            // 2. archives-detail: 전체 데이터 (상세 보기용)
            const detailData = {
                savedAt: new Date().toISOString(),
                tournamentName: tournamentName || '대회',
                tournamentStartDate: date,
                location: location,
                playerCount,
                players,
                scores,
                courses,
                groups: groupsData,
                processedByGroup: finalDataByGroup
            };

            // 3. archives: 레거시 호환용 (동일한 데이터)
            const legacyData = { ...detailData };

            // 병렬로 3곳에 저장
            await Promise.all([
                set(ref(db, `archives-list/${archiveId}`), summaryData),
                set(ref(db, `archives-detail/${archiveId}`), detailData),
                set(ref(db, `archives/${archiveId}`), legacyData)
            ]);

            console.log('Archive saved successfully:', archiveId);

            setArchiveModalOpen(false);
            toast({
                title: '기록 보관 완료',
                description: `대회명: ${tournamentName || '대회'} / 참가자: ${playerCount}명\n기록보관함과 대회갤러리에서 확인하실 수 있습니다.`
            });
        } catch (e: any) {
            console.error('Archive save error:', e);
            toast({ title: '보관 실패', description: e?.message || '알 수 없는 오류', variant: 'destructive' });
        }
    };

    // 아카이브 버튼 클릭 시 (날짜 설정 시도)
    const handleArchiveClick = () => {
        // 현재 날짜를 YYYYMMDD 형식으로 기본값 설정
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const today = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
        setArchiveDate(today);
        setArchiveModalOpen(true);
    };

    const handlePrint = () => {
        // 현재 선택된 그룹에 따라 인쇄할 그룹 설정
        const groupsToPrint = filterGroup === 'all' ? allGroupsList : [filterGroup];

        // 가용한 코스 목록 추출
        const availableCoursesList = new Set<string>();
        Object.values(finalDataByGroup).forEach((playersList: any) => {
            playersList.forEach((p: any) => {
                p.assignedCourses?.forEach((c: any) => {
                    const cName = p.coursesData[c.id]?.courseName || c.name;
                    if (cName) availableCoursesList.add(cName);
                });
            });
        });

        setPrintModal({
            open: true,
            orientation: 'portrait',
            paperSize: 'A4',
            selectedGroups: groupsToPrint,
            showAllGroups: filterGroup === 'all',
            selectedCourses: Array.from(availableCoursesList).sort(),
            showAllCourses: true
        });
    };

    // 인쇄 HTML 생성 함수
    const generatePrintHTML = () => {
        const groupsToPrint = printModal.showAllGroups ? allGroupsList : printModal.selectedGroups;
        let printContent = '';

        // CSS 스타일
        const styles = `
            <style>
                @media print {
                    @page {
                        size: ${printModal.paperSize} ${printModal.orientation};
                        margin: 1cm;
                    }
                }
                body {
                    font-family: 'Arial', sans-serif;
                    margin: 0;
                    padding: 20px;
                }
                .print-header {
                    background: linear-gradient(135deg, #1e3a8a, #3b82f6);
                    color: white;
                    padding: 12px;
                    text-align: center;
                    margin-bottom: 15px;
                    border-radius: 8px;
                }
                .print-header h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: bold;
                }
                .print-header p {
                    margin: 2px 0 0 0;
                    font-size: 14px;
                    opacity: 0.9;
                }
                .group-section {
                    page-break-inside: avoid;
                    margin-bottom: 25px;
                }
                .group-title {
                    background: #f8fafc;
                    color: #1e293b;
                    padding: 8px 12px;
                    font-size: 18px;
                    font-weight: bold;
                    border-left: 4px solid #3b82f6;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .group-title-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .group-title-english {
                    font-size: 14px;
                    font-weight: 500;
                    color: #64748b;
                    margin-left: 10px;
                }
                .score-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 15px;
                    font-size: 14px;
                    table-layout: auto;
                }
                .score-table th {
                    background: #f1f5f9;
                    color: #1e293b;
                    padding: 6px 2px;
                    border: 1px solid #94a3b8;
                    text-align: center;
                    font-weight: bold;
                    font-size: 13px;
                    white-space: nowrap;
                    line-height: 1.2;
                }
                .score-table th .header-korean {
                    display: block;
                    font-size: 13px;
                    margin-bottom: 1px;
                }
                .score-table th .header-english {
                    display: block;
                    font-size: 10px;
                    font-weight: 500;
                    color: #64748b;
                }
                .score-table td {
                    padding: 5px 4px;
                    border: 1px solid #94a3b8;
                    text-align: center;
                    vertical-align: middle;
                    font-size: 15px;
                }
                /* 반응형 컬럼 스타일 */
                .responsive-column {
                    min-width: 0;
                    max-width: none;
                    width: auto;
                    white-space: nowrap;
                    overflow: visible;
                    text-overflow: clip;
                    padding: 6px 8px;
                }
                /* 고정 너비 컬럼 스타일 */
                .fixed-column {
                    width: 5%;
                    min-width: 30px;
                    max-width: 40px;
                    padding: 6px 4px;
                }
                /* 테이블 레이아웃 조정 */
                .score-table {
                    table-layout: auto;
                    width: 100%;
                }
                /* 순위 컬럼 최소 너비 */
                .rank-cell.responsive-column {
                    min-width: 50px;
                }
                /* 조 컬럼 최소 너비 */
                .responsive-column:nth-child(2) {
                    min-width: 30px;
                }
                /* 선수명 컬럼 최소 너비 */
                .player-name.responsive-column {
                    min-width: 120px;
                }
                /* 소속 컬럼 최소 너비 */
                .affiliation.responsive-column {
                    min-width: 80px;
                }
                /* 코스 컬럼 최소 너비 */
                .course-name.responsive-column {
                    min-width: 100px;
                }
                .rank-cell {
                    font-weight: 800;
                    font-size: 22px;
                    color: #1e40af;
                    background-color: #f8fafc;
                }
                .player-name {
                    font-weight: bold;
                    font-size: 16px;
                    color: #1e293b;
                }
                .affiliation {
                    color: #64748b;
                    font-size: 14px;
                }
                .course-name {
                    font-weight: bold;
                    font-size: 14px;
                    color: #059669;
                }
                .hole-score {
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                    font-size: 15px;
                }
                .course-total {
                    font-weight: 800;
                    font-size: 18px;
                    color: #dc2626;
                    background-color: #fffafb;
                }
                .pm-score {
                    font-size: 10px;
                    font-weight: 700;
                    margin-left: 2px;
                    vertical-align: middle;
                }
                .pm-plus { color: #dc2626; }
                .pm-minus { color: #2563eb; }
                .pm-even { color: #64748b; }
                .total-score {
                    font-weight: 800;
                    font-size: 22px;
                    color: #1e40af;
                    background-color: #f0f7ff;
                }
                .forfeit {
                    color: #dc2626;
                    font-weight: bold;
                }
                .page-break {
                    page-break-before: always;
                }
                .player-tbody {
                    page-break-inside: avoid;
                }
                .print-footer {
                    margin-top: 30px;
                    text-align: center;
                    color: #64748b;
                    font-size: 12px;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 10px;
                }
                @media print {
                    .no-print { display: none !important; }
                    [data-sidebar="trigger"], 
                    .sidebar-wrapper,
                    nav,
                    header,
                    button {
                        display: none !important;
                    }
                    .player-tbody {
                        page-break-inside: avoid;
                    }
                }
            </style>
        `;

        // 헤더
        const header = `
            <div class="print-header">
                <h1>🏌️‍♂️ ${tournamentName}</h1>
                <p>인쇄일시: ${new Date().toLocaleString('ko-KR')}</p>
            </div>
        `;

        // 각 그룹별 점수표 생성
        groupsToPrint.forEach((groupName, groupIndex) => {
            const groupPlayers = finalDataByGroup[groupName];
            if (!groupPlayers || groupPlayers.length === 0) return;

            // 그룹 섹션 시작 (첫 번째 그룹이 아니면 페이지 나누기)
            if (groupIndex > 0) {
                printContent += '<div class="page-break"></div>';
            }

            const groupNameEnglish = getGroupNameEnglish(groupName);
            printContent += `
                <div class="group-section">
                    <div class="group-title">
                        <div class="group-title-left">
                            <span>📊</span>
                            <span>${groupName} 그룹</span>
                            <span class="group-title-english">${groupNameEnglish}</span>
                        </div>
                    </div>
                    <table class="score-table">
                        <thead>
                            <tr>
                                <th class="responsive-column">
                                    <span class="header-korean">순위</span>
                                    <span class="header-english">Rank</span>
                                </th>
                                <th class="responsive-column">
                                    <span class="header-korean">조</span>
                                    <span class="header-english">Group</span>
                                </th>
                                <th class="responsive-column">
                                    <span class="header-korean">선수명(팀명)</span>
                                    <span class="header-english">Player Name (Team)</span>
                                </th>
                                <th class="responsive-column">
                                    <span class="header-korean">소속</span>
                                    <span class="header-english">Club</span>
                                </th>
                                <th class="responsive-column">
                                    <span class="header-korean">코스</span>
                                    <span class="header-english">Course</span>
                                </th>
                                <th class="fixed-column">1</th>
                                <th class="fixed-column">2</th>
                                <th class="fixed-column">3</th>
                                <th class="fixed-column">4</th>
                                <th class="fixed-column">5</th>
                                <th class="fixed-column">6</th>
                                <th class="fixed-column">7</th>
                                <th class="fixed-column">8</th>
                                <th class="fixed-column">9</th>
                                <th class="fixed-column">
                                    <span class="header-korean">합계</span>
                                    <span class="header-english">Sum</span>
                                </th>
                                <th class="fixed-column">
                                    <span class="header-korean">총타수</span>
                                    <span class="header-english">Total</span>
                                </th>
                            </tr>
                        </thead>
            `;

            groupPlayers.forEach((player: any) => {
                // 각 선수마다 개별 tbody 시작
                printContent += `<tbody class="player-tbody">`;

                if (player.assignedCourses.length > 0) {
                    // 선택된 코스만 필터링
                    const filteredCourses = printModal.showAllCourses
                        ? player.assignedCourses
                        : player.assignedCourses.filter((c: any) => {
                            const cName = player.coursesData[c.id]?.courseName || c.name;
                            return printModal.selectedCourses.includes(cName);
                        });

                    if (filteredCourses.length > 0) {
                        filteredCourses.forEach((course: any, courseIndex: number) => {
                            const courseData = player.coursesData[course.id];
                            const holeScores = courseData?.holeScores || Array(9).fill(null);

                            printContent += `
                                <tr>
                                    ${courseIndex === 0 ? `
                                        <td rowspan="${filteredCourses.length}" class="rank-cell responsive-column">
                                            ${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}
                                        </td>
                                        <td rowspan="${filteredCourses.length}" class="responsive-column">${player.jo}</td>
                                        <td rowspan="${filteredCourses.length}" class="player-name responsive-column">${player.name}</td>
                                        <td rowspan="${filteredCourses.length}" class="affiliation responsive-column">${player.affiliation || '-'}</td>
                                    ` : ''}
                                    <td class="course-name responsive-column">${courseData?.courseName || (course.name ? (course.name.includes('-') ? course.name.split('-')[1] : course.name) : 'Course')}</td>
                            `;

                            // 홀별 점수
                            holeScores.forEach((score: number | null, holeIdx: number) => {
                                let scoreContent = score !== null ? score.toString() : '-';

                                // ±타수 추가 (점수가 있고 Par 정보가 있는 경우)
                                const par = (courses as any)?.[course.id]?.pars?.[holeIdx];
                                if (score !== null && score > 0 && typeof par === 'number') {
                                    const pm = score - par;
                                    const pmText = pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm);
                                    const pmClass = pm === 0 ? 'pm-even' : (pm > 0 ? 'pm-plus' : 'pm-minus');
                                    scoreContent += ` <span class="pm-score ${pmClass}">${pmText}</span>`;
                                }

                                printContent += `<td class="hole-score fixed-column">${scoreContent}</td>`;
                            });

                            // 코스 합계
                            const courseTotal = courseData?.courseTotal || 0;
                            printContent += `<td class="course-total fixed-column">${courseTotal}</td>`;

                            // 총타수 (첫 번째 코스에서만 표시)
                            if (courseIndex === 0) {
                                const totalText = player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-');
                                printContent += `<td rowspan="${filteredCourses.length}" class="total-score responsive-column">${totalText}</td>`;
                            }

                            printContent += '</tr>';
                        });
                    } else {
                        // 선택된 코스가 선수에게 없는 경우
                        printContent += `
                        <tr>
                            <td class="rank-cell responsive-column">${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}</td>
                            <td class="responsive-column">${player.jo}</td>
                            <td class="player-name responsive-column">${player.name}</td>
                            <td class="affiliation responsive-column">${player.affiliation || '-'}</td>
                            <td colspan="11" style="text-align: center; color: #64748b;">선택된 코스 데이터 없음</td>
                            <td class="total-score responsive-column">${player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-')}</td>
                        </tr>
                    `;
                    }
                } else {
                    // 배정된 코스가 없는 경우
                    printContent += `
                    <tr>
                        <td class="rank-cell responsive-column">${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}</td>
                        <td class="responsive-column">${player.jo}</td>
                        <td class="player-name responsive-column">${player.name}</td>
                        <td class="affiliation responsive-column">${player.affiliation || '-'}</td>
                        <td colspan="11" style="text-align: center; color: #64748b;">배정된 코스 없음</td>
                        <td class="total-score responsive-column">${player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-')}</td>
                    </tr>
                `;
                }

                // 각 선수의 tbody 종료
                printContent += `</tbody>`;
            });

            printContent += `
                    </table>
                </div>
            `;
        });

        // 푸터
        const footer = `
            <div class="print-footer">
                <p>🏆 ${tournamentName} - ParkScore 시스템으로 생성된 공식 점수표입니다.</p>
            </div>
        `;

        // 전체 HTML 구성
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${tournamentName}</title>
                ${styles}
            </head>
            <body>
                ${header}
                ${printContent}
                ${footer}
            </body>
            </html>
        `;
    };

    // 인쇄 실행
    const executePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast({ title: '인쇄 실패', description: '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.', variant: 'destructive' });
            return;
        }

        const fullHtml = generatePrintHTML();
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        printWindow.focus();

        // 인쇄 다이얼로그 열기
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);

        setPrintModal({ ...printModal, open: false });
        toast({ title: '인쇄 준비 완료', description: '인쇄 다이얼로그가 열립니다.' });
    };

    // 미리보기 실행
    const showPreview = () => {
        const previewWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes');
        if (!previewWindow) {
            toast({ title: '미리보기 실패', description: '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.', variant: 'destructive' });
            return;
        }

        const fullHtml = generatePrintHTML();
        previewWindow.document.write(fullHtml);
        previewWindow.document.close();
        previewWindow.focus();
    };

    // 점수 초기화 기능
    const handleResetScores = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }
        try {
            if (filterGroup === 'all') {
                // 1. Firebase 데이터 삭제 (전체)
                await Promise.all([
                    set(ref(db, 'scores'), null),
                    set(ref(db, 'scoreLogs'), null),
                    set(ref(db, 'batchScoringHistory'), null),
                    set(ref(db, 'tournaments/current/suddenDeath'), null),
                    set(ref(db, 'tournaments/current/backcountApplied'), null),
                    set(ref(db, 'tournaments/current/nearestToPin'), null),
                    set(ref(db, 'tournaments/current/ranks'), null),
                    set(ref(db, 'tournaments/current/lastResetAt'), Date.now())
                ]);

                // 2. Client-side 저장소 정리
                sessionStorage.removeItem('selfScoringTempData');
                try {
                    if (typeof window !== 'undefined' && window.localStorage) {
                        const keysToRemove: string[] = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && (
                                key.startsWith('selfScoringDraft_') ||
                                key.startsWith('selfScoringSign_') ||
                                key.startsWith('selfScoringSignTeam_') ||
                                key.startsWith('selfScoringPostSignLock_')
                            )) {
                                keysToRemove.push(key);
                            }
                        }
                        keysToRemove.forEach(k => safeLocalStorageRemoveItem(k));
                    }
                } catch (error) {
                    console.error('localStorage 초기화 실패:', error);
                }
            } else {
                // 특정 그룹만 초기화
                const groupPlayers = finalDataByGroup[filterGroup] || [];
                const playerIds = groupPlayers.map((p: any) => p.id);
                const scoreUpdates: any = {};

                groupPlayers.forEach((player: any) => {
                    if (player.assignedCourses) {
                        player.assignedCourses.forEach((course: any) => {
                            scoreUpdates[`${player.id}/${course.id}`] = null;
                        });
                    }
                });

                // 1. Firebase 데이터 삭제 (특정 그룹)
                if (Object.keys(scoreUpdates).length > 0) {
                    await update(ref(db, 'scores'), scoreUpdates);

                    // 로그 삭제 (해당 그룹 선수들의 로그만)
                    try {
                        const logsRef = ref(db, 'scoreLogs');
                        const snapshot = await get(logsRef);
                        if (snapshot.exists()) {
                            const logUpdates: any = {};
                            snapshot.forEach((childSnapshot) => {
                                const logData = childSnapshot.val();
                                if (logData && playerIds.includes(logData.playerId)) {
                                    logUpdates[childSnapshot.key] = null;
                                }
                            });
                            if (Object.keys(logUpdates).length > 0) {
                                await update(ref(db, 'scoreLogs'), logUpdates);
                            }
                        }
                    } catch (error) {
                        console.error('scoreLogs 초기화 실패:', error);
                    }

                    // 일괄 입력 이력 삭제 (해당 그룹)
                    try {
                        await set(ref(db, `batchScoringHistory/${filterGroup}`), null);
                    } catch (error) {
                        console.error('batchScoringHistory 초기화 실패:', error);
                    }

                    // 서든데스/NTP/백카운트 데이터 삭제 (해당 그룹)
                    try {
                        await Promise.all([
                            set(ref(db, `tournaments/current/suddenDeath/individual/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/suddenDeath/team/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/backcountApplied/individual/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/backcountApplied/team/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/nearestToPin/individual/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/nearestToPin/team/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/groups/${filterGroup}/lastResetAt`), Date.now())
                        ]);
                    } catch (error) {
                        console.error('플레이오프 설정 초기화 실패:', error);
                    }
                }

                // 2. Client-side 저장소 정리 (특정 그룹)
                // sessionStorage 정리
                const savedData = sessionStorage.getItem('selfScoringTempData');
                if (savedData) {
                    try {
                        const data = JSON.parse(savedData);
                        if (data.scores) {
                            playerIds.forEach((pid: string) => {
                                delete data.scores[pid];
                            });
                            if (Object.keys(data.scores).length === 0) {
                                sessionStorage.removeItem('selfScoringTempData');
                            } else {
                                sessionStorage.setItem('selfScoringTempData', JSON.stringify(data));
                            }
                        }
                    } catch (error) {
                        console.error('sessionStorage 초기화 실패:', error);
                    }
                }

                // localStorage 정리
                try {
                    const coursesForGroup = Object.keys(groupsData[filterGroup]?.courses || {});
                    coursesForGroup.forEach(courseId => {
                        const suffix = `_${courseId}_${filterGroup}_1`;
                        safeLocalStorageRemoveItem(`selfScoringDraft${suffix}`);
                        safeLocalStorageRemoveItem(`selfScoringSign${suffix}`);
                        safeLocalStorageRemoveItem(`selfScoringSignTeam${suffix}`);
                        safeLocalStorageRemoveItem(`selfScoringPostSignLock${suffix}`);
                    });
                } catch (e) { }
            }

            // 3. UI 상태 업데이트
            if (filterGroup === 'all') {
                setScores({}); // 즉시 로컬 점수 상태 비움
                setPlayerScoreLogs({});
            } else {
                const groupPlayers = finalDataByGroup[filterGroup] || [];
                const playerIds = groupPlayers.map((p: any) => p.id);

                // 로컬 점수 상태에서 해당 그룹 선수들만 제거
                setScores((prev: any) => {
                    const next = { ...prev };
                    playerIds.forEach((pid: string) => delete next[pid]);
                    return next;
                });

                setPlayerScoreLogs((prev: any) => {
                    const newLogs = { ...prev };
                    playerIds.forEach((player: any) => {
                        delete newLogs[player?.id || player];
                    });
                    return newLogs;
                });
            }

            toast({
                title: '초기화 완료',
                description: filterGroup === 'all'
                    ? '모든 점수가 초기화되었습니다.'
                    : `${filterGroup} 그룹의 점수가 초기화되었습니다.`
            });
        } catch (e) {
            console.error('초기화 실패:', e);
            toast({ title: '초기화 실패', description: '점수 초기화 중 오류가 발생했습니다.', variant: 'destructive' });
        } finally {
            setShowResetConfirm(false);
        }
    };

    // 점수 저장 임시 함수(실제 저장/재계산 로직은 추후 구현)
    const handleScoreEditSave = async (scoreToSave?: string, forfeitTypeToSave?: 'absent' | 'disqualified' | 'forfeit' | null) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }
        const score = scoreToSave !== undefined ? scoreToSave : scoreEditModal.score;
        const forfeitType = forfeitTypeToSave !== undefined ? forfeitTypeToSave : scoreEditModal.forfeitType;
        const { playerId, courseId, holeIndex } = scoreEditModal;
        if (!playerId || !courseId || holeIndex === -1) {
            setScoreEditModal(prev => ({ ...prev, open: false }));
            return;
        }
        try {
            const scoreValue = score === '' ? null : Number(score);
            // 0점(기권/불참/실격) 입력 시 또는 점수가 없고 forfeitType이 있는 경우: 소속 그룹의 모든 코스/홀에 0점 입력
            if (scoreValue === 0 || (scoreValue === null && scoreEditModal.forfeitType)) {
                // forfeitType이 없으면 기본값으로 'forfeit' 설정
                const effectiveForfeitType = forfeitType || 'forfeit';

                // 선수 정보 찾기
                const player = players[playerId];
                if (player && player.group && groupsData[player.group]) {
                    const group = groupsData[player.group];
                    // 대량 0점 입력 전에 선수 점수 백업 생성(1회성)
                    try {
                        const playerScoresSnap = await get(ref(db, `scores/${playerId}`));
                        if (playerScoresSnap.exists()) {
                            const backupRef = ref(db, `backups/scoresBeforeForfeit/${playerId}`);
                            const backupSnap = await get(backupRef);
                            if (!backupSnap.exists()) {
                                await set(backupRef, { data: playerScoresSnap.val(), createdAt: Date.now() });
                            }
                        }
                    } catch (e) {
                        console.warn('백업 저장 실패(무시):', e);
                    }

                    // 기권 타입에 따른 메시지
                    const forfeitTypeText = effectiveForfeitType === 'absent' ? '불참' :
                        effectiveForfeitType === 'disqualified' ? '실격' : '기권';

                    // 그룹에 배정된 코스 id 목록
                    const assignedCourseIds = group.courses ? Object.keys(group.courses).filter((cid: any) => group.courses[cid]) : [];

                    // 병렬 처리로 성능 최적화: 모든 점수 저장과 로그 기록을 병렬로 처리
                    const updatePromises: Promise<void>[] = [];

                    for (const cid of assignedCourseIds) {
                        for (let h = 1; h <= 9; h++) {
                            const prevScore = scores?.[playerId]?.[cid]?.[h];
                            const oldValue = prevScore === undefined || prevScore === null ? 0 : prevScore;

                            // 점수 저장과 로그 기록을 병렬로 처리
                            const isDirectEdit = cid === courseId && h === holeIndex + 1;
                            const comment = isDirectEdit
                                ? `관리자 직접 ${forfeitTypeText} (코스: ${cid}, 홀: ${h})`
                                : `관리자페이지에서 ${forfeitTypeText} 처리 (코스: ${cid}, 홀: ${h})`;

                            // 점수 저장과 로그 기록을 하나의 Promise로 묶어서 병렬 처리
                            updatePromises.push(
                                (async () => {
                                    await set(ref(db, `scores/${playerId}/${cid}/${h}`), 0);
                                    await logScoreChange({
                                        matchId: 'tournaments/current',
                                        playerId,
                                        scoreType: 'holeScore',
                                        holeNumber: h,
                                        oldValue: oldValue,
                                        newValue: 0,
                                        modifiedBy: 'admin',
                                        modifiedByType: 'admin',
                                        comment: comment,
                                        courseId: cid
                                    });
                                })()
                            );
                        }
                    }

                    // 모든 업데이트를 병렬로 실행
                    await Promise.all(updatePromises);

                    // 실시간 업데이트를 위한 로그 캐시 무효화 (한 번만)
                    invalidatePlayerLogCache(playerId);
                }
                setScoreEditModal(prev => ({ ...prev, open: false }));
                // 점수 로그 재조회 (최적화됨)
                try {
                    const logs = await getPlayerScoreLogsOptimized(playerId);
                    setPlayerScoreLogs((prev: any) => ({ ...prev, [playerId]: logs }));
                } catch { }
                toast({ title: '점수 저장 완료', description: '점수가 성공적으로 저장되었습니다.' });
                return;
            }
            // 기존 점수 조회(0점이 아닐 때만 기존 방식)
            const prevScore = scores?.[playerId]?.[courseId]?.[holeIndex + 1] ?? null;

            // 점수 저장과 로그 기록을 병렬로 처리하여 성능 최적화
            if (prevScore !== scoreValue) {
                try {
                    // 점수 저장과 로그 기록을 병렬로 실행
                    await Promise.all([
                        set(ref(db, `scores/${playerId}/${courseId}/${holeIndex + 1}`), scoreValue),
                        logScoreChange({
                            matchId: 'tournaments/current',
                            playerId,
                            scoreType: 'holeScore',
                            holeNumber: holeIndex + 1,
                            oldValue: prevScore || 0,
                            newValue: scoreValue || 0,
                            modifiedBy: 'admin',
                            modifiedByType: 'admin',
                            comment: `코스: ${courseId}`,
                            courseId: courseId
                        })
                    ]);

                    // 실시간 업데이트를 위한 로그 캐시 무효화
                    invalidatePlayerLogCache(playerId);

                    // 점수 로그 저장 후 해당 선수 로그 즉시 갱신 (최적화됨) - 비동기로 처리하여 저장 속도 향상
                    getPlayerScoreLogsOptimized(playerId)
                        .then(logs => {
                            setPlayerScoreLogs((prev: any) => ({
                                ...prev,
                                [playerId]: logs
                            }));
                        })
                        .catch(e => {
                            console.error("점수 로그 재조회 에러", e);
                        });
                } catch (e) {
                    console.error("로그 기록 에러", e);
                }
            } else {
                // 점수가 변경되지 않았어도 저장은 수행 (null -> null 등)
                await set(ref(db, `scores/${playerId}/${courseId}/${holeIndex + 1}`), scoreValue);
            }
            setScoreEditModal(prev => ({ ...prev, open: false }));
            toast({ title: '점수 저장 완료', description: '점수가 성공적으로 저장되었습니다.' });
        } catch (e) {
            console.error("점수 저장 에러", e);
            setScoreEditModal(prev => ({ ...prev, open: false }));
            toast({
                title: '점수 저장 실패',
                description: e instanceof Error ? e.message : '점수 저장 중 오류가 발생했습니다.',
                variant: 'destructive'
            });
        }
    };
    // 항상 현재 도메인 기준으로 절대주소 생성
    const externalScoreboardUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/scoreboard`
        : '/scoreboard';

    // 그룹별 순위/백카운트/서든데스 상태 체크 함수
    const getGroupRankStatusMsg = (groupName: string) => {
        const groupPlayers = finalDataByGroup[groupName];
        if (!groupPlayers || groupPlayers.length === 0) return '선수 데이터가 없습니다.';
        const completedPlayers = groupPlayers.filter((p: any) => p.hasAnyScore && !p.hasForfeited);
        if (completedPlayers.length === 0) return '점수 입력된 선수가 없습니다.';
        // 1위 동점자 체크 (서든데스 필요 여부)
        const firstRankPlayers = completedPlayers.filter((p: any) => p.rank === 1);
        if (firstRankPlayers.length > 1) {
            return `1위 동점자(${firstRankPlayers.length}명)가 있습니다. 서든데스가 필요합니다.`;
        }
        // 정상적으로 순위가 모두 부여된 경우
        return '순위 계산이 정상적으로 완료되었습니다.';
    };

    // 누락 점수 0점 처리 함수 (컴포넌트 상단에 위치)
    const handleAutoFillZero = async () => {
        if (!scoreCheckModal.missingScores.length) return;
        setAutoFilling(true);
        try {
            const { ref, set } = await import('firebase/database');
            if (!db) return;
            const database = db;
            const promises = scoreCheckModal.missingScores.map(item =>
                set(ref(database, `scores/${item.playerId}/${item.courseId}/${item.hole}`), 0)
            );
            await Promise.all(promises);
            toast({ title: '누락 점수 자동 입력 완료', description: `${scoreCheckModal.missingScores.length}개 점수가 0점으로 입력되었습니다.` });
            // 0점 입력 후, 순위/백카운트/서든데스 상태 안내
            setScoreCheckModal({ open: true, groupName: scoreCheckModal.groupName, missingScores: [], resultMsg: getGroupRankStatusMsg(scoreCheckModal.groupName) });
        } catch (e: any) {
            toast({ title: '자동 입력 실패', description: e?.message || '오류가 발생했습니다.' });
            setScoreCheckModal({ ...scoreCheckModal, open: false });
        }
        setAutoFilling(false);
    };

    // 점수 누락 체크 함수 (컴포넌트 상단에 위치)
    const checkGroupScoreCompletion = (groupName: string, groupPlayers: any[]) => {
        const missingScores: { playerId: string; playerName: string; courseId: string; courseName: string; hole: number }[] = [];
        groupPlayers.forEach((player: any) => {
            if (!player.assignedCourses) return;
            player.assignedCourses.forEach((course: any) => {
                const courseId = course.id;
                const courseName = course.name;
                for (let hole = 1; hole <= 9; hole++) {
                    const score = scores?.[player.id]?.[courseId]?.[hole];
                    if (score === undefined || score === null) {
                        missingScores.push({
                            playerId: player.id,
                            playerName: player.name,
                            courseId,
                            courseName,
                            hole
                        });
                    }
                }
            });
        });

        // 점수 누락이 없으면 서든데스 체크 및 순위/백카운트/서든데스 상태 안내
        if (missingScores.length === 0) {
            // 서든데스 상황 체크 추가
            const playersInGroup = finalDataByGroup[groupName];
            if (playersInGroup) {
                const tiedFirstPlace = playersInGroup.filter((p: ProcessedPlayer) => p.rank === 1);

                if (tiedFirstPlace.length > 1) {
                    // 플레이오프 필요 시 토스트 알림
                    toast({
                        title: `🚨 플레이오프 관리 필요: ${groupName}`,
                        description: `${groupName} 그룹의 경기가 완료되었으며, 1위 동점자가 발생했습니다. 플레이오프 관리가 필요합니다.`,
                        action: (
                            <ToastAction altText="관리하기" onClick={() => router.push('/admin/suddendeath')}>
                                관리하기
                            </ToastAction>
                        ),
                        duration: 30000
                    });

                    // 이미 알림을 보냈으므로 notifiedSuddenDeathGroups에 추가하여 중복 방지
                    setNotifiedSuddenDeathGroups(prev => {
                        if (!prev.includes(groupName)) {
                            return [...prev, groupName];
                        }
                        return prev;
                    });
                }
            }

            // 기존 모달 표시 (순위/백카운트/서든데스 상태 안내)
            setScoreCheckModal({ open: true, groupName, missingScores, resultMsg: getGroupRankStatusMsg(groupName) });
        } else {
            setScoreCheckModal({ open: true, groupName, missingScores });
        }
    };

    // 🚀 혁신적 최적화: 변경된 데이터만 다운로드
    // (이전의 거대한 useEffect가 useDashboardData 훅으로 이전됨)

    useEffect(() => {
        if (!groupProgress || !finalDataByGroup || !processedDataByGroup) return;

        // 모든 플레이오프가 필요한 그룹을 먼저 찾기
        const groupsNeedingPlayoff: string[] = [];
        Object.keys(groupProgress).forEach(groupName => {
            // Check if group is 100% complete and not yet notified
            if (groupProgress[groupName] === 100 && !notifiedSuddenDeathGroups.includes(groupName)) {
                const playersInGroup = finalDataByGroup[groupName];
                const processedPlayersInGroup = processedDataByGroup[groupName];

                if (playersInGroup && processedPlayersInGroup) {
                    // processedDataByGroup에서 원래 1위 동점자 확인 (applyPlayoffRanking 전 상태)
                    const originalTiedFirstPlace = processedPlayersInGroup.filter((p: any) => p.rank === 1);

                    // 원래 1위 동점자가 없으면 플레이오프 불필요
                    if (originalTiedFirstPlace.length <= 1) {
                        return; // 다음 그룹으로
                    }

                    // 서든데스로 순위가 결정되었는지 확인 (가장 먼저 확인)
                    // 원래 1위 동점자들이 모두 서든데스에 참여했고 점수가 입력되어 있는지 확인
                    const originalTiedFirstPlaceIds = new Set(originalTiedFirstPlace.map((p: any) => p.id));
                    let hasSuddenDeathRanking = false;

                    // individual과 team 모두 확인
                    const checkSuddenDeathData = (suddenDeathData: any) => {
                        if (!suddenDeathData) return false;

                        // 그룹별 데이터인 경우 해당 그룹 데이터 확인
                        if (typeof suddenDeathData === 'object' && !suddenDeathData.isActive) {
                            // 그룹별 데이터인 경우
                            const groupData = suddenDeathData[groupName];
                            if (!groupData?.isActive || !groupData?.players || !groupData?.scores) {
                                return false;
                            }

                            // 원래 1위 동점자들이 모두 서든데스에 참여했는지 확인
                            const allInSuddenDeath = originalTiedFirstPlace.every((p: any) =>
                                groupData.players[p.id] === true
                            );

                            if (!allInSuddenDeath) {
                                return false;
                            }

                            // 원래 1위 동점자들이 모두 서든데스에 참여했고, 점수가 입력되어 있는지 확인
                            return originalTiedFirstPlace.every((p: any) => {
                                const playerScores = groupData.scores[p.id];
                                if (!playerScores) return false;
                                // 서든데스 홀에 점수가 하나라도 입력되어 있으면 완료된 것으로 봄
                                if (groupData.holes && Array.isArray(groupData.holes)) {
                                    return groupData.holes.some((hole: number) => {
                                        // hole은 number이지만 scores에서는 string 키로 저장될 수 있음
                                        const score = playerScores[hole] || playerScores[hole.toString()];
                                        return score !== undefined && score !== null;
                                    });
                                }
                                return false;
                            });
                        } else {
                            // 단일 데이터인 경우 (기존 로직)
                            if (!suddenDeathData?.isActive || !suddenDeathData?.players || !suddenDeathData?.scores) {
                                return false;
                            }

                            // 원래 1위 동점자들이 모두 서든데스에 참여했는지 확인
                            const allInSuddenDeath = originalTiedFirstPlace.every((p: any) =>
                                suddenDeathData.players[p.id] === true
                            );

                            if (!allInSuddenDeath) {
                                return false;
                            }

                            // 원래 1위 동점자들이 모두 서든데스에 참여했고, 점수가 입력되어 있는지 확인
                            return originalTiedFirstPlace.every((p: any) => {
                                const playerScores = suddenDeathData.scores[p.id];
                                if (!playerScores) return false;
                                // 서든데스 홀에 점수가 하나라도 입력되어 있으면 완료된 것으로 봄
                                if (suddenDeathData.holes && Array.isArray(suddenDeathData.holes)) {
                                    return suddenDeathData.holes.some((hole: number) => {
                                        // hole은 number이지만 scores에서는 string 키로 저장될 수 있음
                                        const score = playerScores[hole] || playerScores[hole.toString()];
                                        return score !== undefined && score !== null;
                                    });
                                }
                                return false;
                            });
                        }
                    };

                    // individual과 team 서든데스 데이터 모두 확인
                    if (originalTiedFirstPlace.length > 0) {
                        hasSuddenDeathRanking = checkSuddenDeathData(individualSuddenDeathData) ||
                            checkSuddenDeathData(teamSuddenDeathData);
                    }

                    // NTP로 순위가 결정되었는지 확인
                    let hasNTPRanking = false;
                    if (!hasSuddenDeathRanking && originalTiedFirstPlace.length > 0) {
                        // individual과 team 모두 확인
                        const checkNTPData = (ntpData: any) => {
                            if (!ntpData) return false;

                            // 그룹별 데이터인 경우 해당 그룹 데이터 확인
                            if (typeof ntpData === 'object' && !ntpData.isActive) {
                                // 그룹별 데이터인 경우
                                const groupData = ntpData[groupName];
                                if (!groupData?.isActive || !groupData?.rankings) {
                                    return false;
                                }

                                // 원래 1위 동점자들이 모두 NTP 순위가 있는지 확인
                                return originalTiedFirstPlace.every((p: any) =>
                                    groupData.rankings[p.id] !== undefined && groupData.rankings[p.id] !== null
                                );
                            } else {
                                // 단일 데이터인 경우 (기존 로직)
                                if (!ntpData?.isActive || !ntpData?.rankings) {
                                    return false;
                                }

                                // 원래 1위 동점자들이 모두 NTP 순위가 있는지 확인
                                return originalTiedFirstPlace.every((p: any) =>
                                    ntpData.rankings[p.id] !== undefined && ntpData.rankings[p.id] !== null
                                );
                            }
                        };

                        // individual과 team NTP 데이터 모두 확인
                        hasNTPRanking = checkNTPData(individualNTPData) || checkNTPData(teamNTPData);
                    }

                    // 백카운트로 순위가 결정되었는지 확인
                    let hasBackcountRanking = false;
                    if (!hasSuddenDeathRanking && !hasNTPRanking) {
                        const playerType = originalTiedFirstPlace[0]?.type;
                        const isIndividual = playerType === 'individual';
                        const backcountState = isIndividual ? individualBackcountApplied : teamBackcountApplied;
                        const backcountAppliedForGroup = !!(
                            backcountState &&
                            (backcountState[groupName] || backcountState['*'])
                        );
                        if (backcountAppliedForGroup) {
                            // 원래 1위 동점자 중 하나라도 rank가 1이 아니면 백카운트로 순위가 결정된 것
                            hasBackcountRanking = originalTiedFirstPlace.some((p: any) => {
                                const playerInFinal = playersInGroup.find((fp: any) => fp.id === p.id);
                                if (playerInFinal) {
                                    return playerInFinal.rank !== 1 && playerInFinal.rank !== null;
                                }
                                return false;
                            });
                        }
                    }

                    // 서든데스/NTP/백카운트로 순위가 결정되었으면 안내창 안 뜸
                    if (hasSuddenDeathRanking || hasNTPRanking || hasBackcountRanking) {
                        return; // 순위가 결정되었으므로 다음 그룹으로
                    }

                    // finalDataByGroup에서 순위 결정 후 1위 동점자 확인 (applyPlayoffRanking 후 상태)
                    const finalTiedFirstPlace = (playersInGroup as any[]).filter((p: any) => p.rank === 1);

                    // 순위가 결정되었는지 확인: finalTiedFirstPlace.length === 1이면 순위가 결정된 것
                    if (finalTiedFirstPlace.length === 1) {
                        return; // 순위가 결정되었으므로 다음 그룹으로
                    }

                    // 순위가 결정되지 않았으면 플레이오프 필요
                    // finalTiedFirstPlace.length > 1이면 여전히 동점이므로 플레이오프 필요
                    if (finalTiedFirstPlace.length > 1) {
                        groupsNeedingPlayoff.push(groupName);
                    }
                }
            }
        });

        // 모든 그룹을 하나의 안내창에 표시
        if (groupsNeedingPlayoff.length > 0) {
            // 하나의 토스트에 모든 그룹 나열
            const groupsList = groupsNeedingPlayoff.join(', ');
            const description = groupsNeedingPlayoff.length === 1
                ? `${groupsNeedingPlayoff[0]} 그룹의 경기가 완료되었으며, 1위 동점자가 발생했습니다. 플레이오프 관리가 필요합니다.`
                : `${groupsList} 그룹의 경기가 완료되었으며, 1위 동점자가 발생했습니다. 플레이오프 관리가 필요합니다.`;

            toast({
                title: `🚨 플레이오프 관리 필요 (${groupsNeedingPlayoff.length}개 그룹)`,
                description: description,
                action: (
                    <ToastAction altText="관리하기" onClick={() => router.push('/admin/suddendeath')}>
                        관리하기
                    </ToastAction>
                ),
                duration: 30000 // Keep the toast on screen longer
            });

            // 모든 그룹을 notified 배열에 추가
            setNotifiedSuddenDeathGroups(prev => {
                const newGroups = [...prev];
                groupsNeedingPlayoff.forEach(groupName => {
                    if (!newGroups.includes(groupName)) {
                        newGroups.push(groupName);
                    }
                });
                return newGroups;
            });
        }
    }, [groupProgress, finalDataByGroup, processedDataByGroup, notifiedSuddenDeathGroups, router]);

    const handleExportToExcel = async () => {
        setIsExporting(true);
        try {
            const XLSX: any = await import('xlsx-js-style');

            const wb = (XLSX as any).utils.book_new();

            const dataToExport = (filterGroup === 'all')
                ? finalDataByGroup
                : { [filterGroup]: finalDataByGroup[filterGroup] };

            for (const groupName in dataToExport) {
                const groupPlayers = dataToExport[groupName];
                if (!groupPlayers || groupPlayers.length === 0) continue;

                const ws_data: { [key: string]: any } = {};
                const merges: any[] = [];
                let rowIndex = 0;
                const headers = [
                    '순위', '조', '선수명(팀명)', '소속', '코스',
                    '1', '2', '3', '4', '5', '6', '7', '8', '9',
                    '코스 합계', '총타수'
                ];

                // 개선된 셀 스타일 정의 - XLSX 라이브러리 호환 방식
                const borderStyle = {
                    top: { style: "thin" },
                    bottom: { style: "thin" },
                    left: { style: "thin" },
                    right: { style: "thin" }
                };

                const centerAlign = {
                    alignment: { horizontal: "center", vertical: "center" },
                    border: borderStyle
                };

                const headerStyle = {
                    alignment: { horizontal: "center", vertical: "center" },
                    border: borderStyle,
                    font: { bold: true },
                    fill: { fgColor: { rgb: "E6E6FA" } }
                };

                // 1. Set Headers
                headers.forEach((header, colIndex) => {
                    const cellRef = (XLSX as any).utils.encode_cell({ r: rowIndex, c: colIndex });
                    ws_data[cellRef] = { v: header, t: 's', s: headerStyle };
                });
                rowIndex++;

                // 2. Re-fetch full data for export to include hole scores
                const fullPlayersDataForExport = (groupPlayers as any[]).map((p: any) => {
                    const playerScoresData = scores[p.id] || {};
                    const coursesData: any = {};
                    p.assignedCourses.forEach((course: any) => {
                        const courseId = course.id;
                        const scoresForCourse = playerScoresData[courseId] || {};
                        const holeScores: (number | string)[] = Array(9).fill('-');
                        let courseTotal = 0;
                        for (let i = 0; i < 9; i++) {
                            const holeScore = scoresForCourse[(i + 1).toString()];
                            if (holeScore !== undefined && holeScore !== null) {
                                const scoreNum = Number(holeScore);
                                holeScores[i] = scoreNum;
                                courseTotal += scoreNum;
                            }
                        }
                        coursesData[courseId] = { courseName: course.name, courseTotal, holeScores };
                    });
                    return { ...p, coursesData };
                });

                // 3. Populate Data and Merges
                fullPlayersDataForExport.forEach((player: any) => {
                    const startRow = rowIndex;
                    const numCourses = player.assignedCourses.length > 0 ? player.assignedCourses.length : 1;
                    const endRow = startRow + numCourses - 1;

                    const addCell = (r: number, c: number, value: any) => {
                        const cellRef = (XLSX as any).utils.encode_cell({ r, c });
                        const type = typeof value === 'number' ? 'n' : 's';
                        ws_data[cellRef] = { v: value, t: type, s: centerAlign };
                    };

                    // Merged columns
                    addCell(startRow, 0, player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : ''));
                    addCell(startRow, 1, player.jo);
                    addCell(startRow, 2, player.name);
                    addCell(startRow, 3, player.affiliation);
                    addCell(startRow, 15, player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-'));

                    if (numCourses > 1) {
                        merges.push({ s: { r: startRow, c: 0 }, e: { r: endRow, c: 0 } }); // Rank
                        merges.push({ s: { r: startRow, c: 1 }, e: { r: endRow, c: 1 } }); // Jo
                        merges.push({ s: { r: startRow, c: 2 }, e: { r: endRow, c: 2 } }); // Name
                        merges.push({ s: { r: startRow, c: 3 }, e: { r: endRow, c: 3 } }); // Affiliation
                        merges.push({ s: { r: startRow, c: 15 }, e: { r: endRow, c: 15 } });// Total Score
                    }

                    if (player.assignedCourses.length > 0) {
                        player.assignedCourses.forEach((course: any, courseIndex: number) => {
                            const currentRow = startRow + courseIndex;
                            const courseData = player.coursesData[course.id];

                            addCell(currentRow, 4, courseData?.courseName || course.name);

                            const holeScores = courseData?.holeScores || Array(9).fill('-');
                            holeScores.forEach((score: number | string, i: number) => {
                                addCell(currentRow, 5 + i, score);
                            });

                            addCell(currentRow, 14, player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? (courseData?.courseTotal || 0) : '-'));
                        });
                    } else {
                        addCell(startRow, 0, player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : ''));
                        addCell(startRow, 1, player.jo);
                        addCell(startRow, 2, player.name);
                        addCell(startRow, 3, player.affiliation);
                        addCell(startRow, 4, '배정된 코스 없음');
                        addCell(startRow, 15, player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-'));
                        merges.push({ s: { r: startRow, c: 4 }, e: { r: startRow, c: 14 } });
                    }

                    rowIndex += numCourses;
                });

                // 엑셀 시트 생성 (타입 오류 방지를 위해 any 사용)
                const ws: any = ws_data;

                ws['!merges'] = merges;

                // 모든 셀에 스타일 재적용 - 더 확실한 방법
                const range = { s: { r: 0, c: 0 }, e: { r: rowIndex - 1, c: headers.length - 1 } };
                ws['!ref'] = (XLSX as any).utils.encode_range(range);

                // 모든 셀에 스타일 적용
                for (let r = 0; r < rowIndex; r++) {
                    for (let c = 0; c < headers.length; c++) {
                        const cellRef = (XLSX as any).utils.encode_cell({ r, c });
                        if (ws_data[cellRef]) {
                            // 헤더 행 (첫 번째 행)인지 확인
                            if (r === 0) {
                                ws_data[cellRef].s = headerStyle;
                            } else {
                                ws_data[cellRef].s = centerAlign;
                            }
                        }
                    }
                }

                // 셀 너비 자동 조정 - 글자수에 맞춰 동적으로 설정
                const colWidths = headers.map((header, colIndex) => {
                    let maxWidth = header.length; // 헤더 길이를 기본값으로

                    // 각 행의 데이터를 확인하여 최대 길이 계산
                    for (let r = 1; r < rowIndex; r++) {
                        const cellRef = (XLSX as any).utils.encode_cell({ r, c: colIndex });
                        const cell = ws_data[cellRef];
                        if (cell && cell.v) {
                            const cellValue = String(cell.v);
                            maxWidth = Math.max(maxWidth, cellValue.length);
                        }
                    }

                    // 최소 너비 6, 최대 너비 35로 확장, 여유분 +4
                    return { wch: Math.min(Math.max(maxWidth + 4, 6), 35) };
                });

                ws['!cols'] = colWidths;

                // 모든 셀에 스타일 강제 적용 (누락 셀 포함)
                const totalRows = rowIndex;
                for (let r = 0; r < totalRows; r++) {
                    for (let c = 0; c < headers.length; c++) {
                        const cellRef = (XLSX as any).utils.encode_cell({ r, c });
                        if (ws_data[cellRef]) {
                            // 이미 스타일이 있다면 border/align 보장
                            ws_data[cellRef].s = { ...centerAlign, ...(ws_data[cellRef].s || {}) };
                        } else {
                            // 빈셀도 스타일 적용
                            ws_data[cellRef] = { v: '', t: 's', s: centerAlign };
                        }
                    }
                }

                (XLSX as any).utils.book_append_sheet(wb, ws, groupName);
            }

            if (wb.SheetNames.length === 0) {
                toast({
                    title: "내보내기 실패",
                    description: "엑셀로 내보낼 데이터가 없습니다.",
                });
                return;
            }

            // 엑셀 파일 다운로드
            const fileName = `${tournamentName || '대회'}_점수표_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.xlsx`;
            (XLSX as any).writeFile(wb, fileName);

            toast({
                title: "엑셀 다운로드 완료",
                description: `${wb.SheetNames.length}개 그룹의 점수표가 다운로드되었습니다.`,
            });

        } catch (error) {
            console.error("Export Failed:", error);
            toast({ title: "내보내기 실패", description: "엑셀 파일 생성 중 오류가 발생했습니다.", variant: "destructive" });
        } finally {
            setIsExporting(false);
        }
    };






    // 🚀 점수표 이미지 생성 및 다운로드 함수 (유실 복구)
    async function generateImages(groupsToPrint: string[], paperSize: string, orientation: string) {
        // html2canvas 동적 임포트 확인
        const html2canvas = (window as any).html2canvas || (await import('html2canvas')).default;

        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = orientation === 'landscape' ? '297mm' : '210mm';
        document.body.appendChild(container);

        try {
            for (const groupName of groupsToPrint) {
                const groupPlayers = finalDataByGroup[groupName];
                if (!groupPlayers || groupPlayers.length === 0) continue;

                // 9명씩 한 페이징
                for (let i = 0; i < groupPlayers.length; i += 9) {
                    const pagePlayers = groupPlayers.slice(i, i + 9);
                    const wrapper = document.createElement('div');
                    wrapper.style.padding = '20px';
                    wrapper.style.background = 'white';
                    wrapper.style.width = '100%';

                    // 스타일 추가
                    const style = document.createElement('style');
                    style.innerHTML = `
                        .print-header { background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; padding: 12px; text-align: center; margin-bottom: 15px; border-radius: 8px; }
                        .score-table { width: 100%; border-collapse: collapse; font-size: 14px; }
                        .score-table th, .score-table td { border: 1px solid #94a3b8; text-align: center; padding: 6px 4px; }
                        .score-table th { background: #f1f5f9; font-weight: bold; }
                        .rank-cell { font-weight: 800; font-size: 18px; color: #1e40af; }
                        .player-name { font-weight: bold; }
                        .total-score { font-weight: 800; color: #1e40af; }
                        .pm-plus { color: #dc2626; font-size: 10px; }
                        .pm-minus { color: #2563eb; font-size: 10px; }
                    `;
                    wrapper.appendChild(style);

                    // 임시 HTML 생성 (generatePrintHTML 로직 응용)
                    let html = `<div class="print-header"><h1>🏌️‍♂️ ${tournamentName}</h1><p>${groupName} (${i / 9 + 1}P)</p></div>`;
                    html += `<table class="score-table"><thead><tr><th>순위</th><th>조</th><th>선수명</th><th>소속</th><th>코스</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>합계</th><th>총타수</th></tr></thead><tbody>`;

                    pagePlayers.forEach((player: any) => {
                        player.assignedCourses.forEach((course: any, cIdx: number) => {
                            html += `<tr>`;
                            if (cIdx === 0) {
                                html += `<td rowspan="${player.assignedCourses.length}" class="rank-cell">${player.rank || ''}</td>`;
                                html += `<td rowspan="${player.assignedCourses.length}">${player.jo}</td>`;
                                html += `<td rowspan="${player.assignedCourses.length}" class="player-name">${player.name}</td>`;
                                html += `<td rowspan="${player.assignedCourses.length}">${player.affiliation}</td>`;
                            }
                            html += `<td>${player.coursesData[course.id]?.courseName || ''}</td>`;
                            for (let h = 0; h < 9; h++) html += `<td>${player.coursesData[course.id]?.holeScores[h] ?? '-'}</td>`;
                            html += `<td>${player.coursesData[course.id]?.courseTotal || '-'}</td>`;
                            if (cIdx === 0) {
                                html += `<td rowspan="${player.assignedCourses.length}" class="total-score">${player.totalScore || '-'}</td>`;
                            }
                            html += `</tr>`;
                        });
                    });
                    html += `</tbody></table>`;

                    const content = document.createElement('div');
                    content.innerHTML = html;
                    wrapper.appendChild(content);
                    container.appendChild(wrapper);

                    const canvas = await html2canvas(wrapper, {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#ffffff'
                    });

                    const link = document.createElement('a');
                    link.download = `${tournamentName}_${groupName}_${i / 9 + 1}P.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();

                    container.removeChild(wrapper);
                }
            }
        } finally {
            document.body.removeChild(container);
        }
    }

    // 그룹명 영어 번역 함수
    const getGroupNameEnglish = (groupName: string): string => {
        const translations: { [key: string]: string } = {
            '여자부': "Women's Division",
            '남자부': "Men's Division",
            '남자 시니어': "Men's Senior",
            '여자 시니어': "Women's Senior",
            '남자일반': "Men's General",
            '여자일반': "Women's General",
            '부부대항': "Couples",
            '2인1조': "2-Person Team"
        };
        return translations[groupName] || groupName;
    };

    // 🚀 점수표 이미지 저장 핸들러 복구
    const handleSaveImage = async () => {
        setIsSavingImage(true);
        try {
            const groupsToPrint = printModal.showAllGroups ? allGroupsList : printModal.selectedGroups;
            if (groupsToPrint.length === 0) {
                toast({ title: "알림", description: "선택된 그룹이 없습니다." });
                return;
            }
            await generateImages(groupsToPrint, printModal.paperSize, printModal.orientation);
            toast({ title: "이미지 저장 완료", description: `${groupsToPrint.length}개 그룹의 점수표 이미지가 생성되었습니다.` });
        } catch (error) {
            console.error("Image Save Failed:", error);
            toast({ title: "저장 실패", description: "이미지 생성 중 오류가 발생했습니다.", variant: "destructive" });
        } finally {
            setIsSavingImage(false);
            setPrintModal(prev => ({ ...prev, open: false }));
        }
    };


    const handlePlayerSearchSelect = (pid: string) => {
        setSearchPlayer("");
        setHighlightedPlayerId(Number(pid));
        const row = playerRowRefs.current[pid]?.[0];
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    // --- 🛡️ 훅 및 유틸리티 추출 (컴포넌트 최상위 수준에 가깝게 재배치) ---

    // 🛡️ ScoreLogs 최적화 - 외부 전광판과 완전히 동일한 방식
    useEffect(() => {
        const fetchLogs = async () => {
            if (Object.keys(finalDataByGroup).length === 0) return;

            // 점수가 있는 선수들만 로그 로딩 대상
            const allPlayersWithScores = Object.values(finalDataByGroup)
                .flat()
                .filter((p: any) => p.hasAnyScore)
                .map((p: any) => p.id);

            const logsMap: { [playerId: string]: any[] } = {};

            // 기존 로그 캐시 유지하면서 새로운 선수만 로딩
            const existingPlayerIds = Object.keys(playerScoreLogs);
            const newPlayerIds = allPlayersWithScores.filter(pid => !existingPlayerIds.includes(pid));

            if (newPlayerIds.length > 0) {
                await Promise.all(newPlayerIds.map(async (pid) => {
                    try {
                        const logs = await getPlayerScoreLogsOptimized(pid);
                        logsMap[pid] = logs;
                    } catch (error) {
                        console.error(`❌ ScoreLogs 기본 로딩 실패 - 선수 ${pid}: `, error);
                        logsMap[pid] = [];
                    }
                }));

                setPlayerScoreLogs((prev: any) => ({
                    ...prev,
                    ...logsMap
                }));
            }
        };

        fetchLogs();
    }, [finalDataByGroup]);

    // 이전 점수를 추적하기 위한 Ref (최적화용)
    const prevScoresRef = useRef<any>({});

    // 🚀 점수 수정 시 즉시 해당 선수 로그 업데이트 (중요 기능 보장)
    const updatePlayerLogImmediately = async (playerId: string) => {
        try {
            const logs = await getPlayerScoreLogsOptimized(playerId);
            setPlayerScoreLogs(prev => ({ ...prev, [playerId]: logs }));
        } catch (error) {
            console.error('로그 업데이트 실패:', playerId, error);
        }
    };

    // 점수 변경 시 해당 선수의 로그만 즉시 업데이트
    useEffect(() => {
        const updateLogsForChangedScores = async () => {
            if (!scores) return;

            const prevScores = prevScoresRef.current;
            const currentScores = scores;

            const allPlayerIds = new Set([...Object.keys(prevScores), ...Object.keys(currentScores)]);
            const changedPlayerIds: string[] = [];

            allPlayerIds.forEach(playerId => {
                const prev = prevScores[playerId];
                const curr = currentScores[playerId];
                if (prev === curr) return;
                if (!prev || !curr) {
                    changedPlayerIds.push(playerId);
                    return;
                }
                if (JSON.stringify(prev) !== JSON.stringify(curr)) {
                    changedPlayerIds.push(playerId);
                }
            });

            if (changedPlayerIds.length > 0) {
                for (const playerId of changedPlayerIds) {
                    updatePlayerLogImmediately(playerId).catch(e => console.error(e));
                }
            }
            prevScoresRef.current = currentScores;
        };

        updateLogsForChangedScores();
    }, [scores]);

    // 🛡️ 탭 비활성화 시 데이터 다운로드 중단
    useEffect(() => {
        const onVisibilityChange = () => {
            if (typeof document === 'undefined') return;
            if (document.hidden) {
                stopSubscriptions();
            } else {
                setResumeSeq((s: number) => s + 1);
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    const filteredPlayerResults = useMemo(() => {
        if (!searchPlayer) return [];
        const lowerCaseSearch = searchPlayer.toLowerCase();
        return Object.values(finalDataByGroup).flat().filter((player: any) => {
            return player.name.toLowerCase().includes(lowerCaseSearch) || player.affiliation.toLowerCase().includes(lowerCaseSearch);
        });
    }, [searchPlayer, finalDataByGroup]);

    // 자동 기권 처리 함수
    const autoForfeitPlayersByMissingScores = async ({ players, scores, groupsData, toast }: any) => {
        if (!players || !scores || !groupsData || !db) return;
        const alreadyForfeited: Set<string> = new Set();
        for (const groupName in groupsData) {
            const group = groupsData[groupName];
            if (!group || !group.players) continue;
            const playerIds: string[] = Object.keys(group.players).filter(pid => group.players[pid]);
            const courseIds: string[] = group.courses ? Object.keys(group.courses).filter(cid => group.courses[cid]) : [];

            for (const courseId of courseIds) {
                const holesWithAnyScore: number[] = [];
                for (let hole = 1; hole <= 9; hole++) {
                    if (playerIds.some(pid => scores?.[pid]?.[courseId]?.[hole] !== undefined && scores?.[pid]?.[courseId]?.[hole] !== null)) {
                        holesWithAnyScore.push(hole);
                    }
                }

                for (const pid of playerIds) {
                    let forfeited = false;
                    for (let h = 1; h <= 9; h++) {
                        if (scores?.[pid]?.[courseId]?.[h] === 0) forfeited = true;
                    }
                    if (forfeited) {
                        alreadyForfeited.add(pid);
                        continue;
                    }

                    let missingCount = 0;
                    for (const hole of holesWithAnyScore) {
                        const val = scores?.[pid]?.[courseId]?.[hole];
                        if (val === undefined || val === null) missingCount++;
                    }

                    if (missingCount >= 3 && !alreadyForfeited.has(pid)) {
                        try {
                            const playerScoresSnap = await get(ref(db, `scores/${pid}`));
                            if (playerScoresSnap.exists()) {
                                const backupRef = ref(db, `backups/scoresBeforeForfeit/${pid}`);
                                const backupSnap = await get(backupRef);
                                if (!backupSnap.exists()) {
                                    await set(backupRef, { data: playerScoresSnap.val(), createdAt: Date.now() });
                                }
                            }
                        } catch (e) { }

                        for (const cid of courseIds) {
                            for (let h = 1; h <= 9; h++) {
                                if (scores?.[pid]?.[cid]?.[h] !== 0) {
                                    await set(ref(db, `scores/${pid}/${cid}/${h}`), 0);
                                }
                            }
                        }
                        alreadyForfeited.add(pid);
                        toast({ title: '자동 기권 처리', description: `선수: ${players[pid]?.name || pid}`, variant: 'destructive' });
                    }

                }
            }
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            autoForfeitPlayersByMissingScores({ players, scores, groupsData, toast });
        }, 2000);
        return () => clearTimeout(timer);
    }, [scores, players, groupsData]);

    return (
        <>
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold font-headline">홈 전광판 (관리자용)</CardTitle>
                        <CardDescription>현재 진행중인 대회의 실시간 점수 현황입니다.</CardDescription>
                        {/* 임시 콘솔 출력 버튼 제거됨 */}
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* 선수 검색 입력창 */}
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center sm:justify-between p-4 bg-muted/50 rounded-lg">
                            <div className="flex flex-row gap-2 items-center w-full sm:w-auto">
                                <Filter className="w-5 h-5 text-muted-foreground" />
                                <Select value={filterGroup} onValueChange={setFilterGroup}>
                                    <SelectTrigger className="w-[140px] sm:w-[180px]">
                                        <SelectValue placeholder="그룹 필터" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">모든 그룹</SelectItem>
                                        {allGroupsList.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Button className="ml-2 bg-green-600 hover:bg-green-700 text-white" onClick={handleExportToExcel} disabled={Object.keys(players).length === 0}>
                                    <Download className="mr-2 h-4 w-4" />
                                    엑셀로 다운로드
                                </Button>
                                <Button className="ml-2 bg-blue-600 hover:bg-blue-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={handleArchiveClick}>
                                    기록 보관하기
                                </Button>
                                <Button className="ml-2 bg-red-600 hover:bg-red-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={() => setShowResetConfirm(true)}>
                                    점수 초기화
                                </Button>
                                <Button className="ml-2 bg-amber-500 hover:bg-amber-600 text-white min-w-[140px] px-4 py-2 font-bold" onClick={handleActivateAdmin}>
                                    <Lock className="mr-2 h-4 w-4" />
                                    관리자 권한 활성화
                                </Button>

                                {/* 점수 초기화 확인 모달 */}
                                {showResetConfirm && (
                                    <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>
                                                    {filterGroup === 'all'
                                                        ? '정말로 모든 점수를 초기화하시겠습니까?'
                                                        : `정말로 ${filterGroup} 그룹의 점수를 초기화하시겠습니까 ? `}
                                                </DialogTitle>
                                                <DialogDescription>
                                                    {filterGroup === 'all'
                                                        ? '이 작업은 되돌릴 수 없으며, 모든 선수의 대회 점수가 삭제됩니다.'
                                                        : '이 작업은 되돌릴 수 없으며, 이 그룹의 모든 점수가 삭제됩니다.'}
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="flex flex-row justify-end gap-2 mt-4">
                                                <Button variant="outline" onClick={() => setShowResetConfirm(false)}>취소</Button>
                                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleResetScores}>초기화 진행</Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </div>
                        </div>

                        {/* 점수 수정용 선수/팀 검색 카드 */}
                        <Card className="mb-4">
                            <div className="flex flex-row items-center justify-between w-full p-4">
                                <span className="text-base font-bold whitespace-nowrap mr-4">점수 수정을 위해 선수 검색시 사용</span>
                                <div className="flex flex-row gap-2 items-center w-full max-w-xs border rounded bg-white shadow px-3 py-2">
                                    <input
                                        type="text"
                                        className="w-full outline-none bg-transparent"
                                        placeholder="선수명 또는 팀명 검색"
                                        value={searchPlayer}
                                        onChange={e => setSearchPlayer(e.target.value)}
                                    />
                                    {searchPlayer && filteredPlayerResults.length > 0 && (
                                        <div className="absolute bg-white border rounded shadow-lg z-50 mt-10 max-h-60 overflow-y-auto">
                                            {filteredPlayerResults.map((result: any, idx) => (
                                                <div
                                                    key={result.id}
                                                    className="px-3 py-2 hover:bg-primary/20 cursor-pointer"
                                                    onClick={() => handlePlayerSearchSelect(result.id)}
                                                >
                                                    {result.name} <span className="text-xs text-muted-foreground">({result.group})</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    </CardContent>
                </Card>

                {(filterGroup === 'all' ? allGroupsList : [filterGroup]).map(groupName => {
                    const groupPlayers = finalDataByGroup[groupName];
                    if (!groupPlayers || groupPlayers.length === 0) return null;

                    return (
                        <Card key={groupName}>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="flex flex-col gap-2">
                                    <CardTitle className="text-xl font-bold font-headline">{groupName}</CardTitle>
                                    {/* 경기완료/순위 계산 확인 버튼 */}
                                    <button
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold w-fit"
                                        onClick={() => checkGroupScoreCompletion(groupName, groupPlayers)}
                                    >
                                        경기완료/순위 계산 확인
                                    </button>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-primary">{groupProgress[groupName]}%</p>
                                    <p className="text-sm text-muted-foreground">진행률</p>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto border rounded-lg">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-16 text-center px-2 py-2 border-r">순위</TableHead>
                                                <TableHead className="w-16 text-center px-2 py-2 border-r">조</TableHead>
                                                <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{ minWidth: '90px', maxWidth: '260px', flexGrow: 1 }}>선수명(팀명)</TableHead>
                                                <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{ minWidth: '80px', maxWidth: '200px', flexGrow: 1 }}>소속</TableHead>
                                                <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{ minWidth: '80px', maxWidth: '200px', flexGrow: 1 }}>코스</TableHead>
                                                {Array.from({ length: 9 }).map((_, i) => <TableHead key={i} className="w-10 text-center px-2 py-2 border-r">{i + 1}</TableHead>)}
                                                <TableHead className="w-24 text-center px-2 py-2 border-r">합계</TableHead>
                                                <TableHead className="w-24 text-center px-2 py-2">총타수</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {groupPlayers.map((player: any) => (
                                                <React.Fragment key={player.id}>
                                                    {player.assignedCourses.length > 0 ? player.assignedCourses.map((course: any, courseIndex: number) => (
                                                        <TableRow
                                                            key={`${player.id} -${course.id} `}
                                                            ref={el => {
                                                                const playerId = String(player.id);
                                                                if (!playerRowRefs.current[playerId]) playerRowRefs.current[playerId] = [];
                                                                playerRowRefs.current[playerId][courseIndex] = el;
                                                            }}
                                                            className={`text - base ${highlightedPlayerId === player.id ? 'bg-yellow-100 animate-pulse' : ''} `}
                                                        >
                                                            {courseIndex === 0 && (
                                                                <>
                                                                    <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank} 위` : (player.hasForfeited ? (() => {
                                                                        // 기권 타입을 player.forfeitType에서 가져오기
                                                                        if (player.forfeitType === 'absent') return '불참';
                                                                        if (player.forfeitType === 'disqualified') return '실격';
                                                                        if (player.forfeitType === 'forfeit') return '기권';
                                                                        return '기권';
                                                                    })() : '')}</TableCell>
                                                                    <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                                    <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle font-semibold px-2 py-1 border-r text-center whitespace-nowrap" style={{ minWidth: '90px', maxWidth: '260px', flexGrow: 1 }}>{player.name}</TableCell>
                                                                    <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle text-muted-foreground px-2 py-1 border-r text-center whitespace-nowrap" style={{ minWidth: '80px', maxWidth: '200px', flexGrow: 1 }}>{player.affiliation}</TableCell>
                                                                    {/* 기권 버튼 추가 */}
                                                                    {/* <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle px-2 py-1 border-r">
                                                                    <Button
                                                                        variant="destructive"
                                                                        size="sm"
                                                                        disabled={player.hasForfeited}
                                                                        onClick={() => setForfeitModal({ open: true, player })}
                                                                    >
                                                                        기권
                                                                    </Button>
                                                                </TableCell> */}
                                                                </>
                                                            )}

                                                            <TableCell className="font-medium px-2 py-1 border-r text-center whitespace-nowrap" style={{ minWidth: '80px', maxWidth: '200px', flexGrow: 1 }}>{player.coursesData[course.id]?.courseName}</TableCell>

                                                            {player.coursesData[course.id]?.holeScores.map((score: any, i: number) => {
                                                                // 해당 셀(플레이어/코스/홀)에 대한 최근 로그 찾기
                                                                const logs = playerScoreLogs[player.id] || [];
                                                                const cellLog = logs.find(l => String(l.courseId) === String(course.id) && Number(l.holeNumber) === i + 1);
                                                                // 실제로 수정된 경우만 빨간색으로 표시 (oldValue와 newValue가 다르고, 0점이 아닌 경우)
                                                                const isModified = !!cellLog && cellLog.oldValue !== cellLog.newValue && cellLog.oldValue !== 0;
                                                                // 툴팁 내용 구성
                                                                const tooltipContent = cellLog ? (
                                                                    <div>
                                                                        <div><b>수정자:</b> {cellLog.modifiedByType === 'admin' ? '관리자' : cellLog.modifiedByType === 'captain' ? (cellLog.modifiedBy || '조장') : (cellLog.modifiedBy || '심판')}</div>
                                                                        <div><b>일시:</b> {cellLog.modifiedAt ? new Date(cellLog.modifiedAt).toLocaleString('ko-KR') : ''}</div>
                                                                        <div><b>변경:</b> {cellLog.oldValue} → {cellLog.newValue}</div>
                                                                        {cellLog.comment && <div><b>비고:</b> {cellLog.comment}</div>}
                                                                    </div>
                                                                ) : null;
                                                                // 파 정보
                                                                const courseData = courses[course.id];
                                                                const par = courseData && Array.isArray(courseData.pars) ? courseData.pars[i] : null;
                                                                let pm = null;
                                                                if (isValidNumber(score) && isValidNumber(par)) {
                                                                    pm = score - par;
                                                                }
                                                                return (
                                                                    <TableCell
                                                                        key={i}
                                                                        className={`text - center font - mono px - 2 py - 1 border - r cursor - pointer hover: bg - primary / 10 ${isModified ? 'text-red-600 font-bold bg-red-50' : ''} `}
                                                                        onDoubleClick={async () => {
                                                                            // 현재 점수와 기권 타입 확인
                                                                            const currentScore = score === null ? null : Number(score);
                                                                            let initialForfeitType: 'absent' | 'disqualified' | 'forfeit' | null = null;

                                                                            // 점수가 없으면 불참으로 초기화
                                                                            if (currentScore === null) {
                                                                                initialForfeitType = 'absent';
                                                                            } else if (currentScore === 0) {
                                                                                // 점수가 0이면 로그에서 기권 타입 확인
                                                                                const logs = playerScoreLogs[player.id] || [];
                                                                                const forfeitLogs = logs
                                                                                    .filter(l => l.newValue === 0 && l.holeNumber === i + 1 &&
                                                                                        (l.courseId === course.id || (l.comment && l.comment.includes(`코스: ${course.id} `))))
                                                                                    .sort((a, b) => b.modifiedAt - a.modifiedAt);

                                                                                if (forfeitLogs.length > 0) {
                                                                                    const latestLog = forfeitLogs[0];
                                                                                    if (latestLog.comment?.includes('불참')) initialForfeitType = 'absent';
                                                                                    else if (latestLog.comment?.includes('실격')) initialForfeitType = 'disqualified';
                                                                                    else if (latestLog.comment?.includes('기권')) initialForfeitType = 'forfeit';
                                                                                }
                                                                            }

                                                                            setScoreEditModal({
                                                                                open: true,
                                                                                playerId: player.id,
                                                                                courseId: course.id,
                                                                                holeIndex: i,
                                                                                score: currentScore === null ? '' : String(currentScore),
                                                                                forfeitType: initialForfeitType,
                                                                                playerName: player.name,
                                                                                courseName: player.coursesData[course.id]?.courseName || ''
                                                                            });
                                                                        }}
                                                                    >
                                                                        <TooltipProvider delayDuration={0}>
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <span>
                                                                                        {isValidNumber(score) ? score : '-'}
                                                                                        {/* ±타수 표기 */}
                                                                                        {isValidNumber(pm) && score !== 0 && pm !== null && (
                                                                                            <span
                                                                                                className={
                                                                                                    'ml-1 text-xs align-middle ' + (pm < 0 ? 'text-blue-400' : pm > 0 ? 'text-red-400' : 'text-gray-400')
                                                                                                }
                                                                                                style={{ fontSize: '0.7em', fontWeight: 600 }}
                                                                                            >
                                                                                                {pm === 0 ? 'E' : (pm > 0 ? `+ ${pm} ` : pm)}
                                                                                            </span>
                                                                                        )}
                                                                                    </span>
                                                                                </TooltipTrigger>
                                                                                {isModified && tooltipContent && (
                                                                                    <TooltipContent side="top" className="whitespace-pre-line">
                                                                                        {tooltipContent}
                                                                                    </TooltipContent>
                                                                                )}
                                                                            </Tooltip>
                                                                        </TooltipProvider>
                                                                    </TableCell>
                                                                );
                                                            })}

                                                            <TableCell className="text-center font-bold px-2 py-1 border-r">
                                                                {(() => {
                                                                    let courseSumElem: string | React.ReactElement = '-';
                                                                    if (player.hasAnyScore && !player.hasForfeited) {
                                                                        const courseData = courses[course.id];
                                                                        let sum = 0, parSum = 0;
                                                                        if (courseData && Array.isArray(courseData.pars)) {
                                                                            for (let i = 0; i < 9; i++) {
                                                                                const s = player.coursesData[course.id]?.holeScores[i];
                                                                                const p = courseData.pars[i];
                                                                                if (isValidNumber(s) && isValidNumber(p) && s !== null) {
                                                                                    sum += s;
                                                                                    parSum += p;
                                                                                }
                                                                            }
                                                                        }
                                                                        const pm = isValidNumber(sum) && isValidNumber(parSum) && parSum > 0 ? sum - parSum : null;
                                                                        courseSumElem = (
                                                                            <span>
                                                                                {isValidNumber(sum) ? sum : '-'}
                                                                                {isValidNumber(pm) && pm !== null && (
                                                                                    <span className={
                                                                                        'ml-1 align-middle text-xs ' + (pm < 0 ? 'text-blue-400' : pm > 0 ? 'text-red-400' : 'text-gray-400')
                                                                                    } style={{ fontSize: '0.7em', fontWeight: 600 }}>
                                                                                        {pm === 0 ? 'E' : (pm > 0 ? `+ ${pm} ` : pm)}
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        );
                                                                    } else if (player.hasForfeited) {
                                                                        // 기권 타입을 player.forfeitType에서 가져오기
                                                                        if (player.forfeitType === 'absent') {
                                                                            courseSumElem = '불참';
                                                                        } else if (player.forfeitType === 'disqualified') {
                                                                            courseSumElem = '실격';
                                                                        } else {
                                                                            courseSumElem = '기권';
                                                                        }
                                                                    }
                                                                    return courseSumElem;
                                                                })()}
                                                            </TableCell>

                                                            {courseIndex === 0 && (
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-primary text-lg px-2 py-1">
                                                                    {player.hasForfeited ? (() => {
                                                                        // 기권 타입을 player.forfeitType에서 가져오기
                                                                        let forfeitType = '기권';
                                                                        if (player.forfeitType === 'absent') forfeitType = '불참';
                                                                        else if (player.forfeitType === 'disqualified') forfeitType = '실격';
                                                                        else forfeitType = '기권';

                                                                        return (
                                                                            <TooltipProvider delayDuration={0}>
                                                                                <Tooltip>
                                                                                    <TooltipTrigger asChild>
                                                                                        <span className="text-red-600 font-bold cursor-pointer">{forfeitType}</span>
                                                                                    </TooltipTrigger>
                                                                                    <TooltipContent side="top" className="whitespace-pre-line">
                                                                                        {(() => {
                                                                                            const logs = playerScoreLogs[player.id] || [];
                                                                                            // '심판 직접 기권/불참/실격' 로그가 있으면 그 로그만 표시, 없으면 기존 방식
                                                                                            const directForfeitLog = logs.find(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment && (l.comment.includes('심판 직접 기권') || l.comment.includes('심판 직접 불참') || l.comment.includes('심판 직접 실격')));
                                                                                            let forfeitLog = directForfeitLog;
                                                                                            if (!forfeitLog) {
                                                                                                // 없으면 기존 방식(심판페이지에서 기권/불참/실격 처리 중 가장 오래된 것)
                                                                                                const forfeitLogs = logs
                                                                                                    .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment && (l.comment.includes('심판페이지에서 기권 처리') || l.comment.includes('심판페이지에서 불참 처리') || l.comment.includes('심판페이지에서 실격 처리')))
                                                                                                    .sort((a, b) => a.modifiedAt - b.modifiedAt);
                                                                                                forfeitLog = forfeitLogs[0];
                                                                                            }
                                                                                            if (forfeitLog) {
                                                                                                // comment 예시: "심판 직접 기권 (코스: 1구장 A코스, 홀: 8)"
                                                                                                let displayComment = '';
                                                                                                const match = forfeitLog.comment && forfeitLog.comment.match(/코스: ([^,]+), 홀: (\d+)/);
                                                                                                if (match) {
                                                                                                    const courseName = match[1];
                                                                                                    const holeNum = match[2];
                                                                                                    displayComment = `${courseName}, ${holeNum}번홀 심판이 ${forfeitType} 처리`;
                                                                                                } else {
                                                                                                    displayComment = forfeitLog.comment || '';
                                                                                                }
                                                                                                return (
                                                                                                    <div>
                                                                                                        <div><b>{forfeitType} 처리자:</b> 심판</div>
                                                                                                        <div>{forfeitLog.modifiedAt ? new Date(forfeitLog.modifiedAt).toLocaleString('ko-KR') : ''}</div>
                                                                                                        <div>{displayComment}</div>
                                                                                                    </div>
                                                                                                );
                                                                                            } else {
                                                                                                return <div>심판페이지에서 {forfeitType} 처리 내역이 없습니다.</div>;
                                                                                            }
                                                                                        })()}
                                                                                    </TooltipContent>
                                                                                </Tooltip>
                                                                            </TooltipProvider>
                                                                        );
                                                                    })() : player.hasAnyScore ? (
                                                                        <span>
                                                                            {isValidNumber(player.totalScore) ? player.totalScore : '-'}
                                                                            {isValidNumber(player.plusMinus) && player.plusMinus !== null && (
                                                                                <span
                                                                                    className={
                                                                                        'ml-1 align-middle text-xs ' +
                                                                                        (player.plusMinus < 0
                                                                                            ? 'text-blue-400'
                                                                                            : player.plusMinus > 0
                                                                                                ? 'text-red-400'
                                                                                                : 'text-gray-400')
                                                                                    }
                                                                                    style={{ fontSize: '0.7em', fontWeight: 600 }}
                                                                                >
                                                                                    {player.plusMinus === 0
                                                                                        ? 'E'
                                                                                        : player.plusMinus > 0
                                                                                            ? `+ ${player.plusMinus} `
                                                                                            : player.plusMinus}
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    ) : (
                                                                        '-'
                                                                    )}
                                                                </TableCell>
                                                            )}
                                                        </TableRow>
                                                    )) : (
                                                        <TableRow key={`${player.id} -no - course`} className="text-base text-muted-foreground">
                                                            <TableCell className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank} 위` : (player.hasForfeited ? (() => {
                                                                // 기권 타입을 player.forfeitType에서 가져오기
                                                                if (player.forfeitType === 'absent') return '불참';
                                                                if (player.forfeitType === 'disqualified') return '실격';
                                                                if (player.forfeitType === 'forfeit') return '기권';
                                                                return '기권';
                                                            })() : '-')}</TableCell>
                                                            <TableCell className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                            <TableCell className="align-middle font-semibold px-2 py-1 border-r text-center">{player.name}</TableCell>
                                                            <TableCell className="align-middle px-2 py-1 border-r text-center">{player.affiliation}</TableCell>
                                                            <TableCell colSpan={11} className="text-center px-2 py-1 border-r">이 그룹에 배정된 코스가 없습니다.</TableCell>
                                                            <TableCell className="text-center align-middle font-bold text-primary text-lg px-2 py-1">{player.hasForfeited ? (() => {
                                                                // 기권 타입을 player.forfeitType에서 가져오기
                                                                if (player.forfeitType === 'absent') return '불참';
                                                                if (player.forfeitType === 'disqualified') return '실격';
                                                                if (player.forfeitType === 'forfeit') return '기권';
                                                                return '기권';
                                                            })() : (player.hasAnyScore ? player.totalScore : '-')}</TableCell>
                                                        </TableRow>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
            {/* 인쇄 모달 */}
            <Dialog open={printModal.open} onOpenChange={open => setPrintModal({ ...printModal, open })}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>📄 점수표 인쇄 설정</DialogTitle>
                        <DialogDescription>
                            인쇄할 점수표의 설정을 선택해주세요.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* 인쇄 방향 선택 */}
                        <div>
                            <label className="text-sm font-medium mb-2 block">인쇄 방향</label>
                            <div className="flex gap-2">
                                <Button
                                    variant={printModal.orientation === 'portrait' ? 'default' : 'outline'}
                                    onClick={() => setPrintModal({ ...printModal, orientation: 'portrait' })}
                                    className="flex-1"
                                >
                                    세로 인쇄
                                </Button>
                                <Button
                                    variant={printModal.orientation === 'landscape' ? 'default' : 'outline'}
                                    onClick={() => setPrintModal({ ...printModal, orientation: 'landscape' })}
                                    className="flex-1"
                                >
                                    가로 인쇄
                                </Button>
                            </div>
                        </div>

                        {/* 용지 크기 선택 */}
                        <div>
                            <label className="text-sm font-medium mb-2 block">용지 크기</label>
                            <div className="flex gap-2">
                                <Button
                                    variant={printModal.paperSize === 'A4' ? 'default' : 'outline'}
                                    onClick={() => setPrintModal({ ...printModal, paperSize: 'A4' })}
                                    className="flex-1"
                                >
                                    A4
                                </Button>
                                <Button
                                    variant={printModal.paperSize === 'A3' ? 'default' : 'outline'}
                                    onClick={() => setPrintModal({ ...printModal, paperSize: 'A3' })}
                                    className="flex-1"
                                >
                                    A3
                                </Button>
                            </div>
                        </div>

                        {/* 인쇄할 그룹 선택 */}
                        <div>
                            <label className="text-sm font-medium mb-2 block">인쇄할 그룹</label>
                            <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2">
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={printModal.showAllGroups}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setPrintModal({
                                                    ...printModal,
                                                    showAllGroups: true,
                                                    selectedGroups: allGroupsList
                                                });
                                            } else {
                                                setPrintModal({
                                                    ...printModal,
                                                    showAllGroups: false,
                                                    selectedGroups: []
                                                });
                                            }
                                        }}
                                        className="mr-2"
                                    />
                                    <span className="text-sm font-bold">모든 그룹</span>
                                    <span className="text-xs text-muted-foreground ml-2">({allGroupsList.length}개 그룹)</span>
                                </div>
                                {!printModal.showAllGroups && (
                                    <div className="ml-4 space-y-1">
                                        {allGroupsList.map((groupName) => (
                                            <div key={groupName} className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={printModal.selectedGroups.includes(groupName)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setPrintModal({
                                                                ...printModal,
                                                                selectedGroups: [...printModal.selectedGroups, groupName]
                                                            });
                                                        } else {
                                                            setPrintModal({
                                                                ...printModal,
                                                                selectedGroups: printModal.selectedGroups.filter(g => g !== groupName)
                                                            });
                                                        }
                                                    }}
                                                    className="mr-2"
                                                />
                                                <span className="text-sm">{groupName}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {printModal.showAllGroups
                                    ? `모든 그룹(${allGroupsList.length}개)이 선택되었습니다.각 그룹은 별도 페이지로 인쇄됩니다.`
                                    : printModal.selectedGroups.length > 0
                                        ? `${printModal.selectedGroups.length}개 그룹이 선택되었습니다.각 그룹은 별도 페이지로 인쇄됩니다.`
                                        : '인쇄할 그룹을 선택해주세요.'
                                }
                            </p>
                        </div>

                        {/* 출력할 코스 선택 */}
                        <div>
                            <label className="text-sm font-medium mb-2 block">출력할 코스 선택</label>
                            <div className="space-y-2 border rounded p-2">
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={printModal.showAllCourses}
                                        onChange={(e) => {
                                            const availableCoursesList = new Set<string>();
                                            Object.values(finalDataByGroup).forEach((playersList: any) => {
                                                playersList.forEach((p: any) => {
                                                    p.assignedCourses?.forEach((c: any) => {
                                                        const cName = p.coursesData[c.id]?.courseName || c.name;
                                                        if (cName) availableCoursesList.add(cName);
                                                    });
                                                });
                                            });

                                            if (e.target.checked) {
                                                setPrintModal({
                                                    ...printModal,
                                                    showAllCourses: true,
                                                    selectedCourses: Array.from(availableCoursesList).sort()
                                                });
                                            } else {
                                                setPrintModal({
                                                    ...printModal,
                                                    showAllCourses: false,
                                                    selectedCourses: []
                                                });
                                            }
                                        }}
                                        className="mr-2"
                                    />
                                    <span className="text-sm font-bold">모든 코스</span>
                                </div>
                                {!printModal.showAllCourses && (
                                    <div className="ml-4 flex flex-wrap gap-x-4 gap-y-1">
                                        {(() => {
                                            const availableCoursesList = new Set<string>();
                                            Object.values(finalDataByGroup).forEach((playersList: any) => {
                                                playersList.forEach((p: any) => {
                                                    p.assignedCourses?.forEach((c: any) => {
                                                        const cName = p.coursesData[c.id]?.courseName || c.name;
                                                        if (cName) availableCoursesList.add(cName);
                                                    });
                                                });
                                            });
                                            return Array.from(availableCoursesList).sort().map((courseName) => (
                                                <div key={courseName} className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={printModal.selectedCourses.includes(courseName)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setPrintModal({
                                                                    ...printModal,
                                                                    selectedCourses: [...printModal.selectedCourses, courseName]
                                                                });
                                                            } else {
                                                                setPrintModal({
                                                                    ...printModal,
                                                                    selectedCourses: printModal.selectedCourses.filter(c => c !== courseName)
                                                                });
                                                            }
                                                        }}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-sm">{courseName}</span>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 text-blue-600 font-medium italic">
                                * 선택한 코스만 인쇄되지만, 순위와 총타수는 전체 코스 성적으로 계산됩니다.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => setPrintModal({ ...printModal, open: false })} className="mt-2 sm:mt-0">
                            취소
                        </Button>
                        <Button
                            variant="outline"
                            onClick={showPreview}
                            className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                            disabled={!printModal.showAllGroups && printModal.selectedGroups.length === 0}
                        >
                            👁️ 미리보기
                        </Button>
                        <Button
                            onClick={handleSaveImage}
                            className="bg-orange-600 hover:bg-orange-700 text-white w-full sm:w-auto"
                            disabled={!printModal.showAllGroups && printModal.selectedGroups.length === 0 || isSavingImage}
                        >
                            {isSavingImage ? '변환 중...' : '📸 점수표 이미지 저장'}
                        </Button>
                        <Button
                            onClick={executePrint}
                            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                            disabled={!printModal.showAllGroups && printModal.selectedGroups.length === 0}
                        >
                            🖨️ 인쇄하기
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 점수 누락 현황 모달 */}
            <Dialog open={scoreCheckModal.open} onOpenChange={open => setScoreCheckModal({ ...scoreCheckModal, open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>경기완료/순위 계산 확인</DialogTitle>
                        <DialogDescription>
                            {scoreCheckModal.missingScores.length === 0 ? (
                                <span className="text-green-600 font-bold">모든 점수가 100% 입력되어 있습니다!</span>
                            ) : (
                                <span className="text-red-600 font-bold">누락된 점수가 {scoreCheckModal.missingScores.length}개 있습니다.</span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    {scoreCheckModal.missingScores.length > 0 && (
                        <div className="max-h-60 overflow-y-auto border rounded p-2 mb-2 bg-muted/30">
                            <ul className="text-sm">
                                {scoreCheckModal.missingScores.map((item, idx) => (
                                    <li key={idx}>
                                        <b>{item.playerName}</b> - {item.courseName} {item.hole}번 홀
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {/* 순위/백카운트/서든데스 안내 메시지 */}
                    {scoreCheckModal.resultMsg && (
                        <div className="mt-4 p-3 rounded bg-blue-50 text-blue-900 font-bold text-center border">
                            {scoreCheckModal.resultMsg}
                        </div>
                    )}
                    <DialogFooter>
                        {scoreCheckModal.missingScores.length > 0 ? (
                            <>
                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleAutoFillZero} disabled={autoFilling}>
                                    {autoFilling ? '입력 중...' : '누락 점수 0점으로 자동 입력'}
                                </Button>
                                <Button variant="outline" onClick={() => setScoreCheckModal({ ...scoreCheckModal, open: false })} disabled={autoFilling}>닫기</Button>
                            </>
                        ) : (
                            <Button onClick={() => setScoreCheckModal({ ...scoreCheckModal, open: false })}>확인</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 점수 수정 모달 - 로컬 상태로 관리하여 부모 리렌더링 방지 */}
            <ScoreEditModal
                open={scoreEditModal.open}
                playerId={scoreEditModal.playerId}
                courseId={scoreEditModal.courseId}
                holeIndex={scoreEditModal.holeIndex}
                initialScore={scoreEditModal.score}
                initialForfeitType={scoreEditModal.forfeitType}
                playerName={scoreEditModal.playerName}
                courseName={scoreEditModal.courseName}
                onClose={() => setScoreEditModal(prev => ({ ...prev, open: false }))}
                onSave={async (score: string, forfeitType: any) => {
                    setScoreEditModal(prev => ({ ...prev, score, forfeitType }));
                    await handleScoreEditSave(score, forfeitType);
                }}
                finalDataByGroup={finalDataByGroup}
                playerScoreLogs={playerScoreLogs}
                scores={scores}
            />

            {/* Archive Modal */}
            <ArchiveModal
                open={archiveModalOpen}
                onOpenChange={setArchiveModalOpen}
                tournamentName={tournamentName}
                initialDate={archiveDate}
                onConfirm={handleConfirmArchive}
            />
        </>
    );
}