
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';

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
    coursesData: {
        [courseId: string]: {
            courseName: string;
            courseTotal: number;
            holeScores: (number | null)[];
        }
    };
    total: number; // For tie-breaking
    courseScores: { [courseId: string]: number };
    detailedScores: { [courseId: string]: { [holeNumber: string]: number } };
    assignedCourses: any[];
}

// Helper function for tie-breaking using back-count method
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
    const sortedCourses = [...coursesForGroup].sort((c1, c2) => {
        const name1 = c1?.name || '';
        const name2 = c2?.name || '';
        return name2.localeCompare(name1);
    });

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


export default function AdminDashboard() {
    const { toast } = useToast();
    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [courses, setCourses] = useState({});
    const [groupsData, setGroupsData] = useState({});
    const [filterGroup, setFilterGroup] = useState('all');
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
            setCourses(data.courses || {});
            setGroupsData(data.groups || {});
        });
        const unsubIndividualSuddenDeath = onValue(individualSuddenDeathRef, snap => setIndividualSuddenDeathData(snap.val()));
        const unsubTeamSuddenDeath = onValue(teamSuddenDeathRef, snap => setTeamSuddenDeathData(snap.val()));
        
        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
            unsubIndividualSuddenDeath();
            unsubTeamSuddenDeath();
        }
    }, []);
    
    const processedDataByGroup = useMemo(() => {
        const allCoursesList = Object.values(courses);
        if (Object.keys(players).length === 0 || allCoursesList.length === 0) return {};

        const allProcessedPlayers: any[] = Object.entries(players).map(([playerId, player]: [string, any]) => {
            const playerGroupData = groupsData[player.group];
            const assignedCourseIds = playerGroupData?.courses 
                ? Object.keys(playerGroupData.courses).filter(id => playerGroupData.courses[id]) 
                : [];
            
            const coursesForPlayer = allCoursesList.filter(c => assignedCourseIds.includes(c.id.toString()));

            const playerScoresData = scores[playerId] || {};
            let totalScore = 0;
            const coursesData: any = {};
            const courseScoresForTieBreak: { [courseId: string]: number } = {};
            const detailedScoresForTieBreak: { [courseId: string]: { [holeNumber: string]: number } } = {};
            let hasAnyScore = false;
            let hasForfeited = false;

            coursesForPlayer.forEach((course: any) => {
                const courseId = course.id;
                const scoresForCourse = playerScoresData[courseId] || {};
                detailedScoresForTieBreak[courseId] = scoresForCourse;

                let courseTotal = 0;
                for (let i = 0; i < 9; i++) {
                    const holeScore = scoresForCourse[(i + 1).toString()];
                    if (holeScore !== undefined && holeScore !== null) {
                        const scoreNum = Number(holeScore);
                        // holeScores[i] = scoreNum; // Not used on this page
                        courseTotal += scoreNum;
                        hasAnyScore = true;
                        if (scoreNum === 0) {
                            hasForfeited = true;
                        }
                    }
                }
                
                totalScore += courseTotal;
                courseScoresForTieBreak[courseId] = courseTotal;
                coursesData[courseId] = { courseName: course.name, courseTotal, holeScores: [] }; // holeScores not needed here to save memory
            });

            return {
                id: playerId,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                affiliation: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                group: player.group,
                type: player.type,
                totalScore,
                coursesData,
                hasAnyScore,
                hasForfeited,
                total: totalScore,
                courseScores: courseScoresForTieBreak,
                detailedScores: detailedScoresForTieBreak,
                assignedCourses: coursesForPlayer
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
            const coursesForGroup = groupedData[groupName][0]?.assignedCourses || Object.values(courses);
            
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
    }, [players, scores, courses, groupsData]);
    
    const processSuddenDeath = (suddenDeathData: any) => {
        if (!suddenDeathData?.isActive || !suddenDeathData.players || !suddenDeathData.holes || !Array.isArray(suddenDeathData.holes)) return [];
        
        const participatingPlayerIds = Object.keys(suddenDeathData.players).filter(id => suddenDeathData.players[id]);
        const allPlayersMap = new Map(Object.entries(players).map(([id, p]) => [id, p]));

        const results: any[] = participatingPlayerIds.map(id => {
            const playerInfo: any = allPlayersMap.get(id);
            if (!playerInfo) return null;

            const name = playerInfo.type === 'team' ? `${playerInfo.p1_name} / ${playerInfo.p2_name}` : playerInfo.name;

            let totalScore = 0;
            let holesPlayed = 0;
            suddenDeathData.holes.forEach((hole:number) => {
                const score = suddenDeathData.scores?.[id]?.[hole];
                if (score !== undefined && score !== null) {
                    totalScore += score;
                    holesPlayed++;
                }
            });
            return { id, name, totalScore, holesPlayed };
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
    }

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
            finalData[groupName].sort((a,b) => {
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
    
    const allGroupsList = Object.keys(finalDataByGroup);

    const groupProgress = useMemo(() => {
        const progressByGroup: { [key: string]: number } = {};

        for (const groupName in processedDataByGroup) {
            const groupPlayers = processedDataByGroup[groupName];

            if (!groupPlayers || groupPlayers.length === 0) {
                progressByGroup[groupName] = 0;
                continue;
            }

            const coursesForGroup = groupPlayers[0]?.assignedCourses;
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
                    const assignedCourseIds = coursesForGroup.map((c: any) => c.id.toString());
                    for (const courseId in scores[player.id]) {
                        if (assignedCourseIds.includes(courseId)) {
                             totalScoresEnteredInGroup += Object.keys(scores[player.id][courseId]).length;
                        }
                    }
                 }
            });
            
            const progress = Math.round((totalScoresEnteredInGroup / totalPossibleScoresInGroup) * 100);
            progressByGroup[groupName] = isNaN(progress) ? 0 : progress;
        }

        return progressByGroup;
    }, [processedDataByGroup, scores]);

    const handleExportToExcel = async () => {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();

        const dataToExport = (filterGroup === 'all') 
            ? finalDataByGroup 
            : { [filterGroup]: finalDataByGroup[filterGroup] };

        for (const groupName in dataToExport) {
            const groupPlayers = dataToExport[groupName];
            if (!groupPlayers || groupPlayers.length === 0) continue;

            const ws_data: { [key: string]: any } = {};
            const merges: any[] = [];
            let rowIndex = 0;
            const headers = [
                '순위', '조', '선수명(팀명)', '소속', '코스', 
                '1', '2', '3', '4', '5', '6', '7', '8', '9',
                '코스 합계', '총타수'
            ];

            const centerAlign = { alignment: { horizontal: "center", vertical: "center" } };

            // 1. Set Headers
            headers.forEach((header, colIndex) => {
                const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
                ws_data[cellRef] = { v: header, t: 's', s: { font: { bold: true }, ...centerAlign } };
            });
            rowIndex++;

            // 2. Re-fetch full data for export to include hole scores
            const fullPlayersDataForExport = groupPlayers.map(p => {
                 const playerScoresData = scores[p.id] || {};
                 const coursesData: any = {};
                 p.assignedCourses.forEach((course: any) => {
                    const courseId = course.id;
                    const scoresForCourse = playerScoresData[courseId] || {};
                    const holeScores: (number | string)[] = Array(9).fill('-');
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
                 return {...p, coursesData};
            });

            // 3. Populate Data and Merges
            fullPlayersDataForExport.forEach(player => {
                const startRow = rowIndex;
                const numCourses = player.assignedCourses.length > 0 ? player.assignedCourses.length : 1;
                const endRow = startRow + numCourses - 1;
                
                const addCell = (r: number, c: number, value: any) => {
                    const cellRef = XLSX.utils.encode_cell({ r, c });
                    const type = typeof value === 'number' ? 'n' : 's';
                    ws_data[cellRef] = { v: value, t: type, s: centerAlign };
                };

                // Merged columns
                addCell(startRow, 0, player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : ''));
                addCell(startRow, 1, player.jo);
                addCell(startRow, 2, player.name);
                addCell(startRow, 3, player.affiliation);
                addCell(startRow, 15, player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-'));

                if (numCourses > 1) {
                    merges.push({ s: { r: startRow, c: 0 }, e: { r: endRow, c: 0 } }); // Rank
                    merges.push({ s: { r: startRow, c: 1 }, e: { r: endRow, c: 1 } }); // Jo
                    merges.push({ s: { r: startRow, c: 2 }, e: { r: endRow, c: 2 } }); // Name
                    merges.push({ s: { r: startRow, c: 3 }, e: { r: endRow, c: 3 } }); // Affiliation
                    merges.push({ s: { r: startRow, c: 15 }, e: { r: endRow, c: 15 } });// Total Score
                }

                if (player.assignedCourses.length > 0) {
                    player.assignedCourses.forEach((course: any, courseIndex: number) => {
                        const currentRow = startRow + courseIndex;
                        const courseData = player.coursesData[course.id];
                        
                        addCell(currentRow, 4, courseData?.courseName || course.name);
                        
                        const holeScores = courseData?.holeScores || Array(9).fill('-');
                        holeScores.forEach((score: number | string, i: number) => {
                            addCell(currentRow, 5 + i, score);
                        });

                        addCell(currentRow, 14, player.hasForfeited ? '기권' : (player.hasAnyScore ? (courseData?.courseTotal || 0) : '-'));
                    });
                } else {
                    addCell(startRow, 4, '배정된 코스 없음');
                    merges.push({ s: { r: startRow, c: 4 }, e: { r: startRow, c: 14 } });
                }

                rowIndex += numCourses;
            });
            
            // 4. Create Worksheet
            const ws: XLSX.WorkSheet = ws_data;
            ws['!merges'] = merges;
            ws['!cols'] = [
                { wch: 8 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
                ...Array(9).fill({ wch: 5 }),
                { wch: 10 }, { wch: 10 },
            ];
            
            const range = { s: { r: 0, c: 0 }, e: { r: rowIndex > 0 ? rowIndex - 1 : 0, c: headers.length - 1 } };
            ws['!ref'] = XLSX.utils.encode_range(range);

            XLSX.utils.book_append_sheet(wb, ws, groupName);
        }

        if (wb.SheetNames.length === 0) {
            toast({
                title: "내보내기 실패",
                description: "엑셀로 내보낼 데이터가 없습니다.",
            });
            return;
        }

        XLSX.writeFile(wb, `ParkScore_전체결과_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline">홈 전광판 (관리자용)</CardTitle>
                    <CardDescription>현재 진행중인 대회의 실시간 점수 현황입니다.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 justify-between items-center p-4 bg-muted/50 rounded-lg">
                        <div className="flex gap-4 items-center">
                            <Filter className="w-5 h-5 text-muted-foreground" />
                             <Select value={filterGroup} onValueChange={setFilterGroup}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="그룹 필터" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">모든 그룹</SelectItem>
                                    {allGroupsList.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleExportToExcel} disabled={Object.keys(players).length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            엑셀로 다운로드
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {(filterGroup === 'all' ? allGroupsList : [filterGroup]).map(groupName => {
                const groupPlayers = finalDataByGroup[groupName];
                if (!groupPlayers || groupPlayers.length === 0) return null;
                
                 // Re-fetch full data for display to include hole scores
                const fullPlayersDataForDisplay = groupPlayers.map(p => {
                    const playerScoresData = scores[p.id] || {};
                    const coursesData: any = {};
                    p.assignedCourses.forEach((course: any) => {
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
                    return {...p, coursesData};
                });

                return (
                    <Card key={groupName}>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-xl font-bold font-headline">{groupName}</CardTitle>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-primary">{groupProgress[groupName]}%</p>
                                <p className="text-sm text-muted-foreground">진행률</p>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-16 text-center px-2 py-2 border-r">순위</TableHead>
                                            <TableHead className="w-16 text-center px-2 py-2 border-r">조</TableHead>
                                            <TableHead className="w-28 px-2 py-2 border-r">선수명(팀명)</TableHead>
                                            <TableHead className="w-28 px-2 py-2 border-r">소속</TableHead>
                                            <TableHead className="w-28 px-2 py-2 border-r">코스</TableHead>
                                            {Array.from({length: 9}).map((_, i) => <TableHead key={i} className="w-10 text-center px-2 py-2 border-r">{i + 1}</TableHead>)}
                                            <TableHead className="w-24 text-center px-2 py-2 border-r">합계</TableHead>
                                            <TableHead className="w-24 text-center px-2 py-2">총타수</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {fullPlayersDataForDisplay.map((player) => (
                                            <React.Fragment key={player.id}>
                                                {player.assignedCourses.length > 0 ? player.assignedCourses.map((course: any, courseIndex: number) => (
                                                    <TableRow key={`${player.id}-${course.id}`} className="text-base">
                                                        {courseIndex === 0 && (
                                                            <>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : '-')}</TableCell>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle font-semibold px-2 py-1 border-r">{player.name}</TableCell>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle text-muted-foreground px-2 py-1 border-r">{player.affiliation}</TableCell>
                                                            </>
                                                        )}
                                                        
                                                        <TableCell className="font-medium px-2 py-1 border-r">{player.coursesData[course.id]?.courseName}</TableCell>
                                                        
                                                        {player.coursesData[course.id]?.holeScores.map((score, i) => <TableCell key={i} className="text-center font-mono px-2 py-1 border-r">{score === null ? '-' : score}</TableCell>)}
                                                        
                                                        <TableCell className="text-center font-bold px-2 py-1 border-r">{player.hasForfeited ? '기권' : (player.hasAnyScore ? player.coursesData[course.id]?.courseTotal : '-')}</TableCell>

                                                        {courseIndex === 0 && (
                                                            <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-primary text-lg px-2 py-1">{player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-')}</TableCell>
                                                        )}
                                                    </TableRow>
                                                )) : (
                                                    <TableRow key={`${player.id}-no-course`} className="text-base text-muted-foreground">
                                                         <TableCell className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : '-')}</TableCell>
                                                         <TableCell className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                         <TableCell className="align-middle font-semibold px-2 py-1 border-r">{player.name}</TableCell>
                                                         <TableCell className="align-middle px-2 py-1 border-r">{player.affiliation}</TableCell>
                                                         <TableCell colSpan={11} className="text-center px-2 py-1 border-r">이 그룹에 배정된 코스가 없습니다.</TableCell>
                                                         <TableCell className="text-center align-middle font-bold text-primary text-lg px-2 py-1">{player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-')}</TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    );
}
