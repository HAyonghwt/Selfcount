"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useParams, useRouter } from 'next/navigation';
import {
    ChevronLeft,
    Search,
    MapPin,
    Calendar,
    ChevronDown,
    ChevronUp,
    Trophy,
    Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// --- Types ---
interface PlayerCourseData {
    id: string;
    name: string;
    order: number;
    pars: number[];
    holeScores: (number | null)[];
    courseTotal: number;
    coursePlusMinus: number | null;
    courseRank?: number;
}

interface ProcessedPlayer {
    id: string;
    name: string;
    jo: string;
    affiliation: string;
    group: string;
    totalScore: number;
    plusMinus: number | null;
    rank: number | null;
    hasAnyScore: boolean;
    hasForfeited: boolean;
    forfeitType: string | null;
    courses: PlayerCourseData[];
}

// --- Dynamic Color Theme based on User Palette ---
// --- Helpers ---
const tieBreak = (a: ProcessedPlayer, b: ProcessedPlayer) => {
    if (a.hasForfeited && !b.hasForfeited) return 1;
    if (!a.hasForfeited && b.hasForfeited) return -1;
    if (!a.hasAnyScore && !b.hasAnyScore) return 0;
    if (!a.hasAnyScore) return 1;
    if (!b.hasAnyScore) return -1;

    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;

    // 코스들을 역순으로 정렬하여 비교 (마지막 코스부터)
    const aCourses = [...a.courses].sort((x, y) => (y.order || 0) - (x.order || 0));
    const bCourses = [...b.courses].sort((x, y) => (y.order || 0) - (x.order || 0));

    const maxLen = Math.max(aCourses.length, bCourses.length);
    for (let i = 0; i < maxLen; i++) {
        const cA = aCourses[i];
        const cB = bCourses[i];
        if (!cA && cB) return 1;
        if (cA && !cB) return -1;
        if (!cA && !cB) continue;

        if (cA.courseTotal !== cB.courseTotal) return cA.courseTotal - cB.courseTotal;

        // 홀별 백카운트 (9번 홀부터 1번 홀까지)
        for (let h = 8; h >= 0; h--) {
            const sA = cA.holeScores[h] || 0;
            const sB = cB.holeScores[h] || 0;
            if (sA !== sB) return sA - sB;
        }
    }
    return 0;
};

const getCourseTheme = (name: string) => {
    const uppercaseName = name.toUpperCase();
    if (uppercaseName.includes('A')) return { bg: "bg-red-50", text: "text-red-600", border: "border-red-100", accent: "bg-red-500", label: "A" };
    if (uppercaseName.includes('B')) return { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100", accent: "bg-[#3b82f6]", label: "B" };
    if (uppercaseName.includes('C')) return { bg: "bg-yellow-50", text: "text-amber-700", border: "border-amber-100", accent: "bg-[#facc15]", label: "C" };
    if (uppercaseName.includes('D')) return { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", accent: "bg-slate-400", label: "D" };

    const order = name.charCodeAt(0) % 4;
    if (order === 0) return { bg: "bg-red-50", text: "text-red-600", border: "border-red-100", accent: "bg-red-500", label: "E" };
    if (order === 1) return { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100", accent: "bg-[#3b82f6]", label: "F" };
    return { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-100", accent: "bg-slate-500", label: "?" };
};

// --- Scoring UI Component ---
function RelativeScore({ score, par, className }: { score: number | null, par: number, className?: string }) {
    if (score === null) return null;
    const diff = score - par;
    const colorClass = diff > 0 ? "text-red-600" : diff < 0 ? "text-blue-600" : "text-slate-400";
    const sign = diff > 0 ? "+" : "";
    return (
        <span className={cn("text-[11px] font-black", colorClass, className)}>
            {diff === 0 ? "E" : `${sign}${diff}`}
        </span>
    );
}

export default function GalleryDetailPage() {
    const params = useParams();
    const router = useRouter();
    const archiveId = params?.id as string;

    const [archiveData, setArchiveData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeGroup, setActiveGroup] = useState<string>("all");
    const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(30);
    const loadMoreRef = React.useRef<HTMLDivElement>(null);
    const [isRedirecting, setIsRedirecting] = useState(false);

    // 인앱 브라우저 강제 탈출 (카카오톡 등에서 외부 브라우저로 열기)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const userAgent = navigator.userAgent.toLowerCase();
        const targetUrl = window.location.href;

        // 1. 카카오톡 인앱 브라우저 감지
        if (userAgent.match(/kakaotalk/i)) {
            setIsRedirecting(true);
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

    // Reset visible count on filter change
    useEffect(() => {
        setVisibleCount(30);
    }, [activeGroup, searchTerm]);

    useEffect(() => {
        if (!db || !archiveId) return;
        const detailRef = ref(db, `archives-detail/${archiveId}`);
        const legacyRef = ref(db, `archives/${archiveId}`);

        const unsubscribe = onValue(detailRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                console.log('Gallery - Loaded from archives-detail:', {
                    hasPlayers: !!data.players,
                    playersCount: data.players ? Object.keys(data.players).length : 0,
                    hasScores: !!data.scores,
                    scoresCount: data.scores ? Object.keys(data.scores).length : 0,
                    hasCourses: !!data.courses,
                    coursesCount: data.courses ? Object.keys(data.courses).length : 0,
                    hasGroups: !!data.groups,
                    groupsCount: data.groups ? Object.keys(data.groups).length : 0,
                    groupNames: data.groups ? Object.keys(data.groups) : []
                });
                setArchiveData(data);
                if (data?.groups) {
                    const groupNames = Object.keys(data.groups).sort();
                    if (groupNames.length > 0) setActiveGroup(groupNames[0]);
                }
                setLoading(false);
            } else {
                console.log('Gallery - archives-detail not found, trying legacy...');
                onValue(legacyRef, (legacySnap) => {
                    if (legacySnap.exists()) {
                        const data = legacySnap.val();
                        console.log('Gallery - Loaded from archives (legacy):', {
                            hasPlayers: !!data.players,
                            playersCount: data.players ? Object.keys(data.players).length : 0
                        });
                        setArchiveData(data);
                        const players = data.players || {};
                        const groupNames = Array.from(new Set(Object.values(players).map((p: any) => p.group))).sort() as string[];
                        if (groupNames.length > 0) setActiveGroup(groupNames[0]);
                    } else {
                        console.error('Gallery - No data found in archives-detail or archives');
                    }
                    setLoading(false);
                }, { onlyOnce: true });
            }
        });
        return () => unsubscribe();
    }, [archiveId]);

    // Data Processing
    const processedPlayers = useMemo(() => {
        if (!archiveData) {
            console.log('Gallery - processedPlayers: No archiveData');
            return [];
        }
        const playersObj = archiveData.players || {};
        const scoresObj = archiveData.scores || {};
        const coursesObj = archiveData.courses || {};
        const finalRanks = archiveData.finalRanks || {};
        const groupsObj = archiveData.groups || {};

        console.log('Gallery - Processing players:', {
            playersCount: Object.keys(playersObj).length,
            scoresCount: Object.keys(scoresObj).length,
            coursesCount: Object.keys(coursesObj).length,
            groupsCount: Object.keys(groupsObj).length,
            samplePlayer: Object.values(playersObj)[0]
        });

        const results = Object.keys(playersObj).map(pid => {
            const player = playersObj[pid];
            const pGroup = player.group || '미지정';
            const groupData = groupsObj[pGroup] || {};
            const assignedCourseIds = Object.keys(groupData.courses || {}).filter(cid => {
                const cVal = groupData.courses[cid];
                return typeof cVal === 'boolean' ? cVal : (typeof cVal === 'object' ? cVal.order > 0 : cVal > 0);
            });

            const rankInfo = finalRanks[pid] || {};
            const playerCourses: PlayerCourseData[] = assignedCourseIds.map(cid => {
                const course = coursesObj[cid] || { name: cid, pars: Array(9).fill(4) };
                const pHoleScores = scoresObj[pid]?.[cid] || {};
                const holeScoresArr = Array.from({ length: 9 }, (_, i) => {
                    const s = pHoleScores[i + 1];
                    return (s !== undefined && s !== null) ? Number(s) : null;
                });

                let cTotal = 0;
                let cParTotal = 0;
                let hasScore = false;
                holeScoresArr.forEach((s, idx) => {
                    if (s !== null) {
                        cTotal += s;
                        cParTotal += (course.pars?.[idx] || 0);
                        hasScore = true;
                    }
                });

                return {
                    id: cid,
                    name: course.name,
                    order: course.order || 0,
                    pars: course.pars || Array(9).fill(0),
                    holeScores: holeScoresArr,
                    courseTotal: cTotal,
                    coursePlusMinus: hasScore ? cTotal - cParTotal : null
                };
            }).sort((a, b) => a.order - b.order);

            const totalScore = rankInfo.totalScore ?? playerCourses.reduce((sum, c) => sum + (c.courseTotal || 0), 0);
            const plusMinus = rankInfo.plusMinus ?? (playerCourses.some(c => c.coursePlusMinus !== null)
                ? playerCourses.reduce((sum, c) => sum + (c.coursePlusMinus || 0), 0)
                : null
            );

            return {
                id: pid,
                name: player.name,
                jo: player.jo || '-',
                affiliation: player.affiliation || '-',
                group: pGroup,
                totalScore,
                plusMinus,
                rank: rankInfo.rank ?? null,
                hasAnyScore: playerCourses.some(c => c.courseTotal > 0),
                hasForfeited: playerCourses.some(c => c.holeScores.some(s => s === 0)),
                forfeitType: player.forfeitType || null,
                courses: playerCourses
            };
        });

        console.log('Gallery - Processed players:', {
            totalPlayers: results.length,
            playersWithScores: results.filter(p => p.hasAnyScore).length,
            groups: Array.from(new Set(results.map(p => p.group)))
        });

        // --- 각 코스별 그룹 내 순위 계산 로직 추가 ---
        const uniqueGroups = Array.from(new Set(results.map(p => p.group)));
        uniqueGroups.forEach(groupName => {
            const groupPlayers = results.filter(p => p.group === groupName);
            // 해당 그룹이 참여하는 모든 코스 ID 수집
            const courseIds = Array.from(new Set(groupPlayers.flatMap(p => p.courses.map(c => c.id))));

            courseIds.forEach(cid => {
                // 해당 코스를 완주한(점수가 있는) 선수들만 필터링하여 정렬
                const rankingList = groupPlayers
                    .filter(p => {
                        const c = p.courses.find(rc => rc.id === cid);
                        return c && c.courseTotal > 0 && !p.hasForfeited;
                    })
                    .map(p => ({
                        pid: p.id,
                        total: p.courses.find(rc => rc.id === cid)!.courseTotal
                    }))
                    .sort((a, b) => a.total - b.total);

                // 순위 부여 (동점자 처리 포함)
                let currentRank = 1;
                rankingList.forEach((item, index) => {
                    if (index > 0 && item.total > rankingList[index - 1].total) {
                        currentRank = index + 1;
                    }
                    // 결과를 원본 객체에 할당
                    const pObj = results.find(r => r.id === item.pid);
                    const cObj = pObj?.courses.find(rc => rc.id === cid);
                    if (cObj) cObj.courseRank = currentRank;
                });
            });
        });

        return results;
    }, [archiveData]);

    const groups = useMemo(() => {
        const set = new Set(processedPlayers.map(p => p.group));
        return Array.from(set).sort();
    }, [processedPlayers]);

    // Filtered Players
    const filteredPlayers = useMemo(() => {
        return processedPlayers.filter(p => {
            const matchesGroup = p.group === activeGroup;
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.affiliation.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesGroup && matchesSearch;
        }).sort((a, b) => {
            if (a.rank !== b.rank) {
                if (a.rank === null) return 1;
                if (b.rank === null) return -1;
                return a.rank - b.rank;
            }
            // 순위가 같으면 백카운트로 2차 정렬
            return tieBreak(a, b);
        });
    }, [processedPlayers, activeGroup, searchTerm]);

    const displayedPlayers = useMemo(() => {
        return filteredPlayers.slice(0, visibleCount);
    }, [filteredPlayers, visibleCount]);

    // Auto-load on scroll
    useEffect(() => {
        if (visibleCount >= filteredPlayers.length) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => Math.min(prev + 30, filteredPlayers.length));
            }
        }, { threshold: 0.1 });

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [visibleCount, filteredPlayers.length]);

    // Dynamic Course Column Headers (Simplified to A, B, C...)
    const courseLabels = useMemo(() => {
        const labels = new Set<string>();
        filteredPlayers.forEach(p => {
            p.courses.forEach(c => {
                const theme = getCourseTheme(c.name);
                labels.add(theme.label);
            });
        });
        return Array.from(labels).sort();
    }, [filteredPlayers]);

    const toggleExpand = (pid: string) => {
        setExpandedPlayerId(expandedPlayerId === pid ? null : pid);
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3b82f6]"></div></div>;

    return (
        <div className="min-h-screen bg-[#f8fafc] pb-20 font-sans">
            {isRedirecting && (
                <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center text-white p-4 font-bold text-lg text-center break-keep">
                    카카오 화면이 작아서<br />
                    구글 크롬으로 안전하게 열었습니다<br /><br />
                    이 화면은 닫아 주세요
                </div>
            )}
            {/* Header (Clean & Light) */}
            <div className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
                    <button onClick={() => router.push('/gallery')} className="p-2 hover:bg-slate-100 rounded-md transition-colors active:scale-95">
                        <ChevronLeft className="w-6 h-6 text-slate-700" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-black text-slate-900 truncate tracking-tight">
                            {archiveData?.tournamentName || archiveData?.name || '대회 결과'}
                        </h1>
                        <div className="flex items-center gap-3 text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-tight">
                            <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1 text-[#3b82f6]" />{archiveData?.tournamentStartDate || '-'}</span>
                            <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1 text-[#3b82f6]" />{archiveData?.location || '-'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Header Section */}
            <div className="max-w-5xl mx-auto px-2 pt-[72px]">

                {/* Search Bar & Tabs Grouped for Minimal Spacing */}
                <div className="space-y-3 px-2 mb-4">
                    {/* Search Bar */}
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#3b82f6] transition-colors" />
                        <Input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="선수명 또는 소속 클럽 검색"
                            className="pl-11 h-10 bg-white border-slate-200 rounded-md shadow-sm focus:ring-[#3b82f6] focus:border-[#3b82f6] text-sm font-bold"
                        />
                    </div>

                    {/* Group Filter Tabs (Scrollable) */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {groups.map(group => (
                            <button
                                key={group}
                                onClick={() => setActiveGroup(group)}
                                className={cn(
                                    "px-4 py-2 rounded-md transition-all border shrink-0 flex flex-col items-center min-w-[80px]",
                                    activeGroup === group
                                        ? "bg-[#3b82f6] text-white border-[#3b82f6] shadow-md scale-[1.02]"
                                        : "bg-white text-slate-500 border-slate-200 hover:border-[#3b82f6]/30 hover:bg-slate-50"
                                )}
                            >
                                <span className="text-[13px] font-black whitespace-nowrap leading-none mb-1">{group}</span>
                                <span className={cn(
                                    "text-[9px] font-bold uppercase tracking-tighter opacity-70",
                                    activeGroup === group ? "text-blue-100" : "text-slate-400"
                                )}>
                                    {group.includes('남자') ? "Men's" : group.includes('여자') ? "Women's" : "Division"}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Scoreboard Table (Sharp & Professional) */}
                <div className="bg-white rounded-md shadow-lg overflow-hidden border border-slate-200">
                    {/* Blue Table Header (User Palette) */}
                    <div className="bg-[#3b82f6] text-white flex items-center h-14 text-[11px] sm:text-[12px] font-black uppercase text-center border-b border-blue-600">
                        <div className="w-[14%] border-r border-white/20 h-full flex flex-col items-center justify-center leading-none">
                            <span>조</span>
                            <span className="text-[8px] text-blue-100 mt-0.5 opacity-80">GROUP</span>
                        </div>
                        <div className="w-[20%] border-r border-white/20 h-full flex flex-col items-center justify-center leading-none">
                            <span>이름</span>
                            <span className="text-[8px] text-blue-100 mt-0.5 opacity-80">NAME</span>
                        </div>
                        {courseLabels.map(label => (
                            <div key={label} className="flex-1 border-r border-white/20 h-full flex items-center justify-center">{label}</div>
                        ))}
                        <div className="w-[14%] border-r border-white/20 h-full flex flex-col items-center justify-center leading-none">
                            <span>합계</span>
                            <span className="text-[8px] text-blue-100 mt-0.5 opacity-80">TOTAL</span>
                        </div>
                        <div className="w-[14%] h-full flex flex-col items-center justify-center leading-none">
                            <span>순위</span>
                            <span className="text-[8px] text-blue-100 mt-0.5 opacity-80">RANK</span>
                        </div>
                    </div>

                    {/* Table Body */}
                    <div className="divide-y divide-slate-200">
                        {displayedPlayers.length === 0 ? (
                            <div className="py-20 text-center text-slate-400 font-bold italic">검색 결과가 없습니다.</div>
                        ) : (
                            displayedPlayers.map((player, index) => (
                                <React.Fragment key={player.id}>
                                    <div
                                        onClick={() => toggleExpand(player.id)}
                                        className={cn(
                                            "flex items-center text-center py-3.5 cursor-pointer relative transition-colors active:bg-blue-50",
                                            expandedPlayerId === player.id
                                                ? "bg-blue-50/50"
                                                : index % 2 === 1 ? "bg-slate-50/50 hover:bg-slate-100/80" : "bg-white hover:bg-slate-100/50"
                                        )}
                                    >
                                        <div className="w-[14%] border-r border-slate-100 h-full flex flex-col items-center justify-center leading-tight py-2">
                                            <span className="text-[9px] text-slate-400 font-bold mb-0.5 tracking-tighter truncate w-full px-1">{player.group}</span>
                                            <span className="text-base font-black text-slate-700">{player.jo}</span>
                                        </div>

                                        <div className="w-[20%] border-r border-slate-100 text-left pl-3 flex flex-col justify-center overflow-hidden">
                                            <div className="text-base font-black text-slate-700 leading-none mb-1.5 truncate">{player.name}</div>
                                            <div className="text-[10px] text-slate-400 font-bold truncate pr-1">{player.affiliation}</div>
                                        </div>

                                        {/* Dynamic Course Cells */}
                                        {courseLabels.map(label => {
                                            const course = player.courses.find(c => getCourseTheme(c.name).label === label);
                                            return (
                                                <div key={label} className="flex-1 border-r border-slate-100 text-lg font-black text-slate-700 h-full flex items-center justify-center">
                                                    {course ? course.courseTotal : ''}
                                                </div>
                                            );
                                        })}

                                        {/* Total Cell */}
                                        <div className="w-[14%] border-r border-slate-100 text-lg font-black text-[#3b82f6] h-full flex items-center justify-center bg-blue-50/20">
                                            {player.hasForfeited ? <span className="text-red-500 text-sm">기권</span> : player.totalScore}
                                        </div>

                                        <div className="w-[14%] h-full flex items-center justify-center">
                                            {player.rank ? (
                                                player.rank <= 3 ? (
                                                    <div className={cn(
                                                        "w-7 h-7 rounded-sm flex items-center justify-center font-black text-sm border shadow-sm",
                                                        player.rank === 1 ? "bg-amber-50 text-amber-600 border-amber-200" :
                                                            player.rank === 2 ? "bg-slate-50 text-slate-500 border-slate-200" : "bg-orange-50 text-orange-700 border-orange-100"
                                                    )}>
                                                        {player.rank}
                                                    </div>
                                                ) : <span className="font-black text-slate-600 text-base">{player.rank}</span>
                                            ) : '-'}
                                        </div>
                                    </div>

                                    {/* Expanded Detail Grid (Relative Scoring) */}
                                    {expandedPlayerId === player.id && (
                                        <div className="bg-slate-50 border-y border-blue-100 p-6 space-y-8 animate-in slide-in-from-top-2 duration-300">
                                            {player.courses.length === 0 ? (
                                                <div className="text-center py-4 text-slate-400 font-bold text-xs uppercase tracking-widest leading-loose">기록된 데이터가 없습니다.</div>
                                            ) : player.courses.map((course) => {
                                                const theme = getCourseTheme(course.name);
                                                const courseParTotal = course.pars.reduce((a, b) => a + b, 0);
                                                return (
                                                    <div key={course.id} className="space-y-4">
                                                        <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className={cn("w-9 h-9 rounded-sm flex items-center justify-center font-black text-white text-lg", theme.accent)}>
                                                                    {theme.label}
                                                                </div>
                                                                <h4 className="font-black text-base text-slate-900 tracking-tight uppercase">{course.name}</h4>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <div className="text-right">
                                                                    <div className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Total Score</div>
                                                                    <div className="text-xl font-black text-slate-800 leading-none">{course.courseTotal}</div>
                                                                </div>
                                                                <div className="w-px h-8 bg-slate-200"></div>
                                                                <div className="text-right">
                                                                    <div className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">코스별 순위 (Rank)</div>
                                                                    <div className="text-xl font-black text-[#3b82f6] leading-none">
                                                                        {course.courseRank ? `${course.courseRank}위` : '-'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Sharp Hole Grid with Relative Scoring */}
                                                        <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
                                                            <div className="flex gap-2 min-w-max pb-2">
                                                                {course.holeScores.map((score, idx) => {
                                                                    const par = course.pars[idx] || 4;
                                                                    return (
                                                                        <div key={idx} className="flex flex-col items-center gap-1.5 w-[56px]">
                                                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Hole {idx + 1}</div>
                                                                            <div className={cn(
                                                                                "w-full h-20 rounded-sm border-2 flex flex-col items-center justify-center bg-white shadow-sm",
                                                                                theme.border
                                                                            )}>
                                                                                <span className={cn("text-2xl font-black leading-none", theme.text)}>
                                                                                    {score ?? '-'}
                                                                                </span>
                                                                                {score !== null && (
                                                                                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 w-10 flex flex-col items-center">
                                                                                        <RelativeScore score={score} par={par} className="leading-none" />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                                                    <Info className="w-3.5 h-3.5 text-[#3b82f6]" />
                                                    <span className="uppercase tracking-tight text-red-500/80">Red(+): Over Par</span>
                                                    <span className="mx-1 opacity-20">|</span>
                                                    <span className="uppercase tracking-tight text-blue-500/80">Blue(-): Under Par</span>
                                                </div>
                                                <div className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">
                                                    Official Tournament Record System
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </React.Fragment>
                            ))
                        )}

                        {/* Pagination: Load More Trigger */}
                        {visibleCount < filteredPlayers.length && (
                            <div ref={loadMoreRef} className="p-4 bg-slate-50 flex justify-center border-t border-slate-100">
                                <Button
                                    variant="outline"
                                    onClick={() => setVisibleCount(prev => prev + 30)}
                                    className="w-full max-w-xs font-black text-slate-600 border-slate-200 bg-white"
                                >
                                    {filteredPlayers.length - visibleCount}명 더보기
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions (Sharp) */}
            <div className="fixed bottom-6 right-6">
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="w-14 h-14 bg-[#3b82f6] text-white rounded-md shadow-xl flex items-center justify-center hover:bg-blue-600 active:scale-95 transition-all"
                >
                    <Trophy className="w-7 h-7" />
                </button>
            </div>

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                @keyframes sharpFade {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-in { animation: sharpFade 0.3s ease-out forwards; }
            `}</style>
        </div >
    );
}
