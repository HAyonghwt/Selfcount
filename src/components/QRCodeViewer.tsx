"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

interface QRCodeViewerProps {
    group: string;
    jo: string;
    courseName: string;
}

export default function QRCodeViewer({ group, jo, courseName }: QRCodeViewerProps) {
    const { toast } = useToast();
    const [isMounted, setIsMounted] = useState(false);
    const [isEnabled, setIsEnabled] = useState(true); // 기본값 true

    // 클라이언트 사이드에서만 렌더링되도록 보장
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // QR 코드 활성화 상태 확인
    useEffect(() => {
        if (!db || !isMounted) return;
        
        const qrConfigRef = ref(db, 'config/qrCodeEnabled');
        const unsubscribe = onValue(qrConfigRef, (snapshot) => {
            const enabled = snapshot.val();
            setIsEnabled(enabled !== false); // 기본값 true
        });
        
        return () => unsubscribe();
    }, [isMounted]);

    // QR 코드 생성 및 모달 표시 (조장점수 방식과 동일)
    const handleShowQR = () => {
        if (!group || !jo || typeof window === 'undefined') return;
        
        try {
            const baseUrl = window.location.origin;
            const viewerUrl = `${baseUrl}/self-scoring/scoring?mode=readonly&group=${encodeURIComponent(group)}&jo=${encodeURIComponent(jo)}`;
            
            // 조장점수와 동일한 방식으로 모달 생성
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
            modal.style.display = 'flex';
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
            modal.style.zIndex = '9999';
            modal.addEventListener('click', () => document.body.removeChild(modal));
            
            const box = document.createElement('div');
            box.style.backgroundColor = 'white';
            box.style.padding = '20px';
            box.style.borderRadius = '8px';
            box.style.textAlign = 'center';
            box.addEventListener('click', e => e.stopPropagation());
            
            const title = document.createElement('div');
            title.textContent = '선수용 실시간 점수 QR';
            title.style.fontWeight = '800';
            title.style.marginBottom = '8px';
            
            const groupInfo = document.createElement('div');
            groupInfo.textContent = `${group} / ${courseName} - ${jo}조`;
            groupInfo.style.fontSize = '14px';
            groupInfo.style.color = '#666';
            groupInfo.style.marginBottom = '12px';
            
            const qr = document.createElement('div');
            qr.style.display = 'flex';
            qr.style.justifyContent = 'center';
            qr.style.alignItems = 'center';
            
            // 외부 API 사용 (조장점수와 동일)
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(viewerUrl)}`;
            const img = document.createElement('img');
            img.src = qrApiUrl;
            img.alt = 'QR';
            img.style.width = '180px';
            img.style.height = '180px';
            img.onerror = () => {
                qr.textContent = 'QR 생성 실패';
            };
            qr.appendChild(img);
            
            const urlDiv = document.createElement('div');
            urlDiv.textContent = viewerUrl;
            urlDiv.style.fontSize = '12px';
            urlDiv.style.wordBreak = 'break-all';
            urlDiv.style.marginTop = '8px';
            urlDiv.style.color = '#666';
            
            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '8px';
            buttonContainer.style.justifyContent = 'center';
            buttonContainer.style.marginTop = '12px';
            
            const copy = document.createElement('button');
            copy.textContent = '링크 복사';
            copy.style.padding = '8px 16px';
            copy.style.backgroundColor = '#007bff';
            copy.style.color = 'white';
            copy.style.border = 'none';
            copy.style.borderRadius = '4px';
            copy.style.cursor = 'pointer';
            copy.addEventListener('click', async () => {
                try {
                    // 모바일에서도 동작하도록 클립보드 복사 유틸
                    let copied = false;
                    
                    // 방법 1: Clipboard API 시도 (HTTPS 환경)
                    if (navigator.clipboard && window.isSecureContext) {
                        try {
                            await navigator.clipboard.writeText(viewerUrl);
                            copied = true;
                        } catch (e) {
                            // Clipboard API 실패 시 fallback으로 진행
                        }
                    }
                    
                    // 방법 2: execCommand fallback (모바일/HTTP 환경)
                    if (!copied) {
                        const textArea = document.createElement('textarea');
                        textArea.value = viewerUrl;
                        textArea.setAttribute('readonly', '');
                        textArea.style.position = 'fixed';
                        textArea.style.top = '-1000px';
                        textArea.style.opacity = '0';
                        document.body.appendChild(textArea);
                        textArea.select();
                        textArea.setSelectionRange(0, viewerUrl.length);
                        
                        try {
                            const success = document.execCommand('copy');
                            if (success) {
                                copied = true;
                            }
                        } catch (e) {
                            // execCommand도 실패
                        }
                        
                        document.body.removeChild(textArea);
                    }
                    
                    if (copied) {
                    toast({
                        title: '복사 완료',
                        description: '링크가 클립보드에 복사되었습니다.',
                    });
                    } else {
                        // 모든 방법 실패 시 수동 복사 안내
                        toast({
                            title: '복사 실패',
                            description: '링크 복사에 실패했습니다. 링크를 길게 눌러 수동 복사해 주세요.',
                            variant: 'destructive'
                        });
                    }
                } catch (error) {
                    toast({
                        title: '복사 실패',
                        description: '링크 복사에 실패했습니다. 링크를 길게 눌러 수동 복사해 주세요.',
                        variant: 'destructive'
                    });
                }
            });
            
            const close = document.createElement('button');
            close.textContent = '닫기';
            close.style.padding = '8px 16px';
            close.style.backgroundColor = '#6c757d';
            close.style.color = 'white';
            close.style.border = 'none';
            close.style.borderRadius = '4px';
            close.style.cursor = 'pointer';
            close.addEventListener('click', () => document.body.removeChild(modal));
            
            buttonContainer.appendChild(copy);
            buttonContainer.appendChild(close);
            
            box.appendChild(title);
            box.appendChild(groupInfo);
            box.appendChild(qr);
            box.appendChild(urlDiv);
            box.appendChild(buttonContainer);
            modal.appendChild(box);
            document.body.appendChild(modal);
        } catch (error) {
            console.error('QR 모달 생성 실패:', error);
            toast({
                title: 'QR 코드 표시 실패',
                description: 'QR 코드를 표시하는 중 오류가 발생했습니다.',
                variant: 'destructive'
            });
        }
    };

    // 서버사이드 렌더링 중이면 렌더링하지 않음
    if (!isMounted) {
        return null;
    }

    // QR 기능이 비활성화되어 있으면 렌더링하지 않음
    if (!isEnabled) {
        return null;
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleShowQR}
            className="h-8 w-8 p-0 bg-blue-50 hover:bg-blue-100 border-blue-200"
            title="선수용 실시간 점수 QR코드"
        >
            <QrCode className="h-4 w-4 text-blue-600" />
        </Button>
    );
}