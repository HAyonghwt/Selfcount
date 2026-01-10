"use client";

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import Link from 'next/link';
import { ChevronRight, Calendar, Trophy, Users, Medal, MapPin } from 'lucide-react';

// --- Types ---
interface ArchiveSummary {
    id: string; // archiveId
    tournamentName?: string;
    name?: string; // Compatibility
    tournamentStartDate?: string;
    location?: string; // New field
    savedAt: string;
    winnerName?: string;
    winnerScore?: number;
    playerCount?: number;
}

// --- Helper Functions ---
function formatDate(dateStr: string) {
    if (!dateStr) return "-";
    // YYYY-MM-DD format (new) or YYYYMMDD (old)
    if (dateStr.includes('-')) {
        return dateStr.replace(/-/g, '.');
    }
    if (dateStr.length === 8) {
        return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
    }
    if (dateStr.length === 6) {
        return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}`;
    }
    return dateStr;
}

export default function GalleryListPage() {
    const [archives, setArchives] = useState<ArchiveSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        const listRef = ref(db, 'archives-list');

        const unsubscribe = onValue(listRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: ArchiveSummary[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                // 최신순 정렬
                list.sort((a, b) => (b.tournamentStartDate || '').localeCompare(a.tournamentStartDate || '') || b.id.localeCompare(a.id));
                setArchives(list);
                setLoading(false);
            } else {
                // Fallback to legacy archives if list is empty
                const legacyRef = ref(db!, 'archives');
                onValue(legacyRef, (legacySnap) => {
                    const legacyData = legacySnap.val();
                    if (legacyData) {
                        const list: ArchiveSummary[] = Object.keys(legacyData).map(key => ({
                            id: key,
                            tournamentName: legacyData[key].tournamentName,
                            tournamentStartDate: legacyData[key].tournamentStartDate,
                            location: legacyData[key].location, // Try reading location if exists
                            savedAt: legacyData[key].savedAt || '',
                            playerCount: legacyData[key].playerCount
                        }));
                        list.sort((a, b) => (b.tournamentStartDate || '').localeCompare(a.tournamentStartDate || '') || b.id.localeCompare(a.id));
                        setArchives(list);
                    } else {
                        setArchives([]);
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("Legacy archives fetch error:", error);
                    setLoading(false);
                }, { onlyOnce: true });
            }
        }, (error) => {
            console.error("Archives fetch error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-5xl mx-auto">
                <header className="mb-10 text-center pt-6">
                    <div className="fade-in-up">
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                            파크골프 대회 기록
                        </h1>
                        <p className="text-[11px] md:text-xs font-bold text-slate-400 mt-2 uppercase tracking-[0.2em]">
                            Park Golf Tournament Records
                        </p>
                    </div>
                </header>

                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3b82f6]"></div>
                    </div>
                ) : archives.length === 0 ? (
                    <div className="text-center py-24 bg-white rounded-md shadow-sm border border-slate-100 fade-in-up">
                        <div className="w-20 h-20 bg-slate-50 rounded-md flex items-center justify-center mx-auto mb-6">
                            <Trophy className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-xl font-black text-slate-700 mb-2">기록이 없습니다</h3>
                        <p className="text-slate-400 font-bold">대회가 종료되고 기록이 보관되면 이곳에 나타납니다.</p>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 px-2">
                        {archives.map((archive, index) => (
                            <Link href={`/gallery/${archive.id}`} key={archive.id} className="block group">
                                <article
                                    className="h-full bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-[#3b82f6] flex flex-col fade-in-up"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    {/* Top Accent Bar (Sharp) */}
                                    <div className="h-1.5 bg-[#3b82f6]"></div>

                                    <div className="p-6 flex-1 flex flex-col">
                                        {/* Title (Prominent & Responsive) */}
                                        <h2 className="text-lg md:text-xl font-black text-slate-900 mb-4 group-hover:text-[#3b82f6] transition-colors leading-tight">
                                            {archive.tournamentName || archive.name}
                                        </h2>

                                        {/* Metadata (Clean) */}
                                        <div className="space-y-2 mb-4">
                                            <div className="flex items-center text-[12px] font-black text-slate-500 uppercase tracking-tight">
                                                <Calendar className="w-3.5 h-3.5 mr-2 text-[#3b82f6]" />
                                                {formatDate(archive.tournamentStartDate || archive.id.split('_')[1] || '')}
                                            </div>
                                            {archive.location && (
                                                <div className="flex items-center text-[12px] font-bold text-slate-400">
                                                    <MapPin className="w-3.5 h-3.5 mr-2 text-[#3b82f6]/60" />
                                                    {archive.location}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between">
                                            {archive.playerCount && (
                                                <span className="flex items-center text-[10px] font-black text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-sm uppercase tracking-tighter">
                                                    <Users className="w-3 h-3 mr-1.5" />
                                                    {archive.playerCount} PLAYERS
                                                </span>
                                            )}
                                            {/* Mobile-only Arrow (indicated by md:hidden) */}
                                            <ChevronRight className="w-5 h-5 text-[#3b82f6] md:hidden" />
                                        </div>

                                        {/* Spacer to push footer down */}
                                        <div className="flex-1"></div>

                                        {/* Winner Badge (Optional) */}
                                        {archive.winnerName && (
                                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center">
                                                <div className="flex items-center text-sm font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                                                    <Medal className="w-3.5 h-3.5 mr-1.5 fill-amber-500 text-amber-600" />
                                                    우승: {archive.winnerName}
                                                    {typeof archive.winnerScore === 'number' && (
                                                        <span className="ml-1 text-amber-700/80 font-normal">
                                                            ({archive.winnerScore > 0 ? '+' : ''}{archive.winnerScore})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Bottom Arrow Action (Hidden on mobile) */}
                                    <div className="hidden md:flex bg-slate-50 p-3 justify-end group-hover:bg-blue-600 transition-colors duration-300">
                                        <span className="text-sm font-medium text-slate-500 group-hover:text-white flex items-center transition-colors">
                                            결과 보기
                                            <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                                        </span>
                                    </div>
                                </article>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            <style jsx global>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .fade-in-up {
                    animation: fadeInUp 0.6s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
