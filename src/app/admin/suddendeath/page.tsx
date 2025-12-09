
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

    // Sudden death states (separated for individual and team)
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<Partial<SuddenDeathData>>({});
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<Partial<SuddenDeathData>>({});

    // Processed data
    const [tiedIndividualPlayers, setTiedIndividualPlayers] = useState<Player[]>([]);
    const [tiedTeamPlayers, setTiedTeamPlayers] = useState<Player[]>([]);

    // UI states for individual tab
    const [selectedIndividualPlayers, setSelectedIndividualPlayers] = useState<{ [key: string]: boolean }>({});
    const [selectedIndividualCourseId, setSelectedIndividualCourseId] = useState<string>('');
    const [selectedIndividualHoles, setSelectedIndividualHoles] = useState<number[]>([]);
    const [individualSuddenDeathScores, setIndividualSuddenDeathScores] = useState<{ [key: string]: { [key: string]: string } }>({});

    // UI states for team tab
    const [selectedTeamPlayers, setSelectedTeamPlayers] = useState<{ [key: string]: boolean }>({});
    const [selectedTeamCourseId, setSelectedTeamCourseId] = useState<string>('');
    const [selectedTeamHoles, setSelectedTeamHoles] = useState<number[]>([]);
    const [teamSuddenDeathScores, setTeamSuddenDeathScores] = useState<{ [key: string]: { [key: string]: string } }>({});

    // Backcount states (separated for individual and team)
    const [individualBackcountApplied, setIndividualBackcountApplied] = useState<boolean>(false);
    const [teamBackcountApplied, setTeamBackcountApplied] = useState<boolean>(false);

    // NTP states (separated for individual and team)
    const [individualNTPData, setIndividualNTPData] = useState<Partial<NTPData>>({});
    const [teamNTPData, setTeamNTPData] = useState<Partial<NTPData>>({});
    
    // NTP UI states
    const [selectedIndividualNTPPlayers, setSelectedIndividualNTPPlayers] = useState<{ [key: string]: boolean }>({});
    const [selectedTeamNTPPlayers, setSelectedTeamNTPPlayers] = useState<{ [key: string]: boolean }>({});
    const [individualNTPRankings, setIndividualNTPRankings] = useState<{ [key: string]: number }>({});
    const [teamNTPRankings, setTeamNTPRankings] = useState<{ [key: string]: number }>({});

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

        const setupSuddenDeathListener = (setter: Function, scoreSetter: Function) => (snap: any) => {
            const data = snap.val();
            setter(data || { isActive: false });
            if (data?.scores) {
                const stringScores: any = {};
                Object.entries(data.scores).forEach(([pId, hScores]: [string, any]) => {
                    stringScores[pId] = {};
                    Object.entries(hScores).forEach(([h, s]) => {
                        stringScores[pId][h] = String(s);
                    });
                });
                scoreSetter(stringScores);
            } else {
                scoreSetter({});
            }
        };

        const unsubIndividualSuddenDeath = onValue(individualSuddenDeathRef, setupSuddenDeathListener(setIndividualSuddenDeathData, setIndividualSuddenDeathScores));
        const unsubTeamSuddenDeath = onValue(teamSuddenDeathRef, setupSuddenDeathListener(setTeamSuddenDeathData, setTeamSuddenDeathScores));
        const unsubIndividualBackcount = onValue(individualBackcountRef, snap => setIndividualBackcountApplied(snap.val() || false));
        const unsubTeamBackcount = onValue(teamBackcountRef, snap => setTeamBackcountApplied(snap.val() || false));
        
        const setupNTPListener = (setter: Function, rankingSetter: Function) => (snap: any) => {
            const data = snap.val();
            setter(data || { isActive: false });
            if (data?.rankings) {
                rankingSetter(data.rankings);
            } else {
                rankingSetter({});
            }
        };
        
        const unsubIndividualNTP = onValue(individualNTPRef, setupNTPListener(setIndividualNTPData, setIndividualNTPRankings));
        const unsubTeamNTP = onValue(teamNTPRef, setupNTPListener(setTeamNTPData, setTeamNTPRankings));

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
            const assignedCourseIds = playerGroupData?.courses ? Object.keys(playerGroupData.courses).filter(id => playerGroupData.courses[id]) : [];
            const coursesForPlayer = allCoursesList.filter((c:any) => assignedCourseIds.includes(c.id.toString()));
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
                    const prev = playersToSort[i-1], curr = playersToSort[i];
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

            const firstPlacePlayers = playersInGroup.filter(p => p.rank === 1);
            
            if (firstPlacePlayers.length > 1) {
                if (firstPlacePlayers[0].type === 'individual') {
                    individualTies.push(...firstPlacePlayers);
                } else if (firstPlacePlayers[0].type === 'team') {
                    teamTies.push(...firstPlacePlayers);
                }
            }
        }
        
        setTiedIndividualPlayers(individualTies);
        setTiedTeamPlayers(teamTies);

    }, [players, scores, courses, groupsData]);

    const handleStartSuddenDeath = (type: 'individual' | 'team') => {
        const isIndividual = type === 'individual';
        const activePlayers = Object.keys(isIndividual ? selectedIndividualPlayers : selectedTeamPlayers).filter(id => (isIndividual ? selectedIndividualPlayers : selectedTeamPlayers)[id]);
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

        const suddenDeathSetup = {
            isActive: true,
            players: isIndividual ? selectedIndividualPlayers : selectedTeamPlayers,
            courseId: courseId,
            holes: holes.sort((a,b) => a - b),
            scores: {},
        };

        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }
        
        set(ref(db, `tournaments/current/suddenDeath/${type}`), suddenDeathSetup)
            .then(() => toast({ title: "성공", description: `${isIndividual ? '개인전' : '2인 1팀'} 서든데스-플레이오프가 시작되었습니다.` }))
            .catch(err => toast({ title: "오류", description: err.message }));
    };
    
    const handleResetSuddenDeath = (type: 'individual' | 'team') => {
        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }
        
        remove(ref(db, `tournaments/current/suddenDeath/${type}`))
            .then(() => toast({ title: "초기화 완료", description: "서든데스 정보가 초기화되었습니다." }))
            .catch(err => toast({ title: "오류", description: err.message }));
    };

    const handleApplyBackcount = (type: 'individual' | 'team') => {
        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }
        
        if (type === 'individual') {
            setIndividualBackcountApplied(true);
            // Firebase에 백카운트 적용 상태 저장
            set(ref(db, `tournaments/current/backcountApplied/individual`), true);
            toast({ title: "백카운트 적용", description: "개인전 1위 동점자가 백카운트로 결정되었습니다." });
        } else {
            setTeamBackcountApplied(true);
            // Firebase에 백카운트 적용 상태 저장
            set(ref(db, `tournaments/current/backcountApplied/team`), true);
            toast({ title: "백카운트 적용", description: "2인 1팀 1위 동점자가 백카운트로 결정되었습니다." });
        }
    };

    const handleResetBackcount = (type: 'individual' | 'team') => {
        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }
        
        if (type === 'individual') {
            setIndividualBackcountApplied(false);
            // Firebase에서 백카운트 적용 상태 제거
            remove(ref(db, `tournaments/current/backcountApplied/individual`));
            toast({ title: "백카운트 초기화", description: "개인전 1위 동점자가 다시 동점자 상태로 복원되었습니다." });
        } else {
            setTeamBackcountApplied(false);
            // Firebase에서 백카운트 적용 상태 제거
            remove(ref(db, `tournaments/current/backcountApplied/team`));
            toast({ title: "백카운트 초기화", description: "2인 1팀 1위 동점자가 다시 동점자 상태로 복원되었습니다." });
        }
    };

    const handleStartNTP = (type: 'individual' | 'team') => {
        const isIndividual = type === 'individual';
        const activePlayers = Object.keys(isIndividual ? selectedIndividualNTPPlayers : selectedTeamNTPPlayers).filter(id => (isIndividual ? selectedIndividualNTPPlayers : selectedTeamNTPPlayers)[id]);

        if (activePlayers.length < 2) {
            toast({ title: "오류", description: "니어리스트 투 더 핀을 진행할 선수를 2명 이상 선택해주세요." });
            return;
        }

        // 초기 순위 설정 (선택된 순서대로 1, 2, 3...)
        const initialRankings: { [key: string]: number } = {};
        activePlayers.forEach((playerId, index) => {
            initialRankings[playerId] = index + 1;
        });

        const ntpSetup: NTPData = {
            isActive: true,
            players: isIndividual ? selectedIndividualNTPPlayers : selectedTeamNTPPlayers,
            rankings: initialRankings,
        };

        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }
        
        set(ref(db, `tournaments/current/nearestToPin/${type}`), ntpSetup)
            .then(() => {
                toast({ title: "성공", description: `${isIndividual ? '개인전' : '2인 1팀'} 니어리스트 투 더 핀이 시작되었습니다.` });
                if (isIndividual) {
                    setIndividualNTPRankings(initialRankings);
                } else {
                    setTeamNTPRankings(initialRankings);
                }
            })
            .catch(err => toast({ title: "오류", description: err.message }));
    };

    const handleResetNTP = (type: 'individual' | 'team') => {
        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }
        
        remove(ref(db, `tournaments/current/nearestToPin/${type}`))
            .then(() => {
                toast({ title: "초기화 완료", description: "니어리스트 투 더 핀 정보가 초기화되었습니다." });
                if (type === 'individual') {
                    setIndividualNTPRankings({});
                    setSelectedIndividualNTPPlayers({});
                } else {
                    setTeamNTPRankings({});
                    setSelectedTeamNTPPlayers({});
                }
            })
            .catch(err => toast({ title: "오류", description: err.message }));
    };

    const handleNTPRankChange = (type: 'individual' | 'team', playerId: string, newRank: number) => {
        const isIndividual = type === 'individual';
        const currentRankings = isIndividual ? individualNTPRankings : teamNTPRankings;
        const setRankings = isIndividual ? setIndividualNTPRankings : setTeamNTPRankings;
        const ntpData = isIndividual ? individualNTPData : teamNTPData;

        // 같은 순위가 있는지 확인
        const existingPlayerWithRank = Object.entries(currentRankings).find(([pid, rank]) => pid !== playerId && rank === newRank);
        
        if (existingPlayerWithRank) {
            // 기존 순위를 교환
            const [otherPlayerId, otherRank] = existingPlayerWithRank;
            const currentPlayerRank = currentRankings[playerId] || 0;
            
            const updatedRankings = { ...currentRankings };
            updatedRankings[playerId] = newRank;
            updatedRankings[otherPlayerId] = currentPlayerRank;
            
            setRankings(updatedRankings);
            
            // Firebase 업데이트
            if (db && ntpData?.isActive) {
                set(ref(db, `tournaments/current/nearestToPin/${type}/rankings`), updatedRankings)
                    .catch(err => toast({ title: "오류", description: err.message }));
            }
        } else {
            // 단순 순위 변경
            const updatedRankings = { ...currentRankings, [playerId]: newRank };
            setRankings(updatedRankings);
            
            // Firebase 업데이트
            if (db && ntpData?.isActive) {
                set(ref(db, `tournaments/current/nearestToPin/${type}/rankings`), updatedRankings)
                    .catch(err => toast({ title: "오류", description: err.message }));
            }
        }
    };

    const handleMoveNTPRank = (type: 'individual' | 'team', playerId: string, direction: 'up' | 'down') => {
        const isIndividual = type === 'individual';
        const currentRankings = isIndividual ? individualNTPRankings : teamNTPRankings;
        const currentRank = currentRankings[playerId] || 0;
        
        if (direction === 'up' && currentRank <= 1) return;
        if (direction === 'down' && currentRank >= Object.keys(currentRankings).length) return;
        
        const newRank = direction === 'up' ? currentRank - 1 : currentRank + 1;
        handleNTPRankChange(type, playerId, newRank);
    };

    const handleSuddenDeathScoreChange = (type: 'individual' | 'team', playerId: string, hole: number, value: string) => {
        const isIndividual = type === 'individual';
        const setScores = isIndividual ? setIndividualSuddenDeathScores : setTeamSuddenDeathScores;
        
        setScores(prevScores => {
            const newScores = { ...prevScores };
            if (!newScores[playerId]) newScores[playerId] = {};
            newScores[playerId][hole] = value;
            return newScores;
        });

        if (!db) {
            toast({ title: "오류", description: "데이터베이스 연결이 없습니다." });
            return;
        }
        
        const scoreRef = ref(db, `tournaments/current/suddenDeath/${type}/scores/${playerId}/${hole}`);
        const numericValue = parseInt(value, 10);
        if (!isNaN(numericValue)) {
            set(scoreRef, numericValue);
        } else if (value === '') {
            remove(scoreRef);
        }
    };

    const processSuddenDeathData = (suddenDeathData: Partial<SuddenDeathData> | null) => {
        if (!suddenDeathData?.isActive || !suddenDeathData.players || !suddenDeathData.holes || !Array.isArray(suddenDeathData.holes)) return [];

        const participatingPlayerIds = Object.keys(suddenDeathData.players).filter(id => suddenDeathData.players![id]);
        const allPlayersMap = new Map(Object.entries(players).map(([id, p]) => [id, p]));

        const results: any[] = participatingPlayerIds.map(id => {
            const playerInfo: any = allPlayersMap.get(id);
            if (!playerInfo) return null;

            const name = playerInfo.type === 'team' ? `${playerInfo.p1_name} / ${playerInfo.p2_name}` : playerInfo.name;
            
            const scoresPerHole: { [hole: string]: number | null } = {};
            let totalScore = 0;
            let holesPlayed = 0;

            suddenDeathData.holes!.forEach(hole => {
                const score = suddenDeathData.scores?.[id]?.[hole];
                if (score !== undefined && score !== null) {
                    scoresPerHole[hole] = score;
                    totalScore += score;
                    holesPlayed++;
                } else {
                    scoresPerHole[hole] = null;
                }
            });

            return { id, name, scoresPerHole, totalScore, holesPlayed };
        }).filter(Boolean);

        results.sort((a, b) => {
            if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed;
            if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
            return a.name.localeCompare(b.name);
        });

        let rank = 1;
        for (let i = 0; i < results.length; i++) {
            if (i > 0 && (results[i].totalScore > results[i-1].totalScore || results[i].holesPlayed < results[i-1].holesPlayed)) {
                rank = i + 1;
            }
            results[i].rank = rank;
        }

        return results;
    }
    
    const processedIndividualSuddenDeathData = useMemo(() => processSuddenDeathData(individualSuddenDeathData), [individualSuddenDeathData, players]);
    const processedTeamSuddenDeathData = useMemo(() => processSuddenDeathData(teamSuddenDeathData), [teamSuddenDeathData, players]);

    const holeOptions = Array.from({ length: 9 }, (_, i) => ({ value: (i + 1).toString(), label: `${i + 1}홀` }));

    const renderSuddenDeathInterface = (type: 'individual' | 'team') => {
        const isIndividual = type === 'individual';
        const tiedPlayers = isIndividual ? tiedIndividualPlayers : tiedTeamPlayers;
        const selectedPlayers = isIndividual ? selectedIndividualPlayers : selectedTeamPlayers;
        const setSelectedPlayers = isIndividual ? setSelectedIndividualPlayers : setSelectedTeamPlayers;
        const selectedCourseId = isIndividual ? selectedIndividualCourseId : selectedTeamCourseId;
        const setSelectedCourseId = isIndividual ? setSelectedIndividualCourseId : setSelectedTeamCourseId;
        const selectedHoles = isIndividual ? selectedIndividualHoles : selectedTeamHoles;
        const setSelectedHoles = isIndividual ? setSelectedIndividualHoles : setSelectedTeamHoles;
        const suddenDeathData = isIndividual ? individualSuddenDeathData : teamSuddenDeathData;
        const processedData = isIndividual ? processedIndividualSuddenDeathData : processedTeamSuddenDeathData;
        const suddenDeathScores = isIndividual ? individualSuddenDeathScores : teamSuddenDeathScores;
        const backcountApplied = isIndividual ? individualBackcountApplied : teamBackcountApplied;

        const playersGroupedByGroup = tiedPlayers.reduce((acc, player) => {
            const groupName = player.group || '미지정';
            if (!acc[groupName]) {
                acc[groupName] = [];
            }
            acc[groupName].push(player);
            return acc;
        }, {} as Record<string, Player[]>);

        // Calculate backcount rankings if backcount is applied
        const getBackcountRankedPlayers = () => {
            if (!backcountApplied || tiedPlayers.length < 2) return tiedPlayers;
            
            const allCoursesList = Object.values(courses);
            const backcountRankedPlayers = [...tiedPlayers];
            
            // Group by group and apply backcount within each group
            const groupedByGroup = backcountRankedPlayers.reduce((acc, player) => {
                const groupName = player.group || '미지정';
                if (!acc[groupName]) acc[groupName] = [];
                acc[groupName].push(player);
                return acc;
            }, {} as Record<string, Player[]>);

            Object.values(groupedByGroup).forEach(groupPlayers => {
                if (groupPlayers.length < 2) return;
                
                const coursesForGroup = (groupPlayers[0] as any)?.assignedCourses || allCoursesList;
                groupPlayers.sort((a, b) => backcountBreak(a, b, coursesForGroup));
                
                // Assign ranks
                let rank = 1;
                groupPlayers[0].rank = rank;
                for (let i = 1; i < groupPlayers.length; i++) {
                    const prev = groupPlayers[i-1];
                    const curr = groupPlayers[i];
                    if (backcountBreak(curr, prev, coursesForGroup) !== 0) {
                        rank = i + 1;
                    }
                    curr.rank = rank;
                }
            });
            
            return backcountRankedPlayers;
        };

        const displayPlayers = backcountApplied ? getBackcountRankedPlayers() : tiedPlayers;

        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>서든데스 설정</CardTitle>
                        <CardDescription>
                            {backcountApplied 
                                ? "1위 동점자가 백카운트로 결정되었습니다. 서든데스는 비활성화됩니다." 
                                : "서든데스를 진행할 선수, 코스, 홀을 선택하고 시작하세요."
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {Object.keys(playersGroupedByGroup).length > 0 ? (
                            <div className="space-y-6">
                                <div>
                                    <Label className="font-semibold text-base">1. 참가 선수 선택</Label>
                                    <div className="space-y-4 mt-2">
                                        {Object.entries(playersGroupedByGroup).map(([groupName, tiedPlayersInGroup]) => {
                                            const displayPlayersInGroup = backcountApplied 
                                                ? displayPlayers.filter(p => p.group === groupName)
                                                : tiedPlayersInGroup;
                                            
                                            return (
                                                <div key={groupName} className="p-4 border rounded-md">
                                                    <p className="font-bold mb-3">
                                                        {groupName} 그룹 
                                                        {backcountApplied 
                                                            ? ` (백카운트로 결정됨 - ${displayPlayersInGroup.length}명)`
                                                            : ` (${tiedPlayersInGroup.length}명 동점)`
                                                        }
                                                    </p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {displayPlayersInGroup.map(player => (
                                                            <div key={player.id} className="flex items-center space-x-3">
                                                                {!backcountApplied && (
                                                                    <Checkbox
                                                                        id={`${type}-player-${player.id}`}
                                                                        checked={selectedPlayers[player.id] || false}
                                                                        onCheckedChange={(checked) => setSelectedPlayers(prev => ({...prev, [player.id]: !!checked}))}
                                                                        disabled={suddenDeathData?.isActive}
                                                                    />
                                                                )}
                                                                <Label 
                                                                    htmlFor={`${type}-player-${player.id}`} 
                                                                    className={`font-medium text-base ${backcountApplied ? 'flex items-center gap-2' : ''}`}
                                                                >
                                                                    {backcountApplied && (
                                                                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-bold">
                                                                            {player.rank}위
                                                                        </span>
                                                                    )}
                                                                    {player.name} <span className="text-muted-foreground text-sm">({player.affiliation})</span>
                                                                </Label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                
                                {!backcountApplied && (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor={`${type}-course-select`} className="font-semibold">2. 코스 선택</Label>
                                                <Select 
                                                    value={selectedCourseId}
                                                    onValueChange={setSelectedCourseId}
                                                    disabled={suddenDeathData?.isActive}
                                                >
                                                    <SelectTrigger id={`${type}-course-select`}><SelectValue placeholder="코스 선택" /></SelectTrigger>
                                                    <SelectContent>
                                                        {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor={`${type}-hole-select`} className="font-semibold">3. 홀 선택</Label>
                                                <MultiSelect
                                                    options={holeOptions}
                                                    selected={selectedHoles.map(String)}
                                                    onChange={(values) => setSelectedHoles(values.map(Number))}
                                                    placeholder="홀 선택..."
                                                    disabled={suddenDeathData?.isActive}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <Button onClick={() => handleStartSuddenDeath(type)} disabled={suddenDeathData?.isActive} size="lg">
                                                <Play className="mr-2 h-4 w-4"/> 서든데스 시작
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="lg" disabled={!suddenDeathData?.isActive}>
                                                        <RotateCcw className="mr-2 h-4 w-4"/> 서든데스 초기화
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>정말 초기화하시겠습니까?</AlertDialogTitle>
                                                        <AlertDialogDescription>진행 중인 서든데스-플레이오프 정보와 점수가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>취소</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleResetSuddenDeath(type)}>초기화</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">
                                <p>현재 1위 동점자가 없습니다.</p>
                                <p className="text-sm">대회가 진행되어 1위 동점자가 발생하면 여기에 표시됩니다.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {suddenDeathData?.isActive && (
                    <Card>
                        <CardHeader>
                            <CardTitle>서든데스 점수판 (실시간 입력)</CardTitle>
                            <CardDescription>{courses.find(c => c.id == Number(suddenDeathData.courseId))?.name}에서 플레이오프가 진행 중입니다.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-48">선수</TableHead>
                                            {suddenDeathData.holes?.sort((a,b) => a-b).map(hole => <TableHead key={hole} className="text-center">{hole}홀</TableHead>)}
                                            <TableHead className="text-center font-bold text-primary">합계</TableHead>
                                            <TableHead className="text-center font-bold text-primary">순위</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {processedData.map(player => (
                                            <TableRow key={player.id}>
                                                <TableCell className="font-semibold">{player.name}</TableCell>
                                                {suddenDeathData.holes?.map(hole => (
                                                    <TableCell key={hole} className="text-center">
                                                        <Input
                                                            type="number"
                                                            className="w-16 h-10 mx-auto text-center text-base"
                                                            value={suddenDeathScores[player.id]?.[hole] ?? ''}
                                                            onChange={(e) => handleSuddenDeathScoreChange(type, player.id, hole, e.target.value)}
                                                        />
                                                    </TableCell>
                                                ))}
                                                <TableCell className="text-center font-bold text-lg">{player.totalScore}</TableCell>
                                                <TableCell className="text-center font-bold text-lg text-primary">{player.rank}위</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        );
    }

    const renderNTPInterface = (type: 'individual' | 'team') => {
        const isIndividual = type === 'individual';
        const tiedPlayers = isIndividual ? tiedIndividualPlayers : tiedTeamPlayers;
        const selectedPlayers = isIndividual ? selectedIndividualNTPPlayers : selectedTeamNTPPlayers;
        const setSelectedPlayers = isIndividual ? setSelectedIndividualNTPPlayers : setSelectedTeamNTPPlayers;
        const ntpData = isIndividual ? individualNTPData : teamNTPData;
        const ntpRankings = isIndividual ? individualNTPRankings : teamNTPRankings;
        const backcountApplied = isIndividual ? individualBackcountApplied : teamBackcountApplied;

        const playersGroupedByGroup = tiedPlayers.reduce((acc, player) => {
            const groupName = player.group || '미지정';
            if (!acc[groupName]) {
                acc[groupName] = [];
            }
            acc[groupName].push(player);
            return acc;
        }, {} as Record<string, Player[]>);

        // NTP 순위가 설정된 선수 목록
        const rankedPlayers = Object.keys(ntpRankings).map(playerId => {
            const player = tiedPlayers.find(p => p.id === playerId);
            if (!player) return null;
            return {
                ...player,
                ntpRank: ntpRankings[playerId]
            };
        }).filter(Boolean).sort((a: any, b: any) => a.ntpRank - b.ntpRank);

        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>니어리스트 투 더 핀: Nearest-to-the-Pin (NTP) 설정</CardTitle>
                        <CardDescription>
                            {backcountApplied 
                                ? "1위 동점자가 백카운트로 결정되었습니다. 니어리스트 투 더 핀은 비활성화됩니다." 
                                : ntpData?.isActive
                                ? "니어리스트 투 더 핀 순위를 관리하세요. 거리 측정 결과에 따라 순위를 설정할 수 있습니다."
                                : "니어리스트 투 더 핀을 진행할 선수를 선택하고 순위를 설정하세요."
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {Object.keys(playersGroupedByGroup).length > 0 ? (
                            <div className="space-y-6">
                                {!ntpData?.isActive && !backcountApplied && (
                                    <div>
                                        <Label className="font-semibold text-base">1. 참가 선수 선택</Label>
                                        <div className="space-y-4 mt-2">
                                            {Object.entries(playersGroupedByGroup).map(([groupName, tiedPlayersInGroup]) => (
                                                <div key={groupName} className="p-4 border rounded-md">
                                                    <p className="font-bold mb-3">
                                                        {groupName} 그룹 ({tiedPlayersInGroup.length}명 동점)
                                                    </p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {tiedPlayersInGroup.map(player => (
                                                            <div key={player.id} className="flex items-center space-x-3">
                                                                <Checkbox
                                                                    id={`${type}-ntp-player-${player.id}`}
                                                                    checked={selectedPlayers[player.id] || false}
                                                                    onCheckedChange={(checked) => setSelectedPlayers(prev => ({...prev, [player.id]: !!checked}))}
                                                                />
                                                                <Label 
                                                                    htmlFor={`${type}-ntp-player-${player.id}`} 
                                                                    className="font-medium text-base"
                                                                >
                                                                    {player.name} <span className="text-muted-foreground text-sm">({player.affiliation})</span>
                                                                </Label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!backcountApplied && (
                                    <div className="flex gap-4">
                                        {!ntpData?.isActive ? (
                                            <Button onClick={() => handleStartNTP(type)} disabled={Object.keys(selectedPlayers).filter(id => selectedPlayers[id]).length < 2} size="lg">
                                                <Target className="mr-2 h-4 w-4"/> 니어리스트 투 더 핀 시작
                                            </Button>
                                        ) : (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="lg">
                                                        <RotateCcw className="mr-2 h-4 w-4"/> 니어리스트 투 더 핀 초기화
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>정말 초기화하시겠습니까?</AlertDialogTitle>
                                                        <AlertDialogDescription>설정된 니어리스트 투 더 핀 순위 정보가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>취소</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleResetNTP(type)}>초기화</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </div>
                                )}

                                {ntpData?.isActive && (
                                    <div>
                                        <Label className="font-semibold text-base mb-4 block">2. 순위 설정 (거리 측정 결과에 따라 순위를 조정하세요)</Label>
                                        <div className="space-y-2 border rounded-lg p-4">
                                            {rankedPlayers.map((player: any, index: number) => (
                                                <div key={player.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-md border">
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <span className="font-bold text-lg text-primary w-12 text-center">
                                                            {player.ntpRank}위
                                                        </span>
                                                        <span className="font-medium text-base">{player.name}</span>
                                                        <span className="text-muted-foreground text-sm">({player.affiliation})</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleMoveNTPRank(type, player.id, 'up')}
                                                            disabled={player.ntpRank <= 1}
                                                        >
                                                            <ArrowUp className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleMoveNTPRank(type, player.id, 'down')}
                                                            disabled={player.ntpRank >= rankedPlayers.length}
                                                        >
                                                            <ArrowDown className="h-4 w-4" />
                                                        </Button>
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            max={rankedPlayers.length}
                                                            value={player.ntpRank}
                                                            onChange={(e) => {
                                                                const newRank = parseInt(e.target.value, 10);
                                                                if (!isNaN(newRank) && newRank >= 1 && newRank <= rankedPlayers.length) {
                                                                    handleNTPRankChange(type, player.id, newRank);
                                                                }
                                                            }}
                                                            className="w-20 h-9 text-center"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-2">
                                            • 위/아래 화살표 버튼으로 순위를 조정하거나, 직접 숫자를 입력하여 순위를 변경할 수 있습니다.
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">
                                <p>현재 1위 동점자가 없습니다.</p>
                                <p className="text-sm">대회가 진행되어 1위 동점자가 발생하면 여기에 표시됩니다.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl font-bold">1위 동점자 백카운트 관리</CardTitle>
                    <CardDescription>1위 동점자를 백카운트로 결정하거나 서든데스로 처리할 수 있습니다.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-4">
                        <Button 
                            onClick={() => handleApplyBackcount('individual')} 
                            disabled={tiedIndividualPlayers.length < 2 || individualBackcountApplied}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            size="lg"
                        >
                            백카운트로 선정
                        </Button>
                        <Button 
                            onClick={() => handleResetBackcount('individual')} 
                            disabled={!individualBackcountApplied}
                            variant="outline"
                            className="border-blue-600 text-blue-600 hover:bg-blue-50"
                            size="lg"
                        >
                            백카운트 초기화
                        </Button>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                        <p>• 1위 동점자를 그냥 백카운트로 결정하려면 위의 단추를 눌러주세요.</p>
                        <p>• 1위 동점자를 서든데스 또는 니어리스트 투 더 핀으로 선정할 경우 여기 단추는 누르지 마시고 아래 플레이오프 관리를 이용하세요.</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline flex items-center gap-2"><Flame className="text-destructive"/>플레이오프 관리</CardTitle>
                    <CardDescription>1위 동점자를 대상으로 '서든데스' 혹은 '니어리스트 투 더 핀' 으로 설정하고 점수를 관리합니다.</CardDescription>
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
                    {renderSuddenDeathInterface('individual')}
                    {renderNTPInterface('individual')}
                </TabsContent>
                <TabsContent value="team" className="mt-6 space-y-6">
                    {renderSuddenDeathInterface('team')}
                    {renderNTPInterface('team')}
                </TabsContent>
            </Tabs>
        </div>
    );
}
