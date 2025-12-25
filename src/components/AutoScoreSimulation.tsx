"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { db, ensureAuthenticated } from '@/lib/firebase';
import { ref, get, set, onValue } from 'firebase/database';
import { logScoreChange, invalidatePlayerLogCache } from '@/lib/scoreLogs';
import { Loader2 } from 'lucide-react';

interface SimulationState {
    isRunning: boolean;
    currentStep: string;
    progress: number;
}

/**
 * 자동 점수 입력 시뮬레이션 도구
 * 기존 코드와 완전히 분리된 독립 컴포넌트
 * 실제 심판/조장/일괄입력 페이지와 동일한 비즈니스 로직을 복제하여 구현
 * 삭제 시에도 기존 코드에 영향 없음
 */
export default function AutoScoreSimulation() {
    const { toast } = useToast();
    const [simulationState, setSimulationState] = useState<SimulationState>({
        isRunning: false,
        currentStep: '',
        progress: 0
    });
    const [showConfirmDialog, setShowConfirmDialog] = useState<{
        open: boolean;
        type: string;
        day: 1 | 2;
    }>({
        open: false,
        type: '',
        day: 1
    });

    const [courses, setCourses] = useState<any[]>([]);
    const [groupsData, setGroupsData] = useState<any>({});

    // Firebase 데이터 로드
    useEffect(() => {
        if (!db) return;
        
        const tournamentRef = ref(db, 'tournaments/current');
        
        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            setGroupsData(data.groups || {});
            setCourses(data.courses ? Object.values(data.courses) : []);
        });
        
        return () => {
            unsubTournament();
        };
    }, []);

    /**
     * 실제 심판 페이지와 동일한 방식으로 점수 저장
     * 심판 페이지의 handleConfirmSave 로직을 복제
     */
    const saveScoreAsReferee = async (
        playerId: string,
        courseId: string,
        hole: number,
        score: number,
        prevScore: number | null,
        allScores: any,
        day: number
    ): Promise<void> => {
        if (!db) return;

        // Firebase 인증 확인 (실제 심판 페이지와 동일)
        const isAuthenticated = await ensureAuthenticated();
        if (!isAuthenticated) {
            throw new Error('Firebase 인증에 실패했습니다.');
        }

        // 시뮬레이션은 항상 모바일 환경으로 동작 (실제 점수 입력이 모두 모바일에서 이루어지므로)
        const isMobile = true;
        const maxRetries = 3; // 모바일 기준 재시도 횟수
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                const dbInstance = db as import('firebase/database').Database;
                const scorePath = `/scores/${playerId}/${courseId}/${hole}`;
                const scoreRef = ref(dbInstance, scorePath);

                // 모바일에서는 잠시 대기 후 재시도 (실제 심판 페이지와 동일)
                if (isMobile && attempt > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }

                // 점수 저장 (실제 심판 페이지와 동일)
                await set(scoreRef, score);

                // 점수 변경 로그 기록 (실제 심판 페이지와 동일)
                if (prevScore !== score) {
                    const refereeId = `시뮬레이션_심판${day}일차`;
                    await logScoreChange({
                        matchId: 'tournaments/current',
                        playerId: playerId,
                        scoreType: 'holeScore',
                        holeNumber: hole,
                        oldValue: prevScore !== null && prevScore !== undefined ? prevScore : 0,
                        newValue: score !== null && score !== undefined ? score : 0,
                        modifiedBy: refereeId,
                        modifiedByType: 'judge',
                        comment: `자동 시뮬레이션 - 코스: ${courseId}`,
                        courseId: String(courseId),
                    });
                }

                // 로그 캐시 무효화 (실제 심판 페이지에서는 refreshScoresData 호출)
                invalidatePlayerLogCache(playerId);

                // 성공하면 루프 종료
                break;

            } catch (e: any) {
                attempt++;

                // Permission denied 오류 처리 (실제 심판 페이지와 동일)
                const isPermissionError = e?.code === 'PERMISSION_DENIED' ||
                    e?.message?.includes('permission_denied') ||
                    e?.message?.includes('Permission denied');

                if (isPermissionError && attempt < maxRetries && isMobile) {
                    continue;
                }

                // 최종 실패
                throw e;
            }
        }
    };

    /**
     * 실제 조장 페이지와 동일한 방식으로 점수 저장
     * 조장 페이지의 saveToFirebase 로직을 복제
     */
    const saveScoreAsCaptain = async (
        playerId: string,
        courseId: string,
        hole: number,
        score: number,
        prevScore: number | null,
        playerGroup: string,
        playerJo: number,
        day: number,
        isBatchMode: boolean
    ): Promise<void> => {
        if (!db) return;

        // Firebase 인증 확인 (재인증 시도 포함, 실제 조장 페이지와 동일)
        let isAuthenticated = await ensureAuthenticated();
        if (!isAuthenticated) {
            // 재인증 시도 (최대 2회, 실제 조장 페이지와 동일)
            for (let authRetry = 0; authRetry < 2; authRetry++) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (authRetry + 1)));
                isAuthenticated = await ensureAuthenticated();
                if (isAuthenticated) break;
            }
            
            if (!isAuthenticated) {
                throw new Error('Firebase 인증에 실패했습니다.');
            }
        }

        // 시뮬레이션은 항상 모바일 환경으로 동작 (실제 점수 입력이 모두 모바일에서 이루어지므로)
        const isMobile = true;
        const maxRetries = 5; // 모바일 기준 재시도 횟수
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                const dbInstance = db as any;
                const scoreRef = ref(dbInstance, `/scores/${playerId}/${courseId}/${hole}`);

                // 재시도 시 대기 (실제 조장 페이지와 동일)
                if (attempt > 0) {
                    const delay = isMobile ? 1500 * attempt : 1000 * attempt;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                // 점수 저장 (실제 조장 페이지와 동일)
                await set(scoreRef, score);

                // 점수 변경 로그 기록 (실제 조장 페이지와 동일)
                await logScoreChange({
                    matchId: "tournaments/current",
                    playerId,
                    scoreType: "holeScore",
                    holeNumber: hole,
                    oldValue: typeof prevScore === "number" ? prevScore : 0,
                    newValue: score,
                    modifiedBy: isBatchMode ? `시뮬레이션_일괄입력${day}일차` : `시뮬레이션_조장${day}일차`,
                    modifiedByType: "captain",
                    comment: isBatchMode 
                        ? `일괄 입력 모드 시뮬레이션 - 코스: ${courseId}, 그룹: ${playerGroup}, 조: ${playerJo}`
                        : `자동 시뮬레이션 - 코스: ${courseId}, 그룹: ${playerGroup}, 조: ${playerJo}`,
                    courseId: String(courseId),
                });

                // 실시간 업데이트를 위한 로그 캐시 무효화 (실제 조장 페이지와 동일)
                invalidatePlayerLogCache(playerId);

                // 외부 전광판에 갱신 신호 전달 (실제 조장 페이지와 동일)
                try {
                    if (typeof window !== 'undefined') {
                        const evt = new CustomEvent('scoreUpdated', { 
                            detail: { playerId, courseId: String(courseId), hole, by: 'captain' } 
                        });
                        window.dispatchEvent(evt);
                    }
                } catch { }

                // 성공하면 루프 종료
                break;

            } catch (e: any) {
                attempt++;

                // Permission denied 오류 처리 (실제 조장 페이지와 동일)
                const isPermissionError = e?.code === 'PERMISSION_DENIED' ||
                    e?.message?.includes('permission_denied') ||
                    e?.message?.includes('Permission denied') ||
                    e?.message?.includes('auth') ||
                    e?.message?.includes('authentication');

                if (isPermissionError && attempt < maxRetries) {
                    // 인증 재시도 (실제 조장 페이지와 동일)
                    const reAuthSuccess = await ensureAuthenticated(2, 500);
                    if (reAuthSuccess) {
                        continue;
                    }
                }
                
                // 네트워크 오류도 재시도 (실제 조장 페이지와 동일)
                const isNetworkError = e?.code === 'network-request-failed' ||
                    e?.message?.includes('network') ||
                    e?.message?.includes('timeout');
                
                if (isNetworkError && attempt < maxRetries) {
                    continue;
                }

                // 최종 실패
                throw e;
            }
        }
    };

    // 심판 점수 입력 시뮬레이션
    const simulateRefereeScores = async (day: 1 | 2) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ 
            isRunning: true, 
            currentStep: `심판 ${day}일차 점수 입력 시뮬레이션 중...`, 
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

            // Firebase에서 최신 선수 데이터 가져오기
            const playersSnapshot = await get(ref(db, 'players'));
            const latestPlayersData = playersSnapshot.val() || {};
            const latestPlayers = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));
            
            // 모든 개인전 선수 필터링 (엑셀 업로드 선수 포함)
            const allIndividualPlayers = latestPlayers.filter(p => p.type === 'individual');
            
            if (allIndividualPlayers.length === 0) {
                toast({ 
                    title: '오류', 
                    description: '등록된 선수가 없습니다.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // Firebase에서 최신 점수 데이터 가져오기
            const scoresSnapshot = await get(ref(db, 'scores'));
            const latestScores = scoresSnapshot.val() || {};

            // 1일차: A, B 코스 / 2일차: C, D 코스
            const targetCourses = day === 1 ? [courseA, courseB] : [courseC, courseD];

            // 모든 점수 저장 작업을 배열로 수집
            const scoreTasks: Array<() => Promise<void>> = [];
            const totalPlayers = allIndividualPlayers.length;
            const totalExpectedScores = totalPlayers * targetCourses.length * 9;

            for (const player of allIndividualPlayers) {
                for (const course of targetCourses) {
                    // 이미 점수가 있는 경우 스킵
                    const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                    if (hasScore) continue;

                    for (let hole = 1; hole <= 9; hole++) {
                        const par = course.pars?.[hole - 1] || 4;
                        const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                        const prevScore = latestScores[player.id]?.[course.id]?.[String(hole)] ?? null;

                        // 점수 저장 작업을 배열에 추가
                        scoreTasks.push(() => 
                            saveScoreAsReferee(
                                player.id,
                                String(course.id),
                                hole,
                                score,
                                prevScore,
                                latestScores,
                                day
                            ).catch((error: any) => {
                                console.error(`점수 저장 실패 (선수: ${player.id}, 코스: ${course.id}, 홀: ${hole}):`, error);
                            })
                        );
                    }
                }
            }

            // 배치 단위로 병렬 처리 (배치 크기: 20개, 배치 간 지연: 50ms)
            const BATCH_SIZE = 20;
            const BATCH_DELAY = 50;
            let processedScores = 0;
            let totalScores = 0;

            for (let i = 0; i < scoreTasks.length; i += BATCH_SIZE) {
                const batch = scoreTasks.slice(i, i + BATCH_SIZE);
                
                // 현재 배치를 병렬로 실행
                const results = await Promise.allSettled(batch.map(task => task()));
                const successCount = results.filter(r => r.status === 'fulfilled').length;
                totalScores += successCount;
                processedScores += batch.length;

                // 진행률 업데이트
                setSimulationState({ 
                    isRunning: true, 
                    currentStep: `심판 ${day}일차 점수 입력 중... (${processedScores}/${scoreTasks.length}개 완료)`, 
                    progress: (processedScores / totalExpectedScores) * 100 
                });

                // 마지막 배치가 아니면 지연 (실제 환경 모방)
                if (i + BATCH_SIZE < scoreTasks.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }
            
            toast({ 
                title: '완료', 
                description: `심판 ${day}일차 점수 입력이 완료되었습니다. (${totalScores}개 점수 등록)` 
            });
        } catch (error: any) {
            toast({ 
                title: '오류', 
                description: error.message || '알 수 없는 오류', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    // 조장 점수 입력 시뮬레이션
    const simulateCaptainScores = async (day: 1 | 2) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ 
            isRunning: true, 
            currentStep: `조장 ${day}일차 점수 입력 시뮬레이션 중...`, 
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

            // Firebase에서 최신 선수 데이터 가져오기
            const playersSnapshot = await get(ref(db, 'players'));
            const latestPlayersData = playersSnapshot.val() || {};
            const latestPlayers = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));
            
            // 모든 개인전 선수 필터링 (엑셀 업로드 선수 포함)
            const allIndividualPlayers = latestPlayers.filter(p => p.type === 'individual');
            
            if (allIndividualPlayers.length === 0) {
                toast({ 
                    title: '오류', 
                    description: '등록된 선수가 없습니다.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // Firebase에서 최신 점수 데이터 가져오기
            const scoresSnapshot = await get(ref(db, 'scores'));
            const latestScores = scoresSnapshot.val() || {};

            // 1일차: A, B 코스 / 2일차: C, D 코스
            const targetCourses = day === 1 ? [courseA, courseB] : [courseC, courseD];

            // 모든 점수 저장 작업을 배열로 수집
            const scoreTasks: Array<() => Promise<void>> = [];
            const totalPlayers = allIndividualPlayers.length;
            const totalExpectedScores = totalPlayers * targetCourses.length * 9;

            for (const player of allIndividualPlayers) {
                for (const course of targetCourses) {
                    // 이미 점수가 있는 경우 스킵
                    const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                    if (hasScore) continue;

                    for (let hole = 1; hole <= 9; hole++) {
                        const par = course.pars?.[hole - 1] || 4;
                        const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                        const prevScore = latestScores[player.id]?.[course.id]?.[String(hole)] ?? null;

                        // 점수 저장 작업을 배열에 추가
                        scoreTasks.push(() => 
                            saveScoreAsCaptain(
                                player.id,
                                String(course.id),
                                hole,
                                score,
                                prevScore,
                                player.group || '',
                                player.jo || 0,
                                day,
                                false // 조장 모드
                            ).catch((error: any) => {
                                console.error(`점수 저장 실패 (선수: ${player.id}, 코스: ${course.id}, 홀: ${hole}):`, error);
                            })
                        );
                    }
                }
            }

            // 배치 단위로 병렬 처리 (배치 크기: 20개, 배치 간 지연: 50ms)
            const BATCH_SIZE = 20;
            const BATCH_DELAY = 50;
            let processedScores = 0;
            let totalScores = 0;

            for (let i = 0; i < scoreTasks.length; i += BATCH_SIZE) {
                const batch = scoreTasks.slice(i, i + BATCH_SIZE);
                
                // 현재 배치를 병렬로 실행
                const results = await Promise.allSettled(batch.map(task => task()));
                const successCount = results.filter(r => r.status === 'fulfilled').length;
                totalScores += successCount;
                processedScores += batch.length;

                // 진행률 업데이트
                setSimulationState({ 
                    isRunning: true, 
                    currentStep: `조장 ${day}일차 점수 입력 중... (${processedScores}/${scoreTasks.length}개 완료)`, 
                    progress: (processedScores / totalExpectedScores) * 100 
                });

                // 마지막 배치가 아니면 지연 (실제 환경 모방)
                if (i + BATCH_SIZE < scoreTasks.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }
            
            toast({ 
                title: '완료', 
                description: `조장 ${day}일차 점수 입력이 완료되었습니다. (${totalScores}개 점수 등록)` 
            });
        } catch (error: any) {
            toast({ 
                title: '오류', 
                description: error.message || '알 수 없는 오류', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    // 일괄 입력 모드 점수 입력 시뮬레이션
    const simulateBatchScores = async (day: 1 | 2) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }

        setSimulationState({ 
            isRunning: true, 
            currentStep: `일괄 입력 모드 ${day}일차 점수 입력 시뮬레이션 중...`, 
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

            // Firebase에서 최신 선수 데이터 가져오기
            const playersSnapshot = await get(ref(db, 'players'));
            const latestPlayersData = playersSnapshot.val() || {};
            const latestPlayers = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));
            
            // 모든 개인전 선수 필터링 (엑셀 업로드 선수 포함)
            const allIndividualPlayers = latestPlayers.filter(p => p.type === 'individual');
            
            if (allIndividualPlayers.length === 0) {
                toast({ 
                    title: '오류', 
                    description: '등록된 선수가 없습니다.', 
                    variant: 'destructive' 
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // Firebase에서 최신 점수 데이터 가져오기
            const scoresSnapshot = await get(ref(db, 'scores'));
            const latestScores = scoresSnapshot.val() || {};

            // 1일차: A, B 코스 / 2일차: C, D 코스
            const targetCourses = day === 1 ? [courseA, courseB] : [courseC, courseD];

            // 모든 점수 저장 작업을 배열로 수집
            const scoreTasks: Array<() => Promise<void>> = [];
            const totalPlayers = allIndividualPlayers.length;
            const totalExpectedScores = totalPlayers * targetCourses.length * 9;

            for (const player of allIndividualPlayers) {
                for (const course of targetCourses) {
                    // 이미 점수가 있는 경우 스킵
                    const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                    if (hasScore) continue;

                    for (let hole = 1; hole <= 9; hole++) {
                        const par = course.pars?.[hole - 1] || 4;
                        const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                        const prevScore = latestScores[player.id]?.[course.id]?.[String(hole)] ?? null;

                        // 점수 저장 작업을 배열에 추가
                        scoreTasks.push(() => 
                            saveScoreAsCaptain(
                                player.id,
                                String(course.id),
                                hole,
                                score,
                                prevScore,
                                player.group || '',
                                player.jo || 0,
                                day,
                                true // 일괄 입력 모드
                            ).catch((error: any) => {
                                console.error(`점수 저장 실패 (선수: ${player.id}, 코스: ${course.id}, 홀: ${hole}):`, error);
                            })
                        );
                    }
                }
            }

            // 배치 단위로 병렬 처리 (배치 크기: 20개, 배치 간 지연: 50ms)
            const BATCH_SIZE = 20;
            const BATCH_DELAY = 50;
            let processedScores = 0;
            let totalScores = 0;

            for (let i = 0; i < scoreTasks.length; i += BATCH_SIZE) {
                const batch = scoreTasks.slice(i, i + BATCH_SIZE);
                
                // 현재 배치를 병렬로 실행
                const results = await Promise.allSettled(batch.map(task => task()));
                const successCount = results.filter(r => r.status === 'fulfilled').length;
                totalScores += successCount;
                processedScores += batch.length;

                // 진행률 업데이트
                setSimulationState({ 
                    isRunning: true, 
                    currentStep: `일괄 입력 모드 ${day}일차 점수 입력 중... (${processedScores}/${scoreTasks.length}개 완료)`, 
                    progress: (processedScores / totalExpectedScores) * 100 
                });

                // 마지막 배치가 아니면 지연 (실제 환경 모방)
                if (i + BATCH_SIZE < scoreTasks.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }
            
            toast({ 
                title: '완료', 
                description: `일괄 입력 모드 ${day}일차 점수 입력이 완료되었습니다. (${totalScores}개 점수 등록)` 
            });
        } catch (error: any) {
            toast({ 
                title: '오류', 
                description: error.message || '알 수 없는 오류', 
                variant: 'destructive' 
            });
        } finally {
            setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
        }
    };

    const handleButtonClick = (type: string, day: 1 | 2) => {
        setShowConfirmDialog({ open: true, type, day });
    };

    const handleConfirm = () => {
        const { type, day } = showConfirmDialog;
        setShowConfirmDialog({ open: false, type: '', day: 1 });
        
        if (type === 'referee') {
            simulateRefereeScores(day);
        } else if (type === 'captain') {
            simulateCaptainScores(day);
        } else if (type === 'batch') {
            simulateBatchScores(day);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>자동 점수 입력 시뮬레이션</CardTitle>
                <CardDescription>
                    현재 등록된 모든 선수에게 자동으로 점수를 입력합니다. (엑셀 업로드 선수 포함)
                    <br />
                    실제 심판/조장/일괄입력 페이지와 동일한 방식으로 점수가 저장됩니다.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {simulationState.isRunning && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">{simulationState.currentStep}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{ width: `${simulationState.progress}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 1일차 */}
                    <div className="space-y-2">
                        <h3 className="font-semibold text-lg">1일차 (A코스, B코스)</h3>
                        <Button
                            onClick={() => handleButtonClick('referee', 1)}
                            disabled={simulationState.isRunning}
                            className="w-full"
                            variant="outline"
                        >
                            심판 1차 점수 입력
                        </Button>
                        <Button
                            onClick={() => handleButtonClick('captain', 1)}
                            disabled={simulationState.isRunning}
                            className="w-full"
                            variant="outline"
                        >
                            조장 1차 점수 입력
                        </Button>
                        <Button
                            onClick={() => handleButtonClick('batch', 1)}
                            disabled={simulationState.isRunning}
                            className="w-full"
                            variant="outline"
                        >
                            일괄 입력 모드 1차 입력
                        </Button>
                    </div>

                    {/* 2일차 */}
                    <div className="space-y-2">
                        <h3 className="font-semibold text-lg">2일차 (C코스, D코스)</h3>
                        <Button
                            onClick={() => handleButtonClick('referee', 2)}
                            disabled={simulationState.isRunning}
                            className="w-full"
                            variant="outline"
                        >
                            심판 2차 점수 입력
                        </Button>
                        <Button
                            onClick={() => handleButtonClick('captain', 2)}
                            disabled={simulationState.isRunning}
                            className="w-full"
                            variant="outline"
                        >
                            조장 2차 점수 입력
                        </Button>
                        <Button
                            onClick={() => handleButtonClick('batch', 2)}
                            disabled={simulationState.isRunning}
                            className="w-full"
                            variant="outline"
                        >
                            일괄 입력 모드 2차 입력
                        </Button>
                    </div>
                </div>

                <AlertDialog open={showConfirmDialog.open} onOpenChange={(open) => setShowConfirmDialog({ ...showConfirmDialog, open })}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>자동 점수 입력 확인</AlertDialogTitle>
                            <AlertDialogDescription>
                                {showConfirmDialog.type === 'referee' && `심판 ${showConfirmDialog.day}일차 점수 입력을 시작하시겠습니까?`}
                                {showConfirmDialog.type === 'captain' && `조장 ${showConfirmDialog.day}일차 점수 입력을 시작하시겠습니까?`}
                                {showConfirmDialog.type === 'batch' && `일괄 입력 모드 ${showConfirmDialog.day}일차 점수 입력을 시작하시겠습니까?`}
                                <br />
                                현재 등록된 모든 선수에게 자동으로 점수가 입력됩니다.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction onClick={handleConfirm}>확인</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}
