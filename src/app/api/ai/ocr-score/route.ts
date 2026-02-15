
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
        })).describe('해당 코스의 선수별 점수 리스트')
    })).describe('인식된 모든 코스의 데이터')
});

export async function POST(req: NextRequest) {
    try {
        const { image } = await req.json();

        if (!image) {
            return NextResponse.json({ error: '이미지 데이터가 없습니다.' }, { status: 400 });
        }

        // [중요] 프롬프트 설계: 바를 정(正)자를 무시하고 우측 숫자만 인식하도록 요청
        const prompt = `
      이 사진은 파크골프 수기 채점표입니다. 다음 지침에 따라 데이터를 추출해주세요:
      
      1. 사진 속에 있는 모든 코스(예: A코스, B코스, C코스, D코스 등)를 찾으세요.
      2. 각 코스별로 표 안에 적힌 선수들의 이름과 1홀부터 9홀까지의 점수를 추출하세요.
      3. [매우 중요] 점수 칸에는 좌측에 바를 정(正)자로 표시된 획수와 우측에 아라비아 숫자가 함께 적혀 있을 수 있습니다.
         바를 정(正)자는 무시하고, '우측에 적힌 아라비아 숫자'만 점수로 인식하세요.
      4. 만약 특정 홀에 점수가 적혀 있지 않다면 null로 표시하세요.
      5. 합계(Total)나 서명(Signature) 칸은 무시하고 홀별 점수만 집중하세요.
      6. 모든 이름과 숫자를 정확하게 읽어주세요.
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
