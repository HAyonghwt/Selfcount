import { ProcessedPlayer } from '../types';

/**
 * Helper function for tie-breaking using back-count method
 */
export const tieBreak = (a: any, b: any, sortedCourses: any[]) => {
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
        if (!course || course.id === undefined || course.id === null) continue;
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
    if (sortedCourses.length > 0) {
        for (const course of sortedCourses) {
            if (!course || course.id === undefined || course.id === null) continue;
            const courseId = course.id;
            const aDetailObj = a.detailedScores || {};
            const bDetailObj = b.detailedScores || {};
            const aHoleScores = aDetailObj[courseId] || {};
            const bHoleScores = bDetailObj[courseId] || {};

            // 9번 홀부터 1번 홀까지 역순으로 비교
            for (let i = 9; i >= 1; i--) {
                const hole = i.toString();
                const aHole = aHoleScores[hole] || 0;
                const bHole = bHoleScores[hole] || 0;

                // 점수가 다르면 비교 결과 반환
                if (aHole !== bHole) {
                    return aHole - bHole;
                }
            }
        }
    }

    return 0;
};

/**
 * 파합계(기본파) 계산 함수
 */
export function getTotalParForPlayer(courses: any, assignedCourses: any[]) {
    let total = 0;
    assignedCourses.forEach(course => {
        const courseData = courses[course.id];
        if (courseData && Array.isArray(courseData.pars)) {
            total += courseData.pars.reduce((acc: number, b: number) => acc + (b || 0), 0);
        }
    });
    return total;
}

/**
 * 외부 전광판과 완전히 동일한 ± 및 총타수 계산 함수
 */
export function getPlayerTotalAndPlusMinus(courses: any, player: any) {
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

/**
 * 안전한 number 체크 함수
 */
export const isValidNumber = (v: any) => typeof v === 'number' && !isNaN(v);

/**
 * 서든데스 데이터 처리 함수
 */
export const processSuddenDeath = (suddenDeathData: any, players: any) => {
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

/**
 * 플레이오프 등수 적용 함수
 */
export const applyPlayoffRanking = (
    data: any,
    individualNTPData: any,
    teamNTPData: any,
    individualBackcountApplied: any,
    teamBackcountApplied: any,
    groupsData: any,
    courses: any
) => {
    const finalData = JSON.parse(JSON.stringify(data));
    for (const groupName in finalData) {
        const groupPlayers = finalData[groupName];
        if (!groupPlayers || groupPlayers.length === 0) continue;

        const playerType = groupPlayers[0].type;
        const isIndividual = playerType === 'individual';

        // 1. NTP 순위 적용
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
