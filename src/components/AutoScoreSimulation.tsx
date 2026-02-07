"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { db, ensureAuthenticated } from '@/lib/firebase';
import { ref, get, set, onValue } from 'firebase/database';
import { logScoreChange, invalidatePlayerLogCache } from '@/lib/scoreLogs';
import { Loader2, ChevronDown, ChevronUp, X, CheckCircle2, LayoutGrid } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

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

    // 이중 확인 다이얼로그 (첫 번째 확인)
    const [showFirstConfirmDialog, setShowFirstConfirmDialog] = useState<{
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

    // 코스 선택 상태 (1차, 2차 각각)
    // 코스 선택 상태 (그룹별로 관리)
    const [selectedCourses1, setSelectedCourses1] = useState<{ [groupName: string]: number[] }>({});
    const [selectedCourses2, setSelectedCourses2] = useState<{ [groupName: string]: number[] }>({});

    // 카드 열림/닫힘 상태 (기본값: 닫힘)
    const [isCardExpanded, setIsCardExpanded] = useState<boolean>(false);
    const [showActivateDialog, setShowActivateDialog] = useState<boolean>(false);

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
                    const refereeId = `시뮬레이션_심판${day}차`;
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
                    modifiedBy: isBatchMode ? `시뮬레이션_일괄입력${day}차` : `시뮬레이션_조장${day}차`,
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
            currentStep: `심판 ${day}차 점수 입력 시뮬레이션 중...`,
            progress: 0
        });

        try {
            if (Object.keys(day === 1 ? selectedCourses1 : selectedCourses2).length === 0) {
                toast({
                    title: '알림',
                    description: `${day}차에 코스가 선택된 그룹이 없습니다.`,
                    variant: 'default'
                });
                setSimulationState({ isRunning: false, currentStep: '', progress: 0 });
                return;
            }

            // Firebase에서 최신 선수 데이터 가져오기
            const playersSnapshot = await get(ref(db, 'players'));
            const latestPlayersData = playersSnapshot.val() || {};
            const latestPlayers = Object.entries(latestPlayersData).map(([id, player]) => ({ id, ...player as any }));

            // 모든 개인전 선수 필터링
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

            // 모든 점수 저장 작업을 배열로 수집
            const scoreTasks: Array<() => Promise<{ success: boolean; error?: string; context?: string }>> = [];
            const currentSelectedCourses = day === 1 ? selectedCourses1 : selectedCourses2;

            for (const player of allIndividualPlayers) {
                const groupName = player.group || '';
                const selectedCourseIds = currentSelectedCourses[groupName] || [];
                if (selectedCourseIds.length === 0) continue;

                const targetCourses = courses.filter(c => selectedCourseIds.includes(c.id));

                for (const course of targetCourses) {
                    // 이미 점수가 있는 경우 스킵
                    const hasScore = latestScores[player.id]?.[course.id]?.['1'];
                    if (hasScore) continue;

                    for (let hole = 1; hole <= 9; hole++) {
                        const par = course.pars?.[hole - 1] || 4;
                        const score = Math.max(1, Math.min(9, par + Math.floor(Math.random() * 5) - 2));
                        const prevScore = latestScores[player.id]?.[course.id]?.[String(hole)] ?? null;

                        scoreTasks.push(() =>
                            saveScoreAsReferee(
                                player.id,
                                String(course.id),
                                hole,
                                score,
                                prevScore,
                                latestScores,
                                day
                            )
                                .then(() => ({ success: true }))
                                .catch((error: any) => {
                                    const errorMsg = error.message || '알 수 없는 오류';
                                    console.error(`점수 저장 실패 (선수: ${player.id}, 코스: ${course.id}, 홀: ${hole}):`, error);
                                    return {
                                        success: false,
                                        error: errorMsg,
                                        context: `선수(${player.name || player.id}) 코스(${course.name || course.id}) ${hole}홀`
                                    };
                                })
                        );
                    }
                }
            }

            // 배치 단위로 병렬 처리 (배치 크기: 20개, 배치 간 지연: 50ms)
            const BATCH_SIZE = 20;
            const BATCH_DELAY = 50;
            let processedScores = 0;
            let totalSuccess = 0;
            let totalFailure = 0;
            const failureReasons: string[] = [];
            const totalExpectedScores = scoreTasks.length;

            for (let i = 0; i < scoreTasks.length; i += BATCH_SIZE) {
                const batch = scoreTasks.slice(i, i + BATCH_SIZE);

                // 현재 배치를 병렬로 실행
                const results = await Promise.all(batch.map(task => task()));

                results.forEach(res => {
                    if (res.success) {
                        totalSuccess++;
                    } else {
                        totalFailure++;
                        if (res.error) {
                            failureReasons.push(`[${res.context}] ${res.error}`);
                        }
                    }
                });

                processedScores += batch.length;

                // 진행률 업데이트
                setSimulationState({
                    isRunning: true,
                    currentStep: `심판 ${day}차 점수 입력 중... (${processedScores}/${scoreTasks.length}개 완료 | 실패 ${totalFailure}건)`,
                    progress: (processedScores / totalExpectedScores) * 100
                });

                // 마지막 배치가 아니면 지연 (실제 환경 모방)
                if (i + BATCH_SIZE < scoreTasks.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }

            if (totalFailure > 0) {
                // 실패 원인 중복 제거 및 상위 5개만 표시
                const uniqueErrors = Array.from(new Set(failureReasons)).slice(0, 5);
                const errorSummary = uniqueErrors.join('\n');
                const moreErrors = failureReasons.length > 5 ? `\n...외 ${failureReasons.length - 5}건` : '';

                toast({
                    title: '완료 (일부 실패)',
                    description: `성공: ${totalSuccess}건, 실패: ${totalFailure}건\n\n[실패 원인]\n${errorSummary}${moreErrors}`,
                    variant: 'destructive',
                    duration: 10000 // 사용자가 읽을 수 있도록 시간을 길게 설정
                });
            } else {
                toast({
                    title: '완료',
                    description: `심판 ${day}차 점수 입력이 완료되었습니다. (${totalSuccess}개 점수 등록 성공)`
                });
            }
        } catch (error: any) {
            toast({
                title: '치명적 오류',
                description: error.message || '알 수 없는 오류가 발생하여 중단되었습니다.',
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
            currentStep: `조장 ${day}차 점수 입력 시뮬레이션 중...`,
            progress: 0
        });

        try {
            // 선택된 코스 가져오기 (그룹별)
            const currentSelectedCourses = day === 1 ? selectedCourses1 : selectedCourses2;

            if (Object.keys(currentSelectedCourses).length === 0) {
                toast({
                    title: '알림',
                    description: `${day}차에 코스가 선택된 그룹이 없습니다.`,
                    variant: 'default'
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

            // 모든 점수 저장 작업을 배열로 수집
            const scoreTasks: Array<() => Promise<{ success: boolean; error?: string; context?: string }>> = [];

            for (const player of allIndividualPlayers) {
                const groupName = player.group || '';
                const selectedCourseIds = currentSelectedCourses[groupName] || [];
                if (selectedCourseIds.length === 0) continue; // Skip player if their group has no courses selected

                const targetCourses = courses.filter(c => selectedCourseIds.includes(c.id));

                for (const course of targetCourses) {
                    // 이미 점수가 있는 경우 스킵
                    const hasScore = latestScores[player.id]?.[course.id]?.[String(day)]; // Check score for the specific day
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
                            )
                                .then(() => ({ success: true }))
                                .catch((error: any) => {
                                    const errorMsg = error.message || '알 수 없는 오류';
                                    console.error(`점수 저장 실패 (선수: ${player.id}, 코스: ${course.id}, 홀: ${hole}):`, error);
                                    return {
                                        success: false,
                                        error: errorMsg,
                                        context: `선수(${player.name || player.id}) 코스(${course.name || course.id}) ${hole}홀`
                                    };
                                })
                        );
                    }
                }
            }

            // 배치 단위로 병렬 처리 (배치 크기: 20개, 배치 간 지연: 50ms)
            const BATCH_SIZE = 20;
            const BATCH_DELAY = 50;
            let processedScores = 0;
            let totalSuccess = 0;
            let totalFailure = 0;
            const failureReasons: string[] = [];
            const totalExpectedScores = scoreTasks.length;

            for (let i = 0; i < scoreTasks.length; i += BATCH_SIZE) {
                const batch = scoreTasks.slice(i, i + BATCH_SIZE);

                // 현재 배치를 병렬로 실행
                const results = await Promise.all(batch.map(task => task()));

                results.forEach(res => {
                    if (res.success) {
                        totalSuccess++;
                    } else {
                        totalFailure++;
                        if (res.error) {
                            failureReasons.push(`[${res.context}] ${res.error}`);
                        }
                    }
                });

                processedScores += batch.length;

                // 진행률 업데이트
                setSimulationState({
                    isRunning: true,
                    currentStep: `조장 ${day}차 점수 입력 중... (${processedScores}/${scoreTasks.length}개 완료 | 실패 ${totalFailure}건)`,
                    progress: (processedScores / totalExpectedScores) * 100
                });

                // 마지막 배치가 아니면 지연 (실제 환경 모방)
                if (i + BATCH_SIZE < scoreTasks.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }

            if (totalFailure > 0) {
                const uniqueErrors = Array.from(new Set(failureReasons)).slice(0, 5);
                const errorSummary = uniqueErrors.join('\n');
                const moreErrors = failureReasons.length > 5 ? `\n...외 ${failureReasons.length - 5}건` : '';

                toast({
                    title: '완료 (일부 실패)',
                    description: `성공: ${totalSuccess}건, 실패: ${totalFailure}건\n\n[실패 원인]\n${errorSummary}${moreErrors}`,
                    variant: 'destructive',
                    duration: 10000
                });
            } else {
                toast({
                    title: '완료',
                    description: `조장 ${day}차 점수 입력이 완료되었습니다. (${totalSuccess}개 점수 등록 성공)`
                });
            }
        } catch (error: any) {
            toast({
                title: '치명적 오류',
                description: error.message || '알 수 없는 오류가 발생하여 중단되었습니다.',
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
            currentStep: `일괄 입력 모드 ${day}차 점수 입력 시뮬레이션 중...`,
            progress: 0
        });

        try {
            // 선택된 코스 가져오기 (그룹별)
            const currentSelectedCourses = day === 1 ? selectedCourses1 : selectedCourses2;

            if (Object.keys(currentSelectedCourses).length === 0) {
                toast({
                    title: '알림',
                    description: `${day}차에 코스가 선택된 그룹이 없습니다.`,
                    variant: 'default'
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

            // 모든 점수 저장 작업을 배열로 수집
            const scoreTasks: Array<() => Promise<{ success: boolean; error?: string; context?: string }>> = [];
            // const totalPlayers = allIndividualPlayers.length; // Not directly used for totalExpectedScores anymore
            // const totalExpectedScores = totalPlayers * targetCourses.length * 9; // This was for a single set of targetCourses

            for (const player of allIndividualPlayers) {
                const groupName = player.group || '';
                const selectedCourseIds = currentSelectedCourses[groupName] || [];
                if (selectedCourseIds.length === 0) continue; // Skip player if their group has no courses selected

                const targetCourses = courses.filter(c => selectedCourseIds.includes(c.id));

                for (const course of targetCourses) {
                    // 이미 점수가 있는 경우 스킵
                    const hasScore = latestScores[player.id]?.[course.id]?.[String(day)]; // Check score for the specific day
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
                            )
                                .then(() => ({ success: true }))
                                .catch((error: any) => {
                                    const errorMsg = error.message || '알 수 없는 오류';
                                    console.error(`점수 저장 실패 (선수: ${player.id}, 코스: ${course.id}, 홀: ${hole}):`, error);
                                    return {
                                        success: false,
                                        error: errorMsg,
                                        context: `선수(${player.name || player.id}) 코스(${course.name || course.id}) ${hole}홀`
                                    };
                                })
                        );
                    }
                }
            }

            // 배치 단위로 병렬 처리 (배치 크기: 20개, 배치 간 지연: 50ms)
            const BATCH_SIZE = 20;
            const BATCH_DELAY = 50;
            let processedScores = 0;
            let totalSuccess = 0;
            let totalFailure = 0;
            const failureReasons: string[] = [];
            const totalExpectedScores = scoreTasks.length;

            for (let i = 0; i < scoreTasks.length; i += BATCH_SIZE) {
                const batch = scoreTasks.slice(i, i + BATCH_SIZE);

                // 현재 배치를 병렬로 실행
                const results = await Promise.all(batch.map(task => task()));

                results.forEach(res => {
                    if (res.success) {
                        totalSuccess++;
                    } else {
                        totalFailure++;
                        if (res.error) {
                            failureReasons.push(`[${res.context}] ${res.error}`);
                        }
                    }
                });

                processedScores += batch.length;

                // 진행률 업데이트
                setSimulationState({
                    isRunning: true,
                    currentStep: `일괄 입력 모드 ${day}차 점수 입력 중... (${processedScores}/${scoreTasks.length}개 완료 | 실패 ${totalFailure}건)`,
                    progress: (processedScores / totalExpectedScores) * 100
                });

                // 마지막 배치가 아니면 지연 (실제 환경 모방)
                if (i + BATCH_SIZE < scoreTasks.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }

            if (totalFailure > 0) {
                const uniqueErrors = Array.from(new Set(failureReasons)).slice(0, 5);
                const errorSummary = uniqueErrors.join('\n');
                const moreErrors = failureReasons.length > 5 ? `\n...외 ${failureReasons.length - 5}건` : '';

                toast({
                    title: '완료 (일부 실패)',
                    description: `성공: ${totalSuccess}건, 실패: ${totalFailure}건\n\n[실패 원인]\n${errorSummary}${moreErrors}`,
                    variant: 'destructive',
                    duration: 10000
                });
            } else {
                toast({
                    title: '완료',
                    description: `일괄 입력 모드 ${day}차 점수 입력이 완료되었습니다. (${totalSuccess}개 점수 등록 성공)`
                });
            }
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

    const handleButtonClick = (type: string, day: 1 | 2, e?: React.MouseEvent) => {
        // 이벤트 전파 방지 (다른 버튼 클릭과 충돌 방지)
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // 🔒 안전장치 1: 이미 실행 중이면 차단
        if (simulationState.isRunning) {
            toast({
                title: '알림',
                description: '이미 시뮬레이션이 실행 중입니다.',
                variant: 'default'
            });
            return;
        }

        // 🔒 안전장치 2: 카드가 닫혀있으면 실행 불가
        if (!isCardExpanded) {
            console.warn('시뮬레이션: 카드가 닫혀있어 실행 불가');
            return;
        }

        // 🔒 안전장치 3: 코스가 선택된 그룹이 있는지 확인
        const currentSelectedParams = day === 1 ? selectedCourses1 : selectedCourses2;
        if (Object.keys(currentSelectedParams).length === 0) {
            toast({
                title: '알림',
                description: `${day}차에 코스가 선택된 그룹이 없습니다.`,
                variant: 'default'
            });
            return;
        }

        // 🔒 안전장치 4: 첫 번째 확인 다이얼로그 표시
        setShowFirstConfirmDialog({ open: true, type, day });
    };

    // 첫 번째 확인 다이얼로그에서 확인 클릭 시
    const handleFirstConfirm = () => {
        const { type, day } = showFirstConfirmDialog;
        setShowFirstConfirmDialog({ open: false, type: '', day: 1 });

        // 🔒 안전장치 5: 다시 한 번 상태 검증
        if (simulationState.isRunning) {
            toast({
                title: '오류',
                description: '시뮬레이션이 이미 실행 중입니다.',
                variant: 'destructive'
            });
            return;
        }

        if (!isCardExpanded) {
            toast({
                title: '오류',
                description: '카드가 닫혀있어 실행할 수 없습니다.',
                variant: 'destructive'
            });
            return;
        }

        const currentSelectedParams = day === 1 ? selectedCourses1 : selectedCourses2;
        if (Object.keys(currentSelectedParams).length === 0) {
            toast({
                title: '오류',
                description: '코스가 선택된 그룹이 없습니다.',
                variant: 'destructive'
            });
            return;
        }

        // 두 번째 확인 다이얼로그 표시
        setShowConfirmDialog({ open: true, type, day });
    };

    const handleConfirm = () => {
        const { type, day } = showConfirmDialog;
        setShowConfirmDialog({ open: false, type: '', day: 1 });

        // 🔒 안전장치 6: 최종 실행 전 마지막 검증
        if (simulationState.isRunning) {
            toast({
                title: '오류',
                description: '시뮬레이션이 이미 실행 중입니다.',
                variant: 'destructive'
            });
            return;
        }

        if (!isCardExpanded) {
            toast({
                title: '오류',
                description: '카드가 닫혀있어 실행할 수 없습니다.',
                variant: 'destructive'
            });
            return;
        }

        const currentSelectedParams = day === 1 ? selectedCourses1 : selectedCourses2;
        if (Object.keys(currentSelectedParams).length === 0) {
            toast({
                title: '오류',
                description: '코스가 선택된 그룹이 없습니다.',
                variant: 'destructive'
            });
            return;
        }

        // 🔒 안전장치 7: 실행 함수 호출 전 상태 설정 (중복 실행 방지)
        setSimulationState(prev => {
            if (prev.isRunning) {
                return prev; // 이미 실행 중이면 상태 변경 안 함
            }
            return prev;
        });

        // 실행
        if (type === 'referee') {
            simulateRefereeScores(day);
        } else if (type === 'captain') {
            simulateCaptainScores(day);
        } else if (type === 'batch') {
            simulateBatchScores(day);
        }
    };

    const handleActivate = (e?: React.MouseEvent) => {
        // 이벤트 전파 방지
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setShowActivateDialog(true);
    };

    const handleActivateConfirm = () => {
        setShowActivateDialog(false);
        setIsCardExpanded(true);
    };

    const handleClose = () => {
        setIsCardExpanded(false);
        // 코스 선택도 초기화 (선택사항)
        // setSelectedCourses1([]);
        // setSelectedCourses2([]);
    };

    const handleCourseToggle = (groupName: string, courseId: number, day: 1 | 2) => {
        const setFn = day === 1 ? setSelectedCourses1 : setSelectedCourses2;
        setFn(prev => {
            const groupCourses = prev[groupName] || [];
            const isSelected = groupCourses.includes(courseId);
            const next = { ...prev };
            if (isSelected) {
                next[groupName] = groupCourses.filter(id => id !== courseId);
                if (next[groupName].length === 0) delete next[groupName];
            } else {
                next[groupName] = [...groupCourses, courseId];
            }
            return next;
        });
    };

    const handleApplyToAllGroups = (day: 1 | 2, courseIds: number[]) => {
        const setFn = day === 1 ? setSelectedCourses1 : setSelectedCourses2;
        const allGroups = Object.keys(groupsData);
        const next: { [key: string]: number[] } = {};
        allGroups.forEach(g => {
            if (courseIds.length > 0) next[g] = [...courseIds];
        });
        setFn(next);
        toast({ title: '알림', description: `모든 그룹에 ${courseIds.length}개 코스가 적용되었습니다.` });
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <CardTitle>자동 점수 입력 시뮬레이션</CardTitle>
                            <CardDescription>
                                현재 등록된 모든 선수에게 자동으로 점수를 입력합니다. (엑셀 업로드 선수 포함)
                                <br />
                                실제 심판/조장/일괄입력 페이지와 동일한 방식으로 점수가 저장됩니다.
                            </CardDescription>
                        </div>
                        {!isCardExpanded ? (
                            <Button
                                onClick={(e) => handleActivate(e)}
                                variant="outline"
                                size="sm"
                                className="ml-4"
                                type="button"
                            >
                                활성화
                            </Button>
                        ) : (
                            <Button
                                onClick={(e) => {
                                    e?.preventDefault();
                                    e?.stopPropagation();
                                    handleClose();
                                }}
                                variant="outline"
                                size="sm"
                                className="ml-4"
                                type="button"
                            >
                                <X className="mr-2 h-4 w-4" />
                                닫기
                            </Button>
                        )}
                    </div>
                </CardHeader>
                {isCardExpanded && (
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* 1차 */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-lg">1차</h3>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px]"
                                            onClick={() => handleApplyToAllGroups(1, courses.map(c => c.id))}
                                        >전체 선택</Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px] text-red-500"
                                            onClick={() => handleApplyToAllGroups(1, [])}
                                        >전체 해제</Button>
                                    </div>
                                </div>
                                <div className="border rounded-lg p-1 bg-muted/30">
                                    <Tabs defaultValue={Object.keys(groupsData)[0]} className="w-full">
                                        <ScrollArea className="w-full whitespace-nowrap border-b">
                                            <TabsList className="w-full justify-start h-9 bg-transparent p-0">
                                                {Object.keys(groupsData).map(groupName => (
                                                    <TabsTrigger
                                                        key={groupName}
                                                        value={groupName}
                                                        className="data-[state=active]:bg-background data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-9 px-3 text-xs"
                                                    >
                                                        {groupName}
                                                        {selectedCourses1[groupName]?.length > 0 && (
                                                            <span className="ml-1 px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full text-[8px]">
                                                                {selectedCourses1[groupName].length}
                                                            </span>
                                                        )}
                                                    </TabsTrigger>
                                                ))}
                                            </TabsList>
                                        </ScrollArea>
                                        {Object.keys(groupsData).map(groupName => (
                                            <TabsContent key={groupName} value={groupName} className="p-3 mt-0 space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    {courses.map((course) => (
                                                        <div key={course.id} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`course-1-${groupName}-${course.id}`}
                                                                checked={selectedCourses1[groupName]?.includes(course.id) || false}
                                                                onCheckedChange={() => handleCourseToggle(groupName, course.id, 1)}
                                                            />
                                                            <Label
                                                                htmlFor={`course-1-${groupName}-${course.id}`}
                                                                className="text-sm font-normal cursor-pointer"
                                                            >
                                                                {course.name || `코스 ${course.id}`}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </TabsContent>
                                        ))}
                                    </Tabs>
                                </div>
                                <div className="space-y-2">
                                    <Button
                                        onClick={(e) => handleButtonClick('referee', 1, e)}
                                        disabled={simulationState.isRunning || Object.keys(selectedCourses1).length === 0 || !isCardExpanded}
                                        className="w-full"
                                        variant="outline"
                                        type="button"
                                    >
                                        심판 1차 점수 입력
                                    </Button>
                                    <Button
                                        onClick={(e) => handleButtonClick('captain', 1, e)}
                                        disabled={simulationState.isRunning || Object.keys(selectedCourses1).length === 0 || !isCardExpanded}
                                        className="w-full"
                                        variant="outline"
                                        type="button"
                                    >
                                        조장 1차 점수 입력
                                    </Button>
                                    <Button
                                        onClick={(e) => handleButtonClick('batch', 1, e)}
                                        disabled={simulationState.isRunning || Object.keys(selectedCourses1).length === 0 || !isCardExpanded}
                                        className="w-full"
                                        variant="outline"
                                        type="button"
                                    >
                                        일괄 입력 모드 1차 입력
                                    </Button>
                                </div>
                            </div>

                            {/* 2차 */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-lg">2차</h3>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px]"
                                            onClick={() => handleApplyToAllGroups(2, courses.map(c => c.id))}
                                        >전체 선택</Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px] text-red-500"
                                            onClick={() => handleApplyToAllGroups(2, [])}
                                        >전체 해제</Button>
                                    </div>
                                </div>
                                <div className="border rounded-lg p-1 bg-muted/30">
                                    <Tabs defaultValue={Object.keys(groupsData)[0]} className="w-full">
                                        <ScrollArea className="w-full whitespace-nowrap border-b">
                                            <TabsList className="w-full justify-start h-9 bg-transparent p-0">
                                                {Object.keys(groupsData).map(groupName => (
                                                    <TabsTrigger
                                                        key={groupName}
                                                        value={groupName}
                                                        className="data-[state=active]:bg-background data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-9 px-3 text-xs"
                                                    >
                                                        {groupName}
                                                        {selectedCourses2[groupName]?.length > 0 && (
                                                            <span className="ml-1 px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full text-[8px]">
                                                                {selectedCourses2[groupName].length}
                                                            </span>
                                                        )}
                                                    </TabsTrigger>
                                                ))}
                                            </TabsList>
                                        </ScrollArea>
                                        {Object.keys(groupsData).map(groupName => (
                                            <TabsContent key={groupName} value={groupName} className="p-3 mt-0 space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    {courses.map((course) => (
                                                        <div key={course.id} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`course-2-${groupName}-${course.id}`}
                                                                checked={selectedCourses2[groupName]?.includes(course.id) || false}
                                                                onCheckedChange={() => handleCourseToggle(groupName, course.id, 2)}
                                                            />
                                                            <Label
                                                                htmlFor={`course-2-${groupName}-${course.id}`}
                                                                className="text-sm font-normal cursor-pointer"
                                                            >
                                                                {course.name || `코스 ${course.id}`}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </TabsContent>
                                        ))}
                                    </Tabs>
                                </div>
                                <div className="space-y-2">
                                    <Button
                                        onClick={(e) => handleButtonClick('referee', 2, e)}
                                        disabled={simulationState.isRunning || Object.keys(selectedCourses2).length === 0 || !isCardExpanded}
                                        className="w-full"
                                        variant="outline"
                                        type="button"
                                    >
                                        심판 2차 점수 입력
                                    </Button>
                                    <Button
                                        onClick={(e) => handleButtonClick('captain', 2, e)}
                                        disabled={simulationState.isRunning || Object.keys(selectedCourses2).length === 0 || !isCardExpanded}
                                        className="w-full"
                                        variant="outline"
                                        type="button"
                                    >
                                        조장 2차 점수 입력
                                    </Button>
                                    <Button
                                        onClick={(e) => handleButtonClick('batch', 2, e)}
                                        disabled={simulationState.isRunning || Object.keys(selectedCourses2).length === 0 || !isCardExpanded}
                                        className="w-full"
                                        variant="outline"
                                        type="button"
                                    >
                                        일괄 입력 모드 2차 입력
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* 첫 번째 확인 다이얼로그 */}
                        <AlertDialog open={showFirstConfirmDialog.open} onOpenChange={(open) => setShowFirstConfirmDialog({ ...showFirstConfirmDialog, open })}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>⚠️ 시뮬레이션 실행 확인</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {showFirstConfirmDialog.type === 'referee' && `심판 ${showFirstConfirmDialog.day}차 점수 입력 시뮬레이션을 실행하시겠습니까?`}
                                        {showFirstConfirmDialog.type === 'captain' && `조장 ${showFirstConfirmDialog.day}차 점수 입력 시뮬레이션을 실행하시겠습니까?`}
                                        {showFirstConfirmDialog.type === 'batch' && `일괄 입력 모드 ${showFirstConfirmDialog.day}차 점수 입력 시뮬레이션을 실행하시겠습니까?`}
                                        <br />
                                        <span className="font-semibold text-orange-600">이 작업은 실제 Firebase에 점수를 저장합니다.</span>
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>취소</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleFirstConfirm}>계속</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>

                        {/* 두 번째 확인 다이얼로그 (최종 확인) */}
                        <AlertDialog open={showConfirmDialog.open} onOpenChange={(open) => setShowConfirmDialog({ ...showConfirmDialog, open })}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>🚨 최종 확인</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {showConfirmDialog.type === 'referee' && `심판 ${showConfirmDialog.day}차 점수 입력을 시작하시겠습니까?`}
                                        {showConfirmDialog.type === 'captain' && `조장 ${showConfirmDialog.day}차 점수 입력을 시작하시겠습니까?`}
                                        {showConfirmDialog.type === 'batch' && `일괄 입력 모드 ${showConfirmDialog.day}차 점수 입력을 시작하시겠습니까?`}
                                        <br />
                                        <span className="font-semibold text-red-600">현재 등록된 모든 선수에게 자동으로 점수가 입력됩니다.</span>
                                        <br />
                                        <span className="text-sm text-muted-foreground">이 작업은 되돌릴 수 없습니다.</span>
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>취소</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleConfirm} className="bg-red-600 hover:bg-red-700">실행</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                )}
            </Card>

            {/* 활성화 확인 다이얼로그 */}
            <AlertDialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>시뮬레이션 도구 활성화</AlertDialogTitle>
                        <AlertDialogDescription>
                            자동 점수 입력 시뮬레이션 도구를 활성화하시겠습니까?
                            <br />
                            <span className="font-semibold text-red-600">이 도구는 실제 Firebase에 점수를 저장합니다.</span>
                            <br />
                            대회 중에는 사용하지 마세요.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleActivateConfirm}>활성화</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
