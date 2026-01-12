
"use client"
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Input } from '@/components/ui/input';
import { Flame, Play, RotateCcw, User, Users, ArrowUp, ArrowDown, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Player {
    id: string;
    jo: number;
    name: string;
    affiliation: string;
    group: string;
    type: 'individual' | 'team';
    totalScore: number;
    rank: number | null;
    hasAnyScore: boolean;
    hasForfeited: boolean;
}

interface Course {
    id: number;
    name: string;
}

interface SuddenDeathData {
    isActive: boolean;
    players: { [key: string]: boolean };
    courseId: string;
    holes: number[];
    scores: { [playerId: string]: { [hole: string]: number } };
}

interface NTPData {
    isActive: boolean;
    players: { [key: string]: boolean };
    rankings: { [playerId: string]: number }; // playerId -> rank (1, 2, 3...)
}

export default function SuddenDeathPage() {
    const { toast } = useToast();

    // Raw data from Firebase
    const [players, setPlayers] = useState({});
    const [scores, setScores] = useState({});
    const [courses, setCourses] = useState<Course[]>([]);
    const [groupsData, setGroupsData] = useState({});

    // Sudden death states (separated for individual and team, now group-based)
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<{ [groupName: string]: Partial<SuddenDeathData> }>({});
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<{ [groupName: string]: Partial<SuddenDeathData> }>({});

    // Processed data
    const [tiedIndividualPlayers, setTiedIndividualPlayers] = useState<Player[]>([]);
    const [tiedTeamPlayers, setTiedTeamPlayers] = useState<Player[]>([]);

    // UI states for individual tab
    const [selectedIndividualPlayers, setSelectedIndividualPlayers] = useState<{ [key: string]: boolean }>({});
    const [selectedIndividualCourseId, setSelectedIndividualCourseId] = useState<string>('');
    const [selectedIndividualHoles, setSelectedIndividualHoles] = useState<number[]>([]);
    const [individualSuddenDeathScores, setIndividualSuddenDeathScores] = useState<{ [groupName: string]: { [key: string]: { [key: string]: string } } }>({});

    // UI states for team tab
    const [selectedTeamPlayers, setSelectedTeamPlayers] = useState<{ [key: string]: boolean }>({});
    const [selectedTeamCourseId, setSelectedTeamCourseId] = useState<string>('');
    const [selectedTeamHoles, setSelectedTeamHoles] = useState<number[]>([]);
    const [teamSuddenDeathScores, setTeamSuddenDeathScores] = useState<{ [groupName: string]: { [key: string]: { [key: string]: string } } }>({});

    // Backcount states (separated for individual and team, now group-based)
    const [individualBackcountApplied, setIndividualBackcountApplied] = useState<{ [groupName: string]: boolean }>({});
    const [teamBackcountApplied, setTeamBackcountApplied] = useState<{ [groupName: string]: boolean }>({});

    // NTP states (separated for individual and team, now group-based)
    const [individualNTPData, setIndividualNTPData] = useState<{ [groupName: string]: Partial<NTPData> }>({});
    const [teamNTPData, setTeamNTPData] = useState<{ [groupName: string]: Partial<NTPData> }>({});

    // NTP UI states
    const [selectedIndividualNTPPlayers, setSelectedIndividualNTPPlayers] = useState<{ [key: string]: boolean }>({});
    const [selectedTeamNTPPlayers, setSelectedTeamNTPPlayers] = useState<{ [key: string]: boolean }>({});
    const [individualNTPRankings, setIndividualNTPRankings] = useState<{ [groupName: string]: { [key: string]: number } }>({});
    const [teamNTPRankings, setTeamNTPRankings] = useState<{ [groupName: string]: { [key: string]: number } }>({});

    // Tie-breaking logic from dashboard (needed to find tied players)
    const tieBreak = (a: any, b: any, coursesForGroup: any[]) => {
        if (a.hasForfeited && !b.hasForfeited) return 1;
        if (!a.hasForfeited && b.hasForfeited) return -1;
        if (!a.hasAnyScore && !b.hasAnyScore) return 0;
        if (!a.hasAnyScore) return 1;
        if (!b.hasAnyScore) return -1;
        if (a.total !== b.total) return a.total - b.total;
        const sortedCourses = [...coursesForGroup].sort((c1, c2) => {
            const name1 = c1?.name || '';
            const name2 = c2?.name || '';
            return name2.localeCompare(name1);
        });
        for (const course of sortedCourses) {
            const courseId = course.id;
            const aCourseScore = a.courseScores[courseId] || 0;
            const bCourseScore = b.courseScores[courseId] || 0;
            if (aCourseScore !== bCourseScore) return aCourseScore - bCourseScore;
        }
        if (sortedCourses.length > 0) {
            const lastCourseId = sortedCourses[0].id;
            const aHoleScores = a.detailedScores[lastCourseId] || {};
            const bHoleScores = b.detailedScores[lastCourseId] || {};
            for (let i = 9; i >= 1; i--) {
                const hole = i.toString();
                const aHole = aHoleScores[hole] || 0;
                const bHole = bHoleScores[hole] || 0;
                if (aHole !== bHole) return aHole - bHole;
            }
        }
        return 0;
    };

    // Backcount logic for 1st place tied players
    const backcountBreak = (a: any, b: any, coursesForGroup: any[]) => {
        if (a.hasForfeited && !b.hasForfeited) return 1;
        if (!a.hasForfeited && b.hasForfeited) return -1;
        if (!a.hasAnyScore && !b.hasAnyScore) return 0;
        if (!a.hasAnyScore) return 1;
        if (!b.hasAnyScore) return -1;
        if (a.total !== b.total) return a.total - b.total;

        // Backcount: Start from the last course and work backwards
        const sortedCourses = [...coursesForGroup].sort((c1, c2) => {
            const name1 = c1?.name || '';
            const name2 = c2?.name || '';
            return name2.localeCompare(name1);
        });

        for (const course of sortedCourses) {
            const courseId = course.id;
            const aCourseScore = a.courseScores[courseId] || 0;
            const bCourseScore = b.courseScores[courseId] || 0;
            if (aCourseScore !== bCourseScore) return aCourseScore - bCourseScore;
        }

        // If all courses are tied, compare holes from last hole to first hole
        if (sortedCourses.length > 0) {
            const lastCourseId = sortedCourses[0].id;
            const aHoleScores = a.detailedScores[lastCourseId] || {};
            const bHoleScores = b.detailedScores[lastCourseId] || {};
            for (let i = 9; i >= 1; i--) {
                const hole = i.toString();
                const aHole = aHoleScores[hole] || 0;
                const bHole = bHoleScores[hole] || 0;
                if (aHole !== bHole) return aHole - bHole;
            }
        }
        return 0;
    };


    // Fetch all necessary data
    useEffect(() => {
        if (!db) return;

        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const tournamentRef = ref(db, 'tournaments/current');
        const individualSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/individual');
        const teamSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/team');
        const individualBackcountRef = ref(db, 'tournaments/current/backcountApplied/individual');
        const teamBackcountRef = ref(db, 'tournaments/current/backcountApplied/team');
        const individualNTPRef = ref(db, 'tournaments/current/nearestToPin/individual');
        const teamNTPRef = ref(db, 'tournaments/current/nearestToPin/team');

        const unsubPlayers = onValue(playersRef, snap => setPlayers(snap.val() || {}));
        const unsubScores = onValue(scoresRef, snap => setScores(snap.val() || {}));
        const unsubTournament = onValue(tournamentRef, snap => {
            const data = snap.val() || {};
            setCourses(Object.values(data.courses || {}));
            setGroupsData(data.groups || {});
        });

        // Setup group-based sudden death listener
        const setupGroupSuddenDeathListener = (setter: Function, scoreSetter: Function) => (snap: any) => {
            const data = snap.val() || {};
            // Convert to group-based structure
            const groupData: { [groupName: string]: Partial<SuddenDeathData> } = {};
            const groupScores: { [groupName: string]: { [key: string]: { [key: string]: string } } } = {};

            if (typeof data === 'object' && !data.isActive) {
                // New structure: { groupName: { isActive, players, ... } }
                Object.entries(data).forEach(([groupName, groupSuddenDeath]: [string, any]) => {
                    if (groupSuddenDeath && typeof groupSuddenDeath === 'object') {
                        groupData[groupName] = groupSuddenDeath;
                        if (groupSuddenDeath.scores) {
                            const stringScores: any = {};
                            Object.entries(groupSuddenDeath.scores).forEach(([pId, hScores]: [string, any]) => {
                                stringScores[pId] = {};
                                Object.entries(hScores).forEach(([h, s]) => {
                                    stringScores[pId][h] = String(s);
                                });
                            });
                            groupScores[groupName] = stringScores;
                        }
                    }
                });
            } else if (data.isActive) {
                // Legacy structure: single sudden death for all groups
                // This will be migrated when saving
            }

            setter(groupData);
            scoreSetter(groupScores);
        };

        const unsubIndividualSuddenDeath = onValue(individualSuddenDeathRef, setupGroupSuddenDeathListener(setIndividualSuddenDeathData, setIndividualSuddenDeathScores));
        const unsubTeamSuddenDeath = onValue(teamSuddenDeathRef, setupGroupSuddenDeathListener(setTeamSuddenDeathData, setTeamSuddenDeathScores));
        // Backcount is now group-based: read as object { groupName: boolean }
        const unsubIndividualBackcount = onValue(individualBackcountRef, snap => {
            const data = snap.val();
            if (typeof data === 'boolean') {
                // Legacy: convert old boolean format to object format (apply to all groups)
                // This handles backward compatibility
                setIndividualBackcountApplied(data ? { '*': true } : {});
            } else {
                setIndividualBackcountApplied(data || {});
            }
        });
        const unsubTeamBackcount = onValue(teamBackcountRef, snap => {
            const data = snap.val();
            if (typeof data === 'boolean') {
                // Legacy: convert old boolean format to object format
                setTeamBackcountApplied(data ? { '*': true } : {});
            } else {
                setTeamBackcountApplied(data || {});
            }
        });

        // Setup group-based NTP listener
        const setupGroupNTPListener = (setter: Function, rankingSetter: Function) => (snap: any) => {
            const data = snap.val() || {};
            // Convert to group-based structure
            const groupData: { [groupName: string]: Partial<NTPData> } = {};
            const groupRankings: { [groupName: string]: { [key: string]: number } } = {};

            if (typeof data === 'object' && !data.isActive) {
                // New structure: { groupName: { isActive, players, rankings } }
                Object.entries(data).forEach(([groupName, groupNTP]: [string, any]) => {
                    if (groupNTP && typeof groupNTP === 'object') {
                        groupData[groupName] = groupNTP;
                        if (groupNTP.rankings) {
                            groupRankings[groupName] = groupNTP.rankings;
                        }
                    }
                });
            } else if (data.isActive) {
                // Legacy structure: single NTP for all groups
                // This will be migrated when saving
            }

            setter(groupData);
            rankingSetter(groupRankings);
        };

        const unsubIndividualNTP = onValue(individualNTPRef, setupGroupNTPListener(setIndividualNTPData, setIndividualNTPRankings));
        const unsubTeamNTP = onValue(teamNTPRef, setupGroupNTPListener(setTeamNTPData, setTeamNTPRankings));

        return () => {
            unsubPlayers();
            unsubScores();
            unsubTournament();
            unsubIndividualSuddenDeath();
            unsubTeamSuddenDeath();
            unsubIndividualBackcount();
            unsubTeamBackcount();
            unsubIndividualNTP();
            unsubTeamNTP();
        };
    }, []);

    // Calculate tied players
    useEffect(() => {
        const allCoursesList = Object.values(courses);
        if (Object.keys(players).length === 0 || allCoursesList.length === 0) return;

        const allProcessedPlayers: any[] = Object.entries(players).map(([playerId, player]: [string, any]) => {
            const playerGroupData = (groupsData as any)[player.group];
            const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter((id: string) => {
                const courseValue = playerGroupData.courses[id];
                if (typeof courseValue === 'object' && courseValue !== null) {
                    return (courseValue.order || 0) > 0;
                } else if (typeof courseValue === 'number') {
                    return courseValue > 0;
                } else if (typeof courseValue === 'boolean') {
                    return courseValue === true;
                }
                return false;
            }) : [];
            const coursesForPlayer = allCoursesList.filter((c: any) => assignedCourseIds.includes(c.id.toString()));
            const playerScoresData = (scores as any)[playerId] || {};
            let totalScore = 0;
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
                        courseTotal += scoreNum;
                        hasAnyScore = true;
                        if (scoreNum === 0) hasForfeited = true;
                    }
                }
                totalScore += courseTotal;
                courseScoresForTieBreak[courseId] = courseTotal;
            });
            return {
                id: playerId,
                jo: player.jo,
                name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                affiliation: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                group: player.group,
                type: player.type,
                totalScore,
                hasAnyScore, hasForfeited, total: totalScore, courseScores: courseScoresForTieBreak,
                detailedScores: detailedScoresForTieBreak, assignedCourses: coursesForPlayer
            };
        });

        const rankedData: { [key: string]: Player[] } = {};
        const groupedData = allProcessedPlayers.reduce((acc: any, player: any) => {
            const groupName = player.group || '미지정';
            if (!acc[groupName]) acc[groupName] = [];
            acc[groupName].push(player);
            return acc;
        }, {} as Record<string, any[]>);

        for (const groupName in groupedData) {
            const coursesForGroup = groupedData[groupName][0]?.assignedCourses || Object.values(courses);
            const playersToSort = groupedData[groupName].filter((p: any) => p.hasAnyScore && !p.hasForfeited);
            const otherPlayers = groupedData[groupName].filter((p: any) => !p.hasAnyScore || p.hasForfeited);
            if (playersToSort.length > 0) {
                const leaderScore = playersToSort.reduce((min: any, p: any) => Math.min(min, p.totalScore), Infinity);
                playersToSort.sort((a: any, b: any) => {
                    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
                    if (a.totalScore === leaderScore) return a.name.localeCompare(b.name);
                    return tieBreak(a, b, coursesForGroup);
                });
                let rank = 1;
                playersToSort[0].rank = rank;
                for (let i = 1; i < playersToSort.length; i++) {
                    const prev = playersToSort[i - 1], curr = playersToSort[i];
                    let isTied = false;
                    if (curr.totalScore === prev.totalScore) {
                        if (curr.totalScore === leaderScore) isTied = true;
                        else isTied = tieBreak(curr, prev, coursesForGroup) === 0;
                    }
                    if (isTied) curr.rank = prev.rank; else { rank = i + 1; curr.rank = rank; }
                }
            }
            rankedData[groupName] = [...playersToSort, ...otherPlayers.map((p: any) => ({ ...p, rank: null }))];
        }

        const individualTies: Player[] = [];
        const teamTies: Player[] = [];

        for (const groupName in rankedData) {
            const playersInGroup = rankedData[groupName];
            if (!playersInGroup || playersInGroup.length === 0) continue;

            // 1위 동점자 확인
            const firstPlacePlayers = playersInGroup.filter(p => p.rank === 1);

            if (firstPlacePlayers.length < 2) continue; // 1위 동점자가 2명 미만이면 스킵

            // Check if all first-place tied players have completed all assigned courses
            const groupData = (groupsData as any)[groupName];
            if (!groupData) continue; // 그룹 데이터가 없으면 스킵

            const assignedCourseIds = groupData?.courses
                ? Object.keys(groupData.courses).filter((id: string) => {
                    const courseValue = groupData.courses[id];
                    // 객체 타입 처리 (새로운 구조: { order: number, scoreboardActive: boolean })
                    if (typeof courseValue === 'object' && courseValue !== null) {
                        return (courseValue.order || 0) > 0;
                    } else if (typeof courseValue === 'number') {
                        return courseValue > 0;
                    } else if (typeof courseValue === 'boolean') {
                        return courseValue === true;
                    }
                    return false;
                })
                : [];

            // 배정된 코스가 없으면 스킵
            if (assignedCourseIds.length === 0) continue;

            // 1위 동점자들이 모두 모든 코스를 완료했는지 확인
            const allFirstPlaceCompleted = firstPlacePlayers.every((player: any) => {
                if (!player.hasAnyScore || player.hasForfeited) return false;
                // Check if player has completed all assigned courses
                return assignedCourseIds.every((courseId: string) => {
                    const courseScores = player.detailedScores[courseId] || {};
                    // Check if all 9 holes have scores
                    for (let i = 1; i <= 9; i++) {
                        const holeScore = courseScores[i.toString()];
                        if (holeScore === undefined || holeScore === null) {
                            return false;
                        }
                    }
                    return true;
                });
            });

            // Only include groups where all first-place tied players have completed all courses
            if (!allFirstPlaceCompleted) continue;

            if (firstPlacePlayers[0].type === 'individual') {
                individualTies.push(...firstPlacePlayers);
            } else if (firstPlacePlayers[0].type === 'team') {
                teamTies.push(...firstPlacePlayers);
            }
        }

        setTiedIndividualPlayers(individualTies);
        setTiedTeamPlayers(teamTies);

    }, [players, scores, courses, groupsData]);

    const handleStartSuddenDeath = (type: 'individual' | 'team', groupName?: string) => {
        const isIndividual = type === 'individual';
        const allSelectedPlayers = isIndividual ? selectedIndividualPlayers : selectedTeamPlayers;

        // Filter by group if groupName is provided
        let activePlayers: string[];
        let playersToSave: { [key: string]: boolean };

        if (groupName) {
            const tiedPlayers = isIndividual ? tiedIndividualPlayers : tiedTeamPlayers;
            const groupPlayerIds = new Set(tiedPlayers.filter(p => p.group === groupName).map(p => p.id));
            activePlayers = Object.keys(allSelectedPlayers).filter(id =>
                allSelectedPlayers[id] && groupPlayerIds.has(id)
            );
            // Only save players from this group
            playersToSave = {};
            activePlayers.forEach(id => {
                playersToSave[id] = true;
            });
        } else {
            activePlayers = Object.keys(allSelectedPlayers).filter(id => allSelectedPlayers[id]);
            playersToSave = allSelectedPlayers;
        }

        const courseId = isIndividual ? selectedIndividualCourseId : selectedTeamCourseId;
        const holes = isIndividual ? selectedIndividualHoles : selectedTeamHoles;

        if (activePlayers.length < 2) {
            toast({ title: "오류", description: "서든데스를 진행할 선수를 2명 이상 선택해주세요." });
            return;
        }
        if (!courseId) {
            toast({ title: "오류", description: "코스를 선택해주세요." });
            return;
        }
        if (holes.length === 0) {
            toast({ title: "오류", description: "하나 이상의 홀을 선택해주세요." });
            return;
        }

        if (!groupName) {
            toast({ title: "오류", description: "그룹명이 필요합니다." });
            return;
        }

        const suddenDeathSetup = {
            isActive: true,
            players: playersToSave,
            courseId: courseId,
            holes: holes.sort((a, b) => a - b),
            scores: {},
        };

        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }

        // Save group-specific sudden death
        const currentData = isIndividual ? individualSuddenDeathData : teamSuddenDeathData;
        const updatedData = { ...currentData, [groupName]: suddenDeathSetup };

        set(ref(db, `tournaments/current/suddenDeath/${type}`), updatedData)
            .then(() => toast({ title: "성공", description: `${groupName} 그룹 ${isIndividual ? '개인전' : '2인 1팀'} 서든데스-플레이오프가 시작되었습니다.` }))
            .catch(err => toast({ title: "오류", description: err.message }));
    };

    const handleResetSuddenDeath = (type: 'individual' | 'team', groupName?: string) => {
        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }

        if (!groupName) {
            toast({ title: "오류", description: "그룹명이 필요합니다." });
            return;
        }

        // Remove group-specific sudden death
        const currentData = type === 'individual' ? individualSuddenDeathData : teamSuddenDeathData;
        const updatedData = { ...currentData };
        delete updatedData[groupName];

        if (Object.keys(updatedData).length === 0) {
            remove(ref(db, `tournaments/current/suddenDeath/${type}`))
                .then(() => toast({ title: "초기화 완료", description: `${groupName} 그룹 서든데스 정보가 초기화되었습니다.` }))
                .catch(err => toast({ title: "오류", description: err.message }));
        } else {
            set(ref(db, `tournaments/current/suddenDeath/${type}`), updatedData)
                .then(() => toast({ title: "초기화 완료", description: `${groupName} 그룹 서든데스 정보가 초기화되었습니다.` }))
                .catch(err => toast({ title: "오류", description: err.message }));
        }
    };

    const handleApplyBackcount = (type: 'individual' | 'team', groupName: string) => {
        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }

        const backcountState = type === 'individual' ? individualBackcountApplied : teamBackcountApplied;
        const setBackcountState = type === 'individual' ? setIndividualBackcountApplied : setTeamBackcountApplied;

        const updated = { ...backcountState, [groupName]: true };
        setBackcountState(updated);

        // Firebase에 그룹별 백카운트 적용 상태 저장
        set(ref(db, `tournaments/current/backcountApplied/${type}`), updated)
            .then(() => {
                toast({ title: "백카운트 적용", description: `${groupName} 그룹의 1위 동점자가 백카운트로 결정되었습니다.` });
            })
            .catch(err => toast({ title: "오류", description: err.message }));
    };

    const handleResetBackcount = (type: 'individual' | 'team', groupName: string) => {
        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }

        const backcountState = type === 'individual' ? individualBackcountApplied : teamBackcountApplied;
        const setBackcountState = type === 'individual' ? setIndividualBackcountApplied : setTeamBackcountApplied;

        const updated = { ...backcountState };
        delete updated[groupName];
        setBackcountState(updated);

        // Firebase에서 그룹별 백카운트 적용 상태 제거
        if (Object.keys(updated).length === 0) {
            remove(ref(db, `tournaments/current/backcountApplied/${type}`))
                .then(() => {
                    toast({ title: "백카운트 초기화", description: `${groupName} 그룹의 1위 동점자가 다시 동점자 상태로 복원되었습니다.` });
                })
                .catch(err => toast({ title: "오류", description: err.message }));
        } else {
            set(ref(db, `tournaments/current/backcountApplied/${type}`), updated)
                .then(() => {
                    toast({ title: "백카운트 초기화", description: `${groupName} 그룹의 1위 동점자가 다시 동점자 상태로 복원되었습니다.` });
                })
                .catch(err => toast({ title: "오류", description: err.message }));
        }
    };

    const handleStartNTP = (type: 'individual' | 'team', groupName?: string) => {
        const isIndividual = type === 'individual';
        const allSelectedPlayers = isIndividual ? selectedIndividualNTPPlayers : selectedTeamNTPPlayers;

        // Filter by group if groupName is provided
        let activePlayers: string[];
        let playersToSave: { [key: string]: boolean };

        if (groupName) {
            const tiedPlayers = isIndividual ? tiedIndividualPlayers : tiedTeamPlayers;
            const groupPlayerIds = new Set(tiedPlayers.filter(p => p.group === groupName).map(p => p.id));
            activePlayers = Object.keys(allSelectedPlayers).filter(id =>
                allSelectedPlayers[id] && groupPlayerIds.has(id)
            );
            // Only save players from this group
            playersToSave = {};
            activePlayers.forEach(id => {
                playersToSave[id] = true;
            });
        } else {
            activePlayers = Object.keys(allSelectedPlayers).filter(id => allSelectedPlayers[id]);
            playersToSave = allSelectedPlayers;
        }

        if (activePlayers.length < 2) {
            toast({ title: "오류", description: "니어리스트 투 더 핀을 진행할 선수를 2명 이상 선택해주세요." });
            return;
        }

        // 초기 순위 설정 (선택된 순서대로 1, 2, 3...)
        const initialRankings: { [key: string]: number } = {};
        activePlayers.forEach((playerId, index) => {
            initialRankings[playerId] = index + 1;
        });

        if (!groupName) {
            toast({ title: "오류", description: "그룹명이 필요합니다." });
            return;
        }

        const ntpSetup: NTPData = {
            isActive: true,
            players: playersToSave,
            rankings: initialRankings,
        };

        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }

        // Save group-specific NTP
        const currentData = isIndividual ? individualNTPData : teamNTPData;
        const updatedData = { ...currentData, [groupName]: ntpSetup };

        set(ref(db, `tournaments/current/nearestToPin/${type}`), updatedData)
            .then(() => {
                toast({ title: "성공", description: `${groupName} 그룹 ${isIndividual ? '개인전' : '2인 1팀'} 니어리스트 투 더 핀이 시작되었습니다.` });
                const currentRankings = isIndividual ? individualNTPRankings : teamNTPRankings;
                const updatedRankings = { ...currentRankings, [groupName]: initialRankings };
                if (isIndividual) {
                    setIndividualNTPRankings(updatedRankings);
                } else {
                    setTeamNTPRankings(updatedRankings);
                }
            })
            .catch(err => toast({ title: "오류", description: err.message }));
    };

    const handleResetNTP = (type: 'individual' | 'team', groupName?: string) => {
        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }

        if (!groupName) {
            toast({ title: "오류", description: "그룹명이 필요합니다." });
            return;
        }

        // Remove group-specific NTP
        const currentData = type === 'individual' ? individualNTPData : teamNTPData;
        const updatedData = { ...currentData };
        delete updatedData[groupName];

        const currentRankings = type === 'individual' ? individualNTPRankings : teamNTPRankings;
        const updatedRankings = { ...currentRankings };
        delete updatedRankings[groupName];

        if (Object.keys(updatedData).length === 0) {
            remove(ref(db, `tournaments/current/nearestToPin/${type}`))
                .then(() => {
                    toast({ title: "초기화 완료", description: `${groupName} 그룹 니어리스트 투 더 핀 정보가 초기화되었습니다.` });
                    if (type === 'individual') {
                        setIndividualNTPRankings({});
                    } else {
                        setTeamNTPRankings({});
                    }
                })
                .catch(err => toast({ title: "오류", description: err.message }));
        } else {
            set(ref(db, `tournaments/current/nearestToPin/${type}`), updatedData)
                .then(() => {
                    toast({ title: "초기화 완료", description: `${groupName} 그룹 니어리스트 투 더 핀 정보가 초기화되었습니다.` });
                    if (type === 'individual') {
                        setIndividualNTPRankings(updatedRankings);
                    } else {
                        setTeamNTPRankings(updatedRankings);
                    }
                })
                .catch(err => toast({ title: "오류", description: err.message }));
        }
    };

    const handleNTPRankChange = (type: 'individual' | 'team', playerId: string, newRank: number, groupName: string) => {
        const isIndividual = type === 'individual';
        const allRankings = isIndividual ? individualNTPRankings : teamNTPRankings;
        const setRankings = isIndividual ? setIndividualNTPRankings : setTeamNTPRankings;
        const allNTPData = isIndividual ? individualNTPData : teamNTPData;

        const currentRankings = allRankings[groupName] || {};
        const ntpData = allNTPData[groupName];

        // 같은 순위가 있는지 확인
        const existingPlayerWithRank = Object.entries(currentRankings).find(([pid, rank]) => pid !== playerId && rank === newRank);

        let updatedRankings: { [key: string]: number };
        if (existingPlayerWithRank) {
            // 기존 순위를 교환
            const [otherPlayerId, otherRank] = existingPlayerWithRank;
            const currentPlayerRank = currentRankings[playerId] || 0;

            updatedRankings = { ...currentRankings };
            updatedRankings[playerId] = newRank;
            updatedRankings[otherPlayerId] = currentPlayerRank;
        } else {
            // 단순 순위 변경
            updatedRankings = { ...currentRankings, [playerId]: newRank };
        }

        const updatedAllRankings = { ...allRankings, [groupName]: updatedRankings };
        setRankings(updatedAllRankings);

        // Firebase 업데이트
        if (db && ntpData?.isActive) {
            const updatedNTPData = { ...allNTPData, [groupName]: { ...ntpData, rankings: updatedRankings } };
            set(ref(db, `tournaments/current/nearestToPin/${type}`), updatedNTPData)
                .catch(err => toast({ title: "오류", description: err.message }));
        }
    };

    const handleMoveNTPRank = (type: 'individual' | 'team', playerId: string, direction: 'up' | 'down', groupName: string) => {
        const isIndividual = type === 'individual';
        const allRankings = isIndividual ? individualNTPRankings : teamNTPRankings;
        const currentRankings = allRankings[groupName] || {};
        const currentRank = currentRankings[playerId] || 0;

        if (direction === 'up' && currentRank <= 1) return;
        if (direction === 'down' && currentRank >= Object.keys(currentRankings).length) return;

        const newRank = direction === 'up' ? currentRank - 1 : currentRank + 1;
        handleNTPRankChange(type, playerId, newRank, groupName);
    };

    const handleSuddenDeathScoreChange = (type: 'individual' | 'team', playerId: string, hole: number, value: string, groupName: string) => {
        const isIndividual = type === 'individual';
        const allScores = isIndividual ? individualSuddenDeathScores : teamSuddenDeathScores;
        const setScores = isIndividual ? setIndividualSuddenDeathScores : setTeamSuddenDeathScores;

        const groupScores = allScores[groupName] || {};
        setScores(prevScores => {
            const newScores = { ...prevScores };
            if (!newScores[groupName]) newScores[groupName] = {};
            if (!newScores[groupName][playerId]) newScores[groupName][playerId] = {};
            newScores[groupName][playerId][hole] = value;
            return newScores;
        });

        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }

        const scoreRef = ref(db, `tournaments/current/suddenDeath/${type}/${groupName}/scores/${playerId}/${hole}`);
        const numericValue = parseInt(value, 10);
        if (!isNaN(numericValue)) {
            set(scoreRef, numericValue);
        } else if (value === '') {
            remove(scoreRef);
        }
    };

    const holeOptions = Array.from({ length: 9 }, (_, i) => ({ value: (i + 1).toString(), label: `${i + 1}홀` }));

    // Calculate backcount rankings if backcount is applied for a specific group
    const getBackcountRankedPlayers = (type: 'individual' | 'team', groupName: string) => {
        const tiedPlayers = type === 'individual' ? tiedIndividualPlayers : tiedTeamPlayers;
        const backcountApplied = type === 'individual' ? individualBackcountApplied : teamBackcountApplied;
        const groupBackcountApplied = backcountApplied[groupName] || false;
        const groupPlayers = tiedPlayers.filter(p => p.group === groupName);

        if (!groupBackcountApplied || groupPlayers.length < 2) return groupPlayers;

        const allCoursesList = Object.values(courses);
        const backcountRankedPlayers = [...groupPlayers];

        if (backcountRankedPlayers.length < 2) return backcountRankedPlayers;

        const coursesForGroup = (backcountRankedPlayers[0] as any)?.assignedCourses || allCoursesList;
        backcountRankedPlayers.sort((a, b) => backcountBreak(a, b, coursesForGroup));

        // Assign ranks
        let rank = 1;
        backcountRankedPlayers[0].rank = rank;
        for (let i = 1; i < backcountRankedPlayers.length; i++) {
            const prev = backcountRankedPlayers[i - 1];
            const curr = backcountRankedPlayers[i];
            if (backcountBreak(curr, prev, coursesForGroup) !== 0) {
                rank = i + 1;
            }
            curr.rank = rank;
        }

        return backcountRankedPlayers;
    };

    // Render playoff interface for a specific group
    const renderGroupPlayoffInterface = (type: 'individual' | 'team', groupName: string) => {
        const isIndividual = type === 'individual';
        const tiedPlayers = isIndividual ? tiedIndividualPlayers : tiedTeamPlayers;
        const groupTiedPlayers = tiedPlayers.filter(p => p.group === groupName);

        if (groupTiedPlayers.length < 2) return null;

        const backcountApplied = isIndividual ? individualBackcountApplied : teamBackcountApplied;
        const groupBackcountApplied = backcountApplied[groupName] || false;
        const displayPlayers = groupBackcountApplied ? getBackcountRankedPlayers(type, groupName) : groupTiedPlayers;

        // Get group-specific sudden death and NTP data
        const allSuddenDeathData = isIndividual ? individualSuddenDeathData : teamSuddenDeathData;
        const allNTPData = isIndividual ? individualNTPData : teamNTPData;
        const allNTPRankings = isIndividual ? individualNTPRankings : teamNTPRankings;
        const allSuddenDeathScores = isIndividual ? individualSuddenDeathScores : teamSuddenDeathScores;

        const suddenDeathData = allSuddenDeathData[groupName] || {};
        const ntpData = allNTPData[groupName] || {};
        const ntpRankings = allNTPRankings[groupName] || {};
        const suddenDeathScores = allSuddenDeathScores[groupName] || {};

        const selectedNTPPlayers = isIndividual ? selectedIndividualNTPPlayers : selectedTeamNTPPlayers;
        const setSelectedNTPPlayers = isIndividual ? setSelectedIndividualNTPPlayers : setSelectedTeamNTPPlayers;
        const selectedSuddenDeathPlayers = isIndividual ? selectedIndividualPlayers : selectedTeamPlayers;
        const setSelectedSuddenDeathPlayers = isIndividual ? setSelectedIndividualPlayers : setSelectedTeamPlayers;
        const selectedCourseId = isIndividual ? selectedIndividualCourseId : selectedTeamCourseId;
        const setSelectedCourseId = isIndividual ? setSelectedIndividualCourseId : setSelectedTeamCourseId;
        const selectedHoles = isIndividual ? selectedIndividualHoles : selectedTeamHoles;
        const setSelectedHoles = isIndividual ? setSelectedIndividualHoles : setSelectedTeamHoles;

        // Process sudden death players for this group
        const groupSuddenDeathPlayers = suddenDeathData?.isActive && suddenDeathData?.players
            ? Object.keys(suddenDeathData.players)
                .filter(playerId => suddenDeathData.players![playerId] && groupTiedPlayers.some(p => p.id === playerId))
                .map(playerId => {
                    const player = groupTiedPlayers.find(p => p.id === playerId);
                    if (!player) return null;

                    const scoresPerHole: { [hole: string]: number | null } = {};
                    let totalScore = 0;
                    let holesPlayed = 0;

                    suddenDeathData.holes?.forEach((hole: number) => {
                        const score = suddenDeathData.scores?.[playerId]?.[hole];
                        if (score !== undefined && score !== null) {
                            scoresPerHole[hole] = score;
                            totalScore += score;
                            holesPlayed++;
                        } else {
                            scoresPerHole[hole] = null;
                        }
                    });

                    return { id: playerId, name: player.name, scoresPerHole, totalScore, holesPlayed };
                })
                .filter(Boolean)
                .sort((a: any, b: any) => {
                    if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed;
                    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
                    return a.name.localeCompare(b.name);
                })
                .map((player: any, index: number, arr: any[]) => {
                    let rank = 1;
                    if (index > 0 && (player.totalScore > arr[index - 1].totalScore || player.holesPlayed < arr[index - 1].holesPlayed)) {
                        rank = index + 1;
                    } else if (index > 0) {
                        rank = arr[index - 1].rank;
                    }
                    return { ...player, rank };
                })
            : [];

        // Filter NTP players for this group
        const groupNTPPlayers = Object.keys(ntpRankings)
            .filter(playerId => groupTiedPlayers.some(p => p.id === playerId))
            .map(playerId => {
                const player = groupTiedPlayers.find(p => p.id === playerId);
                if (!player) return null;
                return {
                    ...player,
                    ntpRank: ntpRankings[playerId]
                };
            })
            .filter(Boolean)
            .sort((a: any, b: any) => a.ntpRank - b.ntpRank);

        // 이 그룹에서 선택된 서든데스 참가자 수 (코스/홀 선택 활성화 여부에 사용)
        const selectedCountForGroup = Object.keys(selectedSuddenDeathPlayers)
            .filter(id => selectedSuddenDeathPlayers[id] && groupTiedPlayers.some(p => p.id === id))
            .length;

        return (
            <Card key={groupName} className="border-2">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold">{groupName} 그룹 플레이오프 관리</CardTitle>
                    <CardDescription>
                        {groupTiedPlayers.length}명의 1위 동점자가 있습니다. 백카운트, 서든데스, 또는 니어리스트 투 더 핀으로 결정하세요.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* 백카운트 선정 */}
                    <div className="p-4 border rounded-lg bg-blue-50/50">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <Label className="font-semibold text-base">백카운트 선정</Label>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {groupBackcountApplied
                                        ? "이 그룹의 1위 동점자가 백카운트로 결정되었습니다."
                                        : "1위 동점자를 백카운트로 결정하려면 아래 버튼을 클릭하세요."}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => handleApplyBackcount(type, groupName)}
                                    disabled={groupTiedPlayers.length < 2 || groupBackcountApplied}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                    size="sm"
                                >
                                    백카운트로 선정
                                </Button>
                                <Button
                                    onClick={() => handleResetBackcount(type, groupName)}
                                    disabled={!groupBackcountApplied}
                                    variant="outline"
                                    className="border-blue-600 text-blue-600 hover:bg-blue-50"
                                    size="sm"
                                >
                                    백카운트 초기화
                                </Button>
                            </div>
                        </div>
                        {groupBackcountApplied && (
                            <div className="mt-3 space-y-2">
                                {displayPlayers.map((player, idx) => (
                                    <div key={player.id} className="flex items-center gap-2 text-sm">
                                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">
                                            {player.rank}위
                                        </span>
                                        <span className="font-medium">{player.name}</span>
                                        <span className="text-muted-foreground">({player.affiliation})</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 서든데스 설정 */}
                    <div className="p-4 border rounded-lg">
                        <Label className="font-semibold text-base mb-4 block">서든데스 설정</Label>
                        {!groupBackcountApplied ? (
                            <div className="space-y-4">
                                {!suddenDeathData?.isActive ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label className="text-sm">참가 선수 선택</Label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {groupTiedPlayers.map(player => (
                                                    <div key={player.id} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`${type}-sd-${groupName}-${player.id}`}
                                                            checked={selectedSuddenDeathPlayers[player.id] || false}
                                                            onCheckedChange={(checked) => setSelectedSuddenDeathPlayers(prev => ({ ...prev, [player.id]: !!checked }))}
                                                        />
                                                        <Label
                                                            htmlFor={`${type}-sd-${groupName}-${player.id}`}
                                                            className="text-sm font-medium cursor-pointer"
                                                        >
                                                            {player.name} <span className="text-muted-foreground">({player.affiliation})</span>
                                                        </Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-sm">코스 선택</Label>
                                                <Select
                                                    value={selectedCourseId}
                                                    onValueChange={setSelectedCourseId}
                                                    disabled={selectedCountForGroup === 0}
                                                >
                                                    <SelectTrigger><SelectValue placeholder="코스 선택" /></SelectTrigger>
                                                    <SelectContent>
                                                        {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-sm">홀 선택</Label>
                                                <MultiSelect
                                                    options={holeOptions}
                                                    selected={selectedHoles.map(String)}
                                                    onChange={(values) => setSelectedHoles(values.map(Number))}
                                                    placeholder="홀 선택..."
                                                    disabled={selectedCountForGroup === 0}
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => handleStartSuddenDeath(type, groupName)}
                                            disabled={
                                                Object.keys(selectedSuddenDeathPlayers).filter(id => selectedSuddenDeathPlayers[id] && groupTiedPlayers.some(p => p.id === id)).length < 2 ||
                                                !selectedCourseId ||
                                                selectedHoles.length === 0
                                            }
                                            size="sm"
                                        >
                                            <Play className="mr-2 h-4 w-4" /> 서든데스 시작
                                        </Button>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm">
                                                    <RotateCcw className="mr-2 h-4 w-4" /> 서든데스 초기화
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>정말 초기화하시겠습니까?</AlertDialogTitle>
                                                    <AlertDialogDescription>진행 중인 서든데스 정보와 점수가 모두 삭제됩니다.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>취소</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleResetSuddenDeath(type, groupName)}>초기화</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                        {groupSuddenDeathPlayers.length > 0 && (
                                            <div className="overflow-x-auto border rounded-lg">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="w-48">선수</TableHead>
                                                            {suddenDeathData.holes?.sort((a, b) => a - b).map(hole => <TableHead key={hole} className="text-center">{hole}홀</TableHead>)}
                                                            <TableHead className="text-center font-bold text-primary">합계</TableHead>
                                                            <TableHead className="text-center font-bold text-primary">순위</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {groupSuddenDeathPlayers.map((player: any) => (
                                                            <TableRow key={player.id}>
                                                                <TableCell className="font-semibold">{player.name}</TableCell>
                                                                {suddenDeathData.holes?.map(hole => (
                                                                    <TableCell key={hole} className="text-center">
                                                                        <Input
                                                                            type="number"
                                                                            className="w-16 h-10 mx-auto text-center text-sm"
                                                                            value={suddenDeathScores[player.id]?.[hole] ?? ''}
                                                                            onChange={(e) => handleSuddenDeathScoreChange(type, player.id, hole, e.target.value, groupName)}
                                                                        />
                                                                    </TableCell>
                                                                ))}
                                                                <TableCell className="text-center font-bold">{player.totalScore}</TableCell>
                                                                <TableCell className="text-center font-bold text-primary">{player.rank}위</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">백카운트로 결정된 그룹은 서든데스를 진행할 수 없습니다.</p>
                        )}
                    </div>

                    {/* NTP 설정 */}
                    <div className="p-4 border rounded-lg">
                        <Label className="font-semibold text-base mb-4 block">니어리스트 투 더 핀 (NTP) 설정</Label>
                        {!groupBackcountApplied ? (
                            <div className="space-y-4">
                                {!ntpData?.isActive ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label className="text-sm">참가 선수 선택</Label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {groupTiedPlayers.map(player => (
                                                    <div key={player.id} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`${type}-ntp-${groupName}-${player.id}`}
                                                            checked={selectedNTPPlayers[player.id] || false}
                                                            onCheckedChange={(checked) => setSelectedNTPPlayers(prev => ({ ...prev, [player.id]: !!checked }))}
                                                        />
                                                        <Label
                                                            htmlFor={`${type}-ntp-${groupName}-${player.id}`}
                                                            className="text-sm font-medium cursor-pointer"
                                                        >
                                                            {player.name} <span className="text-muted-foreground">({player.affiliation})</span>
                                                        </Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => handleStartNTP(type, groupName)}
                                            disabled={Object.keys(selectedNTPPlayers).filter(id => selectedNTPPlayers[id] && groupTiedPlayers.some(p => p.id === id)).length < 2}
                                            size="sm"
                                        >
                                            <Target className="mr-2 h-4 w-4" /> 니어리스트 투 더 핀 시작
                                        </Button>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm">
                                                    <RotateCcw className="mr-2 h-4 w-4" /> 니어리스트 투 더 핀 초기화
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>정말 초기화하시겠습니까?</AlertDialogTitle>
                                                    <AlertDialogDescription>설정된 니어리스트 투 더 핀 순위 정보가 모두 삭제됩니다.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>취소</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleResetNTP(type, groupName)}>초기화</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                        {groupNTPPlayers.length > 0 && (
                                            <div className="space-y-2 border rounded-lg p-4">
                                                {groupNTPPlayers.map((player: any) => (
                                                    <div key={player.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-md border">
                                                        <div className="flex items-center gap-3 flex-1">
                                                            <span className="font-bold text-lg text-primary w-12 text-center">
                                                                {player.ntpRank}위
                                                            </span>
                                                            <span className="font-medium text-sm">{player.name}</span>
                                                            <span className="text-muted-foreground text-xs">({player.affiliation})</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleMoveNTPRank(type, player.id, 'up', groupName)}
                                                                disabled={player.ntpRank <= 1}
                                                            >
                                                                <ArrowUp className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleMoveNTPRank(type, player.id, 'down', groupName)}
                                                                disabled={player.ntpRank >= groupNTPPlayers.length}
                                                            >
                                                                <ArrowDown className="h-4 w-4" />
                                                            </Button>
                                                            <Input
                                                                type="number"
                                                                min={1}
                                                                max={groupNTPPlayers.length}
                                                                value={player.ntpRank}
                                                                onChange={(e) => {
                                                                    const newRank = parseInt(e.target.value, 10);
                                                                    if (!isNaN(newRank) && newRank >= 1 && newRank <= groupNTPPlayers.length) {
                                                                        handleNTPRankChange(type, player.id, newRank, groupName);
                                                                    }
                                                                }}
                                                                className="w-20 h-9 text-center"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">백카운트로 결정된 그룹은 니어리스트 투 더 핀을 진행할 수 없습니다.</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline flex items-center gap-2"><Flame className="text-destructive" />플레이오프 관리</CardTitle>
                    <CardDescription>1위 동점자가 발생한 그룹별로 백카운트, 서든데스, 니어리스트 투 더 핀을 관리할 수 있습니다.</CardDescription>
                </CardHeader>
            </Card>

            <Tabs defaultValue="individual" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="individual" className="py-2.5 text-base font-semibold">
                        <User className="mr-2 h-5 w-5" /> 개인전
                    </TabsTrigger>
                    <TabsTrigger value="team" className="py-2.5 text-base font-semibold">
                        <Users className="mr-2 h-5 w-5" /> 2인 1팀
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="individual" className="mt-6 space-y-6">
                    {(() => {
                        const groupsWithTies = tiedIndividualPlayers.reduce((acc, player) => {
                            const groupName = player.group || '미지정';
                            if (!acc[groupName]) acc[groupName] = [];
                            acc[groupName].push(player);
                            return acc;
                        }, {} as Record<string, Player[]>);

                        return Object.keys(groupsWithTies).length > 0 ? (
                            Object.entries(groupsWithTies).map(([groupName]) => renderGroupPlayoffInterface('individual', groupName))
                        ) : (
                            <Card>
                                <CardContent className="py-10 text-center text-muted-foreground">
                                    <p>현재 1위 동점자가 없습니다.</p>
                                    <p className="text-sm mt-2">대회가 진행되어 1위 동점자가 발생하면 여기에 표시됩니다.</p>
                                </CardContent>
                            </Card>
                        );
                    })()}
                </TabsContent>
                <TabsContent value="team" className="mt-6 space-y-6">
                    {(() => {
                        const groupsWithTies = tiedTeamPlayers.reduce((acc, player) => {
                            const groupName = player.group || '미지정';
                            if (!acc[groupName]) acc[groupName] = [];
                            acc[groupName].push(player);
                            return acc;
                        }, {} as Record<string, Player[]>);

                        return Object.keys(groupsWithTies).length > 0 ? (
                            Object.entries(groupsWithTies).map(([groupName]) => renderGroupPlayoffInterface('team', groupName))
                        ) : (
                            <Card>
                                <CardContent className="py-10 text-center text-muted-foreground">
                                    <p>현재 1위 동점자가 없습니다.</p>
                                    <p className="text-sm mt-2">대회가 진행되어 1위 동점자가 발생하면 여기에 표시됩니다.</p>
                                </CardContent>
                            </Card>
                        );
                    })()}
                </TabsContent>
            </Tabs>
        </div>
    );
}
