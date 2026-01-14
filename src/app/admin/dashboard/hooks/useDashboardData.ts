import { useState, useEffect, useRef } from 'react';
import { db, ensureAuthenticated } from '@/lib/firebase';
import { ref, onValue, onChildChanged, onChildAdded, onChildRemoved } from 'firebase/database';
import { ScoreLog, invalidatePlayerLogCache } from '@/lib/scoreLogs';

export function useDashboardData() {
    const [players, setPlayers] = useState<any>({});
    const [scores, setScores] = useState<any>({});
    const [courses, setCourses] = useState<any>({});
    const [groupsData, setGroupsData] = useState<any>({});
    const [tournamentName, setTournamentName] = useState('골프 대회');
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [individualSuddenDeathData, setIndividualSuddenDeathData] = useState<any>(null);
    const [teamSuddenDeathData, setTeamSuddenDeathData] = useState<any>(null);
    const [individualBackcountApplied, setIndividualBackcountApplied] = useState<{ [groupName: string]: boolean }>({});
    const [teamBackcountApplied, setTeamBackcountApplied] = useState<{ [groupName: string]: boolean }>({});
    const [individualNTPData, setIndividualNTPData] = useState<any>(null);
    const [teamNTPData, setTeamNTPData] = useState<any>(null);
    const [playerScoreLogs, setPlayerScoreLogs] = useState<{ [playerId: string]: ScoreLog[] }>({});
    const [resumeSeq, setResumeSeq] = useState(0);
    const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());

    const activeUnsubsRef = useRef<(() => void)[]>([]);
    const lastProcessedResetAt = useRef<number | null>(null);

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

    useEffect(() => {
        if (!db) return;

        // 🟢 전광판(/scoreboard)의 성공 공식을 100% 동일하게 이식
        stopSubscriptions();

        ensureAuthenticated().then((isAuthenticated) => {
            if (!isAuthenticated || !db) return;
            const dbInstance = db;

            // 1회성 초기 로드 (Phase 1)
            if (!initialDataLoaded) {
                const playersRef = ref(dbInstance, 'players');
                const scoresRef = ref(dbInstance, 'scores');
                const tournamentRef = ref(dbInstance, 'tournaments/current');

                let loadedCount = 0;
                const checkAllLoaded = () => {
                    loadedCount++;
                    if (loadedCount >= 3) setInitialDataLoaded(true);
                };

                const unsubInitialPlayers = onValue(playersRef, snap => {
                    setPlayers(snap.val() || {});
                    checkAllLoaded();
                }, { onlyOnce: true });

                const unsubInitialScores = onValue(scoresRef, snap => {
                    setScores(snap.val() || {});
                    checkAllLoaded();
                }, { onlyOnce: true });

                const unsubInitialTournament = onValue(tournamentRef, snap => {
                    const data = snap.val() || {};
                    setCourses(data.courses || {});
                    setGroupsData(data.groups || {});
                    checkAllLoaded();
                }, { onlyOnce: true });

                activeUnsubsRef.current.push(unsubInitialPlayers, unsubInitialScores, unsubInitialTournament);
            }

            // 실시간 상시 리스너 (Phase 2 - initialDataLoaded가 true인 경우에만 활성화)
            if (initialDataLoaded) {
                const playersRef = ref(dbInstance, 'players');
                const scoresRef = ref(dbInstance, 'scores');
                const tournamentRef = ref(dbInstance, 'tournaments/current');

                // 선수 정보 실시간 반영
                const unsubPlayers = onChildChanged(playersRef, snap => {
                    const playerId = snap.key;
                    const playerData = snap.val();
                    if (playerId && playerData) {
                        setPlayers((prev: any) => ({ ...prev, [playerId]: playerData }));
                        setLastUpdateTime(Date.now());
                    }
                });

                // 점수 실시간 반영 (전광판 방식)
                const handleScoreSync = (snap: any) => {
                    const playerId = snap.key;
                    const playerData = snap.val();
                    if (playerId) {
                        setScores((prev: any) => {
                            if (prev && prev[playerId] && JSON.stringify(prev[playerId]) === JSON.stringify(playerData)) {
                                return prev;
                            }
                            console.log(`[useDashboardData] 🔔 점수 실시간 업데이트 수신: ${playerId}`);
                            return { ...prev, [playerId]: playerData };
                        });
                        invalidatePlayerLogCache(playerId);
                        setLastUpdateTime(Date.now());
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
                        setLastUpdateTime(Date.now());
                    }
                });

                // 토너먼트/코스/그룹 실시간 반영
                const unsubTournament = onValue(tournamentRef, snap => {
                    const data = snap.val() || {};
                    setCourses(data.courses || {});
                    setGroupsData(data.groups || {});
                    setLastUpdateTime(Date.now());
                });

                activeUnsubsRef.current.push(
                    unsubPlayers, unsubScoresChanged, unsubScoresAdded,
                    unsubScoresRemoved, unsubTournament
                );

                // 기타 부가 정보 리스너
                const tournamentNameRef = ref(dbInstance, 'tournaments/current/name');
                const individualSuddenDeathRef = ref(dbInstance, 'tournaments/current/suddenDeath/individual');
                const teamSuddenDeathRef = ref(dbInstance, 'tournaments/current/suddenDeath/team');
                const individualBackcountRef = ref(dbInstance, 'tournaments/current/backcountApplied/individual');
                const teamBackcountRef = ref(dbInstance, 'tournaments/current/backcountApplied/team');
                const individualNTPRef = ref(dbInstance, 'tournaments/current/nearestToPin/individual');
                const teamNTPRef = ref(dbInstance, 'tournaments/current/nearestToPin/team');
                const lastResetAtRef = ref(dbInstance, 'tournaments/current/lastResetAt');

                const unsubName = onValue(tournamentNameRef, snap => setTournamentName(snap.val() || '골프 대회'));
                const unsubISD = onValue(individualSuddenDeathRef, snap => setIndividualSuddenDeathData(snap.val()));
                const unsubTSD = onValue(teamSuddenDeathRef, snap => setTeamSuddenDeathData(snap.val()));
                const unsubIBC = onValue(individualBackcountRef, snap => {
                    const data = snap.val();
                    setIndividualBackcountApplied(typeof data === 'boolean' ? (data ? { '*': true } : {}) : (data || {}));
                });
                const unsubTBC = onValue(teamBackcountRef, snap => {
                    const data = snap.val();
                    setTeamBackcountApplied(typeof data === 'boolean' ? (data ? { '*': true } : {}) : (data || {}));
                });
                const unsubINTP = onValue(individualNTPRef, snap => setIndividualNTPData(snap.val()));
                const unsubTNTP = onValue(teamNTPRef, snap => setTeamNTPData(snap.val()));
                const unsubReset = onValue(lastResetAtRef, snap => {
                    const lastResetAt = snap.val();
                    if (lastResetAt && lastProcessedResetAt.current !== null && lastProcessedResetAt.current !== lastResetAt) {
                        setScores({});
                        setPlayerScoreLogs({});
                    }
                    lastProcessedResetAt.current = lastResetAt;
                });

                activeUnsubsRef.current.push(unsubName, unsubISD, unsubTSD, unsubIBC, unsubTBC, unsubINTP, unsubTNTP, unsubReset);
            }
        });

        // 가시성 변경 감지 (전광판 방식)
        const onVisibilityChange = () => {
            if (typeof document !== 'undefined' && !document.hidden) setResumeSeq(s => s + 1);
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        const fallbackTimer = setTimeout(() => {
            if (!initialDataLoaded) setInitialDataLoaded(true);
        }, 5000);

        return () => {
            stopSubscriptions();
            document.removeEventListener('visibilitychange', onVisibilityChange);
            clearTimeout(fallbackTimer);
        };
    }, [initialDataLoaded, resumeSeq]);


    return {
        players, setPlayers,
        scores, setScores,
        courses, setCourses,
        groupsData, setGroupsData,
        tournamentName,
        initialDataLoaded,
        individualSuddenDeathData,
        teamSuddenDeathData,
        individualBackcountApplied,
        teamBackcountApplied,
        individualNTPData,
        teamNTPData,
        playerScoreLogs, setPlayerScoreLogs,
        lastProcessedResetAt,
        stopSubscriptions
    };
}
