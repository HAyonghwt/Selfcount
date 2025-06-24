
"use client"
import React, { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

interface ProcessedPlayer {
    id: string;
    jo: number;
    name: string;
    club: string;
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
    total: number;
    courseScores: { [courseId: string]: number };
    detailedScores: { [courseId: string]: { [holeNumber: string]: number } };
    assignedCourses: any[];
}

const tieBreak = (a: any, b: any, coursesForGroup: any[]) => {
    if (a.hasForfeited && !b.hasForfeited) return 1;
    if (!a.hasForfeited && b.hasForfeited) return -1;

    if (!a.hasAnyScore && !b.hasAnyScore) return 0;
    if (!a.hasAnyScore) return 1;
    if (!b.hasAnyScore) return -1;
    
    if (a.total !== b.total) {
        return a.total - b.total;
    }

    // Sort courses by name in reverse alphabetical order (e.g., D, C, B, A)
    const sortedCourses = [...coursesForGroup].sort((c1, c2) => c2.name.localeCompare(c1.name));

    // Compare total scores of each course in reverse alphabetical order
    for (const course of sortedCourses) {
        const courseId = course.id;
        const aCourseScore = a.courseScores[courseId] || 0;
        const bCourseScore = b.courseScores[courseId] || 0;
        if (aCourseScore !== bCourseScore) {
            return aCourseScore - bCourseScore;
        }
    }
    
    // If still tied, compare hole scores on the last course (alphabetically), from 9 to 1.
    if (sortedCourses.length > 0) {
        const lastCourseId = sortedCourses[0].id;
        const aHoleScores = a.detailedScores[lastCourseId] || {};
        const bHoleScores = b.detailedScores[lastCourseId] || {};
        for (let i = 9; i >= 1; i--) {
            const hole = i.toString();
            const aHole = aHoleScores[hole] || 0;
            const bHole = bHoleScores[hole] || 0;
            if (aHole !== bHole) {
                return aHole - bHole;
            }
        }
    }

    return 0;
};

export default function ExternalScoreboard() {
    const [loading, setLoading] = useState(true);
    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [tournament, setTournament] = useState<any>({});
    const [groupsData, setGroupsData] = useState<any>({});
    
    useEffect(() => {
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');

        const unsubPlayers = onValue(playersRef, snap => setPlayers(snap.val() || {}));
        const unsubScores = onValue(scoresRef, snap => setScores(snap.val() || {}));
        const unsubTournament = onValue(tournamentRef, snap => {
            const data = snap.val() || {};
            setTournament(data);
            setGroupsData(data.groups || {});
            setLoading(false);
        });

        const timer = setTimeout(() => setLoading(false), 5000);

        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
            clearTimeout(timer);
        };
    }, []);

    const processedDataByGroup = useMemo(() => {
        const allCourses = Object.values(tournament.courses || {});
        if (Object.keys(players).length === 0) return {};

        const allProcessedPlayers: any[] = Object.entries(players).map(([playerId, player]: [string, any]) => {
            const playerGroupData = groupsData[player.group];
            const assignedCourseIds = playerGroupData?.courses 
                ? Object.keys(playerGroupData.courses).filter(id => playerGroupData.courses[id]) 
                : [];
            
            const allAssignedCoursesForPlayer = allCourses.filter((c:any) => assignedCourseIds.includes(c.id.toString()));

            const playerScoresData = scores[playerId] || {};
            
            let hasAnyScore = false;
            let hasForfeited = false;
            let totalScore = 0;
            const coursesData: any = {};
            const courseScoresForTieBreak: { [courseId: string]: number } = {};
            const detailedScoresForTieBreak: { [courseId: string]: { [holeNumber: string]: number } } = {};

            allAssignedCoursesForPlayer.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                detailedScoresForTieBreak[courseId] = scoresForCourse;

                const holeScores: (number | null)[] = Array(9).fill(null);
                let courseTotal = 0;
                for (let i = 0; i < 9; i++) {
                    const holeScore = scoresForCourse[(i + 1).toString()];
                    if (holeScore !== undefined && holeScore !== null) {
                        const scoreNum = Number(holeScore);
                        holeScores[i] = scoreNum;
                        courseTotal += scoreNum;
                        hasAnyScore = true;
                        if (scoreNum === 0) {
                            hasForfeited = true;
                        }
                    }
                }
                
                totalScore += courseTotal;
                courseScoresForTieBreak[courseId] = courseTotal;
                coursesData[courseId] = { courseName: course.name, courseTotal, holeScores };
            });

            return {
                id: playerId,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                club: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                group: player.group,
                totalScore,
                coursesData,
                hasAnyScore,
                hasForfeited,
                total: totalScore,
                courseScores: courseScoresForTieBreak,
                detailedScores: detailedScoresForTieBreak,
                assignedCourses: allAssignedCoursesForPlayer.filter((c: any) => c.isActive !== false)
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
            const coursesForGroup = groupedData[groupName][0]?.assignedCourses || Object.values(tournament.courses || {});
            
            const playersToSort = groupedData[groupName].filter(p => p.hasAnyScore && !p.hasForfeited);
            const otherPlayers = groupedData[groupName].filter(p => !p.hasAnyScore || p.hasForfeited);

            if (playersToSort.length > 0) {
                const leaderScore = playersToSort.reduce((min, p) => Math.min(min, p.totalScore), Infinity);

                playersToSort.sort((a, b) => {
                    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
                    if (a.totalScore === leaderScore) return a.name.localeCompare(b.name);
                    return tieBreak(a, b, coursesForGroup);
                });

                let rank = 1;
                playersToSort[0].rank = rank;
                for (let i = 1; i < playersToSort.length; i++) {
                    const prev = playersToSort[i-1];
                    const curr = playersToSort[i];
                    
                    let isTied = false;
                    if (curr.totalScore === prev.totalScore) {
                        if (curr.totalScore === leaderScore) isTied = true;
                        else isTied = tieBreak(curr, prev, coursesForGroup) === 0;
                    }

                    if (isTied) {
                        curr.rank = prev.rank;
                    } else {
                        rank = i + 1;
                        curr.rank = rank;
                    }
                }
            }
            
            const finalPlayers = [...playersToSort, ...otherPlayers.map(p => ({ ...p, rank: null }))];
            rankedData[groupName] = finalPlayers;
        }
        
        return rankedData;
    }, [players, scores, tournament, groupsData]);
    
    const groupProgress = useMemo(() => {
        const progressByGroup: { [key: string]: number } = {};
        const allCourses = Object.values(tournament.courses || {});

        for (const groupName in processedDataByGroup) {
            const groupPlayers = processedDataByGroup[groupName];

            if (!groupPlayers || groupPlayers.length === 0) {
                progressByGroup[groupName] = 0;
                continue;
            }

            const playerGroupData = groupsData[groupName];
            const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter(id => playerGroupData.courses[id]) : [];
            const coursesForGroup = allCourses.filter((c: any) => assignedCourseIds.includes(c.id.toString()));


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
                    const allAssignedCourseIds = coursesForGroup.map((c: any) => c.id.toString());
                    for (const courseId in scores[player.id]) {
                        if (allAssignedCourseIds.includes(courseId)) {
                             totalScoresEnteredInGroup += Object.keys(scores[player.id][courseId]).length;
                        }
                    }
                 }
            });
            
            const progress = Math.round((totalScoresEnteredInGroup / totalPossibleScoresInGroup) * 100);
            progressByGroup[groupName] = isNaN(progress) ? 0 : progress;
        }

        return progressByGroup;
    }, [processedDataByGroup, scores, groupsData, tournament.courses]);


    if (loading) {
        return (
            <div className="bg-black min-h-screen text-white p-8 flex items-center justify-center">
                <p className="text-2xl font-bold">전광판 데이터를 불러오는 중입니다...</p>
            </div>
        );
    }
    
    const NoDataContent = () => (
        <div className="bg-black min-h-screen text-white p-8">
            <div className="text-center py-20">
                <h1 className="text-4xl font-bold">{tournament.name || '파크골프 토너먼트'}</h1>
                <p className="mt-4 text-2xl text-gray-400">
                    {Object.keys(players).length === 0 
                        ? "표시할 선수 데이터가 없습니다. 선수를 먼저 등록해주세요."
                        : "그룹에 배정된 코스가 없거나, 표시하도록 설정된 코스가 없습니다."}
                </p>
            </div>
        </div>
    );

    const visibleGroups = Object.keys(processedDataByGroup).filter(groupName => processedDataByGroup[groupName]?.some(player => player.assignedCourses.length > 0));


    return (
        <>
            <style>{`
                .scoreboard-container::-webkit-scrollbar {
                    display: none;
                }
                .scoreboard-container {
                    -ms-overflow-style: none;  /* IE and Edge */
                    scrollbar-width: none;  /* Firefox */
                }
            `}</style>
            <div className="scoreboard-container bg-black h-screen overflow-y-auto text-gray-200 p-2 sm:p-4 md:p-6 font-sans">
                {visibleGroups.length === 0 ? (
                     <NoDataContent />
                ) : visibleGroups.map((groupName) => {
                    const groupPlayers = processedDataByGroup[groupName];
                    if (groupPlayers.length === 0) return null;

                    return (
                        <div key={groupName} className="mb-4">
                            <header className="flex justify-between items-baseline border-b-2 border-gray-700">
                                <h1 className="text-xl md:text-2xl font-bold text-yellow-300">
                                    {tournament.name || '파크골프 토너먼트'} ({groupName})
                                </h1>
                                <div className="text-xl md:text-2xl font-bold text-green-400">{groupProgress[groupName]}% 진행</div>
                            </header>
                            <div className="overflow-x-auto">
                                <table className="w-full text-center border-collapse border-l border-r border-gray-800">
                                    <thead className="text-gray-400 text-sm">
                                        <tr className="border-b-2 border-gray-600">
                                            <th className="py-1 px-1 w-12 text-center align-middle font-bold border-r border-gray-800">조</th>
                                            <th className="py-1 px-1 w-32 text-center align-middle font-bold border-r border-gray-800">선수명(팀명)</th>
                                            <th className="py-1 px-1 w-32 text-center align-middle font-bold border-r border-gray-800">소속</th>
                                            <th className="py-1 px-1 w-32 text-center align-middle font-bold border-r border-gray-800">코스</th>
                                            <th colSpan={9} className="py-1 px-1 text-center align-middle font-bold border-r border-gray-800">HOLE</th>
                                            <th className="py-1 px-1 w-16 text-center align-middle font-bold border-r border-gray-800">합계</th>
                                            <th className="py-1 px-1 w-16 text-center align-middle font-bold text-yellow-400 border-r border-gray-800">총타수</th>
                                            <th className="py-1 px-1 w-16 text-center align-middle font-bold">순위</th>
                                        </tr>
                                        <tr className="border-b border-gray-600">
                                            <th className="py-1 px-1 align-middle border-r border-gray-800"></th>
                                            <th className="py-1 px-1 align-middle border-r border-gray-800"></th>
                                            <th className="py-1 px-1 align-middle border-r border-gray-800"></th>
                                            <th className="py-1 px-1 align-middle border-r border-gray-800"></th>
                                            {Array.from({length: 9}).map((_, i) => <th key={i} className={`py-1 px-1 font-bold text-base align-middle border-r border-gray-800 ${i % 2 !== 0 ? 'bg-gray-800/50' : ''}`}>{i + 1}</th>)}
                                            <th className="py-1 px-1 align-middle border-r border-gray-800"></th>
                                            <th className="py-1 px-1 align-middle border-r border-gray-800"></th>
                                            <th className="py-1 px-1 align-middle"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-base">
                                        {groupPlayers.map((player) => (
                                            <React.Fragment key={player.id}>
                                                 {player.assignedCourses.length > 0 ? player.assignedCourses.map((course, courseIndex) => (
                                                    <tr key={`${player.id}-${course.id}`} className="border-b border-gray-800 last:border-0">
                                                        {courseIndex === 0 && (
                                                            <>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 align-middle font-bold border-r border-gray-800">{player.jo}</td>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 w-32 text-center align-middle font-semibold border-r border-gray-800">{player.name}</td>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 w-32 text-center align-middle text-gray-400 border-r border-gray-800">{player.club}</td>
                                                            </>
                                                        )}
                                                        <td className="py-0.5 px-1 w-32 align-middle text-center border-r border-gray-800">{player.coursesData[course.id]?.courseName}</td>
                                                        {player.coursesData[course.id]?.holeScores.map((score, i) => <td key={i} className={`py-0.5 px-1 align-middle font-mono font-bold text-xl border-r border-gray-800 ${i % 2 !== 0 ? 'bg-gray-800/50' : ''}`}>{score === null ? '-' : score}</td>)}
                                                        <td className="py-0.5 px-1 align-middle font-bold text-gray-300 text-xl border-r border-gray-800">{player.hasForfeited ? '기권' : (player.hasAnyScore ? player.coursesData[course.id]?.courseTotal : '-')}</td>
                                                        {courseIndex === 0 && (
                                                            <>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 align-middle font-bold text-yellow-400 text-xl border-r border-gray-800">{player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-')}</td>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 align-middle font-bold text-xl">{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : '')}</td>
                                                            </>
                                                        )}
                                                    </tr>
                                                )) : (
                                                    <tr className="border-b border-gray-800 last:border-0">
                                                        <td className="py-0.5 px-1 align-middle font-bold border-r border-gray-800">{player.jo}</td>
                                                        <td className="py-0.5 px-1 w-32 text-center align-middle font-semibold border-r border-gray-800">{player.name}</td>
                                                        <td className="py-0.5 px-1 w-32 text-center align-middle text-gray-400 border-r border-gray-800">{player.club}</td>
                                                        <td colSpan={11} className="py-0.5 px-1 align-middle text-center text-gray-500 border-r border-gray-800">표시하도록 설정된 코스가 없습니다.</td>
                                                        <td className="py-0.5 px-1 align-middle font-bold text-yellow-400 text-xl border-r border-gray-800">{player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-')}</td>
                                                        <td className="py-0.5 px-1 align-middle font-bold text-xl">{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : '')}</td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                })}
            </div>
        </>
    );
}
