"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, get, onValue } from 'firebase/database';
import { Printer } from 'lucide-react';

/**
 * 대회 점수표 인쇄 도구
 * 기존 코드와 완전히 분리된 독립 컴포넌트
 * Firebase에서 직접 데이터를 가져와서 인쇄 기능 제공
 * 삭제 시에도 기존 코드에 영향 없음
 */
export default function ScorePrintTool() {
    const { toast } = useToast();
    const [printModal, setPrintModal] = useState({
        open: false,
        orientation: 'portrait' as 'portrait' | 'landscape',
        paperSize: 'A4' as 'A4' | 'A3',
        selectedGroups: [] as string[],
        showAllGroups: true
    });
    const [isLoading, setIsLoading] = useState(false);
    const [players, setPlayers] = useState<any>({});
    const [scores, setScores] = useState<any>({});
    const [courses, setCourses] = useState<any>({});
    const [tournament, setTournament] = useState<any>({});
    const [groupsData, setGroupsData] = useState<any>({});
    const [processedData, setProcessedData] = useState<{ [groupName: string]: any[] }>({});
    const [allGroupsList, setAllGroupsList] = useState<string[]>([]);

    // Firebase에서 데이터 로드
    useEffect(() => {
        if (!db) return;

        const loadData = async () => {
            setIsLoading(true);
            try {
                // 선수 데이터
                const playersSnapshot = await get(ref(db, 'players'));
                setPlayers(playersSnapshot.val() || {});

                // 점수 데이터
                const scoresSnapshot = await get(ref(db, 'scores'));
                setScores(scoresSnapshot.val() || {});

                // 코스 데이터
                const coursesSnapshot = await get(ref(db, 'tournaments/current/courses'));
                setCourses(coursesSnapshot.val() || {});

                // 그룹 데이터
                const groupsSnapshot = await get(ref(db, 'tournaments/current/groups'));
                setGroupsData(groupsSnapshot.val() || {});

                // 대회 정보
                const tournamentRef = ref(db, 'tournaments/current');
                onValue(tournamentRef, (snap) => {
                    setTournament(snap.val() || {});
                }, { onlyOnce: true });
            } catch (error: any) {
                console.error('데이터 로드 실패:', error);
                toast({ title: '오류', description: '데이터를 불러오는데 실패했습니다.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [toast]);

    // 홈 전광판과 동일한 tieBreak 함수 (백카운트 방식)
    const tieBreak = (a: any, b: any, sortedCourses: any[]) => {
        if (a.hasForfeited && !b.hasForfeited) return 1;
        if (!a.hasForfeited && b.hasForfeited) return -1;

        if (!a.hasAnyScore && !b.hasAnyScore) return 0;
        if (!a.hasAnyScore) return 1;
        if (!b.hasAnyScore) return -1;

        if (a.total !== b.total) {
            return a.total - b.total;
        }

        // 코스별 총점 비교 (역순)
        for (const course of sortedCourses) {
            if (!course || course.id === undefined || course.id === null) continue;
            const courseId = course.id;
            const aScoreObj = a.courseScores || {};
            const bScoreObj = b.courseScores || {};
            const aCourseScore = aScoreObj[courseId] ?? 0;
            const bCourseScore = bScoreObj[courseId] ?? 0;
            if (aCourseScore !== bCourseScore) {
                return aCourseScore - bCourseScore;
            }
        }

        // 홀별 백카운트: 마지막 코스부터 역순으로 각 코스의 홀 점수 비교
        if (sortedCourses.length > 0) {
            for (const course of sortedCourses) {
                if (!course || course.id === undefined || course.id === null) continue;
                const courseId = course.id;
                const aDetailObj = a.detailedScores || {};
                const bDetailObj = b.detailedScores || {};
                const aHoleScores = aDetailObj[courseId] || {};
                const bHoleScores = bDetailObj[courseId] || {};
                let hasNonZeroScore = false;
                
                // 9번 홀부터 1번 홀까지 역순으로 비교
                for (let i = 9; i >= 1; i--) {
                    const hole = i.toString();
                    const aHole = aHoleScores[hole] || 0;
                    const bHole = bHoleScores[hole] || 0;
                    
                    if (aHole > 0 || bHole > 0) {
                        hasNonZeroScore = true;
                    }
                    
                    if (aHole !== bHole) {
                        return aHole - bHole;
                    }
                }
                
                if (hasNonZeroScore) {
                    break;
                }
            }
        }

        return 0;
    };

    // 선수 데이터 처리 및 순위 계산 (홈 전광판과 동일한 방식)
    useEffect(() => {
        if (!players || Object.keys(players).length === 0 || !courses || !scores) {
            setProcessedData({});
            setAllGroupsList([]);
            return;
        }

        const processed: { [groupName: string]: any[] } = {};

        // 모든 선수 처리
        Object.entries(players).forEach(([playerId, player]: [string, any]) => {
            if (!player || !player.group) return;

            const groupName = player.group;
            if (!processed[groupName]) {
                processed[groupName] = [];
            }

            // 배정된 코스 찾기 (외부 전광판과 동일한 방식)
            const playerGroupData = groupsData[groupName];
            const coursesOrder = playerGroupData?.courses || {};
            const assignedCourseIds = Object.keys(coursesOrder).filter((cid: string) => {
                const order = coursesOrder[cid];
                return typeof order === 'boolean' ? order : (typeof order === 'number' && order > 0);
            });
            
            const coursesForPlayer = assignedCourseIds
                .map(cid => {
                    const key = Object.keys(courses).find(k => String(k) === String(cid));
                    return key ? { id: key, ...courses[key] } : undefined;
                })
                .filter(Boolean) as any[];

            // 코스 순서대로 정렬 (외부 전광판과 동일: order 값 기준)
            coursesForPlayer.sort((a: any, b: any) => {
                const orderA = coursesOrder[String(a.id)];
                const orderB = coursesOrder[String(b.id)];
                
                let numA: number;
                if (typeof orderA === 'boolean') {
                    numA = orderA ? (a.order || 0) : 0;
                } else if (typeof orderA === 'number' && orderA > 0) {
                    numA = orderA;
                } else {
                    numA = a.order || 0;
                }
                
                let numB: number;
                if (typeof orderB === 'boolean') {
                    numB = orderB ? (b.order || 0) : 0;
                } else if (typeof orderB === 'number' && orderB > 0) {
                    numB = orderB;
                } else {
                    numB = b.order || 0;
                }
                
                return numA - numB; // 작은 순서가 먼저
            });

            // 코스별 점수 데이터
            const coursesData: { [courseId: string]: any } = {};
            const courseScores: { [courseId: string]: number } = {};
            const detailedScores: { [courseId: string]: { [holeNumber: string]: number } } = {};

            coursesForPlayer.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = scores[playerId]?.[courseId] || {};

                // 홀별 점수 배열
                const holeScores = Array.from({ length: 9 }, (_, i) => {
                    const holeScore = scoresForCourse[(i + 1).toString()];
                    return typeof holeScore === 'number' ? holeScore : null;
                });

                // 코스 총점 계산
                const courseTotal = holeScores.reduce((sum, score) => {
                    return sum + (typeof score === 'number' && score > 0 ? score : 0);
                }, 0);

                coursesData[courseId] = {
                    courseName: course.name || courseId,
                    courseTotal,
                    holeScores
                };

                courseScores[courseId] = courseTotal;

                detailedScores[courseId] = {};
                for (let i = 1; i <= 9; i++) {
                    const holeScore = scoresForCourse[i.toString()];
                    detailedScores[courseId][i.toString()] = typeof holeScore === 'number' ? holeScore : 0;
                }
            });

            // 총타수 계산 (홈 전광판과 동일)
            let total = 0;
            coursesForPlayer.forEach((course: any) => {
                const courseData = courses[course.id];
                const scoresForCourse = scores[playerId]?.[course.id] || {};
                if (courseData && Array.isArray(courseData.pars)) {
                    for (let i = 0; i < 9; i++) {
                        const score = scoresForCourse[(i + 1).toString()];
                        if (score !== null && score !== undefined && score > 0) {
                            total += score;
                        }
                    }
                }
            });

            // 기권 여부 확인
            const hasForfeited = Object.values(coursesData).some((cd: any) => 
                cd.holeScores.some((s: any) => s === 0)
            );

            // 기권 타입 확인 (간단 버전 - 실제로는 로그에서 확인해야 함)
            let forfeitType: 'absent' | 'disqualified' | 'forfeit' | null = null;
            if (hasForfeited) {
                forfeitType = 'forfeit';
            }

            processed[groupName].push({
                id: playerId,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                affiliation: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                group: groupName,
                totalScore: total,
                coursesData,
                assignedCourses: coursesForPlayer,
                hasAnyScore: total > 0,
                hasForfeited,
                forfeitType,
                courseScores,
                detailedScores,
                total
            });
        });

        // 그룹별로 순위 계산 (외부 전광판과 동일한 방식)
        Object.keys(processed).forEach(groupName => {
            const groupPlayers = processed[groupName];
            const groupData = groupsData[groupName];
            const coursesOrder = groupData?.courses || {};
            
            // 그룹의 코스 정렬 (외부 전광판과 동일: order 값 기준)
            const allCoursesForGroup = groupPlayers[0]?.assignedCourses || [];
            const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                const orderA = coursesOrder[String(a.id)];
                const orderB = coursesOrder[String(b.id)];
                
                let numA: number;
                if (typeof orderA === 'boolean') {
                    numA = orderA ? (a.order || 0) : 0;
                } else if (typeof orderA === 'number' && orderA > 0) {
                    numA = orderA;
                } else {
                    numA = a.order || 0;
                }
                
                let numB: number;
                if (typeof orderB === 'boolean') {
                    numB = orderB ? (b.order || 0) : 0;
                } else if (typeof orderB === 'number' && orderB > 0) {
                    numB = orderB;
                } else {
                    numB = b.order || 0;
                }
                
                return numA - numB; // 작은 순서가 먼저
            });
            
            // 백카운트는 마지막 코스부터 역순이므로 reverse (외부 전광판과 동일)
            const coursesForBackcount = [...coursesForGroup].reverse();

            // tieBreak 함수로 정렬 (외부 전광판과 동일: coursesForBackcount 사용)
            groupPlayers.sort((a, b) => tieBreak(a, b, coursesForBackcount));

            // 순위 부여 (홈 전광판과 동일)
            groupPlayers.forEach((player, index) => {
                if (player.hasForfeited) {
                    player.rank = null;
                } else {
                    // 동점자 처리 (외부 전광판과 동일한 방식)
                    if (index > 0) {
                        const prevPlayer = groupPlayers[index - 1];
                        if (!prevPlayer.hasForfeited && prevPlayer.total === player.total) {
                            // tieBreak 결과가 0이면 동점
                            if (tieBreak(prevPlayer, player, coursesForBackcount) === 0) {
                                player.rank = prevPlayer.rank;
                            } else {
                                player.rank = index + 1;
                            }
                        } else {
                            player.rank = index + 1;
                        }
                    } else {
                        player.rank = 1;
                    }
                }
            });
        });

        setProcessedData(processed);
        setAllGroupsList(Object.keys(processed).sort());
    }, [players, scores, courses, groupsData]);

    // 그룹명 영어 번역
    const getGroupNameEnglish = (groupName: string): string => {
        const translations: { [key: string]: string } = {
            '남자부': "Men's Division",
            '여자부': "Women's Division",
            '남자시니어부': "Men's Senior Division",
            '여자시니어부': "Women's Senior Division",
            '남자주니어부': "Men's Junior Division",
            '여자주니어부': "Women's Junior Division"
        };
        return translations[groupName] || groupName;
    };

    // 인쇄 HTML 생성
    const generatePrintHTML = () => {
        const groupsToPrint = printModal.showAllGroups ? allGroupsList : printModal.selectedGroups;
        const tournamentName = tournament.name || '골프 대회';
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
                .responsive-column {
                    min-width: 0;
                    max-width: none;
                    width: auto;
                    white-space: nowrap;
                    overflow: visible;
                    text-overflow: clip;
                    padding: 6px 8px;
                }
                .fixed-column {
                    width: 5%;
                    min-width: 30px;
                    max-width: 40px;
                    padding: 6px 4px;
                }
                .score-table {
                    table-layout: auto;
                    width: 100%;
                }
                .rank-cell.responsive-column {
                    min-width: 50px;
                }
                .responsive-column:nth-child(2) {
                    min-width: 30px;
                }
                .player-name.responsive-column {
                    min-width: 120px;
                }
                .affiliation.responsive-column {
                    min-width: 80px;
                }
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
                    .no-print { display: none; }
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
            const groupPlayers = processedData[groupName] || [];
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

            groupPlayers.forEach((player) => {
                printContent += `<tbody class="player-tbody">`;
                
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

    const handleOpenPrint = () => {
        if (allGroupsList.length === 0) {
            toast({ title: '알림', description: '인쇄할 그룹이 없습니다.', variant: 'default' });
            return;
        }
        setPrintModal({
            open: true,
            orientation: 'portrait',
            paperSize: 'A4',
            selectedGroups: allGroupsList,
            showAllGroups: true
        });
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>📄 대회 점수표 인쇄</CardTitle>
                    <CardDescription>
                        대회 점수표를 인쇄할 수 있습니다. 홈 전광판 페이지를 열지 않고도 바로 인쇄할 수 있습니다.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button 
                        onClick={handleOpenPrint} 
                        disabled={isLoading || allGroupsList.length === 0}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Printer className="mr-2 h-4 w-4" />
                        {isLoading ? '데이터 로딩 중...' : '대회 점수표 인쇄하기'}
                    </Button>
                </CardContent>
            </Card>

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
                            onClick={executePrint}
                            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                            disabled={!printModal.showAllGroups && printModal.selectedGroups.length === 0}
                        >
                            <Printer className="mr-2 h-4 w-4" />
                            인쇄하기
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

