"use client"
import React, { useEffect, useState, useMemo, useRef, useCallback, useTransition } from 'react';
import { db, ensureAuthenticated } from '@/lib/firebase';
import { ref, onValue, onChildChanged, onChildAdded, onChildRemoved, off, query, get } from 'firebase/database';
import { Flame, ChevronUp, ChevronDown, Globe, Palette, Maximize, Minimize } from 'lucide-react';
import { cn, safeLocalStorageGetItem, safeLocalStorageSetItem } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import GiftEventDisplay from '@/components/gift-event/GiftEventDisplay';
import GiftEventStandby from '@/components/gift-event/GiftEventStandby';
import { getPlayerScoreLogs, getPlayerScoreLogsOptimized, ScoreLog, invalidatePlayerLogCache } from '@/lib/scoreLogs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import './scoreboard.css';

// 다국어 번역 객체
const translations = {
    ko: {
        progress: '진행',
        total: '전체',
        group: '조',
        playerName: '선수명(팀명)',
        club: '소속',
        course: '코스',
        sum: '합계',
        totalScore: '총타수',
        rank: '순위',
        rankSuffix: '위',
        selectGroup: '그룹 선택',
        viewAllGroups: '모든 그룹 보기',
        language: '언어',
        korean: '한글',
        english: 'English',
        cycle: '순환',
        noData: '표시할 선수 데이터가 없습니다. 선수를 먼저 등록해주세요.',
        noCourse: '그룹에 배정된 코스가 없거나, 표시하도록 설정된 코스가 없습니다.',
        noGroupData: '그룹에 표시할 데이터가 없습니다.',
        loading: '전광판 데이터를 불러오는 중입니다...',
        suddenDeathIndividual: '개인전 서든데스 플레이오프',
        suddenDeathTeam: '2인 1팀 서든데스 플레이오프',
        hole: '홀',
        forfeit: '기권',
        absent: '불참',
        disqualified: '실격',
        noCourseDisplay: '표시하도록 설정된 코스가 없습니다.',
        theme: '테마',
        light: '라이트 모드',
        grey: '회색 모드',
        dark: '다크 모드',
    },
    en: {
        progress: 'Progress',
        total: 'Total',
        group: 'Group',
        playerName: 'Player (Team)',
        club: 'Club',
        course: 'Course',
        sum: 'Sum',
        totalScore: 'Total',
        rank: 'Rank',
        rankSuffix: '',
        selectGroup: 'Select Group',
        viewAllGroups: 'View All Groups',
        language: 'Language',
        korean: '한글',
        english: 'English',
        cycle: 'Cycle',
        noData: 'No player data available. Please register players first.',
        noCourse: 'No courses assigned to the group or no courses set to display.',
        noGroupData: 'No data available for the selected group.',
        loading: 'Loading scoreboard data...',
        suddenDeathIndividual: 'Individual Sudden Death Playoff',
        suddenDeathTeam: 'Team Sudden Death Playoff',
        hole: 'Hole',
        forfeit: 'Forfeit',
        absent: 'Absent',
        disqualified: 'DQ',
        noCourseDisplay: 'No courses set to display.',
        theme: 'Theme',
        light: 'Light Mode',
        grey: 'Grey Mode',
        dark: 'Dark Mode',
    }
};

// 그룹명 번역 맵 (한글 -> 영어)
const groupTranslations: { [key: string]: string } = {
    '남자부': 'Men\'s Division',
    '여자부': 'Women\'s Division',
    '남자 시니어부': 'Men\'s Senior',
    '여자 시니어부': 'Women\'s Senior',
    '일반부': 'General Division',
    '부부대항': 'Couples',
    '혼성2인': 'Mixed Doubles',
    '개인전': 'Individual',
    '단체전': 'Team',
    '남자': 'Men',
    '여자': 'Women',
    '시니어': 'Senior',
};

// 그룹명 번역 헬퍼 함수
const translateGroupName = (name: string, lang: 'ko' | 'en'): string => {
    if (lang === 'ko') return name;
    return groupTranslations[name] || name;
};

// 순위 표시 함수 (영어: 1st, 2nd, 3rd... / 한글: 1위, 2위, 3위...)
const formatRank = (rank: number, lang: 'ko' | 'en'): string => {
    if (lang === 'ko') {
        return `${rank}위`;
    }
    // 영어 서수 표현
    if (rank === 1) return '1st';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return `${rank}th`;
};



interface ProcessedPlayer {
    id: string;
    jo: number;
    name: string;
    club: string;
    group: string;
    type: 'individual' | 'team';
    totalScore: number;
    rank: number | null;
    hasAnyScore: boolean;
    hasForfeited: boolean;
    forfeitType?: 'absent' | 'disqualified' | 'forfeit' | string;
    coursesData: {
        [courseId: string]: {
            courseName: string;
            courseTotal: number;
            holeScores: (number | null)[];
        }
    };
    total: number;
    courseScores: { [courseId: string]: number };
    detailedScores: { [courseId: string]: { [holeNumber: string]: number } };
    assignedCourses: any[];
    allAssignedCourses: any[]; // 전체 배정 코스(온오프 무관)
}

// 로그를 빠르게 찾기 위한 인터페이스
interface ScoreLogMap {
    [playerId: string]: {
        [courseId: string]: {
            [holeNumber: number]: ScoreLog;
        };
    };
}

const tieBreak = (a: any, b: any, sortedCourses: any[]) => {
    if (a.hasForfeited && !b.hasForfeited) return 1;
    if (!a.hasForfeited && b.hasForfeited) return -1;

    if (!a.hasAnyScore && !b.hasAnyScore) return 0;
    if (!a.hasAnyScore) return 1;
    if (!b.hasAnyScore) return -1;

    if (a.total !== b.total) {
        return a.total - b.total;
    }

    for (const course of sortedCourses) {
        const courseId = course.id;
        const aCourseScore = a.courseScores[courseId] || 0;
        const bCourseScore = b.courseScores[courseId] || 0;
        if (aCourseScore !== bCourseScore) {
            return aCourseScore - bCourseScore;
        }
    }

    // 홀별 백카운트: 마지막 코스부터 역순으로 각 코스의 홀 점수 비교
    // 모든 홀 점수가 0이면 다음 코스로 넘어감
    if (sortedCourses.length > 0) {
        for (const course of sortedCourses) {
            const courseId = course.id;
            const aHoleScores = a.detailedScores[courseId] || {};
            const bHoleScores = b.detailedScores[courseId] || {};
            let hasNonZeroScore = false;

            // 9번 홀부터 1번 홀까지 역순으로 비교
            for (let i = 9; i >= 1; i--) {
                const hole = i.toString();
                const aHole = aHoleScores[hole] || 0;
                const bHole = bHoleScores[hole] || 0;

                // 0이 아닌 점수가 있으면 이 코스에서 비교 진행
                if (aHole > 0 || bHole > 0) {
                    hasNonZeroScore = true;
                }

                // 점수가 다르면 비교 결과 반환
                if (aHole !== bHole) {
                    return aHole - bHole;
                }
            }

            // 이 코스의 모든 홀 점수가 0이면 다음 코스로 넘어감
            // hasNonZeroScore가 false면 모두 0이므로 다음 코스 확인
            if (hasNonZeroScore) {
                // 이 코스에 점수가 있었는데 모두 같으면 다음 코스로
                // (이미 위에서 차이를 확인했으므로 여기 도달하면 모두 같음)
                break;
            }
        }
    }

    return 0;
};

// Par 계산 함수
function getParForHole(tournament: any, courseId: string, holeIdx: number) {
    const course = tournament?.courses?.[courseId];
    if (!course || !Array.isArray(course.pars)) return null;
    return course.pars[holeIdx] ?? null;
}

// 코스별 합계 및 ±타수 계산 함수
function getCourseSumAndPlusMinus(tournament: any, course: any, holeScores: (number | null)[]) {
    let sum = 0;
    let parSum = 0;
    if (!course || !Array.isArray(course.pars)) return { sum: 0, pm: null };
    for (let i = 0; i < 9; i++) {
        const score = holeScores[i];
        const par = course.pars[i] ?? null;
        if (score !== null && score !== undefined && par !== null && par !== undefined) {
            sum += score;
            parSum += par;
        }
    }
    return { sum, pm: parSum > 0 ? sum - parSum : null };
}

// getPlayerTotalAndPlusMinusAllCourses 함수 추가 (assignedCourses가 아니라 전체 배정 코스 기준)
function getPlayerTotalAndPlusMinusAllCourses(tournament: any, player: any, allAssignedCourses: any[]) {
    let total = 0;
    let parTotal = 0;
    let playedHoles = 0;
    allAssignedCourses.forEach((course: any) => {
        const courseData = tournament?.courses?.[course.id];
        const scoresForCourse = (player.detailedScores?.[course.id]) || {};
        if (courseData && Array.isArray(courseData.pars)) {
            for (let i = 0; i < 9; i++) {
                const score = scoresForCourse[(i + 1).toString()];
                const par = courseData.pars[i] ?? null;
                if (score !== null && score !== undefined && par !== null && par !== undefined) {
                    total += score;
                    parTotal += par;
                    playedHoles++;
                }
            }
        }
    });
    return playedHoles > 0 ? { total, pm: total - parTotal } : { total: 0, pm: null };
}

export default function ScoreboardPage() {
    const [giftEventStatus, setGiftEventStatus] = useState<string>('');
    const [giftEventData, setGiftEventData] = useState<any>({});
    const [isRedirecting, setIsRedirecting] = useState(false);

    // 인앱 브라우저 강제 탈출 (카카오톡 등에서 외부 브라우저로 열기)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const userAgent = navigator.userAgent.toLowerCase();
        const targetUrl = window.location.href;

        // 1. 카카오톡 인앱 브라우저 감지
        if (userAgent.match(/kakaotalk/i)) {
            setIsRedirecting(true);
            // 카카오톡 외부 브라우저 호출 (kakaotalk://web/openExternal)
            window.location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(targetUrl);
            return;
        }

        // 2. 라인 인앱 브라우저 감지
        if (userAgent.match(/line/i)) {
            setIsRedirecting(true);
            const separator = targetUrl.includes('?') ? '&' : '?';
            window.location.href = `${targetUrl}${separator}openExternalBrowser=1`;
            return;
        }

        // 3. 기타 인앱 브라우저 감지
        if (userAgent.match(/inapp|naver|snapchat|wirtschaftswoche|thunderbird|instagram|everytimeapp|whatsApp|electron|wadiz|aliapp|zumapp|iphone(.*)whale|android(.*)whale|kakaostory|band|twitter|DaumApps|DaumDevice\/mobile|FB_IAB|FB4A|FBAN|FBIOS|FBSS|SamsungBrowser\/[^1]/i)) {
            if (userAgent.match(/android/i)) {
                setIsRedirecting(true);
                const cleanUrl = targetUrl.replace(/https?:\/\//i, '');
                const scheme = `intent://${cleanUrl}#Intent;scheme=http;package=com.android.chrome;end`;
                window.location.href = scheme;
            }
        }
    }, []);



    useEffect(() => {
        if (!db) return;

        const giftEventRef = ref(db, 'giftEvent');
        const unsub = onValue(giftEventRef, snap => {
            const data = snap.val() || {};
            setGiftEventStatus(data.status || '');
            setGiftEventData(data);
        });
        return () => unsub();
    }, []);



    if (isRedirecting) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white p-4 font-bold text-lg text-center break-keep">카카오 화면이 작아서<br />구글 크롬으로 안전하게 엽니다</div>;
    }

    if (giftEventStatus === 'waiting') {
        return <GiftEventStandby />;
    }
    if (giftEventStatus === 'started' || giftEventStatus === 'running' || giftEventStatus === 'drawing' || giftEventStatus === 'winner') {
        return <GiftEventDisplay />;
    }
    // 점수표 기본 화면
    return <ExternalScoreboard />;
}

// 기권 타입을 로그에서 추출하는 함수
const getForfeitTypeFromLogs = (logs: ScoreLog[]): 'absent' | 'disqualified' | 'forfeit' | null => {
    // 가장 최근의 기권 처리 로그를 찾음 (심판과 관리자 모두 포함)
    const forfeitLogs = logs
        .filter(l => l.newValue === 0 && (l.modifiedByType === 'judge' || l.modifiedByType === 'admin') && l.comment)
        .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬

    if (forfeitLogs.length === 0) return null;

    const latestLog = forfeitLogs[0];
    if (latestLog.comment?.includes('불참')) return 'absent';
    if (latestLog.comment?.includes('실격')) return 'disqualified';
    if (latestLog.comment?.includes('기권')) return 'forfeit';

    return null;
};

// 서든데스 테이블 컴포넌트 (메모이제이션 적용)
const SuddenDeathTable = React.memo(({
    type,
    data,
    processedData,
    t,
    tournament,
    currentLang
}: {
    type: 'individual' | 'team',
    data: any,
    processedData: any[],
    t: any,
    tournament: any,
    currentLang: 'ko' | 'en'
}) => {
    const title = type === 'individual' ? t('suddenDeathIndividual') : t('suddenDeathTeam');
    const courseName = data?.courseId && tournament?.courses?.[data.courseId]?.name;

    return (
        <div className="mb-6">
            <header className="flex flex-col justify-center items-center sb-group-header pb-2 mb-2 text-center">
                <h1 className="text-2xl md:text-4xl font-bold sb-title flex items-center gap-3">
                    <Flame className="h-8 w-8 animate-pulse" />
                    {title}
                    <Flame className="h-8 w-8 animate-pulse" />
                </h1>
                {courseName && (
                    <p className="text-lg md:text-xl font-semibold text-gray-400 mt-1">
                        ({courseName})
                    </p>
                )}
            </header>
            <div className="overflow-x-auto rounded-lg border-2 border-[color:var(--sb-border-color)]">
                <table className="w-full text-center border-collapse sb-table">
                    <thead className="sb-table-head text-base">
                        <tr className="sb-th">
                            <th className="py-2 px-2 w-48 text-center align-middle font-bold sb-th">{t('playerName')}</th>
                            <th className="py-2 px-2 w-48 text-center align-middle font-bold sb-th">{t('club')}</th>
                            {data.holes?.sort((a: number, b: number) => a - b).map((hole: number) => <th key={hole} className="py-2 px-2 w-16 text-center align-middle font-bold sb-th">{hole}{currentLang === 'ko' ? '홀' : ''}</th>)}
                            <th className="py-2 px-2 min-w-[5rem] text-center align-middle font-bold sb-th">{t('sum')}</th>
                            <th className="py-2 px-2 min-w-[5rem] text-center align-middle font-bold">{t('rank')}</th>
                        </tr>
                    </thead>
                    <tbody className="text-xl">
                        {processedData.map((player, playerIndex) => (
                            <tr key={player.id} className={cn("border-b border-[color:var(--sb-cell-border)] last:border-0", playerIndex % 2 === 1 && "sb-tr-alt")}>
                                <td className="py-1 px-2 text-center align-middle font-semibold sb-td sb-td-info">{player.name}</td>
                                <td className="py-1 px-2 text-center align-middle opacity-70 sb-td sb-td-info">{player.club}</td>
                                {data.holes.map((hole: number) => <td key={hole} className="py-1 px-2 align-middle font-mono font-bold text-2xl sb-td">{player.scoresPerHole[hole] ?? '-'}</td>)}
                                <td className="py-1 px-2 align-middle font-bold text-2xl sb-td">{player.totalScore}</td>
                                <td className="py-1 px-2 align-middle font-bold sb-rank text-2xl">{formatRank(player.rank, currentLang)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});
SuddenDeathTable.displayName = 'SuddenDeathTable';

// 메인 스코어보드 테이블 컴포넌트 (메모이제이션 적용)
const ScoreboardTable = React.memo(({
    groupName,
    groupPlayers,
    tournament,
    scores,
    currentLang,
    playerScoreLogs,
    t,
    translateGroupName,
    translateCourseName,
    groupProgressValue,
    isMobile
}: {
    groupName: string;
    groupPlayers: ProcessedPlayer[];
    tournament: any;
    scores: any;
    currentLang: 'ko' | 'en';
    playerScoreLogs: { [playerId: string]: ScoreLog[] };
    t: any;
    translateGroupName: any;
    translateCourseName: any;
    groupProgressValue: number;
    isMobile: boolean;
}) => {
    // 그룹별 현재 진행중인 코스와 진행률 계산 함수 (컴포넌트 내부 최적화)
    const { courseName, progress } = useMemo(() => {
        if (!groupPlayers || groupPlayers.length === 0) return { courseName: null, progress: null };
        const playerGroupData = tournament?.groups?.[groupName];
        const allCourses = Object.values(tournament?.courses || {}).filter(Boolean);
        const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter((id: string) => playerGroupData.courses[id]) : [];
        const coursesForGroup = allCourses.filter((c: any) => assignedCourseIds.includes(c.id.toString()) && c.isActive !== false);
        if (!coursesForGroup || coursesForGroup.length === 0) return { courseName: null, progress: null };

        let currentCourse: any = null;
        let currentProgress: number | null = null;

        for (const course of coursesForGroup as any[]) {
            let totalScoresEntered = 0;
            groupPlayers.forEach((player: any) => {
                const scoresForCourse = (scores as any)[player.id]?.[course.id];
                if (scoresForCourse) {
                    totalScoresEntered += Object.keys(scoresForCourse).length;
                }
            });
            const totalPossible = groupPlayers.length * 9;
            if (totalScoresEntered < totalPossible) {
                currentCourse = course;
                currentProgress = Math.round((totalScoresEntered / totalPossible) * 100);
                break;
            }
        }

        if (!currentCourse) {
            currentCourse = coursesForGroup[coursesForGroup.length - 1];
            let totalScoresEntered = 0;
            groupPlayers.forEach((player: any) => {
                const scoresForCourse = (scores as any)[player.id]?.[currentCourse.id];
                if (scoresForCourse) {
                    totalScoresEntered += Object.keys(scoresForCourse).length;
                }
            });
            const totalPossible = groupPlayers.length * 9;
            currentProgress = Math.round((totalScoresEntered / totalPossible) * 100);
        }

        return { courseName: currentCourse?.name || null, progress: currentProgress };
    }, [groupName, groupPlayers, tournament, scores]);

    return (
        <div className="mb-8">
            <header className="flex justify-between items-baseline sb-group-header">
                <h1 className="text-xl md:text-2xl font-bold sb-title">
                    {tournament.name || '파크골프 토너먼트'} ({translateGroupName(groupName, currentLang)})
                </h1>
                <div className="text-xl md:text-2xl font-bold sb-progress-text">
                    {courseName && progress !== null ? (
                        <span>{translateCourseName(courseName)}: {progress}% {t('progress')}&nbsp;|&nbsp;{t('total')}: {groupProgressValue}% {t('progress')}</span>
                    ) : (
                        <span>{t('total')}: {groupProgressValue}% {t('progress')}</span>
                    )}
                </div>
            </header>
            <div className="overflow-x-auto">
                <TooltipProvider delayDuration={0}>
                    <table className="w-full text-center border-collapse sb-table">
                        <thead className="sb-table-head text-sm">
                            <tr>
                                <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold sb-th w-12">{t('group')}</th>
                                <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold sb-th w-28 md:w-32 lg:w-36">{t('playerName')}</th>
                                <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold sb-th w-20 md:w-24 lg:w-28">{t('club')}</th>
                                <th rowSpan={2} className="py-1 px-1 text-center align-middle font-bold sb-th w-16 md:w-20 lg:w-24">{t('course')}</th>
                                <th colSpan={9} className="py-1 px-1 text-center align-middle font-bold sb-th w-auto">HOLE</th>
                                <th rowSpan={2} className="py-1 px-1 min-w-[4rem] text-center align-middle font-bold sb-th">{t('sum')}</th>
                                <th rowSpan={2} className="py-1 px-1 min-w-[4rem] text-center align-middle font-bold sb-th sb-rank-gold">{t('totalScore')}</th>
                                <th rowSpan={2} className="py-1 px-1 min-w-[4rem] text-center align-middle font-bold">{t('rank')}</th>
                            </tr>
                            <tr className="border-b border-[color:var(--sb-border-color)]">
                                {Array.from({ length: 9 }).map((_, i) => <th key={i} className={`py-1 px-1 font-bold text-base align-middle sb-th sb-th-hole min-w-[2.5rem]`}>{i + 1}</th>)}
                            </tr>
                        </thead>
                        <tbody className="text-base">
                            {groupPlayers.map((player: ProcessedPlayer, playerIndex: number) => (
                                <React.Fragment key={player.id}>
                                    {player.assignedCourses.length > 0 ? player.assignedCourses.map((course: any, courseIndex: number) => (
                                        <tr key={`${player.id}-${course.id}`} className={cn("border-b border-[color:var(--sb-cell-border)] last:border-0", playerIndex % 2 === 1 && "sb-tr-alt")}>
                                            {courseIndex === 0 && (
                                                <>
                                                    <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 align-middle font-bold sb-td sb-td-info w-12 truncate">{player.jo}</td>
                                                    <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 text-center align-middle font-semibold sb-td sb-td-info w-28 md:w-32 lg:w-36 truncate">{player.name}</td>
                                                    <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 text-center align-middle opacity-70 sb-td sb-td-info w-20 md:w-24 lg:w-28 truncate">{player.club}</td>
                                                </>
                                            )}
                                            <td className="py-0.5 px-1 align-middle font-bold sb-td opacity-70 w-16 md:w-20 lg:w-24 truncate">{translateCourseName(course.name)}</td>
                                            {Array.from({ length: 9 }).map((_, i) => {
                                                const holeNum = i + 1;
                                                const holeScore = player.coursesData[course.id]?.holeScores[i];
                                                const par = getParForHole(tournament, course.id, i);

                                                // 수정된 점수인지 확인 (scoreLogs 활용)
                                                // playerScoreLogs: { [playerId: string]: ScoreLog[] }
                                                const logs = playerScoreLogs[player.id] || [];
                                                // course.id 타입 불일치 방지 및 상세 조건 적용
                                                const holeLog = logs.find(l => String(l.courseId) === String(course.id) && Number(l.holeNumber) === holeNum);
                                                // 실제로 수정된 경우만 표시 (oldValue와 newValue가 다르고, 0점이 아닌 경우 - AdminDashboard 기준)
                                                const isModified = !!holeLog && holeLog.oldValue !== holeLog.newValue && holeLog.oldValue !== 0;

                                                let cellContent: string | JSX.Element = holeScore !== null ? holeScore.toString() : '-';

                                                if (holeScore !== null && par !== null) {
                                                    const diff = holeScore - par;
                                                    let scoreClass = "";
                                                    if (diff < 0) scoreClass = "sb-score-minus";
                                                    else if (diff > 0) scoreClass = "sb-score-plus";
                                                    else scoreClass = "sb-score-zero";

                                                    cellContent = (
                                                        <div className="flex flex-col items-center justify-center leading-none">
                                                            <span className={cn("text-2xl font-mono font-bold", isModified && "sb-score-modified")}>{holeScore}</span>
                                                            <span className={cn("text-[0.6rem] font-bold", scoreClass)} style={{ marginTop: '-2px' }}>
                                                                {diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : diff)}
                                                            </span>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <td
                                                        key={i}
                                                        className={cn(
                                                            "py-0.5 px-1 align-middle sb-td",
                                                            isModified ? 'sb-score-plus font-bold cursor-pointer' : ''
                                                        )}
                                                        style={{
                                                            userSelect: 'none',
                                                            WebkitUserSelect: 'none',
                                                            WebkitTouchCallout: 'none'
                                                        }}
                                                    >
                                                        {isModified ? (
                                                            isMobile ? (
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <div className="w-full h-full flex items-center justify-center">
                                                                            {cellContent}
                                                                        </div>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="sb-tooltip-content">
                                                                        <div className="text-xs">
                                                                            <p className="font-bold border-b border-gray-600 pb-1 mb-1">
                                                                                {holeLog.modifiedByType === 'admin' ? '관리자 수정' :
                                                                                    holeLog.modifiedByType === 'captain' ? (holeLog.modifiedBy || '조장 수정') :
                                                                                        (holeLog.modifiedBy || '심판 수정')}
                                                                            </p>
                                                                            <p>{new Date(holeLog.modifiedAt).toLocaleString()}</p>
                                                                            <p className="mt-1 font-bold text-red-500">
                                                                                점수: {holeLog.oldValue} ➔ {holeLog.newValue}
                                                                            </p>
                                                                            {holeLog.comment && <p className="mt-1 opacity-80 decoration-0">{holeLog.comment}</p>}
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            ) : (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <div className="w-full h-full flex items-center justify-center">
                                                                            {cellContent}
                                                                        </div>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent className="sb-tooltip-content">
                                                                        <div className="text-xs">
                                                                            <p className="font-bold border-b border-gray-600 pb-1 mb-1">
                                                                                {holeLog.modifiedByType === 'admin' ? '관리자 수정' :
                                                                                    holeLog.modifiedByType === 'captain' ? (holeLog.modifiedBy || '조장 수정') :
                                                                                        (holeLog.modifiedBy || '심판 수정')}
                                                                            </p>
                                                                            <p>{new Date(holeLog.modifiedAt).toLocaleString()}</p>
                                                                            <p className="mt-1 font-bold text-red-500">
                                                                                점수: {holeLog.oldValue} ➔ {holeLog.newValue}
                                                                            </p>
                                                                            {holeLog.comment && <p className="mt-1 opacity-80 decoration-0">{holeLog.comment}</p>}
                                                                        </div>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            )
                                                        ) : cellContent}
                                                    </td>
                                                );
                                            })}
                                            {(() => {
                                                let courseSumElem: string | JSX.Element = '-';
                                                if (player.hasAnyScore && !player.hasForfeited) {
                                                    const courseData = tournament?.courses?.[course.id];
                                                    const { sum, pm } = getCourseSumAndPlusMinus(tournament, courseData, player.coursesData[course.id]?.holeScores || []);
                                                    courseSumElem = (
                                                        <span>
                                                            {sum}
                                                            {pm !== null && (
                                                                <span className={cn("ml-1 align-middle text-xs", pm < 0 ? "sb-score-minus" : pm > 0 ? "sb-score-plus" : "sb-score-zero")} style={{ fontSize: '0.7em', fontWeight: 600 }}>
                                                                    {pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm)}
                                                                </span>
                                                            )}
                                                        </span>
                                                    );
                                                } else if (player.hasForfeited) {
                                                    let foundType: string = player.forfeitType || 'forfeit';
                                                    if (!player.forfeitType) {
                                                        const logs = playerScoreLogs[player.id] || [];
                                                        for (const l of logs) {
                                                            if (l.newValue === 0 && (l.modifiedByType === 'judge' || l.modifiedByType === 'admin')) {
                                                                if (l.comment?.includes('불참')) { foundType = 'absent'; break; }
                                                                if (l.comment?.includes('실격')) { foundType = 'disqualified'; break; }
                                                                if (l.comment?.includes('기권')) { foundType = 'forfeit'; break; }
                                                            }
                                                        }
                                                    }
                                                    courseSumElem = t(foundType as any);
                                                }
                                                return <td className={cn("py-0.5 px-1 align-middle font-bold sb-td opacity-80", player.hasForfeited ? 'text-xs' : 'text-xl')}>{courseSumElem}</td>;
                                            })()}
                                            {courseIndex === 0 && (
                                                <>
                                                    <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 align-middle font-bold sb-rank text-2xl sb-td">
                                                        {player.hasForfeited ? (() => {
                                                            let foundType: string = player.forfeitType || 'forfeit';
                                                            if (!player.forfeitType) {
                                                                const logs = playerScoreLogs[player.id] || [];
                                                                for (const l of logs) {
                                                                    if (l.newValue === 0 && (l.modifiedByType === 'judge' || l.modifiedByType === 'admin')) {
                                                                        if (l.comment?.includes('불참')) { foundType = 'absent'; break; }
                                                                        if (l.comment?.includes('실격')) { foundType = 'disqualified'; break; }
                                                                        if (l.comment?.includes('기권')) { foundType = 'forfeit'; break; }
                                                                    }
                                                                }
                                                            }
                                                            return t(foundType as any);
                                                        })() : (player.hasAnyScore ? (
                                                            <span>
                                                                {isValidNumber(player.totalScore) ? player.totalScore : '-'}
                                                                {(() => {
                                                                    const { pm } = getPlayerTotalAndPlusMinusAllCourses(tournament, player, player.allAssignedCourses);
                                                                    if (pm === null || pm === undefined) return null;
                                                                    return (
                                                                        <span
                                                                            className={cn(
                                                                                "ml-1 align-middle text-xs",
                                                                                pm < 0 ? "sb-score-minus" : pm > 0 ? "sb-score-plus" : "sb-score-zero"
                                                                            )}
                                                                            style={{ fontSize: '0.7em', fontWeight: 600 }}
                                                                        >
                                                                            {pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm)}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </span>
                                                        ) : '-')}
                                                    </td>
                                                    <td rowSpan={player.assignedCourses.length || 1} className={cn("py-0.5 px-1 align-middle font-bold sb-rank text-2xl sb-td", player.hasForfeited ? "text-xs" : "text-xl")}>
                                                        {player.rank !== null ? formatRank(player.rank, currentLang) : ''}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    )) : (
                                        <tr className={cn("border-b border-[color:var(--sb-cell-border)] last:border-0", playerIndex % 2 === 1 && "sb-tr-alt")}>
                                            <td className="py-0.5 px-1 align-middle font-bold sb-td sb-td-info w-12 truncate">{player.jo}</td>
                                            <td className="py-0.5 px-1 text-center align-middle font-semibold sb-td sb-td-info w-28 md:w-32 lg:w-36 truncate">{player.name}</td>
                                            <td className="py-0.5 px-1 text-center align-middle opacity-70 sb-td sb-td-info w-20 md:w-24 lg:w-28 truncate">{player.club}</td>
                                            <td colSpan={11} className="py-0.5 px-1 align-middle text-center opacity-50 sb-td">{t('noCourseDisplay')}</td>
                                            <td className={cn("py-0.5 px-1 align-middle font-bold sb-rank sb-td", player.hasForfeited ? "text-xs" : "text-xl")}>
                                                {player.hasForfeited ? (() => {
                                                    let foundType: string = player.forfeitType || 'forfeit';
                                                    if (!player.forfeitType) {
                                                        const logs = playerScoreLogs[player.id] || [];
                                                        for (const l of logs) {
                                                            if (l.newValue === 0 && (l.modifiedByType === 'judge' || l.modifiedByType === 'admin')) {
                                                                if (l.comment?.includes('불참')) { foundType = 'absent'; break; }
                                                                if (l.comment?.includes('실격')) { foundType = 'disqualified'; break; }
                                                                if (l.comment?.includes('기권')) { foundType = 'forfeit'; break; }
                                                            }
                                                        }
                                                    }
                                                    return t(foundType as any);
                                                })() : (player.hasAnyScore ? player.totalScore : '-')}
                                            </td>
                                            <td className={cn("py-0.5 px-1 align-middle font-bold", player.hasForfeited ? "text-xs" : "text-xl")}>
                                                {player.rank !== null ? formatRank(player.rank, currentLang) : ''}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </TooltipProvider>
            </div>
        </div>
    );
});
ScoreboardTable.displayName = 'ScoreboardTable';

// 그룹 선택 컴포넌트 (메모이제이션 적용)
const GroupSelector = React.memo(({
    filterGroup,
    allGroupsList,
    translateGroupName,
    currentLang,
    onValueChange,
    forceGroupSelectorVisible,
    isRotationActive,
    rotationGroups,
    t
}: {
    filterGroup: string;
    allGroupsList: string[];
    translateGroupName: any;
    currentLang: string;
    onValueChange: (value: string) => void;
    forceGroupSelectorVisible: boolean;
    isRotationActive: boolean;
    rotationGroups: string[];
    t: any;
}) => {
    return (
        <div className={cn(
            "flex items-center gap-2 transition-opacity duration-300",
            forceGroupSelectorVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
            <Label htmlFor="group-filter" className="font-bold text-sm text-gray-300">{t('selectGroup')}</Label>
            <div className="relative">
                <Select value={filterGroup} onValueChange={onValueChange}>
                    <SelectTrigger id="group-filter" className="w-[200px] h-9 bg-gray-800/80 backdrop-blur-sm border-gray-600 text-white focus:ring-yellow-400">
                        <SelectValue placeholder={t('selectGroup')} />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 text-white border-gray-700">
                        <SelectItem value="all">{t('viewAllGroups')}</SelectItem>
                        {allGroupsList.map(g => <SelectItem key={g} value={g}>{translateGroupName(g, currentLang)}</SelectItem>)}
                    </SelectContent>
                </Select>
                {isRotationActive && rotationGroups.length > 0 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                )}
            </div>
        </div>
    );
});
GroupSelector.displayName = 'GroupSelector';

// 순환 설정 컴포넌트 (메모이제이션 적용)
const RotationSettings = React.memo(({
    isRotationActive,
    allGroupsList,
    rotationGroups,
    rotationInterval,
    translateGroupName,
    currentLang,
    onRotationToggle,
    onGroupToggle,
    onIntervalChange,
    t
}: {
    isRotationActive: boolean;
    allGroupsList: string[];
    rotationGroups: string[];
    rotationInterval: number;
    translateGroupName: any;
    currentLang: string;
    onRotationToggle: (checked: boolean) => void;
    onGroupToggle: (group: string, checked: boolean) => void;
    onIntervalChange: (value: string) => void;
    t: any;
}) => {
    return (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4 min-w-[280px]">
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <Label className="font-bold text-sm text-gray-300">그룹 순환</Label>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="rotation-active"
                            checked={isRotationActive}
                            onCheckedChange={onRotationToggle}
                            className="border-gray-600"
                        />
                        <Label htmlFor="rotation-active" className="text-xs text-gray-400 cursor-pointer">
                            활성화
                        </Label>
                    </div>
                </div>

                {isRotationActive && (
                    <>
                        <div className="flex flex-col gap-2">
                            <Label className="text-xs text-gray-400">순환할 그룹 선택</Label>
                            <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                                {allGroupsList.map(group => (
                                    <div key={group} className="flex items-center gap-2">
                                        <Checkbox
                                            id={`rotation-group-${group}`}
                                            checked={rotationGroups.includes(group)}
                                            onCheckedChange={(checked) => onGroupToggle(group, checked === true)}
                                            className="border-gray-600"
                                        />
                                        <Label htmlFor={`rotation-group-${group}`} className="text-xs text-gray-300 cursor-pointer">
                                            {translateGroupName(group, currentLang)}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label className="text-xs text-gray-400">순환 시간</Label>
                            <Select value={rotationInterval.toString()} onValueChange={onIntervalChange}>
                                <SelectTrigger className="w-full h-8 bg-gray-800/80 border-gray-600 text-white text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-900 text-white border-gray-700">
                                    {[10, 30, 60, 120, 180, 240, 300].map(v => (
                                        <SelectItem key={v} value={v.toString()}>
                                            {v < 60 ? `${v}초` : `${v / 60}분`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
});
RotationSettings.displayName = 'RotationSettings';

// 외부 전광판 컴포넌트
function ExternalScoreboard() {
    const [loading, setLoading] = useState(true);

    // 모바일 감지 (컴포넌트 마운트 시 한 번만 계산 - 성능 최적화)
    const [isMobile] = useState(() =>
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(pointer: coarse)').matches
    );

    // 모바일에서 그룹 선택창을 초기에만 강제로 보여주기 위한 상태
    // 초기값: 모바일이면 true, 아니면 false
    const [forceGroupSelectorVisible, setForceGroupSelectorVisible] = useState(isMobile);

    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [tournament, setTournament] = useState<any>({});
    const [groupsData, setGroupsData] = useState<any>({});
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<any>(null);
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<any>(null);
    // 그룹별 서든데스 데이터 (모든 그룹의 서든데스 상태 관리)
    const [allIndividualSuddenDeathData, setAllIndividualSuddenDeathData] = useState<{ [groupName: string]: any }>({});
    const [allTeamSuddenDeathData, setAllTeamSuddenDeathData] = useState<{ [groupName: string]: any }>({});
    const [individualBackcountApplied, setIndividualBackcountApplied] = useState<boolean>(false);
    const [teamBackcountApplied, setTeamBackcountApplied] = useState<boolean>(false);
    const [individualNTPData, setIndividualNTPData] = useState<any>(null);
    const [teamNTPData, setTeamNTPData] = useState<any>(null);
    const [filterGroup, setFilterGroup] = useState('all');
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isPending, startTransition] = useTransition();

    // 그룹 순환 기능 상태
    const [rotationGroups, setRotationGroups] = useState<string[]>([]);
    const [rotationInterval, setRotationInterval] = useState<number>(30); // 기본 30초
    const [isRotationActive, setIsRotationActive] = useState<boolean>(false);
    const currentRotationIndexRef = useRef<number>(0);
    const rotationIntervalRef = useRef<number>(30); // interval 값을 ref로도 관리
    const rotationGroupsRef = useRef<string[]>([]); // rotationGroups를 ref로도 관리
    const rotationIntervalIdRef = useRef<NodeJS.Timeout | null>(null); // interval ID를 ref로 관리하여 리렌더링 시에도 유지
    // 사용자가 화면에서 직접 순환 체크박스를 건드렸는지 여부 (Firebase 설정값이 상태를 덮어쓰지 않도록 제어)
    const hasUserToggledRotationRef = useRef<boolean>(false);

    // 다국어 지원 상태
    const [languageMode, setLanguageMode] = useState<'korean' | 'english' | 'cycle'>('korean');
    const [currentLang, setCurrentLang] = useState<'ko' | 'en'>('ko');

    // 테마 상태 (기본값: dark)
    const [theme, setTheme] = useState<'dark' | 'grey' | 'light'>('dark');

    // 전체화면 상태 및 토글 함수
    const [isFullscreen, setIsFullscreen] = useState(false);
    const hasTriggeredFullscreen = useRef(false); // 한 번만 시도하도록 제어

    const enableFullscreen = () => {
        // 이미 실행 중인 요청이 있거나, 실제 전체화면 상태라면 무시
        if (hasTriggeredFullscreen.current) return;

        const element = document.documentElement as any;
        const requestMethod = element.requestFullscreen ||
            element.webkitRequestFullscreen ||
            element.mozRequestFullScreen ||
            element.msRequestFullscreen;

        if (requestMethod) {
            // 이미 전체화면인지 확인 (표준 및 벤더 프리픽스)
            const isFs = document.fullscreenElement ||
                (document as any).webkitFullscreenElement ||
                (document as any).mozFullScreenElement ||
                (document as any).msFullscreenElement;

            if (!isFs) {
                // 진입 요청 시작
                hasTriggeredFullscreen.current = true;

                // 실행
                requestMethod.call(element).then(() => {
                    // 성공 시 별도 작업 불필요 (onFullscreenChange에서 처리)
                }).catch((err: any) => {
                    console.log(`Fullscreen attempt failed: ${err.message}`);
                    hasTriggeredFullscreen.current = false; // 실패 시 재시도 허용
                });
            }
        }
    };

    // 전체화면 변경 감지 및 글로벌 리스너 등록
    useEffect(() => {
        const onFullscreenChange = () => {
            const isFs = !!(document.fullscreenElement ||
                (document as any).webkitFullscreenElement ||
                (document as any).mozFullScreenElement ||
                (document as any).msFullscreenElement);

            setIsFullscreen(isFs);
            if (!isFs) {
                hasTriggeredFullscreen.current = false;
            }
        };

        const handleInteraction = () => {
            enableFullscreen();
        };

        // 표준 및 벤더별 이벤트 리스너
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        document.addEventListener('mozfullscreenchange', onFullscreenChange);
        document.addEventListener('MSFullscreenChange', onFullscreenChange);

        // 사용자 상호작용 감지 (전역)
        document.addEventListener('click', handleInteraction);

        let cleanupScroll: (() => void) | null = null;

        // 모바일과 PC의 전체화면 트리거 분리
        if (isMobile) {
            // 모바일: 스크롤 시 전체화면 시도
            // scrollContainerRef가 존재할 때 해당 요소에 이벤트 리스너 추가
            const scrollContainer = scrollContainerRef.current;
            if (scrollContainer) {
                const handleScrollInteraction = () => {
                    enableFullscreen();
                };
                scrollContainer.addEventListener('scroll', handleScrollInteraction, { passive: true });
                cleanupScroll = () => {
                    if (scrollContainer) {
                        scrollContainer.removeEventListener('scroll', handleScrollInteraction);
                    }
                };
            }
        } else {
            // PC: 터치/클릭 시 전체화면 시도 (기존 유지)
            document.addEventListener('touchstart', handleInteraction, { passive: true });
        }

        return () => {
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
            document.removeEventListener('mozfullscreenchange', onFullscreenChange);
            document.removeEventListener('MSFullscreenChange', onFullscreenChange);
            document.removeEventListener('click', handleInteraction);
            document.removeEventListener('touchstart', handleInteraction);

            if (cleanupScroll) {
                cleanupScroll();
            }
        };
    }, [isMobile]); // isMobile 변경 시 재실행




    // 모바일 시스템 언어 감지 및 자동 설정
    useEffect(() => {
        if (isMobile && typeof navigator !== 'undefined') {
            const systemLang = navigator.language || (navigator as any).userLanguage;
            if (systemLang) {
                const isKorean = systemLang.toLowerCase().includes('ko');
                if (isKorean) {
                    setLanguageMode('korean');
                    setCurrentLang('ko');
                } else {
                    setLanguageMode('english');
                    setCurrentLang('en');
                }
            }
        }
    }, [isMobile]);

    // 번역 함수
    const t = useCallback((key: keyof typeof translations.ko) => {
        return translations[currentLang][key];
    }, [currentLang]);

    // 코스 이름 번역 함수 (상단으로 이동)
    const translateCourseName = useCallback((name: string | null | undefined) => {
        if (!name) return '';
        if (currentLang === 'ko') return name;
        // "A코스" -> "Course A" 변환
        return name.replace(/^(.*)코스$/, 'Course $1');
    }, [currentLang]);

    // 순환 모드일 때 5초마다 언어 전환
    useEffect(() => {
        if (languageMode === 'cycle') {
            const interval = setInterval(() => {
                setCurrentLang(prev => prev === 'ko' ? 'en' : 'ko');
            }, 10000);
            return () => clearInterval(interval);
        } else {
            // 순환 모드가 아니면 선택한 언어로 고정
            setCurrentLang(languageMode === 'korean' ? 'ko' : 'en');
        }
    }, [languageMode]);



    // 그룹 순환 로직은 finalDataByGroup 선언 이후로 이동 (아래 참조)

    // 캐싱을 위한 상태 추가
    const lastScoresHash = useRef('');
    const lastPlayersHash = useRef('');
    const lastTournamentHash = useRef('');

    // 최적화된 데이터 구독을 위한 상태
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
    const [changedPlayerIds, setChangedPlayerIds] = useState<string[]>([]); // 변경된 선수 ID 추적
    // 탭 비활성화 최적화: 현재 활성 구독 언서브 보관 및 재시작 트리거
    const activeUnsubsRef = useRef<(() => void)[]>([]);
    const [resumeSeq, setResumeSeq] = useState(0);

    const stopSubscriptions = () => {
        try {
            activeUnsubsRef.current.forEach(u => { try { u(); } catch { } });
        } finally {
            activeUnsubsRef.current = [];
        }
    };

    useEffect(() => {
        if (!db) {
            setLoading(false);
            return;
        }
        // 기존 구독 정리 후 시작
        stopSubscriptions();

        // 익명 인증 후에만 구독 시작
        ensureAuthenticated().then((isAuthenticated) => {
            if (!isAuthenticated) {
                setLoading(false);
                return;
            }
            const dbInstance = db as any;

            // 초기 데이터 로딩 (빠른 로딩을 위해 병렬 처리)
            if (!initialDataLoaded) {
                const playersRef = ref(dbInstance, 'players');
                const scoresRef = ref(dbInstance, 'scores');
                const tournamentRef = ref(dbInstance, 'tournaments/current');

                let loadedCount = 0;
                const checkAllLoaded = () => {
                    loadedCount++;
                    if (loadedCount >= 3) {
                        setInitialDataLoaded(true);
                        setLoading(false);
                    }
                };

                const unsubInitialPlayers = onValue(playersRef, snap => {
                    const data = snap.val() || {};
                    setPlayers(data);
                    lastPlayersHash.current = JSON.stringify(data);
                    checkAllLoaded();
                });

                const unsubInitialScores = onValue(scoresRef, snap => {
                    const data = snap.val() || {};
                    setScores(data);
                    lastScoresHash.current = JSON.stringify(data);
                    checkAllLoaded();
                }, { onlyOnce: true });

                const unsubInitialTournament = onValue(tournamentRef, snap => {
                    const data = snap.val() || {};
                    setTournament(data);
                    setGroupsData(data.groups || {});
                    lastTournamentHash.current = JSON.stringify(data);
                    checkAllLoaded();
                });

                // 순환 설정 불러오기는 별도 useEffect에서 처리 (초기 로딩과 분리)

                // 3초 후에도 로딩이 안 되면 강제로 로딩 완료하는 타이머 제거
                // 실제 데이터가 로딩되면 checkAllLoaded()에 의해 즉시 완료됨

                // 언서브/타이머 해제 등록
                activeUnsubsRef.current.push(unsubInitialPlayers);
                activeUnsubsRef.current.push(unsubInitialScores);
                activeUnsubsRef.current.push(unsubInitialTournament);
            }

            // 초기 데이터 로딩 후 실시간 업데이트 (점수는 항상 실시간 반영 보장)
            if (initialDataLoaded) {
                // 선수 데이터: 변경사항만 감지하되 안전하게
                const playersRef = ref(dbInstance, 'players');
                const unsubPlayers = onChildChanged(playersRef, snap => {
                    const playerId = snap.key;
                    const playerData = snap.val();
                    if (playerId && playerData) {
                        setPlayers((prev: any) => {
                            const newPlayers = { ...prev, [playerId]: playerData };
                            const newHash = JSON.stringify(newPlayers);
                            if (newHash !== lastPlayersHash.current) {
                                lastPlayersHash.current = newHash;
                                return newPlayers;
                            }
                            return prev;
                        });
                    }
                });

                // 점수 데이터: 최적화된 실시간 업데이트 (전체 scores 경로 리스너 사용)
                // 관리자 대시보드와 동일한 방식으로 하나의 리스너만 사용하여 성능 최적화
                // Firebase가 효율적으로 변경사항만 전송하므로 실시간성은 동일하게 유지됨
                const scoresRef = ref(dbInstance, 'scores');

                // 1. 데이터 추가 감지 (새로운 선수 점수 등록)
                const unsubScoresAdded = onChildAdded(scoresRef, snap => {
                    const playerId = snap.key;
                    const data = snap.val();
                    if (!playerId || !data) return;

                    // 변경 알림 및 캐시 무효화를 상태 업데이트 외부로 이동하여 항상 실행 보장
                    setLastUpdateTime(Date.now());
                    invalidatePlayerLogCache(playerId);
                    setChangedPlayerIds((prevIds: string[]) =>
                        prevIds.includes(playerId) ? prevIds : [...prevIds, playerId]
                    );

                    setScores((prev: any) => {
                        // 이미 로드된 데이터와 동일하면 업데이트 방지 (초기 로드 중복 방지)
                        if (prev && prev[playerId] && JSON.stringify(prev[playerId]) === JSON.stringify(data)) {
                            return prev;
                        }
                        return { ...prev, [playerId]: data };
                    });
                });

                // 2. 데이터 변경 감지 (기존 선수 점수 수정) - 핵심 최적화
                const unsubScoresChanged = onChildChanged(scoresRef, snap => {
                    const playerId = snap.key;
                    const data = snap.val();
                    if (!playerId || !data) return;

                    // Side effects를 상태 업데이트 외부로 이동
                    setLastUpdateTime(Date.now());
                    invalidatePlayerLogCache(playerId);
                    setChangedPlayerIds((prevIds: string[]) =>
                        prevIds.includes(playerId) ? prevIds : [...prevIds, playerId]
                    );

                    setScores((prev: any) => {
                        // 참조가 같거나 내용이 같으면 스킵
                        if (prev && prev[playerId] && JSON.stringify(prev[playerId]) === JSON.stringify(data)) {
                            return prev;
                        }
                        return { ...prev, [playerId]: data };
                    });
                });

                // 3. 데이터 삭제 감지
                const unsubScoresRemoved = onChildRemoved(scoresRef, snap => {
                    const playerId = snap.key;
                    if (!playerId) return;

                    // Side effects를 상태 업데이트 외부로 이동
                    setLastUpdateTime(Date.now());
                    invalidatePlayerLogCache(playerId);

                    setScores((prev: any) => {
                        if (!prev || !prev[playerId]) return prev;

                        const next = { ...prev };
                        delete next[playerId];
                        return next;
                    });
                });

                // 토너먼트 설정: 변경사항만 감지
                const tournamentRef = ref(dbInstance, 'tournaments/current');
                const unsubTournament = onChildChanged(tournamentRef, snap => {
                    const key = snap.key;
                    const value = snap.val();
                    if (key && value) {
                        setTournament((prev: any) => {
                            const newTournament = { ...prev, [key]: value };
                            if (key === 'groups') {
                                setGroupsData(value);
                            }
                            const newHash = JSON.stringify(newTournament);
                            if (newHash !== lastTournamentHash.current) {
                                lastTournamentHash.current = newHash;
                                return newTournament;
                            }
                            return prev;
                        });
                    }
                });

                // 코스 활성/비활성 상태 실시간 반영 (isActive 변경 감지)
                const coursesRef = ref(dbInstance, 'tournaments/current/courses');
                const unsubCourses = onValue(coursesRef, snap => {
                    const coursesData = snap.val() || {};
                    setTournament((prev: any) => {
                        const newTournament = { ...prev, courses: coursesData };
                        const newHash = JSON.stringify(newTournament);
                        if (newHash !== lastTournamentHash.current) {
                            lastTournamentHash.current = newHash;
                            return newTournament;
                        }
                        return prev;
                    });
                });

                // 언서브 등록
                activeUnsubsRef.current.push(unsubPlayers);
                activeUnsubsRef.current.push(unsubScoresAdded);
                activeUnsubsRef.current.push(unsubScoresChanged);
                activeUnsubsRef.current.push(unsubScoresRemoved);
                activeUnsubsRef.current.push(unsubTournament);
                activeUnsubsRef.current.push(unsubCourses);
            }
        });
        // 클린업: 이 이펙트가 재실행/언마운트 시 구독 해제
        return () => stopSubscriptions();
    }, [initialDataLoaded, resumeSeq]);

    // 탭 비활성화 시 구독 일시 중단, 다시 보이면 재개
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

    // 서든데스 데이터 최적화된 구독 (활성화된 경우에만)
    useEffect(() => {
        if (!db || !initialDataLoaded) return;

        const dbInstance = db as any;
        const individualSuddenDeathRef = ref(dbInstance, 'tournaments/current/suddenDeath/individual');
        const teamSuddenDeathRef = ref(dbInstance, 'tournaments/current/suddenDeath/team');
        const individualBackcountRef = ref(dbInstance, 'tournaments/current/backcountApplied/individual');
        const teamBackcountRef = ref(dbInstance, 'tournaments/current/backcountApplied/team');
        const individualNTPRef = ref(dbInstance, 'tournaments/current/nearestToPin/individual');
        const teamNTPRef = ref(dbInstance, 'tournaments/current/nearestToPin/team');

        let unsubIndividualDetails: (() => void) | null = null;
        let unsubTeamDetails: (() => void) | null = null;

        // 개인전 서든데스 상태 확인 후 구독 (그룹별 구조 지원)
        const unsubIndividualStatus = onValue(individualSuddenDeathRef, snap => {
            const data = snap.val();
            if (!data) {
                setAllIndividualSuddenDeathData({});
                setIndividualSuddenDeathData(null);
                if (unsubIndividualDetails) {
                    unsubIndividualDetails();
                    unsubIndividualDetails = null;
                }
                return;
            }

            // 그룹별 구조: { groupName: { isActive, players, ... } }
            // 또는 레거시 구조: { isActive, players, ... }
            if (data.isActive && !data.groupName) {
                // 레거시 구조 (단일 서든데스) - 모든 그룹에 적용된 것으로 간주
                setAllIndividualSuddenDeathData({ '*': data });
                if (filterGroup === 'all' || filterGroup === '*') {
                    setIndividualSuddenDeathData(data);
                } else {
                    setIndividualSuddenDeathData(null);
                }
                if (!unsubIndividualDetails) {
                    unsubIndividualDetails = onValue(individualSuddenDeathRef, snap => {
                        const updatedData = snap.val();
                        if (updatedData?.isActive && !updatedData.groupName) {
                            setAllIndividualSuddenDeathData({ '*': updatedData });
                            if (filterGroup === 'all' || filterGroup === '*') {
                                setIndividualSuddenDeathData(updatedData);
                            } else {
                                setIndividualSuddenDeathData(null);
                            }
                        } else {
                            setAllIndividualSuddenDeathData({});
                            setIndividualSuddenDeathData(null);
                        }
                    });
                }
            } else if (typeof data === 'object' && !data.isActive) {
                // 그룹별 구조: 모든 그룹의 서든데스 데이터 저장
                setAllIndividualSuddenDeathData(data);

                // 선택된 그룹의 서든데스 찾기
                const selectedGroupData = filterGroup !== 'all' ? data[filterGroup] : null;
                if (selectedGroupData?.isActive) {
                    setIndividualSuddenDeathData(selectedGroupData);
                } else {
                    setIndividualSuddenDeathData(null);
                }

                if (!unsubIndividualDetails) {
                    unsubIndividualDetails = onValue(individualSuddenDeathRef, snap => {
                        const updatedData = snap.val();
                        if (updatedData && typeof updatedData === 'object' && !updatedData.isActive) {
                            setAllIndividualSuddenDeathData(updatedData);
                            const selectedGroupData = filterGroup !== 'all' ? updatedData[filterGroup] : null;
                            if (selectedGroupData?.isActive) {
                                setIndividualSuddenDeathData(selectedGroupData);
                            } else {
                                setIndividualSuddenDeathData(null);
                            }
                        } else if (updatedData?.isActive && !updatedData.groupName) {
                            setAllIndividualSuddenDeathData({ '*': updatedData });
                            if (filterGroup === 'all' || filterGroup === '*') {
                                setIndividualSuddenDeathData(updatedData);
                            } else {
                                setIndividualSuddenDeathData(null);
                            }
                        } else {
                            setAllIndividualSuddenDeathData({});
                            setIndividualSuddenDeathData(null);
                        }
                    });
                }
            } else {
                setAllIndividualSuddenDeathData({});
                setIndividualSuddenDeathData(null);
                if (unsubIndividualDetails) {
                    unsubIndividualDetails();
                    unsubIndividualDetails = null;
                }
            }
        });

        // 팀 서든데스 상태 확인 후 구독 (그룹별 구조 지원)
        const unsubTeamStatus = onValue(teamSuddenDeathRef, snap => {
            const data = snap.val();
            if (!data) {
                setAllTeamSuddenDeathData({});
                setTeamSuddenDeathData(null);
                if (unsubTeamDetails) {
                    unsubTeamDetails();
                    unsubTeamDetails = null;
                }
                return;
            }

            // 그룹별 구조: { groupName: { isActive, players, ... } }
            // 또는 레거시 구조: { isActive, players, ... }
            if (data.isActive && !data.groupName) {
                // 레거시 구조 (단일 서든데스) - 모든 그룹에 적용된 것으로 간주
                setAllTeamSuddenDeathData({ '*': data });
                if (filterGroup === 'all' || filterGroup === '*') {
                    setTeamSuddenDeathData(data);
                } else {
                    setTeamSuddenDeathData(null);
                }
                if (!unsubTeamDetails) {
                    unsubTeamDetails = onValue(teamSuddenDeathRef, snap => {
                        const updatedData = snap.val();
                        if (updatedData?.isActive && !updatedData.groupName) {
                            setAllTeamSuddenDeathData({ '*': updatedData });
                            if (filterGroup === 'all' || filterGroup === '*') {
                                setTeamSuddenDeathData(updatedData);
                            } else {
                                setTeamSuddenDeathData(null);
                            }
                        } else {
                            setAllTeamSuddenDeathData({});
                            setTeamSuddenDeathData(null);
                        }
                    });
                }
            } else if (typeof data === 'object' && !data.isActive) {
                // 그룹별 구조: 모든 그룹의 서든데스 데이터 저장
                setAllTeamSuddenDeathData(data);

                // 선택된 그룹의 서든데스 찾기
                const selectedGroupData = filterGroup !== 'all' ? data[filterGroup] : null;
                if (selectedGroupData?.isActive) {
                    setTeamSuddenDeathData(selectedGroupData);
                } else {
                    setTeamSuddenDeathData(null);
                }

                if (!unsubTeamDetails) {
                    unsubTeamDetails = onValue(teamSuddenDeathRef, snap => {
                        const updatedData = snap.val();
                        if (updatedData && typeof updatedData === 'object' && !updatedData.isActive) {
                            setAllTeamSuddenDeathData(updatedData);
                            const selectedGroupData = filterGroup !== 'all' ? updatedData[filterGroup] : null;
                            if (selectedGroupData?.isActive) {
                                setTeamSuddenDeathData(selectedGroupData);
                            } else {
                                setTeamSuddenDeathData(null);
                            }
                        } else if (updatedData?.isActive && !updatedData.groupName) {
                            setAllTeamSuddenDeathData({ '*': updatedData });
                            if (filterGroup === 'all' || filterGroup === '*') {
                                setTeamSuddenDeathData(updatedData);
                            } else {
                                setTeamSuddenDeathData(null);
                            }
                        } else {
                            setAllTeamSuddenDeathData({});
                            setTeamSuddenDeathData(null);
                        }
                    });
                }
            } else {
                setAllTeamSuddenDeathData({});
                setTeamSuddenDeathData(null);
                if (unsubTeamDetails) {
                    unsubTeamDetails();
                    unsubTeamDetails = null;
                }
            }
        });

        // 백카운트 상태 구독 (그룹별 구조 지원)
        const unsubIndividualBackcount = onValue(individualBackcountRef, snap => {
            const data = snap.val();
            if (!data) {
                setIndividualBackcountApplied(false);
                return;
            }

            // 그룹별 구조: { groupName: boolean }
            // 또는 레거시 구조: boolean
            if (typeof data === 'boolean') {
                // 레거시 구조
                setIndividualBackcountApplied(data);
            } else if (typeof data === 'object') {
                // 그룹별 구조: 선택된 그룹의 백카운트 확인
                if (filterGroup !== 'all') {
                    setIndividualBackcountApplied(data[filterGroup] || false);
                } else {
                    // 'all'일 때는 첫 번째 활성화된 그룹의 백카운트 확인
                    const activeGroup = Object.entries(data).find(([_, value]) => value === true);
                    setIndividualBackcountApplied(!!activeGroup);
                }
            } else {
                setIndividualBackcountApplied(false);
            }
        });
        const unsubTeamBackcount = onValue(teamBackcountRef, snap => {
            const data = snap.val();
            if (!data) {
                setTeamBackcountApplied(false);
                return;
            }

            // 그룹별 구조: { groupName: boolean }
            // 또는 레거시 구조: boolean
            if (typeof data === 'boolean') {
                // 레거시 구조
                setTeamBackcountApplied(data);
            } else if (typeof data === 'object') {
                // 그룹별 구조: 선택된 그룹의 백카운트 확인
                if (filterGroup !== 'all') {
                    setTeamBackcountApplied(data[filterGroup] || false);
                } else {
                    // 'all'일 때는 첫 번째 활성화된 그룹의 백카운트 확인
                    const activeGroup = Object.entries(data).find(([_, value]) => value === true);
                    setTeamBackcountApplied(!!activeGroup);
                }
            } else {
                setTeamBackcountApplied(false);
            }
        });

        // NTP 상태 구독 (그룹별 구조 지원)
        const unsubIndividualNTP = onValue(individualNTPRef, snap => {
            const data = snap.val();
            if (!data) {
                setIndividualNTPData(null);
                return;
            }

            // 그룹별 구조: { groupName: { isActive, players, rankings } }
            // 또는 레거시 구조: { isActive, players, rankings }
            if (data.isActive && !data.groupName) {
                // 레거시 구조 (단일 NTP)
                setIndividualNTPData(data);
            } else if (typeof data === 'object' && !data.isActive) {
                // 그룹별 구조: 선택된 그룹 또는 첫 번째 활성화된 그룹의 NTP 찾기
                let activeGroupData: any = null;
                if (filterGroup !== 'all') {
                    // 선택된 그룹의 NTP 찾기
                    activeGroupData = data[filterGroup];
                } else {
                    // 모든 그룹 중 첫 번째 활성화된 그룹 찾기
                    activeGroupData = Object.values(data).find((groupData: any) => groupData?.isActive);
                }
                setIndividualNTPData(activeGroupData?.isActive ? activeGroupData : null);
            } else {
                setIndividualNTPData(null);
            }
        });
        const unsubTeamNTP = onValue(teamNTPRef, snap => {
            const data = snap.val();
            if (!data) {
                setTeamNTPData(null);
                return;
            }

            // 그룹별 구조: { groupName: { isActive, players, rankings } }
            // 또는 레거시 구조: { isActive, players, rankings }
            if (data.isActive && !data.groupName) {
                // 레거시 구조 (단일 NTP)
                setTeamNTPData(data);
            } else if (typeof data === 'object' && !data.isActive) {
                // 그룹별 구조: 선택된 그룹 또는 첫 번째 활성화된 그룹의 NTP 찾기
                let activeGroupData: any = null;
                if (filterGroup !== 'all') {
                    // 선택된 그룹의 NTP 찾기
                    activeGroupData = data[filterGroup];
                } else {
                    // 모든 그룹 중 첫 번째 활성화된 그룹 찾기
                    activeGroupData = Object.values(data).find((groupData: any) => groupData?.isActive);
                }
                setTeamNTPData(activeGroupData?.isActive ? activeGroupData : null);
            } else {
                setTeamNTPData(null);
            }
        });

        return () => {
            unsubIndividualStatus();
            unsubTeamStatus();
            unsubIndividualBackcount();
            unsubTeamBackcount();
            unsubIndividualNTP();
            unsubTeamNTP();
            if (unsubIndividualDetails) unsubIndividualDetails();
            if (unsubTeamDetails) unsubTeamDetails();
        };
    }, [initialDataLoaded, filterGroup]);

    // filterGroup 변경 시 선택된 그룹의 서든데스 데이터 업데이트
    useEffect(() => {
        // 개인전 서든데스
        if (filterGroup === 'all') {
            // 'all'일 때는 첫 번째 활성화된 그룹의 서든데스 표시
            const activeGroup = Object.entries(allIndividualSuddenDeathData).find(([_, data]: [string, any]) => data?.isActive);
            setIndividualSuddenDeathData(activeGroup ? activeGroup[1] : null);
        } else {
            // 선택된 그룹의 서든데스 표시
            const groupData = allIndividualSuddenDeathData[filterGroup];
            setIndividualSuddenDeathData(groupData?.isActive ? groupData : null);
        }

        // 팀 서든데스
        if (filterGroup === 'all') {
            // 'all'일 때는 첫 번째 활성화된 그룹의 서든데스 표시
            const activeGroup = Object.entries(allTeamSuddenDeathData).find(([_, data]: [string, any]) => data?.isActive);
            setTeamSuddenDeathData(activeGroup ? activeGroup[1] : null);
        } else {
            // 선택된 그룹의 서든데스 표시
            const groupData = allTeamSuddenDeathData[filterGroup];
            setTeamSuddenDeathData(groupData?.isActive ? groupData : null);
        }
    }, [filterGroup, allIndividualSuddenDeathData, allTeamSuddenDeathData]);

    const processedDataByGroup = useMemo(() => {
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);
        if (Object.keys(players).length === 0) return {};

        // 모든 그룹의 선수를 처리 (순환 시 filterGroup 변경으로 인한 재계산 방지)
        const playersToProcess = Object.entries(players);

        const allProcessedPlayers: any[] = playersToProcess.map(([playerId, player]: [string, any]) => {
            const playerGroupData = groupsData[player.group];
            // 코스 순서 정보 가져오기 (기존 호환성: boolean → number 변환)
            const coursesOrder = playerGroupData?.courses || {};
            const assignedCourseIds = Object.keys(coursesOrder).filter((id: string) => {
                const order = coursesOrder[id];
                // boolean이면 true인 것만, number면 0보다 큰 것만
                return typeof order === 'boolean' ? order : (typeof order === 'number' && order > 0);
            });

            const allAssignedCoursesForPlayer = allCourses.filter((c: any) => assignedCourseIds.includes(c.id.toString()));
            // 코스 순서대로 정렬 (order가 큰 것이 마지막 = 백카운트 기준)
            allAssignedCoursesForPlayer.sort((a: any, b: any) => {
                const orderA = coursesOrder[String(a.id)];
                const orderB = coursesOrder[String(b.id)];

                // 그룹의 courses에서 순서 가져오기, 없으면 코스의 order 사용
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

                return numA - numB; // 작은 순서가 먼저 (첫번째 코스가 위)
            });

            const activeCoursesForPlayer = allAssignedCoursesForPlayer.filter((c: any) => c.isActive !== false);

            const playerScoresData = (scores as any)[playerId] || {};

            let hasAnyScore = false;
            let hasForfeited = false;
            let totalScore = 0;
            const coursesData: any = {};
            const courseScoresForTieBreak: { [courseId: string]: number } = {};
            const detailedScoresForTieBreak: { [courseId: string]: { [holeNumber: string]: number } } = {};

            // 총타수는 모든 배정된 코스의 합계로 계산 (전광판 표시 여부와 무관)
            allAssignedCoursesForPlayer.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                detailedScoresForTieBreak[courseId] = scoresForCourse;

                let courseTotal = 0;
                for (let i = 0; i < 9; i++) {
                    const holeScore = scoresForCourse[(i + 1).toString()];
                    if (holeScore !== undefined && holeScore !== null) {
                        const scoreNum = Number(holeScore);
                        if (scoreNum === 0) {
                            hasForfeited = true;
                        }
                        courseTotal += scoreNum;
                        hasAnyScore = true;
                    }
                }

                totalScore += courseTotal;
                courseScoresForTieBreak[courseId] = courseTotal;
            });

            // 전광판 표시용 코스 데이터는 활성 코스만 포함
            activeCoursesForPlayer.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                const holeScores: (number | null)[] = Array(9).fill(null);
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

            return {
                id: playerId,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                club: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                group: player.group,
                type: player.type,
                totalScore,
                coursesData,
                hasAnyScore,
                hasForfeited: hasForfeited || !!player.forfeitType,
                forfeitType: player.forfeitType,
                total: totalScore,
                courseScores: courseScoresForTieBreak,
                detailedScores: detailedScoresForTieBreak,
                assignedCourses: activeCoursesForPlayer,
                allAssignedCourses: allAssignedCoursesForPlayer // 전체 배정 코스(온오프 무관)
            };
        });

        const groupedData = allProcessedPlayers.reduce((acc: Record<string, any[]>, player: any) => {
            const groupName = player.group || '미지정';
            if (!acc[groupName]) {
                acc[groupName] = [];
            }
            acc[groupName].push(player);
            return acc;
        }, {} as Record<string, any[]>);

        // 코스 순서 검증 함수
        const validateCourseOrder = (coursesForGroup: any[], coursesOrder: any, groupName: string): { isValid: boolean; warnings: string[] } => {
            const warnings: string[] = [];

            // 1. order 값이 없는 코스 확인
            const coursesWithoutOrder = coursesForGroup.filter(c => {
                const order = coursesOrder[String(c.id)];
                return !order || (typeof order === 'number' && order <= 0);
            });

            if (coursesWithoutOrder.length > 0) {
                warnings.push(`${groupName} 그룹: ${coursesWithoutOrder.length}개 코스에 순서 정보가 없습니다. (${coursesWithoutOrder.map(c => c.name || c.id).join(', ')})`);
            }

            // 2. order 값 중복 확인
            const orderValues = coursesForGroup
                .map(c => {
                    const order = coursesOrder[String(c.id)];
                    if (typeof order === 'number' && order > 0) return order;
                    return null;
                })
                .filter((o): o is number => o !== null);

            const duplicateOrders = orderValues.filter((order, index) => orderValues.indexOf(order) !== index);
            if (duplicateOrders.length > 0) {
                const uniqueDuplicates = [...new Set(duplicateOrders)];
                warnings.push(`${groupName} 그룹: 다음 순서 값이 중복됩니다: ${uniqueDuplicates.join(', ')}`);
            }

            return {
                isValid: warnings.length === 0,
                warnings
            };
        };

        // 순위 정렬: 이븐 대비 ±타수 기준(작은 순)
        const rankedData: { [key: string]: ProcessedPlayer[] } = {};
        for (const groupName in groupedData) {
            // 코스 순서 기반으로 정렬 (order가 큰 것이 마지막 = 백카운트 기준)
            const groupPlayers = groupedData[groupName];
            const groupData = groupsData[groupName];
            const coursesOrder = groupData?.courses || {};
            const allCoursesForGroup = [...(groupPlayers[0]?.allAssignedCourses || [])].filter(c => c && c.id !== undefined);
            // 코스 순서대로 정렬 (order가 큰 것이 마지막)
            const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                const orderA = coursesOrder[String(a.id)];
                const orderB = coursesOrder[String(b.id)];

                // 그룹의 courses에서 순서 가져오기, 없으면 코스의 order 사용
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

            // 코스 순서 검증
            const validation = validateCourseOrder(coursesForGroup, coursesOrder, groupName);
            if (!validation.isValid) {
                console.warn(`⚠️ 코스 순서 검증 실패 (${groupName}):`, validation.warnings);
                // 개발 환경에서만 경고 표시
                if (process.env.NODE_ENV === 'development') {
                    validation.warnings.forEach(warning => {
                        console.warn(warning);
                    });
                }
            }

            // order가 있는 코스와 없는 코스 분리
            const coursesWithOrder = coursesForGroup.filter(c => {
                const order = coursesOrder[String(c.id)];
                return typeof order === 'number' && order > 0;
            });
            const coursesWithoutOrder = coursesForGroup.filter(c => {
                const order = coursesOrder[String(c.id)];
                return !order || (typeof order === 'number' && order <= 0);
            });

            // order가 있는 코스는 정렬된 순서대로, 없는 코스는 뒤로
            const finalCoursesForGroup = [...coursesWithOrder, ...coursesWithoutOrder];

            // 백카운트는 마지막 코스부터 역순이므로 reverse
            const coursesForBackcount = [...finalCoursesForGroup].reverse();

            const playersToSort = groupedData[groupName].filter((p: any) => p.hasAnyScore && !p.hasForfeited);
            const otherPlayers = groupedData[groupName].filter((p: any) => !p.hasAnyScore || p.hasForfeited);
            // 1위 동점자 모두 1위, 그 다음 등수부터 백카운트로 순위 부여
            if (playersToSort.length > 0) {
                // 최적화: ±타수 계산을 한 번만 수행하고 캐싱
                const playersWithPM = playersToSort.map((p: any) => {
                    const pmResult = getPlayerTotalAndPlusMinusAllCourses(tournament, p, p.allAssignedCourses);
                    return { ...p, cachedPM: pmResult.pm ?? 0 };
                });

                // plusMinus(±타수) 기준 오름차순 정렬, tieBreak(백카운트) 적용
                playersWithPM.sort((a: any, b: any) => {
                    if (a.cachedPM !== b.cachedPM) return a.cachedPM - b.cachedPM;
                    return tieBreak(a, b, coursesForBackcount);
                });

                // 1위 동점자 처리: 최소 pm만 1위
                const minPM = playersWithPM[0].cachedPM;
                let rank = 1;
                let oneRankCount = 0;
                for (let i = 0; i < playersWithPM.length; i++) {
                    if (playersWithPM[i].cachedPM === minPM) {
                        playersWithPM[i].rank = 1;
                        oneRankCount++;
                    } else {
                        break;
                    }
                }
                // 2위 이하(실제로는 1위 동점자 수+1 등수부터) 백카운트 등수 부여
                rank = oneRankCount + 1;
                for (let i = oneRankCount; i < playersWithPM.length; i++) {
                    const prev = playersWithPM[i - 1];
                    const curr = playersWithPM[i];
                    if (
                        curr.cachedPM === prev.cachedPM &&
                        tieBreak(curr, prev, coursesForBackcount) === 0
                    ) {
                        curr.rank = playersWithPM[i - 1].rank;
                    } else {
                        curr.rank = rank;
                    }
                    rank++;
                }

                // 캐시된 PM 제거 (원본 객체 유지)
                playersToSort.length = 0;
                playersToSort.push(...playersWithPM.map(({ cachedPM, ...p }) => p));
            }
            const finalPlayers = [...playersToSort, ...otherPlayers.map((p: any) => ({ ...p, rank: null }))];
            rankedData[groupName] = finalPlayers;
        }

        return rankedData;
    }, [players, scores, tournament, groupsData, individualSuddenDeathData, teamSuddenDeathData]);

    // 모든 그룹 목록 (groupsData에서 가져오기 - 서든데스 진행 여부와 관계없이 모든 그룹 표시)
    const allGroupsList = useMemo(() => {
        const groups = Object.keys(groupsData).filter(groupName => {
            const groupData = (groupsData as any)[groupName];
            return groupData && (groupData.type === 'individual' || groupData.type === 'team');
        });
        return groups.sort();
    }, [groupsData]);

    const groupProgress = useMemo(() => {
        const progressByGroup: { [key: string]: number } = {};
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);

        // 선택된 그룹만 우선 계산 (최적화)
        const groupsToCalculate = filterGroup === 'all'
            ? Object.keys(processedDataByGroup)
            : [filterGroup];

        for (const groupName of groupsToCalculate) {
            const groupPlayers = processedDataByGroup[groupName];
            if (!groupPlayers || groupPlayers.length === 0) {
                progressByGroup[groupName] = 0; continue;
            }
            const playerGroupData = groupsData[groupName];
            const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter((id: string) => playerGroupData.courses[id]) : [];
            const coursesForGroup = allCourses.filter((c: any) => assignedCourseIds.includes(c.id.toString()) && c.isActive !== false);

            if (!coursesForGroup || coursesForGroup.length === 0) {
                progressByGroup[groupName] = 0; continue;
            }
            const totalPossibleScoresInGroup = groupPlayers.length * coursesForGroup.length * 9;
            if (totalPossibleScoresInGroup === 0) {
                progressByGroup[groupName] = 0; continue;
            }
            let totalScoresEnteredInGroup = 0;
            groupPlayers.forEach((player: any) => {
                if ((scores as any)[player.id]) {
                    const allAssignedCourseIds = coursesForGroup.map((c: any) => c.id.toString());
                    for (const courseId in (scores as any)[player.id]) {
                        if (allAssignedCourseIds.includes(courseId)) {
                            totalScoresEnteredInGroup += Object.keys((scores as any)[player.id][courseId]).length;
                        }
                    }
                }
            });
            const progress = Math.round((totalScoresEnteredInGroup / totalPossibleScoresInGroup) * 100);
            progressByGroup[groupName] = isNaN(progress) ? 0 : progress;
        }
        return progressByGroup;
    }, [processedDataByGroup, scores, groupsData, tournament.courses, filterGroup]);

    const processSuddenDeath = (suddenDeathData: any) => {
        if (!suddenDeathData?.isActive || !suddenDeathData.players || !Array.isArray(suddenDeathData.holes)) return [];

        const participatingPlayerIds = Object.keys(suddenDeathData.players).filter(id => suddenDeathData.players[id]);
        const allPlayersMap = new Map(Object.entries(players).map(([id, p]) => [id, p]));

        const results: any[] = participatingPlayerIds.map(id => {
            const playerInfo: any = allPlayersMap.get(id);
            if (!playerInfo) return null;

            const name = playerInfo.type === 'team' ? `${playerInfo.p1_name} / ${playerInfo.p2_name}` : playerInfo.name;
            const club = playerInfo.type === 'team' ? playerInfo.p1_affiliation : playerInfo.affiliation;

            const scoresPerHole: { [hole: string]: number | null } = {};
            let totalScore = 0;
            let holesPlayed = 0;
            suddenDeathData.holes.forEach((hole: number) => {
                const score = suddenDeathData.scores?.[id]?.[hole];
                if (score !== undefined && score !== null) {
                    scoresPerHole[hole] = score;
                    totalScore += score;
                    holesPlayed++;
                } else {
                    scoresPerHole[hole] = null;
                }
            });
            return { id, name, club, scoresPerHole, totalScore, holesPlayed };
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

    const processedIndividualSuddenDeathData = useMemo(() => processSuddenDeath(individualSuddenDeathData), [individualSuddenDeathData, players]);
    const processedTeamSuddenDeathData = useMemo(() => processSuddenDeath(teamSuddenDeathData), [teamSuddenDeathData, players]);

    // 백카운트/NTP 적용된 1위 동점자들의 순위를 다시 계산하는 함수 (기존 로직 활용)
    const applyPlayoffRanking = (data: any) => {
        // 깊은 복사 대신 얕은 복사 사용 (성능 최적화)
        // 탑 레벨 객체만 복사하고, 내부 배열/객체는 필요할 때 복사
        const finalData = { ...data };
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);

        for (const groupName in finalData) {
            const originalGroupPlayers = finalData[groupName];
            if (!originalGroupPlayers || originalGroupPlayers.length === 0) continue;

            // 1위 동점자들 찾기
            const firstPlacePlayers = originalGroupPlayers.filter((p: any) => p.rank === 1);

            if (firstPlacePlayers.length > 1) {
                // 수정이 필요한 그룹만 배열 복사
                const groupPlayers = [...originalGroupPlayers];
                finalData[groupName] = groupPlayers;
                const playerType = firstPlacePlayers[0].type;
                const isIndividual = playerType === 'individual';

                // NTP 순위 적용 확인
                const ntpData = isIndividual ? individualNTPData : teamNTPData;
                const shouldApplyNTP = ntpData?.isActive && ntpData?.rankings;

                // 백카운트 적용 확인 (그룹별 구조 지원)
                const backcountState = isIndividual ? individualBackcountApplied : teamBackcountApplied;
                const shouldApplyBackcount = typeof backcountState === 'boolean'
                    ? backcountState
                    : (backcountState && (backcountState[groupName] || (filterGroup === 'all' && Object.values(backcountState).some(v => v === true))));

                if (shouldApplyNTP) {
                    // NTP 순위 적용
                    const ntpRankings = ntpData.rankings;
                    firstPlacePlayers.forEach((player: any) => {
                        if (ntpRankings[player.id]) {
                            player.rank = ntpRankings[player.id];
                        }
                    });

                    // 전체 그룹을 다시 정렬
                    groupPlayers.sort((a: any, b: any) => {
                        const rankA = a.rank === null ? Infinity : (a.rank as number);
                        const rankB = b.rank === null ? Infinity : (b.rank as number);
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
                    const allCoursesForGroup = firstPlacePlayers[0]?.allAssignedCourses || allCourses;
                    // 코스 순서대로 정렬 (order가 큰 것이 마지막)
                    const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                        const orderA = coursesOrder[String(a.id)];
                        const orderB = coursesOrder[String(b.id)];

                        // 그룹의 courses에서 순서 가져오기, 없으면 코스의 order 사용
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
                    // 백카운트는 마지막 코스부터 역순이므로 reverse
                    const sortedCoursesForBackcount = [...coursesForGroup].reverse();

                    // firstPlacePlayers는 이미 groupPlayers의 요소들을 참조하므로
                    // 여기서 정렬하고 속성을 변경하면 groupPlayers에도 반영됨 (얕은 복사이므로)
                    // 하지만 안전을 위해 수정된 객체로 교체하는 것이 좋음

                    const playersToUpdate = [...firstPlacePlayers];

                    playersToUpdate.sort((a: any, b: any) => {
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

                    // 새로운 순위 부여 및 객체 업데이트
                    let rank = 1;

                    // 정렬된 순서대로 랭킹 부여 및 원본 배열 업데이트 준비
                    const updatedFirstPlaceMap = new Map();

                    // 첫 번째 선수 처리
                    const firstPlayer = playersToUpdate[0];
                    // 객체 불변성을 위해 복사
                    const updatedFirstPlayer = { ...firstPlayer, rank: rank };
                    updatedFirstPlaceMap.set(firstPlayer.id, updatedFirstPlayer);

                    for (let i = 1; i < playersToUpdate.length; i++) {
                        const prev = playersToUpdate[i - 1]; // 정렬된 배열의 이전 요소
                        const curr = playersToUpdate[i];     // 정렬된 배열의 현재 요소

                        // 비교를 위해 원본 데이터 사용 (rank는 아직 수정 전)

                        // plusMinus가 다르거나 백카운트 비교 결과가 다르면 순위 증가
                        let isDifferent = false;
                        if (curr.plusMinus !== prev.plusMinus) {
                            isDifferent = true;
                        } else {
                            // 백카운트 비교
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
                        }

                        if (isDifferent) {
                            rank = i + 1;
                        }

                        // 객체 업데이트
                        const updatedPlayer = { ...curr, rank: rank };
                        updatedFirstPlaceMap.set(curr.id, updatedPlayer);
                    }

                    // groupPlayers 배열 업데이트 (변경된 선수만 교체)
                    for (let i = 0; i < groupPlayers.length; i++) {
                        const p = groupPlayers[i];
                        if (updatedFirstPlaceMap.has(p.id)) {
                            groupPlayers[i] = updatedFirstPlaceMap.get(p.id);
                        }
                    }

                    // 전체 그룹을 다시 정렬
                    groupPlayers.sort((a: any, b: any) => {
                        const rankA = a.rank === null ? Infinity : (a.rank as number);
                        const rankB = b.rank === null ? Infinity : (b.rank as number);
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
            // 깊은 복사 대신 얕은 복사 - finalDataByGroup은 여기서 새로 생성되므로
            // processedDataByGroup의 내용을 복사해서 사용해야 함
            finalData = {};
            for (const key in processedDataByGroup) {
                finalData[key] = [...processedDataByGroup[key]]; // 배열 얕은 복사
            }

            for (const groupName in finalData) {
                // 배열 요소(플레이어 객체)도 수정해야 하므로 필요한 경우 객체 복사
                // (map을 사용하여 새로운 객체 배열 생성)
                finalData[groupName] = finalData[groupName].map((originalPlayer: ProcessedPlayer) => {
                    if (combinedRankMap.has(originalPlayer.id)) {
                        return { ...originalPlayer, rank: combinedRankMap.get(originalPlayer.id) as number };
                    }
                    return originalPlayer;
                });

                finalData[groupName].sort((a: any, b: any) => {
                    const rankA = a.rank === null ? Infinity : (a.rank as number);
                    const rankB = b.rank === null ? Infinity : (b.rank as number);
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
    }, [processedDataByGroup, processedIndividualSuddenDeathData, processedTeamSuddenDeathData, individualBackcountApplied, teamBackcountApplied, individualNTPData, teamNTPData, tournament.courses]); // filterGroup 제거: 순환 시 재계산 방지

    const visibleGroups = Object.keys(finalDataByGroup).filter(groupName => finalDataByGroup[groupName]?.some((player: any) => player.assignedCourses.length > 0));

    const groupsToDisplay = useMemo(() => {
        if (filterGroup === 'all') {
            return visibleGroups;
        }
        return visibleGroups.filter(g => g === filterGroup);
    }, [filterGroup, visibleGroups]);

    // finalDataByGroup의 최신 값을 참조하기 위한 ref
    const finalDataByGroupRef = useRef(finalDataByGroup);

    // 화면 분할 렌더링 (Lazy Rendering) 상태
    const [displayedGroupCount, setDisplayedGroupCount] = useState(1); // 처음에 1개만 렌더링

    useEffect(() => {
        // 그룹이 변경되거나 필터가 변경되면 초기화
        setDisplayedGroupCount(1);
    }, [filterGroup, groupsToDisplay.length]);

    useEffect(() => {
        // 순차적으로 렌더링 그룹 수 증가
        if (displayedGroupCount < groupsToDisplay.length) {
            const timer = setTimeout(() => {
                setDisplayedGroupCount(prev => Math.min(prev + 1, groupsToDisplay.length));
            }, 100); // 100ms 간격으로 하나씩 추가
            return () => clearTimeout(timer);
        }
    }, [displayedGroupCount, groupsToDisplay.length]);
    useEffect(() => {
        finalDataByGroupRef.current = finalDataByGroup;
    }, [finalDataByGroup]);

    // 순환 설정 불러오기 (Firebase 실시간 구독)
    const rotationSettingsLoadedRef = useRef(false);

    useEffect(() => {
        if (!initialDataLoaded || !db) return;

        const rotationRef = ref(db as any, 'tournaments/current/scoreboardRotation');

        const unsubRotation = onValue(rotationRef, (snap) => {
            const settings = snap.val();
            // console.log('Rotation Settings loaded:', settings); // Removed

            if (settings) {
                // 설정 업데이트
                if (settings.intervalMinutes !== undefined) {
                    // 분 단위를 초 단위로 변환 (기본값: 0.5분 = 30초)
                    const intervalSeconds = (settings.intervalMinutes || 0.5) * 60;
                    setRotationInterval(intervalSeconds);
                    rotationIntervalRef.current = intervalSeconds;
                }

                if (settings.selectedGroups && Array.isArray(settings.selectedGroups) && settings.selectedGroups.length > 0) {
                    setRotationGroups(settings.selectedGroups);
                    rotationGroupsRef.current = settings.selectedGroups;

                    // console.log('Rotation Check:', { // Removed
                    //     isActive: settings.isActive,
                    //     loaded: rotationSettingsLoadedRef.current,
                    //     groups: settings.selectedGroups,
                    //     initialDataLoaded: initialDataLoaded,
                    //     currentFilterGroup: filterGroup
                    // });

                    // 순환이 활성화되었거나, 설정이 로드되는 시점에 적절한 그룹을 표시
                    if (settings.isActive && settings.selectedGroups.length > 0) {
                        try {
                            const currentFinalData = finalDataByGroupRef.current || {};

                            // 1. 유효한(데이터가 있는) 그룹 찾기
                            let validGroupIndex = 0;
                            let foundValidGroup = false;

                            // 선택된 그룹들 중에서 데이터가 존재하는 첫 번째 그룹 인덱스 찾기
                            for (let i = 0; i < settings.selectedGroups.length; i++) {
                                const gName = settings.selectedGroups[i];
                                const gData = currentFinalData[gName];
                                // 그룹 데이터가 있고(배열), 선수가 1명이라도 있으면 유효한 그룹으로 판단
                                if (gData && Array.isArray(gData) && gData.length > 0) {
                                    validGroupIndex = i;
                                    foundValidGroup = true;
                                    // console.log(`Found valid group '${gName}' at index ${i} for initial rotation.`); // Removed
                                    break;
                                } else {
                                    // console.log(`Group '${gName}' at index ${i} is not valid (no data or no players).`); // Removed
                                }
                            }

                            // 2. 초기 로딩 시점에만 그룹 변경 (이미 사용자가 보고 있는 중이면 변경 안함)
                            // 단, 유효한 그룹을 찾았을 때만 변경함 (데이터가 없으면 변경 안함 -> 'No Data' 방지)
                            if (!rotationSettingsLoadedRef.current) {
                                if (foundValidGroup) {
                                    // console.log('Initializing Rotation Group to:', settings.selectedGroups[validGroupIndex]); // Removed
                                    currentRotationIndexRef.current = validGroupIndex;
                                    startTransition(() => {
                                        setFilterGroup(settings.selectedGroups[validGroupIndex]);
                                    });
                                    // 유효한 그룹을 찾아서 설정했을 때만 '로드 완료' 처리
                                    rotationSettingsLoadedRef.current = true;
                                } else {
                                    // 유효한 그룹이 하나도 없으면? 
                                    // 일단 넘어가고 다음 데이터 로드 시(onValue가 다시 불리거나 함) 다시 시도
                                    // console.log("No valid groups found yet"); // Removed
                                }
                            } else {
                                // console.log('Rotation settings already loaded, skipping initial group set.'); // Removed
                            }
                        } catch (e) {
                            console.error("Rotation init error:", e);
                        }
                    }
                }

                if (settings.isActive !== undefined) {
                    // 사용자가 아직 화면에서 직접 순환 체크박스를 건드리지 않은 경우에만
                    // Firebase 설정값으로 isRotationActive를 동기화
                    if (!hasUserToggledRotationRef.current) {
                        startTransition(() => {
                            setIsRotationActive(settings.isActive);
                        });
                    }
                }
            }
        });

        // 언서브 등록
        activeUnsubsRef.current.push(unsubRotation);

        return () => {
            // activeUnsubsRef에서 정리되므로 여기서 별도 정리 불필요하지만,
            // 명시적으로 component unmount 시 정리되는 것이 안전함.
            // (단, activeUnsubsRef 메커니즘을 따르므로 여기선 생략 가능)
        };
    }, [initialDataLoaded, db]); // initialDataLoaded가 true가 되면 실행 및 구독 시작

    // rotationInterval과 rotationGroups를 ref에 동기화
    useEffect(() => {
        rotationIntervalRef.current = rotationInterval;
    }, [rotationInterval]);

    useEffect(() => {
        rotationGroupsRef.current = rotationGroups;
    }, [rotationGroups]);

    // 순환 로직 실행 함수 (재사용을 위해 별도 함수로 분리)
    const startRotationInterval = useCallback(() => {
        // 기존 interval이 있으면 먼저 정리
        if (rotationIntervalIdRef.current) {
            clearInterval(rotationIntervalIdRef.current);
            rotationIntervalIdRef.current = null;
        }

        if (!isRotationActive) {
            return;
        }

        // rotationGroupsRef를 통해 최신 값 참조
        // ref가 아직 동기화되지 않았을 수 있으므로 state 값도 확인
        const currentGroups = rotationGroupsRef.current.length > 0
            ? rotationGroupsRef.current
            : rotationGroups;
        const currentInterval = rotationIntervalRef.current > 0
            ? rotationIntervalRef.current
            : rotationInterval;

        if (currentGroups.length === 0) {
            return;
        }

        // interval을 ref에 저장하여 리렌더링 시에도 유지
        rotationIntervalIdRef.current = setInterval(() => {
            // finalDataByGroupRef를 통해 최신 값 참조 (점수 입력 시에도 순환 유지)
            const currentFinalData = finalDataByGroupRef.current;
            // rotationGroupsRef를 통해 최신 값 참조 (없으면 state 값 사용)
            const currentRotationGroups = rotationGroupsRef.current.length > 0
                ? rotationGroupsRef.current
                : rotationGroups;

            // finalDataByGroup에서 선수가 있는 그룹만 필터링 (점수 유무와 관계없이 선수가 있으면 포함)
            const availableGroups = currentRotationGroups.filter(group => {
                const groupData = currentFinalData[group];
                // 그룹에 선수가 있으면 순환에 포함 (점수가 없어도 선수 이름이 있으면 표시)
                return groupData && Array.isArray(groupData) && groupData.length > 0;
            });

            if (availableGroups.length === 0) {
                // 순환 가능한 그룹이 없으면 순환 중지하지 않고 대기
                // (데이터가 아직 로딩 중일 수 있으므로)
                return;
            }

            // 현재 그룹이 availableGroups에 있는지 확인
            const currentGroup = currentRotationGroups[currentRotationIndexRef.current];
            if (!availableGroups.includes(currentGroup)) {
                // 현재 그룹에 선수가 없으면 availableGroups의 첫 번째 그룹으로 이동
                const newIndex = currentRotationGroups.indexOf(availableGroups[0]);
                if (newIndex !== -1) {
                    currentRotationIndexRef.current = newIndex;
                    startTransition(() => {
                        setFilterGroup(availableGroups[0]);
                    });
                }
                return;
            }

            // 다음 그룹으로 이동 (선수가 있는 그룹만)
            let nextIndex = (currentRotationIndexRef.current + 1) % currentRotationGroups.length;
            let attempts = 0;
            const maxAttempts = currentRotationGroups.length;

            // 선수가 있는 그룹을 찾을 때까지 순환
            while (!availableGroups.includes(currentRotationGroups[nextIndex]) && attempts < maxAttempts) {
                nextIndex = (nextIndex + 1) % currentRotationGroups.length;
                attempts++;
            }

            if (attempts < maxAttempts) {
                currentRotationIndexRef.current = nextIndex;
                startTransition(() => {
                    setFilterGroup(currentRotationGroups[nextIndex]);
                });
            }
        }, currentInterval * 1000);
    }, [isRotationActive, rotationGroups, rotationInterval]);

    // 그룹 순환 로직 (데이터가 있는 그룹만 순환) - finalDataByGroup 선언 이후에 위치
    // finalDataByGroup을 dependency에서 제거하여 점수 입력 시에도 순환이 멈추지 않도록 함
    // isRotationActive만 dependency로 사용하여 점수 입력 시 재실행되지 않도록 함
    // interval을 ref로 관리하여 리렌더링 시에도 유지
    useEffect(() => {
        startRotationInterval();

        return () => {
            if (rotationIntervalIdRef.current) {
                clearInterval(rotationIntervalIdRef.current);
                rotationIntervalIdRef.current = null;
            }
        };
    }, [isRotationActive, startRotationInterval]); // isRotationActive만 dependency로 사용하여 점수 입력 시 재실행되지 않도록 함

    // rotationInterval 변경 시 interval 재시작 (순환 시간 변경 반영)
    useEffect(() => {
        // 순환이 활성화되어 있고 interval이 실행 중일 때만 재시작
        if (isRotationActive && rotationIntervalIdRef.current) {
            startRotationInterval();
        }
    }, [rotationInterval, isRotationActive, startRotationInterval]); // rotationInterval 변경 시 interval 재시작

    // 선수별 점수 로그 캐시 상태 (playerId별) - 관리자 대시보드와 동일한 구조 사용
    const [playerScoreLogs, setPlayerScoreLogs] = useState<{ [playerId: string]: ScoreLog[] }>({});
    // 로딩 상태
    const [logsLoading, setLogsLoading] = useState(false);

    // 선수별 로그 최적화된 로딩 (점수 변경 시 즉시 로딩 + 화면 렌더링에 맞춰 지연 로딩)
    useEffect(() => {
        const fetchLogs = async () => {
            if (Object.keys(finalDataByGroup).length === 0) return;

            setLogsLoading(true);

            // [최적화] 화면에 렌더링되는 그룹의 선수들에 대해서만 먼저 로그를 조회합니다.
            // displayedGroupCount가 증가함에 따라 추가적인 로그 조회가 발생합니다.
            const displayedGroups = groupsToDisplay.slice(0, displayedGroupCount);

            // 아직 로딩되지 않은 그룹이 있다면 미리 로딩 (스크롤을 빨리 내리는 경우 대비 + 여유분)
            if (displayedGroupCount < groupsToDisplay.length) {
                // 다음 2개 그룹 정도는 미리 데이터 준비
                const nextGroups = groupsToDisplay.slice(displayedGroupCount, displayedGroupCount + 2);
                displayedGroups.push(...nextGroups);
            }

            const playersInScope = displayedGroups.flatMap(groupName => finalDataByGroup[groupName] || []);

            // 수정된 점수가 있는 선수만 로그 로딩 (최적화)
            const playersWithScores = playersInScope
                .filter((p: any) => p.hasAnyScore) // 점수가 있는 선수만
                .map((p: any) => p.id);

            // 기존 로그 캐시에 추가하기 위해 현재 상태 복사 (shallow copy로 충분)
            const updatedLogsLookup = { ...playerScoreLogs };

            // 새로운 선수만 로그 로딩
            const existingPlayerIds = Object.keys(playerScoreLogs);
            const newPlayerIds = playersWithScores.filter(pid => !existingPlayerIds.includes(pid));

            if (newPlayerIds.length > 0) {
                // 병렬 처리하되, 한 번에 너무 많은 요청이 가지 않도록 배치 처리 고려 가능하지만,
                // 여기서는 displayedGroups로 이미 제한되었으므로 Promise.all 사용
                await Promise.all(newPlayerIds.map(async (pid) => {
                    try {
                        const logs = await getPlayerScoreLogsOptimized(pid);
                        // 관리자 대시보드와 동일하게 배열 형태로 저장
                        updatedLogsLookup[pid] = logs;
                    } catch (error) {
                        console.error(`기본 로그 로딩 실패 - 선수 ${pid}:`, error);
                        updatedLogsLookup[pid] = [];
                    }
                }));

                setPlayerScoreLogs(updatedLogsLookup);
            }

            setLogsLoading(false);
        };

        // 점수 변경 시 즉시 로그 로딩 (실시간성 보장)
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finalDataByGroup, lastUpdateTime, displayedGroupCount, groupsToDisplay]);

    // 실시간 업데이트를 위한 점수 변경 감지 (Firebase 호출 최소화)
    useEffect(() => {
        if (changedPlayerIds.length === 0) return;

        const updateLogsForChangedScores = async () => {
            // 변경된 선수 ID를 복사 (비동기 처리 중 변경 방지)
            const playerIdsToUpdate = [...changedPlayerIds];

            if (playerIdsToUpdate.length === 0) return;

            // 로그가 Firebase에 저장되는 시간을 고려하여 약간의 지연 추가
            // 점수 변경과 로그 저장이 거의 동시에 일어나므로, 로그 저장 완료를 기다림
            await new Promise(resolve => setTimeout(resolve, 500));

            // 변경된 선수들의 로그만 업데이트 (Firebase 호출 최소화)
            for (const playerId of playerIdsToUpdate) {
                try {
                    // 캐시가 이미 무효화되었으므로, Firebase에서 최신 로그를 가져옴
                    const logs = await getPlayerScoreLogsOptimized(playerId);

                    // 관리자 대시보드와 동일하게 배열 형태로 저장
                    setPlayerScoreLogs((prev: any) => ({
                        ...prev,
                        [playerId]: logs
                    }));
                } catch (error) {
                    console.error(`로그 로딩 실패 - 선수 ${playerId}:`, error);
                    // 에러 발생 시 빈 배열로 설정
                    setPlayerScoreLogs((prev: any) => ({
                        ...prev,
                        [playerId]: []
                    }));
                }
            }

            // 처리 완료된 선수들만 제거 (새로운 변경사항은 유지)
            setChangedPlayerIds((prev: string[]) => {
                return prev.filter(id => !playerIdsToUpdate.includes(id));
            });
        };

        updateLogsForChangedScores();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastUpdateTime]); // lastUpdateTime 변경 시 실행 (심판/관리자 모두 동일)




    // 그룹별 현재 진행중인 코스와 진행률 계산 함수 (useCallback으로 최적화)
    const getCurrentCourseAndProgress = useCallback((groupName: string) => {
        const groupPlayers = finalDataByGroup[groupName];
        if (!groupPlayers || groupPlayers.length === 0) return { courseName: null, progress: null };
        const playerGroupData = groupsData[groupName];
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);
        const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter((id: string) => playerGroupData.courses[id]) : [];
        const coursesForGroup = allCourses.filter((c: any) => assignedCourseIds.includes(c.id.toString()) && c.isActive !== false);
        if (!coursesForGroup || coursesForGroup.length === 0) return { courseName: null, progress: null };

        let currentCourse: any = null;
        let currentProgress: number | null = null;
        for (const course of coursesForGroup as any[]) {
            let totalScoresEntered = 0;
            groupPlayers.forEach((player: any) => {
                const scoresForCourse = (scores as any)[player.id]?.[course.id];
                if (scoresForCourse) {
                    totalScoresEntered += Object.keys(scoresForCourse).length;
                }
            });
            const totalPossible = groupPlayers.length * 9;
            if (totalScoresEntered < totalPossible) {
                currentCourse = course;
                currentProgress = Math.round((totalScoresEntered / totalPossible) * 100);
                break;
            }
        }
        if (!currentCourse) {
            currentCourse = coursesForGroup[coursesForGroup.length - 1];
            let totalScoresEntered = 0;
            groupPlayers.forEach((player: any) => {
                const scoresForCourse = (scores as any)[player.id]?.[currentCourse.id];
                if (scoresForCourse) {
                    totalScoresEntered += Object.keys(scoresForCourse).length;
                }
            });
            const totalPossible = groupPlayers.length * 9;
            currentProgress = Math.round((totalScoresEntered / totalPossible) * 100);
        }
        return { courseName: currentCourse?.name || null, progress: currentProgress };
    }, [finalDataByGroup, groupsData, tournament.courses, scores]);

    // 이벤트 핸들러 고정 (useCallback)
    const handleGroupFilterChange = useCallback((value: string) => {
        if (isMobile) {
            setForceGroupSelectorVisible(false);
        }
        setTimeout(() => {
            startTransition(() => {
                setFilterGroup(value);
                if (isRotationActive) {
                    setIsRotationActive(false);
                }
            });
        }, 10);
    }, [isMobile, isRotationActive]);

    const handleRotationToggle = useCallback((checked: boolean) => {
        const newValue = checked === true;
        hasUserToggledRotationRef.current = true;
        startTransition(() => {
            setIsRotationActive(newValue);
            if (newValue) {
                const baseGroups = (rotationGroupsRef.current && rotationGroupsRef.current.length > 0)
                    ? rotationGroupsRef.current
                    : (rotationGroups.length > 0 ? rotationGroups : allGroupsList);
                const firstValidGroup = baseGroups.find(g => visibleGroups.includes(g));
                if (firstValidGroup) {
                    const idxInRotation = rotationGroups.indexOf(firstValidGroup);
                    currentRotationIndexRef.current = idxInRotation >= 0 ? idxInRotation : 0;
                    setFilterGroup(firstValidGroup);
                }
            }
        });
        try {
            safeLocalStorageSetItem('scoreboardRotation', JSON.stringify({
                isActive: newValue,
                intervalSeconds: rotationInterval,
                selectedGroups: rotationGroups
            }));
        } catch (error) {
            console.error('순환 설정 저장 실패:', error);
        }
    }, [allGroupsList, rotationGroups, rotationInterval, visibleGroups]);

    const handleRotationGroupToggle = useCallback((group: string, checked: boolean) => {
        let newGroups: string[];
        if (checked) {
            newGroups = [...rotationGroups, group];
        } else {
            newGroups = rotationGroups.filter(g => g !== group);
        }
        startTransition(() => {
            setRotationGroups(newGroups);
        });
        try {
            safeLocalStorageSetItem('scoreboardRotation', JSON.stringify({
                isActive: isRotationActive,
                intervalSeconds: rotationInterval,
                selectedGroups: newGroups
            }));
        } catch (error) {
            console.error('순환 설정 저장 실패:', error);
        }
    }, [isRotationActive, rotationGroups, rotationInterval]);

    const handleRotationIntervalChange = useCallback((value: string) => {
        const newInterval = parseInt(value);
        startTransition(() => {
            setRotationInterval(newInterval);
        });
        try {
            safeLocalStorageSetItem('scoreboardRotation', JSON.stringify({
                isActive: isRotationActive,
                intervalSeconds: newInterval,
                selectedGroups: rotationGroups
            }));
        } catch (error) {
            console.error('순환 설정 저장 실패:', error);
        }
    }, [isRotationActive, rotationGroups]);

    const handleScroll = useCallback((delta: number) => () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ top: delta, behavior: 'smooth' });
        }
    }, []);

    if (loading) {
        return (
            <div className="bg-black min-h-screen text-white p-8 flex items-center justify-center">
                <p className="text-2xl font-bold">{t('loading')}</p>
            </div>
        );
    }

    const NoDataContent = () => {
        // 순환이 활성화된 상태에서는 "그룹에 표시할 데이터가 없습니다" 문구가
        // 사용성을 해치므로, 해당 문구는 순환 비활성 상태에서만 노출되도록 조정
        const noDataMessage =
            Object.keys(players).length === 0
                ? t('noData')
                : (groupsToDisplay.length === 0 && filterGroup !== 'all' && !isRotationActive
                    ? t('noGroupData')
                    : t('noCourse'));

        return (
            <div className="bg-black min-h-screen text-white p-8">
                <div className="text-center py-20">
                    <h1 className="text-4xl font-bold">{tournament.name || (currentLang === 'ko' ? '파크골프 토너먼트' : 'Park Golf Tournament')}</h1>
                    <p className="mt-4 text-2xl text-gray-400">
                        {noDataMessage}
                    </p>
                </div>
            </div>
        );
    };

    const SuddenDeathTable = ({ type, data, processedData }: { type: 'individual' | 'team', data: any, processedData: any[] }) => {
        const title = type === 'individual' ? t('suddenDeathIndividual') : t('suddenDeathTeam');
        const courseName = data?.courseId && tournament?.courses?.[data.courseId]?.name;

        return (
            <div className="mb-6">
                <header className="flex flex-col justify-center items-center sb-group-header pb-2 mb-2 text-center">
                    <h1 className="text-2xl md:text-4xl font-bold sb-title flex items-center gap-3">
                        <Flame className="h-8 w-8 animate-pulse" />
                        {title}
                        <Flame className="h-8 w-8 animate-pulse" />
                    </h1>
                    {courseName && (
                        <p className="text-lg md:text-xl font-semibold text-gray-400 mt-1">
                            ({courseName})
                        </p>
                    )}
                </header>
                <div className="overflow-x-auto rounded-lg border-2 border-[color:var(--sb-border-color)]">
                    <table className="w-full text-center border-collapse sb-table">
                        <thead className="sb-table-head text-base">
                            <tr className="sb-th">
                                <th className="py-2 px-2 w-48 text-center align-middle font-bold sb-th">{t('playerName')}</th>
                                <th className="py-2 px-2 w-48 text-center align-middle font-bold sb-th">{t('club')}</th>
                                {data.holes?.sort((a: number, b: number) => a - b).map((hole: number) => <th key={hole} className="py-2 px-2 w-16 text-center align-middle font-bold sb-th">{hole}{currentLang === 'ko' ? '홀' : ''}</th>)}
                                <th className="py-2 px-2 min-w-[5rem] text-center align-middle font-bold sb-th">{t('sum')}</th>
                                <th className="py-2 px-2 min-w-[5rem] text-center align-middle font-bold">{t('rank')}</th>
                            </tr>
                        </thead>
                        <tbody className="text-xl">
                            {processedData.map(player => (
                                <tr key={player.id} className="border-b border-[color:var(--sb-cell-border)] last:border-0">
                                    <td className="py-1 px-2 text-center align-middle font-semibold sb-td sb-td-info">{player.name}</td>
                                    <td className="py-1 px-2 text-center align-middle opacity-70 sb-td sb-td-info">{player.club}</td>
                                    {data.holes.map((hole: number) => <td key={hole} className="py-1 px-2 align-middle font-mono font-bold text-2xl sb-td">{player.scoresPerHole[hole] ?? '-'}</td>)}
                                    <td className="py-1 px-2 align-middle font-bold text-2xl sb-td">{player.totalScore}</td>
                                    <td className="py-1 px-2 align-middle font-bold sb-rank text-2xl">{formatRank(player.rank, currentLang)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }


    return (
        <>
            <style>{`
                .scoreboard-container::-webkit-scrollbar { display: none; }
                .scoreboard-container { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
            <div
                ref={scrollContainerRef}
                className="scoreboard-container h-screen overflow-y-auto p-2 sm:p-4 md:p-6 font-sans"
                data-theme={theme}
            >
                {individualSuddenDeathData?.isActive && (
                    <SuddenDeathTable type="individual" data={individualSuddenDeathData} processedData={processedIndividualSuddenDeathData} />
                )}
                {teamSuddenDeathData?.isActive && (
                    <SuddenDeathTable type="team" data={teamSuddenDeathData} processedData={processedTeamSuddenDeathData} />
                )}

                {groupsToDisplay.length === 0 ? (
                    <NoDataContent />
                ) : (
                    groupsToDisplay.slice(0, displayedGroupCount).map((groupName) => (
                        <ScoreboardTable
                            key={groupName}
                            groupName={groupName}
                            groupPlayers={finalDataByGroup[groupName]}
                            tournament={tournament}
                            scores={scores}
                            currentLang={currentLang}
                            playerScoreLogs={playerScoreLogs}
                            t={t}
                            translateGroupName={translateGroupName}
                            translateCourseName={translateCourseName}
                            groupProgressValue={groupProgress[groupName]}
                            isMobile={isMobile}
                        />
                    ))
                )}
            </div>
            {/* 왼쪽 위: 언어 선택 - 모바일에서는 숨김 */}
            {
                !isMobile && (
                    <div className="fixed left-4 flex items-center gap-4 z-50 group/lang" style={{ height: '36px', top: '3rem' }}>
                        <div className="flex items-center gap-2 opacity-0 group-hover/lang:opacity-100 transition-opacity duration-300 h-full">
                            <Globe className="h-5 w-5 text-gray-400" />
                            <Label htmlFor="language-select" className="font-bold text-sm text-gray-300">{t('language')}</Label>
                            <Select value={languageMode} onValueChange={(v) => setLanguageMode(v as 'korean' | 'english' | 'cycle')}>
                                <SelectTrigger id="language-select" className="w-[120px] h-9 bg-gray-800/80 backdrop-blur-sm border-gray-600 text-white focus:ring-yellow-400">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-900 text-white border-gray-700">
                                    <SelectItem value="korean">{t('korean')}</SelectItem>
                                    <SelectItem value="english">{t('english')}</SelectItem>
                                    <SelectItem value="cycle">{t('cycle')} (10s)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {/* 순환 모드 표시 */}
                        {languageMode === 'cycle' && (
                            <div className="text-xs text-yellow-400 animate-pulse flex items-center h-full">
                                {currentLang === 'ko' ? '🇰🇷' : '🇺🇸'}
                            </div>
                        )}
                    </div>
                )
            }

            {/* 왼쪽 위: 테마 선택 (언어 선택 아래) - 모바일에서는 숨김 */}
            {
                !isMobile && (
                    <div className="fixed left-4 flex items-center gap-4 z-50 group/theme" style={{ height: '36px', top: '6rem' }}>
                        <div className="flex items-center gap-2 opacity-0 group-hover/theme:opacity-100 transition-opacity duration-300 h-full">
                            <Palette className="h-5 w-5 text-gray-400" />
                            <Label htmlFor="theme-select" className="font-bold text-sm text-gray-300">{t('theme')}</Label>
                            <Select value={theme} onValueChange={(v) => setTheme(v as 'dark' | 'grey' | 'light')}>
                                <SelectTrigger id="theme-select" className="w-[120px] h-9 sb-select-trigger backdrop-blur-sm focus:ring-yellow-400">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="sb-select-content">
                                    <SelectItem value="dark">{t('dark')}</SelectItem>
                                    <SelectItem value="grey">{t('grey')}</SelectItem>
                                    <SelectItem value="light">{t('light')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )
            }

            {/* 오른쪽 위: 그룹 선택 및 설정 */}
            <div className="fixed top-4 right-4 flex flex-col items-end gap-2 z-50 group">
                <div className="flex items-center gap-4">
                    <GroupSelector
                        filterGroup={filterGroup}
                        allGroupsList={allGroupsList}
                        translateGroupName={translateGroupName}
                        currentLang={currentLang}
                        onValueChange={handleGroupFilterChange}
                        forceGroupSelectorVisible={forceGroupSelectorVisible}
                        isRotationActive={isRotationActive}
                        rotationGroups={rotationGroups}
                        t={t}
                    />

                    {!isMobile && (
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleScroll(-500)}
                                aria-label="Scroll Up"
                                className={cn(
                                    "bg-gray-800/70 text-white p-2 rounded-full hover:bg-gray-700 transition-opacity duration-300",
                                    forceGroupSelectorVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}
                            >
                                <ChevronUp className="h-6 w-6" />
                            </button>
                            <button
                                onClick={handleScroll(500)}
                                aria-label="Scroll Down"
                                className={cn(
                                    "bg-gray-800/70 text-white p-2 rounded-full hover:bg-gray-700 transition-opacity duration-300",
                                    forceGroupSelectorVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}
                            >
                                <ChevronDown className="h-6 w-6" />
                            </button>
                        </div>
                    )}
                </div>

                {/* 모바일 테마 선택: 그룹 선택 하단 영역 터치 시 노출 (PC 버전은 2865행의 기존 코드 유지) */}
                {isMobile && (
                    <div className="group/mobile-theme flex flex-col items-end w-full pt-4 min-h-[50px]">
                        <div className="opacity-0 group-hover/mobile-theme:opacity-100 transition-opacity duration-300 flex items-center gap-2">
                            <Palette className="h-5 w-5 text-gray-400" />
                            <Label htmlFor="theme-select-mobile" className="font-bold text-sm text-gray-300">{t('theme')}</Label>
                            <Select value={theme} onValueChange={(v) => setTheme(v as 'dark' | 'grey' | 'light')}>
                                <SelectTrigger id="theme-select-mobile" className="w-[120px] h-9 sb-select-trigger backdrop-blur-sm focus:ring-yellow-400">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="sb-select-content">
                                    <SelectItem value="dark">{t('dark')}</SelectItem>
                                    <SelectItem value="grey">{t('grey')}</SelectItem>
                                    <SelectItem value="light">{t('light')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}

                {!isMobile && (
                    <RotationSettings
                        isRotationActive={isRotationActive}
                        allGroupsList={allGroupsList}
                        rotationGroups={rotationGroups}
                        rotationInterval={rotationInterval}
                        translateGroupName={translateGroupName}
                        currentLang={currentLang}
                        onRotationToggle={handleRotationToggle}
                        onGroupToggle={handleRotationGroupToggle}
                        onIntervalChange={handleRotationIntervalChange}
                        t={t}
                    />
                )}
            </div>
        </>
    );
}

function isValidNumber(v: any) { return typeof v === 'number' && !isNaN(v); }



