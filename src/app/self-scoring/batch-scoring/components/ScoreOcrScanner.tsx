
"use client";

import React, { useState, useRef } from 'react';
import { Camera, Upload, Loader2, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';

interface ScoreOcrScannerProps {
    onResult: (data: any) => void;
}

export default function ScoreOcrScanner({ onResult }: ScoreOcrScannerProps) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 이미지 압축 및 리사이징 함수 (데이터 사용량 최적화)
    const compressImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1600; // 해상도 상향하여 인식률 개선
                    const MAX_HEIGHT = 1600;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');

                    if (ctx) {
                        // 가독성 보정: 대비와 밝기를 약간 높여 글씨를 선명하게 함
                        ctx.filter = 'contrast(1.2) brightness(1.1)';
                        ctx.drawImage(img, 0, 0, width, height);
                    }

                    // JPEG 형식으로 압축 (퀄리티 0.8로 약간 상향)
                    const base64 = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(base64);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsProcessing(true);
            setPreviewUrl(URL.createObjectURL(file));

            // 1. 이미지 압축
            const compressedBase64 = await compressImage(file);

            // 2. API 호출
            const response = await fetch('/api/ai/ocr-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: compressedBase64 }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.error || 'AI 분석에 실패했습니다.');
            }

            const data = await response.json();

            // 3. 결과 전달
            onResult(data);



            setIsOpen(false);
        } catch (error: any) {
            console.error('OCR Error:', error);
            toast({
                title: "분석 실패",
                description: error.message || "이미지 분석 중 오류가 발생했습니다.",
                variant: "destructive",
            });
        } finally {
            setIsProcessing(false);
            setPreviewUrl(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const triggerUpload = () => {
        fileInputRef.current?.click();
    };

    return (
        <>
            <Button
                onClick={() => setIsOpen(true)}
                variant="outline"
                className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
            >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">사진으로 점수 입력</span>
                <span className="sm:hidden">사진 입력</span>
            </Button>

            <Dialog open={isOpen} onOpenChange={(open) => !isProcessing && setIsOpen(open)}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>사진으로 점수 불러오기</DialogTitle>
                        <DialogDescription>
                            채점표를 직접 찍거나 저장된 사진을 선택해주세요.
                            사선(正) 표기는 제외하고 숫자만 자동으로 인식합니다.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 gap-4">
                        {isProcessing ? (
                            <div className="flex flex-col items-center gap-3 py-8">
                                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                                <p className="text-sm font-medium text-slate-600">AI가 점수표를 분석하고 있습니다...</p>
                                <p className="text-xs text-slate-400">잠시만 기다려주세요.</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-white p-4 rounded-full shadow-sm text-blue-500">
                                    <ImageIcon className="w-12 h-12" />
                                </div>
                                <div className="flex flex-col gap-2 w-full">
                                    <Button onClick={triggerUpload} className="w-full gap-2">
                                        <Camera className="w-4 h-4" />
                                        사진 찍기 / 파일 선택
                                    </Button>
                                    <p className="text-[11px] text-center text-slate-400">
                                        카톡으로 전송받은 사진도 파일 선택으로 올릴 수 있습니다.
                                    </p>
                                </div>
                            </>
                        )}

                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            disabled={isProcessing}
                        />
                    </div>

                    <DialogFooter className="sm:justify-start">
                        <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-md border border-amber-100">
                            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                            <div className="text-[11px] text-amber-700 leading-tight">
                                <strong>주의:</strong> AI 분석 결과는 100% 정확하지 않을 수 있습니다.
                                입력된 점수를 꼭 한 번 확인하신 후 저장해주세요.
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
