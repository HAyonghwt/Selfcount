
"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Download, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx-js-style';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import ExternalScoreboardInfo from '@/components/ExternalScoreboardInfo';

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
const tieBreak = (a: any, b: any, sortedCourses: any[]) => {
    if (a.hasForfeited && !b.hasForfeited) return 1;
    if (!a.hasForfeited && b.hasForfeited) return -1;
    
    if (!a.hasAnyScore && !b.hasAnyScore) return 0;
    if (!a.hasAnyScore) return 1;
    if (!b.hasAnyScore) return -1;
    
    if (a.total !== b.total) {
        return a.total - b.total;
    }

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
    // 점수 수정 모달 상태
    const [scoreEditModal, setScoreEditModal] = useState({
        open: false,
        playerId: '',
        courseId: '',
        holeIndex: -1,
        score: ''
    });

    // 점수 초기화 모달 상태
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // 기록 보관하기(아카이브) - 실제 구현은 추후
    const handleArchiveScores = async () => {
        try {
            // 대회명 추출 (tournaments/current.name에서 직접 읽기)
            const tournamentRef = ref(db, 'tournaments/current/name');
            let tournamentName = '';
            await new Promise<void>((resolve) => {
                onValue(tournamentRef, (snap) => {
                    tournamentName = snap.val() || '대회';
                    resolve();
                }, { onlyOnce: true });
            });
            // 날짜+시간
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            // archiveId: 날짜+시간+대회명(공백제거)
            const archiveId = `${(tournamentName || '대회').replace(/\s/g, '')}_${now.getFullYear()}${pad(now.getMonth()+1)}`; // 대회명_YYYYMM 형식
            // 참가자 수
            const playerCount = Object.keys(players).length;
            // 저장 데이터
            const archiveData = {
                savedAt: now.toISOString(),
                tournamentName: tournamentName || '대회',
                playerCount,
                players,
                scores,
                courses,
                groups: groupsData,
                processedByGroup: finalDataByGroup // 그룹별 순위/점수 등 가공 데이터 추가 저장
            };
            await set(ref(db, `archives/${archiveId}`), archiveData);
            toast({ title: '기록 보관 완료', description: `대회명: ${tournamentName || '대회'} / 참가자: ${playerCount}명`, variant: 'success' });
        } catch (e: any) {
            toast({ title: '보관 실패', description: e?.message || '알 수 없는 오류', variant: 'destructive' });
        }
    };

    // 점수 초기화 기능
    const handleResetScores = async () => {
        try {
            await set(ref(db, 'scores'), null); // firebase realtime db 전체 점수 초기화
        } catch (e) {
            // TODO: 에러 처리
        } finally {
            setShowResetConfirm(false);
        }
    };

    // 점수 저장 임시 함수(실제 저장/재계산 로직은 추후 구현)
    const handleScoreEditSave = async () => {
    const { playerId, courseId, holeIndex, score } = scoreEditModal;
    if (!playerId || !courseId || holeIndex === -1) {
        setScoreEditModal({ ...scoreEditModal, open: false });
        return;
    }
    try {
        // firebase realtime db에 점수 저장
        const scoreValue = score === '' ? null : Number(score);
        await set(ref(db, `scores/${playerId}/${courseId}/${holeIndex + 1}`), scoreValue);
        setScoreEditModal({ ...scoreEditModal, open: false });
    } catch (e) {
        setScoreEditModal({ ...scoreEditModal, open: false });
        // TODO: 에러 토스트 등 처리
    }
};
    // 항상 현재 도메인 기준으로 절대주소 생성
    const externalScoreboardUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/scoreboard`
        : '/scoreboard';
    const { toast } = useToast();
    const router = useRouter();
    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [courses, setCourses] = useState({});
    const [groupsData, setGroupsData] = useState({});
    const [filterGroup, setFilterGroup] = useState('all');
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<any>(null);
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<any>(null);
    const [notifiedSuddenDeathGroups, setNotifiedSuddenDeathGroups] = useState<Set<string>>(new Set());

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
        const allCoursesList = Object.values(courses).filter(Boolean);
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
                coursesData[courseId] = {
  courseName: course.name,
  courseTotal,
  holeScores: Array.from({ length: 9 }, (_, i) => {
    const holeScore = scoresForCourse[(i + 1).toString()];
    return holeScore !== undefined && holeScore !== null ? Number(holeScore) : '-';
  })
}; // archive 기록보관용: holeScores 실제 점수 저장
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
            
            // Optimization: Pre-sort courses for tie-breaking
            const sortedCoursesForTieBreak = [...coursesForGroup].sort((c1, c2) => {
                const name1 = c1?.name || '';
                const name2 = c2?.name || '';
                return name2.localeCompare(name1);
            });

            const playersToSort = groupedData[groupName].filter(p => p.hasAnyScore && !p.hasForfeited);
            const otherPlayers = groupedData[groupName].filter(p => !p.hasAnyScore || p.hasForfeited);
            
            const playerType = playersToSort[0]?.type;
            const isSuddenDeathActiveForThisGroup = playerType === 'individual'
                ? individualSuddenDeathData?.isActive
                : teamSuddenDeathData?.isActive;

            if (playersToSort.length > 0) {
                const leaderScore = playersToSort.reduce((min, p) => Math.min(min, p.totalScore), Infinity);

                playersToSort.sort((a, b) => {
                    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
                    if (a.totalScore === leaderScore && isSuddenDeathActiveForThisGroup) {
                        return a.name.localeCompare(b.name);
                    }
                    return tieBreak(a, b, sortedCoursesForTieBreak);
                });

                let rank = 1;
                playersToSort[0].rank = rank;
                for (let i = 1; i < playersToSort.length; i++) {
                    const prev = playersToSort[i-1];
                    const curr = playersToSort[i];
                    
                    let isTied = false;
                    if (curr.totalScore === prev.totalScore) {
                        if (curr.totalScore === leaderScore && isSuddenDeathActiveForThisGroup) {
                            isTied = true;
                        } else {
                            isTied = tieBreak(curr, prev, sortedCoursesForTieBreak) === 0;
                        }
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
    }, [players, scores, courses, groupsData, individualSuddenDeathData, teamSuddenDeathData]);
    
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

    useEffect(() => {
        if (!groupProgress || !finalDataByGroup) return;

        Object.keys(groupProgress).forEach(groupName => {
            // Check if group is 100% complete and not yet notified
            if (groupProgress[groupName] === 100 && !notifiedSuddenDeathGroups.has(groupName)) {
                const playersInGroup = finalDataByGroup[groupName];
                if (playersInGroup) {
                    const tiedFirstPlace = playersInGroup.filter(p => p.rank === 1);
                    
                    // Check if there are 2 or more players tied for first
                    if (tiedFirstPlace.length > 1) {
                        toast({
                            title: `🚨 서든데스 필요: ${groupName}`,
                            description: `${groupName} 그룹의 경기가 완료되었으며, 1위 동점자가 발생했습니다. 서든데스 관리가 필요합니다.`,
                            action: (
                                <ToastAction altText="관리하기" onClick={() => router.push('/admin/suddendeath')}>
                                    관리하기
                                </ToastAction>
                            ),
                            duration: 30000 // Keep the toast on screen longer
                        });
                        
                        // Add to notified set to prevent re-triggering
                        setNotifiedSuddenDeathGroups(prev => {
                            const newSet = new Set(prev);
                            newSet.add(groupName);
                            return newSet;
                        });
                    }
                }
            }
        });
    }, [groupProgress, finalDataByGroup, notifiedSuddenDeathGroups, toast, router]);

    const handleExportToExcel = async () => {
        const XLSX = await import('xlsx-js-style');
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

            // 개선된 셀 스타일 정의 - XLSX 라이브러리 호환 방식
            const borderStyle = {
                top: { style: "thin" },
                bottom: { style: "thin" },
                left: { style: "thin" },
                right: { style: "thin" }
            };
            
            const centerAlign = { 
                alignment: { horizontal: "center", vertical: "center" },
                border: borderStyle
            };
            
            const headerStyle = {
                alignment: { horizontal: "center", vertical: "center" },
                border: borderStyle,
                font: { bold: true },
                fill: { fgColor: { rgb: "E6E6FA" } }
            };

            // 1. Set Headers
            headers.forEach((header, colIndex) => {
                const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
                ws_data[cellRef] = { v: header, t: 's', s: headerStyle };
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
                return { ...p, coursesData };
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
            
            // 모든 셀에 스타일 재적용 - 더 확실한 방법
            const range = { s: { r: 0, c: 0 }, e: { r: rowIndex - 1, c: headers.length - 1 } };
            ws['!ref'] = XLSX.utils.encode_range(range);
            
            // 모든 셀에 스타일 적용
            for (let r = 0; r < rowIndex; r++) {
                for (let c = 0; c < headers.length; c++) {
                    const cellRef = XLSX.utils.encode_cell({ r, c });
                    if (ws_data[cellRef]) {
                        // 헤더 행 (첫 번째 행)인지 확인
                        if (r === 0) {
                            ws_data[cellRef].s = headerStyle;
                        } else {
                            ws_data[cellRef].s = centerAlign;
                        }
                    }
                }
            }
            
            // 셀 너비 자동 조정 - 글자수에 맞춰 동적으로 설정
            const colWidths = headers.map((header, colIndex) => {
                let maxWidth = header.length; // 헤더 길이를 기본값으로
                
                // 각 행의 데이터를 확인하여 최대 길이 계산
                for (let r = 1; r < rowIndex; r++) {
                    const cellRef = XLSX.utils.encode_cell({ r, c: colIndex });
                    const cell = ws_data[cellRef];
                    if (cell && cell.v) {
                        const cellValue = String(cell.v);
                        maxWidth = Math.max(maxWidth, cellValue.length);
                    }
                }
                
                // 최소 너비 6, 최대 너비 35로 확장, 여유분 +4
                return { wch: Math.min(Math.max(maxWidth + 4, 6), 35) };
            });
            
            ws['!cols'] = colWidths;

            // 모든 셀에 스타일 강제 적용 (누락 셀 포함)
            const totalRows = rowIndex;
            for (let r = 0; r < totalRows; r++) {
                for (let c = 0; c < headers.length; c++) {
                    const cellRef = XLSX.utils.encode_cell({ r, c });
                    if (ws_data[cellRef]) {
                        // 이미 스타일이 있다면 border/align 보장
                        ws_data[cellRef].s = { ...centerAlign, ...(ws_data[cellRef].s || {}) };
                    } else {
                        // 빈셀도 스타일 적용
                        ws_data[cellRef] = { v: '', t: 's', s: centerAlign };
                    }
                }
            }

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

    const [searchPlayer, setSearchPlayer] = useState('');
    const [highlightedPlayerId, setHighlightedPlayerId] = useState(null);
    const playerRowRefs = useRef({});

    const filteredPlayerResults = useMemo(() => {
        if (!searchPlayer) return [];
        const lowerCaseSearch = searchPlayer.toLowerCase();
        return Object.values(finalDataByGroup).flat().filter(player => {
            return player.name.toLowerCase().includes(lowerCaseSearch) || player.affiliation.toLowerCase().includes(lowerCaseSearch);
        });
    }, [searchPlayer, finalDataByGroup]);

    const handlePlayerSearchSelect = (playerId: number) => {
        setHighlightedPlayerId(playerId);
        // rowRef가 배열 또는 undefined일 수 있음. 첫 번째 DOM 요소만 스크롤.
        const rowRefArr = playerRowRefs.current[playerId];
        if (Array.isArray(rowRefArr) && rowRefArr[0] && typeof rowRefArr[0].scrollIntoView === 'function') {
            rowRefArr[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    return (
        <>
            <ExternalScoreboardInfo url={externalScoreboardUrl} />
            <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline">홈 전광판 (관리자용)</CardTitle>
                    <CardDescription>현재 진행중인 대회의 실시간 점수 현황입니다.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* 선수 검색 입력창 */}
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center sm:justify-between p-4 bg-muted/50 rounded-lg">
  <div className="flex flex-row gap-2 items-center w-full sm:w-auto">
    <Filter className="w-5 h-5 text-muted-foreground" />
    <Select value={filterGroup} onValueChange={setFilterGroup}>
      <SelectTrigger className="w-[140px] sm:w-[180px]">
        <SelectValue placeholder="그룹 필터" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">모든 그룹</SelectItem>
        {allGroupsList.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
      </SelectContent>
    </Select>
    <Button className="ml-2 bg-green-600 hover:bg-green-700 text-white" onClick={handleExportToExcel} disabled={Object.keys(players).length === 0}>
  <Download className="mr-2 h-4 w-4" />
  엑셀로 다운로드
</Button>
<Button className="ml-2 bg-blue-600 hover:bg-blue-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={handleArchiveScores}>
  기록 보관하기
</Button>
<Button className="ml-2 bg-red-600 hover:bg-red-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={() => setShowResetConfirm(true)}>
  점수 초기화
</Button>

{/* 점수 초기화 확인 모달 */}
{showResetConfirm && (
  <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>정말로 모든 점수를 초기화하시겠습니까?</DialogTitle>
        <DialogDescription>이 작업은 되돌릴 수 없으며, 모든 선수의 대회 점수가 삭제됩니다.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-row justify-end gap-2 mt-4">
        <Button variant="outline" onClick={() => setShowResetConfirm(false)}>취소</Button>
        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleResetScores}>초기화 진행</Button>
      </div>
    </DialogContent>
  </Dialog>
) }
  </div>
</div>

{/* 점수 수정용 선수/팀 검색 카드 */}
<Card className="mb-4">
  <div className="flex flex-row items-center justify-between w-full p-4">
    <span className="text-base font-bold whitespace-nowrap mr-4">점수 수정을 위해 선수 검색시 사용</span>
    <div className="flex flex-row gap-2 items-center w-full max-w-xs border rounded bg-white shadow px-3 py-2">
      <input
        type="text"
        className="w-full outline-none bg-transparent"
        placeholder="선수명 또는 팀명 검색"
        value={searchPlayer}
        onChange={e => setSearchPlayer(e.target.value)}
      />
      {searchPlayer && filteredPlayerResults.length > 0 && (
        <div className="absolute bg-white border rounded shadow-lg z-50 mt-10 max-h-60 overflow-y-auto">
          {filteredPlayerResults.map((result, idx) => (
            <div
              key={result.id}
              className="px-3 py-2 hover:bg-primary/20 cursor-pointer"
              onClick={() => handlePlayerSearchSelect(result.id)}
            >
              {result.name} <span className="text-xs text-muted-foreground">({result.group})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
</Card>
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
                                            <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{minWidth:'90px',maxWidth:'260px',flexGrow:1}}>선수명(팀명)</TableHead>
                                            <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{minWidth:'80px',maxWidth:'200px',flexGrow:1}}>소속</TableHead>
                                            <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{minWidth:'80px',maxWidth:'200px',flexGrow:1}}>코스</TableHead>
                                            {Array.from({length: 9}).map((_, i) => <TableHead key={i} className="w-10 text-center px-2 py-2 border-r">{i + 1}</TableHead>)}
                                            <TableHead className="w-24 text-center px-2 py-2 border-r">합계</TableHead>
                                            <TableHead className="w-24 text-center px-2 py-2">총타수</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                         {fullPlayersDataForDisplay.map((player) => (
                                            <React.Fragment key={player.id}>
                                                {player.assignedCourses.length > 0 ? player.assignedCourses.map((course: any, courseIndex: number) => (
                                                    <TableRow
                                                        key={`${player.id}-${course.id}`}
                                                        ref={el => {
                                                            if (!playerRowRefs.current[player.id]) playerRowRefs.current[player.id] = [];
                                                            playerRowRefs.current[player.id][courseIndex] = el;
                                                        }}
                                                        className={`text-base ${highlightedPlayerId === player.id ? 'bg-yellow-100 animate-pulse' : ''}`}
                                                    >
                                                        {courseIndex === 0 && (
                                                            <>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : '-')}</TableCell>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle font-semibold px-2 py-1 border-r text-center whitespace-nowrap" style={{minWidth:'90px',maxWidth:'260px',flexGrow:1}}>{player.name}</TableCell>
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle text-muted-foreground px-2 py-1 border-r text-center whitespace-nowrap" style={{minWidth:'80px',maxWidth:'200px',flexGrow:1}}>{player.affiliation}</TableCell>
                                                            </>
                                                        )}
                                                        
                                                        <TableCell className="font-medium px-2 py-1 border-r text-center whitespace-nowrap" style={{minWidth:'80px',maxWidth:'200px',flexGrow:1}}>{player.coursesData[course.id]?.courseName}</TableCell>
                                                        
                                                        {player.coursesData[course.id]?.holeScores.map((score, i) => (
  <TableCell
    key={i}
    className="text-center font-mono px-2 py-1 border-r cursor-pointer hover:bg-primary/10"
    onDoubleClick={() => {
      setScoreEditModal({
        open: true,
        playerId: player.id,
        courseId: course.id,
        holeIndex: i,
        score: score === null ? '' : score
      });
    }}
  >
    {score === null ? '-' : score}
  </TableCell>
))}

{/* 점수 수정 모달 */}
{scoreEditModal?.open && scoreEditModal.playerId === player.id && scoreEditModal.courseId === course.id && (
  <Dialog open={scoreEditModal.open} onOpenChange={open => setScoreEditModal({ ...scoreEditModal, open })}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>점수 수정</DialogTitle>
        <DialogDescription>
          선수: <b>{player.name}</b> / 코스: <b>{player.coursesData[course.id]?.courseName}</b> / 홀: <b>{scoreEditModal.holeIndex + 1}번</b>
        </DialogDescription>
      </DialogHeader>
      <input
        type="number"
        className="w-full border rounded px-3 py-2 text-lg text-center"
        value={scoreEditModal.score}
        onChange={e => setScoreEditModal({ ...scoreEditModal, score: e.target.value })}
        min={1}
        max={20}
        autoFocus
      />
      <DialogFooter>
        <Button onClick={() => handleScoreEditSave()}>저장</Button>
        <Button variant="outline" onClick={() => setScoreEditModal({ ...scoreEditModal, open: false })}>취소</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)}
                                                        
                                                        <TableCell className="text-center font-bold px-2 py-1 border-r">{player.hasForfeited ? '기권' : (player.hasAnyScore ? player.coursesData[course.id]?.courseTotal : '-')}</TableCell>

                                                        {courseIndex === 0 && (
                                                            <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-primary text-lg px-2 py-1">{player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-')}</TableCell>
                                                        )}
                                                    </TableRow>
                                                )) : (
                                                    <TableRow key={`${player.id}-no-course`} className="text-base text-muted-foreground">
                                                         <TableCell className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? '기권' : '-')}</TableCell>
                                                         <TableCell className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                         <TableCell className="align-middle font-semibold px-2 py-1 border-r text-center">{player.name}</TableCell>
                                                         <TableCell className="align-middle px-2 py-1 border-r text-center">{player.affiliation}</TableCell>
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
        </>
    );
}