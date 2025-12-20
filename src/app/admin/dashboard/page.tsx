"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getPlayerScoreLogs, getPlayerScoreLogsOptimized, ScoreLog, logScoreChange, invalidatePlayerLogCache } from '@/lib/scoreLogs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Download, Filter, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx-js-style';
import { db } from '@/lib/firebase';
import { ref, onValue, set, get, query, limitToLast, onChildChanged, off } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import ExternalScoreboardInfo from '@/components/ExternalScoreboardInfo';
import { safeLocalStorageGetItem, safeLocalStorageSetItem, safeLocalStorageRemoveItem, cn } from '@/lib/utils';

interface ProcessedPlayer {
    id: string;
    jo: number;
    name: string;
    affiliation: string;
    group: string;
    totalScore: number;
    rank: number | null;
    hasAnyScore: boolean;
    hasForfeited: boolean;
    forfeitType: 'absent' | 'disqualified' | 'forfeit' | null; // 기권 타입 추가
    coursesData: {
        [courseId: string]: {
            courseName: string;
            courseTotal: number;
            holeScores: (number | null)[];
        }
    };
    total: number; // For tie-breaking
    courseScores: { [courseId: string]: number };
    detailedScores: { [courseId: string]: { [holeNumber: string]: number } };
    assignedCourses: any[];
    totalPar: number; // 파합계
    plusMinus: number | null; // ±타수
}

// Helper function for tie-breaking using back-count method
const tieBreak = (a: any, b: any, sortedCourses: any[]) => {
    if (a.hasForfeited && !b.hasForfeited) return 1;
    if (!a.hasForfeited && b.hasForfeited) return -1;

    if (!a.hasAnyScore && !b.hasAnyScore) return 0;
    if (!a.hasAnyScore) return 1;
    if (!b.hasAnyScore) return -1;

    if (a.total !== b.total) {
        return a.total - b.total;
    }

    // Compare total scores of each course in reverse alphabetical order
    for (const course of sortedCourses) {
        if (!course || course.id === undefined || course.id === null) continue; // 안전장치
        const courseId = course.id;
        const aScoreObj = a.courseScores || {};
        const bScoreObj = b.courseScores || {};
        const aCourseScore = aScoreObj[courseId] ?? 0;
        const bCourseScore = bScoreObj[courseId] ?? 0;
        if (aCourseScore !== bCourseScore) {
            return aCourseScore - bCourseScore;
        }
    }

    // If still tied, compare hole scores on the last course (alphabetically), from 9 to 1.
    if (sortedCourses.length > 0) {
        const lastCourse = sortedCourses[0];
        if (lastCourse && lastCourse.id !== undefined && lastCourse.id !== null) {
            const lastCourseId = lastCourse.id;
            const aDetailObj = a.detailedScores || {};
            const bDetailObj = b.detailedScores || {};
            const aHoleScores = aDetailObj[lastCourseId] || {};
            const bHoleScores = bDetailObj[lastCourseId] || {};
            for (let i = 9; i >= 1; i--) {
                const hole = i.toString();
                const aHole = aHoleScores[hole] || 0;
                const bHole = bHoleScores[hole] || 0;
                if (aHole !== bHole) {
                    return aHole - bHole;
                }
            }
        }
    }

    return 0;
};

// 파합계(기본파) 계산 함수
function getTotalParForPlayer(courses: any, assignedCourses: any[]) {
    let total = 0;
    assignedCourses.forEach(course => {
        const courseData = courses[course.id];
        if (courseData && Array.isArray(courseData.pars)) {
            total += courseData.pars.reduce((a: number, b: number) => a + (b || 0), 0);
        }
    });
    return total;
}

// 외부 전광판과 완전히 동일한 ± 및 총타수 계산 함수
function getPlayerTotalAndPlusMinus(courses: any, player: any) {
    let total = 0;
    let parTotal = 0;
    let playedHoles = 0;
    player.assignedCourses.forEach((course: any) => {
        const courseData = courses[course.id];
        const holeScores = player.coursesData[course.id]?.holeScores || [];
        if (courseData && Array.isArray(courseData.pars)) {
            for (let i = 0; i < 9; i++) {
                const score = holeScores[i];
                const par = courseData.pars[i] ?? null;
                if (typeof score === 'number' && typeof par === 'number') {
                    total += score;
                    parTotal += par;
                    playedHoles++;
                }
            }
        }
    });
    return playedHoles > 0 ? { total, plusMinus: total - parTotal } : { total: null, plusMinus: null };
}

export default function AdminDashboard() {
    // 안전한 number 체크 함수
    const isValidNumber = (v: any) => typeof v === 'number' && !isNaN(v);
    // 점수 수정 모달 상태
    const [scoreEditModal, setScoreEditModal] = useState({
        open: false,
        playerId: '',
        courseId: '',
        holeIndex: -1,
        score: '',
        forfeitType: null as 'absent' | 'disqualified' | 'forfeit' | null
    });

    // 점수 초기화 모달 상태
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // 인쇄 모달 상태
    const [printModal, setPrintModal] = useState({
        open: false,
        orientation: 'portrait' as 'portrait' | 'landscape',
        paperSize: 'A4' as 'A4' | 'A3',
        selectedGroups: [] as string[],
        showAllGroups: true
    });

    // 대회명 상태
    const [tournamentName, setTournamentName] = useState('골프 대회');

    // 기권 처리 모달 상태
    // const [forfeitModal, setForfeitModal] = useState<{ open: boolean, player: any | null }>({ open: false, player: null });

    // 기록 보관하기(아카이브) - 실제 구현은 추후
    const handleArchiveScores = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }
        try {
            // 대회명 및 시작 날짜 추출 (tournaments/current에서 직접 읽기)
            const tournamentRef = ref(db, 'tournaments/current');
            let tournamentName = '';
            let tournamentStartDate = '';
            await new Promise<void>((resolve) => {
                onValue(tournamentRef, (snap) => {
                    const tournamentData = snap.val() || {};
                    tournamentName = tournamentData.name || '대회';
                    // 시작 날짜가 있으면 사용, 없으면 현재 날짜 사용
                    if (tournamentData.startDate) {
                        tournamentStartDate = tournamentData.startDate;
                    } else {
                        const now = new Date();
                        const pad = (n: number) => n.toString().padStart(2, '0');
                        tournamentStartDate = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
                    }
                    resolve();
                }, { onlyOnce: true });
            });
            // 날짜+시간
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            // archiveId: 대회명(공백제거)_YYYYMM 형식
            const archiveId = `${(tournamentName || '대회').replace(/\s/g, '')}_${tournamentStartDate.substring(0, 6)}`; // 대회명_YYYYMM 형식
            // 참가자 수
            const playerCount = Object.keys(players).length;
            // 저장 데이터
            const archiveData = {
                savedAt: now.toISOString(),
                tournamentName: tournamentName || '대회',
                tournamentStartDate: tournamentStartDate, // 대회 시작 날짜 추가
                playerCount,
                players,
                scores,
                courses,
                groups: groupsData,
                processedByGroup: updateForfeitTypes // 그룹별 순위/점수 등 가공 데이터 추가 저장 (실격/불참/기권 구분 포함)
            };
            await set(ref(db, `archives/${archiveId}`), archiveData);
            toast({ title: '기록 보관 완료', description: `대회명: ${tournamentName || '대회'} / 참가자: ${playerCount}명` });
        } catch (e: any) {
            toast({ title: '보관 실패', description: e?.message || '알 수 없는 오류', variant: 'destructive' });
        }
    };

    // 인쇄 기능
    const handlePrint = () => {
        // 현재 선택된 그룹에 따라 인쇄할 그룹 설정
        const groupsToPrint = filterGroup === 'all' ? allGroupsList : [filterGroup];
        setPrintModal({
            open: true,
            orientation: 'portrait',
            paperSize: 'A4',
            selectedGroups: groupsToPrint,
            showAllGroups: filterGroup === 'all'
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
                    background: linear-gradient(135deg, #1e3a8a, #3b82f6, #60a5fa);
                    color: white;
                    padding: 20px;
                    text-align: center;
                    margin-bottom: 30px;
                    border-radius: 8px;
                }
                .print-header h1 {
                    margin: 0;
                    font-size: 28px;
                    font-weight: bold;
                }
                .print-header p {
                    margin: 5px 0 0 0;
                    font-size: 16px;
                    opacity: 0.9;
                }
                .group-section {
                    page-break-inside: avoid;
                    margin-bottom: 40px;
                }
                .group-title {
                    background: #f8fafc;
                    color: #1e293b;
                    padding: 15px;
                    font-size: 20px;
                    font-weight: bold;
                    border-left: 4px solid #3b82f6;
                    margin-bottom: 20px;
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
                    font-size: 16px;
                    font-weight: 500;
                    color: #64748b;
                    margin-left: 12px;
                }
                .score-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                    font-size: 12px;
                    table-layout: fixed;
                }
                .score-table th {
                    background: #e2e8f0;
                    color: #1e293b;
                    padding: 12px 4px;
                    border: 1px solid #cbd5e1;
                    text-align: center;
                    font-weight: bold;
                    font-size: 11px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    line-height: 1.4;
                }
                .score-table th .header-korean {
                    display: block;
                    font-size: 11px;
                    margin-bottom: 2px;
                }
                .score-table th .header-english {
                    display: block;
                    font-size: 9px;
                    font-weight: 500;
                    color: #64748b;
                }
                .score-table td {
                    padding: 6px 4px;
                    border: 1px solid #cbd5e1;
                    text-align: center;
                    vertical-align: middle;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
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
                    font-weight: bold;
                    font-size: 14px;
                    color: #1e40af;
                }
                .player-name {
                    font-weight: bold;
                    color: #1e293b;
                }
                .affiliation {
                    color: #64748b;
                    font-size: 11px;
                }
                .course-name {
                    font-weight: bold;
                    color: #059669;
                }
                .hole-score {
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                }
                .course-total {
                    font-weight: bold;
                    color: #dc2626;
                }
                .total-score {
                    font-weight: bold;
                    font-size: 16px;
                    color: #1e40af;
                }
                .forfeit {
                    color: #dc2626;
                    font-weight: bold;
                }
                .page-break {
                    page-break-before: always;
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
                    .no-print { display: none; }
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
            const groupPlayers = updateForfeitTypes[groupName];
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
                        <tbody>
            `;

            groupPlayers.forEach((player) => {
                if (player.assignedCourses.length > 0) {
                    player.assignedCourses.forEach((course: any, courseIndex: number) => {
                        const courseData = player.coursesData[course.id];
                        const holeScores = courseData?.holeScores || Array(9).fill(null);

                        printContent += `
                            <tr>
                                ${courseIndex === 0 ? `
                                    <td rowspan="${player.assignedCourses.length}" class="rank-cell responsive-column">
                                        ${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}
                                    </td>
                                    <td rowspan="${player.assignedCourses.length}" class="responsive-column">${player.jo}</td>
                                    <td rowspan="${player.assignedCourses.length}" class="player-name responsive-column">${player.name}</td>
                                    <td rowspan="${player.assignedCourses.length}" class="affiliation responsive-column">${player.affiliation}</td>
                                ` : ''}
                                <td class="course-name responsive-column">${courseData?.courseName || course.name}</td>
                        `;

                        // 홀별 점수
                        holeScores.forEach((score: number | null) => {
                            const scoreText = score !== null ? score.toString() : '-';
                            printContent += `<td class="hole-score fixed-column">${scoreText}</td>`;
                        });

                        // 코스 합계
                        const courseTotal = courseData?.courseTotal || 0;
                        printContent += `<td class="course-total fixed-column">${courseTotal}</td>`;

                        // 총타수 (첫 번째 코스에서만 표시)
                        if (courseIndex === 0) {
                            const totalText = player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-');
                            printContent += `<td rowspan="${player.assignedCourses.length}" class="total-score fixed-column">${totalText}</td>`;
                        }

                        printContent += '</tr>';
                    });
                } else {
                    printContent += `
                        <tr>
                            <td class="rank-cell responsive-column">${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}</td>
                            <td class="responsive-column">${player.jo}</td>
                            <td class="player-name responsive-column">${player.name}</td>
                            <td class="affiliation responsive-column">${player.affiliation}</td>
                            <td colspan="11" style="text-align: center; color: #64748b;" class="responsive-column">배정된 코스 없음</td>
                            <td class="total-score fixed-column">${player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-')}</td>
                        </tr>
                    `;
                }
            });

            printContent += `
                        </tbody>
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
                // 전체 점수 초기화
                await set(ref(db, 'scores'), null);
                // scoreLogs도 함께 초기화
                await set(ref(db, 'scoreLogs'), null);
                // sessionStorage도 함께 초기화 (self-scoring 페이지용)
                sessionStorage.removeItem('selfScoringTempData');

                // localStorage의 모든 홀 활성화 상태도 초기화
                try {
                    if (typeof window !== 'undefined' && window.localStorage) {
                        const keys = Object.keys(localStorage);
                        keys.forEach(key => {
                            if (key.startsWith('selfScoringDraft_')) {
                                const savedDraft = safeLocalStorageGetItem(key);
                                if (savedDraft) {
                                    try {
                                        const parsed = JSON.parse(savedDraft);
                                        // start와 current를 null로 초기화
                                        parsed.start = null;
                                        parsed.current = null;
                                        safeLocalStorageSetItem(key, JSON.stringify(parsed));
                                    } catch (error) {
                                        console.error('localStorage 홀 활성화 상태 초기화 실패:', error);
                                    }
                                }
                            }
                        });
                    }
                } catch (error) {
                    console.error('localStorage 홀 활성화 상태 초기화 실패:', error);
                }

                // localStorage의 모든 사인 데이터도 초기화
                try {
                    if (typeof window !== 'undefined' && window.localStorage) {
                        const keys = Object.keys(localStorage);
                        keys.forEach(key => {
                            if (key.startsWith('selfScoringSign_') ||
                                key.startsWith('selfScoringSignTeam_') ||
                                key.startsWith('selfScoringPostSignLock_')) {
                                safeLocalStorageRemoveItem(key);
                            }
                        });
                    }
                } catch (error) {
                    console.error('사인 데이터 초기화 실패:', error);
                }
            } else {
                // 특정 그룹만 초기화
                const groupPlayers = finalDataByGroup[filterGroup] || [];
                const updates: any = {};
                groupPlayers.forEach((player: any) => {
                    if (!player.assignedCourses) return;
                    player.assignedCourses.forEach((course: any) => {
                        for (let h = 1; h <= 9; h++) {
                            updates[`${player.id}/${course.id}/${h}`] = null;
                        }
                    });
                });
                if (Object.keys(updates).length > 0) {
                    const currentScores = scores || {};
                    const updatedScores: any = { ...currentScores };

                    // 기존 점수 복사
                    Object.keys(currentScores).forEach((pid) => {
                        updatedScores[pid] = { ...(currentScores[pid] || {}) };
                    });

                    // 업데이트 적용
                    Object.keys(updates).forEach((path) => {
                        const [pid, cid, h] = path.split('/');
                        if (!updatedScores[pid]) updatedScores[pid] = {};
                        if (!updatedScores[pid][cid]) updatedScores[pid][cid] = {};
                        updatedScores[pid][cid][h] = null;
                    });

                    await set(ref(db, 'scores'), updatedScores);

                    // 해당 그룹의 scoreLogs도 함께 초기화
                    try {
                        const logsRef = ref(db, 'scoreLogs');
                        const snapshot = await get(logsRef);

                        if (snapshot.exists()) {
                            const deleteTasks: Promise<any>[] = [];

                            snapshot.forEach((childSnapshot) => {
                                const logData = childSnapshot.val();
                                // 해당 그룹의 로그만 삭제
                                if (logData &&
                                    logData.comment &&
                                    logData.comment.includes(`그룹: ${filterGroup}`)) {
                                    if (!db) return;
                                    const logRef = ref(db, `scoreLogs/${childSnapshot.key}`);
                                    deleteTasks.push(set(logRef, null));
                                }
                            });

                            if (deleteTasks.length > 0) {
                                await Promise.all(deleteTasks);
                            }
                        }
                    } catch (error) {
                        console.error('scoreLogs 초기화 실패:', error);
                    }

                    // 해당 그룹의 sessionStorage 데이터도 초기화
                    const savedData = sessionStorage.getItem('selfScoringTempData');
                    if (savedData) {
                        try {
                            const data = JSON.parse(savedData);
                            // 해당 그룹의 선수들만 점수 초기화
                            const groupPlayerIds = groupPlayers.map((p: any) => p.id);
                            if (data.scores) {
                                Object.keys(data.scores).forEach(playerId => {
                                    if (groupPlayerIds.includes(playerId)) {
                                        delete data.scores[playerId];
                                    }
                                });
                                // 업데이트된 데이터 저장
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

                    // 해당 그룹의 localStorage 홀 활성화 상태도 초기화
                    try {
                        const courses = Object.keys(groupsData[filterGroup]?.courses || {});
                        courses.forEach(courseId => {
                            const draftKey = `selfScoringDraft_${courseId}_${filterGroup}_1`;
                            const savedDraft = safeLocalStorageGetItem(draftKey);
                            if (savedDraft) {
                                try {
                                    const parsed = JSON.parse(savedDraft);
                                    // start와 current를 null로 초기화
                                    parsed.start = null;
                                    parsed.current = null;
                                    safeLocalStorageSetItem(draftKey, JSON.stringify(parsed));
                                } catch (error) {
                                    console.error('localStorage 홀 활성화 상태 초기화 실패:', error);
                                }
                            }
                        });
                    } catch (error) {
                        console.error('localStorage 홀 활성화 상태 초기화 실패:', error);
                    }

                    // 해당 그룹의 사인 데이터도 초기화
                    try {
                        const courses = Object.keys(groupsData[filterGroup]?.courses || {});
                        courses.forEach(courseId => {
                            // 개인 사인 삭제
                            const signKey = `selfScoringSign_${courseId}_${filterGroup}_1`;
                            safeLocalStorageRemoveItem(signKey);

                            // 팀 사인 삭제
                            const teamSignKey = `selfScoringSignTeam_${courseId}_${filterGroup}_1`;
                            safeLocalStorageRemoveItem(teamSignKey);

                            // 사인 후 잠금 상태 삭제
                            const postSignLockKey = `selfScoringPostSignLock_${courseId}_${filterGroup}_1`;
                            safeLocalStorageRemoveItem(postSignLockKey);
                        });
                    } catch (error) {
                        console.error('사인 데이터 초기화 실패:', error);
                    }
                }
            }

            // 초기화 후 수정 기록 재조회
            try {
                if (filterGroup === 'all') {
                    // 전체 초기화 시 모든 선수의 수정 기록 초기화
                    setPlayerScoreLogs({});
                } else {
                    // 특정 그룹 초기화 시 해당 그룹 선수들의 수정 기록만 초기화
                    const groupPlayers = finalDataByGroup[filterGroup] || [];
                    const updatedLogs = { ...playerScoreLogs };
                    groupPlayers.forEach((player: any) => {
                        delete updatedLogs[player.id];
                    });
                    setPlayerScoreLogs(updatedLogs);
                }
            } catch (error) {
                console.error('수정 기록 재조회 실패:', error);
            }

            toast({
                title: '초기화 완료',
                description: filterGroup === 'all'
                    ? '모든 점수가 초기화되었습니다.'
                    : `${filterGroup} 그룹의 점수가 초기화되었습니다.`
            });
        } catch (e) {
            toast({ title: '초기화 실패', description: '점수 초기화 중 오류가 발생했습니다.', variant: 'destructive' });
        } finally {
            setShowResetConfirm(false);
        }
    };

    // 점수 저장 임시 함수(실제 저장/재계산 로직은 추후 구현)
    const handleScoreEditSave = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }
        const { playerId, courseId, holeIndex, score } = scoreEditModal;
        if (!playerId || !courseId || holeIndex === -1) {
            setScoreEditModal({ ...scoreEditModal, open: false });
            return;
        }
        try {
            const scoreValue = score === '' ? null : Number(score);
            // 0점(기권/불참/실격) 입력 시 또는 점수가 없고 forfeitType이 있는 경우: 소속 그룹의 모든 코스/홀에 0점 입력
            if (scoreValue === 0 || (scoreValue === null && scoreEditModal.forfeitType)) {
                // forfeitType이 없으면 기본값으로 'forfeit' 설정
                const forfeitType = scoreEditModal.forfeitType || 'forfeit';

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
                    const forfeitTypeText = forfeitType === 'absent' ? '불참' :
                        forfeitType === 'disqualified' ? '실격' : '기권';

                    // 그룹에 배정된 코스 id 목록
                    const assignedCourseIds = group.courses ? Object.keys(group.courses).filter((cid: any) => group.courses[cid]) : [];
                    for (const cid of assignedCourseIds) {
                        for (let h = 1; h <= 9; h++) {
                            const prevScore = scores?.[playerId]?.[cid]?.[h];
                            const oldValue = prevScore === undefined || prevScore === null ? 0 : prevScore;

                            // 모든 홀을 0점으로 설정
                            await set(ref(db, `scores/${playerId}/${cid}/${h}`), 0);

                            // 직접 입력한 코스/홀과 다른 홀을 구분하여 로그 기록
                            if (cid === courseId && h === holeIndex + 1) {
                                await logScoreChange({
                                    matchId: 'tournaments/current',
                                    playerId,
                                    scoreType: 'holeScore',
                                    holeNumber: h,
                                    oldValue: oldValue,
                                    newValue: 0,
                                    modifiedBy: 'admin',
                                    modifiedByType: 'admin',
                                    comment: `관리자 직접 ${forfeitTypeText} (코스: ${cid}, 홀: ${h})`,
                                    courseId: cid
                                });
                            } else {
                                await logScoreChange({
                                    matchId: 'tournaments/current',
                                    playerId,
                                    scoreType: 'holeScore',
                                    holeNumber: h,
                                    oldValue: oldValue,
                                    newValue: 0,
                                    modifiedBy: 'admin',
                                    modifiedByType: 'admin',
                                    comment: `관리자페이지에서 ${forfeitTypeText} 처리 (코스: ${cid}, 홀: ${h})`,
                                    courseId: cid
                                });
                            }

                            // 실시간 업데이트를 위한 로그 캐시 무효화
                            invalidatePlayerLogCache(playerId);
                        }
                    }
                }
                setScoreEditModal({ ...scoreEditModal, open: false });
                // 점수 로그 재조회 (최적화됨)
                try {
                    const logs = await getPlayerScoreLogsOptimized(playerId);
                    setPlayerScoreLogs((prev: any) => ({ ...prev, [playerId]: logs }));
                } catch { }
                return;
            }
            // 기존 점수 조회(0점이 아닐 때만 기존 방식)
            const prevScore = scores?.[playerId]?.[courseId]?.[holeIndex + 1] ?? null;
            await set(ref(db, `scores/${playerId}/${courseId}/${holeIndex + 1}`), scoreValue);
            // 점수 변경 로그 기록
            if (prevScore !== scoreValue) {
                try {
                    await logScoreChange({
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
                    });

                    // 실시간 업데이트를 위한 로그 캐시 무효화
                    invalidatePlayerLogCache(playerId);
                    // 점수 로그 저장 후 해당 선수 로그 즉시 갱신 (최적화됨)
                    try {
                        const logs = await getPlayerScoreLogsOptimized(playerId);
                        setPlayerScoreLogs((prev: any) => ({
                            ...prev,
                            [playerId]: logs
                        }));
                    } catch (e) {
                        console.error("점수 로그 재조회 에러", e);
                    }
                } catch (e) {
                    console.error("로그 기록 에러", e);
                }
            }
            setScoreEditModal({ ...scoreEditModal, open: false });
        } catch (e) {
            setScoreEditModal({ ...scoreEditModal, open: false });
            toast({ title: '점수 저장 실패', description: '점수 저장 중 오류가 발생했습니다.', variant: 'destructive' });
        }
    };
    // 항상 현재 도메인 기준으로 절대주소 생성
    const externalScoreboardUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/scoreboard`
        : '/scoreboard';
    const { toast } = useToast();
    const router = useRouter();
    const [players, setPlayers] = useState<any>({});
    const [scores, setScores] = useState<any>({});
    const [courses, setCourses] = useState<any>({});
    const [groupsData, setGroupsData] = useState<any>({});
    const [filterGroup, setFilterGroup] = useState('all');

    // 🛡️ 외부 전광판과 동일한 최적화 상태 관리 (useEffect보다 먼저 선언)
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [resumeSeq, setResumeSeq] = useState(0);
    const activeUnsubsRef = useRef<(() => void)[]>([]);
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<any>(null);
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<any>(null);
    // 백카운트/NTP 상태: 그룹별로 관리 (외부 전광판/플레이오프 관리와 동일한 구조)
    const [individualBackcountApplied, setIndividualBackcountApplied] = useState<{ [groupName: string]: boolean }>({});
    const [teamBackcountApplied, setTeamBackcountApplied] = useState<{ [groupName: string]: boolean }>({});
    const [individualNTPData, setIndividualNTPData] = useState<any>(null);
    const [teamNTPData, setTeamNTPData] = useState<any>(null);
    const [notifiedSuddenDeathGroups, setNotifiedSuddenDeathGroups] = useState<string[]>([]);
    const [scoreCheckModal, setScoreCheckModal] = useState<{ open: boolean, groupName: string, missingScores: any[], resultMsg?: string }>({ open: false, groupName: '', missingScores: [] });
    const [autoFilling, setAutoFilling] = useState(false);

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
            const promises = scoreCheckModal.missingScores.map(item =>
                set(ref(db, `scores/${item.playerId}/${item.courseId}/${item.hole}`), 0)
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
                const tiedFirstPlace = playersInGroup.filter(p => p.rank === 1);

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

    useEffect(() => {
        if (!db) return;

        // 🟢 기본 설정 데이터는 항상 구독 (용량이 작음)
        const tournamentRef = ref(db, 'tournaments/current');
        const tournamentNameRef = ref(db, 'tournaments/current/name');
        const individualSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/individual');
        const teamSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/team');
        const individualBackcountRef = ref(db, 'tournaments/current/backcountApplied/individual');
        const teamBackcountRef = ref(db, 'tournaments/current/backcountApplied/team');
        const individualNTPRef = ref(db, 'tournaments/current/nearestToPin/individual');
        const teamNTPRef = ref(db, 'tournaments/current/nearestToPin/team');

        // 🟢 메인 데이터 구독 - 해시 기반 중복 방지
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');

        // 해시 변수들은 각 구독 내부에서 선언

        // 🚀 혁신적 최적화: 변경된 데이터만 다운로드

        // 🛡️ 외부 전광판과 동일한 초기 데이터 로딩 방식
        if (!initialDataLoaded) {
            let loadedCount = 0;
            const checkAllLoaded = () => {
                loadedCount++;
                if (loadedCount >= 3) { // Players, Scores, Tournament 모두 로드되면
                    setInitialDataLoaded(true);
                }
            };

            // Players 초기 로드
            const unsubInitialPlayers = onValue(playersRef, snap => {
                const data = snap.val() || {};
                setPlayers(data);
                checkAllLoaded();
            });

            // Scores 초기 로드
            const unsubInitialScores = onValue(scoresRef, snap => {
                const data = snap.val() || {};
                setScores(data);
                checkAllLoaded();
            });

            // Tournament 초기 로드
            const unsubInitialTournament = onValue(tournamentRef, snap => {
                const data = snap.val() || {};
                setCourses(data.courses || {});
                setGroupsData(data.groups || {});
                checkAllLoaded();
            });

            // 3초 후에도 로딩이 안 되면 강제로 로딩 완료
            const fallbackTimer = setTimeout(() => {
                if (!initialDataLoaded) {
                    setInitialDataLoaded(true);
                }
            }, 3000);

            // 구독 등록
            activeUnsubsRef.current.push(unsubInitialPlayers);
            activeUnsubsRef.current.push(unsubInitialScores);
            activeUnsubsRef.current.push(unsubInitialTournament);
            activeUnsubsRef.current.push(() => clearTimeout(fallbackTimer));
        }

        // 🛡️ 초기 데이터 로딩 후 실시간 업데이트 (외부 전광판과 동일)
        if (initialDataLoaded) {

            // Players: 변경된 선수만 감지 (외부 전광판과 완전히 동일)
            let lastPlayersHash = '';
            const unsubPlayersChanges = onChildChanged(playersRef, snap => {
                const playerId = snap.key;
                const playerData = snap.val();
                if (playerId && playerData) {
                    setPlayers((prev: any) => {
                        const newPlayers = { ...prev, [playerId]: playerData };
                        const newHash = JSON.stringify(newPlayers);
                        if (newHash !== lastPlayersHash) {
                            lastPlayersHash = newHash;
                            return newPlayers;
                        }
                        return prev;
                    });
                }
            });

            // Scores: 외부 전광판과 동일한 실시간 반영 (해시 비교 개선)
            let lastScoresHash = '';
            const unsubScores = onValue(scoresRef, snap => {
                const data = snap.val() || {};
                setScores((prev: any) => {
                    // 🟢 외부 전광판과 동일한 해시 비교 방식
                    const newHash = JSON.stringify(data);
                    if (newHash !== lastScoresHash) {
                        lastScoresHash = newHash;

                        // 🟢 점수 변경 감지 시 해당 선수들의 로그 캐시 무효화 (외부 전광판 방식)
                        if (prev && Object.keys(prev).length > 0) {
                            const changedPlayerIds = Object.keys(data).filter(playerId => {
                                const prevScores = prev[playerId] || {};
                                const newScores = data[playerId] || {};
                                return JSON.stringify(prevScores) !== JSON.stringify(newScores);
                            });

                            // 변경된 선수들의 로그 캐시 무효화
                            changedPlayerIds.forEach(playerId => {
                                invalidatePlayerLogCache(playerId);
                            });
                        }

                        return data;
                    }
                    return prev;
                });
            });

            // 구독 등록
            activeUnsubsRef.current.push(unsubPlayersChanges);
            activeUnsubsRef.current.push(unsubScores);
        }

        // Tournament 변경사항만 감지 (외부 전광판과 완전히 동일)
        let lastTournamentHash = '';
        const unsubTournament = onChildChanged(tournamentRef, snap => {
            const key = snap.key;
            const value = snap.val();
            if (key && value) {
                const currentHash = JSON.stringify(value);
                if (currentHash !== lastTournamentHash) {
                    lastTournamentHash = currentHash;
                    if (key === 'courses') {
                        setCourses(value);
                    } else if (key === 'groups') {
                        setGroupsData(value);
                    }
                }
            }
        });
        activeUnsubsRef.current.push(unsubTournament);

        // 기본 구독들 (항상 필요)
        const unsubTournamentName = onValue(tournamentNameRef, snap => {
            const name = snap.val();
            setTournamentName(name || '골프 대회');
        });
        const unsubIndividualSuddenDeath = onValue(individualSuddenDeathRef, snap => setIndividualSuddenDeathData(snap.val()));
        const unsubTeamSuddenDeath = onValue(teamSuddenDeathRef, snap => setTeamSuddenDeathData(snap.val()));
        const unsubIndividualBackcount = onValue(individualBackcountRef, snap => {
            const data = snap.val();
            // 레거시(boolean)와 그룹별 객체 구조 모두 지원
            if (typeof data === 'boolean') {
                // 예전 대회 데이터: true이면 모든 그룹에 적용된 것으로 간주
                setIndividualBackcountApplied(data ? { '*': true } : {});
            } else {
                setIndividualBackcountApplied(data || {});
            }
        });
        const unsubTeamBackcount = onValue(teamBackcountRef, snap => {
            const data = snap.val();
            if (typeof data === 'boolean') {
                setTeamBackcountApplied(data ? { '*': true } : {});
            } else {
                setTeamBackcountApplied(data || {});
            }
        });
        const unsubIndividualNTP = onValue(individualNTPRef, snap => setIndividualNTPData(snap.val()));
        const unsubTeamNTP = onValue(teamNTPRef, snap => setTeamNTPData(snap.val()));

        // 기본 구독들 등록
        activeUnsubsRef.current.push(unsubTournamentName);
        activeUnsubsRef.current.push(unsubIndividualSuddenDeath);
        activeUnsubsRef.current.push(unsubTeamSuddenDeath);
        activeUnsubsRef.current.push(unsubIndividualBackcount);
        activeUnsubsRef.current.push(unsubTeamBackcount);
        activeUnsubsRef.current.push(unsubIndividualNTP);
        activeUnsubsRef.current.push(unsubTeamNTP);

        // 클린업은 stopSubscriptions()에서 처리
        return () => stopSubscriptions();
    }, [db, initialDataLoaded, resumeSeq]);

    // 🟢 메모리 최적화 - 의존성 최소화 및 조건부 계산
    const processedDataByGroup = useMemo(() => {
        const allCoursesList = Object.values(courses).filter(Boolean);
        if (Object.keys(players).length === 0 || allCoursesList.length === 0) return {};

        // 🟢 filterGroup이 'all'이 아닌 경우 해당 그룹만 처리
        const playersToProcess = filterGroup === 'all'
            ? Object.entries(players)
            : Object.entries(players).filter(([, player]: [string, any]) => player.group === filterGroup);

        const allProcessedPlayers: any[] = playersToProcess.map(([playerId, player]: [string, any]) => {
            const playerGroupData = groupsData[player.group];
            // 코스 순서 정보 가져오기 (기존 호환성: boolean → number 변환)
            const coursesOrder = playerGroupData?.courses || {};
            const assignedCourseIds = Object.keys(coursesOrder).filter((cid: string) => {
                const order = coursesOrder[cid];
                // boolean이면 true인 것만, number면 0보다 큰 것만
                return typeof order === 'boolean' ? order : (typeof order === 'number' && order > 0);
            });
            // courses 객체에서 해당 id만 찾아 배열로 만듦 (id 타입 일치 보장)
            const coursesForPlayer = assignedCourseIds
                .map(cid => {
                    const key = Object.keys(courses).find(k => String(k) === String(cid));
                    return key ? courses[key] : undefined;
                })
                .filter(Boolean);
            // 코스 순서대로 정렬 (order가 큰 것이 마지막 = 백카운트 기준)
            coursesForPlayer.sort((a: any, b: any) => {
                const orderA = coursesOrder[a.id] || 0;
                const orderB = coursesOrder[b.id] || 0;
                const numA = typeof orderA === 'boolean' ? (orderA ? 1 : 0) : (typeof orderA === 'number' ? orderA : 0);
                const numB = typeof orderB === 'boolean' ? (orderB ? 1 : 0) : (typeof orderB === 'number' ? orderB : 0);
                return numA - numB; // 작은 순서가 먼저 (첫번째 코스가 위)
            });
            const playerScoresData = scores[playerId] || {};
            const coursesData: any = {};
            // 백카운트 계산을 위한 데이터 추가
            const courseScores: { [courseId: string]: number } = {};
            const detailedScores: { [courseId: string]: { [holeNumber: string]: number } } = {};

            coursesForPlayer.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                coursesData[courseId] = {
                    courseName: course.name,
                    courseTotal: Object.values(scoresForCourse).reduce((acc: number, s: any) => typeof s === 'number' ? acc + s : acc, 0),
                    holeScores: Array.from({ length: 9 }, (_, i) => {
                        const holeScore = scoresForCourse[(i + 1).toString()];
                        return typeof holeScore === 'number' ? holeScore : null;
                    })
                };

                // 백카운트용 코스별 총점
                courseScores[courseId] = coursesData[courseId].courseTotal;

                // 백카운트용 홀별 점수
                detailedScores[courseId] = {};
                for (let i = 1; i <= 9; i++) {
                    const holeScore = scoresForCourse[i.toString()];
                    detailedScores[courseId][i.toString()] = typeof holeScore === 'number' ? holeScore : 0;
                }
            });
            // 외부 전광판과 동일하게 ± 및 총타수 계산
            const { total, plusMinus } = getPlayerTotalAndPlusMinus(courses, {
                ...player,
                assignedCourses: coursesForPlayer,
                coursesData
            });
            return {
                id: playerId,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                affiliation: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                group: player.group,
                type: player.type,
                totalScore: total,
                coursesData,
                hasAnyScore: total !== null,
                hasForfeited: Object.values(coursesData).some((cd: any) => cd.holeScores.some((s: any) => s === 0)),
                forfeitType: (() => {
                    // 기권 타입을 로그에서 추출
                    const playerScoresData = scores[playerId] || {};
                    let hasZeroScore = false;

                    // 모든 배정 코스에서 0점이 있는지 확인
                    for (const course of coursesForPlayer) {
                        const scoresForCourse = playerScoresData[course.id] || {};
                        for (let h = 1; h <= 9; h++) {
                            if (scoresForCourse[h.toString()] === 0) {
                                hasZeroScore = true;
                                break;
                            }
                        }
                        if (hasZeroScore) break;
                    }

                    // 0점이 있으면 기권 타입 추출 (나중에 로그에서 가져올 예정)
                    return hasZeroScore ? 'pending' : null;
                })(),
                assignedCourses: coursesForPlayer,
                plusMinus,
                // 백카운트 계산을 위한 데이터 추가
                courseScores,
                detailedScores,
                total: total // tieBreak 함수에서 사용
            };
        });
        const groupedData = allProcessedPlayers.reduce((acc, player) => {
            const groupName = player.group || '미지정';
            if (!acc[groupName]) {
                acc[groupName] = [];
            }
            acc[groupName].push(player);
            return acc;
        }, {} as Record<string, any[]>);

        // 🟢 필터된 그룹만 순위 계산 (성능 최적화)
        const rankedData: { [key: string]: ProcessedPlayer[] } = {};
        const groupsToRank = filterGroup === 'all' ? Object.keys(groupedData) : [filterGroup].filter(g => groupedData[g]);

        for (const groupName of groupsToRank) {
            // 코스 순서 기반으로 정렬 (order가 큰 것이 마지막 = 백카운트 기준)
            const groupPlayers = groupedData[groupName];
            const groupData = groupsData[groupName];
            const coursesOrder = groupData?.courses || {};
            const allCoursesForGroup = [...(groupPlayers[0]?.assignedCourses || [])].filter(c => c && c.id !== undefined);
            // 코스 순서대로 정렬 (order가 큰 것이 마지막)
            const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                const orderA = coursesOrder[a.id] || 0;
                const orderB = coursesOrder[b.id] || 0;
                const numA = typeof orderA === 'boolean' ? (orderA ? 1 : 0) : (typeof orderA === 'number' ? orderA : 0);
                const numB = typeof orderB === 'boolean' ? (orderB ? 1 : 0) : (typeof orderB === 'number' ? orderB : 0);
                return numA - numB; // 작은 순서가 먼저
            });
            // 백카운트는 마지막 코스부터 역순이므로 reverse
            const coursesForBackcount = [...coursesForGroup].reverse();

            const playersToSort = groupedData[groupName].filter((p: any) => p.hasAnyScore && !p.hasForfeited);
            const otherPlayers = groupedData[groupName].filter((p: any) => !p.hasAnyScore || p.hasForfeited);
            if (playersToSort.length > 0) {
                // 1. plusMinus 오름차순 정렬, tieBreak(백카운트) 적용
                playersToSort.sort((a: any, b: any) => {
                    if (a.plusMinus !== b.plusMinus) return a.plusMinus - b.plusMinus;
                    return tieBreak(a, b, coursesForBackcount);
                });
                // 2. 1위 동점자 모두 rank=1, 그 다음 선수부터 등수 건너뛰기
                const minPlusMinus = playersToSort[0].plusMinus;
                let rank = 1;
                let oneRankCount = 0;
                // 1위 동점자 처리
                for (let i = 0; i < playersToSort.length; i++) {
                    if (playersToSort[i].plusMinus === minPlusMinus) {
                        playersToSort[i].rank = 1;
                        oneRankCount++;
                    } else {
                        break;
                    }
                }
                // 2위 이하(실제로는 1위 동점자 수+1 등수부터) 백카운트 등수 부여
                rank = oneRankCount + 1;
                for (let i = oneRankCount; i < playersToSort.length; i++) {
                    // 바로 앞 선수와 plusMinus, tieBreak 모두 같으면 같은 등수, 아니면 증가
                    const prev = playersToSort[i - 1];
                    const curr = playersToSort[i];
                    if (
                        curr.plusMinus === prev.plusMinus &&
                        tieBreak(curr, prev, coursesForGroup) === 0
                    ) {
                        curr.rank = playersToSort[i - 1].rank;
                    } else {
                        curr.rank = rank;
                    }
                    rank++;
                }
            }
            const finalPlayers = [...playersToSort, ...otherPlayers.map((p: any) => ({ ...p, rank: null }))];
            rankedData[groupName] = finalPlayers;
        }
        return rankedData;
    }, [players, scores, courses, groupsData, filterGroup]);

    const processSuddenDeath = (suddenDeathData: any) => {
        if (!suddenDeathData) return [];

        // 단일(레거시) 구조 또는 그룹별 구조 모두 지원
        const processOne = (sd: any) => {
            if (!sd?.isActive || !sd.players || !sd.holes || !Array.isArray(sd.holes)) return [];

            const participatingPlayerIds = Object.keys(sd.players).filter(id => sd.players[id]);
            const allPlayersMap = new Map(Object.entries(players).map(([id, p]) => [id, p]));

            const results: any[] = participatingPlayerIds.map(id => {
                const playerInfo: any = allPlayersMap.get(id);
                if (!playerInfo) return null;

                const name = playerInfo.type === 'team' ? `${playerInfo.p1_name} / ${playerInfo.p2_name}` : playerInfo.name;

                let totalScore = 0;
                let holesPlayed = 0;
                sd.holes.forEach((hole: number) => {
                    const score = sd.scores?.[id]?.[hole];
                    if (score !== undefined && score !== null) {
                        totalScore += score;
                        holesPlayed++;
                    }
                });
                return { id, name, totalScore, holesPlayed };
            }).filter(Boolean);

            results.sort((a, b) => {
                if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed;
                if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
                return a.name.localeCompare(b.name);
            });

            let rank = 1;
            for (let i = 0; i < results.length; i++) {
                if (i > 0 && (results[i].holesPlayed < results[i - 1].holesPlayed || (results[i].holesPlayed === results[i - 1].holesPlayed && results[i].totalScore > results[i - 1].totalScore))) {
                    rank = i + 1;
                }
                results[i].rank = rank;
            }

            return results;
        };

        // 레거시: 전체에 대해 하나의 서든데스 데이터
        if (suddenDeathData.isActive) {
            return processOne(suddenDeathData);
        }

        // 그룹별 구조: { groupName: { isActive, players, holes, scores } }
        if (typeof suddenDeathData === 'object') {
            let allResults: any[] = [];
            Object.values(suddenDeathData).forEach((groupSd: any) => {
                if (groupSd && groupSd.isActive) {
                    allResults = allResults.concat(processOne(groupSd));
                }
            });
            return allResults;
        }

        return [];
    }

    const processedIndividualSuddenDeathData = useMemo(() => processSuddenDeath(individualSuddenDeathData), [individualSuddenDeathData, players]);
    const processedTeamSuddenDeathData = useMemo(() => processSuddenDeath(teamSuddenDeathData), [teamSuddenDeathData, players]);

    // 백카운트/NTP 적용된 1위 동점자들의 순위를 다시 계산하는 함수 (기존 로직 활용)
    const applyPlayoffRanking = (data: any) => {
        const finalData = JSON.parse(JSON.stringify(data));

        for (const groupName in finalData) {
            const groupPlayers = finalData[groupName];
            if (!groupPlayers || groupPlayers.length === 0) continue;

            // 1위 동점자들 찾기
            const firstPlacePlayers = groupPlayers.filter((p: any) => p.rank === 1);

            if (firstPlacePlayers.length > 1) {
                const playerType = firstPlacePlayers[0].type;
                const isIndividual = playerType === 'individual';

                // NTP 순위 적용 확인 (외부 전광판과 동일한 방식 + 그룹별 구조 지원)
                const baseNtpData = isIndividual ? individualNTPData : teamNTPData;
                let ntpDataForGroup: any = null;
                if (baseNtpData) {
                    // 레거시 단일 구조: { isActive, rankings }
                    if (baseNtpData.isActive && baseNtpData.rankings) {
                        ntpDataForGroup = baseNtpData;
                    } else if (typeof baseNtpData === 'object' && !baseNtpData.isActive) {
                        // 그룹별 구조: { [groupName]: { isActive, rankings } }
                        const groupNtp = baseNtpData[groupName];
                        if (groupNtp?.isActive && groupNtp.rankings) {
                            ntpDataForGroup = groupNtp;
                        }
                    }
                }
                const shouldApplyNTP = !!(ntpDataForGroup && ntpDataForGroup.isActive && ntpDataForGroup.rankings);

                // 백카운트 적용 확인 (그룹별 적용)
                const backcountState = isIndividual ? individualBackcountApplied : teamBackcountApplied;
                const groupNameForBackcount = firstPlacePlayers[0]?.group;
                const shouldApplyBackcount = !!(
                    backcountState &&
                    (backcountState[groupNameForBackcount] || backcountState['*'])
                );

                if (shouldApplyNTP) {
                    // NTP 순위 적용 (외부 전광판과 동일하게 1위 동점자에게만 적용)
                    const ntpRankings = ntpDataForGroup.rankings;
                    firstPlacePlayers.forEach((player: any) => {
                        const ntpRank = ntpRankings[player.id];
                        if (ntpRank !== undefined && ntpRank !== null) {
                            player.rank = ntpRank;
                        }
                    });

                    // 전체 그룹을 다시 정렬
                    groupPlayers.sort((a: any, b: any) => {
                        const rankA = a.rank === null ? Infinity : a.rank;
                        const rankB = b.rank === null ? Infinity : b.rank;
                        if (rankA !== rankB) return rankA - rankB;

                        const scoreA = a.hasAnyScore && !a.hasForfeited ? a.totalScore : Infinity;
                        const scoreB = b.hasAnyScore && !b.hasForfeited ? b.totalScore : Infinity;
                        return scoreA - scoreB;
                    });
                } else if (shouldApplyBackcount) {
                    // 플레이오프 백카운트: 코스 순서 기반으로 마지막 코스부터 역순으로 비교
                    const groupName = firstPlacePlayers[0]?.group;
                    const groupData = groupsData[groupName];
                    const coursesOrder = groupData?.courses || {};
                    const allCoursesForGroup = firstPlacePlayers[0]?.assignedCourses || Object.values(courses);
                    // 코스 순서대로 정렬 (order가 큰 것이 마지막)
                    const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                        const orderA = coursesOrder[a.id] || 0;
                        const orderB = coursesOrder[b.id] || 0;
                        const numA = typeof orderA === 'boolean' ? (orderA ? 1 : 0) : (typeof orderA === 'number' ? orderA : 0);
                        const numB = typeof orderB === 'boolean' ? (orderB ? 1 : 0) : (typeof orderB === 'number' ? orderB : 0);
                        return numA - numB; // 작은 순서가 먼저
                    });
                    // 백카운트는 마지막 코스부터 역순이므로 reverse
                    const sortedCoursesForBackcount = [...coursesForGroup].reverse();

                    firstPlacePlayers.sort((a: any, b: any) => {
                        if (a.plusMinus !== b.plusMinus) return a.plusMinus - b.plusMinus;
                        // 백카운트: 마지막 코스부터 역순으로 비교
                        for (const course of sortedCoursesForBackcount) {
                            if (!course || course.id === undefined || course.id === null) continue;
                            const courseId = course.id;
                            const aCourseScore = (a.courseScores || {})[courseId] ?? 0;
                            const bCourseScore = (b.courseScores || {})[courseId] ?? 0;
                            if (aCourseScore !== bCourseScore) {
                                return aCourseScore - bCourseScore; // 작은 타수가 상위
                            }
                        }
                        // 모든 코스 합계가 같으면 마지막 코스의 홀 점수를 역순으로 비교
                        if (sortedCoursesForBackcount.length > 0) {
                            const lastCourse = sortedCoursesForBackcount[0];
                            if (lastCourse && lastCourse.id !== undefined && lastCourse.id !== null) {
                                const lastCourseId = lastCourse.id;
                                const aHoleScores = (a.detailedScores || {})[lastCourseId] || {};
                                const bHoleScores = (b.detailedScores || {})[lastCourseId] || {};
                                for (let i = 9; i >= 1; i--) {
                                    const hole = i.toString();
                                    const aHole = aHoleScores[hole] || 0;
                                    const bHole = bHoleScores[hole] || 0;
                                    if (aHole !== bHole) {
                                        return aHole - bHole; // 작은 타수가 상위
                                    }
                                }
                            }
                        }
                        return 0;
                    });

                    // 새로운 순위 부여
                    let rank = 1;
                    firstPlacePlayers[0].rank = rank;
                    for (let i = 1; i < firstPlacePlayers.length; i++) {
                        const prev = firstPlacePlayers[i - 1];
                        const curr = firstPlacePlayers[i];
                        // plusMinus가 다르거나 백카운트 비교 결과가 다르면 순위 증가
                        if (curr.plusMinus !== prev.plusMinus) {
                            rank = i + 1;
                        } else {
                            // 백카운트 비교
                            let isDifferent = false;
                            for (const course of sortedCoursesForBackcount) {
                                if (!course || course.id === undefined || course.id === null) continue;
                                const courseId = course.id;
                                const currCourseScore = (curr.courseScores || {})[courseId] ?? 0;
                                const prevCourseScore = (prev.courseScores || {})[courseId] ?? 0;
                                if (currCourseScore !== prevCourseScore) {
                                    isDifferent = true;
                                    break;
                                }
                            }
                            if (!isDifferent && sortedCoursesForBackcount.length > 0) {
                                const lastCourse = sortedCoursesForBackcount[0];
                                if (lastCourse && lastCourse.id !== undefined && lastCourse.id !== null) {
                                    const lastCourseId = lastCourse.id;
                                    const currHoleScores = (curr.detailedScores || {})[lastCourseId] || {};
                                    const prevHoleScores = (prev.detailedScores || {})[lastCourseId] || {};
                                    for (let i = 9; i >= 1; i--) {
                                        const hole = i.toString();
                                        if ((currHoleScores[hole] || 0) !== (prevHoleScores[hole] || 0)) {
                                            isDifferent = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            if (isDifferent) {
                                rank = i + 1;
                            }
                        }
                        curr.rank = rank;
                    }

                    // 전체 그룹을 다시 정렬
                    groupPlayers.sort((a: any, b: any) => {
                        const rankA = a.rank === null ? Infinity : a.rank;
                        const rankB = b.rank === null ? Infinity : b.rank;
                        if (rankA !== rankB) return rankA - rankB;

                        const scoreA = a.hasAnyScore && !a.hasForfeited ? a.totalScore : Infinity;
                        const scoreB = b.hasAnyScore && !b.hasForfeited ? b.totalScore : Infinity;
                        return scoreA - scoreB;
                    });
                }
            }
        }

        return finalData;
    };

    const finalDataByGroup = useMemo(() => {
        const individualRankMap = new Map(processedIndividualSuddenDeathData.map(p => [p.id, p.rank]));
        const teamRankMap = new Map(processedTeamSuddenDeathData.map(p => [p.id, p.rank]));
        const combinedRankMap = new Map([...individualRankMap, ...teamRankMap]);

        let finalData = processedDataByGroup;

        // 서든데스 순위가 있는 경우 적용
        if (combinedRankMap.size > 0) {
            finalData = JSON.parse(JSON.stringify(processedDataByGroup));

            for (const groupName in finalData) {
                finalData[groupName].forEach((player: ProcessedPlayer) => {
                    if (combinedRankMap.has(player.id)) {
                        player.rank = combinedRankMap.get(player.id) as number;
                    }
                });

                // Re-sort the groups based on the new ranks from sudden death
                finalData[groupName].sort((a, b) => {
                    const rankA = a.rank === null ? Infinity : a.rank;
                    const rankB = b.rank === null ? Infinity : b.rank;
                    if (rankA !== rankB) return rankA - rankB;

                    const scoreA = a.hasAnyScore && !a.hasForfeited ? a.totalScore : Infinity;
                    const scoreB = b.hasAnyScore && !b.hasForfeited ? b.totalScore : Infinity;
                    return scoreA - scoreB;
                })
            }
        }

        // 백카운트/NTP 적용
        finalData = applyPlayoffRanking(finalData);

        return finalData;
    }, [processedDataByGroup, processedIndividualSuddenDeathData, processedTeamSuddenDeathData, individualBackcountApplied, teamBackcountApplied, individualNTPData, teamNTPData, courses]);

    // Firebase에 순위 저장 (다른 페이지에서 사용하기 위해) - useEffect로 분리하여 부작용 제거
    const prevRanksRef = useRef<string>('');
    useEffect(() => {
        if (!db || !finalDataByGroup) return;

        const ranksData: { [playerId: string]: number | null } = {};
        for (const groupName in finalDataByGroup) {
            finalDataByGroup[groupName].forEach((player: ProcessedPlayer) => {
                ranksData[player.id] = player.rank;
            });
        }

        // 이전 순위와 비교하여 변경된 경우에만 저장 (불필요한 쓰기 방지)
        const ranksDataStr = JSON.stringify(ranksData);
        if (prevRanksRef.current === ranksDataStr) {
            return; // 변경 없음
        }
        prevRanksRef.current = ranksDataStr;

        const ranksRef = ref(db, 'tournaments/current/ranks');
        set(ranksRef, ranksData).catch(err => {
            console.error('순위 저장 오류:', err);
        });
    }, [finalDataByGroup, db]);


    const groupProgress = useMemo(() => {
        const progressByGroup: { [key: string]: number } = {};

        for (const groupName in processedDataByGroup) {
            const groupPlayers = processedDataByGroup[groupName];

            if (!groupPlayers || groupPlayers.length === 0) {
                progressByGroup[groupName] = 0;
                continue;
            }

            const coursesForGroup = groupPlayers[0]?.assignedCourses;
            if (!coursesForGroup || coursesForGroup.length === 0) {
                progressByGroup[groupName] = 0;
                continue;
            }

            const totalPossibleScoresInGroup = groupPlayers.length * coursesForGroup.length * 9;

            if (totalPossibleScoresInGroup === 0) {
                progressByGroup[groupName] = 0;
                continue;
            }

            let totalScoresEnteredInGroup = 0;
            groupPlayers.forEach((player: any) => {
                if (scores[player.id]) {
                    const assignedCourseIds = coursesForGroup.map((c: any) => c.id.toString());
                    for (const courseId in scores[player.id]) {
                        if (assignedCourseIds.includes(courseId)) {
                            totalScoresEnteredInGroup += Object.keys(scores[player.id][courseId]).length;
                        }
                    }
                }
            });

            const progress = Math.round((totalScoresEnteredInGroup / totalPossibleScoresInGroup) * 100);
            progressByGroup[groupName] = isNaN(progress) ? 0 : progress;
        }

        return progressByGroup;
    }, [processedDataByGroup, scores]);

    // 플레이오프 체크를 위한 안정적인 해시 값 생성
    const groupProgressHash = useMemo(() => {
        if (!groupProgress) return '';
        return JSON.stringify(groupProgress);
    }, [groupProgress]);

    const finalDataByGroupHash = useMemo(() => {
        if (!finalDataByGroup) return '';
        return JSON.stringify(finalDataByGroup);
    }, [finalDataByGroup]);

    const processedDataByGroupHash = useMemo(() => {
        if (!processedDataByGroup) return '';
        return JSON.stringify(processedDataByGroup);
    }, [processedDataByGroup]);

    const notifiedSuddenDeathGroupsStr = useMemo(() => {
        return notifiedSuddenDeathGroups.join(',');
    }, [notifiedSuddenDeathGroups]);

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
                    const finalTiedFirstPlace = playersInGroup.filter(p => p.rank === 1);

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
    }, [groupProgressHash, finalDataByGroupHash, processedDataByGroupHash, notifiedSuddenDeathGroupsStr, router]);

    const handleExportToExcel = async () => {
        const XLSX = await import('xlsx-js-style');
        const wb = XLSX.utils.book_new();

        const dataToExport = (filterGroup === 'all')
            ? updateForfeitTypes
            : { [filterGroup]: updateForfeitTypes[filterGroup] };

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
                const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
                ws_data[cellRef] = { v: header, t: 's', s: headerStyle };
            });
            rowIndex++;

            // 2. Re-fetch full data for export to include hole scores
            const fullPlayersDataForExport = groupPlayers.map(p => {
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
            fullPlayersDataForExport.forEach(player => {
                const startRow = rowIndex;
                const numCourses = player.assignedCourses.length > 0 ? player.assignedCourses.length : 1;
                const endRow = startRow + numCourses - 1;

                const addCell = (r: number, c: number, value: any) => {
                    const cellRef = XLSX.utils.encode_cell({ r, c });
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

            // 4. Create Worksheet
            const ws: XLSX.WorkSheet = ws_data;
            ws['!merges'] = merges;

            // 모든 셀에 스타일 재적용 - 더 확실한 방법
            const range = { s: { r: 0, c: 0 }, e: { r: rowIndex - 1, c: headers.length - 1 } };
            ws['!ref'] = XLSX.utils.encode_range(range);

            // 모든 셀에 스타일 적용
            for (let r = 0; r < rowIndex; r++) {
                for (let c = 0; c < headers.length; c++) {
                    const cellRef = XLSX.utils.encode_cell({ r, c });
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
                    const cellRef = XLSX.utils.encode_cell({ r, c: colIndex });
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
                    const cellRef = XLSX.utils.encode_cell({ r, c });
                    if (ws_data[cellRef]) {
                        // 이미 스타일이 있다면 border/align 보장
                        ws_data[cellRef].s = { ...centerAlign, ...(ws_data[cellRef].s || {}) };
                    } else {
                        // 빈셀도 스타일 적용
                        ws_data[cellRef] = { v: '', t: 's', s: centerAlign };
                    }
                }
            }

            XLSX.utils.book_append_sheet(wb, ws, groupName);
        }

        if (wb.SheetNames.length === 0) {
            toast({
                title: "내보내기 실패",
                description: "엑셀로 내보낼 데이터가 없습니다.",
            });
            return;
        }

        XLSX.writeFile(wb, `${tournamentName}_전체결과_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const [searchPlayer, setSearchPlayer] = useState('');
    const [highlightedPlayerId, setHighlightedPlayerId] = useState<number | null>(null);
    const playerRowRefs = useRef<Record<string, (HTMLTableRowElement | null)[]>>({});

    // 선수별 점수 로그 캐시 상태 (playerId별)
    const [playerScoreLogs, setPlayerScoreLogs] = useState<{ [playerId: string]: ScoreLog[] }>({});

    // 🚀 데이터 사용량 모니터링
    const [dataUsage, setDataUsage] = useState({
        totalDownloaded: 0,
        lastUpdate: Date.now(),
        downloadsPerMinute: 0
    });

    // 이미 위에서 선언됨 - 중복 제거

    // 🛡️ 안전한 구독 중단 함수 (외부 전광판과 동일)
    const stopSubscriptions = () => {
        activeUnsubsRef.current.forEach(unsub => {
            try {
                unsub();
            } catch (error) {
                console.warn('구독 해제 중 오류:', error);
            }
        });
        activeUnsubsRef.current = [];
    };

    // 🚀 점수표 이미지 저장 (html2canvas 사용)
    const [isSavingImage, setIsSavingImage] = useState(false);

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

    const handleSaveImage = async () => {
        setIsSavingImage(true);
        try {
            // 1. html2canvas 동적 임포트
            // const html2canvas = (await import('html2canvas')).default; 

            // 2. 인쇄할 데이터 준비
            const groupsToPrint = printModal.showAllGroups ? allGroupsList : printModal.selectedGroups;
            const totalGroups = groupsToPrint.length;
            const printDate = new Date().toLocaleString('ko-KR');

            if (totalGroups === 0) {
                toast({ title: "알림", description: "선택된 그룹이 없습니다." });
                setIsSavingImage(false);
                return;
            }

            // 버전 확인용 메시지로 변경
            toast({ title: "개별 저장 시작", description: "모바일 버전 확인: 그룹별로 분리하여 저장 중..." });

            // 공통 스타일
            const styleContent = `
                <style>
                    .print-wrapper { font-family: 'Pretendard', sans-serif; text-align: center; color: #1e293b; width: 100%; box-sizing: border-box; }
                    .print-header { 
                        background-color: #3b82f6; 
                        color: white; 
                        padding: 30px 20px; 
                        border-radius: 12px; 
                        margin-bottom: 40px;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                        width: 100%;
                        box-sizing: border-box;
                    }
                    .print-title { font-size: 32px; font-weight: 800; margin-bottom: 12px; }
                    .print-date { font-size: 16px; opacity: 0.9; }
                    .group-section { text-align: left; margin-bottom: 15px; margin-top: 40px; display: flex; align-items: center; justify-content: space-between; gap: 8px;}
                    .group-left { display: flex; align-items: center; gap: 8px; }
                    .group-icon { font-size: 24px; }
                    .group-title { font-size: 22px; font-weight: 700; color: #334155; display: flex; align-items: center; gap: 12px; }
                    .group-title-english { font-size: 18px; font-weight: 500; color: #64748b; }
                    
                    /* 테이블 스타일 - 고정 레이아웃 */
                    .print-table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin-bottom: 10px; 
                        background-color: white;
                        font-size: 15px;
                        table-layout: fixed; 
                    }
                    .print-table th { 
                        background-color: #f1f5f9; 
                        color: #475569; 
                        font-weight: 700; 
                        padding: 18px 8px; 
                        border: 1px solid #e2e8f0;
                        vertical-align: middle;
                        line-height: 1.4;
                    }
                    .print-table th .header-korean {
                        display: block;
                        font-size: 15px;
                        margin-bottom: 2px;
                    }
                    .print-table th .header-english {
                        display: block;
                        font-size: 12px;
                        font-weight: 500;
                        color: #64748b;
                    }
                    .print-table td { 
                        padding: 12px 8px; 
                        border: 1px solid #e2e8f0; 
                        vertical-align: middle;
                        color: #334155;
                        font-weight: 500;
                    }
                    .rank-1 { color: #2563eb; font-weight: 800; }
                    .rank-2 { color: #1e293b; font-weight: 700; }
                    .rank-3 { color: #1e293b; font-weight: 700; }
                    
                    /* 컬럼 너비 조정 */
                    .col-sum { font-weight: 700; color: #ef4444; }
                    .col-total { font-weight: 800; color: #2563eb; background-color: #f8fafc; }
                    
                    .text-center { text-align: center; }
                    .font-bold { font-weight: 700; }
                </style>
            `;

            // 3. 그룹별 반복 처리
            for (let i = 0; i < totalGroups; i++) {
                const groupName = groupsToPrint[i];
                const groupPlayers = updateForfeitTypes[groupName] || [];

                if (groupPlayers.length === 0) continue;

                const sortedPlayers = [...groupPlayers].sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999));
                const groupNameEnglish = getGroupNameEnglish(groupName);
                const playersPerPage = 50;
                const totalPages = Math.ceil(sortedPlayers.length / playersPerPage);

                // 페이지별로 처리
                for (let pageNum = 0; pageNum < totalPages; pageNum++) {
                    const startIdx = pageNum * playersPerPage;
                    const endIdx = Math.min(startIdx + playersPerPage, sortedPlayers.length);
                    const pagePlayers = sortedPlayers.slice(startIdx, endIdx);
                    const isFirstPage = pageNum === 0;

                    // 매번 새로운 컨테이너 생성 (데이터 섞임 방지 및 명확한 격리)
                    const container = document.createElement('div');
                    container.style.cssText = `
                        position: absolute; 
                        left: -9999px; 
                        top: 0; 
                        width: 1200px !important; 
                        min-width: 1200px !important; 
                        max-width: none !important;
                        background-color: white; 
                        padding: 40px; 
                        z-index: -1;
                        overflow: visible !important;
                    `;
                    document.body.appendChild(container);

                    // HTML 구성
                    let htmlContent = styleContent;
                    
                    // 첫 페이지에만 대회 제목 표시
                    if (isFirstPage) {
                        htmlContent += `
                            <div class="print-wrapper">
                                <div class="print-header">
                                    <div class="print-title">⛳ ${tournamentName || 'Park Golf Championship'}</div>
                                    <div class="print-date">인쇄일시: ${printDate}</div>
                                </div>
                        `;
                    } else {
                        htmlContent += `<div class="print-wrapper">`;
                    }

                    htmlContent += `
                        <div class="group-section">
                            <div class="group-left">
                                <span class="group-icon">📊</span>
                                <span class="group-title">
                                    ${groupName}
                                    <span class="group-title-english">${groupNameEnglish}</span>
                                </span>
                            </div>
                        </div>
                        <table class="print-table">
                            <colgroup>
                                <col style="width: 60px;"> <!-- 순위 -->
                                <col style="width: 60px;"> <!-- 조 -->
                                <col style="width: auto;"> <!-- 이름 (가변) -->
                                <col style="width: 120px;"> <!-- 소속 -->
                                <col style="width: 100px;"> <!-- 코스 -->
                                ${Array.from({ length: 9 }).map(() => `<col style="width: 45px;">`).join('')} <!-- 점수 -->
                                <col style="width: 60px;"> <!-- 합계 -->
                                <col style="width: 70px;"> <!-- 총타수 -->
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>
                                        <span class="header-korean">순위</span>
                                        <span class="header-english">Rank</span>
                                    </th>
                                    <th>
                                        <span class="header-korean">조</span>
                                        <span class="header-english">Group</span>
                                    </th>
                                    <th>
                                        <span class="header-korean">선수명(팀명)</span>
                                        <span class="header-english">Player Name (Team)</span>
                                    </th>
                                    <th>
                                        <span class="header-korean">소속</span>
                                        <span class="header-english">Club</span>
                                    </th>
                                    <th>
                                        <span class="header-korean">코스</span>
                                        <span class="header-english">Course</span>
                                    </th>
                                    ${Array.from({ length: 9 }).map((_, i) => `<th>${i + 1}</th>`).join('')}
                                    <th>
                                        <span class="header-korean">합계</span>
                                        <span class="header-english">Sum</span>
                                    </th>
                                    <th>
                                        <span class="header-korean">총타수</span>
                                        <span class="header-english">Total</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                    `;

                    pagePlayers.forEach((player: any) => {
                        const courses = player.assignedCourses || [];
                        const rowSpan = courses.length || 1;
                        const rankClass = player.rank === 1 ? 'rank-1' : (player.rank <= 3 ? `rank-${player.rank}` : '');

                        htmlContent += `<tr>`;
                        htmlContent += `<td rowspan="${rowSpan}" class="text-center ${rankClass}">${player.rank ? player.rank + '위' : '-'}</td>`;
                        htmlContent += `<td rowspan="${rowSpan}" class="text-center">${player.jo}</td>`;
                        htmlContent += `<td rowspan="${rowSpan}" class="text-center font-bold">${player.name}</td>`;
                        htmlContent += `<td rowspan="${rowSpan}" class="text-center">${player.affiliation}</td>`;

                        if (courses.length > 0) {
                            const firstCourse = courses[0];
                            const cData = player.coursesData[firstCourse.id];
                            htmlContent += `<td class="text-center font-bold" style="color: #059669;">${cData?.courseName || firstCourse.name}</td>`;

                            for (let i = 0; i < 9; i++) {
                                const s = cData?.holeScores[i];
                                htmlContent += `<td class="text-center">${s !== null && s !== undefined ? s : '-'}</td>`;
                            }

                            htmlContent += `<td class="text-center col-sum">${cData?.courseTotal || '-'}</td>`;
                            htmlContent += `<td rowspan="${rowSpan}" class="text-center col-total">
                                ${player.hasForfeited
                                    ? '<span style="color:red">기권</span>'
                                    : (player.hasAnyScore ? player.totalScore : '-')}
                            </td>`;
                        } else {
                            htmlContent += `<td colspan="11" class="text-center">배정된 코스 없음</td>`;
                            htmlContent += `<td class="text-center">-</td>`;
                        }
                        htmlContent += `</tr>`;

                        for (let k = 1; k < courses.length; k++) {
                            const nextCourse = courses[k];
                            const cData = player.coursesData[nextCourse.id];
                            htmlContent += `<tr>`;
                            htmlContent += `<td class="text-center font-bold" style="color: #059669;">${cData?.courseName || nextCourse.name}</td>`;
                            for (let i = 0; i < 9; i++) {
                                const s = cData?.holeScores[i];
                                htmlContent += `<td class="text-center">${s !== null && s !== undefined ? s : '-'}</td>`;
                            }
                            htmlContent += `<td class="text-center col-sum">${cData?.courseTotal || '-'}</td>`;
                            htmlContent += `</tr>`;
                        }
                    });

                    htmlContent += `</tbody></table></div>`;

                    container.innerHTML = htmlContent;

                    // 이미지 생성
                    // @ts-ignore
                    const canvas = await (window.html2canvas || (await import('html2canvas')).default)(container, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        windowWidth: 1200,
                        width: 1200,
                        x: 0,
                        scrollX: 0
                    });

                    // 다운로드
                    const image = canvas.toDataURL("image/png");
                    const link = document.createElement("a");
                    link.href = image;
                    const pageSuffix = totalPages > 1 ? `_${pageNum + 1}페이지` : '';
                    link.download = `${tournamentName || 'Scores'}_${groupName}_점수표${pageSuffix}_${new Date().toISOString().slice(0, 10)}.png`;
                    document.body.appendChild(link); // Firefox 등 호환성 위해 append
                    link.click();
                    document.body.removeChild(link);

                    // 컨테이너 정리
                    document.body.removeChild(container);

                    // UX: 저장 진행 상황 알림
                    if (pageNum < totalPages - 1) {
                        toast({ description: `${groupName} ${pageNum + 1}/${totalPages} 페이지 저장 완료...` });
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                // UX: 저장 진행 상황 알림 (안전하게 1.5초 대기)
                if (i < totalGroups - 1) {
                    toast({ description: `${groupName} 저장 완료... (${i + 1}/${totalGroups})` });
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }

            toast({ title: "모든 그룹 저장 완료", description: "성공적으로 저장되었습니다." });

        } catch (error) {
            console.error('이미지 저장 실패:', error);
            toast({ title: "저장 실패", description: "이미지 변환 중 오류가 발생했습니다.", variant: "destructive" });
        } finally {
            setIsSavingImage(false);
        }
    };

    // 로딩 상태
    const [logsLoading, setLogsLoading] = useState(false);

    // 선수별 로그 미리 불러오기 (처음 한 번만)
    useEffect(() => {
        const fetchLogs = async () => {
            setLogsLoading(true);
            const playerIds = Object.values(finalDataByGroup).flat().map((p: any) => p.id);
            const logsMap: { [playerId: string]: ScoreLog[] } = {};
            await Promise.all(playerIds.map(async (pid) => {
                try {
                    const logs = await getPlayerScoreLogsOptimized(pid);
                    logsMap[pid] = logs;
                } catch {
                    logsMap[pid] = [];
                }
            }));
            setPlayerScoreLogs(logsMap);
            setLogsLoading(false);
        };
        if (Object.keys(updateForfeitTypes).length > 0) {
            fetchLogs();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finalDataByGroup]);

    // 기권 타입을 로그에서 추출하여 설정하는 함수
    const getForfeitTypeFromLogs = (playerId: string): 'absent' | 'disqualified' | 'forfeit' | null => {
        const logs = playerScoreLogs[playerId] || [];
        const forfeitLogs = logs
            .filter(l => l.newValue === 0 && (l.modifiedByType === 'judge' || l.modifiedByType === 'admin') && l.comment)
            .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬

        if (forfeitLogs.length > 0) {
            const latestLog = forfeitLogs[0];
            if (latestLog.comment?.includes('불참')) return 'absent';
            if (latestLog.comment?.includes('실격')) return 'disqualified';
            if (latestLog.comment?.includes('기권')) return 'forfeit';
        }
        return null;
    };

    // finalDataByGroup에서 기권 타입을 업데이트하는 함수
    const updateForfeitTypes = useMemo(() => {
        if (!playerScoreLogs || Object.keys(playerScoreLogs).length === 0) {
            return finalDataByGroup;
        }

        const updatedData = { ...finalDataByGroup };
        Object.keys(updatedData).forEach(groupName => {
            updatedData[groupName] = updatedData[groupName].map((player: any) => {
                if (player.hasForfeited) {
                    const forfeitType = getForfeitTypeFromLogs(player.id);
                    // forfeitType이 null이면 기본값 'forfeit'로 설정
                    return { ...player, forfeitType: forfeitType || 'forfeit' };
                }
                return player;
            });
        });
        return updatedData;
    }, [finalDataByGroup, playerScoreLogs]);

    const allGroupsList = Object.keys(updateForfeitTypes);

    // 🛡️ ScoreLogs 최적화 - 외부 전광판과 완전히 동일한 방식
    // 선수별 로그 최적화된 로딩 (finalDataByGroup 변경 시 기본 로딩)
    useEffect(() => {
        const fetchLogs = async () => {
            if (Object.keys(finalDataByGroup).length === 0) return;


            // 점수가 있는 선수들만 로그 로딩 대상
            const allPlayersWithScores = Object.values(finalDataByGroup)
                .flat()
                .filter((p: any) => p.hasAnyScore)
                .map((p: any) => p.id);

            const logsMap: { [playerId: string]: ScoreLog[] } = {};

            // 기존 로그 캐시 유지하면서 새로운 선수만 로딩 (외부 전광판과 동일)
            const existingPlayerIds = Object.keys(playerScoreLogs);
            const newPlayerIds = allPlayersWithScores.filter(pid => !existingPlayerIds.includes(pid));


            // 새로운 선수만 로그 로딩 (병렬 처리로 성능 향상)
            if (newPlayerIds.length > 0) {
                await Promise.all(newPlayerIds.map(async (pid) => {
                    try {
                        const logs = await getPlayerScoreLogsOptimized(pid);
                        logsMap[pid] = logs;
                    } catch (error) {
                        console.error(`❌ ScoreLogs 기본 로딩 실패 - 선수 ${pid}:`, error);
                        logsMap[pid] = [];
                    }
                }));

                // 기존 로그와 새로운 로그 병합 (외부 전광판과 동일)
                setPlayerScoreLogs((prev: any) => ({
                    ...prev,
                    ...logsMap
                }));
            }
        };

        // finalDataByGroup 변경 시 즉시 로그 로딩 (실시간성 보장)
        fetchLogs();
    }, [finalDataByGroup]); // finalDataByGroup 변경 시에만 실행

    // 점수 변경 시 해당 선수의 로그만 즉시 업데이트 (외부 전광판과 동일)
    useEffect(() => {
        const updateLogsForChangedScores = async () => {
            if (!scores || Object.keys(scores).length === 0) return;

            // 점수가 변경된 선수들의 로그만 업데이트
            const scorePlayerIds = Object.keys(scores);

            for (const playerId of scorePlayerIds) {
                try {
                    // 최적화된 함수로 로그 가져오기 (캐시 적용)
                    const logs = await getPlayerScoreLogsOptimized(playerId);

                    setPlayerScoreLogs((prev: any) => ({
                        ...prev,
                        [playerId]: logs
                    }));
                } catch (error) {
                    console.error(`❌ ScoreLogs 로딩 실패 - 선수 ${playerId}:`, error);
                    // 에러 발생 시 빈 배열로 설정
                    setPlayerScoreLogs((prev: any) => ({
                        ...prev,
                        [playerId]: []
                    }));
                }
            }
        };

        updateLogsForChangedScores();
    }, [scores]); // scores 변경 시에만 실행

    // 🛡️ 탭 비활성화 시 데이터 다운로드 중단 (외부 전광판과 동일)
    useEffect(() => {
        const onVisibilityChange = () => {
            if (typeof document === 'undefined') return;
            if (document.hidden) {
                stopSubscriptions();
            } else {
                setResumeSeq((s) => s + 1);
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    // 🚀 점수 수정 시 즉시 해당 선수 로그 업데이트 (중요 기능 보장)
    const updatePlayerLogImmediately = async (playerId: string) => {
        try {
            const logs = await getPlayerScoreLogsOptimized(playerId);
            setPlayerScoreLogs(prev => ({ ...prev, [playerId]: logs }));
        } catch (error) {
            console.error('로그 업데이트 실패:', playerId, error);
        }
    };

    const filteredPlayerResults = useMemo(() => {
        if (!searchPlayer) return [];
        const lowerCaseSearch = searchPlayer.toLowerCase();
        return Object.values(updateForfeitTypes).flat().filter(player => {
            return player.name.toLowerCase().includes(lowerCaseSearch) || player.affiliation.toLowerCase().includes(lowerCaseSearch);
        });
    }, [searchPlayer, updateForfeitTypes]);

    const handlePlayerSearchSelect = (playerId: string | number) => {
        const id = String(playerId);
        setHighlightedPlayerId(Number(playerId));
        // rowRef가 배열 또는 undefined일 수 있음. 첫 번째 DOM 요소만 스크롤.
        const rowRefArr = playerRowRefs.current[id];
        if (Array.isArray(rowRefArr) && rowRefArr[0] && typeof rowRefArr[0].scrollIntoView === 'function') {
            rowRefArr[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    // 기권 처리 함수
    // async function handleForfeitPlayer(player: any) {
    //     if (!player || !player.assignedCourses) return;
    //     for (const course of player.assignedCourses) {
    //         for (let hole = 1; hole <= 9; hole++) {
    //             await set(ref(db, `scores/${player.id}/${course.id}/${hole}`), 0);
    //         }
    //     }
    //     setForfeitModal({ open: false, player: null });
    //     toast({ title: '기권 처리 완료', description: `${player.name} 선수의 모든 홀에 0점이 입력되었습니다.` });
    // }

    // 자동 기권 처리 함수 (조별, 3홀 이상 미입력)
    async function autoForfeitPlayersByMissingScores({ players, scores, groupsData, toast }: any) {
        if (!players || !scores || !groupsData || !db) return;
        const alreadyForfeited: Set<string> = new Set();
        for (const groupName in groupsData) {
            const group = groupsData[groupName];
            if (!group || !group.players) continue;
            const playerIds: string[] = Object.keys(group.players).filter(pid => group.players[pid]);
            if (playerIds.length === 0) continue;
            // 코스 정보
            const courseIds: string[] = group.courses ? Object.keys(group.courses).filter(cid => group.courses[cid]) : [];
            for (const courseId of courseIds) {
                // 1~9홀 중, 이 코스에서 "최소 한 명 이상 점수 입력된 홀" 찾기
                const holesWithAnyScore: number[] = [];
                for (let hole = 1; hole <= 9; hole++) {
                    if (playerIds.some(pid => scores?.[pid]?.[courseId]?.[hole] !== undefined && scores?.[pid]?.[courseId]?.[hole] !== null)) {
                        holesWithAnyScore.push(hole);
                    }
                }
                // 각 선수별로, 해당 코스에서 미입력 홀 카운트
                for (const pid of playerIds) {
                    // 이미 기권된 선수는 스킵
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
                        // 대량 0 입력 전 백업 저장(선수 단위, 1회성)
                        try {
                            const playerScoresSnap = await get(ref(db, `scores/${pid}`));
                            if (playerScoresSnap.exists()) {
                                const backupRef = ref(db, `backups/scoresBeforeForfeit/${pid}`);
                                const backupSnap = await get(backupRef);
                                if (!backupSnap.exists()) {
                                    await set(backupRef, { data: playerScoresSnap.val(), createdAt: Date.now() });
                                }
                            }
                        } catch (e) {
                            console.warn('자동 기권 백업 저장 실패(무시):', e);
                        }
                        // 자동 기권 처리: 해당 선수의 모든 배정 코스/홀 0점 입력
                        for (const cid of courseIds) {
                            for (let h = 1; h <= 9; h++) {
                                if (scores?.[pid]?.[cid]?.[h] !== 0) {
                                    await set(ref(db, `scores/${pid}/${cid}/${h}`), 0);
                                    // 로그 기록 추가(복구 추적 가능)
                                    try {
                                        await logScoreChange({
                                            matchId: 'tournaments/current',
                                            playerId: pid,
                                            scoreType: 'holeScore',
                                            holeNumber: h,
                                            oldValue: Number(scores?.[pid]?.[cid]?.[h]) || 0,
                                            newValue: 0,
                                            modifiedBy: 'admin',
                                            modifiedByType: 'admin',
                                            comment: `자동 기권 처리 (조: ${groupName}, 코스: ${courses?.[cid]?.name || cid}, 홀: ${h})`,
                                            courseId: cid
                                        });
                                    } catch (e) {
                                        console.warn('자동 기권 로그 기록 실패(무시):', e);
                                    }
                                }
                            }
                        }
                        alreadyForfeited.add(pid);
                        // 관리자에게 토스트 알림
                        toast({
                            title: '자동 기권 처리',
                            description: `조: ${groupName}, 선수: ${players[pid]?.name || pid} (3홀 이상 미입력)`,
                            variant: 'destructive',
                        });
                    }
                }
            }
        }
    }

    // useEffect로 scores, players, groupsData 변경 시 자동 기권 체크
    useEffect(() => {
        autoForfeitPlayersByMissingScores({ players, scores, groupsData, toast });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scores, players, groupsData]);

    return (
        <>
            <ExternalScoreboardInfo url={externalScoreboardUrl} />
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
                                <Button className="ml-2 bg-blue-600 hover:bg-blue-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={handleArchiveScores}>
                                    기록 보관하기
                                </Button>
                                <Button className="ml-2 bg-gray-600 hover:bg-gray-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={handlePrint}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    인쇄하기
                                </Button>
                                <Button className="ml-2 bg-red-600 hover:bg-red-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={() => setShowResetConfirm(true)}>
                                    점수 초기화
                                </Button>

                                {/* 점수 초기화 확인 모달 */}
                                {showResetConfirm && (
                                    <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>
                                                    {filterGroup === 'all'
                                                        ? '정말로 모든 점수를 초기화하시겠습니까?'
                                                        : `정말로 ${filterGroup} 그룹의 점수를 초기화하시겠습니까?`}
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
                    const groupPlayers = updateForfeitTypes[groupName];
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
                                            {groupPlayers.map((player) => (
                                                <React.Fragment key={player.id}>
                                                    {player.assignedCourses.length > 0 ? player.assignedCourses.map((course: any, courseIndex: number) => (
                                                        <TableRow
                                                            key={`${player.id}-${course.id}`}
                                                            ref={el => {
                                                                const playerId = String(player.id);
                                                                if (!playerRowRefs.current[playerId]) playerRowRefs.current[playerId] = [];
                                                                playerRowRefs.current[playerId][courseIndex] = el;
                                                            }}
                                                            className={`text-base ${highlightedPlayerId === player.id ? 'bg-yellow-100 animate-pulse' : ''}`}
                                                        >
                                                            {courseIndex === 0 && (
                                                                <>
                                                                    <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (() => {
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

                                                            {player.coursesData[course.id]?.holeScores.map((score, i) => {
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
                                                                        className={`text-center font-mono px-2 py-1 border-r cursor-pointer hover:bg-primary/10 ${isModified ? 'text-red-600 font-bold bg-red-50' : ''}`}
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
                                                                                        (l.courseId === course.id || (l.comment && l.comment.includes(`코스: ${course.id}`))))
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
                                                                                forfeitType: initialForfeitType
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
                                                                                                {pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm)}
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

                                                            {/* 점수 수정 모달 */}
                                                            {scoreEditModal?.open && scoreEditModal.playerId === player.id && scoreEditModal.courseId === course.id && (
                                                                <Dialog open={scoreEditModal.open} onOpenChange={open => setScoreEditModal({ ...scoreEditModal, open })}>
                                                                    <DialogContent>
                                                                        <DialogHeader>
                                                                            <DialogTitle>점수 수정</DialogTitle>
                                                                            <DialogDescription>
                                                                                선수: <b>{player.name}</b> / 코스: <b>{player.coursesData[course.id]?.courseName}</b> / 홀: <b>{scoreEditModal.holeIndex + 1}번</b>
                                                                            </DialogDescription>
                                                                        </DialogHeader>
                                                                        <div className="flex items-center justify-center gap-4 py-4">
                                                                            <Button
                                                                                variant="outline"
                                                                                size="icon"
                                                                                className="h-12 w-12"
                                                                                onClick={() => {
                                                                                    const currentScore = scoreEditModal.score === '' ? null : Number(scoreEditModal.score);
                                                                                    let newScore: number;
                                                                                    if (currentScore === null) {
                                                                                        newScore = 1;
                                                                                    } else if (currentScore === 0) {
                                                                                        newScore = 1;
                                                                                    } else if (currentScore >= 10) {
                                                                                        newScore = 10;
                                                                                    } else {
                                                                                        newScore = currentScore + 1;
                                                                                    }
                                                                                    setScoreEditModal({
                                                                                        ...scoreEditModal,
                                                                                        score: String(newScore),
                                                                                        forfeitType: newScore > 0 ? null : scoreEditModal.forfeitType
                                                                                    });
                                                                                }}
                                                                            >
                                                                                <ChevronUp className="h-6 w-6" />
                                                                            </Button>
                                                                            <span className={cn(
                                                                                "font-bold tabular-nums text-center min-w-[80px]",
                                                                                (scoreEditModal.score === "0" || Number(scoreEditModal.score) === 0) ? "text-xs text-red-600" : "text-4xl"
                                                                            )}>
                                                                                {(scoreEditModal.score === "0" || Number(scoreEditModal.score) === 0) ?
                                                                                    (scoreEditModal.forfeitType === 'absent' ? '불참' :
                                                                                        scoreEditModal.forfeitType === 'disqualified' ? '실격' :
                                                                                            scoreEditModal.forfeitType === 'forfeit' ? '기권' : '기권') :
                                                                                    (scoreEditModal.score === '' ? '-' : scoreEditModal.score)}
                                                                            </span>
                                                                            <Button
                                                                                variant="outline"
                                                                                size="icon"
                                                                                className="h-12 w-12"
                                                                                onClick={() => {
                                                                                    const currentScore = scoreEditModal.score === '' ? null : Number(scoreEditModal.score);
                                                                                    let newScore: number | null;
                                                                                    let newForfeitType: 'absent' | 'disqualified' | 'forfeit' | null = scoreEditModal.forfeitType;

                                                                                    if (currentScore === null || currentScore === 0) {
                                                                                        // 점수가 없거나 0점인 경우 불참->실격->기권->불참 순환
                                                                                        if (currentScore === null) {
                                                                                            // 점수가 없는 경우 1로 시작
                                                                                            newScore = 1;
                                                                                            newForfeitType = null;
                                                                                        } else {
                                                                                            // 0점인 경우 불참->실격->기권->불참 순환
                                                                                            newScore = 0;
                                                                                            if (newForfeitType === null || newForfeitType === 'absent') {
                                                                                                newForfeitType = 'disqualified';
                                                                                            } else if (newForfeitType === 'disqualified') {
                                                                                                newForfeitType = 'forfeit';
                                                                                            } else if (newForfeitType === 'forfeit') {
                                                                                                newForfeitType = 'absent';
                                                                                            }
                                                                                        }
                                                                                    } else if (currentScore === 1) {
                                                                                        // 1점에서 하향 클릭 시 0점(불참)으로
                                                                                        newScore = 0;
                                                                                        newForfeitType = 'absent';
                                                                                    } else {
                                                                                        // 2점 이상에서 하향 클릭 시 1 감소
                                                                                        newScore = currentScore - 1;
                                                                                        newForfeitType = null;
                                                                                    }

                                                                                    setScoreEditModal({
                                                                                        ...scoreEditModal,
                                                                                        score: newScore === null ? '' : String(newScore),
                                                                                        forfeitType: newForfeitType
                                                                                    });
                                                                                }}
                                                                            >
                                                                                <ChevronDown className="h-6 w-6" />
                                                                            </Button>
                                                                        </div>
                                                                        <DialogFooter>
                                                                            <Button onClick={() => handleScoreEditSave()}>저장</Button>
                                                                            <Button variant="outline" onClick={() => setScoreEditModal({ ...scoreEditModal, open: false })}>취소</Button>
                                                                            {/* 기권 해제 버튼: 0점(기권) 상태에서만 노출 */}
                                                                            {(scoreEditModal.score === "0" || Number(scoreEditModal.score) === 0) && (
                                                                                <Button
                                                                                    className="bg-yellow-500 hover:bg-yellow-600 text-white ml-2"
                                                                                    onClick={async () => {
                                                                                        if (!db) {
                                                                                            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
                                                                                            return;
                                                                                        }
                                                                                        // 선수, 코스, 그룹 정보 찾기
                                                                                        const player = Object.values(finalDataByGroup).flat().find((p: any) => p.id === scoreEditModal.playerId);
                                                                                        if (!player) return;
                                                                                        // 1) 백업 우선 복원: /backups/scoresBeforeForfeit/{playerId}가 있으면 해당 데이터로 통째로 복원
                                                                                        const logs = playerScoreLogs[player.id] || [];
                                                                                        let restored = false;
                                                                                        try {
                                                                                            const backupRef = ref(db, `backups/scoresBeforeForfeit/${player.id}`);
                                                                                            const backupSnap = await get(backupRef);
                                                                                            if (backupSnap.exists()) {
                                                                                                const backup = backupSnap.val();
                                                                                                // scores/{playerId} 전체를 백업본으로 덮어쓰기(복원)
                                                                                                await set(ref(db, `scores/${player.id}`), backup?.data || {});
                                                                                                // 복원 후 백업은 제거(원터치)
                                                                                                await set(backupRef, null);
                                                                                                restored = true;
                                                                                            }
                                                                                        } catch (e) {
                                                                                            console.warn('백업 복원 실패, 로그 기반 복원으로 폴백합니다:', e);
                                                                                        }

                                                                                        // 2) 폴백: 백업이 없으면 기존 로그 기반 복원(현재 로직) 수행
                                                                                        if (!restored) {
                                                                                            let anyRestored = false;
                                                                                            for (const course of player.assignedCourses) {
                                                                                                for (let h = 1; h <= 9; h++) {
                                                                                                    if (scores?.[player.id]?.[course.id]?.[h] === 0) {
                                                                                                        const zeroLogIdx = logs.findIndex(l =>
                                                                                                            l.holeNumber === h &&
                                                                                                            l.newValue === 0 &&
                                                                                                            (l.modifiedByType === 'judge' || l.modifiedByType === 'admin' || l.modifiedByType === 'captain')
                                                                                                        );
                                                                                                        let restoreValue = null;
                                                                                                        if (zeroLogIdx !== -1) {
                                                                                                            for (let j = zeroLogIdx - 1; j >= 0; j--) {
                                                                                                                const l = logs[j];
                                                                                                                if (
                                                                                                                    l.holeNumber === h &&
                                                                                                                    l.newValue !== 0 &&
                                                                                                                    l.newValue !== null &&
                                                                                                                    l.newValue !== undefined
                                                                                                                ) {
                                                                                                                    restoreValue = l.newValue;
                                                                                                                    break;
                                                                                                                }
                                                                                                            }
                                                                                                        }
                                                                                                        await set(ref(db, `scores/${player.id}/${course.id}/${h}`), restoreValue);
                                                                                                        await logScoreChange({
                                                                                                            matchId: 'tournaments/current',
                                                                                                            playerId: player.id,
                                                                                                            scoreType: 'holeScore',
                                                                                                            courseId: course.id,
                                                                                                            holeNumber: h,
                                                                                                            oldValue: 0,
                                                                                                            newValue: restoreValue === null ? 0 : restoreValue,
                                                                                                            modifiedBy: 'admin',
                                                                                                            modifiedByType: 'admin',
                                                                                                            comment: '기권 해제 복구'
                                                                                                        });
                                                                                                        invalidatePlayerLogCache(player.id);
                                                                                                        anyRestored = true;
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                            restored = anyRestored;
                                                                                        }

                                                                                        if (restored) {
                                                                                            // 안전 처리: 남아있는 0점(기권 표식)을 모두 null로 치환하여 합계/순위 계산에 반영되게 함
                                                                                            try {
                                                                                                const playerScoresSnap = await get(ref(db, `scores/${player.id}`));
                                                                                                if (playerScoresSnap.exists()) {
                                                                                                    const fixed: any = {};
                                                                                                    const data = playerScoresSnap.val() || {};
                                                                                                    Object.keys(data).forEach((courseId: string) => {
                                                                                                        const holes = data[courseId] || {};
                                                                                                        Object.keys(holes).forEach((h: string) => {
                                                                                                            if (holes[h] === 0) {
                                                                                                                if (!fixed[courseId]) fixed[courseId] = {};
                                                                                                                fixed[courseId][h] = null;
                                                                                                            }
                                                                                                        });
                                                                                                    });
                                                                                                    if (Object.keys(fixed).length > 0) {
                                                                                                        // null로 치환 적용
                                                                                                        const merged: any = { ...data };
                                                                                                        Object.keys(fixed).forEach((cid: string) => {
                                                                                                            merged[cid] = { ...(merged[cid] || {}), ...fixed[cid] };
                                                                                                        });
                                                                                                        await set(ref(db, `scores/${player.id}`), merged);
                                                                                                    }
                                                                                                }
                                                                                            } catch (e) {
                                                                                                console.warn('0점 정리 실패(무시):', e);
                                                                                            }
                                                                                            toast({ title: '기권 해제 완료', description: '이전 점수로 복구되었습니다.' });
                                                                                            try {
                                                                                                const logs = await getPlayerScoreLogsOptimized(player.id);
                                                                                                setPlayerScoreLogs(prev => ({ ...prev, [player.id]: logs }));
                                                                                            } catch { }
                                                                                        } else {
                                                                                            toast({ title: '복구할 점수가 없습니다.', description: '이미 기권이 해제된 상태입니다.' });
                                                                                        }
                                                                                        setScoreEditModal({ ...scoreEditModal, open: false });
                                                                                    }}
                                                                                >
                                                                                    기권/불참/실격 해제
                                                                                </Button>
                                                                            )}
                                                                            {/* 안내문구 */}
                                                                            {(scoreEditModal.score === "0" || Number(scoreEditModal.score) === 0) && (
                                                                                <div className="w-full text-center text-sm text-yellow-700 mt-2">기권/불참/실격 처리 이전의 모든 점수를 복구합니다.</div>
                                                                            )}
                                                                        </DialogFooter>
                                                                    </DialogContent>
                                                                </Dialog>
                                                            )}

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
                                                                                        {pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm)}
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
                                                                                                    displayComment = `${courseName}, ${holeNum}번홀 심판이 ${forfeitType}처리`;
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
                                                                                            ? `+${player.plusMinus}`
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
                                                        <TableRow key={`${player.id}-no-course`} className="text-base text-muted-foreground">
                                                            <TableCell className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (() => {
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
                                    ? `모든 그룹(${allGroupsList.length}개)이 선택되었습니다. 각 그룹은 별도 페이지로 인쇄됩니다.`
                                    : printModal.selectedGroups.length > 0
                                        ? `${printModal.selectedGroups.length}개 그룹이 선택되었습니다. 각 그룹은 별도 페이지로 인쇄됩니다.`
                                        : '인쇄할 그룹을 선택해주세요.'
                                }
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
                            <Printer className="mr-2 h-4 w-4" />
                            인쇄하기
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
            {/* 기권 확인 모달 */}
            {/* {forfeitModal.open && forfeitModal.player && (
            <Dialog open={forfeitModal.open} onOpenChange={open => setForfeitModal({ open, player: open ? forfeitModal.player : null })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>기권 처리 확인</DialogTitle>
                        <DialogDescription>
                            {forfeitModal.player.name} 선수의 모든 배정 코스 9홀에 0점이 입력됩니다. 진행하시겠습니까?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setForfeitModal({ open: false, player: null })}>취소</Button>
                        <Button variant="destructive" onClick={() => handleForfeitPlayer(forfeitModal.player)}>기권 처리</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )} */}
        </>
    );
}