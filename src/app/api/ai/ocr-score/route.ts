
import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import { z } from 'zod';

// OCR 결과 데이터 스키마 정의
const OcrResultSchema = z.object({
    courses: z.array(z.object({
        courseName: z.string().describe('코스 이름 (예: A코스, B코스 등)'),
        players: z.array(z.object({
            name: z.string().describe('선수 이름'),
            scores: z.array(z.union([z.number(), z.null()])).describe('1홀부터 9홀까지의 점수 (기록이 없으면 null)'),
            total: z.union([z.number(), z.null()]).describe('합계(Total) 칸의 숫자. 칸에 숫자가 있으면 반드시 읽어서 숫자로 반환, 없거나 읽을 수 없으면 null'),
        })).describe('해당 코스의 선수별 점수 리스트')
    })).describe('인식된 모든 코스의 데이터')
});

export async function POST(req: NextRequest) {
    try {
        const { image } = await req.json();

        if (!image) {
            return NextResponse.json({ error: '이미지 데이터가 없습니다.' }, { status: 400 });
        }

        // [중요] 프롬프트 설계: 인식률 향상을 위한 논리적 검토 및 수정 흔적 판별 지침 추가
        const prompt = `
      이 사진은 파크골프 수기 채점표입니다. 다음 지침에 따라 데이터를 매우 정밀하게 추출해주세요:
      
      1. 사진 속에 있는 모든 코스(예: A코스, B코스, C코스, D코스 등)를 찾으세요.
         - 만약 인쇄된 코스 이름에 줄이 그어져 있고 그 주변에 수기로 다른 코스 이름이 적혀 있다면, 수기로 적힌 이름을 실제 코스 이름으로 인식하세요.
      2. 각 코스별로 표 안에 적힌 선수들의 이름과 1홀부터 9홀까지의 점수를 추출하세요.
      3. [매우 중요] 점수 판별 지침:
         - 바를 정(正)자는 무시하고, 우측에 적힌 '아라비아 숫자'를 점수로 인식하세요.
         - 숫자에 줄이 그어져 있거나(삭선), 덧쓴 흔적이 있다면 가장 명확하게 남은 최종 의도의 숫자를 선택하세요.
         - 악필에서 혼동하기 쉬운 숫자 쌍(1과 7, 0과 6, 3과 8, **특히 3과 2**)은 획의 특징을 정밀히 분석하여 판별하세요. (예: 3의 윗부분 곡선과 2의 수평 하단 획을 주의 깊게 비교)
         - 파크골프 점수는 보통 2에서 5 사이의 숫자가 많음을 참고하세요.
      4. [판별 우선순위 및 논리 검증] 개별 홀의 숫자가 명확하다면 보이는 대로 추출하세요. 
         수기로 적힌 'Total' 칸의 숫자는 작성자의 계산 착오로 인해 개별 홀 점수의 실제 합계와 다를 수 있습니다.
         따라서, 숫자가 매우 모호하여 판별이 어려울 경우(예: 2인지 3인지 확신이 없는 경우)에만 'Total' 칸의 숫자를 참고하여 가장 가능성 높은 숫자를 결정하세요. 
         명확하게 보이는 숫자를 'Total' 합계에 억지로 맞추기 위해 왜곡해서 인식해서는 안 됩니다.
      5. 만약 특정 홀에 점수가 적혀 있지 않다면 null로 표시하세요.
      6. [합계 처리] 합계(Total) 칸에 수기로 적힌 숫자를 읽어서 반환하되, 개별 홀 점수와 합계 점수 사이의 모순이 발견되면 가능한 한 가장 정직한 판별 결과를 도출하세요.
      7. 이름 인식: 성과 이름이 상하로 나뉘어 있거나 떨어진 경우 하나로 합쳐서 인식하세요.
      8. 모든 데이터는 수기된 내용을 바탕으로 최대한 정확하고 정직하게 추출해야 합니다.
    `;

        // Genkit을 사용하여 Gemini API 호출
        const response = await ai.generate({
            prompt: [
                { text: prompt },
                { media: { url: image } } // base64 이미지 데이터
            ],
            output: {
                schema: OcrResultSchema,
            }
        });

        const result = response.output;

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('OCR API Error:', error);
        return NextResponse.json({
            error: '이미지 분석 중 오류가 발생했습니다.',
            details: error.message
        }, { status: 500 });
    }
}
