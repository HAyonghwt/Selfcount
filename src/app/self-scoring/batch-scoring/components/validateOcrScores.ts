/**
 * OCR 점수 검증 유틸리티
 * 
 * OCR로 인식된 점수의 정확성을 3단계로 검증합니다:
 * 1단계: 합계 비교 (9홀 점수 합 vs 점수표 Total)
 * 2단계: 절대 범위 검증 (0타 또는 11타 이상 불가)
 * 3단계: 더블파 초과 검증 (Par × 2 초과 점수 불가)
 */

export interface ValidationWarning {
    playerName: string;
    courseName: string;
    holeNumber?: number;       // 1-based (사용자에게 표시용)
    type: 'sum_mismatch' | 'impossible_score' | 'double_par_exceeded';
    message: string;
}

interface OcrPlayer {
    name: string;
    scores: (number | null)[];
    total?: number | null;
}

interface OcrCourse {
    courseName: string;
    players: OcrPlayer[];
}

interface CourseParInfo {
    name: string;
    pars: number[];
}

/**
 * OCR 인식 결과를 검증하고 경고 목록을 반환합니다.
 * 
 * @param ocrCourses - AI가 인식한 코스별 점수 데이터
 * @param courseParMap - 코스 이름 → 파 정보 매핑 (courseTabs에서 생성)
 * @returns 경고 목록 (빈 배열이면 이상 없음)
 */
export function validateOcrScores(
    ocrCourses: OcrCourse[],
    courseParMap: Map<string, CourseParInfo>
): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    for (const ocrCourse of ocrCourses) {
        // 코스 이름 매칭 (기존 handleOcrResult와 동일한 방식)
        let matchedPars: number[] | null = null;
        let matchedCourseName = ocrCourse.courseName;

        for (const [, info] of courseParMap) {
            if (info.name.includes(ocrCourse.courseName) || ocrCourse.courseName.includes(info.name)) {
                matchedPars = info.pars;
                matchedCourseName = info.name;
                break;
            }
        }

        for (const player of ocrCourse.players) {
            const validScores = player.scores.filter((s): s is number => typeof s === 'number');

            // ─── 1단계: 합계 비교 ───
            if (typeof player.total === 'number' && validScores.length > 0) {
                const calculatedSum = validScores.reduce((a, b) => a + b, 0);
                if (calculatedSum !== player.total) {
                    warnings.push({
                        playerName: player.name,
                        courseName: matchedCourseName,
                        type: 'sum_mismatch',
                        message: `${player.name} 선수의 점수 합계(${calculatedSum})가 점수표 합계(${player.total})와 다릅니다.`,
                    });
                }
            }

            // ─── 2단계: 절대 범위 검증 (0타, 11타 이상 불가) ───
            player.scores.forEach((score, idx) => {
                if (typeof score !== 'number') return;

                if (score <= 0 || score >= 11) {
                    warnings.push({
                        playerName: player.name,
                        courseName: matchedCourseName,
                        holeNumber: idx + 1,
                        type: 'impossible_score',
                        message: `${player.name} 선수 ${idx + 1}홀: ${score}타는 존재할 수 없는 점수입니다.`,
                    });
                }
            });

            // ─── 3단계: 더블파 초과 검증 ───
            if (matchedPars) {
                player.scores.forEach((score, idx) => {
                    if (typeof score !== 'number' || idx >= matchedPars!.length) return;

                    const par = matchedPars![idx];
                    const doublePar = par * 2;

                    if (score > doublePar) {
                        warnings.push({
                            playerName: player.name,
                            courseName: matchedCourseName,
                            holeNumber: idx + 1,
                            type: 'double_par_exceeded',
                            message: `${player.name} 선수 ${idx + 1}홀: ${score}타 (Par ${par}, 더블파 ${doublePar} 초과)`,
                        });
                    }
                });
            }
        }
    }

    return warnings;
}
