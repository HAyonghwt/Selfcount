import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db, ensureAuthenticated } from '@/lib/firebase';
import { ref, set, get } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { logScoreChange, invalidatePlayerLogCache, getPlayerScoreLogsOptimized, ScoreLog } from '@/lib/scoreLogs';

interface ScoreEditModalProps {
    open: boolean;
    playerId: string;
    courseId: string;
    holeIndex: number;
    initialScore: string;
    initialForfeitType: 'absent' | 'disqualified' | 'forfeit' | null;
    playerName: string;
    courseName: string;
    onClose: () => void;
    onSave: (score: string, forfeitType: 'absent' | 'disqualified' | 'forfeit' | null) => Promise<void>;
    finalDataByGroup: any;
    playerScoreLogs: { [playerId: string]: ScoreLog[] };
    scores: any;
}

const ScoreEditModal = React.memo(({
    open,
    playerId,
    courseId,
    holeIndex,
    initialScore,
    initialForfeitType,
    playerName,
    courseName,
    onClose,
    onSave,
    finalDataByGroup,
    playerScoreLogs,
    scores
}: ScoreEditModalProps) => {
    const [localScore, setLocalScore] = useState(initialScore);
    const [localForfeitType, setLocalForfeitType] = useState(initialForfeitType);
    const { toast } = useToast();

    useEffect(() => {
        if (open) {
            setLocalScore(initialScore);
            setLocalForfeitType(initialForfeitType);
        }
    }, [open, playerId, courseId, holeIndex, initialScore, initialForfeitType]);

    const handleLocalSave = async () => {
        await onSave(localScore, localForfeitType);
    };

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>점수 수정</DialogTitle>
                    <DialogDescription>
                        선수: <b>{playerName}</b> / 코스: <b>{courseName}</b> / 홀: <b>{holeIndex + 1}번</b>
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-center gap-4 py-4">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-12 w-12"
                        onClick={() => {
                            const currentScore = localScore === '' ? null : Number(localScore);
                            let newScore: number;
                            if (currentScore === null) {
                                newScore = 1;
                            } else if (currentScore === 0) {
                                newScore = 1;
                            } else if (currentScore >= 10) {
                                newScore = 10;
                            } else {
                                newScore = currentScore + 1;
                            }
                            setLocalScore(String(newScore));
                            if (newScore > 0) {
                                setLocalForfeitType(null);
                            }
                        }}
                    >
                        <ChevronUp className="h-6 w-6" />
                    </Button>
                    <span className={cn(
                        "font-bold tabular-nums text-center min-w-[80px]",
                        (localScore === "0" || Number(localScore) === 0) ? "text-xs text-red-600" : "text-4xl"
                    )}>
                        {(localScore === "0" || Number(localScore) === 0) ?
                            (localForfeitType === 'absent' ? '불참' :
                                localForfeitType === 'disqualified' ? '실격' :
                                    localForfeitType === 'forfeit' ? '기권' : '기권') :
                            (localScore === '' ? '-' : localScore)}
                    </span>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-12 w-12"
                        onClick={() => {
                            const currentScore = localScore === '' ? null : Number(localScore);
                            let newScore: number | null;
                            let newForfeitType: 'absent' | 'disqualified' | 'forfeit' | null = localForfeitType;

                            if (currentScore === null || currentScore === 0) {
                                if (currentScore === null) {
                                    newScore = 1;
                                    newForfeitType = null;
                                } else {
                                    newScore = 0;
                                    if (newForfeitType === null || newForfeitType === 'absent') {
                                        newForfeitType = 'disqualified';
                                    } else if (newForfeitType === 'disqualified') {
                                        newForfeitType = 'forfeit';
                                    } else if (newForfeitType === 'forfeit') {
                                        newForfeitType = 'absent';
                                    }
                                }
                            } else if (currentScore === 1) {
                                newScore = 0;
                                newForfeitType = 'absent';
                            } else {
                                newScore = currentScore - 1;
                                newForfeitType = null;
                            }

                            setLocalScore(newScore === null ? '' : String(newScore));
                            setLocalForfeitType(newForfeitType);
                        }}
                    >
                        <ChevronDown className="h-6 w-6" />
                    </Button>
                </div>
                <DialogFooter>
                    <Button onClick={handleLocalSave}>저장</Button>
                    <Button variant="outline" onClick={onClose}>취소</Button>
                    {(localScore === "0" || Number(localScore) === 0) && (
                        <Button
                            className="bg-yellow-500 hover:bg-yellow-600 text-white ml-2"
                            onClick={async () => {
                                if (!db) {
                                    toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
                                    return;
                                }

                                // Firebase 인증 확인
                                const isAuthenticated = await ensureAuthenticated();
                                if (!isAuthenticated) {
                                    toast({
                                        title: '인증 실패',
                                        description: 'Firebase 인증에 실패했습니다. 페이지를 새로고침해주세요.',
                                        variant: 'destructive'
                                    });
                                    return;
                                }
                                const player = Object.values(finalDataByGroup).flat().find((p: any) => p.id === playerId) as any;
                                if (!player) return;
                                const logs = playerScoreLogs[player.id] || [];
                                let restored = false;
                                try {
                                    const backupRef = ref(db, `backups/scoresBeforeForfeit/${player.id}`);
                                    const backupSnap = await get(backupRef);
                                    if (backupSnap.exists()) {
                                        const backup = backupSnap.val();
                                        await set(ref(db, `scores/${player.id}`), backup?.data || {});
                                        await set(backupRef, null);
                                        restored = true;
                                    }
                                } catch (e) {
                                    console.warn('백업 복원 실패, 로그 기반 복원으로 폴백합니다:', e);
                                }

                                if (!restored) {
                                    let anyRestored = false;
                                    for (const course of player.assignedCourses) {
                                        for (let h = 1; h <= 9; h++) {
                                            if (scores?.[player.id]?.[course.id]?.[h] === 0) {
                                                const zeroLogIdx = logs.findIndex(l =>
                                                    l.holeNumber === h &&
                                                    l.newValue === 0 &&
                                                    (l.modifiedByType === 'judge' || l.modifiedByType === 'admin' || l.modifiedByType === 'captain')
                                                );
                                                let restoreValue = null;
                                                if (zeroLogIdx !== -1) {
                                                    for (let j = zeroLogIdx - 1; j >= 0; j--) {
                                                        const l = logs[j];
                                                        if (
                                                            l.holeNumber === h &&
                                                            l.newValue !== 0 &&
                                                            l.newValue !== null &&
                                                            l.newValue !== undefined
                                                        ) {
                                                            restoreValue = l.newValue;
                                                            break;
                                                        }
                                                    }
                                                }
                                                await set(ref(db, `scores/${player.id}/${course.id}/${h}`), restoreValue);
                                                await logScoreChange({
                                                    matchId: 'tournaments/current',
                                                    playerId: player.id,
                                                    scoreType: 'holeScore',
                                                    courseId: course.id,
                                                    holeNumber: h,
                                                    oldValue: 0,
                                                    newValue: restoreValue === null ? 0 : restoreValue,
                                                    modifiedBy: 'admin',
                                                    modifiedByType: 'admin',
                                                    comment: '기권 해제 복구'
                                                });
                                                invalidatePlayerLogCache(player.id);
                                                anyRestored = true;
                                            }
                                        }
                                    }
                                    restored = anyRestored;
                                }

                                if (restored) {
                                    try {
                                        const playerScoresSnap = await get(ref(db, `scores/${player.id}`));
                                        if (playerScoresSnap.exists()) {
                                            const fixed: any = {};
                                            const data = playerScoresSnap.val() || {};
                                            Object.keys(data).forEach((courseId: string) => {
                                                const holes = data[courseId] || {};
                                                Object.keys(holes).forEach((h: string) => {
                                                    if (holes[h] === 0) {
                                                        if (!fixed[courseId]) fixed[courseId] = {};
                                                        fixed[courseId][h] = null;
                                                    }
                                                });
                                            });
                                            if (Object.keys(fixed).length > 0) {
                                                const merged: any = { ...data };
                                                Object.keys(fixed).forEach((cid: string) => {
                                                    merged[cid] = { ...(merged[cid] || {}), ...fixed[cid] };
                                                });
                                                await set(ref(db, `scores/${player.id}`), merged);
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('0점 정리 실패(무시):', e);
                                    }
                                    toast({ title: '기권 해제 완료', description: '이전 점수로 복구되었습니다.' });
                                    try {
                                        await getPlayerScoreLogsOptimized(player.id);
                                    } catch { }
                                } else {
                                    toast({ title: '복구할 점수가 없습니다.', description: '이미 기권이 해제된 상태입니다.' });
                                }
                                onClose();
                            }}
                        >
                            기권/불참/실격 해제
                        </Button>
                    )}
                    {(localScore === "0" || Number(localScore) === 0) && (
                        <div className="w-full text-center text-sm text-yellow-700 mt-2">기권/불참/실격 처리 이전의 모든 점수를 복구합니다.</div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

ScoreEditModal.displayName = 'ScoreEditModal';

export default ScoreEditModal;
