
"use client"
import React, { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Flame, ChevronUp, ChevronDown } from 'lucide-react';

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

    const sortedCourses = [...coursesForGroup].sort((c1, c2) => {
        const name1 = c1?.name || '';
        const name2 = c2?.name || '';
        return name2.localeCompare(name1);
    });

    for (const course of sortedCourses) {
        const courseId = course.id;
        const aCourseScore = a.courseScores[courseId] || 0;
        const bCourseScore = b.courseScores[courseId] || 0;
        if (aCourseScore !== bCourseScore) {
            return aCourseScore - bCourseScore;
        }
    }
    
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
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<any>(null);
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<any>(null);
    
    useEffect(() => {
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');
        const individualSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/individual');
        const teamSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/team');

        const unsubPlayers = onValue(playersRef, snap => setPlayers(snap.val() || {}));
        const unsubScores = onValue(scoresRef, snap => setScores(snap.val() || {}));
        const unsubTournament = onValue(tournamentRef, snap => {
            const data = snap.val() || {};
            setTournament(data);
            setGroupsData(data.groups || {});
            setLoading(false);
        });
        const unsubIndividualSuddenDeath = onValue(individualSuddenDeathRef, snap => setIndividualSuddenDeathData(snap.val()));
        const unsubTeamSuddenDeath = onValue(teamSuddenDeathRef, snap => setTeamSuddenDeathData(snap.val()));

        const timer = setTimeout(() => setLoading(false), 5000);

        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
            unsubIndividualSuddenDeath();
            unsubTeamSuddenDeath();
            clearTimeout(timer);
        };
    }, []);

    const processedDataByGroup = useMemo(() => {
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);
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
                        if (scoreNum === 0) {
                            hasForfeited = true;
                        }
                        holeScores[i] = scoreNum;
                        courseTotal += scoreNum;
                        hasAnyScore = true;
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
                type: player.type,
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
                    // For leaders, do not apply tie-break to let them be tied for sudden death
                    if (a.totalScore === leaderScore) return a.name.localeCompare(b.name);
                    // For other ranks, apply tie-break
                    return tieBreak(a, b, coursesForGroup);
                });

                let rank = 1;
                playersToSort[0].rank = rank;
                for (let i = 1; i < playersToSort.length; i++) {
                    const prev = playersToSort[i-1];
                    const curr = playersToSort[i];
                    
                    let isTied = false;
                    if (curr.totalScore === prev.totalScore) {
                         if (curr.totalScore === leaderScore) isTied = true; // Leaders are always tied
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
        const allCourses = Object.values(tournament.courses || {}).filter(Boolean);

        for (const groupName in processedDataByGroup) {
            const groupPlayers = processedDataByGroup[groupName];
            if (!groupPlayers || groupPlayers.length === 0) {
                progressByGroup[groupName] = 0; continue;
            }
            const playerGroupData = groupsData[groupName];
            const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter(id => playerGroupData.courses[id]) : [];
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
            suddenDeathData.holes.forEach((hole:number) => {
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
            if (i > 0 && (results[i].holesPlayed < results[i - 1].holesPlayed || (results[i].holesPlayed === results[i-1].holesPlayed && results[i].totalScore > results[i - 1].totalScore))) {
                rank = i + 1;
            }
            results[i].rank = rank;
        }

        return results;
    };
    
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
            finalData[groupName].sort((a: any, b: any) => {
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


    const handleScroll = (amount: number) => {
        window.scrollBy({
            top: amount,
            left: 0,
            behavior: 'smooth'
        });
    };

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

    const SuddenDeathTable = ({ type, data, processedData }: { type: 'individual' | 'team', data: any, processedData: any[] }) => {
        const title = type === 'individual' ? '개인전 서든데스 플레이오프' : '2인 1팀 서든데스 플레이오프';
        const courseName = data?.courseId && tournament?.courses?.[data.courseId]?.name;
        
        return (
            <div className="mb-6">
                <header className="flex flex-col justify-center items-center border-b-4 border-red-500 pb-2 mb-2 text-center">
                    <h1 className="text-2xl md:text-4xl font-bold text-red-400 flex items-center gap-3">
                        <Flame className="h-8 w-8 animate-pulse" />
                        {title}
                        <Flame className="h-8 w-8 animate-pulse" />
                    </h1>
                    {courseName && (
                        <p className="text-lg md:text-xl font-semibold text-gray-300 mt-1">
                            ({courseName})
                        </p>
                    )}
                </header>
                <div className="overflow-x-auto bg-gray-900/50 rounded-lg border-2 border-red-500/50">
                    <table className="w-full text-center border-collapse">
                        <thead className="text-red-300 text-base">
                            <tr className="border-b-2 border-red-600/70">
                                <th className="py-2 px-2 w-48 text-center align-middle font-bold border-r border-red-800/50">선수명(팀명)</th>
                                <th className="py-2 px-2 w-48 text-center align-middle font-bold border-r border-red-800/50">소속</th>
                                {data.holes?.sort((a:number,b:number) => a-b).map((hole:number) => <th key={hole} className="py-2 px-2 w-16 text-center align-middle font-bold border-r border-red-800/50">{hole}홀</th>)}
                                <th className="py-2 px-2 w-20 text-center align-middle font-bold border-r border-red-800/50">합계</th>
                                <th className="py-2 px-2 w-20 text-center align-middle font-bold">순위</th>
                            </tr>
                        </thead>
                        <tbody className="text-xl">
                            {processedData.map(player => (
                                <tr key={player.id} className="border-b border-red-800/50 last:border-0">
                                    <td className="py-1 px-2 text-center align-middle font-semibold border-r border-red-800/50">{player.name}</td>
                                    <td className="py-1 px-2 text-center align-middle text-gray-400 border-r border-red-800/50">{player.club}</td>
                                    {data.holes.map((hole:number) => <td key={hole} className="py-1 px-2 align-middle font-mono font-bold text-2xl border-r border-red-800/50">{player.scoresPerHole[hole] ?? '-'}</td>)}
                                    <td className="py-1 px-2 align-middle font-bold text-2xl border-r border-red-800/50">{player.totalScore}</td>
                                    <td className="py-1 px-2 align-middle font-bold text-yellow-300 text-2xl">{player.rank}위</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    const visibleGroups = Object.keys(finalDataByGroup).filter(groupName => finalDataByGroup[groupName]?.some(player => player.assignedCourses.length > 0));

    return (
        <>
            <style>{`
                .scoreboard-container::-webkit-scrollbar { display: none; }
                .scoreboard-container { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
            <div className="scoreboard-container bg-black h-screen overflow-y-auto text-gray-200 p-2 sm:p-4 md:p-6 font-sans">
                {individualSuddenDeathData?.isActive && (
                    <SuddenDeathTable type="individual" data={individualSuddenDeathData} processedData={processedIndividualSuddenDeathData} />
                )}
                {teamSuddenDeathData?.isActive && (
                    <SuddenDeathTable type="team" data={teamSuddenDeathData} processedData={processedTeamSuddenDeathData} />
                )}
                
                {visibleGroups.length === 0 ? (
                     <NoDataContent />
                ) : visibleGroups.map((groupName) => {
                    const groupPlayers = finalDataByGroup[groupName];
                    if (!groupPlayers || groupPlayers.length === 0) return null;

                    return (
                        <div key={groupName} className="mb-8">
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
                                            <th className="py-1 px-1 w-40 text-center align-middle font-bold border-r border-gray-800">선수명(팀명)</th>
                                            <th className="py-1 px-1 w-28 text-center align-middle font-bold border-r border-gray-800">소속</th>
                                            <th className="py-1 px-1 w-28 text-center align-middle font-bold border-r border-gray-800">코스</th>
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
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 w-40 text-center align-middle font-semibold border-r border-gray-800">{player.name}</td>
                                                                <td rowSpan={player.assignedCourses.length || 1} className="py-0.5 px-1 w-28 text-center align-middle text-gray-400 border-r border-gray-800">{player.club}</td>
                                                            </>
                                                        )}
                                                        <td className="py-0.5 px-1 w-28 align-middle text-center border-r border-gray-800">{player.coursesData[course.id]?.courseName}</td>
                                                        {player.coursesData[course.id]?.holeScores.map((score, i) => <td key={i} className={`py-0.5 px-1 align-middle font-mono font-bold text-xl border-r border-gray-800 ${i % 2 !== 0 ? 'bg-gray-800/50' : ''}`}>{score === null ? '-' : (score === 0 ? '기권' : score)}</td>)}
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
                                                        <td className="py-0.5 px-1 w-40 text-center align-middle font-semibold border-r border-gray-800">{player.name}</td>
                                                        <td className="py-0.5 px-1 w-28 text-center align-middle text-gray-400 border-r border-gray-800">{player.club}</td>
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
            <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
                <button
                    onClick={() => handleScroll(-50)}
                    aria-label="Scroll Up"
                    className="bg-gray-800/70 text-white p-2 rounded-full hover:bg-gray-700 transition-colors"
                >
                    <ChevronUp className="h-6 w-6" />
                </button>
                <button
                    onClick={() => handleScroll(50)}
                    aria-label="Scroll Down"
                    className="bg-gray-800/70 text-white p-2 rounded-full hover:bg-gray-700 transition-colors"
                >
                    <ChevronDown className="h-6 w-6" />
                </button>
            </div>
        </>
    );
}
