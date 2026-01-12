"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getPlayerScoreLogs, getPlayerScoreLogsOptimized, ScoreLog, logScoreChange, invalidatePlayerLogCache } from '@/lib/scoreLogs';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import * as XLSX from 'xlsx-js-style'; // Dynamic import used below instead
import { db } from '@/lib/firebase';
import { ref, onValue, set, get, query, limitToLast, onChildChanged, off, update, onChildAdded, onChildRemoved } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import ExternalScoreboardInfo from '@/components/ExternalScoreboardInfo';
import { safeLocalStorageGetItem, safeLocalStorageSetItem, safeLocalStorageRemoveItem, cn } from '@/lib/utils';
import {
    Download, Filter, Printer, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
    Calendar as CalendarIcon, MapPin, Trophy, Search, Settings, Save, RefreshCw,
    Trash2, Share2, Copy, Check, AlertCircle, Info, ExternalLink, Menu, X, Plus,
    Minus, List, LayoutGrid, Clock, MoreVertical, Eye, EyeOff, Lock, Unlock,
    Gavel, Play, Square, Award, Target, Hash, Users, User
} from 'lucide-react';

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
    forfeitType: 'absent' | 'disqualified' | 'forfeit' | null; // 기권 타입 추가
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
    totalPar: number; // 파합계
    plusMinus: number | null; // ±타수
    type: 'individual' | 'team'; // 선수 타입 추가
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
        if (!course || course.id === undefined || course.id === null) continue; // 안전장치
        const courseId = course.id;
        const aScoreObj = a.courseScores || {};
        const bScoreObj = b.courseScores || {};
        const aCourseScore = aScoreObj[courseId] ?? 0;
        const bCourseScore = bScoreObj[courseId] ?? 0;
        if (aCourseScore !== bCourseScore) {
            return aCourseScore - bCourseScore;
        }
    }

    // 홀별 백카운트: 마지막 코스부터 역순으로 각 코스의 홀 점수 비교
    // 모든 홀 점수가 0이면 다음 코스로 넘어감
    if (sortedCourses.length > 0) {
        for (const course of sortedCourses) {
            if (!course || course.id === undefined || course.id === null) continue; // 안전장치
            const courseId = course.id;
            const aDetailObj = a.detailedScores || {};
            const bDetailObj = b.detailedScores || {};
            const aHoleScores = aDetailObj[courseId] || {};
            const bHoleScores = bDetailObj[courseId] || {};
            let hasNonZeroScore = false;

            // 9번 홀부터 1번 홀까지 역순으로 비교
            for (let i = 9; i >= 1; i--) {
                const hole = i.toString();
                const aHole = aHoleScores[hole] || 0;
                const bHole = bHoleScores[hole] || 0;

                // 0이 아닌 점수가 있으면 이 코스에서 비교 진행
                if (aHole > 0 || bHole > 0) {
                    hasNonZeroScore = true;
                }

                // 점수가 다르면 비교 결과 반환
                if (aHole !== bHole) {
                    return aHole - bHole;
                }
            }

            // 이 코스의 모든 홀 점수가 0이면 다음 코스로 넘어감
            // hasNonZeroScore가 false면 모두 0이므로 다음 코스 확인
            // (차이를 확인하지 못하고 여기 도달한 경우 다음 코스 계속 비교)
        }
    }

    return 0;
};

// 파합계(기본파) 계산 함수
function getTotalParForPlayer(courses: any, assignedCourses: any[]) {
    let total = 0;
    assignedCourses.forEach(course => {
        const courseData = courses[course.id];
        if (courseData && Array.isArray(courseData.pars)) {
            total += courseData.pars.reduce((a: number, b: number) => a + (b || 0), 0);
        }
    });
    return total;
}

// 점수 수정 모달 컴포넌트 (로컬 상태로 관리하여 부모 리렌더링 방지)
const ScoreEditModalComponent = React.memo(({
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
}: {
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
}) => {
    const [localScore, setLocalScore] = useState(initialScore);
    const [localForfeitType, setLocalForfeitType] = useState(initialForfeitType);
    const { toast } = useToast();

    // 모달이 열릴 때 초기값 설정
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
                                        const logs = await getPlayerScoreLogsOptimized(player.id);
                                        // setPlayerScoreLogs는 부모에서 관리하므로 여기서는 호출하지 않음
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

// 🏆 Archive Modal Component (Memoized for Performance)
const ArchiveModalComponent = React.memo(({
    open,
    onOpenChange,
    tournamentName,
    initialDate,
    onConfirm
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tournamentName: string;
    initialDate: string;
    onConfirm: (location: string, date: string) => Promise<void>;
}) => {
    const [location, setLocation] = useState('');
    const [date, setDate] = useState(initialDate);

    useEffect(() => {
        if (open) {
            setDate(initialDate);
            setLocation('');
        }
    }, [open, initialDate]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>대회 기록 보관</DialogTitle>
                    <DialogDescription>
                        현재 대회의 모든 데이터를 보관함에 저장합니다.<br />
                        보관된 데이터는 갤러리에서 확인할 수 있습니다.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="name" className="text-right text-sm font-bold">
                            대회명
                        </label>
                        <input
                            id="name"
                            value={tournamentName}
                            disabled
                            className="col-span-3 flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="location" className="text-right text-sm font-bold text-blue-600">
                            장소
                        </label>
                        <input
                            id="location"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="예: 잠실 파크골프장 A/B 코스"
                            className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="date" className="text-right text-sm font-bold text-blue-600">
                            날짜
                        </label>
                        <div className="col-span-3 flex gap-2 relative">
                            <input
                                id="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                placeholder="예: 2024.10.25 (또는 기간/회차)"
                                className="flex-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                            <div className="relative">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-10 w-10 shrink-0 border-slate-200"
                                    onClick={() => (document.getElementById('native-date-picker') as HTMLInputElement)?.showPicker()}
                                >
                                    <CalendarIcon className="h-4 w-4 text-slate-500" />
                                </Button>
                                <input
                                    type="date"
                                    id="native-date-picker"
                                    className="absolute opacity-0 pointer-events-none p-0 w-0 h-0"
                                    onChange={(e) => {
                                        const selectedDate = e.target.value;
                                        if (selectedDate) {
                                            const existingSuffix = date.includes(' ') ? date.substring(date.indexOf(' ')) : '';
                                            setDate(selectedDate + existingSuffix);
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
                    <Button onClick={() => onConfirm(location, date)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">보관하기</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

// 외부 전광판과 완전히 동일한 ± 및 총타수 계산 함수
function getPlayerTotalAndPlusMinus(courses: any, player: any) {
    let total = 0;
    let parTotal = 0;
    let playedHoles = 0;
    player.assignedCourses.forEach((course: any) => {
        const courseData = courses[course.id];
        const holeScores = player.coursesData[course.id]?.holeScores || [];
        if (courseData && Array.isArray(courseData.pars)) {
            for (let i = 0; i < 9; i++) {
                const score = holeScores[i];
                const par = courseData.pars[i] ?? null;
                if (typeof score === 'number' && typeof par === 'number') {
                    total += score;
                    parTotal += par;
                    playedHoles++;
                }
            }
        }
    });
    return playedHoles > 0 ? { total, plusMinus: total - parTotal } : { total: null, plusMinus: null };
}

export default function AdminDashboard() {
    // 안전한 number 체크 함수
    const isValidNumber = (v: any) => typeof v === 'number' && !isNaN(v);

    const { toast } = useToast();
    const router = useRouter();

    // 🚀 핵심 상태 관리 (최상단 통합)
    const [players, setPlayers] = useState<any>({});
    const [scores, setScores] = useState<any>({});
    const [courses, setCourses] = useState<any>({});
    const [groupsData, setGroupsData] = useState<any>({});
    const [filterGroup, setFilterGroup] = useState('all');
    const [tournamentName, setTournamentName] = useState('골프 대회');

    const [isSavingImage, setIsSavingImage] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [resumeSeq, setResumeSeq] = useState(0);
    const activeUnsubsRef = useRef<(() => void)[]>([]);
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<any>(null);
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<any>(null);
    const [individualBackcountApplied, setIndividualBackcountApplied] = useState<{ [groupName: string]: boolean }>({});
    const [teamBackcountApplied, setTeamBackcountApplied] = useState<{ [groupName: string]: boolean }>({});
    const [individualNTPData, setIndividualNTPData] = useState<any>(null);
    const [teamNTPData, setTeamNTPData] = useState<any>(null);
    const [notifiedSuddenDeathGroups, setNotifiedSuddenDeathGroups] = useState<string[]>([]);
    const [scoreCheckModal, setScoreCheckModal] = useState<{ open: boolean, groupName: string, missingScores: any[], resultMsg?: string }>({ open: false, groupName: '', missingScores: [] });

    // 선수별 점수 로그 캐시 상태
    const [playerScoreLogs, setPlayerScoreLogs] = useState<{ [playerId: string]: ScoreLog[] }>({});

    // 🚀 데이터 사용량 모니터링
    const [dataUsage, setDataUsage] = useState({
        totalDownloaded: 0,
        lastUpdate: Date.now(),
        downloadsPerMinute: 0
    });

    const [searchPlayer, setSearchPlayer] = useState('');
    const [highlightedPlayerId, setHighlightedPlayerId] = useState<number | null>(null);
    const playerRowRefs = useRef<Record<string, (HTMLTableRowElement | null)[]>>({});

    // 🏆 Archive Modal States
    const [archiveModalOpen, setArchiveModalOpen] = useState(false);
    const [archiveLocation, setArchiveLocation] = useState('');
    const [archiveDate, setArchiveDate] = useState('');

    // 🟢 점수 수정 모달 상태
    const [scoreEditModal, setScoreEditModal] = useState({
        open: false,
        playerId: '',
        courseId: '',
        holeIndex: -1,
        score: '',
        forfeitType: null as 'absent' | 'disqualified' | 'forfeit' | null,
        playerName: '',
        courseName: ''
    });

    // 점수 초기화 모달 상태
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // 인쇄 모달 상태
    const [printModal, setPrintModal] = useState({
        open: false,
        orientation: 'portrait' as 'portrait' | 'landscape',
        paperSize: 'A4' as 'A4' | 'A3',
        selectedGroups: [] as string[],
        showAllGroups: true,
        selectedCourses: [] as string[],
        showAllCourses: true
    });

    // 🟢 점수 초기화 동기화 처리를 위한 Ref
    const lastProcessedResetAt = useRef<number | null>(null);

    const [autoFilling, setAutoFilling] = useState(false);

    // 🚀 모든 그룹 목록 추출 (스코프 문제 해결)
    const allGroupsList = useMemo(() => {
        return Object.keys(groupsData).sort();
    }, [groupsData]);

    // 🚀 성능 최적화: tieBreak 결과 캐싱
    const tieBreakCacheRef = useRef<Map<string, number>>(new Map());
    const MAX_CACHE_SIZE = 10000;

    // 🚀 성능 최적화: 캐싱된 tieBreak 함수
    const cachedTieBreak = useCallback((a: any, b: any, sortedCourses: any[]) => {
        // 코스 ID만 추출하여 키 생성 (이름 제외 등 불필요한 연산 제거)
        // sortedCourses가 변하지 않는 한 id들의 조합은 동일하므로 id만 쓰면 됨
        const courseIds = sortedCourses.map(c => c?.id).join(',');
        const cacheKey = `${a.id},${b.id},${courseIds}`;
        const reverseCacheKey = `${b.id},${a.id},${courseIds}`;

        if (tieBreakCacheRef.current.has(cacheKey)) {
            return tieBreakCacheRef.current.get(cacheKey)!;
        }

        if (tieBreakCacheRef.current.has(reverseCacheKey)) {
            const cachedValue = tieBreakCacheRef.current.get(reverseCacheKey)!;
            const result = -cachedValue;
            if (tieBreakCacheRef.current.size < MAX_CACHE_SIZE) {
                tieBreakCacheRef.current.set(cacheKey, result);
            }
            return result;
        }

        const result = tieBreak(a, b, sortedCourses);

        if (tieBreakCacheRef.current.size < MAX_CACHE_SIZE) {
            tieBreakCacheRef.current.set(cacheKey, result);
        } else {
            const firstKey = tieBreakCacheRef.current.keys().next().value;
            if (firstKey) {
                tieBreakCacheRef.current.delete(firstKey);
                tieBreakCacheRef.current.set(cacheKey, result);
            }
        }

        return result;
    }, []);

    // 🟢 메모리 최적화 - 의존성 최소화 및 조건부 계산 (스코프 문제 해결을 위해 상단 이동)
    const processedDataByGroup = useMemo(() => {
        try {
            const allCoursesList = Object.values(courses).filter(Boolean);
            if (Object.keys(players).length === 0 || allCoursesList.length === 0) return {};

            // 모든 선수 처리 (filterGroup은 표시용 필터이지 데이터 처리 필터가 아님)
            const playersToProcess = Object.entries(players);

            const allProcessedPlayers: any[] = playersToProcess.map(([playerId, player]: [string, any]) => {
                const playerGroupData = groupsData[player.group];
                // 코스 순서 정보 가져오기 (기존 호환성: boolean → number 변환)
                const coursesOrder = playerGroupData?.courses || {};
                const assignedCourseIds = Object.keys(coursesOrder).filter((cid: string) => {
                    const raw = coursesOrder[cid];
                    if (typeof raw === 'object' && raw !== null) return raw.order > 0;
                    // boolean이면 true인 것만, number면 0보다 큰 것만
                    return typeof raw === 'boolean' ? raw : (typeof raw === 'number' && raw > 0);
                });
                // courses 객체에서 해당 id만 찾아 배열로 만듦 (id 타입 일치 보장)
                const coursesForPlayer = assignedCourseIds
                    .map(cid => {
                        // courses가 배열인 경우와 객체인 경우 모두 대응
                        if (Array.isArray(courses)) {
                            return courses.find((c: any) => String(c?.id) === String(cid));
                        }
                        return courses[cid];
                    })
                    .filter(Boolean);
                // 코스 순서대로 정렬 (order가 큰 것이 마지막 = 백카운트 기준)
                coursesForPlayer.sort((a: any, b: any) => {
                    const orderA = coursesOrder[String(a.id)];
                    const orderB = coursesOrder[String(b.id)];

                    // 그룹의 courses에서 순서 가져오기, 없으면 코스의 order 사용
                    let numA: number;
                    if (typeof orderA === 'object' && orderA !== null) {
                        numA = orderA.order || 0;
                    } else if (typeof orderA === 'boolean') {
                        numA = orderA ? (a.order || 0) : 0;
                    } else if (typeof orderA === 'number' && orderA > 0) {
                        numA = orderA;
                    } else {
                        numA = a.order || 0;
                    }

                    let numB: number;
                    if (typeof orderB === 'object' && orderB !== null) {
                        numB = orderB.order || 0;
                    } else if (typeof orderB === 'boolean') {
                        numB = orderB ? (b.order || 0) : 0;
                    } else if (typeof orderB === 'number' && orderB > 0) {
                        numB = orderB;
                    } else {
                        numB = b.order || 0;
                    }

                    return numA - numB; // 작은 순서가 먼저
                });
                // 백카운트를 위한 상세 점수 구성
                const courseScores: { [key: string]: number } = {};
                const detailedScores: { [key: string]: { [hole: string]: number } } = {};
                let total = 0;
                let playedAnyHole = false;

                coursesForPlayer.forEach((course: any) => {
                    const pScores = scores[playerId]?.[course.id] || {};
                    let cTotal = 0;
                    detailedScores[course.id] = {};

                    for (let h = 1; h <= 9; h++) {
                        const s = pScores[h];
                        if (isValidNumber(s)) {
                            cTotal += s;
                            total += s;
                            detailedScores[course.id][h] = s;
                            playedAnyHole = true;
                        }
                    }
                    courseScores[course.id] = cTotal;
                });

                // coursesData 필드 구성 (UI 렌더링용)
                const coursesDataForPlayer: { [key: string]: any } = {};
                coursesForPlayer.forEach((course: any) => {
                    const pScores = scores[playerId]?.[course.id] || {};
                    const holeScores = Array.from({ length: 9 }, (_, i) => {
                        const s = pScores[i + 1];
                        return isValidNumber(s) ? s : null;
                    });
                    coursesDataForPlayer[course.id] = {
                        courseName: course.name,
                        courseTotal: courseScores[course.id] || 0,
                        holeScores: holeScores
                    };
                });

                // 외부 전광판과 동일한 ± 및 총타수 계산
                const { total: totalScore, plusMinus } = getPlayerTotalAndPlusMinus(courses, {
                    assignedCourses: coursesForPlayer,
                    coursesData: coursesDataForPlayer
                });

                return {
                    id: playerId,
                    ...player,
                    totalScore: totalScore ?? 0,
                    hasAnyScore: playedAnyHole,
                    hasForfeited: (() => {
                        // 모든 배정 코스의 모든 홀이 0점인지 확인
                        if (coursesForPlayer.length === 0) return false;
                        let hasZeroScore = false;
                        for (const course of coursesForPlayer) {
                            const pScores = scores[playerId]?.[course.id] || {};
                            for (let h = 1; h <= 9; h++) {
                                if (pScores[h] === 0) {
                                    hasZeroScore = true;
                                    break;
                                }
                            }
                            if (hasZeroScore) break;
                        }

                        // 0점이 있으면 기권 타입 추출 (나중에 로그에서 가져올 예정)
                        return hasZeroScore ? 'pending' : null;
                    })(),
                    assignedCourses: coursesForPlayer,
                    plusMinus,
                    // 백카운트 계산을 위한 데이터 추가
                    courseScores,
                    detailedScores,
                    coursesData: coursesDataForPlayer, // UI 렌더링을 위해 추가
                    total: total // tieBreak 함수에서 사용
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

            // 모든 그룹 순위 계산 (filterGroup은 표시용 필터이지 데이터 처리 필터가 아님)
            const rankedData: { [key: string]: ProcessedPlayer[] } = {};
            const groupsToRank = Object.keys(groupedData);

            for (const groupName of groupsToRank) {
                // 코스 순서 기반으로 정렬 (order가 큰 것이 마지막 = 백카운트 기준)
                const groupPlayers = groupedData[groupName];
                const groupData = groupsData[groupName];
                const coursesOrder = groupData?.courses || {};
                const allCoursesForGroup = [...(groupPlayers[0]?.assignedCourses || [])].filter(c => c && c.id !== undefined);
                // 코스 순서대로 정렬 (order가 큰 것이 마지막)
                const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                    const orderA = coursesOrder[String(a.id)];
                    const orderB = coursesOrder[String(b.id)];

                    // 그룹의 courses에서 순서 가져오기, 없으면 코스의 order 사용
                    let numA: number;
                    if (typeof orderA === 'object' && orderA !== null) {
                        numA = orderA.order || 0;
                    } else if (typeof orderA === 'boolean') {
                        numA = orderA ? (a.order || 0) : 0;
                    } else if (typeof orderA === 'number' && orderA > 0) {
                        numA = orderA;
                    } else {
                        numA = a.order || 0;
                    }

                    let numB: number;
                    if (typeof orderB === 'object' && orderB !== null) {
                        numB = orderB.order || 0;
                    } else if (typeof orderB === 'boolean') {
                        numB = orderB ? (b.order || 0) : 0;
                    } else if (typeof orderB === 'number' && orderB > 0) {
                        numB = orderB;
                    } else {
                        numB = b.order || 0;
                    }

                    return numA - numB; // 작은 순서가 먼저
                });
                // 백카운트는 마지막 코스부터 역순이므로 reverse
                const coursesForBackcount = [...coursesForGroup].reverse();

                const playersToSort = groupedData[groupName].filter((p: any) => p.hasAnyScore && !p.hasForfeited);
                const otherPlayers = groupedData[groupName].filter((p: any) => !p.hasAnyScore || p.hasForfeited);
                if (playersToSort.length > 0) {
                    // 1. plusMinus 오름차순 정렬, tieBreak(백카운트) 적용
                    playersToSort.sort((a: any, b: any) => {
                        if (a.plusMinus !== b.plusMinus) return a.plusMinus - b.plusMinus;
                        return cachedTieBreak(a, b, coursesForBackcount);
                    });
                    // 2. 1위 동점자 모두 rank=1, 그 다음 선수부터 등수 건너뛰기
                    const minPlusMinus = playersToSort[0].plusMinus;
                    let rank = 1;
                    let oneRankCount = 0;
                    // 1위 동점자 처리
                    for (let i = 0; i < playersToSort.length; i++) {
                        if (playersToSort[i].plusMinus === minPlusMinus) {
                            playersToSort[i].rank = 1;
                            oneRankCount++;
                        } else {
                            break;
                        }
                    }
                    // 2위 이하(실제로는 1위 동점자 수+1 등수부터) 백카운트 등수 부여
                    rank = oneRankCount + 1;
                    for (let i = oneRankCount; i < playersToSort.length; i++) {
                        // 바로 앞 선수와 plusMinus, tieBreak 모두 같으면 같은 등수, 아니면 증가
                        const prev = playersToSort[i - 1];
                        const curr = playersToSort[i];
                        if (
                            curr.plusMinus === prev.plusMinus &&
                            cachedTieBreak(curr, prev, coursesForBackcount) === 0
                        ) {
                            curr.rank = playersToSort[i - 1].rank;
                        } else {
                            curr.rank = rank;
                        }
                        rank++;
                    }
                }
                const finalPlayers = [...playersToSort, ...otherPlayers.map((p: any) => ({ ...p, rank: null }))];
                rankedData[groupName] = finalPlayers;
            }
            return rankedData;
        } catch (error) {
            console.error("Critical Error in processedDataByGroup:", error);
            return {}; // 오류 발생 시 빈 객체 반환하여 렌더링 충돌 방지
        }
    }, [players, scores, courses, groupsData, cachedTieBreak]);

    const processSuddenDeath = (suddenDeathData: any) => {
        if (!suddenDeathData) return [];

        const processOne = (sd: any) => {
            if (!sd?.isActive || !sd.players || !sd.holes || !Array.isArray(sd.holes)) return [];
            const participatingPlayerIds = Object.keys(sd.players).filter(id => sd.players[id]);
            const results: any[] = participatingPlayerIds.map(id => {
                const playerInfo: any = players[id];
                if (!playerInfo) return null;
                const name = playerInfo.type === 'team' ? `${playerInfo.p1_name} / ${playerInfo.p2_name}` : playerInfo.name;
                let totalScore = 0;
                let holesPlayed = 0;
                sd.holes.forEach((hole: number) => {
                    const score = sd.scores?.[id]?.[hole];
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
                if (i > 0 && (results[i].holesPlayed < results[i - 1].holesPlayed || (results[i].holesPlayed === results[i - 1].holesPlayed && results[i].totalScore > results[i - 1].totalScore))) {
                    rank = i + 1;
                }
                results[i].rank = rank;
            }
            return results;
        };

        if (suddenDeathData.isActive) return processOne(suddenDeathData);
        if (typeof suddenDeathData === 'object') {
            let allResults: any[] = [];
            Object.values(suddenDeathData).forEach((groupSd: any) => {
                if (groupSd && groupSd.isActive) allResults = allResults.concat(processOne(groupSd));
            });
            return allResults;
        }
        return [];
    };

    const processedIndividualSuddenDeathData = useMemo(() => processSuddenDeath(individualSuddenDeathData), [individualSuddenDeathData, players]);
    const processedTeamSuddenDeathData = useMemo(() => processSuddenDeath(teamSuddenDeathData), [teamSuddenDeathData, players]);

    const applyPlayoffRanking = (data: any) => {
        const finalData = JSON.parse(JSON.stringify(data));
        for (const groupName in finalData) {
            const groupPlayers = finalData[groupName];
            if (!groupPlayers || groupPlayers.length === 0) continue;

            const playerType = groupPlayers[0].type;
            const isIndividual = playerType === 'individual';

            // 1. NTP 순위 적용 (등수와 관계없이 NTP 데이터가 있으면 적용)
            const baseNtpData = isIndividual ? individualNTPData : teamNTPData;
            let ntpDataForGroup: any = null;
            if (baseNtpData) {
                if (baseNtpData.isActive && baseNtpData.rankings) ntpDataForGroup = baseNtpData;
                else if (typeof baseNtpData === 'object' && !baseNtpData.isActive) {
                    const groupNtp = baseNtpData[groupName];
                    if (groupNtp?.isActive && groupNtp.rankings) ntpDataForGroup = groupNtp;
                }
            }

            const shouldApplyNTP = !!(ntpDataForGroup && ntpDataForGroup.isActive && ntpDataForGroup.rankings);
            if (shouldApplyNTP) {
                const ntpRankings = ntpDataForGroup.rankings;

                groupPlayers.forEach((player: any) => {
                    const ntpRank = ntpRankings[player.id];
                    if (ntpRank !== undefined && ntpRank !== null) {
                        player.rank = ntpRank;
                    }
                });

                // NTP 적용 후 재정렬
                groupPlayers.sort((a: any, b: any) => {
                    const rankA = a.rank === null ? Infinity : a.rank;
                    const rankB = b.rank === null ? Infinity : b.rank;
                    if (rankA !== rankB) return rankA - rankB;
                    return (a.totalScore || Infinity) - (b.totalScore || Infinity);
                });
            }

            // 2. 백카운트 적용 (1위 동점자에 대해서만)
            const firstPlacePlayers = groupPlayers.filter((p: any) => p.rank === 1);
            if (firstPlacePlayers.length > 1) {
                const backcountState = isIndividual ? individualBackcountApplied : teamBackcountApplied;
                const shouldApplyBackcount = !!(backcountState && (backcountState[groupName] || backcountState['*']));

                if (shouldApplyBackcount) {
                    const groupData = groupsData[groupName];
                    const coursesOrder = groupData?.courses || {};
                    const allCoursesForGroup = firstPlacePlayers[0]?.assignedCourses || Object.values(courses);
                    const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                        const orderA = coursesOrder[String(a.id)];
                        const orderB = coursesOrder[String(b.id)];

                        let numA: number;
                        if (typeof orderA === 'object' && orderA !== null) {
                            numA = orderA.order || 0;
                        } else if (typeof orderA === 'number') {
                            numA = orderA;
                        } else {
                            numA = orderA ? (a.order || 0) : 0;
                        }

                        let numB: number;
                        if (typeof orderB === 'object' && orderB !== null) {
                            numB = orderB.order || 0;
                        } else if (typeof orderB === 'number') {
                            numB = orderB;
                        } else {
                            numB = orderB ? (b.order || 0) : 0;
                        }

                        return numA - numB;
                    });
                    const sortedCoursesForBackcount = [...coursesForGroup].reverse();

                    firstPlacePlayers.sort((a: any, b: any) => {
                        if (a.plusMinus !== b.plusMinus) return a.plusMinus - b.plusMinus;
                        for (const course of sortedCoursesForBackcount) {
                            if (!course?.id) continue;
                            const aScore = (a.courseScores || {})[course.id] ?? 0;
                            const bScore = (b.courseScores || {})[course.id] ?? 0;
                            if (aScore !== bScore) return aScore - bScore;
                        }
                        if (sortedCoursesForBackcount.length > 0) {
                            const lastCourseId = sortedCoursesForBackcount[0].id;
                            const aHoleScores = (a.detailedScores || {})[lastCourseId] || {};
                            const bHoleScores = (b.detailedScores || {})[lastCourseId] || {};
                            for (let i = 9; i >= 1; i--) {
                                const aH = aHoleScores[i.toString()] || 0;
                                const bH = bHoleScores[i.toString()] || 0;
                                if (aH !== bH) return aH - bH;
                            }
                        }
                        return 0;
                    });

                    let rank = 1;
                    firstPlacePlayers[0].rank = rank;
                    for (let i = 1; i < firstPlacePlayers.length; i++) {
                        const prev = firstPlacePlayers[i - 1];
                        const curr = firstPlacePlayers[i];
                        if (curr.plusMinus !== prev.plusMinus) rank = i + 1;
                        else {
                            let isDifferent = false;
                            for (const course of sortedCoursesForBackcount) {
                                if (!course?.id) continue;
                                if (((curr.courseScores || {})[course.id] ?? 0) !== ((prev.courseScores || {})[course.id] ?? 0)) {
                                    isDifferent = true;
                                    break;
                                }
                            }
                            if (!isDifferent && sortedCoursesForBackcount.length > 0) {
                                const lastCourseId = sortedCoursesForBackcount[0].id;
                                for (let j = 9; j >= 1; j--) {
                                    if (((curr.detailedScores || {})[lastCourseId]?.[j.toString()] || 0) !== ((prev.detailedScores || {})[lastCourseId]?.[j.toString()] || 0)) {
                                        isDifferent = true;
                                        break;
                                    }
                                }
                            }
                            if (isDifferent) rank = i + 1;
                        }
                        curr.rank = rank;
                    }
                    groupPlayers.sort((a: any, b: any) => {
                        const rankA = a.rank === null ? Infinity : a.rank;
                        const rankB = b.rank === null ? Infinity : b.rank;
                        if (rankA !== rankB) return rankA - rankB;
                        return (a.totalScore || Infinity) - (b.totalScore || Infinity);
                    });
                }
            }
        }
        return finalData;
    };

    // 기권 타입을 로그에서 추출하여 설정하는 함수
    const getForfeitTypeFromLogs = useCallback((playerId: string): 'absent' | 'disqualified' | 'forfeit' | null => {
        const logs = playerScoreLogs[playerId] || [];
        const forfeitLogs = logs
            .filter(l => l.newValue === 0 && (l.modifiedByType === 'judge' || l.modifiedByType === 'admin') && l.comment)
            .sort((a, b) => b.modifiedAt - a.modifiedAt); // 최신순 정렬

        if (forfeitLogs.length > 0) {
            const latestLog = forfeitLogs[0];
            if (latestLog.comment?.includes('불참')) return 'absent';
            if (latestLog.comment?.includes('실격')) return 'disqualified';
            if (latestLog.comment?.includes('기권')) return 'forfeit';
        }
        return null;
    }, [playerScoreLogs]);

    const finalDataByGroup = useMemo(() => {
        const rankMap = new Map();
        [...processedIndividualSuddenDeathData, ...processedTeamSuddenDeathData].forEach(p => rankMap.set(p.id, p.rank));

        let finalData = processedDataByGroup;
        if (rankMap.size > 0) {
            finalData = JSON.parse(JSON.stringify(processedDataByGroup));
            for (const groupName in finalData) {
                finalData[groupName].forEach((player: ProcessedPlayer) => {
                    if (rankMap.has(player.id)) player.rank = rankMap.get(player.id);
                });
                finalData[groupName].sort((a, b) => {
                    const rA = a.rank === null ? Infinity : a.rank;
                    const rB = b.rank === null ? Infinity : b.rank;
                    if (rA !== rB) return rA - rB;
                    return (a.totalScore || Infinity) - (b.totalScore || Infinity);
                });
            }
        }

        // 🟢 기권 타입 업데이트 통합
        const playoffApplied = applyPlayoffRanking(finalData);
        if (playerScoreLogs && Object.keys(playerScoreLogs).length > 0) {
            const finalWithForfeits = { ...playoffApplied };
            Object.keys(finalWithForfeits).forEach(groupName => {
                finalWithForfeits[groupName] = finalWithForfeits[groupName].map((player: ProcessedPlayer) => {
                    if (player.hasForfeited) {
                        const forfeitType = getForfeitTypeFromLogs(player.id);
                        return { ...player, forfeitType: forfeitType || 'forfeit' };
                    }
                    return player;
                });
            });
            return finalWithForfeits;
        }

        return playoffApplied;
    }, [processedDataByGroup, processedIndividualSuddenDeathData, processedTeamSuddenDeathData, individualBackcountApplied, teamBackcountApplied, individualNTPData, teamNTPData, courses, groupsData, playerScoreLogs, getForfeitTypeFromLogs]);






    // 기권 처리 모달 상태 - 구현 유실 방지를 위해 주석 유지
    // const [forfeitModal, setForfeitModal] = useState<{ open: boolean, player: any | null }>({ open: false, player: null });

    // 기록 보관하기(아카이브) - 실제 구현은 추후
    const handleArchiveScores = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }
        try {
            // 대회명 및 시작 날짜 추출 (tournaments/current에서 직접 읽기)
            const tournamentRef = ref(db, 'tournaments/current');
            let tournamentName = '';
            let tournamentStartDate = '';
            await new Promise<void>((resolve) => {
                onValue(tournamentRef, (snap) => {
                    const tournamentData = snap.val() || {};
                    tournamentName = tournamentData.name || '대회';
                    // 시작 날짜가 있으면 사용, 없으면 현재 날짜 사용
                    if (tournamentData.startDate) {
                        tournamentStartDate = tournamentData.startDate;
                    } else {
                        const now = new Date();
                        const pad = (n: number) => n.toString().padStart(2, '0');
                        tournamentStartDate = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
                    }
                    resolve();
                }, { onlyOnce: true });
            });
            // 날짜+시간
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            // archiveId: 대회명(공백제거)_YYYYMM 형식
            const archiveId = `${(tournamentName || '대회').replace(/\s/g, '')}_${tournamentStartDate.substring(0, 6)}`; // 대회명_YYYYMM 형식
            // 참가자 수
            const playerCount = Object.keys(players).length;
            // 저장 데이터
            const archiveData = {
                savedAt: now.toISOString(),
                tournamentName: tournamentName || '대회',
                tournamentStartDate: tournamentStartDate, // 대회 시작 날짜 추가
                playerCount,
                players,
                scores,
                courses,
                groups: groupsData,
                processedByGroup: finalDataByGroup // 그룹별 순위/점수 등 가공 데이터 추가 저장 (실격/불참/기권 구분 포함)
            };
            await set(ref(db, `archives/${archiveId}`), archiveData);
            toast({ title: '기록 보관 완료', description: `대회명: ${tournamentName || '대회'} / 참가자: ${playerCount}명` });
        } catch (e: any) {
            toast({ title: '보관 실패', description: e?.message || '알 수 없는 오류', variant: 'destructive' });
        }
    };

    const handlePrint = () => {
        // 현재 선택된 그룹에 따라 인쇄할 그룹 설정
        const groupsToPrint = filterGroup === 'all' ? allGroupsList : [filterGroup];

        // 가용한 코스 목록 추출
        const availableCoursesList = new Set<string>();
        Object.values(finalDataByGroup).forEach((playersList: any) => {
            playersList.forEach((p: any) => {
                p.assignedCourses?.forEach((c: any) => {
                    const cName = p.coursesData[c.id]?.courseName || c.name;
                    if (cName) availableCoursesList.add(cName);
                });
            });
        });

        setPrintModal({
            open: true,
            orientation: 'portrait',
            paperSize: 'A4',
            selectedGroups: groupsToPrint,
            showAllGroups: filterGroup === 'all',
            selectedCourses: Array.from(availableCoursesList).sort(),
            showAllCourses: true
        });
    };

    // 인쇄 HTML 생성 함수
    const generatePrintHTML = () => {
        const groupsToPrint = printModal.showAllGroups ? allGroupsList : printModal.selectedGroups;
        let printContent = '';

        // CSS 스타일
        const styles = `
            <style>
                @media print {
                    @page {
                        size: ${printModal.paperSize} ${printModal.orientation};
                        margin: 1cm;
                    }
                }
                body {
                    font-family: 'Arial', sans-serif;
                    margin: 0;
                    padding: 20px;
                }
                .print-header {
                    background: linear-gradient(135deg, #1e3a8a, #3b82f6);
                    color: white;
                    padding: 12px;
                    text-align: center;
                    margin-bottom: 15px;
                    border-radius: 8px;
                }
                .print-header h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: bold;
                }
                .print-header p {
                    margin: 2px 0 0 0;
                    font-size: 14px;
                    opacity: 0.9;
                }
                .group-section {
                    page-break-inside: avoid;
                    margin-bottom: 25px;
                }
                .group-title {
                    background: #f8fafc;
                    color: #1e293b;
                    padding: 8px 12px;
                    font-size: 18px;
                    font-weight: bold;
                    border-left: 4px solid #3b82f6;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .group-title-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .group-title-english {
                    font-size: 14px;
                    font-weight: 500;
                    color: #64748b;
                    margin-left: 10px;
                }
                .score-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 15px;
                    font-size: 14px;
                    table-layout: auto;
                }
                .score-table th {
                    background: #f1f5f9;
                    color: #1e293b;
                    padding: 6px 2px;
                    border: 1px solid #94a3b8;
                    text-align: center;
                    font-weight: bold;
                    font-size: 13px;
                    white-space: nowrap;
                    line-height: 1.2;
                }
                .score-table th .header-korean {
                    display: block;
                    font-size: 13px;
                    margin-bottom: 1px;
                }
                .score-table th .header-english {
                    display: block;
                    font-size: 10px;
                    font-weight: 500;
                    color: #64748b;
                }
                .score-table td {
                    padding: 5px 4px;
                    border: 1px solid #94a3b8;
                    text-align: center;
                    vertical-align: middle;
                    font-size: 15px;
                }
                /* 반응형 컬럼 스타일 */
                .responsive-column {
                    min-width: 0;
                    max-width: none;
                    width: auto;
                    white-space: nowrap;
                    overflow: visible;
                    text-overflow: clip;
                    padding: 6px 8px;
                }
                /* 고정 너비 컬럼 스타일 */
                .fixed-column {
                    width: 5%;
                    min-width: 30px;
                    max-width: 40px;
                    padding: 6px 4px;
                }
                /* 테이블 레이아웃 조정 */
                .score-table {
                    table-layout: auto;
                    width: 100%;
                }
                /* 순위 컬럼 최소 너비 */
                .rank-cell.responsive-column {
                    min-width: 50px;
                }
                /* 조 컬럼 최소 너비 */
                .responsive-column:nth-child(2) {
                    min-width: 30px;
                }
                /* 선수명 컬럼 최소 너비 */
                .player-name.responsive-column {
                    min-width: 120px;
                }
                /* 소속 컬럼 최소 너비 */
                .affiliation.responsive-column {
                    min-width: 80px;
                }
                /* 코스 컬럼 최소 너비 */
                .course-name.responsive-column {
                    min-width: 100px;
                }
                .rank-cell {
                    font-weight: 800;
                    font-size: 22px;
                    color: #1e40af;
                    background-color: #f8fafc;
                }
                .player-name {
                    font-weight: bold;
                    font-size: 16px;
                    color: #1e293b;
                }
                .affiliation {
                    color: #64748b;
                    font-size: 14px;
                }
                .course-name {
                    font-weight: bold;
                    font-size: 14px;
                    color: #059669;
                }
                .hole-score {
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                    font-size: 15px;
                }
                .course-total {
                    font-weight: 800;
                    font-size: 18px;
                    color: #dc2626;
                    background-color: #fffafb;
                }
                .pm-score {
                    font-size: 10px;
                    font-weight: 700;
                    margin-left: 2px;
                    vertical-align: middle;
                }
                .pm-plus { color: #dc2626; }
                .pm-minus { color: #2563eb; }
                .pm-even { color: #64748b; }
                .total-score {
                    font-weight: 800;
                    font-size: 22px;
                    color: #1e40af;
                    background-color: #f0f7ff;
                }
                .forfeit {
                    color: #dc2626;
                    font-weight: bold;
                }
                .page-break {
                    page-break-before: always;
                }
                .player-tbody {
                    page-break-inside: avoid;
                }
                .print-footer {
                    margin-top: 30px;
                    text-align: center;
                    color: #64748b;
                    font-size: 12px;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 10px;
                }
                @media print {
                    .no-print { display: none !important; }
                    [data-sidebar="trigger"], 
                    .sidebar-wrapper,
                    nav,
                    header,
                    button {
                        display: none !important;
                    }
                    .player-tbody {
                        page-break-inside: avoid;
                    }
                }
            </style>
        `;

        // 헤더
        const header = `
            <div class="print-header">
                <h1>🏌️‍♂️ ${tournamentName}</h1>
                <p>인쇄일시: ${new Date().toLocaleString('ko-KR')}</p>
            </div>
        `;

        // 각 그룹별 점수표 생성
        groupsToPrint.forEach((groupName, groupIndex) => {
            const groupPlayers = finalDataByGroup[groupName];
            if (!groupPlayers || groupPlayers.length === 0) return;

            // 그룹 섹션 시작 (첫 번째 그룹이 아니면 페이지 나누기)
            if (groupIndex > 0) {
                printContent += '<div class="page-break"></div>';
            }

            const groupNameEnglish = getGroupNameEnglish(groupName);
            printContent += `
                <div class="group-section">
                    <div class="group-title">
                        <div class="group-title-left">
                            <span>📊</span>
                            <span>${groupName} 그룹</span>
                            <span class="group-title-english">${groupNameEnglish}</span>
                        </div>
                    </div>
                    <table class="score-table">
                        <thead>
                            <tr>
                                <th class="responsive-column">
                                    <span class="header-korean">순위</span>
                                    <span class="header-english">Rank</span>
                                </th>
                                <th class="responsive-column">
                                    <span class="header-korean">조</span>
                                    <span class="header-english">Group</span>
                                </th>
                                <th class="responsive-column">
                                    <span class="header-korean">선수명(팀명)</span>
                                    <span class="header-english">Player Name (Team)</span>
                                </th>
                                <th class="responsive-column">
                                    <span class="header-korean">소속</span>
                                    <span class="header-english">Club</span>
                                </th>
                                <th class="responsive-column">
                                    <span class="header-korean">코스</span>
                                    <span class="header-english">Course</span>
                                </th>
                                <th class="fixed-column">1</th>
                                <th class="fixed-column">2</th>
                                <th class="fixed-column">3</th>
                                <th class="fixed-column">4</th>
                                <th class="fixed-column">5</th>
                                <th class="fixed-column">6</th>
                                <th class="fixed-column">7</th>
                                <th class="fixed-column">8</th>
                                <th class="fixed-column">9</th>
                                <th class="fixed-column">
                                    <span class="header-korean">합계</span>
                                    <span class="header-english">Sum</span>
                                </th>
                                <th class="fixed-column">
                                    <span class="header-korean">총타수</span>
                                    <span class="header-english">Total</span>
                                </th>
                            </tr>
                        </thead>
            `;

            groupPlayers.forEach((player: any) => {
                // 각 선수마다 개별 tbody 시작
                printContent += `<tbody class="player-tbody">`;

                if (player.assignedCourses.length > 0) {
                    // 선택된 코스만 필터링
                    const filteredCourses = printModal.showAllCourses
                        ? player.assignedCourses
                        : player.assignedCourses.filter((c: any) => {
                            const cName = player.coursesData[c.id]?.courseName || c.name;
                            return printModal.selectedCourses.includes(cName);
                        });

                    if (filteredCourses.length > 0) {
                        filteredCourses.forEach((course: any, courseIndex: number) => {
                            const courseData = player.coursesData[course.id];
                            const holeScores = courseData?.holeScores || Array(9).fill(null);

                            printContent += `
                                <tr>
                                    ${courseIndex === 0 ? `
                                        <td rowspan="${filteredCourses.length}" class="rank-cell responsive-column">
                                            ${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}
                                        </td>
                                        <td rowspan="${filteredCourses.length}" class="responsive-column">${player.jo}</td>
                                        <td rowspan="${filteredCourses.length}" class="player-name responsive-column">${player.name}</td>
                                        <td rowspan="${filteredCourses.length}" class="affiliation responsive-column">${player.affiliation || '-'}</td>
                                    ` : ''}
                                    <td class="course-name responsive-column">${courseData?.courseName || (course.name ? (course.name.includes('-') ? course.name.split('-')[1] : course.name) : 'Course')}</td>
                            `;

                            // 홀별 점수
                            holeScores.forEach((score: number | null, holeIdx: number) => {
                                let scoreContent = score !== null ? score.toString() : '-';

                                // ±타수 추가 (점수가 있고 Par 정보가 있는 경우)
                                const par = (courses as any)?.[course.id]?.pars?.[holeIdx];
                                if (score !== null && score > 0 && typeof par === 'number') {
                                    const pm = score - par;
                                    const pmText = pm === 0 ? 'E' : (pm > 0 ? `+${pm}` : pm);
                                    const pmClass = pm === 0 ? 'pm-even' : (pm > 0 ? 'pm-plus' : 'pm-minus');
                                    scoreContent += ` <span class="pm-score ${pmClass}">${pmText}</span>`;
                                }

                                printContent += `<td class="hole-score fixed-column">${scoreContent}</td>`;
                            });

                            // 코스 합계
                            const courseTotal = courseData?.courseTotal || 0;
                            printContent += `<td class="course-total fixed-column">${courseTotal}</td>`;

                            // 총타수 (첫 번째 코스에서만 표시)
                            if (courseIndex === 0) {
                                const totalText = player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-');
                                printContent += `<td rowspan="${filteredCourses.length}" class="total-score responsive-column">${totalText}</td>`;
                            }

                            printContent += '</tr>';
                        });
                    } else {
                        // 선택된 코스가 선수에게 없는 경우
                        printContent += `
                        <tr>
                            <td class="rank-cell responsive-column">${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}</td>
                            <td class="responsive-column">${player.jo}</td>
                            <td class="player-name responsive-column">${player.name}</td>
                            <td class="affiliation responsive-column">${player.affiliation || '-'}</td>
                            <td colspan="11" style="text-align: center; color: #64748b;">선택된 코스 데이터 없음</td>
                            <td class="total-score responsive-column">${player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-')}</td>
                        </tr>
                    `;
                    }
                } else {
                    // 배정된 코스가 없는 경우
                    printContent += `
                    <tr>
                        <td class="rank-cell responsive-column">${player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : '')}</td>
                        <td class="responsive-column">${player.jo}</td>
                        <td class="player-name responsive-column">${player.name}</td>
                        <td class="affiliation responsive-column">${player.affiliation || '-'}</td>
                        <td colspan="11" style="text-align: center; color: #64748b;">배정된 코스 없음</td>
                        <td class="total-score responsive-column">${player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-')}</td>
                    </tr>
                `;
                }

                // 각 선수의 tbody 종료
                printContent += `</tbody>`;
            });

            printContent += `
                    </table>
                </div>
            `;
        });

        // 푸터
        const footer = `
            <div class="print-footer">
                <p>🏆 ${tournamentName} - ParkScore 시스템으로 생성된 공식 점수표입니다.</p>
            </div>
        `;

        // 전체 HTML 구성
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${tournamentName}</title>
                ${styles}
            </head>
            <body>
                ${header}
                ${printContent}
                ${footer}
            </body>
            </html>
        `;
    };

    // 인쇄 실행
    const executePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast({ title: '인쇄 실패', description: '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.', variant: 'destructive' });
            return;
        }

        const fullHtml = generatePrintHTML();
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        printWindow.focus();

        // 인쇄 다이얼로그 열기
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);

        setPrintModal({ ...printModal, open: false });
        toast({ title: '인쇄 준비 완료', description: '인쇄 다이얼로그가 열립니다.' });
    };

    // 미리보기 실행
    const showPreview = () => {
        const previewWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes');
        if (!previewWindow) {
            toast({ title: '미리보기 실패', description: '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.', variant: 'destructive' });
            return;
        }

        const fullHtml = generatePrintHTML();
        previewWindow.document.write(fullHtml);
        previewWindow.document.close();
        previewWindow.focus();
    };

    // 점수 초기화 기능
    const handleResetScores = async () => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }
        try {
            if (filterGroup === 'all') {
                // 1. Firebase 데이터 삭제 (전체)
                await Promise.all([
                    set(ref(db, 'scores'), null),
                    set(ref(db, 'scoreLogs'), null),
                    set(ref(db, 'batchScoringHistory'), null),
                    set(ref(db, 'tournaments/current/suddenDeath'), null),
                    set(ref(db, 'tournaments/current/backcountApplied'), null),
                    set(ref(db, 'tournaments/current/nearestToPin'), null),
                    set(ref(db, 'tournaments/current/ranks'), null),
                    set(ref(db, 'tournaments/current/lastResetAt'), Date.now())
                ]);

                // 2. Client-side 저장소 정리
                sessionStorage.removeItem('selfScoringTempData');
                try {
                    if (typeof window !== 'undefined' && window.localStorage) {
                        const keysToRemove: string[] = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && (
                                key.startsWith('selfScoringDraft_') ||
                                key.startsWith('selfScoringSign_') ||
                                key.startsWith('selfScoringSignTeam_') ||
                                key.startsWith('selfScoringPostSignLock_')
                            )) {
                                keysToRemove.push(key);
                            }
                        }
                        keysToRemove.forEach(k => safeLocalStorageRemoveItem(k));
                    }
                } catch (error) {
                    console.error('localStorage 초기화 실패:', error);
                }
            } else {
                // 특정 그룹만 초기화
                const groupPlayers = finalDataByGroup[filterGroup] || [];
                const playerIds = groupPlayers.map((p: any) => p.id);
                const scoreUpdates: any = {};

                groupPlayers.forEach((player: any) => {
                    if (player.assignedCourses) {
                        player.assignedCourses.forEach((course: any) => {
                            scoreUpdates[`${player.id}/${course.id}`] = null;
                        });
                    }
                });

                // 1. Firebase 데이터 삭제 (특정 그룹)
                if (Object.keys(scoreUpdates).length > 0) {
                    await update(ref(db, 'scores'), scoreUpdates);

                    // 로그 삭제 (해당 그룹 선수들의 로그만)
                    try {
                        const logsRef = ref(db, 'scoreLogs');
                        const snapshot = await get(logsRef);
                        if (snapshot.exists()) {
                            const logUpdates: any = {};
                            snapshot.forEach((childSnapshot) => {
                                const logData = childSnapshot.val();
                                if (logData && playerIds.includes(logData.playerId)) {
                                    logUpdates[childSnapshot.key] = null;
                                }
                            });
                            if (Object.keys(logUpdates).length > 0) {
                                await update(ref(db, 'scoreLogs'), logUpdates);
                            }
                        }
                    } catch (error) {
                        console.error('scoreLogs 초기화 실패:', error);
                    }

                    // 일괄 입력 이력 삭제 (해당 그룹)
                    try {
                        await set(ref(db, `batchScoringHistory/${filterGroup}`), null);
                    } catch (error) {
                        console.error('batchScoringHistory 초기화 실패:', error);
                    }

                    // 서든데스/NTP/백카운트 데이터 삭제 (해당 그룹)
                    try {
                        await Promise.all([
                            set(ref(db, `tournaments/current/suddenDeath/individual/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/suddenDeath/team/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/backcountApplied/individual/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/backcountApplied/team/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/nearestToPin/individual/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/nearestToPin/team/${filterGroup}`), null),
                            set(ref(db, `tournaments/current/groups/${filterGroup}/lastResetAt`), Date.now())
                        ]);
                    } catch (error) {
                        console.error('플레이오프 설정 초기화 실패:', error);
                    }
                }

                // 2. Client-side 저장소 정리 (특정 그룹)
                // sessionStorage 정리
                const savedData = sessionStorage.getItem('selfScoringTempData');
                if (savedData) {
                    try {
                        const data = JSON.parse(savedData);
                        if (data.scores) {
                            playerIds.forEach((pid: string) => {
                                delete data.scores[pid];
                            });
                            if (Object.keys(data.scores).length === 0) {
                                sessionStorage.removeItem('selfScoringTempData');
                            } else {
                                sessionStorage.setItem('selfScoringTempData', JSON.stringify(data));
                            }
                        }
                    } catch (error) {
                        console.error('sessionStorage 초기화 실패:', error);
                    }
                }

                // localStorage 정리
                try {
                    const coursesForGroup = Object.keys(groupsData[filterGroup]?.courses || {});
                    coursesForGroup.forEach(courseId => {
                        const suffix = `_${courseId}_${filterGroup}_1`;
                        safeLocalStorageRemoveItem(`selfScoringDraft${suffix}`);
                        safeLocalStorageRemoveItem(`selfScoringSign${suffix}`);
                        safeLocalStorageRemoveItem(`selfScoringSignTeam${suffix}`);
                        safeLocalStorageRemoveItem(`selfScoringPostSignLock${suffix}`);
                    });
                } catch (e) { }
            }

            // 3. UI 상태 업데이트
            if (filterGroup === 'all') {
                setScores({}); // 즉시 로컬 점수 상태 비움
                setPlayerScoreLogs({});
            } else {
                const groupPlayers = finalDataByGroup[filterGroup] || [];
                const playerIds = groupPlayers.map((p: any) => p.id);

                // 로컬 점수 상태에서 해당 그룹 선수들만 제거
                setScores((prev: any) => {
                    const next = { ...prev };
                    playerIds.forEach((pid: string) => delete next[pid]);
                    return next;
                });

                setPlayerScoreLogs((prev: any) => {
                    const newLogs = { ...prev };
                    playerIds.forEach((player: any) => {
                        delete newLogs[player?.id || player];
                    });
                    return newLogs;
                });
            }

            toast({
                title: '초기화 완료',
                description: filterGroup === 'all'
                    ? '모든 점수가 초기화되었습니다.'
                    : `${filterGroup} 그룹의 점수가 초기화되었습니다.`
            });
        } catch (e) {
            console.error('초기화 실패:', e);
            toast({ title: '초기화 실패', description: '점수 초기화 중 오류가 발생했습니다.', variant: 'destructive' });
        } finally {
            setShowResetConfirm(false);
        }
    };

    // 점수 저장 임시 함수(실제 저장/재계산 로직은 추후 구현)
    const handleScoreEditSave = async (scoreToSave?: string, forfeitTypeToSave?: 'absent' | 'disqualified' | 'forfeit' | null) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }
        const score = scoreToSave !== undefined ? scoreToSave : scoreEditModal.score;
        const forfeitType = forfeitTypeToSave !== undefined ? forfeitTypeToSave : scoreEditModal.forfeitType;
        const { playerId, courseId, holeIndex } = scoreEditModal;
        if (!playerId || !courseId || holeIndex === -1) {
            setScoreEditModal(prev => ({ ...prev, open: false }));
            return;
        }
        try {
            const scoreValue = score === '' ? null : Number(score);
            // 0점(기권/불참/실격) 입력 시 또는 점수가 없고 forfeitType이 있는 경우: 소속 그룹의 모든 코스/홀에 0점 입력
            if (scoreValue === 0 || (scoreValue === null && scoreEditModal.forfeitType)) {
                // forfeitType이 없으면 기본값으로 'forfeit' 설정
                const effectiveForfeitType = forfeitType || 'forfeit';

                // 선수 정보 찾기
                const player = players[playerId];
                if (player && player.group && groupsData[player.group]) {
                    const group = groupsData[player.group];
                    // 대량 0점 입력 전에 선수 점수 백업 생성(1회성)
                    try {
                        const playerScoresSnap = await get(ref(db, `scores/${playerId}`));
                        if (playerScoresSnap.exists()) {
                            const backupRef = ref(db, `backups/scoresBeforeForfeit/${playerId}`);
                            const backupSnap = await get(backupRef);
                            if (!backupSnap.exists()) {
                                await set(backupRef, { data: playerScoresSnap.val(), createdAt: Date.now() });
                            }
                        }
                    } catch (e) {
                        console.warn('백업 저장 실패(무시):', e);
                    }

                    // 기권 타입에 따른 메시지
                    const forfeitTypeText = effectiveForfeitType === 'absent' ? '불참' :
                        effectiveForfeitType === 'disqualified' ? '실격' : '기권';

                    // 그룹에 배정된 코스 id 목록
                    const assignedCourseIds = group.courses ? Object.keys(group.courses).filter((cid: any) => group.courses[cid]) : [];

                    // 병렬 처리로 성능 최적화: 모든 점수 저장과 로그 기록을 병렬로 처리
                    const updatePromises: Promise<void>[] = [];

                    for (const cid of assignedCourseIds) {
                        for (let h = 1; h <= 9; h++) {
                            const prevScore = scores?.[playerId]?.[cid]?.[h];
                            const oldValue = prevScore === undefined || prevScore === null ? 0 : prevScore;

                            // 점수 저장과 로그 기록을 병렬로 처리
                            const isDirectEdit = cid === courseId && h === holeIndex + 1;
                            const comment = isDirectEdit
                                ? `관리자 직접 ${forfeitTypeText} (코스: ${cid}, 홀: ${h})`
                                : `관리자페이지에서 ${forfeitTypeText} 처리 (코스: ${cid}, 홀: ${h})`;

                            // 점수 저장과 로그 기록을 하나의 Promise로 묶어서 병렬 처리
                            updatePromises.push(
                                (async () => {
                                    await set(ref(db, `scores/${playerId}/${cid}/${h}`), 0);
                                    await logScoreChange({
                                        matchId: 'tournaments/current',
                                        playerId,
                                        scoreType: 'holeScore',
                                        holeNumber: h,
                                        oldValue: oldValue,
                                        newValue: 0,
                                        modifiedBy: 'admin',
                                        modifiedByType: 'admin',
                                        comment: comment,
                                        courseId: cid
                                    });
                                })()
                            );
                        }
                    }

                    // 모든 업데이트를 병렬로 실행
                    await Promise.all(updatePromises);

                    // 실시간 업데이트를 위한 로그 캐시 무효화 (한 번만)
                    invalidatePlayerLogCache(playerId);
                }
                setScoreEditModal(prev => ({ ...prev, open: false }));
                // 점수 로그 재조회 (최적화됨)
                try {
                    const logs = await getPlayerScoreLogsOptimized(playerId);
                    setPlayerScoreLogs((prev: any) => ({ ...prev, [playerId]: logs }));
                } catch { }
                toast({ title: '점수 저장 완료', description: '점수가 성공적으로 저장되었습니다.' });
                return;
            }
            // 기존 점수 조회(0점이 아닐 때만 기존 방식)
            const prevScore = scores?.[playerId]?.[courseId]?.[holeIndex + 1] ?? null;

            // 점수 저장과 로그 기록을 병렬로 처리하여 성능 최적화
            if (prevScore !== scoreValue) {
                try {
                    // 점수 저장과 로그 기록을 병렬로 실행
                    await Promise.all([
                        set(ref(db, `scores/${playerId}/${courseId}/${holeIndex + 1}`), scoreValue),
                        logScoreChange({
                            matchId: 'tournaments/current',
                            playerId,
                            scoreType: 'holeScore',
                            holeNumber: holeIndex + 1,
                            oldValue: prevScore || 0,
                            newValue: scoreValue || 0,
                            modifiedBy: 'admin',
                            modifiedByType: 'admin',
                            comment: `코스: ${courseId}`,
                            courseId: courseId
                        })
                    ]);

                    // 실시간 업데이트를 위한 로그 캐시 무효화
                    invalidatePlayerLogCache(playerId);

                    // 점수 로그 저장 후 해당 선수 로그 즉시 갱신 (최적화됨) - 비동기로 처리하여 저장 속도 향상
                    getPlayerScoreLogsOptimized(playerId)
                        .then(logs => {
                            setPlayerScoreLogs((prev: any) => ({
                                ...prev,
                                [playerId]: logs
                            }));
                        })
                        .catch(e => {
                            console.error("점수 로그 재조회 에러", e);
                        });
                } catch (e) {
                    console.error("로그 기록 에러", e);
                }
            } else {
                // 점수가 변경되지 않았어도 저장은 수행 (null -> null 등)
                await set(ref(db, `scores/${playerId}/${courseId}/${holeIndex + 1}`), scoreValue);
            }
            setScoreEditModal(prev => ({ ...prev, open: false }));
            toast({ title: '점수 저장 완료', description: '점수가 성공적으로 저장되었습니다.' });
        } catch (e) {
            console.error("점수 저장 에러", e);
            setScoreEditModal(prev => ({ ...prev, open: false }));
            toast({
                title: '점수 저장 실패',
                description: e instanceof Error ? e.message : '점수 저장 중 오류가 발생했습니다.',
                variant: 'destructive'
            });
        }
    };
    // 항상 현재 도메인 기준으로 절대주소 생성
    const externalScoreboardUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/scoreboard`
        : '/scoreboard';

    // 그룹별 순위/백카운트/서든데스 상태 체크 함수
    const getGroupRankStatusMsg = (groupName: string) => {
        const groupPlayers = finalDataByGroup[groupName];
        if (!groupPlayers || groupPlayers.length === 0) return '선수 데이터가 없습니다.';
        const completedPlayers = groupPlayers.filter((p: any) => p.hasAnyScore && !p.hasForfeited);
        if (completedPlayers.length === 0) return '점수 입력된 선수가 없습니다.';
        // 1위 동점자 체크 (서든데스 필요 여부)
        const firstRankPlayers = completedPlayers.filter((p: any) => p.rank === 1);
        if (firstRankPlayers.length > 1) {
            return `1위 동점자(${firstRankPlayers.length}명)가 있습니다. 서든데스가 필요합니다.`;
        }
        // 정상적으로 순위가 모두 부여된 경우
        return '순위 계산이 정상적으로 완료되었습니다.';
    };

    // 누락 점수 0점 처리 함수 (컴포넌트 상단에 위치)
    const handleAutoFillZero = async () => {
        if (!scoreCheckModal.missingScores.length) return;
        setAutoFilling(true);
        try {
            const { ref, set } = await import('firebase/database');
            if (!db) return;
            const database = db;
            const promises = scoreCheckModal.missingScores.map(item =>
                set(ref(database, `scores/${item.playerId}/${item.courseId}/${item.hole}`), 0)
            );
            await Promise.all(promises);
            toast({ title: '누락 점수 자동 입력 완료', description: `${scoreCheckModal.missingScores.length}개 점수가 0점으로 입력되었습니다.` });
            // 0점 입력 후, 순위/백카운트/서든데스 상태 안내
            setScoreCheckModal({ open: true, groupName: scoreCheckModal.groupName, missingScores: [], resultMsg: getGroupRankStatusMsg(scoreCheckModal.groupName) });
        } catch (e: any) {
            toast({ title: '자동 입력 실패', description: e?.message || '오류가 발생했습니다.' });
            setScoreCheckModal({ ...scoreCheckModal, open: false });
        }
        setAutoFilling(false);
    };

    // 점수 누락 체크 함수 (컴포넌트 상단에 위치)
    const checkGroupScoreCompletion = (groupName: string, groupPlayers: any[]) => {
        const missingScores: { playerId: string; playerName: string; courseId: string; courseName: string; hole: number }[] = [];
        groupPlayers.forEach((player: any) => {
            if (!player.assignedCourses) return;
            player.assignedCourses.forEach((course: any) => {
                const courseId = course.id;
                const courseName = course.name;
                for (let hole = 1; hole <= 9; hole++) {
                    const score = scores?.[player.id]?.[courseId]?.[hole];
                    if (score === undefined || score === null) {
                        missingScores.push({
                            playerId: player.id,
                            playerName: player.name,
                            courseId,
                            courseName,
                            hole
                        });
                    }
                }
            });
        });

        // 점수 누락이 없으면 서든데스 체크 및 순위/백카운트/서든데스 상태 안내
        if (missingScores.length === 0) {
            // 서든데스 상황 체크 추가
            const playersInGroup = finalDataByGroup[groupName];
            if (playersInGroup) {
                const tiedFirstPlace = playersInGroup.filter((p: ProcessedPlayer) => p.rank === 1);

                if (tiedFirstPlace.length > 1) {
                    // 플레이오프 필요 시 토스트 알림
                    toast({
                        title: `🚨 플레이오프 관리 필요: ${groupName}`,
                        description: `${groupName} 그룹의 경기가 완료되었으며, 1위 동점자가 발생했습니다. 플레이오프 관리가 필요합니다.`,
                        action: (
                            <ToastAction altText="관리하기" onClick={() => router.push('/admin/suddendeath')}>
                                관리하기
                            </ToastAction>
                        ),
                        duration: 30000
                    });

                    // 이미 알림을 보냈으므로 notifiedSuddenDeathGroups에 추가하여 중복 방지
                    setNotifiedSuddenDeathGroups(prev => {
                        if (!prev.includes(groupName)) {
                            return [...prev, groupName];
                        }
                        return prev;
                    });
                }
            }

            // 기존 모달 표시 (순위/백카운트/서든데스 상태 안내)
            setScoreCheckModal({ open: true, groupName, missingScores, resultMsg: getGroupRankStatusMsg(groupName) });
        } else {
            setScoreCheckModal({ open: true, groupName, missingScores });
        }
    };

    useEffect(() => {
        if (!db) return;

        // 🟢 기본 설정 데이터는 항상 구독 (용량이 작음)
        const tournamentRef = ref(db, 'tournaments/current');
        const tournamentNameRef = ref(db, 'tournaments/current/name');
        const individualSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/individual');
        const teamSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/team');
        const individualBackcountRef = ref(db, 'tournaments/current/backcountApplied/individual');
        const teamBackcountRef = ref(db, 'tournaments/current/backcountApplied/team');
        const individualNTPRef = ref(db, 'tournaments/current/nearestToPin/individual');
        const teamNTPRef = ref(db, 'tournaments/current/nearestToPin/team');

        // 🟢 메인 데이터 구독 - 해시 기반 중복 방지
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');

        // 해시 변수들은 각 구독 내부에서 선언

        // 🚀 혁신적 최적화: 변경된 데이터만 다운로드

        // 🛡️ 외부 전광판과 동일한 초기 데이터 로딩 방식
        if (!initialDataLoaded) {
            let loadedCount = 0;
            const checkAllLoaded = () => {
                loadedCount++;
                if (loadedCount >= 3) { // Players, Scores, Tournament 모두 로드되면
                    setInitialDataLoaded(true);
                }
            };

            // Players 초기 로드
            const unsubInitialPlayers = onValue(playersRef, snap => {
                const data = snap.val() || {};
                setPlayers(data);
                checkAllLoaded();
            });

            // Scores 초기 로드 (한 번만)
            const unsubInitialScores = onValue(scoresRef, snap => {
                const data = snap.val() || {};
                setScores(data);
                checkAllLoaded();
            }, { onlyOnce: true });

            // Tournament 초기 로드
            const unsubInitialTournament = onValue(tournamentRef, snap => {
                const data = snap.val() || {};
                setCourses(data.courses || {});
                setGroupsData(data.groups || {});
                checkAllLoaded();
            });

            // 3초 후에도 로딩이 안 되면 강제로 로딩 완료
            const fallbackTimer = setTimeout(() => {
                if (!initialDataLoaded) {
                    setInitialDataLoaded(true);
                }
            }, 3000);

            // 구독 등록
            activeUnsubsRef.current.push(unsubInitialPlayers);
            activeUnsubsRef.current.push(unsubInitialScores);
            activeUnsubsRef.current.push(unsubInitialTournament);
            activeUnsubsRef.current.push(() => clearTimeout(fallbackTimer));
        }

        // 🛡️ 초기 데이터 로딩 후 실시간 업데이트 (외부 전광판과 동일)
        if (initialDataLoaded) {

            // Players: 변경된 선수만 감지 (외부 전광판과 완전히 동일)
            let lastPlayersHash = '';
            const unsubPlayersChanges = onChildChanged(playersRef, snap => {
                const playerId = snap.key;
                const playerData = snap.val();
                if (playerId && playerData) {
                    setPlayers((prev: any) => {
                        const newPlayers = { ...prev, [playerId]: playerData };
                        const newHash = JSON.stringify(newPlayers);
                        if (newHash !== lastPlayersHash) {
                            lastPlayersHash = newHash;
                            return newPlayers;
                        }
                        return prev;
                    });
                }
            });

            // Scores: 실시간 최적화 반영 (변경된 건만 수신하여 데이터 사용량 99% 절감)
            const handleScoreSync = (snap: any) => {
                const playerId = snap.key;
                const playerData = snap.val();
                if (playerId) {
                    setScores((prev: any) => {
                        // 초기 로딩 중에는 onChildAdded가 트리거될 수 있으므로 중복 체크
                        if (prev && prev[playerId] && JSON.stringify(prev[playerId]) === JSON.stringify(playerData)) {
                            return prev;
                        }
                        return { ...prev, [playerId]: playerData };
                    });
                    try { invalidatePlayerLogCache(playerId); } catch (e) { }
                }
            };

            const unsubScoresChanged = onChildChanged(scoresRef, handleScoreSync);
            const unsubScoresAdded = onChildAdded(scoresRef, handleScoreSync);
            const unsubScoresRemoved = onChildRemoved(scoresRef, snap => {
                const playerId = snap.key;
                if (playerId) {
                    setScores((prev: any) => {
                        const next = { ...prev };
                        delete next[playerId];
                        return next;
                    });
                }
            });
            /* DEPRECATED LOGIC:
            // const unsubScores = onValue(scoresRef, snap => {
            //    const data = snap.val() || {};
    
            //    setScores((prev: any) => {
                    // 최적화: 전체 객체 직렬화 대신 빠른 참조 및 키 비교
    
                    // 1. 참조가 같으면 변경 없음
                    if (prev === data) {
                        return prev;
                    }
    
                    // 2. 키 개수 비교 (빠른 1차 필터)
                    const prevKeys = prev ? Object.keys(prev) : [];
                    const newKeys = Object.keys(data);
    
                    if (prevKeys.length !== newKeys.length) {
                        // 키 개수가 다르면 변경됨 -> 모든 변경된 선수 로그 캐시 무효화
                        const changedPlayerIds = [...new Set([...prevKeys, ...newKeys])];
                        changedPlayerIds.forEach(playerId => {
                            try {
                                invalidatePlayerLogCache(playerId);
                            } catch (e) { }
                        });
                        return data;
                    }
    
                    // 3. 변경된 선수만 감지 (깊은 비교 최소화)
                    const changedPlayerIds: string[] = [];
                    for (const playerId of newKeys) {
                        const prevScores = prev[playerId];
                        const newScores = data[playerId];
    
                        // 참조가 같으면 변경 없음
                        if (prevScores === newScores) continue;
    
                        // null/undefined 체크
                        if (!prevScores || !newScores) {
                            changedPlayerIds.push(playerId);
                            continue;
                        }
    
                        // 키 개수 비교 (빠른 필터)
                        const prevScoreKeys = Object.keys(prevScores);
                        const newScoreKeys = Object.keys(newScores);
                        if (prevScoreKeys.length !== newScoreKeys.length) {
                            changedPlayerIds.push(playerId);
                            continue;
                        }
    
                        // 코스별 점수 비교 (최소한의 깊은 비교)
                        let hasChanged = false;
                        for (const courseId of newScoreKeys) {
                            const prevCourseScores = prevScores[courseId];
                            const newCourseScores = newScores[courseId];
    
                            // 참조가 같으면 변경 없음
                            if (prevCourseScores === newCourseScores) continue;
    
                            // 객체 비교 (홀별 점수)
                            if (typeof prevCourseScores === 'object' && typeof newCourseScores === 'object') {
                                const prevHoles = Object.keys(prevCourseScores || {});
                                const newHoles = Object.keys(newCourseScores || {});
                                if (prevHoles.length !== newHoles.length) {
                                    hasChanged = true;
                                    break;
                                }
                                // 홀별 점수 값 비교
                                for (const hole of newHoles) {
                                    if (prevCourseScores[hole] !== newCourseScores[hole]) {
                                        hasChanged = true;
                                        break;
                                    }
                                }
                                if (hasChanged) break;
                            } else if (prevCourseScores !== newCourseScores) {
                                hasChanged = true;
                                break;
                            }
                        }
    
                        if (hasChanged) {
                            changedPlayerIds.push(playerId);
                        }
                    }
    
                    // 변경사항이 없으면 이전 상태 유지
                    if (changedPlayerIds.length === 0) {
                        return prev;
                    }
    
                    // 변경된 선수들의 로그 캐시 무효화
                    changedPlayerIds.forEach(playerId => {
                        try {
                            invalidatePlayerLogCache(playerId);
                        } catch (e) { }
                    });
    
                    return data;
                // });
            // });
            */

            // 구독 등록
            activeUnsubsRef.current.push(unsubPlayersChanges);
            activeUnsubsRef.current.push(unsubScoresChanged);
            activeUnsubsRef.current.push(unsubScoresAdded);
            activeUnsubsRef.current.push(unsubScoresRemoved);
        }

        // Tournament 변경사항만 감지 (외부 전광판과 완전히 동일)
        let lastTournamentHash = '';
        const unsubTournament = onChildChanged(tournamentRef, snap => {
            const key = snap.key;
            const value = snap.val();
            if (key && value) {
                const currentHash = JSON.stringify(value);
                if (currentHash !== lastTournamentHash) {
                    lastTournamentHash = currentHash;
                    if (key === 'courses') {
                        setCourses(value);
                    } else if (key === 'groups') {
                        setGroupsData(value);
                    }
                }
            }
        });
        activeUnsubsRef.current.push(unsubTournament);

        // 기본 구독들 (항상 필요)
        const unsubTournamentName = onValue(tournamentNameRef, snap => {
            const name = snap.val();
            setTournamentName(name || '골프 대회');
        });
        const unsubIndividualSuddenDeath = onValue(individualSuddenDeathRef, snap => setIndividualSuddenDeathData(snap.val()));
        const unsubTeamSuddenDeath = onValue(teamSuddenDeathRef, snap => setTeamSuddenDeathData(snap.val()));
        const unsubIndividualBackcount = onValue(individualBackcountRef, snap => {
            const data = snap.val();
            // 레거시(boolean)와 그룹별 객체 구조 모두 지원
            if (typeof data === 'boolean') {
                // 예전 대회 데이터: true이면 모든 그룹에 적용된 것으로 간주
                setIndividualBackcountApplied(data ? { '*': true } : {});
            } else {
                setIndividualBackcountApplied(data || {});
            }
        });
        const unsubTeamBackcount = onValue(teamBackcountRef, snap => {
            const data = snap.val();
            if (typeof data === 'boolean') {
                setTeamBackcountApplied(data ? { '*': true } : {});
            } else {
                setTeamBackcountApplied(data || {});
            }
        });

        // 🟢 점수 초기화 동기화 리스너 추가 (lastResetAt 감시)
        const lastResetAtRef = ref(db, 'tournaments/current/lastResetAt');
        const unsubLastResetAt = onValue(lastResetAtRef, snap => {
            const lastResetAt = snap.val();
            if (lastResetAt) {
                // 초기 로딩 시점의 값은 무두 무시하고, 이후 변경된 경우에만 동작
                if (lastProcessedResetAt.current !== null && lastProcessedResetAt.current !== lastResetAt) {
                    // console.log('점수 초기화 감지:', lastResetAt);
                    setScores((prev: any) => {
                        if (Object.keys(prev).length > 0) return {};
                        return prev;
                    });
                    setPlayerScoreLogs({});
                }
                lastProcessedResetAt.current = lastResetAt;
            }
        });

        const unsubIndividualNTP = onValue(individualNTPRef, snap => setIndividualNTPData(snap.val()));
        const unsubTeamNTP = onValue(teamNTPRef, snap => setTeamNTPData(snap.val()));

        // 기본 구독들 등록
        activeUnsubsRef.current.push(unsubTournamentName);
        activeUnsubsRef.current.push(unsubIndividualSuddenDeath);
        activeUnsubsRef.current.push(unsubTeamSuddenDeath);
        activeUnsubsRef.current.push(unsubIndividualBackcount);
        activeUnsubsRef.current.push(unsubTeamBackcount);
        activeUnsubsRef.current.push(unsubIndividualNTP);
        activeUnsubsRef.current.push(unsubTeamNTP);

        // 클린업은 stopSubscriptions()에서 처리
        return () => stopSubscriptions();
    }, [db, initialDataLoaded, resumeSeq]);


    // Firebase에 순위 저장 (다른 페이지에서 사용하기 위해) - useEffect로 분리하여 부작용 제거
    const prevRanksRef = useRef<string>('');
    useEffect(() => {
        if (!db || !finalDataByGroup) return;

        const ranksData: { [playerId: string]: number | null } = {};
        for (const groupName in finalDataByGroup) {
            finalDataByGroup[groupName].forEach((player: ProcessedPlayer) => {
                ranksData[player.id] = player.rank;
            });
        }

        // 이전 순위와 비교하여 변경된 경우에만 저장 (불필요한 쓰기 방지)
        const ranksDataStr = JSON.stringify(ranksData);
        if (prevRanksRef.current === ranksDataStr) {
            return; // 변경 없음
        }
        prevRanksRef.current = ranksDataStr;

        const ranksRef = ref(db, 'tournaments/current/ranks');
        set(ranksRef, ranksData).catch(err => {
            console.error('순위 저장 오류:', err);
        });
    }, [finalDataByGroup, db]);


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

    // 플레이오프 체크를 위한 안정적인 해시 값 생성
    const groupProgressHash = useMemo(() => {
        if (!groupProgress) return '';
        return JSON.stringify(groupProgress);
    }, [groupProgress]);

    const finalDataByGroupHash = useMemo(() => {
        if (!finalDataByGroup) return '';
        return JSON.stringify(finalDataByGroup);
    }, [finalDataByGroup]);

    const processedDataByGroupHash = useMemo(() => {
        if (!processedDataByGroup) return '';
        return JSON.stringify(processedDataByGroup);
    }, [processedDataByGroup]);

    const notifiedSuddenDeathGroupsStr = useMemo(() => {
        return notifiedSuddenDeathGroups.join(',');
    }, [notifiedSuddenDeathGroups]);

    useEffect(() => {
        if (!groupProgress || !finalDataByGroup || !processedDataByGroup) return;

        // 모든 플레이오프가 필요한 그룹을 먼저 찾기
        const groupsNeedingPlayoff: string[] = [];
        Object.keys(groupProgress).forEach(groupName => {
            // Check if group is 100% complete and not yet notified
            if (groupProgress[groupName] === 100 && !notifiedSuddenDeathGroups.includes(groupName)) {
                const playersInGroup = finalDataByGroup[groupName];
                const processedPlayersInGroup = processedDataByGroup[groupName];

                if (playersInGroup && processedPlayersInGroup) {
                    // processedDataByGroup에서 원래 1위 동점자 확인 (applyPlayoffRanking 전 상태)
                    const originalTiedFirstPlace = processedPlayersInGroup.filter((p: any) => p.rank === 1);

                    // 원래 1위 동점자가 없으면 플레이오프 불필요
                    if (originalTiedFirstPlace.length <= 1) {
                        return; // 다음 그룹으로
                    }

                    // 서든데스로 순위가 결정되었는지 확인 (가장 먼저 확인)
                    // 원래 1위 동점자들이 모두 서든데스에 참여했고 점수가 입력되어 있는지 확인
                    const originalTiedFirstPlaceIds = new Set(originalTiedFirstPlace.map((p: any) => p.id));
                    let hasSuddenDeathRanking = false;

                    // individual과 team 모두 확인
                    const checkSuddenDeathData = (suddenDeathData: any) => {
                        if (!suddenDeathData) return false;

                        // 그룹별 데이터인 경우 해당 그룹 데이터 확인
                        if (typeof suddenDeathData === 'object' && !suddenDeathData.isActive) {
                            // 그룹별 데이터인 경우
                            const groupData = suddenDeathData[groupName];
                            if (!groupData?.isActive || !groupData?.players || !groupData?.scores) {
                                return false;
                            }

                            // 원래 1위 동점자들이 모두 서든데스에 참여했는지 확인
                            const allInSuddenDeath = originalTiedFirstPlace.every((p: any) =>
                                groupData.players[p.id] === true
                            );

                            if (!allInSuddenDeath) {
                                return false;
                            }

                            // 원래 1위 동점자들이 모두 서든데스에 참여했고, 점수가 입력되어 있는지 확인
                            return originalTiedFirstPlace.every((p: any) => {
                                const playerScores = groupData.scores[p.id];
                                if (!playerScores) return false;
                                // 서든데스 홀에 점수가 하나라도 입력되어 있으면 완료된 것으로 봄
                                if (groupData.holes && Array.isArray(groupData.holes)) {
                                    return groupData.holes.some((hole: number) => {
                                        // hole은 number이지만 scores에서는 string 키로 저장될 수 있음
                                        const score = playerScores[hole] || playerScores[hole.toString()];
                                        return score !== undefined && score !== null;
                                    });
                                }
                                return false;
                            });
                        } else {
                            // 단일 데이터인 경우 (기존 로직)
                            if (!suddenDeathData?.isActive || !suddenDeathData?.players || !suddenDeathData?.scores) {
                                return false;
                            }

                            // 원래 1위 동점자들이 모두 서든데스에 참여했는지 확인
                            const allInSuddenDeath = originalTiedFirstPlace.every((p: any) =>
                                suddenDeathData.players[p.id] === true
                            );

                            if (!allInSuddenDeath) {
                                return false;
                            }

                            // 원래 1위 동점자들이 모두 서든데스에 참여했고, 점수가 입력되어 있는지 확인
                            return originalTiedFirstPlace.every((p: any) => {
                                const playerScores = suddenDeathData.scores[p.id];
                                if (!playerScores) return false;
                                // 서든데스 홀에 점수가 하나라도 입력되어 있으면 완료된 것으로 봄
                                if (suddenDeathData.holes && Array.isArray(suddenDeathData.holes)) {
                                    return suddenDeathData.holes.some((hole: number) => {
                                        // hole은 number이지만 scores에서는 string 키로 저장될 수 있음
                                        const score = playerScores[hole] || playerScores[hole.toString()];
                                        return score !== undefined && score !== null;
                                    });
                                }
                                return false;
                            });
                        }
                    };

                    // individual과 team 서든데스 데이터 모두 확인
                    if (originalTiedFirstPlace.length > 0) {
                        hasSuddenDeathRanking = checkSuddenDeathData(individualSuddenDeathData) ||
                            checkSuddenDeathData(teamSuddenDeathData);
                    }

                    // NTP로 순위가 결정되었는지 확인
                    let hasNTPRanking = false;
                    if (!hasSuddenDeathRanking && originalTiedFirstPlace.length > 0) {
                        // individual과 team 모두 확인
                        const checkNTPData = (ntpData: any) => {
                            if (!ntpData) return false;

                            // 그룹별 데이터인 경우 해당 그룹 데이터 확인
                            if (typeof ntpData === 'object' && !ntpData.isActive) {
                                // 그룹별 데이터인 경우
                                const groupData = ntpData[groupName];
                                if (!groupData?.isActive || !groupData?.rankings) {
                                    return false;
                                }

                                // 원래 1위 동점자들이 모두 NTP 순위가 있는지 확인
                                return originalTiedFirstPlace.every((p: any) =>
                                    groupData.rankings[p.id] !== undefined && groupData.rankings[p.id] !== null
                                );
                            } else {
                                // 단일 데이터인 경우 (기존 로직)
                                if (!ntpData?.isActive || !ntpData?.rankings) {
                                    return false;
                                }

                                // 원래 1위 동점자들이 모두 NTP 순위가 있는지 확인
                                return originalTiedFirstPlace.every((p: any) =>
                                    ntpData.rankings[p.id] !== undefined && ntpData.rankings[p.id] !== null
                                );
                            }
                        };

                        // individual과 team NTP 데이터 모두 확인
                        hasNTPRanking = checkNTPData(individualNTPData) || checkNTPData(teamNTPData);
                    }

                    // 백카운트로 순위가 결정되었는지 확인
                    let hasBackcountRanking = false;
                    if (!hasSuddenDeathRanking && !hasNTPRanking) {
                        const playerType = originalTiedFirstPlace[0]?.type;
                        const isIndividual = playerType === 'individual';
                        const backcountState = isIndividual ? individualBackcountApplied : teamBackcountApplied;
                        const backcountAppliedForGroup = !!(
                            backcountState &&
                            (backcountState[groupName] || backcountState['*'])
                        );
                        if (backcountAppliedForGroup) {
                            // 원래 1위 동점자 중 하나라도 rank가 1이 아니면 백카운트로 순위가 결정된 것
                            hasBackcountRanking = originalTiedFirstPlace.some((p: any) => {
                                const playerInFinal = playersInGroup.find((fp: any) => fp.id === p.id);
                                if (playerInFinal) {
                                    return playerInFinal.rank !== 1 && playerInFinal.rank !== null;
                                }
                                return false;
                            });
                        }
                    }

                    // 서든데스/NTP/백카운트로 순위가 결정되었으면 안내창 안 뜸
                    if (hasSuddenDeathRanking || hasNTPRanking || hasBackcountRanking) {
                        return; // 순위가 결정되었으므로 다음 그룹으로
                    }

                    // finalDataByGroup에서 순위 결정 후 1위 동점자 확인 (applyPlayoffRanking 후 상태)
                    const finalTiedFirstPlace = (playersInGroup as any[]).filter((p: any) => p.rank === 1);

                    // 순위가 결정되었는지 확인: finalTiedFirstPlace.length === 1이면 순위가 결정된 것
                    if (finalTiedFirstPlace.length === 1) {
                        return; // 순위가 결정되었으므로 다음 그룹으로
                    }

                    // 순위가 결정되지 않았으면 플레이오프 필요
                    // finalTiedFirstPlace.length > 1이면 여전히 동점이므로 플레이오프 필요
                    if (finalTiedFirstPlace.length > 1) {
                        groupsNeedingPlayoff.push(groupName);
                    }
                }
            }
        });

        // 모든 그룹을 하나의 안내창에 표시
        if (groupsNeedingPlayoff.length > 0) {
            // 하나의 토스트에 모든 그룹 나열
            const groupsList = groupsNeedingPlayoff.join(', ');
            const description = groupsNeedingPlayoff.length === 1
                ? `${groupsNeedingPlayoff[0]} 그룹의 경기가 완료되었으며, 1위 동점자가 발생했습니다. 플레이오프 관리가 필요합니다.`
                : `${groupsList} 그룹의 경기가 완료되었으며, 1위 동점자가 발생했습니다. 플레이오프 관리가 필요합니다.`;

            toast({
                title: `🚨 플레이오프 관리 필요 (${groupsNeedingPlayoff.length}개 그룹)`,
                description: description,
                action: (
                    <ToastAction altText="관리하기" onClick={() => router.push('/admin/suddendeath')}>
                        관리하기
                    </ToastAction>
                ),
                duration: 30000 // Keep the toast on screen longer
            });

            // 모든 그룹을 notified 배열에 추가
            setNotifiedSuddenDeathGroups(prev => {
                const newGroups = [...prev];
                groupsNeedingPlayoff.forEach(groupName => {
                    if (!newGroups.includes(groupName)) {
                        newGroups.push(groupName);
                    }
                });
                return newGroups;
            });
        }
    }, [groupProgressHash, finalDataByGroupHash, processedDataByGroupHash, notifiedSuddenDeathGroupsStr, router]);

    const handleExportToExcel = async () => {
        setIsExporting(true);
        try {
            const XLSX: any = await import('xlsx-js-style');

            const wb = (XLSX as any).utils.book_new();

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
                    const cellRef = (XLSX as any).utils.encode_cell({ r: rowIndex, c: colIndex });
                    ws_data[cellRef] = { v: header, t: 's', s: headerStyle };
                });
                rowIndex++;

                // 2. Re-fetch full data for export to include hole scores
                const fullPlayersDataForExport = (groupPlayers as any[]).map((p: any) => {
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
                fullPlayersDataForExport.forEach((player: any) => {
                    const startRow = rowIndex;
                    const numCourses = player.assignedCourses.length > 0 ? player.assignedCourses.length : 1;
                    const endRow = startRow + numCourses - 1;

                    const addCell = (r: number, c: number, value: any) => {
                        const cellRef = (XLSX as any).utils.encode_cell({ r, c });
                        const type = typeof value === 'number' ? 'n' : 's';
                        ws_data[cellRef] = { v: value, t: type, s: centerAlign };
                    };

                    // Merged columns
                    addCell(startRow, 0, player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : ''));
                    addCell(startRow, 1, player.jo);
                    addCell(startRow, 2, player.name);
                    addCell(startRow, 3, player.affiliation);
                    addCell(startRow, 15, player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-'));

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

                            addCell(currentRow, 14, player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? (courseData?.courseTotal || 0) : '-'));
                        });
                    } else {
                        addCell(startRow, 0, player.rank !== null ? `${player.rank}위` : (player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : ''));
                        addCell(startRow, 1, player.jo);
                        addCell(startRow, 2, player.name);
                        addCell(startRow, 3, player.affiliation);
                        addCell(startRow, 4, '배정된 코스 없음');
                        addCell(startRow, 15, player.hasForfeited ? (player.forfeitType === 'absent' ? '불참' : player.forfeitType === 'disqualified' ? '실격' : '기권') : (player.hasAnyScore ? player.totalScore : '-'));
                        merges.push({ s: { r: startRow, c: 4 }, e: { r: startRow, c: 14 } });
                    }

                    rowIndex += numCourses;
                });

                // 엑셀 시트 생성 (타입 오류 방지를 위해 any 사용)
                const ws: any = ws_data;

                ws['!merges'] = merges;

                // 모든 셀에 스타일 재적용 - 더 확실한 방법
                const range = { s: { r: 0, c: 0 }, e: { r: rowIndex - 1, c: headers.length - 1 } };
                ws['!ref'] = (XLSX as any).utils.encode_range(range);

                // 모든 셀에 스타일 적용
                for (let r = 0; r < rowIndex; r++) {
                    for (let c = 0; c < headers.length; c++) {
                        const cellRef = (XLSX as any).utils.encode_cell({ r, c });
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
                        const cellRef = (XLSX as any).utils.encode_cell({ r, c: colIndex });
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
                        const cellRef = (XLSX as any).utils.encode_cell({ r, c });
                        if (ws_data[cellRef]) {
                            // 이미 스타일이 있다면 border/align 보장
                            ws_data[cellRef].s = { ...centerAlign, ...(ws_data[cellRef].s || {}) };
                        } else {
                            // 빈셀도 스타일 적용
                            ws_data[cellRef] = { v: '', t: 's', s: centerAlign };
                        }
                    }
                }

                (XLSX as any).utils.book_append_sheet(wb, ws, groupName);
            }

            if (wb.SheetNames.length === 0) {
                toast({
                    title: "내보내기 실패",
                    description: "엑셀로 내보낼 데이터가 없습니다.",
                });
                return;
            }

        } catch (error) {
            console.error("Export Failed:", error);
            toast({ title: "내보내기 실패", description: "엑셀 파일 생성 중 오류가 발생했습니다.", variant: "destructive" });
        } finally {
            setIsExporting(false);
        }
    };



    // 🛡️ 안전한 구독 중단 함수 (외부 전광판과 동일)
    const stopSubscriptions = () => {
        activeUnsubsRef.current.forEach(unsub => {
            try {
                unsub();
            } catch (error) {
                console.warn('구독 해제 중 오류:', error);
            }
        });
        activeUnsubsRef.current = [];
    };



    // 🚀 점수표 이미지 생성 및 다운로드 함수 (유실 복구)
    async function generateImages(groupsToPrint: string[], paperSize: string, orientation: string) {
        // html2canvas 동적 임포트 확인
        const html2canvas = (window as any).html2canvas || (await import('html2canvas')).default;

        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = orientation === 'landscape' ? '297mm' : '210mm';
        document.body.appendChild(container);

        try {
            for (const groupName of groupsToPrint) {
                const groupPlayers = finalDataByGroup[groupName];
                if (!groupPlayers || groupPlayers.length === 0) continue;

                // 9명씩 한 페이징
                for (let i = 0; i < groupPlayers.length; i += 9) {
                    const pagePlayers = groupPlayers.slice(i, i + 9);
                    const wrapper = document.createElement('div');
                    wrapper.style.padding = '20px';
                    wrapper.style.background = 'white';
                    wrapper.style.width = '100%';

                    // 스타일 추가
                    const style = document.createElement('style');
                    style.innerHTML = `
                        .print-header { background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; padding: 12px; text-align: center; margin-bottom: 15px; border-radius: 8px; }
                        .score-table { width: 100%; border-collapse: collapse; font-size: 14px; }
                        .score-table th, .score-table td { border: 1px solid #94a3b8; text-align: center; padding: 6px 4px; }
                        .score-table th { background: #f1f5f9; font-weight: bold; }
                        .rank-cell { font-weight: 800; font-size: 18px; color: #1e40af; }
                        .player-name { font-weight: bold; }
                        .total-score { font-weight: 800; color: #1e40af; }
                        .pm-plus { color: #dc2626; font-size: 10px; }
                        .pm-minus { color: #2563eb; font-size: 10px; }
                    `;
                    wrapper.appendChild(style);

                    // 임시 HTML 생성 (generatePrintHTML 로직 응용)
                    let html = `<div class="print-header"><h1>🏌️‍♂️ ${tournamentName}</h1><p>${groupName} (${i / 9 + 1}P)</p></div>`;
                    html += `<table class="score-table"><thead><tr><th>순위</th><th>조</th><th>선수명</th><th>소속</th><th>코스</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>합계</th><th>총타수</th></tr></thead><tbody>`;

                    pagePlayers.forEach((player: any) => {
                        player.assignedCourses.forEach((course: any, cIdx: number) => {
                            html += `<tr>`;
                            if (cIdx === 0) {
                                html += `<td rowspan="${player.assignedCourses.length}" class="rank-cell">${player.rank || ''}</td>`;
                                html += `<td rowspan="${player.assignedCourses.length}">${player.jo}</td>`;
                                html += `<td rowspan="${player.assignedCourses.length}" class="player-name">${player.name}</td>`;
                                html += `<td rowspan="${player.assignedCourses.length}">${player.affiliation}</td>`;
                            }
                            html += `<td>${player.coursesData[course.id]?.courseName || ''}</td>`;
                            for (let h = 0; h < 9; h++) html += `<td>${player.coursesData[course.id]?.holeScores[h] ?? '-'}</td>`;
                            html += `<td>${player.coursesData[course.id]?.courseTotal || '-'}</td>`;
                            if (cIdx === 0) {
                                html += `<td rowspan="${player.assignedCourses.length}" class="total-score">${player.totalScore || '-'}</td>`;
                            }
                            html += `</tr>`;
                        });
                    });
                    html += `</tbody></table>`;

                    const content = document.createElement('div');
                    content.innerHTML = html;
                    wrapper.appendChild(content);
                    container.appendChild(wrapper);

                    const canvas = await html2canvas(wrapper, {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#ffffff'
                    });

                    const link = document.createElement('a');
                    link.download = `${tournamentName}_${groupName}_${i / 9 + 1}P.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();

                    container.removeChild(wrapper);
                }
            }
        } finally {
            document.body.removeChild(container);
        }
    }

    // 그룹명 영어 번역 함수
    const getGroupNameEnglish = (groupName: string): string => {
        const translations: { [key: string]: string } = {
            '여자부': "Women's Division",
            '남자부': "Men's Division",
            '남자 시니어': "Men's Senior",
            '여자 시니어': "Women's Senior",
            '남자일반': "Men's General",
            '여자일반': "Women's General",
            '부부대항': "Couples",
            '2인1조': "2-Person Team"
        };
        return translations[groupName] || groupName;
    };

    // 🚀 점수표 이미지 저장 핸들러 복구
    const handleSaveImage = async () => {
        setIsSavingImage(true);
        try {
            const groupsToPrint = printModal.showAllGroups ? allGroupsList : printModal.selectedGroups;
            if (groupsToPrint.length === 0) {
                toast({ title: "알림", description: "선택된 그룹이 없습니다." });
                return;
            }
            await generateImages(groupsToPrint, printModal.paperSize, printModal.orientation);
            toast({ title: "이미지 저장 완료", description: `${groupsToPrint.length}개 그룹의 점수표 이미지가 생성되었습니다.` });
        } catch (error) {
            console.error("Image Save Failed:", error);
            toast({ title: "저장 실패", description: "이미지 생성 중 오류가 발생했습니다.", variant: "destructive" });
        } finally {
            setIsSavingImage(false);
            setPrintModal(prev => ({ ...prev, open: false }));
        }
    };

    // 🏆 Archive Handler
    const handleArchiveClick = () => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setArchiveDate(`${yyyy}-${mm}-${dd}`);
        setArchiveModalOpen(true);
    };

    const handleConfirmArchive = async (location: string, date: string) => {
        if (!db) {
            toast({ title: '오류', description: '데이터베이스 연결이 없습니다.', variant: 'destructive' });
            return;
        }
        if (!location.trim()) {
            toast({ title: '정보 부족', description: '대회 장소를 입력해주세요.', variant: 'destructive' });
            return;
        }
        if (!date.trim()) {
            toast({ title: '정보 부족', description: '대회 날짜를 입력해주세요.', variant: 'destructive' });
            return;
        }

        try {
            const timestamp = Date.now();
            const archiveId = `archive_${timestamp}`;

            // 1. Create Summary for List View (Lightweight)
            const summaryData = {
                id: archiveId,
                tournamentName: tournamentName,
                date: new Date().toISOString(),
                location: location,
                tournamentStartDate: date, // New field for display
                groupCount: Object.keys(groupsData).length,
                playerCount: Object.keys(players).length,
                status: 'completed'
            };

            // 2. Create Full Detail Data (Heavy)
            const finalRanks: { [playerId: string]: any } = {};
            if (finalDataByGroup) {
                Object.values(finalDataByGroup).flat().forEach((p: any) => {
                    finalRanks[p.id] = {
                        rank: p.rank,
                        totalScore: p.totalScore,
                        total: p.total,
                        courseScores: p.courseScores,
                        detailedScores: p.detailedScores
                    };
                });
            }

            const detailData = {
                id: archiveId,
                tournamentName: tournamentName,
                location: location,
                tournamentStartDate: date,
                date: new Date().toISOString(),
                players: players,
                scores: scores,
                groups: groupsData,
                courses: courses,
                finalRanks: finalRanks,
                settings: {
                    individualSuddenDeath: individualSuddenDeathData,
                    teamSuddenDeath: teamSuddenDeathData,
                    individualBackcount: individualBackcountApplied,
                    teamBackcount: teamBackcountApplied,
                    individualNTP: individualNTPData,
                    teamNTP: teamNTPData
                }
            };

            // 3. Save to Firebase (Dual path: Legacy + Gallery)
            await Promise.all([
                set(ref(db, `archives-list/${archiveId}`), summaryData),
                set(ref(db, `archives-detail/${archiveId}`), detailData),
                set(ref(db, `archives/${archiveId}`), {
                    ...detailData,
                    ...summaryData // Combine for compatibility
                })
            ]);

            toast({
                title: "기록 보관 완료",
                description: `${tournamentName} 대회가 성공적으로 보관되었습니다.`,
            });
            setArchiveModalOpen(false);

        } catch (error) {
            console.error("Archive Failed:", error);
            toast({
                title: "보관 실패",
                description: "대회 기록 보관 중 오류가 발생했습니다.",
                variant: 'destructive'
            });
        }
    };

    const handlePlayerSearchSelect = (pid: string) => {
        setSearchPlayer("");
        setHighlightedPlayerId(Number(pid));
        const row = playerRowRefs.current[pid]?.[0];
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    // --- 🛡️ 훅 및 유틸리티 추출 (컴포넌트 최상위 수준에 가깝게 재배치) ---

    // 🛡️ ScoreLogs 최적화 - 외부 전광판과 완전히 동일한 방식
    useEffect(() => {
        const fetchLogs = async () => {
            if (Object.keys(finalDataByGroup).length === 0) return;

            // 점수가 있는 선수들만 로그 로딩 대상
            const allPlayersWithScores = Object.values(finalDataByGroup)
                .flat()
                .filter((p: any) => p.hasAnyScore)
                .map((p: any) => p.id);

            const logsMap: { [playerId: string]: any[] } = {};

            // 기존 로그 캐시 유지하면서 새로운 선수만 로딩
            const existingPlayerIds = Object.keys(playerScoreLogs);
            const newPlayerIds = allPlayersWithScores.filter(pid => !existingPlayerIds.includes(pid));

            if (newPlayerIds.length > 0) {
                await Promise.all(newPlayerIds.map(async (pid) => {
                    try {
                        const logs = await getPlayerScoreLogsOptimized(pid);
                        logsMap[pid] = logs;
                    } catch (error) {
                        console.error(`❌ ScoreLogs 기본 로딩 실패 - 선수 ${pid}: `, error);
                        logsMap[pid] = [];
                    }
                }));

                setPlayerScoreLogs((prev: any) => ({
                    ...prev,
                    ...logsMap
                }));
            }
        };

        fetchLogs();
    }, [finalDataByGroup]);

    // 이전 점수를 추적하기 위한 Ref (최적화용)
    const prevScoresRef = useRef<any>({});

    // 🚀 점수 수정 시 즉시 해당 선수 로그 업데이트 (중요 기능 보장)
    const updatePlayerLogImmediately = async (playerId: string) => {
        try {
            const logs = await getPlayerScoreLogsOptimized(playerId);
            setPlayerScoreLogs(prev => ({ ...prev, [playerId]: logs }));
        } catch (error) {
            console.error('로그 업데이트 실패:', playerId, error);
        }
    };

    // 점수 변경 시 해당 선수의 로그만 즉시 업데이트
    useEffect(() => {
        const updateLogsForChangedScores = async () => {
            if (!scores) return;

            const prevScores = prevScoresRef.current;
            const currentScores = scores;

            const allPlayerIds = new Set([...Object.keys(prevScores), ...Object.keys(currentScores)]);
            const changedPlayerIds: string[] = [];

            allPlayerIds.forEach(playerId => {
                const prev = prevScores[playerId];
                const curr = currentScores[playerId];
                if (prev === curr) return;
                if (!prev || !curr) {
                    changedPlayerIds.push(playerId);
                    return;
                }
                if (JSON.stringify(prev) !== JSON.stringify(curr)) {
                    changedPlayerIds.push(playerId);
                }
            });

            if (changedPlayerIds.length > 0) {
                for (const playerId of changedPlayerIds) {
                    updatePlayerLogImmediately(playerId).catch(e => console.error(e));
                }
            }
            prevScoresRef.current = currentScores;
        };

        updateLogsForChangedScores();
    }, [scores]);

    // 🛡️ 탭 비활성화 시 데이터 다운로드 중단
    useEffect(() => {
        const onVisibilityChange = () => {
            if (typeof document === 'undefined') return;
            if (document.hidden) {
                stopSubscriptions();
            } else {
                setResumeSeq((s: number) => s + 1);
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    const filteredPlayerResults = useMemo(() => {
        if (!searchPlayer) return [];
        const lowerCaseSearch = searchPlayer.toLowerCase();
        return Object.values(finalDataByGroup).flat().filter((player: any) => {
            return player.name.toLowerCase().includes(lowerCaseSearch) || player.affiliation.toLowerCase().includes(lowerCaseSearch);
        });
    }, [searchPlayer, finalDataByGroup]);

    // 자동 기권 처리 함수
    const autoForfeitPlayersByMissingScores = async ({ players, scores, groupsData, toast }: any) => {
        if (!players || !scores || !groupsData || !db) return;
        const alreadyForfeited: Set<string> = new Set();
        for (const groupName in groupsData) {
            const group = groupsData[groupName];
            if (!group || !group.players) continue;
            const playerIds: string[] = Object.keys(group.players).filter(pid => group.players[pid]);
            const courseIds: string[] = group.courses ? Object.keys(group.courses).filter(cid => group.courses[cid]) : [];

            for (const courseId of courseIds) {
                const holesWithAnyScore: number[] = [];
                for (let hole = 1; hole <= 9; hole++) {
                    if (playerIds.some(pid => scores?.[pid]?.[courseId]?.[hole] !== undefined && scores?.[pid]?.[courseId]?.[hole] !== null)) {
                        holesWithAnyScore.push(hole);
                    }
                }

                for (const pid of playerIds) {
                    let forfeited = false;
                    for (let h = 1; h <= 9; h++) {
                        if (scores?.[pid]?.[courseId]?.[h] === 0) forfeited = true;
                    }
                    if (forfeited) {
                        alreadyForfeited.add(pid);
                        continue;
                    }

                    let missingCount = 0;
                    for (const hole of holesWithAnyScore) {
                        const val = scores?.[pid]?.[courseId]?.[hole];
                        if (val === undefined || val === null) missingCount++;
                    }

                    if (missingCount >= 3 && !alreadyForfeited.has(pid)) {
                        try {
                            const playerScoresSnap = await get(ref(db, `scores/${pid}`));
                            if (playerScoresSnap.exists()) {
                                const backupRef = ref(db, `backups/scoresBeforeForfeit/${pid}`);
                                const backupSnap = await get(backupRef);
                                if (!backupSnap.exists()) {
                                    await set(backupRef, { data: playerScoresSnap.val(), createdAt: Date.now() });
                                }
                            }
                        } catch (e) { }

                        for (const cid of courseIds) {
                            for (let h = 1; h <= 9; h++) {
                                if (scores?.[pid]?.[cid]?.[h] !== 0) {
                                    await set(ref(db, `scores/${pid}/${cid}/${h}`), 0);
                                }
                            }
                        }
                        alreadyForfeited.add(pid);
                        toast({ title: '자동 기권 처리', description: `선수: ${players[pid]?.name || pid}`, variant: 'destructive' });
                    }

                }
            }
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            autoForfeitPlayersByMissingScores({ players, scores, groupsData, toast });
        }, 2000);
        return () => clearTimeout(timer);
    }, [scores, players, groupsData]);

    return (
        <>
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold font-headline">홈 전광판 (관리자용)</CardTitle>
                        <CardDescription>현재 진행중인 대회의 실시간 점수 현황입니다.</CardDescription>
                        {/* 임시 콘솔 출력 버튼 제거됨 */}
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
                                <Button className="ml-2 bg-blue-600 hover:bg-blue-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={handleArchiveClick}>
                                    기록 보관하기
                                </Button>
                                <Button className="ml-2 bg-gray-600 hover:bg-gray-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={handlePrint}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    인쇄하기
                                </Button>
                                <Button className="ml-2 bg-red-600 hover:bg-red-700 text-white min-w-[120px] px-4 py-2 font-bold" onClick={() => setShowResetConfirm(true)}>
                                    점수 초기화
                                </Button>

                                {/* 점수 초기화 확인 모달 */}
                                {showResetConfirm && (
                                    <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>
                                                    {filterGroup === 'all'
                                                        ? '정말로 모든 점수를 초기화하시겠습니까?'
                                                        : `정말로 ${filterGroup} 그룹의 점수를 초기화하시겠습니까 ? `}
                                                </DialogTitle>
                                                <DialogDescription>
                                                    {filterGroup === 'all'
                                                        ? '이 작업은 되돌릴 수 없으며, 모든 선수의 대회 점수가 삭제됩니다.'
                                                        : '이 작업은 되돌릴 수 없으며, 이 그룹의 모든 점수가 삭제됩니다.'}
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="flex flex-row justify-end gap-2 mt-4">
                                                <Button variant="outline" onClick={() => setShowResetConfirm(false)}>취소</Button>
                                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleResetScores}>초기화 진행</Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                )}
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
                                            {filteredPlayerResults.map((result: any, idx) => (
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

                    return (
                        <Card key={groupName}>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="flex flex-col gap-2">
                                    <CardTitle className="text-xl font-bold font-headline">{groupName}</CardTitle>
                                    {/* 경기완료/순위 계산 확인 버튼 */}
                                    <button
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold w-fit"
                                        onClick={() => checkGroupScoreCompletion(groupName, groupPlayers)}
                                    >
                                        경기완료/순위 계산 확인
                                    </button>
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
                                                <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{ minWidth: '90px', maxWidth: '260px', flexGrow: 1 }}>선수명(팀명)</TableHead>
                                                <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{ minWidth: '80px', maxWidth: '200px', flexGrow: 1 }}>소속</TableHead>
                                                <TableHead className="px-2 py-2 border-r text-center whitespace-nowrap" style={{ minWidth: '80px', maxWidth: '200px', flexGrow: 1 }}>코스</TableHead>
                                                {Array.from({ length: 9 }).map((_, i) => <TableHead key={i} className="w-10 text-center px-2 py-2 border-r">{i + 1}</TableHead>)}
                                                <TableHead className="w-24 text-center px-2 py-2 border-r">합계</TableHead>
                                                <TableHead className="w-24 text-center px-2 py-2">총타수</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {groupPlayers.map((player: any) => (
                                                <React.Fragment key={player.id}>
                                                    {player.assignedCourses.length > 0 ? player.assignedCourses.map((course: any, courseIndex: number) => (
                                                        <TableRow
                                                            key={`${player.id} -${course.id} `}
                                                            ref={el => {
                                                                const playerId = String(player.id);
                                                                if (!playerRowRefs.current[playerId]) playerRowRefs.current[playerId] = [];
                                                                playerRowRefs.current[playerId][courseIndex] = el;
                                                            }}
                                                            className={`text - base ${highlightedPlayerId === player.id ? 'bg-yellow-100 animate-pulse' : ''} `}
                                                        >
                                                            {courseIndex === 0 && (
                                                                <>
                                                                    <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank} 위` : (player.hasForfeited ? (() => {
                                                                        // 기권 타입을 player.forfeitType에서 가져오기
                                                                        if (player.forfeitType === 'absent') return '불참';
                                                                        if (player.forfeitType === 'disqualified') return '실격';
                                                                        if (player.forfeitType === 'forfeit') return '기권';
                                                                        return '기권';
                                                                    })() : '')}</TableCell>
                                                                    <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                                    <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle font-semibold px-2 py-1 border-r text-center whitespace-nowrap" style={{ minWidth: '90px', maxWidth: '260px', flexGrow: 1 }}>{player.name}</TableCell>
                                                                    <TableCell rowSpan={player.assignedCourses.length || 1} className="align-middle text-muted-foreground px-2 py-1 border-r text-center whitespace-nowrap" style={{ minWidth: '80px', maxWidth: '200px', flexGrow: 1 }}>{player.affiliation}</TableCell>
                                                                    {/* 기권 버튼 추가 */}
                                                                    {/* <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle px-2 py-1 border-r">
                                                                    <Button
                                                                        variant="destructive"
                                                                        size="sm"
                                                                        disabled={player.hasForfeited}
                                                                        onClick={() => setForfeitModal({ open: true, player })}
                                                                    >
                                                                        기권
                                                                    </Button>
                                                                </TableCell> */}
                                                                </>
                                                            )}

                                                            <TableCell className="font-medium px-2 py-1 border-r text-center whitespace-nowrap" style={{ minWidth: '80px', maxWidth: '200px', flexGrow: 1 }}>{player.coursesData[course.id]?.courseName}</TableCell>

                                                            {player.coursesData[course.id]?.holeScores.map((score: any, i: number) => {
                                                                // 해당 셀(플레이어/코스/홀)에 대한 최근 로그 찾기
                                                                const logs = playerScoreLogs[player.id] || [];
                                                                const cellLog = logs.find(l => String(l.courseId) === String(course.id) && Number(l.holeNumber) === i + 1);
                                                                // 실제로 수정된 경우만 빨간색으로 표시 (oldValue와 newValue가 다르고, 0점이 아닌 경우)
                                                                const isModified = !!cellLog && cellLog.oldValue !== cellLog.newValue && cellLog.oldValue !== 0;
                                                                // 툴팁 내용 구성
                                                                const tooltipContent = cellLog ? (
                                                                    <div>
                                                                        <div><b>수정자:</b> {cellLog.modifiedByType === 'admin' ? '관리자' : cellLog.modifiedByType === 'captain' ? (cellLog.modifiedBy || '조장') : (cellLog.modifiedBy || '심판')}</div>
                                                                        <div><b>일시:</b> {cellLog.modifiedAt ? new Date(cellLog.modifiedAt).toLocaleString('ko-KR') : ''}</div>
                                                                        <div><b>변경:</b> {cellLog.oldValue} → {cellLog.newValue}</div>
                                                                        {cellLog.comment && <div><b>비고:</b> {cellLog.comment}</div>}
                                                                    </div>
                                                                ) : null;
                                                                // 파 정보
                                                                const courseData = courses[course.id];
                                                                const par = courseData && Array.isArray(courseData.pars) ? courseData.pars[i] : null;
                                                                let pm = null;
                                                                if (isValidNumber(score) && isValidNumber(par)) {
                                                                    pm = score - par;
                                                                }
                                                                return (
                                                                    <TableCell
                                                                        key={i}
                                                                        className={`text - center font - mono px - 2 py - 1 border - r cursor - pointer hover: bg - primary / 10 ${isModified ? 'text-red-600 font-bold bg-red-50' : ''} `}
                                                                        onDoubleClick={async () => {
                                                                            // 현재 점수와 기권 타입 확인
                                                                            const currentScore = score === null ? null : Number(score);
                                                                            let initialForfeitType: 'absent' | 'disqualified' | 'forfeit' | null = null;

                                                                            // 점수가 없으면 불참으로 초기화
                                                                            if (currentScore === null) {
                                                                                initialForfeitType = 'absent';
                                                                            } else if (currentScore === 0) {
                                                                                // 점수가 0이면 로그에서 기권 타입 확인
                                                                                const logs = playerScoreLogs[player.id] || [];
                                                                                const forfeitLogs = logs
                                                                                    .filter(l => l.newValue === 0 && l.holeNumber === i + 1 &&
                                                                                        (l.courseId === course.id || (l.comment && l.comment.includes(`코스: ${course.id} `))))
                                                                                    .sort((a, b) => b.modifiedAt - a.modifiedAt);

                                                                                if (forfeitLogs.length > 0) {
                                                                                    const latestLog = forfeitLogs[0];
                                                                                    if (latestLog.comment?.includes('불참')) initialForfeitType = 'absent';
                                                                                    else if (latestLog.comment?.includes('실격')) initialForfeitType = 'disqualified';
                                                                                    else if (latestLog.comment?.includes('기권')) initialForfeitType = 'forfeit';
                                                                                }
                                                                            }

                                                                            setScoreEditModal({
                                                                                open: true,
                                                                                playerId: player.id,
                                                                                courseId: course.id,
                                                                                holeIndex: i,
                                                                                score: currentScore === null ? '' : String(currentScore),
                                                                                forfeitType: initialForfeitType,
                                                                                playerName: player.name,
                                                                                courseName: player.coursesData[course.id]?.courseName || ''
                                                                            });
                                                                        }}
                                                                    >
                                                                        <TooltipProvider delayDuration={0}>
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <span>
                                                                                        {isValidNumber(score) ? score : '-'}
                                                                                        {/* ±타수 표기 */}
                                                                                        {isValidNumber(pm) && score !== 0 && pm !== null && (
                                                                                            <span
                                                                                                className={
                                                                                                    'ml-1 text-xs align-middle ' + (pm < 0 ? 'text-blue-400' : pm > 0 ? 'text-red-400' : 'text-gray-400')
                                                                                                }
                                                                                                style={{ fontSize: '0.7em', fontWeight: 600 }}
                                                                                            >
                                                                                                {pm === 0 ? 'E' : (pm > 0 ? `+ ${pm} ` : pm)}
                                                                                            </span>
                                                                                        )}
                                                                                    </span>
                                                                                </TooltipTrigger>
                                                                                {isModified && tooltipContent && (
                                                                                    <TooltipContent side="top" className="whitespace-pre-line">
                                                                                        {tooltipContent}
                                                                                    </TooltipContent>
                                                                                )}
                                                                            </Tooltip>
                                                                        </TooltipProvider>
                                                                    </TableCell>
                                                                );
                                                            })}

                                                            <TableCell className="text-center font-bold px-2 py-1 border-r">
                                                                {(() => {
                                                                    let courseSumElem: string | React.ReactElement = '-';
                                                                    if (player.hasAnyScore && !player.hasForfeited) {
                                                                        const courseData = courses[course.id];
                                                                        let sum = 0, parSum = 0;
                                                                        if (courseData && Array.isArray(courseData.pars)) {
                                                                            for (let i = 0; i < 9; i++) {
                                                                                const s = player.coursesData[course.id]?.holeScores[i];
                                                                                const p = courseData.pars[i];
                                                                                if (isValidNumber(s) && isValidNumber(p) && s !== null) {
                                                                                    sum += s;
                                                                                    parSum += p;
                                                                                }
                                                                            }
                                                                        }
                                                                        const pm = isValidNumber(sum) && isValidNumber(parSum) && parSum > 0 ? sum - parSum : null;
                                                                        courseSumElem = (
                                                                            <span>
                                                                                {isValidNumber(sum) ? sum : '-'}
                                                                                {isValidNumber(pm) && pm !== null && (
                                                                                    <span className={
                                                                                        'ml-1 align-middle text-xs ' + (pm < 0 ? 'text-blue-400' : pm > 0 ? 'text-red-400' : 'text-gray-400')
                                                                                    } style={{ fontSize: '0.7em', fontWeight: 600 }}>
                                                                                        {pm === 0 ? 'E' : (pm > 0 ? `+ ${pm} ` : pm)}
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        );
                                                                    } else if (player.hasForfeited) {
                                                                        // 기권 타입을 player.forfeitType에서 가져오기
                                                                        if (player.forfeitType === 'absent') {
                                                                            courseSumElem = '불참';
                                                                        } else if (player.forfeitType === 'disqualified') {
                                                                            courseSumElem = '실격';
                                                                        } else {
                                                                            courseSumElem = '기권';
                                                                        }
                                                                    }
                                                                    return courseSumElem;
                                                                })()}
                                                            </TableCell>

                                                            {courseIndex === 0 && (
                                                                <TableCell rowSpan={player.assignedCourses.length || 1} className="text-center align-middle font-bold text-primary text-lg px-2 py-1">
                                                                    {player.hasForfeited ? (() => {
                                                                        // 기권 타입을 player.forfeitType에서 가져오기
                                                                        let forfeitType = '기권';
                                                                        if (player.forfeitType === 'absent') forfeitType = '불참';
                                                                        else if (player.forfeitType === 'disqualified') forfeitType = '실격';
                                                                        else forfeitType = '기권';

                                                                        return (
                                                                            <TooltipProvider delayDuration={0}>
                                                                                <Tooltip>
                                                                                    <TooltipTrigger asChild>
                                                                                        <span className="text-red-600 font-bold cursor-pointer">{forfeitType}</span>
                                                                                    </TooltipTrigger>
                                                                                    <TooltipContent side="top" className="whitespace-pre-line">
                                                                                        {(() => {
                                                                                            const logs = playerScoreLogs[player.id] || [];
                                                                                            // '심판 직접 기권/불참/실격' 로그가 있으면 그 로그만 표시, 없으면 기존 방식
                                                                                            const directForfeitLog = logs.find(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment && (l.comment.includes('심판 직접 기권') || l.comment.includes('심판 직접 불참') || l.comment.includes('심판 직접 실격')));
                                                                                            let forfeitLog = directForfeitLog;
                                                                                            if (!forfeitLog) {
                                                                                                // 없으면 기존 방식(심판페이지에서 기권/불참/실격 처리 중 가장 오래된 것)
                                                                                                const forfeitLogs = logs
                                                                                                    .filter(l => l.newValue === 0 && l.modifiedByType === 'judge' && l.comment && (l.comment.includes('심판페이지에서 기권 처리') || l.comment.includes('심판페이지에서 불참 처리') || l.comment.includes('심판페이지에서 실격 처리')))
                                                                                                    .sort((a, b) => a.modifiedAt - b.modifiedAt);
                                                                                                forfeitLog = forfeitLogs[0];
                                                                                            }
                                                                                            if (forfeitLog) {
                                                                                                // comment 예시: "심판 직접 기권 (코스: 1구장 A코스, 홀: 8)"
                                                                                                let displayComment = '';
                                                                                                const match = forfeitLog.comment && forfeitLog.comment.match(/코스: ([^,]+), 홀: (\d+)/);
                                                                                                if (match) {
                                                                                                    const courseName = match[1];
                                                                                                    const holeNum = match[2];
                                                                                                    displayComment = `${courseName}, ${holeNum}번홀 심판이 ${forfeitType} 처리`;
                                                                                                } else {
                                                                                                    displayComment = forfeitLog.comment || '';
                                                                                                }
                                                                                                return (
                                                                                                    <div>
                                                                                                        <div><b>{forfeitType} 처리자:</b> 심판</div>
                                                                                                        <div>{forfeitLog.modifiedAt ? new Date(forfeitLog.modifiedAt).toLocaleString('ko-KR') : ''}</div>
                                                                                                        <div>{displayComment}</div>
                                                                                                    </div>
                                                                                                );
                                                                                            } else {
                                                                                                return <div>심판페이지에서 {forfeitType} 처리 내역이 없습니다.</div>;
                                                                                            }
                                                                                        })()}
                                                                                    </TooltipContent>
                                                                                </Tooltip>
                                                                            </TooltipProvider>
                                                                        );
                                                                    })() : player.hasAnyScore ? (
                                                                        <span>
                                                                            {isValidNumber(player.totalScore) ? player.totalScore : '-'}
                                                                            {isValidNumber(player.plusMinus) && player.plusMinus !== null && (
                                                                                <span
                                                                                    className={
                                                                                        'ml-1 align-middle text-xs ' +
                                                                                        (player.plusMinus < 0
                                                                                            ? 'text-blue-400'
                                                                                            : player.plusMinus > 0
                                                                                                ? 'text-red-400'
                                                                                                : 'text-gray-400')
                                                                                    }
                                                                                    style={{ fontSize: '0.7em', fontWeight: 600 }}
                                                                                >
                                                                                    {player.plusMinus === 0
                                                                                        ? 'E'
                                                                                        : player.plusMinus > 0
                                                                                            ? `+ ${player.plusMinus} `
                                                                                            : player.plusMinus}
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    ) : (
                                                                        '-'
                                                                    )}
                                                                </TableCell>
                                                            )}
                                                        </TableRow>
                                                    )) : (
                                                        <TableRow key={`${player.id} -no - course`} className="text-base text-muted-foreground">
                                                            <TableCell className="text-center align-middle font-bold text-lg px-2 py-1 border-r">{player.rank !== null ? `${player.rank} 위` : (player.hasForfeited ? (() => {
                                                                // 기권 타입을 player.forfeitType에서 가져오기
                                                                if (player.forfeitType === 'absent') return '불참';
                                                                if (player.forfeitType === 'disqualified') return '실격';
                                                                if (player.forfeitType === 'forfeit') return '기권';
                                                                return '기권';
                                                            })() : '-')}</TableCell>
                                                            <TableCell className="text-center align-middle font-medium px-2 py-1 border-r">{player.jo}</TableCell>
                                                            <TableCell className="align-middle font-semibold px-2 py-1 border-r text-center">{player.name}</TableCell>
                                                            <TableCell className="align-middle px-2 py-1 border-r text-center">{player.affiliation}</TableCell>
                                                            <TableCell colSpan={11} className="text-center px-2 py-1 border-r">이 그룹에 배정된 코스가 없습니다.</TableCell>
                                                            <TableCell className="text-center align-middle font-bold text-primary text-lg px-2 py-1">{player.hasForfeited ? (() => {
                                                                // 기권 타입을 player.forfeitType에서 가져오기
                                                                if (player.forfeitType === 'absent') return '불참';
                                                                if (player.forfeitType === 'disqualified') return '실격';
                                                                if (player.forfeitType === 'forfeit') return '기권';
                                                                return '기권';
                                                            })() : (player.hasAnyScore ? player.totalScore : '-')}</TableCell>
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
            {/* 인쇄 모달 */}
            <Dialog open={printModal.open} onOpenChange={open => setPrintModal({ ...printModal, open })}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>📄 점수표 인쇄 설정</DialogTitle>
                        <DialogDescription>
                            인쇄할 점수표의 설정을 선택해주세요.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* 인쇄 방향 선택 */}
                        <div>
                            <label className="text-sm font-medium mb-2 block">인쇄 방향</label>
                            <div className="flex gap-2">
                                <Button
                                    variant={printModal.orientation === 'portrait' ? 'default' : 'outline'}
                                    onClick={() => setPrintModal({ ...printModal, orientation: 'portrait' })}
                                    className="flex-1"
                                >
                                    세로 인쇄
                                </Button>
                                <Button
                                    variant={printModal.orientation === 'landscape' ? 'default' : 'outline'}
                                    onClick={() => setPrintModal({ ...printModal, orientation: 'landscape' })}
                                    className="flex-1"
                                >
                                    가로 인쇄
                                </Button>
                            </div>
                        </div>

                        {/* 용지 크기 선택 */}
                        <div>
                            <label className="text-sm font-medium mb-2 block">용지 크기</label>
                            <div className="flex gap-2">
                                <Button
                                    variant={printModal.paperSize === 'A4' ? 'default' : 'outline'}
                                    onClick={() => setPrintModal({ ...printModal, paperSize: 'A4' })}
                                    className="flex-1"
                                >
                                    A4
                                </Button>
                                <Button
                                    variant={printModal.paperSize === 'A3' ? 'default' : 'outline'}
                                    onClick={() => setPrintModal({ ...printModal, paperSize: 'A3' })}
                                    className="flex-1"
                                >
                                    A3
                                </Button>
                            </div>
                        </div>

                        {/* 인쇄할 그룹 선택 */}
                        <div>
                            <label className="text-sm font-medium mb-2 block">인쇄할 그룹</label>
                            <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2">
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={printModal.showAllGroups}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setPrintModal({
                                                    ...printModal,
                                                    showAllGroups: true,
                                                    selectedGroups: allGroupsList
                                                });
                                            } else {
                                                setPrintModal({
                                                    ...printModal,
                                                    showAllGroups: false,
                                                    selectedGroups: []
                                                });
                                            }
                                        }}
                                        className="mr-2"
                                    />
                                    <span className="text-sm font-bold">모든 그룹</span>
                                    <span className="text-xs text-muted-foreground ml-2">({allGroupsList.length}개 그룹)</span>
                                </div>
                                {!printModal.showAllGroups && (
                                    <div className="ml-4 space-y-1">
                                        {allGroupsList.map((groupName) => (
                                            <div key={groupName} className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={printModal.selectedGroups.includes(groupName)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setPrintModal({
                                                                ...printModal,
                                                                selectedGroups: [...printModal.selectedGroups, groupName]
                                                            });
                                                        } else {
                                                            setPrintModal({
                                                                ...printModal,
                                                                selectedGroups: printModal.selectedGroups.filter(g => g !== groupName)
                                                            });
                                                        }
                                                    }}
                                                    className="mr-2"
                                                />
                                                <span className="text-sm">{groupName}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {printModal.showAllGroups
                                    ? `모든 그룹(${allGroupsList.length}개)이 선택되었습니다.각 그룹은 별도 페이지로 인쇄됩니다.`
                                    : printModal.selectedGroups.length > 0
                                        ? `${printModal.selectedGroups.length}개 그룹이 선택되었습니다.각 그룹은 별도 페이지로 인쇄됩니다.`
                                        : '인쇄할 그룹을 선택해주세요.'
                                }
                            </p>
                        </div>

                        {/* 출력할 코스 선택 */}
                        <div>
                            <label className="text-sm font-medium mb-2 block">출력할 코스 선택</label>
                            <div className="space-y-2 border rounded p-2">
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={printModal.showAllCourses}
                                        onChange={(e) => {
                                            const availableCoursesList = new Set<string>();
                                            Object.values(finalDataByGroup).forEach((playersList: any) => {
                                                playersList.forEach((p: any) => {
                                                    p.assignedCourses?.forEach((c: any) => {
                                                        const cName = p.coursesData[c.id]?.courseName || c.name;
                                                        if (cName) availableCoursesList.add(cName);
                                                    });
                                                });
                                            });

                                            if (e.target.checked) {
                                                setPrintModal({
                                                    ...printModal,
                                                    showAllCourses: true,
                                                    selectedCourses: Array.from(availableCoursesList).sort()
                                                });
                                            } else {
                                                setPrintModal({
                                                    ...printModal,
                                                    showAllCourses: false,
                                                    selectedCourses: []
                                                });
                                            }
                                        }}
                                        className="mr-2"
                                    />
                                    <span className="text-sm font-bold">모든 코스</span>
                                </div>
                                {!printModal.showAllCourses && (
                                    <div className="ml-4 flex flex-wrap gap-x-4 gap-y-1">
                                        {(() => {
                                            const availableCoursesList = new Set<string>();
                                            Object.values(finalDataByGroup).forEach((playersList: any) => {
                                                playersList.forEach((p: any) => {
                                                    p.assignedCourses?.forEach((c: any) => {
                                                        const cName = p.coursesData[c.id]?.courseName || c.name;
                                                        if (cName) availableCoursesList.add(cName);
                                                    });
                                                });
                                            });
                                            return Array.from(availableCoursesList).sort().map((courseName) => (
                                                <div key={courseName} className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={printModal.selectedCourses.includes(courseName)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setPrintModal({
                                                                    ...printModal,
                                                                    selectedCourses: [...printModal.selectedCourses, courseName]
                                                                });
                                                            } else {
                                                                setPrintModal({
                                                                    ...printModal,
                                                                    selectedCourses: printModal.selectedCourses.filter(c => c !== courseName)
                                                                });
                                                            }
                                                        }}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-sm">{courseName}</span>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 text-blue-600 font-medium italic">
                                * 선택한 코스만 인쇄되지만, 순위와 총타수는 전체 코스 성적으로 계산됩니다.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => setPrintModal({ ...printModal, open: false })} className="mt-2 sm:mt-0">
                            취소
                        </Button>
                        <Button
                            variant="outline"
                            onClick={showPreview}
                            className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                            disabled={!printModal.showAllGroups && printModal.selectedGroups.length === 0}
                        >
                            👁️ 미리보기
                        </Button>
                        <Button
                            onClick={handleSaveImage}
                            className="bg-orange-600 hover:bg-orange-700 text-white w-full sm:w-auto"
                            disabled={!printModal.showAllGroups && printModal.selectedGroups.length === 0 || isSavingImage}
                        >
                            {isSavingImage ? '변환 중...' : '📸 점수표 이미지 저장'}
                        </Button>
                        <Button
                            onClick={executePrint}
                            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                            disabled={!printModal.showAllGroups && printModal.selectedGroups.length === 0}
                        >
                            <Printer className="mr-2 h-4 w-4" />
                            인쇄하기
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 점수 누락 현황 모달 */}
            <Dialog open={scoreCheckModal.open} onOpenChange={open => setScoreCheckModal({ ...scoreCheckModal, open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>경기완료/순위 계산 확인</DialogTitle>
                        <DialogDescription>
                            {scoreCheckModal.missingScores.length === 0 ? (
                                <span className="text-green-600 font-bold">모든 점수가 100% 입력되어 있습니다!</span>
                            ) : (
                                <span className="text-red-600 font-bold">누락된 점수가 {scoreCheckModal.missingScores.length}개 있습니다.</span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    {scoreCheckModal.missingScores.length > 0 && (
                        <div className="max-h-60 overflow-y-auto border rounded p-2 mb-2 bg-muted/30">
                            <ul className="text-sm">
                                {scoreCheckModal.missingScores.map((item, idx) => (
                                    <li key={idx}>
                                        <b>{item.playerName}</b> - {item.courseName} {item.hole}번 홀
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {/* 순위/백카운트/서든데스 안내 메시지 */}
                    {scoreCheckModal.resultMsg && (
                        <div className="mt-4 p-3 rounded bg-blue-50 text-blue-900 font-bold text-center border">
                            {scoreCheckModal.resultMsg}
                        </div>
                    )}
                    <DialogFooter>
                        {scoreCheckModal.missingScores.length > 0 ? (
                            <>
                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleAutoFillZero} disabled={autoFilling}>
                                    {autoFilling ? '입력 중...' : '누락 점수 0점으로 자동 입력'}
                                </Button>
                                <Button variant="outline" onClick={() => setScoreCheckModal({ ...scoreCheckModal, open: false })} disabled={autoFilling}>닫기</Button>
                            </>
                        ) : (
                            <Button onClick={() => setScoreCheckModal({ ...scoreCheckModal, open: false })}>확인</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 점수 수정 모달 - 로컬 상태로 관리하여 부모 리렌더링 방지 */}
            <ScoreEditModalComponent
                open={scoreEditModal.open}
                playerId={scoreEditModal.playerId}
                courseId={scoreEditModal.courseId}
                holeIndex={scoreEditModal.holeIndex}
                initialScore={scoreEditModal.score}
                initialForfeitType={scoreEditModal.forfeitType}
                playerName={scoreEditModal.playerName}
                courseName={scoreEditModal.courseName}
                onClose={() => setScoreEditModal(prev => ({ ...prev, open: false }))}
                onSave={async (score, forfeitType) => {
                    setScoreEditModal(prev => ({ ...prev, score, forfeitType }));
                    await handleScoreEditSave(score, forfeitType);
                }}
                finalDataByGroup={finalDataByGroup}
                playerScoreLogs={playerScoreLogs}
                scores={scores}
            />

            {/* Archive Modal */}
            <ArchiveModalComponent
                open={archiveModalOpen}
                onOpenChange={setArchiveModalOpen}
                tournamentName={tournamentName}
                initialDate={archiveDate}
                onConfirm={handleConfirmArchive}
            />
        </>
    );
}