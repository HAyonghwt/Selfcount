"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getPlayerScoreLogs, ScoreLog, logScoreChange } from '@/lib/scoreLogs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Download, Filter, Printer } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx-js-style';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import ExternalScoreboardInfo from '@/components/ExternalScoreboardInfo';

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
        score: ''
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
            // 대회명 추출 (tournaments/current.name에서 직접 읽기)
            const tournamentRef = ref(db, 'tournaments/current/name');
            let tournamentName = '';
            await new Promise<void>((resolve) => {
                onValue(tournamentRef, (snap) => {
                    tournamentName = snap.val() || '대회';
                    resolve();
                }, { onlyOnce: true });
            });
            // 날짜+시간
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            // archiveId: 날짜+시간+대회명(공백제거)
            const archiveId = `${(tournamentName || '대회').replace(/\s/g, '')}_${now.getFullYear()}${pad(now.getMonth()+1)}`; // 대회명_YYYYMM 형식
            // 참가자 수
            const playerCount = Object.keys(players).length;
            // 저장 데이터
            const archiveData = {
                savedAt: now.toISOString(),
                tournamentName: tournamentName || '대회',
                playerCount,
                players,
                scores,
                courses,
                groups: groupsData,
                processedByGroup: finalDataByGroup // 그룹별 순위/점수 등 가공 데이터 추가 저장
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
                    padding: 8px 4px;
                    border: 1px solid #cbd5e1;
                    text-align: center;
                    font-weight: bold;
                    font-size: 11px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
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
            const groupPlayers = finalDataByGroup[groupName];
            if (!groupPlayers || groupPlayers.length === 0) return;

            // 그룹 섹션 시작 (첫 번째 그룹이 아니면 페이지 나누기)
            if (groupIndex > 0) {
                printContent += '<div class="page-break"></div>';
            }

            printContent += `
                <div class="group-section">
                    <div class="group-title">📊 ${groupName} 그룹</div>
                    <table class="score-table">
                        <thead>
                            <tr>
                                <th class="responsive-column">순위</th>
                                <th class="responsive-column">조</th>
                                <th class="responsive-column">선수명(팀명)</th>
                                <th class="responsive-column">소속</th>
                                <th class="responsive-column">코스</th>
                                <th class="fixed-column">1</th>
                                <th class="fixed-column">2</th>
                                <th class="fixed-column">3</th>
                                <th class="fixed-column">4</th>
                                <th class="fixed-column">5</th>
                                <th class="fixed-column">6</th>
                                <th class="fixed-column">7</th>
                                <th class="fixed-column">8</th>
                                <th class="fixed-column">9</th>
                                <th class="fixed-column">합계</th>
                                <th class="fixed-column">총타수</th>
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
                                        ${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : '')}
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
                            const totalText = player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-');
                            printContent += `<td rowspan="${player.assignedCourses.length}" class="total-score fixed-column">${totalText}</td>`;
                        }

                        printContent += '</tr>';
                    });
                } else {
                    printContent += `
                        <tr>
                            <td class="rank-cell responsive-column">${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : '')}</td>
                            <td class="responsive-column">${player.jo}</td>
                            <td class="player-name responsive-column">${player.name}</td>
                            <td class="affiliation responsive-column">${player.affiliation}</td>
                            <td colspan="11" style="text-align: center; color: #64748b;" class="responsive-column">배정된 코스 없음</td>
                            <td class="total-score fixed-column">${player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-')}</td>
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
                
                // localStorage 완전 정리 (모든 그룹/조/코스의 초안 데이터 제거)
                try {
                    const allGroups = Object.keys(groupsData);
                    allGroups.forEach(group => {
                        const groupData = groupsData[group];
                        if (groupData && groupData.players) {
                            Object.keys(groupData.players).forEach(jo => {
                                // 모든 코스에 대한 초안 데이터 제거
                                if (courses) {
                                    Object.keys(courses).forEach(courseId => {
                                        const draftKey = `selfScoringDraft_${courseId}_${group}_${jo}`;
                                        localStorage.removeItem(draftKey);
                                    });
                                }
                                
                                // 서명 데이터 제거
                                if (courses) {
                                    Object.keys(courses).forEach(courseId => {
                                        const signatureKey = `selfScoringSign_${courseId}_${group}_${jo}`;
                                        const teamSignatureKey = `selfScoringSignTeam_${courseId}_${group}_${jo}`;
                                        localStorage.removeItem(signatureKey);
                                        localStorage.removeItem(teamSignatureKey);
                                    });
                                }
                            });
                        }
                    });
                } catch {}
                
                // sessionStorage 초기화
                sessionStorage.removeItem('selfScoringTempData');
                sessionStorage.removeItem('selfScoringSignatures');
                sessionStorage.removeItem('selfScoringModifiedMap');
                
                // 수정 로그도 완전히 제거 (Firebase에서)
                try {
                    const logsRef = ref(db, 'scoreLogs');
                    const snapshot = await get(logsRef);
                    
                    if (snapshot.exists()) {
                        const deleteTasks: Promise<any>[] = [];
                        
                        snapshot.forEach((childSnapshot) => {
                            const logData = childSnapshot.val();
                            // 모든 로그 삭제
                            const logRef = ref(db, `scoreLogs/${childSnapshot.key}`);
                            deleteTasks.push(set(logRef, null));
                        });
                        
                        if (deleteTasks.length > 0) {
                            await Promise.all(deleteTasks);
                        }
                    }
                } catch {}
                
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
                    
                    // 해당 그룹의 localStorage 데이터도 초기화
                    try {
                        const groupData = groupsData[filterGroup];
                        if (groupData && groupData.players) {
                            Object.keys(groupData.players).forEach(jo => {
                                // 모든 코스에 대한 초안 데이터 제거
                                if (courses) {
                                    Object.keys(courses).forEach(courseId => {
                                        const draftKey = `selfScoringDraft_${courseId}_${filterGroup}_${jo}`;
                                        localStorage.removeItem(draftKey);
                                    });
                                }
                                
                                // 서명 데이터 제거
                                if (courses) {
                                    Object.keys(courses).forEach(courseId => {
                                        const signatureKey = `selfScoringSign_${courseId}_${filterGroup}_${jo}`;
                                        const teamSignatureKey = `selfScoringSignTeam_${courseId}_${filterGroup}_${jo}`;
                                        localStorage.removeItem(signatureKey);
                                        localStorage.removeItem(teamSignatureKey);
                                    });
                                }
                            });
                        }
                    } catch {}
                    
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
                    
                    // 해당 그룹의 수정 로그도 제거
                    try {
                        const logsRef = ref(db, 'scoreLogs');
                        const snapshot = await get(logsRef);
                        
                        if (snapshot.exists()) {
                            const deleteTasks: Promise<any>[] = [];
                            
                            snapshot.forEach((childSnapshot) => {
                                const logData = childSnapshot.val();
                                // 해당 그룹의 로그만 삭제 (captainEmail 조건 제거)
                                if (logData && 
                                    logData.comment && 
                                    logData.comment.includes(`그룹: ${filterGroup}`)) {
                                    const logRef = ref(db, `scoreLogs/${childSnapshot.key}`);
                                    deleteTasks.push(set(logRef, null));
                                }
                            });
                            
                            if (deleteTasks.length > 0) {
                                await Promise.all(deleteTasks);
                            }
                        }
                    } catch {}
                }
            }
            
            toast({ 
                title: '초기화 완료', 
                description: filterGroup === 'all' 
                    ? '모든 점수, 서명, 수정 기록이 초기화되었습니다.' 
                    : `${filterGroup} 그룹의 점수, 서명, 수정 기록이 초기화되었습니다.` 
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
            // 0점(기권) 입력 시: 소속 그룹의 모든 코스/홀에 0점 입력
            if (scoreValue === 0) {
                // 선수 정보 찾기
                const player = players[playerId];
                if (player && player.group && groupsData[player.group]) {
                    const group = groupsData[player.group];
                    // 그룹에 배정된 코스 id 목록
                    const assignedCourseIds = group.courses ? Object.keys(group.courses).filter((cid: any) => group.courses[cid]) : [];
                    for (const cid of assignedCourseIds) {
                        for (let h = 1; h <= 9; h++) {
                            const prevScore = scores?.[playerId]?.[cid]?.[h];
                            if (prevScore === undefined || prevScore === null) {
                                await set(ref(db, `scores/${playerId}/${cid}/${h}`), 0);
                                await logScoreChange({
                                    matchId: 'tournaments/current',
                                    playerId,
                                    scoreType: 'holeScore',
                                    holeNumber: h,
                                    oldValue: 0,
                                    newValue: 0,
                                    modifiedBy: 'admin',
                                    modifiedByType: 'admin',
                                    comment: `기권 처리(미입력 홀만, courseId=${cid})`
                                });
                            }
                        }
                    }
                }
                setScoreEditModal({ ...scoreEditModal, open: false });
                // 점수 로그 재조회
                try {
                    const logs = await getPlayerScoreLogs(playerId);
                    setPlayerScoreLogs((prev: any) => ({ ...prev, [playerId]: logs }));
                } catch {}
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
                    // 점수 로그 저장 후 해당 선수 로그 즉시 갱신
                    try {
                        const logs = await getPlayerScoreLogs(playerId);
                        setPlayerScoreLogs((prev: any) => ({
                            ...prev,
                            [playerId]: logs
                        }));
                    } catch (e) {
                        console.log("점수 로그 재조회 에러", e);
                    }
                } catch (e) {
                    console.log("로그 기록 에러", e);
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
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<any>(null);
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<any>(null);
    const [notifiedSuddenDeathGroups, setNotifiedSuddenDeathGroups] = useState<Set<string>>(new Set());
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
        // 점수 누락이 없으면 바로 순위/백카운트/서든데스 상태 안내
        if (missingScores.length === 0) {
            setScoreCheckModal({ open: true, groupName, missingScores, resultMsg: getGroupRankStatusMsg(groupName) });
        } else {
            setScoreCheckModal({ open: true, groupName, missingScores });
        }
    };

    useEffect(() => {
        if (!db) return;
        
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');
        const tournamentNameRef = ref(db, 'tournaments/current/name');
        const individualSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/individual');
        const teamSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/team');


        const unsubPlayers = onValue(playersRef, snap => setPlayers(snap.val() || {}));
        const unsubScores = onValue(scoresRef, snap => setScores(snap.val() || {}));
        const unsubTournament = onValue(tournamentRef, snap => {
            const data = snap.val() || {};
            setCourses(data.courses || {});
            setGroupsData(data.groups || {});
        });
        const unsubTournamentName = onValue(tournamentNameRef, snap => {
            const name = snap.val();
            setTournamentName(name || '골프 대회');
        });
        const unsubIndividualSuddenDeath = onValue(individualSuddenDeathRef, snap => setIndividualSuddenDeathData(snap.val()));
        const unsubTeamSuddenDeath = onValue(teamSuddenDeathRef, snap => setTeamSuddenDeathData(snap.val()));
        
        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
            unsubTournamentName();
            unsubIndividualSuddenDeath();
            unsubTeamSuddenDeath();
        }
    }, [db]);
    
    const processedDataByGroup = useMemo(() => {
        const allCoursesList = Object.values(courses).filter(Boolean);
        if (Object.keys(players).length === 0 || allCoursesList.length === 0) return {};

        const allProcessedPlayers: any[] = Object.entries(players).map(([playerId, player]: [string, any]) => {
            const playerGroupData = groupsData[player.group];
            // 그룹별 코스설정만을 기준으로 assignedCourses 생성 (샘플 방식 적용)
            const assignedCourseIds = playerGroupData?.courses 
                ? Object.keys(playerGroupData.courses).filter(cid => playerGroupData.courses[cid] === true || playerGroupData.courses[cid] === "true")
                : [];
            // courses 객체에서 해당 id만 찾아 배열로 만듦 (id 타입 일치 보장)
            const coursesForPlayer = assignedCourseIds
                .map(cid => {
                    const key = Object.keys(courses).find(k => String(k) === String(cid));
                    return key ? courses[key] : undefined;
                })
                .filter(Boolean);
            // 디버깅용 콘솔 출력
            console.log('playerId:', playerId, 'group:', player.group, 'assignedCourseIds:', assignedCourseIds, 'coursesForPlayer:', coursesForPlayer.map(c => c && c.id));
            const playerScoresData = scores[playerId] || {};
            const coursesData: any = {};
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
                assignedCourses: coursesForPlayer,
                plusMinus
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
        const rankedData: { [key: string]: ProcessedPlayer[] } = {};
        for (const groupName in groupedData) {
            // 코스 추가 역순에서 undefined/null/잘못된 객체 제거
            const coursesForGroup = [...(groupedData[groupName][0]?.assignedCourses || [])].filter(c => c && c.id !== undefined).reverse();
            const playersToSort = groupedData[groupName].filter((p: any) => p.hasAnyScore && !p.hasForfeited);
            const otherPlayers = groupedData[groupName].filter((p: any) => !p.hasAnyScore || p.hasForfeited);
            if (playersToSort.length > 0) {
                // 1. plusMinus 오름차순 정렬, tieBreak(백카운트) 적용
                playersToSort.sort((a: any, b: any) => {
                    if (a.plusMinus !== b.plusMinus) return a.plusMinus - b.plusMinus;
                    return tieBreak(a, b, coursesForGroup);
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
    }, [players, scores, courses, groupsData]);
    
    const processSuddenDeath = (suddenDeathData: any) => {
        if (!suddenDeathData?.isActive || !suddenDeathData.players || !suddenDeathData.holes || !Array.isArray(suddenDeathData.holes)) return [];
        
        const participatingPlayerIds = Object.keys(suddenDeathData.players).filter(id => suddenDeathData.players[id]);
        const allPlayersMap = new Map(Object.entries(players).map(([id, p]) => [id, p]));

        const results: any[] = participatingPlayerIds.map(id => {
            const playerInfo: any = allPlayersMap.get(id);
            if (!playerInfo) return null;

            const name = playerInfo.type === 'team' ? `${playerInfo.p1_name} / ${playerInfo.p2_name}` : playerInfo.name;

            let totalScore = 0;
            let holesPlayed = 0;
            suddenDeathData.holes.forEach((hole:number) => {
                const score = suddenDeathData.scores?.[id]?.[hole];
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
            if (i > 0 && (results[i].holesPlayed < results[i - 1].holesPlayed || (results[i].holesPlayed === results[i-1].holesPlayed && results[i].totalScore > results[i - 1].totalScore))) {
                rank = i + 1;
            }
            results[i].rank = rank;
        }

        return results;
    }

    const processedIndividualSuddenDeathData = useMemo(() => processSuddenDeath(individualSuddenDeathData), [individualSuddenDeathData, players]);
    const processedTeamSuddenDeathData = useMemo(() => processSuddenDeath(teamSuddenDeathData), [teamSuddenDeathData, players]);

    const finalDataByGroup = useMemo(() => {
        const individualRankMap = new Map(processedIndividualSuddenDeathData.map(p => [p.id, p.rank]));
        const teamRankMap = new Map(processedTeamSuddenDeathData.map(p => [p.id, p.rank]));
        const combinedRankMap = new Map([...individualRankMap, ...teamRankMap]);

        if (combinedRankMap.size === 0) {
            return processedDataByGroup;
        }
        
        const finalData = JSON.parse(JSON.stringify(processedDataByGroup));

        for (const groupName in finalData) {
            finalData[groupName].forEach((player: ProcessedPlayer) => {
                if (combinedRankMap.has(player.id)) {
                    player.rank = combinedRankMap.get(player.id) as number;
                }
            });

            // Re-sort the groups based on the new ranks from sudden death
            finalData[groupName].sort((a,b) => {
                const rankA = a.rank === null ? Infinity : a.rank;
                const rankB = b.rank === null ? Infinity : b.rank;
                if (rankA !== rankB) return rankA - rankB;

                const scoreA = a.hasAnyScore && !a.hasForfeited ? a.totalScore : Infinity;
                const scoreB = b.hasAnyScore && !b.hasForfeited ? b.totalScore : Infinity;
                return scoreA - scoreB;
            })
        }

        return finalData;
    }, [processedDataByGroup, processedIndividualSuddenDeathData, processedTeamSuddenDeathData]);
    
    const allGroupsList = Object.keys(finalDataByGroup);

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

    useEffect(() => {
        if (!groupProgress || !finalDataByGroup) return;

        Object.keys(groupProgress).forEach(groupName => {
            // Check if group is 100% complete and not yet notified
            if (groupProgress[groupName] === 100 && !notifiedSuddenDeathGroups.has(groupName)) {
                const playersInGroup = finalDataByGroup[groupName];
                if (playersInGroup) {
                    const tiedFirstPlace = playersInGroup.filter(p => p.rank === 1);
                    
                    // Check if there are 2 or more players tied for first
                    if (tiedFirstPlace.length > 1) {
                        toast({
                            title: `🚨 서든데스 필요: ${groupName}`,
                            description: `${groupName} 그룹의 경기가 완료되었으며, 1위 동점자가 발생했습니다. 서든데스 관리가 필요합니다.`,
                            action: (
                                <ToastAction altText="관리하기" onClick={() => router.push('/admin/suddendeath')}>
                                    관리하기
                                </ToastAction>
                            ),
                            duration: 30000 // Keep the toast on screen longer
                        });
                        // Add to notified set to prevent re-triggering
                        setNotifiedSuddenDeathGroups(prev => {
                            const newSet = new Set(prev);
                            newSet.add(groupName);
                            return newSet;
                        });
                    }
                }
            }
        });
    }, [groupProgress, finalDataByGroup, notifiedSuddenDeathGroups]);

    const handleExportToExcel = async () => {
        const XLSX = await import('xlsx-js-style');
        const wb = XLSX.utils.book_new();

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
                addCell(startRow, 0, player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : ''));
                addCell(startRow, 1, player.jo);
                addCell(startRow, 2, player.name);
                addCell(startRow, 3, player.affiliation);
                addCell(startRow, 15, player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-'));

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

                        addCell(currentRow, 14, player.hasForfeited ? '기권' : (player.hasAnyScore ? (courseData?.courseTotal || 0) : '-'));
                    });
                } else {
                    addCell(startRow, 4, '배정된 코스 없음');
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

        XLSX.writeFile(wb, `${tournamentName}_전체결과_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    const [searchPlayer, setSearchPlayer] = useState('');
    const [highlightedPlayerId, setHighlightedPlayerId] = useState(null);
    const playerRowRefs = useRef({});

    // 선수별 점수 로그 캐시 상태 (playerId별)
    const [playerScoreLogs, setPlayerScoreLogs] = useState<{ [playerId: string]: ScoreLog[] }>({});
    // 로딩 상태
    const [logsLoading, setLogsLoading] = useState(false);

    // 선수별 로그 미리 불러오기 (처음 한 번만)
    useEffect(() => {
        const fetchLogs = async () => {
            setLogsLoading(true);
            const playerIds = Object.values(finalDataByGroup).flat().map((p:any) => p.id);
            const logsMap: { [playerId: string]: ScoreLog[] } = {};
            await Promise.all(playerIds.map(async (pid) => {
                try {
                    const logs = await getPlayerScoreLogs(pid);
                    logsMap[pid] = logs;
                } catch {
                    logsMap[pid] = [];
                }
            }));
            setPlayerScoreLogs(logsMap);
            setLogsLoading(false);
        };
        if (Object.keys(finalDataByGroup).length > 0) {
            fetchLogs();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finalDataByGroup]);

    const filteredPlayerResults = useMemo(() => {
        if (!searchPlayer) return [];
        const lowerCaseSearch = searchPlayer.toLowerCase();
        return Object.values(finalDataByGroup).flat().filter(player => {
            return player.name.toLowerCase().includes(lowerCaseSearch) || player.affiliation.toLowerCase().includes(lowerCaseSearch);
        });
    }, [searchPlayer, finalDataByGroup]);

    const handlePlayerSearchSelect = (playerId: number) => {
        setHighlightedPlayerId(playerId);
        // rowRef가 배열 또는 undefined일 수 있음. 첫 번째 DOM 요소만 스크롤.
        const rowRefArr = playerRowRefs.current[playerId];
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
                        // 자동 기권 처리: 해당 선수의 모든 배정 코스/홀 0점 입력
                        for (const cid of courseIds) {
                            for (let h = 1; h <= 9; h++) {
                                if (scores?.[pid]?.[cid]?.[h] !== 0) {
                                    await set(ref(db, `scores/${pid}/${cid}/${h}`), 0);
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
) }
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
          {filteredPlayerResults.map((result, idx) => (
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
                                            <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{minWidth:'90px',maxWidth:'260px',flexGrow:1}}>선수명(팀명)</TableHead>
                                            <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{minWidth:'80px',maxWidth:'200px',flexGrow:1}}>소속</TableHead>
                                            <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{minWidth:'80px',maxWidth:'200px',flexGrow:1}}>코스</TableHead>
                                            {Array.from({length: 9}).map((_, i) => <TableHead key={i} className="w-10 text-center px-2 py-2 border-r">{i + 1}</TableHead>)}
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
                                                            if (!playerRowRefs.current[player.id]) playerRowRefs.current[player.id] = [];
                                                            playerRowRefs.current[player.id][courseIndex] = el;
                                                        }}
                                                        className={`text-base ${highlightedPlayerId === player.id ? 'bg-yellow-100 animate-pulse' : ''}`}
                                                    >
                                                        {courseIndex === 0 && (
                                                            <>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (() => {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitLogs = logs
        .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment)
        .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬
    
    if (forfeitLogs.length > 0) {
      const latestLog = forfeitLogs[0];
      if (latestLog.comment?.includes('불참')) return '불참';
      if (latestLog.comment?.includes('실격')) return '실격';
      return '기권';
    }
    return '기권';
  })() : '')}</TableCell>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle font-semibold px-2 py-1 border-r text-center whitespace-nowrap" style={{minWidth:'90px',maxWidth:'260px',flexGrow:1}}>{player.name}</TableCell>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle text-muted-foreground px-2 py-1 border-r text-center whitespace-nowrap" style={{minWidth:'80px',maxWidth:'200px',flexGrow:1}}>{player.affiliation}</TableCell>
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
                                                        
                                                        <TableCell className="font-medium px-2 py-1 border-r text-center whitespace-nowrap" style={{minWidth:'80px',maxWidth:'200px',flexGrow:1}}>{player.coursesData[course.id]?.courseName}</TableCell>
                                                        
                                                        {player.coursesData[course.id]?.holeScores.map((score, i) => {
  // 해당 셀(플레이어/코스/홀)에 대한 최근 로그 찾기
  const logs = playerScoreLogs[player.id] || [];
  const cellLog = logs.find(l => String(l.courseId) === String(course.id) && Number(l.holeNumber) === i + 1);
  // 실제로 수정된 경우만 빨간색으로 표시 (oldValue가 0이고 newValue가 점수인 경우는 제외)
  const isModified = !!cellLog && cellLog.oldValue !== 0;
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
      onDoubleClick={() => {
        setScoreEditModal({
          open: true,
          playerId: player.id,
          courseId: course.id,
          holeIndex: i,
          score: score === null ? '' : score
        });
      }}
    >
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              {isValidNumber(score) ? score : '-'}
              {/* ±타수 표기 */}
              {isValidNumber(pm) && score !== 0 && (
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
          <br />
          입력 점수: <b>{scoreEditModal.score === "0" ? "기권" : scoreEditModal.score}</b>
        </DialogDescription>
      </DialogHeader>
      <input
        type="number"
        className="w-full border rounded px-3 py-2 text-lg text-center"
        value={scoreEditModal.score}
        onChange={e => setScoreEditModal({ ...scoreEditModal, score: e.target.value })}
        min={0}
        max={20}
        autoFocus
      />
      {(scoreEditModal.score === 0 || scoreEditModal.score === "0") && (
        <div className="mt-2 text-red-600 text-center font-bold text-lg">기권</div>
      )}
      <DialogFooter>
        <Button onClick={() => handleScoreEditSave()}>저장</Button>
        <Button variant="outline" onClick={() => setScoreEditModal({ ...scoreEditModal, open: false })}>취소</Button>
        {/* 기권 해제 버튼: 0점(기권) 상태에서만 노출 */}
        {(scoreEditModal.score === 0 || scoreEditModal.score === "0") && (
          <Button
            className="bg-yellow-500 hover:bg-yellow-600 text-white ml-2"
            onClick={async () => {
              // 선수, 코스, 그룹 정보 찾기
              const player = Object.values(finalDataByGroup).flat().find((p: any) => p.id === scoreEditModal.playerId);
              if (!player) return;
              // 선수의 모든 배정 코스/홀 복구
              const logs = playerScoreLogs[player.id] || [];
              let anyRestored = false;
              for (const course of player.assignedCourses) {
                for (let h = 1; h <= 9; h++) {
                  // 현재 점수가 0(기권)인 경우만 복구
                  if (scores?.[player.id]?.[course.id]?.[h] === 0) {
                    // 해당 홀의 로그 중, 0점(기권) 처리 이전의 마지막 점수 찾기
                    const zeroLogIdx = logs.findIndex(l =>
                      l.holeNumber === h &&
                      l.newValue === 0 &&
                      l.comment && l.comment.includes(`courseId=${course.id}`)
                    );
                    let restoreValue = null;
                    if (zeroLogIdx !== -1) {
                      for (let j = zeroLogIdx - 1; j >= 0; j--) {
                        const l = logs[j];
                        if (
                          l.holeNumber === h &&
                          l.comment && l.comment.includes(`courseId=${course.id}`)
                        ) {
                          restoreValue = l.newValue;
                          break;
                        }
                      }
                    }
                    // 복구(없으면 null)
                    await set(ref(db, `scores/${player.id}/${course.id}/${h}`), restoreValue);
                    await logScoreChange({
                      matchId: 'tournaments/current',
                      playerId: player.id,
                      scoreType: 'holeScore',
                      courseId: course.id,
                      holeNumber: h,
                      oldValue: 0,
                      newValue: restoreValue === null ? null : restoreValue,
                      modifiedBy: 'admin',
                      modifiedByType: 'admin',
                      comment: '기권 해제 복구'
                    });
                    anyRestored = true;
                  }
                }
              }
              if (anyRestored) {
                toast({ title: '기권 해제 완료', description: '기권 처리 이전의 점수로 복구되었습니다.' });
                // 점수 로그 재조회
                try {
                  const logs = await getPlayerScoreLogs(player.id);
                  setPlayerScoreLogs(prev => ({ ...prev, [player.id]: logs }));
                } catch {}
              } else {
                toast({ title: '복구할 점수가 없습니다.', description: '이미 기권이 해제된 상태입니다.' });
              }
              setScoreEditModal({ ...scoreEditModal, open: false });
            }}
          >
            기권 해제
          </Button>
        )}
        {/* 안내문구 */}
        {(scoreEditModal.score === 0 || scoreEditModal.score === "0") && (
          <div className="w-full text-center text-sm text-yellow-700 mt-2">기권 처리 이전의 모든 점수를 복구합니다.</div>
        )}
      </DialogFooter>
    </DialogContent>
  </Dialog>
)}
                                                        
                                                        <TableCell className="text-center font-bold px-2 py-1 border-r">
  {(() => {
    let courseSumElem = '-';
    if (player.hasAnyScore && !player.hasForfeited) {
      const courseData = courses[course.id];
      let sum = 0, parSum = 0;
      if (courseData && Array.isArray(courseData.pars)) {
        for (let i = 0; i < 9; i++) {
          const s = player.coursesData[course.id]?.holeScores[i];
          const p = courseData.pars[i];
          if (isValidNumber(s) && isValidNumber(p)) {
            sum += s;
            parSum += p;
          }
        }
      }
      const pm = isValidNumber(sum) && isValidNumber(parSum) && parSum > 0 ? sum - parSum : null;
      courseSumElem = (
        <span>
          {isValidNumber(sum) ? sum : '-'}
          {isValidNumber(pm) && (
            <span className={
              'ml-1 align-middle text-xs ' + (pm < 0 ? 'text-blue-400' : pm > 0 ? 'text-red-400' : 'text-gray-400')
            } style={{ fontSize: '0.7em', fontWeight: 600 }}>
              {pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm)}
            </span>
          )}
        </span>
      );
    } else if (player.hasForfeited) {
      // 기권 타입을 로그에서 추출
      const logs = playerScoreLogs[player.id] || [];
      const forfeitLogs = logs
          .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment)
          .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬
      
      if (forfeitLogs.length > 0) {
        const latestLog = forfeitLogs[0];
        if (latestLog.comment?.includes('불참')) {
          courseSumElem = '불참';
        } else if (latestLog.comment?.includes('실격')) {
          courseSumElem = '실격';
        } else {
          courseSumElem = '기권';
        }
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
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitLogs = logs
        .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment)
        .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬
    
    let forfeitType = '기권';
    if (forfeitLogs.length > 0) {
      const latestLog = forfeitLogs[0];
      if (latestLog.comment?.includes('불참')) forfeitType = '불참';
      else if (latestLog.comment?.includes('실격')) forfeitType = '실격';
      else forfeitType = '기권';
    }

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
      {isValidNumber(player.plusMinus) && (
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
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitLogs = logs
        .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment)
        .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬
    
    if (forfeitLogs.length > 0) {
      const latestLog = forfeitLogs[0];
      if (latestLog.comment?.includes('불참')) return '불참';
      if (latestLog.comment?.includes('실격')) return '실격';
      return '기권';
    }
    return '기권';
  })() : '-')}</TableCell>
                                                         <TableCell className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                         <TableCell className="align-middle font-semibold px-2 py-1 border-r text-center">{player.name}</TableCell>
                                                         <TableCell className="align-middle px-2 py-1 border-r text-center">{player.affiliation}</TableCell>
                                                         <TableCell colSpan={11} className="text-center px-2 py-1 border-r">이 그룹에 배정된 코스가 없습니다.</TableCell>
                                                         <TableCell className="text-center align-middle font-bold text-primary text-lg px-2 py-1">{player.hasForfeited ? (() => {
    // 기권 타입을 로그에서 추출
    const logs = playerScoreLogs[player.id] || [];
    const forfeitLogs = logs
        .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment)
        .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬
    
    if (forfeitLogs.length > 0) {
      const latestLog = forfeitLogs[0];
      if (latestLog.comment?.includes('불참')) return '불참';
      if (latestLog.comment?.includes('실격')) return '실격';
      return '기권';
    }
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
            <DialogContent className="max-w-md">
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

                <DialogFooter>
                    <Button variant="outline" onClick={() => setPrintModal({ ...printModal, open: false })}>
                        취소
                    </Button>
                    <Button 
                        variant="outline" 
                        onClick={showPreview} 
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={!printModal.showAllGroups && printModal.selectedGroups.length === 0}
                    >
                        👁️ 미리보기
                    </Button>
                    <Button 
                        onClick={executePrint} 
                        className="bg-blue-600 hover:bg-blue-700"
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