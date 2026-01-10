"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, List, Trophy, Search } from 'lucide-react';

// --- Types (Duplicated from ArchiveList/Dashboard for independence) ---
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
    forfeitType: 'absent' | 'disqualified' | 'forfeit' | null;
    assignedCourses: any[];
    coursesData: {
        [courseId: string]: {
            courseName: string;
            courseTotal: number;
        }
    };
    plusMinus: number | null;
}

export default function GallerySummaryPage() {
    const params = useParams();
    const router = useRouter();
    const archiveId = params?.id as string;

    const [archiveData, setArchiveData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeGroup, setActiveGroup] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (!db || !archiveId) return;

        // Phase 1: Try `archives-detail` first, fallback to `archives`
        const detailRef = ref(db, `archives-detail/${archiveId}`);
        const legacyRef = ref(db, `archives/${archiveId}`);

        const fetchData = async () => {
            // Check new path first
            onValue(detailRef, (snap) => {
                if (snap.exists()) {
                    setArchiveData(snap.val());
                    setLoading(false);
                } else {
                    // Fallback to legacy
                    onValue(legacyRef, (legacySnap) => {
                        setArchiveData(legacySnap.val());
                        setLoading(false);
                    });
                }
            }, { onlyOnce: true });
        };
        fetchData();
    }, [archiveId]);

    // Group Processing
    const { groups, processedData } = useMemo(() => {
        if (!archiveData || !archiveData.processedByGroup) return { groups: [], processedData: {} };

        const data: { [key: string]: ProcessedPlayer[] } = archiveData.processedByGroup;
        const groupList = Object.keys(data).sort();
        return { groups: groupList, processedData: data };
    }, [archiveData]);

    const activePlayers = useMemo(() => {
        if (!processedData) return [];
        let players: ProcessedPlayer[] = [];

        if (activeGroup === "all") {
            Object.values(processedData).forEach((groupPlayers: any) => {
                players = [...players, ...groupPlayers];
            });
            // Global sorting if 'all' (usually by rank/score)
            players.sort((a, b) => {
                if (a.rank === null && b.rank === null) return 0;
                if (a.rank === null) return 1;
                if (b.rank === null) return -1;
                return a.rank - b.rank;
            });
        } else {
            players = processedData[activeGroup] || [];
            // Assuming data is already sorted by rank in processedData
            players.sort((a, b) => {
                if (a.rank === null && b.rank === null) return 0;
                if (a.rank === null) return 1;
                if (b.rank === null) return -1;
                return a.rank - b.rank;
            });
        }

        if (searchTerm) {
            players = players.filter(p =>
                p.name.includes(searchTerm) ||
                p.affiliation.includes(searchTerm)
            );
        }

        return players;
    }, [processedData, activeGroup, searchTerm]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">대회 기록을 불러오는 중...</p>
                </div>
            </div>
        );
    }

    if (!archiveData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <h3 className="text-xl font-bold text-gray-700">기록을 찾을 수 없습니다.</h3>
                    <Button variant="outline" className="mt-4" onClick={() => router.push('/gallery')}>
                        목록으로 돌아가기
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => router.push('/gallery')}>
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </Button>
                        <h1 className="font-bold text-lg truncate max-w-[200px] md:max-w-md">
                            {archiveData.tournamentName} <span className="text-blue-600 font-normal ml-1">요약</span>
                        </h1>
                    </div>
                    <Button
                        size="sm"
                        className="bg-slate-900 text-white hover:bg-slate-800"
                        onClick={() => router.push(`/gallery/${archiveId}`)}
                    >
                        <List className="w-4 h-4 mr-2" />
                        상세 점수표
                    </Button>
                </div>

                {/* Group Tabs (Scrollable) */}
                <div className="max-w-5xl mx-auto px-4 overflow-x-auto no-scrollbar">
                    <div className="flex space-x-1 py-1">
                        <button
                            onClick={() => setActiveGroup("all")}
                            className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeGroup === "all"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            전체보기
                        </button>
                        {groups.map(group => (
                            <button
                                key={group}
                                onClick={() => setActiveGroup(group)}
                                className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeGroup === group
                                    ? "border-blue-600 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                {group}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-5xl mx-auto p-4">
                {/* Search Bar */}
                <div className="mb-6 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="이름 또는 소속으로 검색..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Score Cards List */}
                <div className="space-y-3">
                    {activePlayers.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed">
                            검색 결과가 없습니다.
                        </div>
                    ) : (
                        activePlayers.map((player, idx) => (
                            <div
                                key={`${player.group}-${player.id}`}
                                className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                                style={{ animationDelay: `${Math.min(idx * 50, 500)}ms` }}
                            >
                                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        {/* Rank */}
                                        <div className={`w-10 h-10 flex items-center justify-center rounded-full font-bold text-lg ${player.rank === 1 ? 'bg-amber-100 text-amber-600' :
                                            player.rank === 2 ? 'bg-slate-100 text-slate-600' :
                                                player.rank === 3 ? 'bg-orange-50 text-orange-600' :
                                                    'bg-white text-gray-400 border border-gray-100'
                                            }`}>
                                            {player.rank || '-'}
                                        </div>

                                        {/* Info */}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-lg text-gray-800">{player.name}</span>
                                                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{player.affiliation}</span>
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1">
                                                {player.group} · {player.assignedCourses.map(c => c.name || c.id).join(' + ')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Scores */}
                                    <div className="text-right">
                                        <div className="text-2xl font-bold tracking-tight text-gray-900">
                                            {player.hasForfeited
                                                ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권')
                                                : player.totalScore
                                            }
                                        </div>
                                        {!player.hasForfeited && player.plusMinus !== null && (
                                            <div className={`text-sm font-medium ${player.plusMinus < 0 ? 'text-red-500' :
                                                player.plusMinus === 0 ? 'text-gray-500' : 'text-gray-900'
                                                }`}>
                                                {player.plusMinus === 0 ? 'E' : (player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
