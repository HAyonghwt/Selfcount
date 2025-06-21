"use client"
import { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

interface ProcessedPlayer {
    id: string;
    jo: number;
    name: string;
    club: string;
    group: string;
    totalScore: number;
    rank: number;
    coursesData: {
        [courseId: string]: {
            courseName: string;
            courseTotal: number;
            holeScores: number[];
        }
    };
    // For tie-breaking
    total: number;
    courseScores: { [courseId: string]: number };
    detailedScores: { [courseId: string]: { [holeNumber: string]: number } };
}

// Helper function for tie-breaking using back-count method
const tieBreak = (a: any, b: any, activeCourses: any[]) => {
    if (a.total !== b.total) {
        return a.total - b.total;
    }
    const sortedCourses = [...activeCourses].sort((c1, c2) => c2.id - c1.id);
    for (const course of sortedCourses) {
        const courseId = course.id;
        const aCourseScore = a.courseScores[courseId] || 0;
        const bCourseScore = b.courseScores[courseId] || 0;
        if (aCourseScore !== bCourseScore) {
            return aCourseScore - bCourseScore;
        }
    }
    for (const course of sortedCourses) {
        const courseId = course.id;
        const aHoleScores = a.detailedScores[courseId] || {};
        const bHoleScores = b.detailedScores[courseId] || {};
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
    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [tournament, setTournament] = useState<any>({});
    
    useEffect(() => {
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');

        const unsubPlayers = onValue(playersRef, snap => setPlayers(snap.val() || {}));
        const unsubScores = onValue(scoresRef, snap => setScores(snap.val() || {}));
        const unsubTournament = onValue(tournamentRef, snap => setTournament(snap.val() || {}));

        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
        };
    }, []);

    const activeCourses = useMemo(() => 
        Object.values(tournament.courses || {}).filter((c: any) => c.isActive)
    , [tournament.courses]);

    const processedDataByGroup = useMemo(() => {
        if (Object.keys(players).length === 0 || activeCourses.length === 0) return {};

        const allProcessedPlayers: any[] = Object.entries(players).map(([playerId, player]: [string, any]) => {
            const playerScoresData = scores[playerId] || {};
            let totalScore = 0;
            const coursesData: any = {};
            const courseScoresForTieBreak: { [courseId: string]: number } = {};
            const detailedScoresForTieBreak: { [courseId: string]: { [holeNumber: string]: number } } = {};

            activeCourses.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                detailedScoresForTieBreak[courseId] = scoresForCourse;

                const holeScores = Array(9).fill(0);
                let courseTotal = 0;
                for (let i = 0; i < 9; i++) {
                    const holeScore = scoresForCourse[(i + 1).toString()] || 0;
                    holeScores[i] = holeScore;
                    courseTotal += holeScore;
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
                // for tie-breaking
                total: totalScore,
                courseScores: courseScoresForTieBreak,
                detailedScores: detailedScoresForTieBreak
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
            const groupPlayers = groupedData[groupName].sort((a,b) => tieBreak(a, b, activeCourses));
            
            const rankedPlayers: ProcessedPlayer[] = [];
            groupPlayers.forEach((player, index) => {
                let rank;
                if (index > 0 && tieBreak(player, groupPlayers[index - 1], activeCourses) === 0) {
                    rank = rankedPlayers[index - 1].rank;
                } else {
                    rank = index + 1;
                }
                rankedPlayers.push({ ...player, rank });
            });
            rankedData[groupName] = rankedPlayers;
        }
        
        return rankedData;
    }, [players, scores, tournament, activeCourses]);
    
    const progress = useMemo(() => {
        const totalHoles = activeCourses.length * 9;
        if(totalHoles === 0 || Object.keys(scores).length === 0) return 0;
        
        const totalScoresEntered = Object.values(scores).reduce((acc: number, courseScores: any) => {
           return acc + Object.values(courseScores).reduce((cAcc: number, holeScores: any) => cAcc + Object.keys(holeScores).length, 0);
        }, 0);
        
        const totalPossibleScores = Object.keys(players).length * totalHoles;
        if (totalPossibleScores === 0) return 0;

        return Math.round((totalScoresEntered / totalPossibleScores) * 100);
    }, [scores, players, activeCourses]);


    return (
        <div className="bg-[#04091A] min-h-screen text-white p-4 sm:p-6 md:p-8 font-sans">
            {Object.entries(processedDataByGroup).map(([groupName, groupPlayers]) => {
                if (groupPlayers.length === 0) return null;

                return (
                    <div key={groupName} className="mb-12">
                        <header className="flex justify-between items-center pb-3 mb-4 border-b-2 border-gray-600">
                            <h1 className="text-4xl font-bold">
                                {tournament.name || '파크골프 토너먼트'} ({groupName})
                            </h1>
                            <div className="text-3xl font-bold text-green-400">{progress}% 진행</div>
                        </header>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1200px] text-center border-separate border-spacing-y-1">
                                <thead className="text-gray-400 text-lg">
                                    <tr>
                                        <th className="p-2 w-20">조</th>
                                        <th className="p-2 w-48 text-left">선수명(팀명)</th>
                                        <th className="p-2 w-48 text-left">소속</th>
                                        <th className="p-2 w-32 text-left">코스</th>
                                        <th colSpan={9} className="p-2">HOLE</th>
                                        <th className="p-2 w-24">합계</th>
                                        <th className="p-2 w-24">총타수</th>
                                        <th className="p-2 w-20">순위</th>
                                    </tr>
                                    <tr>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        {Array.from({length: 9}).map((_, i) => <th key={i} className="p-1 font-normal">{i + 1}</th>)}
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupPlayers.map((player) => (
                                        <React.Fragment key={player.id}>
                                            {activeCourses.map((course, courseIndex) => (
                                                <tr key={`${player.id}-${course.id}`} className="bg-[#121A39] text-xl">
                                                    {courseIndex === 0 && (
                                                        <>
                                                            <td rowSpan={activeCourses.length} className="p-2 align-middle border-y-4 border-l-4 border-transparent rounded-l-lg text-2xl font-bold">{player.jo}</td>
                                                            <td rowSpan={activeCourses.length} className="p-2 align-middle text-left text-2xl font-semibold">{player.name}</td>
                                                            <td rowSpan={activeCourses.length} className="p-2 align-middle text-left">{player.club}</td>
                                                        </>
                                                    )}
                                                    <td className="p-2 text-left">{player.coursesData[course.id]?.courseName}</td>
                                                    {player.coursesData[course.id]?.holeScores.map((score, i) => <td key={i} className="p-2 font-mono">{score || 0}</td>)}
                                                    <td className="p-2 font-bold">{player.coursesData[course.id]?.courseTotal}</td>
                                                    {courseIndex === 0 && (
                                                        <>
                                                            <td rowSpan={activeCourses.length} className="p-2 align-middle text-2xl font-bold text-yellow-400">{player.totalScore > 0 ? player.totalScore : ''}</td>
                                                            <td rowSpan={activeCourses.length} className="p-2 align-middle border-y-4 border-r-4 border-transparent rounded-r-lg text-2xl font-bold">{player.totalScore > 0 ? `${player.rank}위` : ''}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            })}
        </div>
    );
}
