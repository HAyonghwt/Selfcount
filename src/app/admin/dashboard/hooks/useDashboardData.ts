import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
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

        const tournamentRef = ref(db, 'tournaments/current');
        const tournamentNameRef = ref(db, 'tournaments/current/name');
        const individualSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/individual');
        const teamSuddenDeathRef = ref(db, 'tournaments/current/suddenDeath/team');
        const individualBackcountRef = ref(db, 'tournaments/current/backcountApplied/individual');
        const teamBackcountRef = ref(db, 'tournaments/current/backcountApplied/team');
        const individualNTPRef = ref(db, 'tournaments/current/nearestToPin/individual');
        const teamNTPRef = ref(db, 'tournaments/current/nearestToPin/team');
        const playersRef = ref(db, 'players');
        const scoresRef = ref(db, 'scores');
        const lastResetAtRef = ref(db, 'tournaments/current/lastResetAt');

        if (!initialDataLoaded) {
            let loadedCount = 0;
            const checkAllLoaded = () => {
                loadedCount++;
                if (loadedCount >= 3) {
                    setInitialDataLoaded(true);
                }
            };

            const unsubInitialPlayers = onValue(playersRef, snap => {
                setPlayers(snap.val() || {});
                checkAllLoaded();
            });

            const unsubInitialScores = onValue(scoresRef, snap => {
                setScores(snap.val() || {});
                checkAllLoaded();
            }, { onlyOnce: true });

            const unsubInitialTournament = onValue(tournamentRef, snap => {
                const data = snap.val() || {};
                setCourses(data.courses || {});
                setGroupsData(data.groups || {});
                checkAllLoaded();
            });

            const fallbackTimer = setTimeout(() => {
                if (!initialDataLoaded) setInitialDataLoaded(true);
            }, 3000);

            activeUnsubsRef.current.push(unsubInitialPlayers);
            activeUnsubsRef.current.push(unsubInitialScores);
            activeUnsubsRef.current.push(unsubInitialTournament);
            activeUnsubsRef.current.push(() => clearTimeout(fallbackTimer));
        }

        if (initialDataLoaded) {
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

            const handleScoreSync = (snap: any) => {
                const playerId = snap.key;
                const playerData = snap.val();
                if (playerId) {
                    setScores((prev: any) => {
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

            activeUnsubsRef.current.push(unsubPlayersChanges);
            activeUnsubsRef.current.push(unsubScoresChanged);
            activeUnsubsRef.current.push(unsubScoresAdded);
            activeUnsubsRef.current.push(unsubScoresRemoved);
        }

        let lastTournamentHash = '';
        const unsubTournament = onChildChanged(tournamentRef, snap => {
            const key = snap.key;
            const value = snap.val();
            if (key && value) {
                const currentHash = JSON.stringify(value);
                if (currentHash !== lastTournamentHash) {
                    lastTournamentHash = currentHash;
                    if (key === 'courses') setCourses(value);
                    else if (key === 'groups') setGroupsData(value);
                }
            }
        });

        const unsubTournamentName = onValue(tournamentNameRef, snap => {
            setTournamentName(snap.val() || '골프 대회');
        });

        const unsubIndividualSuddenDeath = onValue(individualSuddenDeathRef, snap => setIndividualSuddenDeathData(snap.val()));
        const unsubTeamSuddenDeath = onValue(teamSuddenDeathRef, snap => setTeamSuddenDeathData(snap.val()));
        const unsubIndividualBackcount = onValue(individualBackcountRef, snap => {
            const data = snap.val();
            if (typeof data === 'boolean') setIndividualBackcountApplied(data ? { '*': true } : {});
            else setIndividualBackcountApplied(data || {});
        });
        const unsubTeamBackcount = onValue(teamBackcountRef, snap => {
            const data = snap.val();
            if (typeof data === 'boolean') setTeamBackcountApplied(data ? { '*': true } : {});
            else setTeamBackcountApplied(data || {});
        });
        const unsubIndividualNTP = onValue(individualNTPRef, snap => setIndividualNTPData(snap.val()));
        const unsubTeamNTP = onValue(teamNTPRef, snap => setTeamNTPData(snap.val()));

        const unsubLastResetAt = onValue(lastResetAtRef, snap => {
            const lastResetAt = snap.val();
            if (lastResetAt) {
                if (lastProcessedResetAt.current !== null && lastProcessedResetAt.current !== lastResetAt) {
                    setScores((prev: any) => Object.keys(prev).length > 0 ? {} : prev);
                    setPlayerScoreLogs({});
                }
                lastProcessedResetAt.current = lastResetAt;
            }
        });

        activeUnsubsRef.current.push(unsubTournament);
        activeUnsubsRef.current.push(unsubTournamentName);
        activeUnsubsRef.current.push(unsubIndividualSuddenDeath);
        activeUnsubsRef.current.push(unsubTeamSuddenDeath);
        activeUnsubsRef.current.push(unsubIndividualBackcount);
        activeUnsubsRef.current.push(unsubTeamBackcount);
        activeUnsubsRef.current.push(unsubIndividualNTP);
        activeUnsubsRef.current.push(unsubTeamNTP);
        activeUnsubsRef.current.push(unsubLastResetAt);

        return () => stopSubscriptions();
    }, [initialDataLoaded]);

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
