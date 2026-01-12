import { useMemo, useCallback, useRef } from 'react';
import { ProcessedPlayer } from '../types';
import { tieBreak, isValidNumber, getPlayerTotalAndPlusMinus, processSuddenDeath, applyPlayoffRanking } from '../utils/dashboardUtils';

interface ScoreProcessingProps {
    players: any;
    scores: any;
    courses: any;
    groupsData: any;
    individualSuddenDeathData: any;
    teamSuddenDeathData: any;
    individualBackcountApplied: any;
    teamBackcountApplied: any;
    individualNTPData: any;
    teamNTPData: any;
    playerScoreLogs?: any;
}

export function useScoreProcessing({
    players,
    scores,
    courses,
    groupsData,
    individualSuddenDeathData,
    teamSuddenDeathData,
    individualBackcountApplied,
    teamBackcountApplied,
    individualNTPData,
    teamNTPData
}: ScoreProcessingProps) {
    const tieBreakCacheRef = useRef<Map<string, number>>(new Map());
    const MAX_CACHE_SIZE = 10000;

    const cachedTieBreak = useCallback((a: any, b: any, sortedCourses: any[]) => {
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

    const processedDataByGroup = useMemo(() => {
        try {
            const allCoursesList = Object.values(courses).filter(Boolean);
            if (Object.keys(players).length === 0 || allCoursesList.length === 0) return {};

            const playersToProcess = Object.entries(players);

            const allProcessedPlayers: any[] = playersToProcess.map(([playerId, player]: [string, any]) => {
                const playerGroupData = groupsData[player.group];
                const coursesOrder = playerGroupData?.courses || {};
                const assignedCourseIds = Object.keys(coursesOrder).filter((cid: string) => {
                    const raw = coursesOrder[cid];
                    if (typeof raw === 'object' && raw !== null) return raw.order > 0;
                    return typeof raw === 'boolean' ? raw : (typeof raw === 'number' && raw > 0);
                });

                const coursesForPlayer = assignedCourseIds
                    .map(cid => {
                        if (Array.isArray(courses)) {
                            return courses.find((c: any) => String(c?.id) === String(cid));
                        }
                        return courses[cid];
                    })
                    .filter(Boolean);

                coursesForPlayer.sort((a: any, b: any) => {
                    const orderA = coursesOrder[String(a.id)];
                    const orderB = coursesOrder[String(b.id)];
                    let numA: number = (typeof orderA === 'object' && orderA !== null) ? (orderA.order || 0) : (typeof orderA === 'number' ? orderA : (a.order || 0));
                    let numB: number = (typeof orderB === 'object' && orderB !== null) ? (orderB.order || 0) : (typeof orderB === 'number' ? orderB : (b.order || 0));
                    return numA - numB;
                });

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
                        return hasZeroScore ? 'pending' : null;
                    })(),
                    assignedCourses: coursesForPlayer,
                    plusMinus,
                    courseScores,
                    detailedScores,
                    coursesData: coursesDataForPlayer,
                    total: total
                };
            });

            const groupedData = allProcessedPlayers.reduce((acc, player) => {
                const groupName = player.group || '미지정';
                if (!acc[groupName]) acc[groupName] = [];
                acc[groupName].push(player);
                return acc;
            }, {} as Record<string, any[]>);

            const rankedData: { [key: string]: ProcessedPlayer[] } = {};
            const groupsToRank = Object.keys(groupedData);

            for (const groupName of groupsToRank) {
                const groupPlayers = groupedData[groupName];
                const groupData = groupsData[groupName];
                const coursesOrder = groupData?.courses || {};
                const allCoursesForGroup = [...(groupPlayers[0]?.assignedCourses || [])].filter(c => c && c.id !== undefined);
                const coursesForGroup = [...allCoursesForGroup].sort((a: any, b: any) => {
                    const orderA = coursesOrder[String(a.id)];
                    const orderB = coursesOrder[String(b.id)];
                    let numA: number = (typeof orderA === 'object' && orderA !== null) ? (orderA.order || 0) : (typeof orderA === 'number' ? orderA : (a.order || 0));
                    let numB: number = (typeof orderB === 'object' && orderB !== null) ? (orderB.order || 0) : (typeof orderB === 'number' ? orderB : (b.order || 0));
                    return numA - numB;
                });

                const coursesForBackcount = [...coursesForGroup].reverse();

                const playersToSort = groupedData[groupName].filter((p: any) => p.hasAnyScore && !p.hasForfeited);
                const otherPlayers = groupedData[groupName].filter((p: any) => !p.hasAnyScore || p.hasForfeited);

                if (playersToSort.length > 0) {
                    playersToSort.sort((a: any, b: any) => {
                        if (a.plusMinus !== b.plusMinus) return a.plusMinus - b.plusMinus;
                        return cachedTieBreak(a, b, coursesForBackcount);
                    });

                    const minPlusMinus = playersToSort[0].plusMinus;
                    let rank = 1;
                    let oneRankCount = 0;
                    for (let i = 0; i < playersToSort.length; i++) {
                        if (playersToSort[i].plusMinus === minPlusMinus) {
                            playersToSort[i].rank = 1;
                            oneRankCount++;
                        } else break;
                    }

                    rank = oneRankCount + 1;
                    for (let i = oneRankCount; i < playersToSort.length; i++) {
                        const prev = playersToSort[i - 1];
                        const curr = playersToSort[i];
                        if (curr.plusMinus === prev.plusMinus && cachedTieBreak(curr, prev, coursesForBackcount) === 0) {
                            curr.rank = playersToSort[i - 1].rank;
                        } else {
                            curr.rank = rank;
                        }
                        rank++;
                    }
                }
                rankedData[groupName] = [...playersToSort, ...otherPlayers.map((p: any) => ({ ...p, rank: null }))];
            }
            return rankedData;
        } catch (e) {
            console.error('Data processing error:', e);
            return {};
        }
    }, [players, scores, courses, groupsData, cachedTieBreak]);

    const processedIndividualSuddenDeathData = useMemo(() => processSuddenDeath(individualSuddenDeathData, players), [individualSuddenDeathData, players]);
    const processedTeamSuddenDeathData = useMemo(() => processSuddenDeath(teamSuddenDeathData, players), [teamSuddenDeathData, players]);

    const finalDataByGroup = useMemo(() => {
        return applyPlayoffRanking(
            processedDataByGroup,
            individualNTPData,
            teamNTPData,
            individualBackcountApplied,
            teamBackcountApplied,
            groupsData,
            courses
        );
    }, [processedDataByGroup, individualNTPData, teamNTPData, individualBackcountApplied, teamBackcountApplied, groupsData, courses]);

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

    return {
        processedDataByGroup,
        finalDataByGroup,
        groupProgress,
        processedIndividualSuddenDeathData,
        processedTeamSuddenDeathData
    };
}
