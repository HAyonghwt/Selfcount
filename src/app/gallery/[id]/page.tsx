'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { useParams, useRouter } from 'next/navigation';
import {
    ChevronLeft,
    Search,
    Calendar,
    MapPin,
    Trophy,
    User,
    ChevronDown,
    ChevronUp,
    Info,
    LayoutGrid,
    Users,
    Activity,
    Target
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Interface Types ---
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
const getCourseTheme = (courseName: string) => {
    const name = courseName.toLowerCase();

    // 1순위: 알파벳 (A, B, C, D)
    if (name.includes('a')) return { accent: 'bg-[#ef4444]', text: 'text-[#ef4444]', border: 'border-[#ef4444]', label: 'A', labelText: 'text-white' };
    if (name.includes('b')) return { accent: 'bg-[#3b82f6]', text: 'text-[#3b82f6]', border: 'border-[#3b82f6]', label: 'B', labelText: 'text-white' };
    if (name.includes('c')) return { accent: 'bg-[#facc15]', text: 'text-[#facc15]', border: 'border-[#facc15]', label: 'C', labelText: 'text-white' };
    if (name.includes('d')) return { accent: 'bg-white', text: 'text-slate-600', border: 'border-slate-300', label: 'D', labelText: 'text-slate-900' };

    // 2순위: 숫자 또는 한글 (1/가, 2/나, 3/다, 4/라)
    if (name.includes('1') || name.includes('가')) return { accent: 'bg-[#ef4444]', text: 'text-[#ef4444]', border: 'border-[#ef4444]', label: 'A', labelText: 'text-white' };
    if (name.includes('2') || name.includes('나')) return { accent: 'bg-[#3b82f6]', text: 'text-[#3b82f6]', border: 'border-[#3b82f6]', label: 'B', labelText: 'text-white' };
    if (name.includes('3') || name.includes('다')) return { accent: 'bg-[#facc15]', text: 'text-[#facc15]', border: 'border-[#facc15]', label: 'C', labelText: 'text-white' };
    if (name.includes('4') || name.includes('라')) return { accent: 'bg-white', text: 'text-slate-600', border: 'border-slate-300', label: 'D', labelText: 'text-slate-900' };

    // 기본값: 보라색 테마 + 이름의 첫 글자를 라벨로 사용
    const firstChar = courseName.trim().charAt(0).toUpperCase();
    return { accent: 'bg-[#8c1aff]', text: 'text-[#8c1aff]', border: 'border-[#8c1aff]', label: firstChar || '?', labelText: 'text-white' };
};

// --- Sorting Tie-break Logic (Backcount) ---
const tieBreak = (a: ProcessedPlayer, b: ProcessedPlayer): number => {
    // 1단계: 합계 점수 (이미 정렬되어 들어옴)
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

// --- Sub-components for better isolation ---
const RelativeScore = ({ score, par, className }: { score: number | null, par: number, className?: string }) => {
    if (score === null || score === 0) return null;
    const diff = score - par;

    let text = "-";
    let color = "text-slate-400";

    if (diff === 0) {
        text = "E";
        color = "text-slate-500 font-bold";
    } else if (diff < 0) {
        text = diff.toString();
        color = "text-blue-500 font-bold";
    } else {
        text = `+${diff}`;
        color = "text-red-500 font-bold";
    }

    return <span className={cn("text-[11px]", color, className)}>{text}</span>;
};

export default function GalleryDetailPage() {
    const params = useParams();
    const router = useRouter();
    const archiveIdRaw = params?.id as string;
    // URL 디코딩 적용 (한글 대회명 대응)
    const archiveId = useMemo(() => archiveIdRaw ? decodeURIComponent(archiveIdRaw) : '', [archiveIdRaw]);

    const [archiveData, setArchiveData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeGroup, setActiveGroup] = useState<string>("");
    const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(50);
    const loadMoreRef = React.useRef<HTMLDivElement>(null);
    const [isRedirecting, setIsRedirecting] = useState(false);

    // 인앱 브라우저 강제 탈출 로직은 유지
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const userAgent = navigator.userAgent.toLowerCase();
        const targetUrl = window.location.href;
        if (userAgent.match(/kakaotalk/i)) {
            setIsRedirecting(true);
            window.location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(targetUrl);
            return;
        }
        if (userAgent.match(/line/i)) {
            setIsRedirecting(true);
            const separator = targetUrl.includes('?') ? '&' : '?';
            window.location.href = `${targetUrl}${separator}openExternalBrowser=1`;
            return;
        }
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
        setVisibleCount(50);
    }, [activeGroup, searchTerm]);

    // 데이터 로드: 원본 구조를 유지하되 get 방식으로 안정성 확보
    useEffect(() => {
        if (!db || !archiveId || archiveId === '[id]') return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const detailRef = ref(db!, `archives-detail/${archiveId}`);
                const legacyRef = ref(db!, `archives/${archiveId}`);

                const detailSnap = await get(detailRef);
                if (detailSnap.exists()) {
                    const data = detailSnap.val();
                    setArchiveData(data);
                    // 초기 그룹 설정 (전체 탭이 없으므로 첫 번째 그룹으로 자동 설정)
                    if (data?.groups) {
                        const groupNames = Object.keys(data.groups).sort();
                        if (groupNames.length > 0 && !activeGroup) setActiveGroup(groupNames[0]);
                    }
                } else {
                    const legacySnap = await get(legacyRef);
                    if (legacySnap.exists()) {
                        const data = legacySnap.val();
                        setArchiveData(data);
                        if (data.players) {
                            const players = data.players || {};
                            const groupNames = Array.from(new Set(Object.values(players).map((p: any) => p.group))).sort() as string[];
                            if (groupNames.length > 0 && !activeGroup) setActiveGroup(groupNames[0]);
                        }
                    } else {
                        setArchiveData(null);
                    }
                }
            } catch (err) {
                console.error('Gallery Error:', err);
                setArchiveData(null);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [archiveId]);

    // 기존의 검증된 Data Processing 로직 복구
    const processedPlayers = useMemo(() => {
        if (!archiveData) return [];

        let results: any[] = [];

        // 1. 만약 보관 시점의 가공 데이터(processedByGroup)가 있다면 이를 최우선으로 사용 (서든데스, 순위 보정 등 100% 반영)
        if (archiveData.processedByGroup) {
            Object.values(archiveData.processedByGroup).forEach((groupPlayers: any) => {
                const mappedPlayers = groupPlayers.map((p: any) => {
                    // UI 호환성을 위해 courses 배열 생성
                    const uiCourses = (p.assignedCourses || []).map((c: any) => {
                        const scoreInfo = p.coursesData?.[c.id] || {};
                        return {
                            id: c.id,
                            name: c.name || c.id,
                            order: c.order || 0,
                            pars: c.pars || Array(9).fill(4),
                            holeScores: scoreInfo.holeScores || Array(9).fill(null),
                            courseTotal: scoreInfo.courseTotal || 0,
                            coursePlusMinus: (scoreInfo.courseTotal && c.pars) ? (scoreInfo.courseTotal - c.pars.reduce((a: number, b: number) => a + b, 0)) : scoreInfo.coursePlusMinus,
                            courseRank: scoreInfo.courseRank
                        };
                    });
                    return {
                        ...p,
                        totalScore: p.totalScore || 0,
                        rank: p.rank || null,
                        courses: uiCourses
                    };
                });
                results = [...results, ...mappedPlayers];
            });
        } else {
            // 2. 만약 가공 데이터가 없는 옛날 데이터라면 기존 방식대로 계산
            const playersObj = archiveData.players || {};
            const scoresObj = archiveData.scores || {};
            const coursesObj = archiveData.courses || {};
            const finalRanks = archiveData.finalRanks || {};
            const groupsObj = archiveData.groups || {};

            results = Object.keys(playersObj).map(pid => {
                const player = playersObj[pid] || {};
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
                        name: course.name || cid,
                        order: course.order || 0,
                        pars: course.pars || Array(9).fill(4),
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
                    name: player.name || '무명',
                    jo: player.jo || '-',
                    affiliation: player.affiliation || '-',
                    group: pGroup,
                    totalScore,
                    plusMinus,
                    rank: (rankInfo.rank !== undefined && rankInfo.rank !== null) ? Number(rankInfo.rank) : null,
                    hasAnyScore: playerCourses.some(c => c.courseTotal > 0),
                    hasForfeited: playerCourses.some(c => c.holeScores.some(s => s === 0)),
                    forfeitType: player.forfeitType || null,
                    courses: playerCourses
                };
            });
        }
        // --- 전체 순위 및 코스별 그룹 내 순위 계산 ---
        const uniqueGroups = Array.from(new Set(results.map(p => p.group)));
        uniqueGroups.forEach(groupName => {
            const groupPlayers = results.filter(p => p.group === groupName);

            // 1. 전체 순위 계산 (기존 rank가 없을 경우)
            const rankingListTotal = groupPlayers
                .filter(p => p.hasAnyScore && !p.hasForfeited)
                .sort((a, b) => {
                    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
                    return tieBreak(a, b);
                });

            let currentRankTotal = 1;
            rankingListTotal.forEach((item, index) => {
                if (index > 0) {
                    const prev = rankingListTotal[index - 1];
                    // 점수와 백카운트가 모두 같을 때만 동순위, 아니면 순서대로
                    if (item.totalScore > prev.totalScore || tieBreak(prev, item) !== 0) {
                        currentRankTotal = index + 1;
                    }
                }
                const pObj = results.find(r => r.id === item.id);
                // 중요: 전광판에서 저장된 rank 정보를 최우선으로 사용, 없을 때만 자동 계산
                if (pObj && (pObj.rank === null || pObj.rank === undefined)) {
                    pObj.rank = currentRankTotal;
                }
            });

            // 2. 코스별 순위 계산
            const courseIds = Array.from(new Set(groupPlayers.flatMap((p: any) => p.courses.map((c: any) => c.id))));
            courseIds.forEach(cid => {
                const rankingList = groupPlayers
                    .filter((p: any) => {
                        const c = p.courses.find((rc: PlayerCourseData) => rc.id === cid);
                        return c && c.courseTotal > 0 && !p.hasForfeited;
                    })
                    .map((p: any) => ({
                        pid: p.id,
                        total: p.courses.find((rc: PlayerCourseData) => rc.id === cid)!.courseTotal
                    }))
                    .sort((a, b) => a.total - b.total);

                let currentRank = 1;
                rankingList.forEach((item, index) => {
                    if (index > 0 && item.total > rankingList[index - 1].total) {
                        currentRank = index + 1;
                    }
                    const pObj = results.find((r: any) => r.id === item.pid);
                    const cObj = pObj?.courses.find((rc: PlayerCourseData) => rc.id === cid);
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

    const filteredPlayers = useMemo(() => {
        return processedPlayers.filter(p => {
            const matchesGroup = activeGroup === 'all' || p.group === activeGroup;
            const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (p.affiliation || '').toLowerCase().includes(searchTerm.toLowerCase());
            return matchesGroup && matchesSearch;
        }).sort((a, b) => {
            if (a.rank !== b.rank) {
                if (a.rank === null) return 1;
                if (b.rank === null) return -1;
                return a.rank - b.rank;
            }
            return tieBreak(a, b);
        });
    }, [processedPlayers, activeGroup, searchTerm]);

    const displayedPlayers = useMemo(() => {
        return filteredPlayers.slice(0, visibleCount);
    }, [filteredPlayers, visibleCount]);

    useEffect(() => {
        if (visibleCount >= filteredPlayers.length) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => Math.min(prev + 50, filteredPlayers.length));
            }
        }, { threshold: 0.1 });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [visibleCount, filteredPlayers.length]);

    const courseLabels = useMemo(() => {
        const labels = new Set<string>();
        filteredPlayers.forEach((p: ProcessedPlayer) => {
            p.courses.forEach((c: PlayerCourseData) => {
                const theme = getCourseTheme(c.name);
                labels.add(theme.label);
            });
        });
        return Array.from(labels).sort();
    }, [filteredPlayers]);

    const toggleExpand = (pid: string) => {
        setExpandedPlayerId(expandedPlayerId === pid ? null : pid);
    };

    // UI Rendering
    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-[#3b82f6]/20 border-t-[#3b82f6] rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-bold animate-pulse text-sm">데이터를 불러오고 있습니다...</p>
            </div>
        );
    }

    if (!archiveData) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg mb-6 border border-slate-100">
                    <Info className="w-10 h-10 text-[#3b82f6]" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">대회 정보를 찾을 수 없습니다.</h2>
                <p className="text-slate-500 max-w-xs mx-auto mb-8 font-medium leading-relaxed">
                    요청하신 번호에 해당하는 대회 결과가 보관함에 존재하지 않거나, 아직 업데이트되지 않았을 수 있습니다.
                </p>
                <button
                    onClick={() => router.push('/gallery')}
                    className="flex items-center gap-2 bg-[#3b82f6] text-white px-8 py-4 rounded-xl font-black shadow-lg shadow-blue-200 transition-all hover:scale-105 active:scale-95"
                >
                    갤러리 목록으로 돌아가기
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8fafc]">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-4 safe-top shadow-sm">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <button
                        onClick={() => router.push('/gallery')}
                        className="p-2 -ml-2 text-slate-400 hover:text-slate-800 transition-colors"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="flex-1 text-center truncate px-4">
                        <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none mb-1.5 truncate">
                            {archiveData.tournamentName || '대회 결과'}
                        </h1>
                        <div className="flex items-center justify-center gap-3 text-[11px] font-bold text-slate-400">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {archiveData.tournamentStartDate || '-'}</span>
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {archiveData.location || '-'}</span>
                        </div>
                    </div>
                    <div className="w-10"></div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-3 space-y-3">
                {/* Tournament Overview Stats */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-md h-[50px] px-3 shadow-sm border border-slate-200 flex items-center gap-2.5">
                        <div className="shrink-0">
                            <Users className="w-5 h-5 text-orange-500 opacity-80" />
                        </div>
                        <div className="flex flex-col justify-center min-w-0">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">참가 선수</p>
                            <p className="text-sm font-black text-slate-900 leading-none">
                                {archiveData.playerCount || 0}<span className="text-[10px] ml-0.5 opacity-40 font-bold">명</span>
                            </p>
                        </div>
                    </div>
                    <div className="bg-white rounded-md h-[50px] px-3 shadow-sm border border-slate-200 flex items-center gap-2.5">
                        <div className="shrink-0">
                            <Activity className="w-5 h-5 text-blue-500 opacity-80" />
                        </div>
                        <div className="flex flex-col justify-center min-w-0">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">기록 보관일</p>
                            <p className="text-[11px] font-black text-slate-900 leading-none whitespace-nowrap overflow-hidden text-ellipsis">
                                {archiveData.savedAt ? new Date(archiveData.savedAt).toLocaleDateString() : '-'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filter & Search Section */}
                <div className="space-y-3">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Search className="w-4 h-4 text-slate-300 group-focus-within:text-[#3b82f6] transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="선수명 또는 소속 클럽 검색"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-[50px] bg-white border border-slate-200 rounded-md pl-11 pr-4 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/10 focus:border-[#3b82f6] shadow-sm transition-all"
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

                {/* Results Table */}
                <div className="!mt-[6px] bg-white rounded-t-md rounded-b-none shadow-sm border border-slate-100 overflow-hidden">
                    <div className="flex items-center h-12 bg-[#3b82f6] text-white text-[11px] font-black uppercase tracking-tight divide-x divide-white/10 text-center">
                        <div className="w-[12%]">조</div>
                        <div className="w-[20%]">이름</div>
                        {courseLabels.map(label => (
                            <div key={label} className="flex-1">{label}</div>
                        ))}
                        <div className="w-[14%]">합계</div>
                        <div className="w-[14%]">순위</div>
                    </div>

                    <div className="divide-y divide-slate-100">
                        {filteredPlayers.length > 0 ? (
                            displayedPlayers.map((player, index) => (
                                <div key={player.id} className="group">
                                    <div
                                        onClick={() => toggleExpand(player.id)}
                                        className={cn(
                                            "flex items-center min-h-[56px] h-auto transition-colors active:bg-slate-50 cursor-pointer",
                                            expandedPlayerId === player.id ? "bg-blue-50/30" : (index % 2 === 1 ? "bg-slate-100/50" : "bg-white")
                                        )}
                                    >
                                        <div className="w-[12%] border-r border-slate-100 text-sm font-black text-slate-400 flex items-center justify-center">
                                            {player.jo}
                                        </div>
                                        <div className="w-[20%] border-r border-slate-100 text-left pl-2 flex flex-col justify-center overflow-hidden py-1">
                                            <div className="text-[9px] text-slate-400 font-bold truncate leading-none mb-0.5">{player.affiliation}</div>
                                            <div className={cn(
                                                "font-black text-slate-700 leading-tight break-all",
                                                /[a-zA-Z]/.test(player.name)
                                                    ? (player.name.length > 15 ? "text-[10px]" : player.name.length > 10 ? "text-xs" : "text-sm")
                                                    : "text-base"
                                            )}>
                                                {/[a-zA-Z]/.test(player.name) ? (
                                                    <>
                                                        <span className={cn(
                                                            "uppercase",
                                                            player.name.length > 15 ? "text-xs" : player.name.length > 10 ? "text-sm" : "text-base"
                                                        )}>{player.name.charAt(0)}</span>
                                                        <span>{player.name.slice(1)}</span>
                                                    </>
                                                ) : player.name}
                                            </div>
                                        </div>

                                        {/* Dynamic Course Cells */}
                                        {courseLabels.map((label: string) => {
                                            const course = player.courses.find((c: PlayerCourseData) => getCourseTheme(c.name).label === label);
                                            return (
                                                <div key={label} className="flex-1 border-r border-slate-100 h-full flex flex-col items-center justify-center py-1">
                                                    {course && course.courseTotal > 0 && (
                                                        <>
                                                            <div className={cn(
                                                                "text-[9px] font-black leading-none mb-0.5",
                                                                (course.coursePlusMinus || 0) > 0 ? "text-red-500" : (course.coursePlusMinus || 0) < 0 ? "text-blue-500" : "text-slate-400"
                                                            )}>
                                                                {(course.coursePlusMinus || 0) > 0 ? `+${course.coursePlusMinus}` : course.coursePlusMinus === 0 ? "E" : (course.coursePlusMinus || '')}
                                                            </div>
                                                            <div className="text-lg font-black text-slate-700 leading-none">
                                                                {course.courseTotal}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Total Cell */}
                                        <div className="w-[14%] border-r border-slate-100 h-full flex flex-col items-center justify-center bg-blue-50/20 py-1">
                                            {!player.hasForfeited && player.plusMinus !== null && (
                                                <div className={cn(
                                                    "text-[9px] font-black leading-none mb-0.5",
                                                    player.plusMinus > 0 ? "text-red-500" : player.plusMinus < 0 ? "text-blue-500" : "text-slate-400"
                                                )}>
                                                    {player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus === 0 ? "E" : player.plusMinus}
                                                </div>
                                            )}
                                            <div className={cn("text-lg font-black leading-none", player.hasForfeited ? "text-red-500 text-sm" : "text-[#3b82f6]")}>
                                                {player.hasForfeited ? "기권" : player.totalScore}
                                            </div>
                                        </div>

                                        <div className="w-[14%] h-full flex items-center justify-center">
                                            {player.hasForfeited ? (
                                                <div className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter">WD</div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <div className={cn(
                                                        "min-w-[28px] h-6 px-1.5 rounded flex items-center justify-center text-[14px] font-black border transition-all",
                                                        player.rank === 1 ? "bg-amber-100 text-amber-600 border-amber-200 shadow-sm" :
                                                            player.rank === 2 ? "bg-slate-100 text-slate-500 border-slate-200 shadow-sm" :
                                                                player.rank === 3 ? "bg-orange-50 text-orange-600 border-orange-200 shadow-sm" :
                                                                    (player.rank || 0) <= 5 ? "bg-blue-50 text-blue-500 border-blue-100" :
                                                                        (player.rank || 0) <= 10 ? "bg-indigo-50 text-indigo-500 border-indigo-100" :
                                                                            "bg-white text-slate-400 border-slate-100"
                                                    )}>
                                                        {player.rank || '-'}
                                                    </div>
                                                    <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">RANK</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded Detail Grid (Relative Scoring) */}
                                    {expandedPlayerId === player.id && (
                                        <div className="bg-slate-50 border-y border-blue-100 p-4 space-y-1 animate-in slide-in-from-top-2 duration-300">
                                            {player.courses.length === 0 ? (
                                                <div className="text-center py-4 text-slate-400 font-bold text-xs uppercase tracking-widest leading-loose">기록된 데이터가 없습니다.</div>
                                            ) : player.courses.map((course: PlayerCourseData) => {
                                                const theme = getCourseTheme(course.name);
                                                return (
                                                    <div key={course.id} className="space-y-2">
                                                        <div className="flex items-center justify-between border-b border-slate-300 pb-1">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className={cn("w-9 h-9 rounded-sm flex items-center justify-center font-black text-lg border", theme.accent, theme.labelText, theme.border)}>
                                                                    {theme.label}
                                                                </div>
                                                                <div className="flex flex-col justify-center">
                                                                    {course.name.includes(' ') ? (
                                                                        <>
                                                                            <span className="text-[10px] text-slate-400 font-bold leading-none mb-0.5">
                                                                                {course.name.split(' ').slice(0, -1).join(' ')}
                                                                            </span>
                                                                            <h4 className="font-black text-base text-slate-900 tracking-tight uppercase leading-none">
                                                                                {course.name.split(' ').slice(-1)[0]}
                                                                            </h4>
                                                                        </>
                                                                    ) : (
                                                                        <h4 className="font-black text-base text-slate-900 tracking-tight uppercase">{course.name}</h4>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex items-center gap-4 bg-slate-100/50 px-3 py-1.5 rounded-lg border border-slate-200/50">
                                                                    <div className="text-right">
                                                                        <div className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">Total</div>
                                                                        <div className="text-lg font-black text-slate-800 leading-none">{course.courseTotal}</div>
                                                                    </div>
                                                                    <div className="w-px h-6 bg-slate-300/50"></div>
                                                                    <div className="text-right">
                                                                        <div className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">Rank</div>
                                                                        <div className="text-lg font-black text-[#3b82f6] leading-none">
                                                                            {course.courseRank ? `${course.courseRank}위` : '-'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Sharp Hole Grid with Relative Scoring */}
                                                        <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
                                                            <div className="flex gap-1 min-w-max pb-2">
                                                                {course.holeScores.map((score: number | null, idx: number) => {
                                                                    const par = course.pars[idx] || 4;
                                                                    return (
                                                                        <div key={idx} className="flex flex-col items-center gap-0.5 w-[38px]">
                                                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Hole {idx + 1}</div>
                                                                            <div className={cn(
                                                                                "w-full h-11 rounded-sm border-2 flex flex-col items-center justify-center bg-white shadow-sm",
                                                                                theme.border
                                                                            )}>
                                                                                <span className={cn("text-base font-black leading-none", theme.text)}>
                                                                                    {score ?? '-'}
                                                                                </span>
                                                                                {score !== null && (
                                                                                    <div className="mt-0.5 pt-0.5 border-t border-slate-100 w-6 flex flex-col items-center">
                                                                                        <RelativeScore score={score} par={par} className="leading-none text-[9px]" />
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
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="py-24 text-center">
                                <Search className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                <p className="text-slate-400 font-bold italic">검색 결과가 없습니다.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Infinite Scroll Trigger */}
                <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
                    {visibleCount < filteredPlayers.length && (
                        <div className="w-6 h-6 border-2 border-slate-200 border-t-[#3b82f6] rounded-full animate-spin"></div>
                    )}
                </div>
            </main>

            {/* In-app Browser Escape Overlay */}
            {isRedirecting && (
                <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                        <LayoutGrid className="w-10 h-10 text-[#3b82f6] animate-pulse" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">외부 브라우저로 실행합니다</h2>
                    <p className="text-slate-500 font-medium leading-relaxed">
                        최적의 환경을 위해 크롬이나 사파리 등<br />기기의 기본 브라우저로 연결 중입니다.
                    </p>
                    <div className="mt-10 flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-200 animate-bounce"></div>
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce delay-100"></div>
                        <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce delay-200"></div>
                    </div>
                </div>
            )}
        </div>
    );
}
