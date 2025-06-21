"use client"
import { useEffect, useState } from 'react';

// This scoreboard is designed to mimic the requested image style:
// clean, high-contrast, and suitable for a large TV display.

const mockData = [
    { rank: 1, name: '김철수', club: '서울', course: 'A', total: 33, par: 33, scores: [4,3,4,5,3,4,4,3,3] },
    { rank: 2, name: '박현우', club: '대구', course: 'A', total: 34, par: 33, scores: [4,3,5,5,3,4,4,3,3] },
    { rank: 3, name: '이영민', club: '부산', course: 'A', total: 35, par: 33, scores: [5,4,4,5,4,4,4,2,3] },
    { rank: 4, name: '강성훈', club: '대전', course: 'A', total: 36, par: 33, scores: [4,3,4,5,3,4,4,5,4] },
    { rank: 5, name: '최지아 / 박서준', club: '인천', course: 'B', total: 33, par: 33, scores: [4,3,4,5,3,4,4,3,3] },
    { rank: 6, name: '한지민 / 정해인', club: '광주', course: 'B', total: 38, par: 33, scores: [4,3,4,5,4,5,4,5,4] },
];

const ScoreCell = ({ score, par }: { score: number, par: number }) => {
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
    
    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="bg-[#0A1744] min-h-screen text-white p-4 sm:p-6 md:p-8 font-sans">
            <header className="flex justify-between items-center pb-6 border-b-4 border-amber-400">
                <h1 className="text-5xl md:text-7xl font-bold tracking-wider">PARKGOLF SCOREBOARD</h1>
                <div className="text-4xl md:text-6xl font-mono bg-black/30 px-4 py-2 rounded-lg">{time}</div>
            </header>

            <main className="mt-6 space-y-8">
                {/* This would be mapped from actual groups */}
                <div>
                    <h2 className="text-4xl font-semibold mb-4 bg-white/10 py-2 px-4 rounded-t-lg">남자 개인전 (A 코스)</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1200px] text-center bg-[#1E2952]">
                            <thead className="bg-black/30 text-2xl">
                                <tr>
                                    <th className="p-4 w-24">순위</th>
                                    <th className="p-4 text-left w-64">선수명</th>
                                    <th className="p-4 text-left w-48">소속</th>
                                    {[...Array(9)].map((_, i) => <th key={i} className="p-4 w-20">{i + 1}</th>)}
                                    <th className="p-4 w-32">TOTAL</th>
                                    <th className="p-4 w-32">PAR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mockData.filter(p => p.course === 'A').map((player, idx) => (
                                    <tr key={idx} className="border-b-2 border-slate-600 last:border-b-0 text-3xl">
                                        <td className="p-4 font-bold text-amber-400">{player.rank}</td>
                                        <td className="p-4 text-left font-semibold">{player.name}</td>
                                        <td className="p-4 text-left text-2xl text-slate-300">{player.club}</td>
                                        {player.scores.map((score, i) => <td key={i} className="p-2"><ScoreCell score={score} par={3} /></td>)}
                                        <td className="p-4 font-bold text-4xl">{player.total}</td>
                                        <td className="p-4 text-2xl text-slate-400">{player.par}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                 <div>
                    <h2 className="text-4xl font-semibold mb-4 bg-white/10 py-2 px-4 rounded-t-lg">2인 1팀 (B 코스)</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1200px] text-center bg-[#1E2952]">
                             <thead className="bg-black/30 text-2xl">
                                <tr>
                                    <th className="p-4 w-24">순위</th>
                                    <th className="p-4 text-left w-64">팀명</th>
                                    <th className="p-4 text-left w-48">소속</th>
                                    {[...Array(9)].map((_, i) => <th key={i} className="p-4 w-20">{i + 1}</th>)}
                                    <th className="p-4 w-32">TOTAL</th>
                                    <th className="p-4 w-32">PAR</th>
                                </tr>
                            </thead>
                           <tbody>
                                {mockData.filter(p => p.course === 'B').map((player, idx) => (
                                    <tr key={idx} className="border-b-2 border-slate-600 last:border-b-0 text-3xl">
                                        <td className="p-4 font-bold text-amber-400">{player.rank}</td>
                                        <td className="p-4 text-left font-semibold">{player.name}</td>
                                        <td className="p-4 text-left text-2xl text-slate-300">{player.club}</td>
                                        {player.scores.map((score, i) => <td key={i} className="p-2"><ScoreCell score={score} par={3} /></td>)}
                                        <td className="p-4 font-bold text-4xl">{player.total}</td>
                                        <td className="p-4 text-2xl text-slate-400">{player.par}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
