"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue, set, push, update, remove, get } from 'firebase/database';
import { Users, Trash2, Trophy, UserCheck, RotateCcw, Loader2 } from 'lucide-react';

interface SimulationState {
    isRunning: boolean;
    currentStep: string;
    progress: number;
}

export default function SimulationTool() {
    const { toast } = useToast();
    const [simulationState, setSimulationState] = useState<SimulationState>({
        isRunning: false,
        currentStep: '',
        progress: 0
    });
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
                updates[`/tournaments/current/groups/${maleGroupName}`] = {
                    name: maleGroupName,
                    type: 'individual',
                    courses: { [courseA.id]: true, [courseB.id]: true, [courseC.id]: true, [courseD.id]: true }
                };
            }
            if (!groupsData[femaleGroupName]) {
                updates[`/tournaments/current/groups/${femaleGroupName}`] = {
                    name: femaleGroupName,
                    type: 'individual',
                    courses: { [courseC.id]: true, [courseD.id]: true, [courseA.id]: true, [courseB.id]: true }
                };
            }

            // 선수 등록
            const maleCount = Math.floor(count / 2);
            const femaleCount = count - maleCount;
            const playersPerJo = 4; // 조당 4명

            // 남자부 선수 등록
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

            // 여자부 선수 등록
            for (let i = 0; i < femaleCount; i++) {
                const jo = Math.floor(i / playersPerJo) + 1;
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

    // 심판 점수 등록 (1일차)
    const registerRefereeScores = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ isRunning: true, currentStep: '심판 점수 등록 중...', progress: 0 });

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

            const maleGroupPlayers = allPlayers.filter(p => 
                p.group === '남자부' && isSimulationData(p)
            );
            const femaleGroupPlayers = allPlayers.filter(p => 
                p.group === '여자부' && isSimulationData(p)
            );

            const updates: { [key: string]: any } = {};
            let progress = 0;
            const total = maleGroupPlayers.length + femaleGroupPlayers.length;

            // 남자부: AB코스 점수 입력
            for (const player of maleGroupPlayers) {
                for (const course of [courseA, courseB]) {
                    for (let hole = 1; hole <= 9; hole++) {
                        const par = course.pars?.[hole - 1] || 4;
                        // 파 기준 ±2타 범위에서 랜덤 점수 생성
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

            // 여자부: CD코스 점수 입력
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
                    currentStep: `여자부 점수 입력 중... (${progress}/${total})`, 
                    progress: (progress / total) * 100 
                });
            }

            await update(ref(db), updates);
            
            toast({ 
                title: '점수 등록 완료', 
                description: `1일차 점수가 등록되었습니다. (남자부: AB코스, 여자부: CD코스)` 
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

            const maleGroupPlayers = allPlayers.filter(p => 
                p.group === '남자부' && isSimulationData(p)
            );
            const femaleGroupPlayers = allPlayers.filter(p => 
                p.group === '여자부' && isSimulationData(p)
            );

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
                        const hasScore = allScores[player.id]?.[course.id]?.['1'];
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
                        const hasScore = allScores[player.id]?.[course.id]?.['1'];
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
                        const hasScore = allScores[player.id]?.[course.id]?.['1'];
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
                        const hasScore = allScores[player.id]?.[course.id]?.['1'];
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

            if (Object.keys(updates).length > 0) {
                await update(ref(db), updates);
            }
            
            const message = skippedCount > 0 
                ? `${day}일차 조장 점수가 등록되었습니다. (이미 점수가 있는 ${skippedCount}개 코스는 스킵됨)`
                : `${day}일차 조장 점수가 등록되었습니다.`;
            
            toast({ 
                title: '점수 등록 완료', 
                description: message 
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

    // 재편성 선수 등록 (1일차 순위대로 4명씩 조 재편성)
    const reorganizePlayers = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ isRunning: true, currentStep: '선수 재편성 중...', progress: 0 });

        try {
            // 1일차 순위 계산 (1일차 점수만 사용)
            const maleGroupPlayers = allPlayers.filter(p => 
                p.group === '남자부' && isSimulationData(p)
            );
            const femaleGroupPlayers = allPlayers.filter(p => 
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
                            const score = allScores[player.id]?.[courseId]?.[String(hole)];
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

            // 남자부 재편성
            rankedMales.forEach((player, index) => {
                const newJo = Math.floor(index / playersPerJo) + 1;
                updates[`/players/${player.id}/jo`] = newJo;
            });

            // 여자부 재편성
            rankedFemales.forEach((player, index) => {
                const newJo = Math.floor(index / playersPerJo) + 1;
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
            const simulationPlayers = allPlayers.filter(p => isSimulationData(p));
            const updates: { [key: string]: any } = {};

            // 선수 삭제
            for (const player of simulationPlayers) {
                updates[`/players/${player.id}`] = null;
                // 점수 삭제
                if (allScores[player.id]) {
                    updates[`/scores/${player.id}`] = null;
                }
            }

            // 그룹 삭제 (시뮬레이션 그룹만)
            if (groupsData['남자부'] || groupsData['여자부']) {
                // 그룹에 시뮬레이션 선수만 있는 경우에만 삭제
                const maleGroupHasRealPlayers = allPlayers.some(p => 
                    p.group === '남자부' && !isSimulationData(p)
                );
                const femaleGroupHasRealPlayers = allPlayers.some(p => 
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
                        onClick={registerRefereeScores}
                        disabled={simulationState.isRunning}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        <UserCheck className="mr-2 h-4 w-4" />
                        심판 점수 등록
                        <span className="ml-2 text-xs">(1일차)</span>
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
                        onClick={reorganizePlayers}
                        disabled={simulationState.isRunning}
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        재편성 선수 등록
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
                        <li>재편성 선수 등록: 1일차 순위대로 4명씩 조를 재편성합니다.</li>
                        <li>조장 점수 등록 (2일차): 2일차 점수를 입력합니다 (남자부: CD코스, 여자부: AB코스).</li>
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
        </Card>
    );
}

