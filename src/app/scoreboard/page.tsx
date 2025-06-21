"use client"
import { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

interface ProcessedPlayer {
    id: string;
    rank: number;
    name: string;
    club: string;
    group: string;
    courseId: string;
    total: number;
    par: number;
    scores: number[];
}

const ScoreCell = ({ score, par }: { score: number, par: number }) => {
    if (score === 0) return <div className="w-12 h-12 flex items-center justify-center text-2xl font-bold rounded-full bg-gray-600/50">-</div>;
    const diff = score - par;
    let className = "w-12 h-12 flex items-center justify-center text-2xl font-bold rounded-full ";
    if (diff < -1) className += "bg-blue-500 text-white"; // Eagle
    else if (diff === -1) className += "bg-sky-400 text-white"; // Birdie
    else if (diff === 0) className += "bg-gray-200 text-gray-800"; // Par
    else if (diff === 1) className += "bg-red-400 text-white"; // Bogey
    else className += "bg-red-700 text-white"; // Double Bogey+
    return <div className={className}>{score}</div>
}

export default function ExternalScoreboard() {
    const [time, setTime] = useState('');
    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [tournament, setTournament] = useState<any>({});
    
    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }));
        }, 1000);

        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');

        const unsubPlayers = onValue(playersRef, snap => setPlayers(snap.val() || {}));
        const unsubScores = onValue(scoresRef, snap => setScores(snap.val() || {}));
        const unsubTournament = onValue(tournamentRef, snap => setTournament(snap.val() || {}));

        return () => {
            clearInterval(timer);
            unsubPlayers();
            unsubScores();
            unsubTournament();
        };
    }, []);

    const coursesMap = useMemo(() => new Map(Object.values(tournament.courses || {}).map((c: any) => [c.id.toString(), c])), [tournament.courses]);

    const processedDataByGroupAndCourse = useMemo(() => {
        const activeCourses = Object.values(tournament.courses || {}).filter((c: any) => c.isActive);
        if (Object.keys(players).length === 0 || activeCourses.length === 0) return {};

        type UnrankedPlayer = Omit<ProcessedPlayer, 'rank'>;
        const allProcessedPlayers: UnrankedPlayer[] = [];

        Object.entries(players).forEach(([playerId, player]: [string, any]) => {
            const playerScores = scores[playerId] || {};

            activeCourses.forEach((course: any) => {
                const courseId = course.id.toString();
                const scoresForCourse = playerScores[courseId] || {};
                
                const holeScores = Array(course.pars.length).fill(0);
                course.pars.forEach((_par: any, index: number) => {
                    holeScores[index] = scoresForCourse[(index + 1).toString()] || 0;
                });
                
                const total = holeScores.reduce((a, b) => a + b, 0);
                
                if (total > 0) { // Only show players with at least one score
                    allProcessedPlayers.push({
                        id: `${playerId}-${courseId}`,
                        name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                        club: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                        group: player.group,
                        courseId: courseId,
                        total,
                        par: course.pars.reduce((a:number, b:number) => a + b, 0),
                        scores: holeScores,
                    });
                }
            });
        });

        // Group players by a composite key: `groupName-courseId`
        const groupedData = allProcessedPlayers.reduce((acc, player) => {
            const key = `${player.group}-${player.courseId}`;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(player);
            return acc;
        }, {} as Record<string, UnrankedPlayer[]>);

        // Sort and rank within each group-course combination
        const rankedData: { [key: string]: ProcessedPlayer[] } = {};
        for (const key in groupedData) {
            const groupPlayers = groupedData[key];
            const sortedPlayers = groupPlayers.sort((a, b) => a.total - b.total);
            
            rankedData[key] = sortedPlayers.map((player, index) => ({
                ...player,
                rank: index + 1
            }));
        }
        
        return rankedData;
    }, [players, scores, tournament]);


    return (
        <div className="bg-[#0A1744] min-h-screen text-white p-4 sm:p-6 md:p-8 font-sans">
            <header className="flex justify-between items-center pb-6 border-b-4 border-amber-400">
                <h1 className="text-5xl md:text-7xl font-bold tracking-wider uppercase">{tournament.name || 'PARKGOLF SCOREBOARD'}</h1>
                <div className="text-4xl md:text-6xl font-mono bg-black/30 px-4 py-2 rounded-lg">{time}</div>
            </header>

            <main className="mt-6 space-y-8">
                {Object.entries(processedDataByGroupAndCourse).map(([key, groupPlayers]) => {
                    if (groupPlayers.length === 0) return null;
                    
                    const firstPlayer = groupPlayers[0];
                    const course = coursesMap.get(firstPlayer.courseId);
                    const groupName = firstPlayer.group;
                    
                    if (!course) return null;

                    return (
                        <div key={key}>
                            <h2 className="text-4xl font-semibold mb-4 bg-white/10 py-2 px-4 rounded-t-lg">{groupName} ({course.name})</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[1200px] text-center bg-[#1E2952]">
                                    <thead className="bg-black/30 text-2xl">
                                        <tr>
                                            <th className="p-4 w-24">순위</th>
                                            <th className="p-4 text-left w-64">선수/팀명</th>
                                            <th className="p-4 text-left w-48">소속</th>
                                            {course.pars.map((_par: number, i: number) => <th key={i} className="p-4 w-20">{i + 1}</th>)}
                                            <th className="p-4 w-32">TOTAL</th>
                                            <th className="p-4 w-32">PAR</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupPlayers.map((player) => (
                                            <tr key={player.id} className="border-b-2 border-slate-600 last:border-b-0 text-3xl">
                                                <td className="p-4 font-bold text-amber-400">{player.rank}</td>
                                                <td className="p-4 text-left font-semibold">{player.name}</td>
                                                <td className="p-4 text-left text-2xl text-slate-300">{player.club}</td>
                                                {player.scores.map((score, i) => <td key={i} className="p-2"><ScoreCell score={score} par={course.pars[i]} /></td>)}
                                                <td className="p-4 font-bold text-4xl">{player.total}</td>
                                                <td className="p-4 text-2xl text-slate-400">{player.par}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                })}
            </main>
        </div>
    );
}
