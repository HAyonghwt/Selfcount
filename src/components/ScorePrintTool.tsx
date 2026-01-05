"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { db, auth } from '@/lib/firebase';
import { ref, get, onValue, set } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { Printer, Download } from 'lucide-react';

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
        showAllGroups: true,
        selectedCourses: [] as string[],
        showAllCourses: true,
        logoEnabled: false, // 로고 온/오프
        logoSize: 0.6, // 로고 크기 (0.1 ~ 1.0)
        logoOpacity: 0.10, // 로고 진하기 (0.0 ~ 1.0)
        logoOffsetX: 0, // 로고 가로 위치 (-50 ~ 50)
        logoOffsetY: 0, // 로고 세로 위치 (-50 ~ 50)
    });

    // 로고 불러오기
    // 로고 불러오기
    const [backgroundLogoUrl, setBackgroundLogoUrl] = useState<string>('');
    useEffect(() => {
        if (!db || !auth) return;

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                if (!db) return;
                try {
                    const logosRef = ref(db, 'logos');
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
            }
        });

        return () => unsubscribe();
    }, []);

    // 로고 설정 불러오기 및 저장
    // 로고 설정 불러오기 및 저장
    useEffect(() => {
        if (!db || !auth) return;

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                if (!db) return;
                const loadSettings = async () => {
                    try {
                        if (!db) return;
                        const settingsSnapshot = await get(ref(db, 'scorePrint/settings'));
                        if (settingsSnapshot.exists()) {
                            const settings = settingsSnapshot.val();
                            setPrintModal(prev => ({
                                ...prev,
                                logoEnabled: settings.logoEnabled ?? false,
                                logoSize: settings.logoSize ?? 0.6,
                                logoOpacity: settings.logoOpacity ?? 0.10,
                                logoOffsetX: settings.logoOffsetX ?? 0,
                                logoOffsetY: settings.logoOffsetY ?? 0
                            }));
                        }
                    } catch (error) {
                        console.error('로고 설정 불러오기 실패:', error);
                    }
                };

                loadSettings();

                // 실시간 구독으로 설정 변경 감지
                return onValue(ref(db, 'scorePrint/settings'), (snapshot) => {
                    if (snapshot.exists()) {
                        const settings = snapshot.val();
                        setPrintModal(prev => ({
                            ...prev,
                            logoEnabled: settings.logoEnabled ?? false,
                            logoSize: settings.logoSize ?? 0.6,
                            logoOpacity: settings.logoOpacity ?? 0.10,
                            logoOffsetX: settings.logoOffsetX ?? 0,
                            logoOffsetY: settings.logoOffsetY ?? 0
                        }));
                    }
                });
            }
        });

        return () => unsubscribe();
    }, []);

    // 로고 설정 업데이트 함수
    const updateLogoSettings = async (newSettings: Partial<Pick<typeof printModal, 'logoEnabled' | 'logoSize' | 'logoOpacity' | 'logoOffsetX' | 'logoOffsetY'>>) => {
        if (!db) return;

        try {
            // Firebase에서 현재 설정을 불러와서 병합 (최신 상태 보장)
            const currentSettingsSnapshot = await get(ref(db, 'scorePrint/settings'));
            let finalSettings;

            if (currentSettingsSnapshot.exists()) {
                // Firebase에 설정이 있으면 Firebase의 설정과 병합
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
                // Firebase에 설정이 없으면 현재 state와 병합
                finalSettings = {
                    logoEnabled: printModal.logoEnabled,
                    logoSize: printModal.logoSize,
                    logoOpacity: printModal.logoOpacity,
                    logoOffsetX: printModal.logoOffsetX,
                    logoOffsetY: printModal.logoOffsetY,
                    ...newSettings
                };
            }

            // 기본값 보장
            const settingsToSave = {
                logoEnabled: finalSettings.logoEnabled ?? false,
                logoSize: finalSettings.logoSize ?? 0.6,
                logoOpacity: finalSettings.logoOpacity ?? 0.10,
                logoOffsetX: finalSettings.logoOffsetX ?? 0,
                logoOffsetY: finalSettings.logoOffsetY ?? 0
            };

            // state 업데이트
            setPrintModal(prev => ({
                ...prev,
                ...settingsToSave
            }));

            // Firebase에 저장
            await set(ref(db, 'scorePrint/settings'), settingsToSave);
        } catch (error) {
            console.error('로고 설정 저장 실패:', error);
        }
    };
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingImage, setIsSavingImage] = useState(false);
    const [players, setPlayers] = useState<any>({});
    const [scores, setScores] = useState<any>({});
    const [courses, setCourses] = useState<any>({});
    const [tournament, setTournament] = useState<any>({});
    const [groupsData, setGroupsData] = useState<any>({});
    const [processedData, setProcessedData] = useState<{ [groupName: string]: any[] }>({});
    const [allGroupsList, setAllGroupsList] = useState<string[]>([]);

    // Firebase에서 데이터 로드
    // Firebase에서 데이터 로드
    // Firebase에서 데이터 로드 (실시간 업데이트 반영)
    useEffect(() => {
        if (!db || !auth) return;

        setIsLoading(true);
        const unsubs: (() => void)[] = [];

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            // 이전 리스너 정리
            unsubs.forEach(u => u());
            unsubs.length = 0;

            if (user) {
                if (!db) return;
                // Players Listeners
                const playersRef = ref(db, 'players');
                unsubs.push(onValue(playersRef, (snap) => {
                    setPlayers(snap.val() || {});
                }));

                // Scores Listener - 실시간 점수 반영
                const scoresRef = ref(db, 'scores');
                unsubs.push(onValue(scoresRef, (snap) => {
                    setScores(snap.val() || {});
                }));

                // Tournament Listener (includes groups & courses) - 실시간 설정 반영
                const tournamentRef = ref(db, 'tournaments/current');
                unsubs.push(onValue(tournamentRef, (snap) => {
                    const data = snap.val() || {};
                    setTournament(data);
                    setCourses(data.courses || {});
                    setGroupsData(data.groups || {});
                    setIsLoading(false); // 데이터 로드 완료
                }));
            } else {
                setPlayers({});
                setScores({});
                setTournament({});
                setCourses({});
                setGroupsData({});
                setIsLoading(false);
            }
        });

        return () => {
            unsubscribeAuth();
            unsubs.forEach(u => u());
        };
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
                    // 메인 전광판과 동일하게 id 속성을 기준으로 검색
                    const course = Object.values(courses).find((c: any) => String(c.id) === String(cid));
                    return course ? course : undefined;
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
                const courseTotal = holeScores.reduce((sum: number, score) => {
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
        const selectedCourses = printModal.showAllCourses ? [] : printModal.selectedCourses;
        const tournamentName = tournament.name || '골프 대회';
        let printContent = '';

        // 로고 HTML (배경 이미지 대신 img 태그 사용 - 인쇄 시 강제 출력을 위해)
        const logoHtml = (printModal.logoEnabled && backgroundLogoUrl) ? `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10; /* 테이블보다 위로 올림 */
                pointer-events: none;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            ">
                <img src="${backgroundLogoUrl}" style="
                    width: ${printModal.logoSize * 100}%;
                    height: auto;
                    opacity: ${printModal.logoOpacity};
                    transform: translate(${printModal.logoOffsetX}px, ${printModal.logoOffsetY}px);
                " />
            </div>
        ` : '';

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
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    position: relative;
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
                    position: relative;
                    z-index: 5; /* 로고(10)보다 아래로 설정 */
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
                /* 순위, 조: 줄바꿈 방지 */
                .score-table td.rank-cell,
                .score-table td.jo-cell {
                    white-space: nowrap;
                    overflow: hidden;
                }
                /* 선수명: 줄바꿈 허용 */
                .score-table td.name-cell {
                    white-space: normal;
                    word-break: break-word;
                    line-height: 1.2;
                    font-weight: bold;
                    font-size: 16px;
                }
                /* 소속, 코스: 줄바꿈 방지 */
                .score-table td.affiliation-cell,
                .score-table td.course-cell {
                    white-space: nowrap;
                    overflow: hidden;
                    font-size: 14px;
                }
                /* 순위: 22px, 강조 */
                .score-table td.rank-cell {
                    font-weight: 800;
                    font-size: 22px;
                    color: #1e40af;
                }
                .player-tbody:nth-of-type(even) td {
                    background-color: #f8fafc !important;
                }
                /* 코스: 15px */
                .score-table td.course-cell {
                    font-weight: bold;
                    color: #059669;
                }
                /* 홀 점수: 15px */
                .score-table td.hole-score {
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                    font-size: 15px;
                }
                /* 합계: 18px, 빨강 */
                .score-table td.course-total {
                    font-weight: 800;
                    font-size: 18px;
                    color: #dc2626;
                    background-color: #fffafb !important;
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
                /* 총타수: 22px, 남색 강조 */
                .score-table td.total-score {
                    font-weight: 800;
                    font-size: 22px;
                    color: #1e40af;
                    background-color: #f0f7ff !important;
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
                        <colgroup>
                            <col style="width: 55px;">
                            <col style="width: 45px;">
                            <col style="width: auto;">
                            <col style="width: 110px;">
                            <col style="width: 90px;">
                            ${Array.from({ length: 9 }).map(() => `<col style="width: 40px;">`).join('')}
                            <col style="width: 55px;">
                            <col style="width: 65px;">
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
                                <th>1</th>
                                <th>2</th>
                                <th>3</th>
                                <th>4</th>
                                <th>5</th>
                                <th>6</th>
                                <th>7</th>
                                <th>8</th>
                                <th>9</th>
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
            `;

            groupPlayers.forEach((player) => {
                printContent += `<tbody class="player-tbody">`;

                if (player.assignedCourses.length > 0) {
                    // 선택된 코스만 필터링 (비어있으면 전체)
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
                                        <td rowspan="${filteredCourses.length}" class="rank-cell">
                                            ${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}
                                        </td>
                                        <td rowspan="${filteredCourses.length}" class="jo-cell">${player.jo}</td>
                                        <td rowspan="${filteredCourses.length}" class="name-cell">${player.name}</td>
                                        <td rowspan="${filteredCourses.length}" class="affiliation-cell">${player.affiliation || '-'}</td>
                                    ` : ''}
                                    <td class="course-cell">${courseData?.courseName || (course.name ? (course.name.includes('-') ? course.name.split('-')[1] : course.name) : 'Course')}</td>
                            `;

                            // 홀별 점수
                            holeScores.forEach((score: number | null, holeIdx: number) => {
                                let scoreContent = score !== null ? score.toString() : '-';

                                // ±타수 추가
                                const par = tournament.courses?.[course.id]?.pars?.[holeIdx];
                                if (score !== null && score > 0 && typeof par === 'number') {
                                    const pm = score - par;
                                    const pmText = pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm);
                                    const pmClass = pm === 0 ? 'pm-even' : (pm > 0 ? 'pm-plus' : 'pm-minus');
                                    scoreContent += ` <span class="pm-score ${pmClass}">${pmText}</span>`;
                                }

                                printContent += `<td class="hole-score">${scoreContent}</td>`;
                            });

                            // 코스 합계
                            const courseTotal = courseData?.courseTotal || 0;
                            printContent += `<td class="course-total">${courseTotal}</td>`;

                            // 총타수 (첫 번째 코스에서만 표시)
                            if (courseIndex === 0) {
                                const totalText = player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-');
                                printContent += `<td rowspan="${filteredCourses.length}" class="total-score">${totalText}</td>`;
                            }

                            printContent += '</tr>';
                        });
                    } else {
                        // 선택한 코스가 이 선수에게 없는 경우
                        printContent += `
                            <tr>
                                <td class="rank-cell">${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}</td>
                                <td class="jo-cell">${player.jo}</td>
                                <td class="name-cell">${player.name}</td>
                                <td class="affiliation-cell">${player.affiliation || '-'}</td>
                                <td colspan="11" style="text-align: center; color: #64748b;">선택된 코스 데이터 없음</td>
                                <td class="total-score">${player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-')}</td>
                            </tr>
                        `;
                    }
                } else {
                    printContent += `
                        <tr>
                            <td class="rank-cell">${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}</td>
                            <td class="jo-cell">${player.jo}</td>
                            <td class="name-cell">${player.name}</td>
                            <td class="affiliation-cell">${player.affiliation}</td>
                            <td colspan="11" style="text-align: center; color: #64748b;">배정된 코스 없음</td>
                            <td class="total-score">${player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-')}</td>
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
                ${logoHtml}
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
            // 모바일에서 인쇄 대화상자가 뜨기 전에 창이 닫히는 문제 해결을 위해 close() 제거
            // 사용자가 직접 닫도록 유도
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
        // 가용한 코스 목록 추출
        const availableCourses = new Set<string>();
        Object.values(processedData).forEach(groupPlayers => {
            groupPlayers.forEach(player => {
                player.assignedCourses?.forEach((c: any) => {
                    const cName = player.coursesData[c.id]?.courseName || c.name;
                    if (cName) availableCourses.add(cName);
                });
            });
        });

        setPrintModal(prev => ({
            ...prev,
            open: true,
            orientation: 'portrait',
            paperSize: 'A4',
            selectedGroups: allGroupsList,
            showAllGroups: true,
            selectedCourses: Array.from(availableCourses).sort(),
            showAllCourses: true
        }));
    };

    // 점수표 이미지 저장
    const handleSaveImage = async () => {
        setIsSavingImage(true);
        try {
            const groupsToPrint = printModal.showAllGroups ? allGroupsList : printModal.selectedGroups;
            const totalGroups = groupsToPrint.length;
            const tournamentName = tournament.name || '골프 대회';
            const printDate = new Date().toLocaleString('ko-KR');

            if (totalGroups === 0) {
                toast({ title: "알림", description: "선택된 그룹이 없습니다." });
                setIsSavingImage(false);
                return;
            }

            toast({ title: "이미지 저장 시작", description: "인쇄용 PDF와 동일한 스타일로 저장 중..." });

            // 로고 HTML (인쇄용과 동일하게 구성)
            const logoOverlayStyle = (printModal.logoEnabled && backgroundLogoUrl) ? `
                .logo-overlay {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    display: flex; align-items: center; justify-content: center;
                    pointer-events: none; z-index: 10; overflow: hidden; /* 테이블보다 위로 */
                }
                .logo-overlay img {
                    width: ${printModal.logoSize * 100}%;
                    opacity: ${printModal.logoOpacity};
                    transform: translate(${printModal.logoOffsetX}px, ${printModal.logoOffsetY}px);
                }
            ` : '';

            // 스타일 (인쇄용 generatePrintHTML의 스타일과 완전히 일치시킴)
            const styleContent = `
                <style>
                    body { margin: 0; padding: 0; background-color: white; }
                    .print-wrapper { 
                        font-family: 'Arial', sans-serif; 
                        padding: 20px; 
                        width: 1000px; /* 고정 너비 */
                        box-sizing: border-box; 
                        position: relative; 
                        background: white;
                    }
                    ${logoOverlayStyle}
                    .print-header {
                        background: linear-gradient(135deg, #1e3a8a, #3b82f6);
                        color: white;
                        padding: 12px;
                        text-align: center;
                        margin-bottom: 15px;
                        border-radius: 8px;
                    }
                    .print-header h1 { margin: 0; font-size: 24px; font-weight: bold; }
                    .print-header p { margin: 2px 0 0 0; font-size: 14px; opacity: 0.9; }
                    
                    .group-section { margin-bottom: 25px; position: relative; z-index: 1; }
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
                        background: white;
                    }
                    .score-table th {
                        background: #f1f5f9;
                        color: #1e293b;
                        padding: 6px 2px;
                        border: 1px solid #94a3b8;
                        text-align: center;
                        font-weight: bold;
                        font-size: 13px;
                    }
                    .score-table th .header-korean { display: block; font-size: 13px; margin-bottom: 1px; }
                    .score-table th .header-english { display: block; font-size: 10px; font-weight: 500; color: #64748b; }
                    
                    .score-table td {
                        padding: 5px 4px;
                        border: 1px solid #94a3b8;
                        text-align: center;
                        vertical-align: middle;
                        font-size: 15px;
                    }
                    .score-table td.rank-cell {
                        font-weight: 800;
                        font-size: 22px;
                        color: #1e40af;
                    }
                    .stripe-row td {
                        background-color: #f8fafc !important;
                    }
                    .score-table td.name-cell {
                        font-weight: bold;
                        font-size: 16px;
                    }
                    .score-table td.course-cell {
                        font-weight: bold;
                        color: #059669;
                        font-size: 14px;
                    }
                    .score-table td.hole-score {
                        font-family: 'Courier New', monospace;
                        font-weight: bold;
                        font-size: 15px;
                    }
                    .score-table td.course-total {
                        font-weight: 800;
                        font-size: 18px;
                        color: #dc2626;
                        background-color: #fffafb !important;
                    }
                    .score-table td.total-score {
                        font-weight: 800;
                        font-size: 22px;
                        color: #1e40af;
                        background-color: #f0f7ff !important;
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
                    
                    .print-footer {
                        margin-top: 30px;
                        text-align: center;
                        color: #64748b;
                        font-size: 12px;
                        border-top: 1px solid #e2e8f0;
                        padding-top: 10px;
                    }
                </style>
            `;

            // 그룹별 반복 처리
            for (let i = 0; i < totalGroups; i++) {
                const groupName = groupsToPrint[i];
                const groupPlayers = (processedData[groupName] || []).filter((p: any) => p && (p.hasAnyScore || p.coursesData));

                if (groupPlayers.length === 0) continue;

                const sortedPlayers = [...groupPlayers].sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999));
                const groupNameEnglish = getGroupNameEnglish(groupName);
                const playersPerPage = 20; // 이미지용은 페이지당 인원을 약간 줄여 가독성 향상
                const totalPages = Math.ceil(sortedPlayers.length / playersPerPage);

                for (let pageNum = 0; pageNum < totalPages; pageNum++) {
                    const pagePlayers = sortedPlayers.slice(pageNum * playersPerPage, (pageNum + 1) * playersPerPage);

                    const container = document.createElement('div');
                    container.className = 'print-container-temp';
                    container.style.cssText = `
                        position: absolute; left: -9999px; top: 0; width: 1000px;
                        background-color: white; z-index: -1;
                    `;
                    document.body.appendChild(container);

                    let htmlContent = `
                        ${styleContent}
                        <div class="print-wrapper">
                            ${printModal.logoEnabled && backgroundLogoUrl ? `<div class="logo-overlay"><img src="${backgroundLogoUrl}" /></div>` : ''}
                            <div class="print-header">
                                <h1>🏌️‍♂️ ${tournamentName}</h1>
                                <p>생성일시: ${printDate}</p>
                            </div>
                            <div class="group-section">
                                <div class="group-title">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span>📊</span>
                                        <span>${groupName} 그룹</span>
                                        <span class="group-title-english">${groupNameEnglish}</span>
                                    </div>
                                    ${totalPages > 1 ? `<span style="font-size: 16px; color: #64748b;">(Page ${pageNum + 1}/${totalPages})</span>` : ''}
                                </div>
                                <table class="score-table">
                                    <thead>
                                        <tr>
                                            <th style="width: 60px;"><span class="header-korean">순위</span><span class="header-english">Rank</span></th>
                                            <th style="width: 50px;"><span class="header-korean">조</span><span class="header-english">Group</span></th>
                                            <th style="width: auto;"><span class="header-korean">선수명(팀명)</span><span class="header-english">Player Name</span></th>
                                            <th style="width: 120px;"><span class="header-korean">소속</span><span class="header-english">Club</span></th>
                                            <th style="width: 100px;"><span class="header-korean">코스</span><span class="header-english">Course</span></th>
                                            ${Array.from({ length: 9 }).map((_, idx) => `<th style="width: 45px;">${idx + 1}</th>`).join('')}
                                            <th style="width: 60px;"><span class="header-korean">합계</span><span class="header-english">Sum</span></th>
                                            <th style="width: 70px;"><span class="header-korean">총타수</span><span class="header-english">Total</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                    `;

                    pagePlayers.forEach((player: any, pIdx: number) => {
                        const isStripe = pIdx % 2 === 1;
                        const allCourses = player.assignedCourses || [];
                        const filteredCourses = printModal.showAllCourses
                            ? allCourses
                            : allCourses.filter((c: any) => {
                                const cName = player.coursesData[c.id]?.courseName || c.name;
                                return printModal.selectedCourses.includes(cName);
                            });

                        const rowSpan = filteredCourses.length || 1;

                        filteredCourses.forEach((course: any, courseIndex: number) => {
                            const courseData = player.coursesData[course.id];
                            const holeScores = courseData?.holeScores || Array(9).fill(null);

                            htmlContent += `<tr class="${isStripe ? 'stripe-row' : ''}">`;
                            if (courseIndex === 0) {
                                const rankText = player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '-');
                                htmlContent += `
                                    <td rowspan="${rowSpan}" class="rank-cell">${rankText}</td>
                                    <td rowspan="${rowSpan}">${player.jo}</td>
                                    <td rowspan="${rowSpan}" class="name-cell">${player.name}</td>
                                    <td rowspan="${rowSpan}">${player.affiliation || '-'}</td>
                                `;
                            }

                            htmlContent += `<td class="course-cell">${courseData?.courseName || course.name}</td>`;

                            holeScores.forEach((s: number | null, holeIdx: number) => {
                                let sContent = s !== null ? s.toString() : '-';
                                const par = (tournament.courses as any)?.[course.id]?.pars?.[holeIdx];
                                if (typeof s === 'number' && s > 0 && typeof par === 'number') {
                                    const pm = s - par;
                                    const pmText = pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm);
                                    const pmClass = pm === 0 ? 'pm-even' : (pm > 0 ? 'pm-plus' : 'pm-minus');
                                    sContent += ` <span class="pm-score ${pmClass}">${pmText}</span>`;
                                }
                                htmlContent += `<td class="hole-score">${sContent}</td>`;
                            });

                            htmlContent += `<td class="course-total">${courseData?.courseTotal || 0}</td>`;

                            if (courseIndex === 0) {
                                const totalText = player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-');
                                htmlContent += `<td rowspan="${rowSpan}" class="total-score">${totalText}</td>`;
                            }
                            htmlContent += `</tr>`;
                        });

                        if (filteredCourses.length === 0) {
                            htmlContent += `
                                <tr class="${isStripe ? 'stripe-row' : ''}">
                                    <td class="rank-cell">${player.rank ? player.rank + '위' : '-'}</td>
                                    <td>${player.jo}</td>
                                    <td class="name-cell">${player.name}</td>
                                    <td>${player.affiliation || '-'}</td>
                                    <td colspan="11" style="color: #94a3b8;">데이터 없음</td>
                                    <td class="total-score">${player.hasAnyScore ? player.totalScore : '-'}</td>
                                </tr>
                            `;
                        }
                    });

                    htmlContent += `
                                    </tbody>
                                </table>
                            </div>
                            <div class="print-footer">
                                <p>🏆 ${tournamentName} - ParkScore 공식 점수표</p>
                            </div>
                        </div>
                    `;

                    container.innerHTML = htmlContent;

                    // 이미지 생성
                    const html2canvas = (await import('html2canvas')).default;
                    const canvas = await html2canvas(container, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        width: 1000,
                        windowWidth: 1000
                    });

                    // 다운로드
                    const image = canvas.toDataURL("image/png");
                    const link = document.createElement("a");
                    link.href = image;
                    const pageSuffix = totalPages > 1 ? `_${pageNum + 1}_페이지` : '';
                    link.download = `${tournamentName}_${groupName}_점수표${pageSuffix}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    document.body.removeChild(container);

                    if (pageNum < totalPages - 1) {
                        toast({ description: `${groupName} ${pageNum + 1}/${totalPages} 저장 중...` });
                        await new Promise(resolve => setTimeout(resolve, 800));
                    }
                }

                if (i < totalGroups - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            toast({ title: "저장 완료", description: "인쇄용 결과물과 동일한 스타일로 저장이 완료되었습니다." });

        } catch (error) {
            console.error('이미지 저장 실패:', error);
            toast({ title: "저장 실패", description: "이미지 변환 중 오류가 발생했습니다.", variant: "destructive" });
        } finally {
            setIsSavingImage(false);
        }
    };

    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

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
                <DialogContent className="max-w-[100vw] w-full lg:max-w-7xl h-[100vh] lg:h-auto flex flex-col p-4 lg:p-6 mb-0 rounded-none lg:rounded-lg mt-0">
                    <DialogHeader className="flex flex-row items-center justify-between pb-4 border-b mb-0 space-y-0 shrink-0">
                        <div className="space-y-1 text-left">
                            <DialogTitle>📄 점수표 인쇄 설정</DialogTitle>
                            <DialogDescription className="hidden sm:block">
                                인쇄할 점수표의 설정을 선택해주세요.
                            </DialogDescription>
                        </div>
                        {backgroundLogoUrl && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-600 hidden sm:inline">배경 로고</span>
                                <Button
                                    size="sm"
                                    variant={printModal.logoEnabled ? 'default' : 'outline'}
                                    onClick={() => {
                                        const newEnabled = !printModal.logoEnabled;
                                        updateLogoSettings({ logoEnabled: newEnabled });
                                    }}
                                    className={`h-8 w-16 ${printModal.logoEnabled ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                                >
                                    {printModal.logoEnabled ? 'ON' : 'OFF'}
                                </Button>
                            </div>
                        )}
                    </DialogHeader>

                    <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 overflow-hidden">
                        {/* 좌측: 설정 (고정 너비) - 모바일에서는 상단에 배치하되 크기 줄임 */}
                        <div className="w-full lg:w-80 space-y-4 shrink-0 overflow-y-auto pr-2 pb-4 lg:pb-0 h-auto max-h-[40vh] lg:max-h-none border-b lg:border-b-0 lg:border-r">
                            {/* 인쇄 방향 선택 */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">인쇄 방향</label>
                                <div className="flex gap-2">
                                    <Button
                                        variant={printModal.orientation === 'portrait' ? 'default' : 'outline'}
                                        onClick={() => setPrintModal({ ...printModal, orientation: 'portrait' })}
                                        className="flex-1 h-9 text-sm"
                                    >
                                        세로
                                    </Button>
                                    <Button
                                        variant={printModal.orientation === 'landscape' ? 'default' : 'outline'}
                                        onClick={() => setPrintModal({ ...printModal, orientation: 'landscape' })}
                                        className="flex-1 h-9 text-sm"
                                    >
                                        가로
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
                                        className="flex-1 h-9 text-sm"
                                    >
                                        A4
                                    </Button>
                                    <Button
                                        variant={printModal.paperSize === 'A3' ? 'default' : 'outline'}
                                        onClick={() => setPrintModal({ ...printModal, paperSize: 'A3' })}
                                        className="flex-1 h-9 text-sm"
                                    >
                                        A3
                                    </Button>
                                </div>
                            </div>

                            {/* 인쇄할 그룹 선택 */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">인쇄할 그룹</label>
                                <div className="space-y-2 max-h-[120px] lg:max-h-[25vh] overflow-y-auto border rounded p-2">
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
                                        <span className="text-xs text-muted-foreground ml-2">({allGroupsList.length}개)</span>
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

                            {/* 출력할 코스 선택 */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">출력할 코스 선택</label>
                                <div className="space-y-2 border rounded p-2 max-h-[120px] lg:max-h-[25vh] overflow-y-auto">
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={printModal.showAllCourses}
                                            onChange={(e) => {
                                                const availableCourses = new Set<string>();
                                                Object.values(processedData).forEach(groupPlayers => {
                                                    groupPlayers.forEach(player => {
                                                        player.assignedCourses?.forEach((c: any) => {
                                                            const cName = player.coursesData[c.id]?.courseName || c.name;
                                                            if (cName) availableCourses.add(cName);
                                                        });
                                                    });
                                                });

                                                if (e.target.checked) {
                                                    setPrintModal({
                                                        ...printModal,
                                                        showAllCourses: true,
                                                        selectedCourses: Array.from(availableCourses).sort()
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
                                                const availableCourses = new Set<string>();
                                                Object.values(processedData).forEach(groupPlayers => {
                                                    groupPlayers.forEach(player => {
                                                        player.assignedCourses?.forEach((c: any) => {
                                                            const cName = player.coursesData[c.id]?.courseName || c.name;
                                                            if (cName) availableCourses.add(cName);
                                                        });
                                                    });
                                                });
                                                return Array.from(availableCourses).sort().map((courseName) => (
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

                        {/* 중앙: 미리보기 + 우측 패널 */}
                        <div className="hidden lg:flex flex-1 min-w-0 border rounded-lg p-4 bg-gray-50 flex-col">
                            <div className="flex items-center justify-between mb-2 shrink-0">
                                <label className="text-sm font-medium">미리보기</label>
                            </div>

                            <div className="flex gap-4 h-full min-h-0">
                                {/* Preview Box */}
                                <div className="flex-1 border rounded bg-gray-100 p-4 flex items-center justify-center overflow-hidden relative">
                                    <div
                                        className="bg-white shadow-lg relative transition-all duration-300 origin-center"
                                        style={{
                                            aspectRatio: printModal.orientation === 'portrait' ? '210/297' : '297/210',
                                            height: '100%',
                                            maxHeight: '450px',
                                            width: 'auto',
                                            position: 'relative',
                                            backgroundImage: (printModal.logoEnabled && backgroundLogoUrl) ? `url('${backgroundLogoUrl}')` : 'none',
                                            backgroundRepeat: 'no-repeat',
                                            backgroundPosition: `calc(50% + ${printModal.logoOffsetX}px) calc(50% + ${printModal.logoOffsetY}px)`,
                                            backgroundSize: `${printModal.logoSize * 100}% auto`,
                                            opacity: 1 // 미리보기는 투명도 적용 안 함 (배경만)
                                        }}
                                    >
                                        {/* 로고 오버레이 (실제 인쇄와 동일하게) */}
                                        {printModal.logoEnabled && backgroundLogoUrl && (
                                            <div style={{
                                                position: 'absolute',
                                                top: 0, left: 0, right: 0, bottom: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                zIndex: 0, pointerEvents: 'none', overflow: 'hidden'
                                            }}>
                                                <img src={backgroundLogoUrl} style={{
                                                    width: `${printModal.logoSize * 100}%`,
                                                    opacity: printModal.logoOpacity,
                                                    transform: `translate(${printModal.logoOffsetX}px, ${printModal.logoOffsetY}px)`
                                                }} />
                                            </div>
                                        )}

                                        {/* Scaled Content - zoom 속성 활용 */}
                                        <div style={{
                                            zoom: 0.35,
                                            width: '100%',
                                            height: '100%',
                                            position: 'relative',
                                            zIndex: 1,
                                            padding: '20px',
                                            overflow: 'hidden'
                                        }}>
                                            <div className="text-center mb-10">
                                                <div className="bg-blue-600 text-white p-6 rounded-lg mb-6 shadow-sm">
                                                    <div className="text-3xl font-bold mb-2">⛳ {tournament.name || 'Park Golf Championship'}</div>
                                                    <div className="text-xl opacity-90">인쇄일시: {new Date().toLocaleString('ko-KR')}</div>
                                                </div>
                                                <div className="text-left mb-4 px-2">
                                                    <span className="text-2xl font-bold text-slate-700">📊 {allGroupsList[0] || '그룹명'}</span>
                                                </div>

                                                {/* Dummy Table Visualization */}
                                                <div className="border border-slate-200 mt-4 rounded-sm overflow-hidden">
                                                    <div className="bg-slate-100 p-3 border-b border-slate-200 grid grid-cols-12 gap-2">
                                                        <div className="col-span-1 font-bold text-slate-500">순위</div>
                                                        <div className="col-span-2 font-bold text-slate-500">이름</div>
                                                        <div className="col-span-9 font-bold text-slate-500">점수...</div>
                                                    </div>
                                                    {Array.from({ length: 8 }).map((_, i) => (
                                                        <div key={i} className="p-3 border-b border-slate-100 grid grid-cols-12 gap-2 text-sm text-slate-600">
                                                            <div className="col-span-1">{i + 1}</div>
                                                            <div className="col-span-2">홍길동</div>
                                                            <div className="col-span-9">...</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="text-lg text-gray-400 text-center mt-10">
                                                (미리보기 - 실제 인쇄 결과와 유사한 비율입니다)
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 우측: 로고 설정 패널 (ON일 때만 표시, 세로 배치) */}
                                {printModal.logoEnabled && backgroundLogoUrl && (
                                    <div className="w-64 shrink-0 space-y-4 border-l pl-4 overflow-y-auto hidden lg:block">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-semibold text-sm">로고 상세 설정</h4>
                                        </div>

                                        <div className="space-y-6">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">로고 크기 ({Math.round(printModal.logoSize * 100)}%)</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="range"
                                                        min="0.1"
                                                        max="1.0"
                                                        step="0.05"
                                                        value={printModal.logoSize}
                                                        onChange={(e) => {
                                                            const val = Number(e.target.value);
                                                            updateLogoSettings({ logoSize: val });
                                                        }}
                                                        className="flex-1 h-8"
                                                    />
                                                </div>
                                                <Input
                                                    type="number"
                                                    min="0.1"
                                                    max="1.0"
                                                    step="0.05"
                                                    value={printModal.logoSize}
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
                                                <Label className="text-xs font-medium">로고 진하기 ({Math.round(printModal.logoOpacity * 100)}%)</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="range"
                                                        min="0.0"
                                                        max="1.0"
                                                        step="0.01"
                                                        value={printModal.logoOpacity}
                                                        onChange={(e) => {
                                                            const val = Number(e.target.value);
                                                            updateLogoSettings({ logoOpacity: val });
                                                        }}
                                                        className="flex-1 h-8"
                                                    />
                                                </div>
                                                <Input
                                                    type="number"
                                                    min="0.0"
                                                    max="1.0"
                                                    step="0.01"
                                                    value={printModal.logoOpacity}
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
                                                <Label className="text-xs font-medium">가로 위치 ({printModal.logoOffsetX}px)</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="range"
                                                        min="-100" // 범위 확장
                                                        max="100"
                                                        step="1"
                                                        value={printModal.logoOffsetX}
                                                        onChange={(e) => {
                                                            const val = Number(e.target.value);
                                                            updateLogoSettings({ logoOffsetX: val });
                                                        }}
                                                        className="flex-1 h-8"
                                                    />
                                                </div>
                                                <Input
                                                    type="number"
                                                    min="-100"
                                                    max="100"
                                                    step="1"
                                                    value={printModal.logoOffsetX}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value);
                                                        updateLogoSettings({ logoOffsetX: val });
                                                    }}
                                                    className="w-full text-xs h-8"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">세로 위치 ({printModal.logoOffsetY}px)</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="range"
                                                        min="-100" // 범위 확장
                                                        max="100"
                                                        step="1"
                                                        value={printModal.logoOffsetY}
                                                        onChange={(e) => {
                                                            const val = Number(e.target.value);
                                                            updateLogoSettings({ logoOffsetY: val });
                                                        }}
                                                        className="flex-1 h-8"
                                                    />
                                                </div>
                                                <Input
                                                    type="number"
                                                    min="-100"
                                                    max="100"
                                                    step="1"
                                                    value={printModal.logoOffsetY}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value);
                                                        updateLogoSettings({ logoOffsetY: val });
                                                    }}
                                                    className="w-full text-xs h-8"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 shrink-0 mt-4 border-t pt-4">
                        <Button variant="outline" onClick={() => setPrintModal({ ...printModal, open: false })} className="mt-2 sm:mt-0 h-11 sm:h-10">
                            취소
                        </Button>
                        <Button
                            variant="outline"
                            onClick={showPreview}
                            className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto hidden sm:inline-flex"
                            disabled={!printModal.showAllGroups && printModal.selectedGroups.length === 0}
                        >
                            👁️ 미리보기
                        </Button>
                        <Button
                            onClick={isMobile ? executePrint : handleSaveImage}
                            className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto h-11 sm:h-10"
                            disabled={(!printModal.showAllGroups && printModal.selectedGroups.length === 0) || isSavingImage}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            {isMobile ? 'PDF 다운로드 (권장)' : (isSavingImage ? '변환 중...' : '📸 점수표 이미지 저장')}
                        </Button>
                        <Button
                            onClick={executePrint}
                            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto h-11 sm:h-10"
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
