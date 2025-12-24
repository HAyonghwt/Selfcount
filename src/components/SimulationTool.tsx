"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue, set, push, update, remove, get } from 'firebase/database';
import { logScoreChange } from '@/lib/scoreLogs';
import { Users, Trash2, Trophy, UserCheck, RotateCcw, Loader2 } from 'lucide-react';

interface SimulationState {
    isRunning: boolean;
    currentStep: string;
    progress: number;
}

interface StatusReport {
    step: string;
    status: 'success' | 'error' | 'warning';
    message: string;
    details?: any;
}

export default function SimulationTool() {
    const { toast } = useToast();
    const [simulationState, setSimulationState] = useState<SimulationState>({
        isRunning: false,
        currentStep: '',
        progress: 0
    });
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportData, setReportData] = useState<{ title: string; reports: StatusReport[] } | null>(null);
    const [courses, setCourses] = useState<any[]>([]);
    const [groupsData, setGroupsData] = useState<any>({});
    const [allPlayers, setAllPlayers] = useState<any[]>([]);
    const [allScores, setAllScores] = useState<any>({});

    useEffect(() => {
        if (!db) return;
        
        const tournamentRef = ref(db, 'tournaments/current');
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');

        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setGroupsData(data.groups || {});
            setCourses(data.courses ? Object.values(data.courses) : []);
        });

        const unsubPlayers = onValue(playersRef, (snapshot) => {
            const data = snapshot.val();
            setAllPlayers(data ? Object.entries(data).map(([id, player]) => ({ id, ...player as any })) : []);
        });

        const unsubScores = onValue(scoresRef, (snapshot) => {
            setAllScores(snapshot.val() || {});
        });

        return () => {
            unsubTournament();
            unsubPlayers();
            unsubScores();
        };
    }, []);

    // 시뮬레이션 데이터인지 확인하는 헬퍼 함수
    const isSimulationData = (player: any): boolean => {
        return player.name?.includes('시뮬') || player.affiliation?.includes('시뮬');
    };

    // 선수 등록 (50명/100명/300명)
    const registerPlayers = async (count: number) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ isRunning: true, currentStep: '선수 등록 중...', progress: 0 });

        try {
            // 코스 확인 (A, B, C, D 코스 필요)
            const courseA = courses.find(c => c.name === 'A코스' || c.id === 1);
            const courseB = courses.find(c => c.name === 'B코스' || c.id === 2);
            const courseC = courses.find(c => c.name === 'C코스' || c.id === 3);
            const courseD = courses.find(c => c.name === 'D코스' || c.id === 4);

            if (!courseA || !courseB || !courseC || !courseD) {
                toast({ 
                    title: '오류', 
                    description: 'A, B, C, D 코스가 모두 설정되어 있어야 합니다. 코스 관리에서 먼저 설정해주세요.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // 남자부/여자부 그룹 생성 또는 확인
            const maleGroupName = '남자부';
            const femaleGroupName = '여자부';

            const updates: { [key: string]: any } = {};

            // 그룹 생성
            if (!groupsData[maleGroupName]) {
                // 코스 순서를 자동으로 설정 (코스의 order 값 또는 코스 ID를 기준으로)
                updates[`/tournaments/current/groups/${maleGroupName}`] = {
                    name: maleGroupName,
                    type: 'individual',
                    courses: { 
                        [courseA.id]: courseA.order || courseA.id || 1,
                        [courseB.id]: courseB.order || courseB.id || 2,
                        [courseC.id]: courseC.order || courseC.id || 3,
                        [courseD.id]: courseD.order || courseD.id || 4
                    }
                };
            }
            if (!groupsData[femaleGroupName]) {
                // 코스 순서를 자동으로 설정 (코스의 order 값 또는 코스 ID를 기준으로)
                updates[`/tournaments/current/groups/${femaleGroupName}`] = {
                    name: femaleGroupName,
                    type: 'individual',
                    courses: { 
                        [courseC.id]: courseC.order || courseC.id || 3,
                        [courseD.id]: courseD.order || courseD.id || 4,
                        [courseA.id]: courseA.order || courseA.id || 1,
                        [courseB.id]: courseB.order || courseB.id || 2
                    }
                };
            }

            // 선수 등록 (정확히 반반으로 나누기)
            // 300명 등록 시 정확히 남자 150명, 여자 150명
            const maleCount = count === 300 ? 150 : Math.floor(count / 2);
            const femaleCount = count === 300 ? 150 : count - maleCount;
            const playersPerJo = 4; // 조당 4명

            // 남자부 선수 등록 (조 번호 1부터 시작)
            for (let i = 0; i < maleCount; i++) {
                const jo = Math.floor(i / playersPerJo) + 1;
                const playerKey = push(ref(db, 'players')).key;
                updates[`/players/${playerKey}`] = {
                    type: 'individual',
                    group: maleGroupName,
                    jo: jo,
                    name: `시뮬남자${i + 1}`,
                    affiliation: '시뮬레이션'
                };
            }

            // 여자부 선수 등록 (조 번호는 남자부 다음부터 시작)
            // 남자부 조 수 계산: Math.ceil(maleCount / playersPerJo)
            const maleJoCount = Math.ceil(maleCount / playersPerJo);
            for (let i = 0; i < femaleCount; i++) {
                const jo = maleJoCount + Math.floor(i / playersPerJo) + 1;
                const playerKey = push(ref(db, 'players')).key;
                updates[`/players/${playerKey}`] = {
                    type: 'individual',
                    group: femaleGroupName,
                    jo: jo,
                    name: `시뮬여자${i + 1}`,
                    affiliation: '시뮬레이션'
                };
            }

            await update(ref(db), updates);
            
            toast({ 
                title: '등록 완료', 
                description: `남자부 ${maleCount}명, 여자부 ${femaleCount}명 등록되었습니다.` 
            });
        } catch (error: any) {
            toast({ 
                title: '등록 실패', 
                description: error.message || '알 수 없는 오류', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    // 순위 계산 함수 (백카운트 방식) - 대시보드와 동일한 로직
    const calculateRanks = async (players: any[], courses: any[], groupsData: any): Promise<any[]> => {
        // Firebase에서 최신 점수 데이터 가져오기
        const scoresSnapshot = await get(ref(db, 'scores'));
        const latestScores = scoresSnapshot.val() || {};

        const processedPlayers = players.map(player => {
            const group = groupsData[player.group];
            if (!group) return null;

            // 그룹에 배정된 코스만 필터링
            const assignedCourses = courses
                .filter(c => group.courses?.[c.id])
                .sort((a, b) => {
                    // 코스 이름 역순 정렬 (D->C->B->A)
                    const nameA = a.name || '';
                    const nameB = b.name || '';
                    return nameB.localeCompare(nameA);
                });

            const courseScores: { [courseId: string]: number } = {};
            const detailedScores: { [courseId: string]: { [holeNumber: string]: number } } = {};
            let totalScore = 0;
            let hasAnyScore = false;

            assignedCourses.forEach(course => {
                const courseId = String(course.id);
                const holeScores: number[] = [];
                let courseTotal = 0;

                for (let hole = 1; hole <= 9; hole++) {
                    const score = latestScores[player.id]?.[courseId]?.[String(hole)];
                    if (score !== null && score !== undefined && score > 0) {
                        holeScores.push(score);
                        courseTotal += score;
                        hasAnyScore = true;
                    } else {
                        holeScores.push(null as any);
                    }
                }

                courseScores[courseId] = courseTotal;
                detailedScores[courseId] = {};
                for (let i = 0; i < 9; i++) {
                    if (holeScores[i] !== null) {
                        detailedScores[courseId][String(i + 1)] = holeScores[i];
                    }
                }

                totalScore += courseTotal;
            });

            return {
                ...player,
                totalScore,
                hasAnyScore,
                courseScores,
                detailedScores,
                assignedCourses,
                hasForfeited: false
            };
        }).filter(p => p !== null);

        // 백카운트 방식으로 정렬
        const sortedCourses = [...courses]
            .filter(c => {
                // 남자부/여자부에 따라 다른 코스 필터링
                const firstPlayer = processedPlayers[0];
                if (!firstPlayer) return true;
                const group = groupsData[firstPlayer.group];
                return group?.courses?.[c.id];
            })
            .sort((a, b) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                return nameB.localeCompare(nameA); // 역순 (Z->A)
            });

        processedPlayers.sort((a, b) => {
            // 기권 처리
            if (a.hasForfeited && !b.hasForfeited) return 1;
            if (!a.hasForfeited && b.hasForfeited) return -1;

            // 점수 없음 처리
            if (!a.hasAnyScore && !b.hasAnyScore) return 0;
            if (!a.hasAnyScore) return 1;
            if (!b.hasAnyScore) return -1;

            // 총점 비교
            if (a.totalScore !== b.totalScore) {
                return a.totalScore - b.totalScore;
            }

            // 코스별 점수 비교 (역순)
            for (const course of sortedCourses) {
                const courseId = String(course.id);
                const aScore = a.courseScores[courseId] || 0;
                const bScore = b.courseScores[courseId] || 0;
                if (aScore !== bScore) {
                    return aScore - bScore;
                }
            }

            // 마지막 코스의 홀별 점수 비교 (9번->1번)
            if (sortedCourses.length > 0) {
                const lastCourse = sortedCourses[0];
                const lastCourseId = String(lastCourse.id);
                for (let hole = 9; hole >= 1; hole--) {
                    const aHole = a.detailedScores[lastCourseId]?.[String(hole)] || 0;
                    const bHole = b.detailedScores[lastCourseId]?.[String(hole)] || 0;
                    if (aHole !== bHole) {
                        return aHole - bHole;
                    }
                }
            }

            return 0;
        });

        // 순위 부여
        let currentRank = 1;
        processedPlayers.forEach((player, index) => {
            if (index > 0) {
                const prevPlayer = processedPlayers[index - 1];
                // 총점이 다르거나, 모든 코스 점수가 다르면 순위 변경
                if (prevPlayer.totalScore !== player.totalScore) {
                    currentRank = index + 1;
                } else {
                    // 동점인 경우 코스별 점수 비교
                    let isTied = true;
                    for (const course of sortedCourses) {
                        const courseId = String(course.id);
                        if ((prevPlayer.courseScores[courseId] || 0) !== (player.courseScores[courseId] || 0)) {
                            isTied = false;
                            break;
                        }
                    }
                    if (!isTied) {
                        currentRank = index + 1;
                    }
                }
            }
            player.rank = currentRank;
        });

        return processedPlayers;
    };

    // 심판 점수 등록 (1일차 또는 2일차)
    const registerRefereeScores = async (day: 1 | 2 = 1) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ 
            isRunning: true, 
            currentStep: `심판 ${day}일차 점수 등록 중...`, 
            progress: 0 
        });

        try {
            const courseA = courses.find(c => c.name === 'A코스' || c.id === 1);
            const courseB = courses.find(c => c.name === 'B코스' || c.id === 2);
            const courseC = courses.find(c => c.name === 'C코스' || c.id === 3);
            const courseD = courses.find(c => c.name === 'D코스' || c.id === 4);

            if (!courseA || !courseB || !courseC || !courseD) {
                toast({ 
                    title: '오류', 
                    description: 'A, B, C, D 코스가 모두 설정되어 있어야 합니다.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // Firebase에서 최신 선수 데이터 직접 가져오기 (상태 동기화 문제 해결)
            const playersSnapshot = await get(ref(db, 'players'));
            const latestPlayersData = playersSnapshot.val() || {};
            const latestPlayers = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));
            
            const maleGroupPlayers = latestPlayers.filter(p => 
                p.group === '남자부' && isSimulationData(p)
            );
            const femaleGroupPlayers = latestPlayers.filter(p => 
                p.group === '여자부' && isSimulationData(p)
            );

            if (maleGroupPlayers.length === 0 && femaleGroupPlayers.length === 0) {
                toast({ 
                    title: '오류', 
                    description: '시뮬레이션 선수가 등록되어 있지 않습니다. 먼저 선수를 등록해주세요.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            const updates: { [key: string]: any } = {};
            let progress = 0;
            const total = maleGroupPlayers.length + femaleGroupPlayers.length;

            if (day === 1) {
                // 1일차: 남자부 AB코스, 여자부 CD코스
                for (const player of maleGroupPlayers) {
                    for (const course of [courseA, courseB]) {
                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `1일차 남자부 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }

                for (const player of femaleGroupPlayers) {
                    for (const course of [courseC, courseD]) {
                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `1일차 여자부 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }
            } else {
                // 2일차: 남자부 CD코스, 여자부 AB코스
                for (const player of maleGroupPlayers) {
                    for (const course of [courseC, courseD]) {
                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `2일차 남자부 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }

                for (const player of femaleGroupPlayers) {
                    for (const course of [courseA, courseB]) {
                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `2일차 여자부 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }
            }

            await update(ref(db), updates);
            
            toast({ 
                title: '점수 등록 완료', 
                description: `${day}일차 심판 점수가 등록되었습니다. ${day === 1 ? '(남자부: AB코스, 여자부: CD코스)' : '(남자부: CD코스, 여자부: AB코스)'}` 
            });
        } catch (error: any) {
            toast({ 
                title: '점수 등록 실패', 
                description: error.message || '알 수 없는 오류', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    // 조장 점수 등록 (1일차 또는 2일차)
    const registerCaptainScores = async (day: 1 | 2) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ 
            isRunning: true, 
            currentStep: `${day}일차 조장 점수 등록 중...`, 
            progress: 0 
        });

        try {
            const courseA = courses.find(c => c.name === 'A코스' || c.id === 1);
            const courseB = courses.find(c => c.name === 'B코스' || c.id === 2);
            const courseC = courses.find(c => c.name === 'C코스' || c.id === 3);
            const courseD = courses.find(c => c.name === 'D코스' || c.id === 4);

            if (!courseA || !courseB || !courseC || !courseD) {
                toast({ 
                    title: '오류', 
                    description: 'A, B, C, D 코스가 모두 설정되어 있어야 합니다.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // Firebase에서 최신 선수 데이터 직접 가져오기 (상태 동기화 문제 해결)
            const playersSnapshot = await get(ref(db, 'players'));
            const latestPlayersData = playersSnapshot.val() || {};
            const latestPlayers = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));
            
            const maleGroupPlayers = latestPlayers.filter(p => 
                p.group === '남자부' && isSimulationData(p)
            );
            const femaleGroupPlayers = latestPlayers.filter(p => 
                p.group === '여자부' && isSimulationData(p)
            );

            if (maleGroupPlayers.length === 0 && femaleGroupPlayers.length === 0) {
                toast({ 
                    title: '오류', 
                    description: '시뮬레이션 선수가 등록되어 있지 않습니다. 먼저 선수를 등록해주세요.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // Firebase에서 최신 점수 데이터 가져오기
            const scoresSnapshot = await get(ref(db, 'scores'));
            const latestScores = scoresSnapshot.val() || {};

            const updates: { [key: string]: any } = {};
            let progress = 0;
            const total = maleGroupPlayers.length + femaleGroupPlayers.length;
            let skippedCount = 0;

            if (day === 1) {
                // 1일차: 남자부 AB코스, 여자부 CD코스
                // 심판 점수가 이미 있으면 조장 점수 등록하지 않음
                for (const player of maleGroupPlayers) {
                    for (const course of [courseA, courseB]) {
                        // 이미 점수가 있으면 스킵 (심판 점수 등록이 이미 되어 있음)
                        const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                        if (hasScore) {
                            skippedCount++;
                            continue;
                        }

                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `남자부 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }

                for (const player of femaleGroupPlayers) {
                    for (const course of [courseC, courseD]) {
                        const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                        if (hasScore) {
                            skippedCount++;
                            continue;
                        }

                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `여자부 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }
            } else {
                // 2일차: 남자부 CD코스, 여자부 AB코스
                for (const player of maleGroupPlayers) {
                    for (const course of [courseC, courseD]) {
                        const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                        if (hasScore) {
                            skippedCount++;
                            continue;
                        }

                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `남자부 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }

                for (const player of femaleGroupPlayers) {
                    for (const course of [courseA, courseB]) {
                        const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                        if (hasScore) {
                            skippedCount++;
                            continue;
                        }

                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `여자부 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }
            }

            if (Object.keys(updates).length === 0) {
                toast({ 
                    title: '경고', 
                    description: skippedCount > 0 
                        ? `이미 모든 점수가 등록되어 있습니다. (${skippedCount}개 코스 스킵됨)`
                        : '등록할 점수가 없습니다. 선수가 등록되어 있는지 확인해주세요.', 
                    variant: 'destructive' 
                });
            } else {
                await update(ref(db), updates);
                
                const message = skippedCount > 0 
                    ? `${day}일차 조장 점수가 등록되었습니다. (${Object.keys(updates).length}개 점수 등록, ${skippedCount}개 코스 스킵됨)`
                    : `${day}일차 조장 점수가 등록되었습니다. (${Object.keys(updates).length}개 점수)`;
                
                toast({ 
                    title: '점수 등록 완료', 
                    description: message 
                });
            }
        } catch (error: any) {
            toast({ 
                title: '점수 등록 실패', 
                description: error.message || '알 수 없는 오류', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    // 일괄 점수 등록 (1일차 또는 2일차) - 점수 로그 포함
    const registerBatchScores = async (day: 1 | 2) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ 
            isRunning: true, 
            currentStep: `${day}일차 일괄 점수 등록 중...`, 
            progress: 0 
        });

        try {
            const courseA = courses.find(c => c.name === 'A코스' || c.id === 1);
            const courseB = courses.find(c => c.name === 'B코스' || c.id === 2);
            const courseC = courses.find(c => c.name === 'C코스' || c.id === 3);
            const courseD = courses.find(c => c.name === 'D코스' || c.id === 4);

            if (!courseA || !courseB || !courseC || !courseD) {
                toast({ 
                    title: '오류', 
                    description: 'A, B, C, D 코스가 모두 설정되어 있어야 합니다.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // Firebase에서 최신 선수 데이터 직접 가져오기
            const playersSnapshot = await get(ref(db, 'players'));
            const latestPlayersData = playersSnapshot.val() || {};
            const latestPlayers = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));
            
            const maleGroupPlayers = latestPlayers.filter(p => 
                p.group === '남자부' && isSimulationData(p)
            );
            const femaleGroupPlayers = latestPlayers.filter(p => 
                p.group === '여자부' && isSimulationData(p)
            );

            if (maleGroupPlayers.length === 0 && femaleGroupPlayers.length === 0) {
                toast({ 
                    title: '오류', 
                    description: '시뮬레이션 선수가 등록되어 있지 않습니다. 먼저 선수를 등록해주세요.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // Firebase에서 최신 점수 데이터 가져오기
            const scoresSnapshot = await get(ref(db, 'scores'));
            const latestScores = scoresSnapshot.val() || {};

            const updates: { [key: string]: any } = {};
            let progress = 0;
            const total = maleGroupPlayers.length + femaleGroupPlayers.length;
            let skippedCount = 0;
            const logPromises: Promise<void>[] = [];

            if (day === 1) {
                // 1일차: 남자부 AB코스, 여자부 CD코스
                for (const player of maleGroupPlayers) {
                    for (const course of [courseA, courseB]) {
                        const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                        if (hasScore) {
                            skippedCount++;
                            continue;
                        }

                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                            
                            // 점수 로그 기록 (비동기로 처리)
                            logPromises.push(
                                logScoreChange({
                                    matchId: "tournaments/current",
                                    playerId: player.id,
                                    scoreType: "holeScore",
                                    holeNumber: hole,
                                    oldValue: 0,
                                    newValue: score,
                                    modifiedBy: `시뮬레이션_일괄입력`,
                                    modifiedByType: "captain",
                                    comment: `일괄 입력 모드 시뮬레이션 - 코스: ${course.id}, 그룹: ${player.group}, 조: ${player.jo}`,
                                    courseId: String(course.id),
                                }).catch(err => {
                                    console.error('점수 로그 기록 실패:', err);
                                })
                            );
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `1일차 남자부 일괄 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }

                for (const player of femaleGroupPlayers) {
                    for (const course of [courseC, courseD]) {
                        const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                        if (hasScore) {
                            skippedCount++;
                            continue;
                        }

                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                            
                            // 점수 로그 기록 (비동기로 처리)
                            logPromises.push(
                                logScoreChange({
                                    matchId: "tournaments/current",
                                    playerId: player.id,
                                    scoreType: "holeScore",
                                    holeNumber: hole,
                                    oldValue: 0,
                                    newValue: score,
                                    modifiedBy: `시뮬레이션_일괄입력`,
                                    modifiedByType: "captain",
                                    comment: `일괄 입력 모드 시뮬레이션 - 코스: ${course.id}, 그룹: ${player.group}, 조: ${player.jo}`,
                                    courseId: String(course.id),
                                }).catch(err => {
                                    console.error('점수 로그 기록 실패:', err);
                                })
                            );
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `1일차 여자부 일괄 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }
            } else {
                // 2일차: 남자부 CD코스, 여자부 AB코스
                for (const player of maleGroupPlayers) {
                    for (const course of [courseC, courseD]) {
                        const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                        if (hasScore) {
                            skippedCount++;
                            continue;
                        }

                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                            
                            // 점수 로그 기록 (비동기로 처리)
                            logPromises.push(
                                logScoreChange({
                                    matchId: "tournaments/current",
                                    playerId: player.id,
                                    scoreType: "holeScore",
                                    holeNumber: hole,
                                    oldValue: 0,
                                    newValue: score,
                                    modifiedBy: `시뮬레이션_일괄입력`,
                                    modifiedByType: "captain",
                                    comment: `일괄 입력 모드 시뮬레이션 - 코스: ${course.id}, 그룹: ${player.group}, 조: ${player.jo}`,
                                    courseId: String(course.id),
                                }).catch(err => {
                                    console.error('점수 로그 기록 실패:', err);
                                })
                            );
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `2일차 남자부 일괄 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }

                for (const player of femaleGroupPlayers) {
                    for (const course of [courseA, courseB]) {
                        const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                        if (hasScore) {
                            skippedCount++;
                            continue;
                        }

                        for (let hole = 1; hole <= 9; hole++) {
                            const par = course.pars?.[hole - 1] || 4;
                            const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                            updates[`/scores/${player.id}/${course.id}/${hole}`] = score;
                            
                            // 점수 로그 기록 (비동기로 처리)
                            logPromises.push(
                                logScoreChange({
                                    matchId: "tournaments/current",
                                    playerId: player.id,
                                    scoreType: "holeScore",
                                    holeNumber: hole,
                                    oldValue: 0,
                                    newValue: score,
                                    modifiedBy: `시뮬레이션_일괄입력`,
                                    modifiedByType: "captain",
                                    comment: `일괄 입력 모드 시뮬레이션 - 코스: ${course.id}, 그룹: ${player.group}, 조: ${player.jo}`,
                                    courseId: String(course.id),
                                }).catch(err => {
                                    console.error('점수 로그 기록 실패:', err);
                                })
                            );
                        }
                    }
                    progress++;
                    setSimulationState({ 
                        isRunning: true, 
                        currentStep: `2일차 여자부 일괄 점수 입력 중... (${progress}/${total})`, 
                        progress: (progress / total) * 100 
                    });
                }
            }

            if (Object.keys(updates).length === 0) {
                toast({ 
                    title: '경고', 
                    description: skippedCount > 0 
                        ? `이미 모든 점수가 등록되어 있습니다. (${skippedCount}개 코스 스킵됨)`
                        : '등록할 점수가 없습니다. 선수가 등록되어 있는지 확인해주세요.', 
                    variant: 'destructive' 
                });
            } else {
                // 점수 저장
                await update(ref(db), updates);
                
                // 🚀 성능 최적화: 점수 로그 기록을 배치로 처리 (50개씩)
                const BATCH_SIZE = 50;
                const totalBatches = Math.ceil(logPromises.length / BATCH_SIZE);
                
                for (let i = 0; i < totalBatches; i++) {
                    const batch = logPromises.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
                    await Promise.allSettled(batch);
                    
                    // 진행 상태 업데이트
                    if (totalBatches > 1) {
                        setSimulationState({ 
                            isRunning: true, 
                            currentStep: `${day}일차 점수 로그 기록 중... (${i + 1}/${totalBatches})`, 
                            progress: 90 + ((i + 1) / totalBatches) * 10 
                        });
                    }
                }
                
                const message = skippedCount > 0 
                    ? `${day}일차 일괄 점수가 등록되었습니다. (${Object.keys(updates).length}개 점수 등록, ${logPromises.length}개 로그 기록, ${skippedCount}개 코스 스킵됨)`
                    : `${day}일차 일괄 점수가 등록되었습니다. (${Object.keys(updates).length}개 점수 등록, ${logPromises.length}개 로그 기록)`;
                
                toast({ 
                    title: '점수 등록 완료', 
                    description: message 
                });
            }
        } catch (error: any) {
            toast({ 
                title: '점수 등록 실패', 
                description: error.message || '알 수 없는 오류', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    // 재편성 선수 등록 (1일차 순위대로 4명씩 조 재편성)
    const reorganizePlayers = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ isRunning: true, currentStep: '선수 재편성 중...', progress: 0 });

        try {
            // Firebase에서 최신 데이터 직접 가져오기 (상태 동기화 문제 해결)
            const playersSnapshot = await get(ref(db, 'players'));
            const scoresSnapshot = await get(ref(db, 'scores'));
            const latestPlayersData = playersSnapshot.val() || {};
            const latestScores = scoresSnapshot.val() || {};
            const latestPlayers = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));
            
            // 1일차 순위 계산 (1일차 점수만 사용)
            const maleGroupPlayers = latestPlayers.filter(p => 
                p.group === '남자부' && isSimulationData(p)
            );
            const femaleGroupPlayers = latestPlayers.filter(p => 
                p.group === '여자부' && isSimulationData(p)
            );

            // 1일차 점수만으로 순위 계산
            const courseA = courses.find(c => c.name === 'A코스' || c.id === 1);
            const courseB = courses.find(c => c.name === 'B코스' || c.id === 2);
            const courseC = courses.find(c => c.name === 'C코스' || c.id === 3);
            const courseD = courses.find(c => c.name === 'D코스' || c.id === 4);

            // 남자부는 AB코스만, 여자부는 CD코스만으로 순위 계산
            const calculateDay1Ranks = (players: any[], day1Courses: any[]) => {
                return players.map(player => {
                    let totalScore = 0;
                    const courseScores: { [courseId: string]: number } = {};
                    const detailedScores: { [courseId: string]: { [holeNumber: string]: number } } = {};

                    day1Courses.forEach(course => {
                        const courseId = String(course.id);
                        let courseTotal = 0;
                        detailedScores[courseId] = {};

                        for (let hole = 1; hole <= 9; hole++) {
                            const score = latestScores[player.id]?.[courseId]?.[String(hole)];
                            if (score !== null && score !== undefined && score > 0) {
                                courseTotal += score;
                                detailedScores[courseId][String(hole)] = score;
                            }
                        }

                        courseScores[courseId] = courseTotal;
                        totalScore += courseTotal;
                    });

                    return {
                        ...player,
                        totalScore,
                        courseScores,
                        detailedScores,
                        assignedCourses: day1Courses
                    };
                }).sort((a, b) => {
                    if (a.totalScore !== b.totalScore) {
                        return a.totalScore - b.totalScore;
                    }
                    // 동점 시 코스별 점수 비교 (역순)
                    const sortedDay1Courses = [...day1Courses].sort((x, y) => {
                        const nameX = x.name || '';
                        const nameY = y.name || '';
                        return nameY.localeCompare(nameX);
                    });
                    for (const course of sortedDay1Courses) {
                        const courseId = String(course.id);
                        const aScore = a.courseScores[courseId] || 0;
                        const bScore = b.courseScores[courseId] || 0;
                        if (aScore !== bScore) {
                            return aScore - bScore;
                        }
                    }
                    return 0;
                }).map((player, index) => ({
                    ...player,
                    rank: index + 1
                }));
            };

            const rankedMales = calculateDay1Ranks(maleGroupPlayers, [courseA, courseB].filter(Boolean));
            const rankedFemales = calculateDay1Ranks(femaleGroupPlayers, [courseC, courseD].filter(Boolean));

            const updates: { [key: string]: any } = {};
            const playersPerJo = 4;

            // 남자부 재편성 (조 번호 1부터 시작)
            rankedMales.forEach((player, index) => {
                const newJo = Math.floor(index / playersPerJo) + 1;
                updates[`/players/${player.id}/jo`] = newJo;
            });

            // 여자부 재편성 (조 번호는 남자부 다음부터 시작)
            // 남자부 조 수 계산: Math.ceil(rankedMales.length / playersPerJo)
            const maleJoCount = Math.ceil(rankedMales.length / playersPerJo);
            rankedFemales.forEach((player, index) => {
                const newJo = maleJoCount + Math.floor(index / playersPerJo) + 1;
                updates[`/players/${player.id}/jo`] = newJo;
            });

            await update(ref(db), updates);
            
            toast({ 
                title: '재편성 완료', 
                description: `1일차 순위대로 4명씩 조가 재편성되었습니다. (남자부: ${rankedMales.length}명, 여자부: ${rankedFemales.length}명)` 
            });
        } catch (error: any) {
            toast({ 
                title: '재편성 실패', 
                description: error.message || '알 수 없는 오류', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    // 시뮬레이션 데이터 삭제
    const deleteSimulationData = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ isRunning: true, currentStep: '시뮬레이션 데이터 삭제 중...', progress: 0 });

        try {
            // 🚀 성능 최적화: Firebase에서 최신 데이터 병렬로 가져오기
            const [playersSnapshot, scoresSnapshot, groupsSnapshot] = await Promise.all([
                get(ref(db, 'players')),
                get(ref(db, 'scores')),
                get(ref(db, 'tournaments/current/groups'))
            ]);
            const latestPlayersData = playersSnapshot.val() || {};
            const latestScores = scoresSnapshot.val() || {};
            const latestGroupsData = groupsSnapshot.val() || {};
            const latestPlayers = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));
            
            const simulationPlayers = latestPlayers.filter(p => isSimulationData(p));
            const updates: { [key: string]: any } = {};

            // 선수 삭제
            for (const player of simulationPlayers) {
                updates[`/players/${player.id}`] = null;
                // 점수 삭제
                if (latestScores[player.id]) {
                    updates[`/scores/${player.id}`] = null;
                }
            }

            // 그룹 삭제 (시뮬레이션 그룹만)
            if (latestGroupsData['남자부'] || latestGroupsData['여자부']) {
                // 그룹에 시뮬레이션 선수만 있는 경우에만 삭제
                const maleGroupHasRealPlayers = latestPlayers.some(p => 
                    p.group === '남자부' && !isSimulationData(p)
                );
                const femaleGroupHasRealPlayers = latestPlayers.some(p => 
                    p.group === '여자부' && !isSimulationData(p)
                );

                if (!maleGroupHasRealPlayers) {
                    updates[`/tournaments/current/groups/남자부`] = null;
                }
                if (!femaleGroupHasRealPlayers) {
                    updates[`/tournaments/current/groups/여자부`] = null;
                }
            }

            await update(ref(db), updates);
            
            // 상태 업데이트
            setAllPlayers(latestPlayers.filter(p => !isSimulationData(p)));
            const remainingScores: any = {};
            for (const playerId in latestScores) {
                if (!simulationPlayers.find(p => p.id === playerId)) {
                    remainingScores[playerId] = latestScores[playerId];
                }
            }
            setAllScores(remainingScores);
            
            toast({ 
                title: '삭제 완료', 
                description: `시뮬레이션 데이터가 삭제되었습니다. (${simulationPlayers.length}명)` 
            });
        } catch (error: any) {
            toast({ 
                title: '삭제 실패', 
                description: error.message || '알 수 없는 오류', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
            setShowDeleteConfirm(false);
        }
    };

    // 전체 상태 확인 함수
    const checkSystemStatus = async (): Promise<StatusReport[]> => {
        const reports: StatusReport[] = [];
        
        try {
            // Firebase에서 최신 데이터 직접 가져오기 (상태 동기화 문제 해결)
            const playersSnapshot = await get(ref(db, 'players'));
            const scoresSnapshot = await get(ref(db, 'scores'));
            const latestPlayersData = playersSnapshot.val() || {};
            const latestScores = scoresSnapshot.val() || {};
            
            // 최신 데이터로 상태 업데이트
            const playersArray = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));
            setAllPlayers(playersArray);
            setAllScores(latestScores);
            
            // 1. 선수 수 확인
            const simulationPlayers = playersArray.filter(p => isSimulationData(p));
            const maleCount = simulationPlayers.filter(p => p.group === '남자부').length;
            const femaleCount = simulationPlayers.filter(p => p.group === '여자부').length;
            
            reports.push({
                step: '선수 등록 상태',
                status: simulationPlayers.length > 0 ? 'success' : 'warning',
                message: `총 ${simulationPlayers.length}명 (남자부: ${maleCount}명, 여자부: ${femaleCount}명)`,
                details: { total: simulationPlayers.length, male: maleCount, female: femaleCount }
            });

            // 2. 1일차 점수 확인
            let day1ScoreCount = 0;
            let day1MaleScoreCount = 0;
            let day1FemaleScoreCount = 0;
            
            const courseA = courses.find(c => c.name === 'A코스' || c.id === 1);
            const courseB = courses.find(c => c.name === 'B코스' || c.id === 2);
            const courseC = courses.find(c => c.name === 'C코스' || c.id === 3);
            const courseD = courses.find(c => c.name === 'D코스' || c.id === 4);

            for (const player of simulationPlayers) {
                if (player.group === '남자부') {
                    const hasA = latestScores[player.id]?.[courseA?.id]?.['1'] !== undefined;
                    const hasB = latestScores[player.id]?.[courseB?.id]?.['1'] !== undefined;
                    if (hasA && hasB) {
                        day1MaleScoreCount++;
                        day1ScoreCount++;
                    }
                } else if (player.group === '여자부') {
                    const hasC = latestScores[player.id]?.[courseC?.id]?.['1'] !== undefined;
                    const hasD = latestScores[player.id]?.[courseD?.id]?.['1'] !== undefined;
                    if (hasC && hasD) {
                        day1FemaleScoreCount++;
                        day1ScoreCount++;
                    }
                }
            }

            reports.push({
                step: '1일차 점수 상태',
                status: day1ScoreCount === simulationPlayers.length ? 'success' : 'warning',
                message: `${day1ScoreCount}/${simulationPlayers.length}명 점수 등록됨 (남자부: ${day1MaleScoreCount}/${maleCount}, 여자부: ${day1FemaleScoreCount}/${femaleCount})`,
                details: { total: day1ScoreCount, expected: simulationPlayers.length, male: day1MaleScoreCount, female: day1FemaleScoreCount }
            });

            // 3. 재편성 상태 확인
            const playersByJo: { [jo: number]: number } = {};
            const malePlayersByJo: { [jo: number]: number } = {};
            const femalePlayersByJo: { [jo: number]: number } = {};
            
            for (const player of simulationPlayers) {
                const jo = player.jo || 0;
                if (jo > 0) {
                    playersByJo[jo] = (playersByJo[jo] || 0) + 1;
                    if (player.group === '남자부') {
                        malePlayersByJo[jo] = (malePlayersByJo[jo] || 0) + 1;
                    } else if (player.group === '여자부') {
                        femalePlayersByJo[jo] = (femalePlayersByJo[jo] || 0) + 1;
                    }
                }
            }
            
            // 재편성 후 예상 조 수: 남자부 38조 + 여자부 38조 = 76조 (각 그룹별로 4명씩)
            const maleJoCount = Math.ceil(maleCount / 4);
            const femaleJoCount = Math.ceil(femaleCount / 4);
            const expectedJos = maleJoCount + femaleJoCount;
            const actualJos = Object.keys(playersByJo).filter(jo => parseInt(jo) > 0).length;
            const actualMaleJos = Object.keys(malePlayersByJo).filter(jo => parseInt(jo) > 0).length;
            const actualFemaleJos = Object.keys(femalePlayersByJo).filter(jo => parseInt(jo) > 0).length;
            const maxPlayersPerJo = Math.max(...Object.values(playersByJo), 0);
            const maxMalePlayersPerJo = Object.keys(malePlayersByJo).length > 0 ? Math.max(...Object.values(malePlayersByJo), 0) : 0;
            const maxFemalePlayersPerJo = Object.keys(femalePlayersByJo).length > 0 ? Math.max(...Object.values(femalePlayersByJo), 0) : 0;
            
            // 재편성 완료 여부: 조 수가 맞고, 조당 최대 4명 이하
            const hasReorganized = actualJos === expectedJos && maxPlayersPerJo <= 4 && maxMalePlayersPerJo <= 4 && maxFemalePlayersPerJo <= 4;

            const joDetails = `전체 조 수: ${actualJos}개 (예상: ${expectedJos}개), 남자부 조 수: ${actualMaleJos}개 (예상: ${maleJoCount}개), 여자부 조 수: ${actualFemaleJos}개 (예상: ${femaleJoCount}개)`;
            const joCountMessage = actualJos === expectedJos 
                ? `✅ ${joDetails}` 
                : `⚠️ ${joDetails}`;
            const playersPerJoMessage = maxPlayersPerJo <= 4 
                ? `조당 최대 인원: ${maxPlayersPerJo}명 (정상)` 
                : `⚠️ 조당 최대 인원: ${maxPlayersPerJo}명 (초과됨, 최대 4명)`;
            
            reports.push({
                step: '재편성 상태',
                status: hasReorganized ? 'success' : 'warning',
                message: `${joCountMessage}\n${playersPerJoMessage}`,
                details: { 
                    actualJos, 
                    expectedJos, 
                    actualMaleJos,
                    expectedMaleJos: maleJoCount,
                    actualFemaleJos,
                    expectedFemaleJos: femaleJoCount,
                    playersByJo,
                    malePlayersByJo,
                    femalePlayersByJo,
                    maxPlayersPerJo,
                    maxMalePlayersPerJo,
                    maxFemalePlayersPerJo
                }
            });

            // 4. 2일차 점수 확인
            let day2ScoreCount = 0;
            let day2MaleScoreCount = 0;
            let day2FemaleScoreCount = 0;

            for (const player of simulationPlayers) {
                if (player.group === '남자부') {
                    const hasC = latestScores[player.id]?.[courseC?.id]?.['1'] !== undefined;
                    const hasD = latestScores[player.id]?.[courseD?.id]?.['1'] !== undefined;
                    if (hasC && hasD) {
                        day2MaleScoreCount++;
                        day2ScoreCount++;
                    }
                } else if (player.group === '여자부') {
                    const hasA = latestScores[player.id]?.[courseA?.id]?.['1'] !== undefined;
                    const hasB = latestScores[player.id]?.[courseB?.id]?.['1'] !== undefined;
                    if (hasA && hasB) {
                        day2FemaleScoreCount++;
                        day2ScoreCount++;
                    }
                }
            }

            reports.push({
                step: '2일차 점수 상태',
                status: day2ScoreCount === simulationPlayers.length ? 'success' : day2ScoreCount > 0 ? 'warning' : 'error',
                message: `${day2ScoreCount}/${simulationPlayers.length}명 점수 등록됨 (남자부: ${day2MaleScoreCount}/${maleCount}, 여자부: ${day2FemaleScoreCount}/${femaleCount})`,
                details: { total: day2ScoreCount, expected: simulationPlayers.length, male: day2MaleScoreCount, female: day2FemaleScoreCount }
            });

            // 5. 전체 코스 점수 확인
            let allCoursesScoreCount = 0;
            for (const player of simulationPlayers) {
                const hasA = latestScores[player.id]?.[courseA?.id]?.['1'] !== undefined;
                const hasB = latestScores[player.id]?.[courseB?.id]?.['1'] !== undefined;
                const hasC = latestScores[player.id]?.[courseC?.id]?.['1'] !== undefined;
                const hasD = latestScores[player.id]?.[courseD?.id]?.['1'] !== undefined;
                
                if (player.group === '남자부' && hasA && hasB && hasC && hasD) {
                    allCoursesScoreCount++;
                } else if (player.group === '여자부' && hasA && hasB && hasC && hasD) {
                    allCoursesScoreCount++;
                }
            }

            reports.push({
                step: '전체 코스 점수 상태',
                status: allCoursesScoreCount === simulationPlayers.length ? 'success' : 'warning',
                message: `${allCoursesScoreCount}/${simulationPlayers.length}명이 ABCD 모든 코스 점수 보유`,
                details: { total: allCoursesScoreCount, expected: simulationPlayers.length }
            });

        } catch (error: any) {
            reports.push({
                step: '상태 확인 오류',
                status: 'error',
                message: error.message || '알 수 없는 오류'
            });
        }

        return reports;
    };

    // 심판 자동실행
    const runRefereeAutoSimulation = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        const reports: StatusReport[] = [];
        setSimulationState({ isRunning: true, currentStep: '심판 자동실행 시작...', progress: 0 });

        try {
            // 기존 시뮬레이션 데이터 삭제 (중복 방지)
            const existingSimulationPlayers = allPlayers.filter(p => isSimulationData(p));
            if (existingSimulationPlayers.length > 0) {
                reports.push({ step: '기존 데이터 삭제', status: 'success', message: `기존 시뮬레이션 데이터 ${existingSimulationPlayers.length}명 삭제 중...` });
                setSimulationState({ isRunning: true, currentStep: '기존 시뮬레이션 데이터 삭제 중...', progress: 0 });
                
                const deleteUpdates: { [key: string]: any } = {};
                for (const player of existingSimulationPlayers) {
                    deleteUpdates[`/players/${player.id}`] = null;
                    if (allScores[player.id]) {
                        deleteUpdates[`/scores/${player.id}`] = null;
                    }
                }
                await update(ref(db), deleteUpdates);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 삭제 동기화 대기
            }
            
            // 1단계: 300명 등록 (남자 150명, 여자 150명)
            reports.push({ step: '1단계: 선수 등록', status: 'success', message: '300명 등록 시작 (남자 150명, 여자 150명)' });
            setSimulationState({ isRunning: true, currentStep: '1단계: 300명 선수 등록 중... (남자 150명, 여자 150명)', progress: 0 });
            await registerPlayers(300);
            // Firebase 데이터 동기화 대기 (더 긴 대기 시간)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 실제로 선수가 등록되었는지 확인
            const playersSnapshot = await get(ref(db, 'players'));
            const playersData = playersSnapshot.val() || {};
            const registeredCount = Object.values(playersData).filter((p: any) => 
                isSimulationData(p)
            ).length;
            
            if (registeredCount === 0) {
                reports.push({
                    step: '선수 등록 확인',
                    status: 'error',
                    message: `선수 등록 실패: 0명 등록됨 (예상: 300명)`
                });
            } else {
                reports.push({
                    step: '선수 등록 확인',
                    status: 'success',
                    message: `선수 등록 성공: ${registeredCount}명 등록됨`
                });
            }
            
            // 상태 확인 (데이터 동기화 후 - 더 긴 대기)
            await new Promise(resolve => setTimeout(resolve, 2000)); // 추가 대기 (상태 동기화 확실히)
            const statusAfterRegister = await checkSystemStatus();
            reports.push(...statusAfterRegister);

            // 2단계: 1일차 심판 점수 등록
            reports.push({ step: '2단계: 1일차 심판 점수 등록', status: 'success', message: '1일차 점수 등록 시작' });
            setSimulationState({ isRunning: true, currentStep: '2단계: 1일차 심판 점수 등록 중...', progress: 0 });
            await registerRefereeScores(1);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 점수 동기화 대기
            
            const statusAfterDay1 = await checkSystemStatus();
            reports.push(...statusAfterDay1);

            // 3단계: 조 재편성
            reports.push({ step: '3단계: 조 재편성', status: 'success', message: '조 재편성 시작' });
            setSimulationState({ isRunning: true, currentStep: '3단계: 조 재편성 중...', progress: 0 });
            await reorganizePlayers();
            await new Promise(resolve => setTimeout(resolve, 2000)); // 재편성 동기화 대기
            
            const statusAfterReorganize = await checkSystemStatus();
            reports.push(...statusAfterReorganize);

            // 4단계: 2일차 심판 점수 등록
            reports.push({ step: '4단계: 2일차 심판 점수 등록', status: 'success', message: '2일차 점수 등록 시작' });
            setSimulationState({ isRunning: true, currentStep: '4단계: 2일차 심판 점수 등록 중...', progress: 0 });
            await registerRefereeScores(2);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 점수 동기화 대기
            
            const finalStatus = await checkSystemStatus();
            reports.push(...finalStatus);

            // 최종 보고서 생성
            const successCount = reports.filter(r => r.status === 'success').length;
            const warningCount = reports.filter(r => r.status === 'warning').length;
            const errorCount = reports.filter(r => r.status === 'error').length;

            // 콘솔에 상세 보고서 출력
            console.log('========================================');
            console.log('심판 자동실행 완료 - 상세 보고서');
            console.log('========================================');
            console.log(`✅ 성공: ${successCount}개`);
            console.log(`⚠️ 경고: ${warningCount}개`);
            console.log(`❌ 오류: ${errorCount}개`);
            console.log('----------------------------------------');
            reports.forEach((r, i) => {
                const icon = r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
                console.log(`${i + 1}. [${icon}] ${r.step}: ${r.message}`);
                if (r.details) {
                    console.log('   상세:', r.details);
                }
            });
            console.log('========================================');

            // 모달로 보고서 표시
            setReportData({
                title: '심판 자동실행 완료',
                reports: reports
            });
            setShowReportModal(true);

            toast({ 
                title: '심판 자동실행 완료', 
                description: `성공: ${successCount}개, 경고: ${warningCount}개, 오류: ${errorCount}개 (상세 보고서는 모달에서 확인하세요)`,
                duration: 5000
            });

        } catch (error: any) {
            reports.push({
                step: '자동실행 오류',
                status: 'error',
                message: error.message || '알 수 없는 오류'
            });
            
            // 콘솔에 오류 출력
            console.error('========================================');
            console.error('심판 자동실행 오류 발생!');
            console.error('========================================');
            console.error('오류 메시지:', error.message || '알 수 없는 오류');
            console.error('오류 스택:', error.stack);
            console.error('========================================');
            
            // 모달로 오류 보고서 표시
            setReportData({
                title: '심판 자동실행 오류',
                reports: reports
            });
            setShowReportModal(true);
            
            toast({ 
                title: '자동실행 실패', 
                description: error.message || '알 수 없는 오류 (상세 보고서는 모달에서 확인하세요)', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    // 조장 자동실행
    const runCaptainAutoSimulation = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        const reports: StatusReport[] = [];
        setSimulationState({ isRunning: true, currentStep: '조장 자동실행 시작...', progress: 0 });

        try {
            // 기존 시뮬레이션 데이터 삭제 (중복 방지)
            const existingSimulationPlayers = allPlayers.filter(p => isSimulationData(p));
            if (existingSimulationPlayers.length > 0) {
                reports.push({ step: '기존 데이터 삭제', status: 'success', message: `기존 시뮬레이션 데이터 ${existingSimulationPlayers.length}명 삭제 중...` });
                setSimulationState({ isRunning: true, currentStep: '기존 시뮬레이션 데이터 삭제 중...', progress: 0 });
                
                const deleteUpdates: { [key: string]: any } = {};
                for (const player of existingSimulationPlayers) {
                    deleteUpdates[`/players/${player.id}`] = null;
                    if (allScores[player.id]) {
                        deleteUpdates[`/scores/${player.id}`] = null;
                    }
                }
                await update(ref(db), deleteUpdates);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 삭제 동기화 대기
            }
            
            // 1단계: 300명 등록 (남자 150명, 여자 150명)
            reports.push({ step: '1단계: 선수 등록', status: 'success', message: '300명 등록 시작 (남자 150명, 여자 150명)' });
            setSimulationState({ isRunning: true, currentStep: '1단계: 300명 선수 등록 중... (남자 150명, 여자 150명)', progress: 0 });
            await registerPlayers(300);
            // Firebase 데이터 동기화 대기 (더 긴 대기 시간)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 실제로 선수가 등록되었는지 확인
            const playersSnapshot = await get(ref(db, 'players'));
            const playersData = playersSnapshot.val() || {};
            const registeredCount = Object.values(playersData).filter((p: any) => 
                isSimulationData(p)
            ).length;
            
            if (registeredCount === 0) {
                reports.push({
                    step: '선수 등록 확인',
                    status: 'error',
                    message: `선수 등록 실패: 0명 등록됨 (예상: 300명)`
                });
            } else {
                reports.push({
                    step: '선수 등록 확인',
                    status: 'success',
                    message: `선수 등록 성공: ${registeredCount}명 등록됨`
                });
            }
            
            // 상태 확인 (데이터 동기화 후 - 더 긴 대기)
            await new Promise(resolve => setTimeout(resolve, 2000)); // 추가 대기 (상태 동기화 확실히)
            const statusAfterRegister = await checkSystemStatus();
            reports.push(...statusAfterRegister);

            // 2단계: 1일차 조장 점수 등록
            reports.push({ step: '2단계: 1일차 조장 점수 등록', status: 'success', message: '1일차 점수 등록 시작' });
            setSimulationState({ isRunning: true, currentStep: '2단계: 1일차 조장 점수 등록 중...', progress: 0 });
            await registerCaptainScores(1);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 점수 동기화 대기
            
            const statusAfterDay1 = await checkSystemStatus();
            reports.push(...statusAfterDay1);

            // 3단계: 조 재편성
            reports.push({ step: '3단계: 조 재편성', status: 'success', message: '조 재편성 시작' });
            setSimulationState({ isRunning: true, currentStep: '3단계: 조 재편성 중...', progress: 0 });
            await reorganizePlayers();
            await new Promise(resolve => setTimeout(resolve, 2000)); // 재편성 동기화 대기
            
            const statusAfterReorganize = await checkSystemStatus();
            reports.push(...statusAfterReorganize);

            // 4단계: 2일차 조장 점수 등록
            reports.push({ step: '4단계: 2일차 조장 점수 등록', status: 'success', message: '2일차 점수 등록 시작' });
            setSimulationState({ isRunning: true, currentStep: '4단계: 2일차 조장 점수 등록 중...', progress: 0 });
            await registerCaptainScores(2);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 점수 동기화 대기
            
            const finalStatus = await checkSystemStatus();
            reports.push(...finalStatus);

            // 최종 보고서 생성
            const successCount = reports.filter(r => r.status === 'success').length;
            const warningCount = reports.filter(r => r.status === 'warning').length;
            const errorCount = reports.filter(r => r.status === 'error').length;

            // 콘솔에 상세 보고서 출력
            console.log('========================================');
            console.log('조장 자동실행 완료 - 상세 보고서');
            console.log('========================================');
            console.log(`✅ 성공: ${successCount}개`);
            console.log(`⚠️ 경고: ${warningCount}개`);
            console.log(`❌ 오류: ${errorCount}개`);
            console.log('----------------------------------------');
            reports.forEach((r, i) => {
                const icon = r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
                console.log(`${i + 1}. [${icon}] ${r.step}: ${r.message}`);
                if (r.details) {
                    console.log('   상세:', r.details);
                }
            });
            console.log('========================================');

            // 모달로 보고서 표시
            setReportData({
                title: '조장 자동실행 완료',
                reports: reports
            });
            setShowReportModal(true);

            toast({ 
                title: '조장 자동실행 완료', 
                description: `성공: ${successCount}개, 경고: ${warningCount}개, 오류: ${errorCount}개 (상세 보고서는 모달에서 확인하세요)`,
                duration: 5000
            });

        } catch (error: any) {
            reports.push({
                step: '자동실행 오류',
                status: 'error',
                message: error.message || '알 수 없는 오류'
            });
            
            // 콘솔에 오류 출력
            console.error('========================================');
            console.error('조장 자동실행 오류 발생!');
            console.error('========================================');
            console.error('오류 메시지:', error.message || '알 수 없는 오류');
            console.error('오류 스택:', error.stack);
            console.error('========================================');
            
            // 모달로 오류 보고서 표시
            setReportData({
                title: '조장 자동실행 오류',
                reports: reports
            });
            setShowReportModal(true);
            
            toast({ 
                title: '자동실행 실패', 
                description: error.message || '알 수 없는 오류 (상세 보고서는 모달에서 확인하세요)', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    // 일괄 자동실행
    const runBatchAutoSimulation = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        const reports: StatusReport[] = [];
        setSimulationState({ isRunning: true, currentStep: '일괄 자동실행 시작...', progress: 0 });

        try {
            // 기존 시뮬레이션 데이터 삭제 (중복 방지)
            const existingSimulationPlayers = allPlayers.filter(p => isSimulationData(p));
            if (existingSimulationPlayers.length > 0) {
                reports.push({ step: '기존 데이터 삭제', status: 'success', message: `기존 시뮬레이션 데이터 ${existingSimulationPlayers.length}명 삭제 중...` });
                setSimulationState({ isRunning: true, currentStep: '기존 시뮬레이션 데이터 삭제 중...', progress: 0 });
                
                const deleteUpdates: { [key: string]: any } = {};
                for (const player of existingSimulationPlayers) {
                    deleteUpdates[`/players/${player.id}`] = null;
                    if (allScores[player.id]) {
                        deleteUpdates[`/scores/${player.id}`] = null;
                    }
                }
                await update(ref(db), deleteUpdates);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 삭제 동기화 대기
            }
            
            // 1단계: 300명 등록 (남자 150명, 여자 150명)
            reports.push({ step: '1단계: 선수 등록', status: 'success', message: '300명 등록 시작 (남자 150명, 여자 150명)' });
            setSimulationState({ isRunning: true, currentStep: '1단계: 300명 선수 등록 중... (남자 150명, 여자 150명)', progress: 0 });
            await registerPlayers(300);
            // Firebase 데이터 동기화 대기 (더 긴 대기 시간)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 실제로 선수가 등록되었는지 확인
            const playersSnapshot = await get(ref(db, 'players'));
            const playersData = playersSnapshot.val() || {};
            const registeredCount = Object.values(playersData).filter((p: any) => 
                isSimulationData(p)
            ).length;
            
            if (registeredCount === 0) {
                reports.push({
                    step: '선수 등록 확인',
                    status: 'error',
                    message: `선수 등록 실패: 0명 등록됨 (예상: 300명)`
                });
            } else {
                reports.push({
                    step: '선수 등록 확인',
                    status: 'success',
                    message: `선수 등록 성공: ${registeredCount}명 등록됨`
                });
            }
            
            // 상태 확인 (데이터 동기화 후 - 더 긴 대기)
            await new Promise(resolve => setTimeout(resolve, 2000)); // 추가 대기 (상태 동기화 확실히)
            const statusAfterRegister = await checkSystemStatus();
            reports.push(...statusAfterRegister);

            // 2단계: 1일차 일괄 점수 등록
            reports.push({ step: '2단계: 1일차 일괄 점수 등록', status: 'success', message: '1일차 일괄 점수 등록 시작' });
            setSimulationState({ isRunning: true, currentStep: '2단계: 1일차 일괄 점수 등록 중...', progress: 0 });
            await registerBatchScores(1);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 점수 동기화 대기
            
            const statusAfterDay1 = await checkSystemStatus();
            reports.push(...statusAfterDay1);

            // 3단계: 조 재편성
            reports.push({ step: '3단계: 조 재편성', status: 'success', message: '조 재편성 시작' });
            setSimulationState({ isRunning: true, currentStep: '3단계: 조 재편성 중...', progress: 0 });
            await reorganizePlayers();
            await new Promise(resolve => setTimeout(resolve, 2000)); // 재편성 동기화 대기
            
            const statusAfterReorganize = await checkSystemStatus();
            reports.push(...statusAfterReorganize);

            // 4단계: 2일차 일괄 점수 등록
            reports.push({ step: '4단계: 2일차 일괄 점수 등록', status: 'success', message: '2일차 일괄 점수 등록 시작' });
            setSimulationState({ isRunning: true, currentStep: '4단계: 2일차 일괄 점수 등록 중...', progress: 0 });
            await registerBatchScores(2);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 점수 동기화 대기
            
            const finalStatus = await checkSystemStatus();
            reports.push(...finalStatus);

            // 최종 보고서 생성
            const successCount = reports.filter(r => r.status === 'success').length;
            const warningCount = reports.filter(r => r.status === 'warning').length;
            const errorCount = reports.filter(r => r.status === 'error').length;

            // 콘솔에 상세 보고서 출력
            console.log('========================================');
            console.log('일괄 자동실행 완료 - 상세 보고서');
            console.log('========================================');
            console.log(`✅ 성공: ${successCount}개`);
            console.log(`⚠️ 경고: ${warningCount}개`);
            console.log(`❌ 오류: ${errorCount}개`);
            console.log('----------------------------------------');
            reports.forEach((r, i) => {
                const icon = r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
                console.log(`${i + 1}. [${icon}] ${r.step}: ${r.message}`);
                if (r.details) {
                    console.log('   상세:', r.details);
                }
            });
            console.log('========================================');

            // 모달로 보고서 표시
            setReportData({
                title: '일괄 자동실행 완료',
                reports: reports
            });
            setShowReportModal(true);

            toast({ 
                title: '일괄 자동실행 완료', 
                description: `성공: ${successCount}개, 경고: ${warningCount}개, 오류: ${errorCount}개 (상세 보고서는 모달에서 확인하세요)`,
                duration: 5000
            });

        } catch (error: any) {
            reports.push({
                step: '자동실행 오류',
                status: 'error',
                message: error.message || '알 수 없는 오류'
            });
            
            // 콘솔에 오류 출력
            console.error('========================================');
            console.error('일괄 자동실행 오류 발생!');
            console.error('========================================');
            console.error('오류 메시지:', error.message || '알 수 없는 오류');
            console.error('오류 스택:', error.stack);
            console.error('========================================');
            
            // 모달로 오류 보고서 표시
            setReportData({
                title: '일괄 자동실행 오류',
                reports: reports
            });
            setShowReportModal(true);
            
            toast({ 
                title: '자동실행 실패', 
                description: error.message || '알 수 없는 오류 (상세 보고서는 모달에서 확인하세요)', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    const simulationPlayersCount = allPlayers.filter(p => isSimulationData(p)).length;

    return (
        <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-purple-600" />
                    자동 시뮬레이션 도구
                </CardTitle>
                <CardDescription>
                    대회 시뮬레이션을 위한 자동화 도구입니다. 시뮬레이션 데이터는 기존 데이터와 분리되어 관리됩니다.
                    {simulationPlayersCount > 0 && (
                        <span className="block mt-1 text-purple-600 font-semibold">
                            현재 시뮬레이션 선수: {simulationPlayersCount}명
                        </span>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {simulationState.isRunning && (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-2 mb-2">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            <span className="font-semibold text-blue-900">{simulationState.currentStep}</span>
                        </div>
                        {simulationState.progress > 0 && (
                            <div className="w-full bg-blue-200 rounded-full h-2">
                                <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${simulationState.progress}%` }}
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <Button
                        onClick={() => registerPlayers(50)}
                        disabled={simulationState.isRunning}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        <Users className="mr-2 h-4 w-4" />
                        50명 등록
                    </Button>
                    <Button
                        onClick={() => registerPlayers(100)}
                        disabled={simulationState.isRunning}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        <Users className="mr-2 h-4 w-4" />
                        100명 등록
                    </Button>
                    <Button
                        onClick={() => registerPlayers(300)}
                        disabled={simulationState.isRunning}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        <Users className="mr-2 h-4 w-4" />
                        300명 등록
                    </Button>
                    <Button
                        onClick={() => registerRefereeScores(1)}
                        disabled={simulationState.isRunning}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        <UserCheck className="mr-2 h-4 w-4" />
                        심판 점수 등록
                        <span className="ml-2 text-xs">(1일차)</span>
                    </Button>
                    <Button
                        onClick={() => registerRefereeScores(2)}
                        disabled={simulationState.isRunning}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        <UserCheck className="mr-2 h-4 w-4" />
                        심판 점수 등록
                        <span className="ml-2 text-xs">(2일차)</span>
                    </Button>
                    <Button
                        onClick={() => registerCaptainScores(1)}
                        disabled={simulationState.isRunning}
                        className="bg-orange-600 hover:bg-orange-700"
                    >
                        <Trophy className="mr-2 h-4 w-4" />
                        조장 점수 등록
                        <span className="ml-2 text-xs">(1일차)</span>
                    </Button>
                    <Button
                        onClick={() => registerCaptainScores(2)}
                        disabled={simulationState.isRunning}
                        className="bg-orange-600 hover:bg-orange-700"
                    >
                        <Trophy className="mr-2 h-4 w-4" />
                        조장 점수 등록
                        <span className="ml-2 text-xs">(2일차)</span>
                    </Button>
                    <Button
                        onClick={() => registerBatchScores(1)}
                        disabled={simulationState.isRunning}
                        className="bg-cyan-600 hover:bg-cyan-700"
                    >
                        <Trophy className="mr-2 h-4 w-4" />
                        일괄 점수 등록
                        <span className="ml-2 text-xs">(1일차)</span>
                    </Button>
                    <Button
                        onClick={() => registerBatchScores(2)}
                        disabled={simulationState.isRunning}
                        className="bg-cyan-600 hover:bg-cyan-700"
                    >
                        <Trophy className="mr-2 h-4 w-4" />
                        일괄 점수 등록
                        <span className="ml-2 text-xs">(2일차)</span>
                    </Button>
                    <Button
                        onClick={reorganizePlayers}
                        disabled={simulationState.isRunning}
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        재편성 선수 등록
                    </Button>
                    <Button
                        onClick={runRefereeAutoSimulation}
                        disabled={simulationState.isRunning}
                        className="bg-indigo-600 hover:bg-indigo-700 col-span-full"
                    >
                        <Trophy className="mr-2 h-4 w-4" />
                        심판 자동실행 (300명 등록 → 1일차 → 재편성 → 2일차)
                    </Button>
                    <Button
                        onClick={runCaptainAutoSimulation}
                        disabled={simulationState.isRunning}
                        className="bg-teal-600 hover:bg-teal-700 col-span-full"
                    >
                        <Trophy className="mr-2 h-4 w-4" />
                        조장 자동실행 (300명 등록 → 1일차 → 재편성 → 2일차)
                    </Button>
                    <Button
                        onClick={runBatchAutoSimulation}
                        disabled={simulationState.isRunning}
                        className="bg-cyan-600 hover:bg-cyan-700 col-span-full"
                    >
                        <Trophy className="mr-2 h-4 w-4" />
                        일괄 자동실행 (300명 등록 → 1일차 → 재편성 → 2일차)
                    </Button>
                    <Button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={simulationState.isRunning || simulationPlayersCount === 0}
                        variant="destructive"
                        className="col-span-full md:col-span-1"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        시뮬레이션 데이터 삭제
                    </Button>
                </div>

                <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm text-yellow-800">
                    <p className="font-semibold mb-1">📋 시뮬레이션 가이드:</p>
                    <ol className="list-decimal list-inside space-y-1">
                        <li>50명/100명/300명 등록: 남자부와 여자부 선수를 자동 등록합니다.</li>
                        <li>심판 점수 등록: 1일차 점수를 입력합니다 (남자부: AB코스, 여자부: CD코스).</li>
                        <li>조장 점수 등록 (1일차): 1일차 점수를 입력합니다 (남자부: AB코스, 여자부: CD코스).</li>
                        <li>일괄 점수 등록 (1일차): 1일차 점수를 일괄 입력 모드로 입력합니다 (점수 로그 포함).</li>
                        <li>재편성 선수 등록: 1일차 순위대로 4명씩 조를 재편성합니다.</li>
                        <li>조장 점수 등록 (2일차): 2일차 점수를 입력합니다 (남자부: CD코스, 여자부: AB코스).</li>
                        <li>일괄 점수 등록 (2일차): 2일차 점수를 일괄 입력 모드로 입력합니다 (점수 로그 포함).</li>
                    </ol>
                </div>
            </CardContent>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>시뮬레이션 데이터 삭제 확인</AlertDialogTitle>
                        <AlertDialogDescription>
                            시뮬레이션으로 생성된 모든 선수와 점수 데이터가 삭제됩니다. 
                            이 작업은 되돌릴 수 없습니다. 정말 삭제하시겠습니까?
                            <br />
                            <span className="font-semibold text-red-600">
                                (삭제될 선수: {simulationPlayersCount}명)
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={deleteSimulationData}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            삭제
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 보고서 모달 */}
            <AlertDialog open={showReportModal} onOpenChange={setShowReportModal}>
                <AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{reportData?.title || '실행 보고서'}</AlertDialogTitle>
                    </AlertDialogHeader>
                    {reportData && (
                        <div className="mt-4 space-y-2">
                            <div className="flex gap-4 text-sm font-semibold">
                                <span className="text-green-600">✅ 성공: {reportData.reports.filter(r => r.status === 'success').length}개</span>
                                <span className="text-yellow-600">⚠️ 경고: {reportData.reports.filter(r => r.status === 'warning').length}개</span>
                                <span className="text-red-600">❌ 오류: {reportData.reports.filter(r => r.status === 'error').length}개</span>
                            </div>
                            <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto">
                                {reportData.reports.map((r, i) => {
                                    const icon = r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
                                    const colorClass = r.status === 'success' ? 'text-green-700' : r.status === 'warning' ? 'text-yellow-700' : 'text-red-700';
                                    const bgClass = r.status === 'success' ? 'bg-green-50 border-green-200' : r.status === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
                                    return (
                                        <div key={i} className={`p-3 rounded border ${bgClass}`}>
                                            <div className="flex items-start gap-2">
                                                <span className="text-lg">{icon}</span>
                                                <div className="flex-1">
                                                    <div className={`font-semibold ${colorClass}`}>{r.step}</div>
                                                    <div className="text-sm text-gray-700 mt-1">{r.message}</div>
                                                    {r.details && (
                                                        <details className="mt-2">
                                                            <summary className="text-xs text-gray-500 cursor-pointer">상세 정보 보기</summary>
                                                            <pre className="text-xs text-gray-600 mt-1 p-2 bg-white rounded border overflow-auto">
                                                                {JSON.stringify(r.details, null, 2)}
                                                            </pre>
                                                        </details>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => setShowReportModal(false)}>
                            닫기
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

