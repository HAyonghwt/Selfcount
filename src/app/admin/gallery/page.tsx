"use client";

import React, { useEffect, useState, useRef } from "react";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Download, Tv, Link as LinkIcon, ExternalLink } from "lucide-react";
// @ts-ignore
import QRCode from 'qrcode.react';

interface ArchiveSummary {
    id: string;
    tournamentName?: string;
    name?: string;
    location?: string;
    tournamentStartDate?: string;
    playerCount?: number;
}

const ShareCard = ({ title, description, url }: { title: string, description: string, url: string }) => {
    const qrRef = useRef<HTMLDivElement>(null);

    const handleCopy = async () => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url);
                alert("주소가 복사되었습니다!");
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = url;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    alert("주소가 복사되었습니다!");
                } catch (err) {
                    alert("복사에 실패했습니다. 주소를 수동으로 복사해 주세요.");
                }
                document.body.removeChild(textArea);
            }
        } catch (err) {
            alert("복사에 실패했습니다. 주소를 수동으로 복사해 주세요.");
        }
    };

    const handleDownload = () => {
        const canvas = qrRef.current?.querySelector("canvas");
        if (canvas) {
            const urlImg = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = urlImg;
            a.download = `gallery-qr.png`;
            a.click();
        }
    };

    return (
        <Card className="flex flex-col md:flex-row items-center justify-between p-2 mb-6 border-blue-100 bg-blue-50/30">
            <CardContent className="flex flex-col md:flex-row justify-between items-center p-6 w-full gap-8">
                <div className="flex-1 flex flex-col justify-center min-w-[300px]">
                    <div className="text-xl font-bold mb-2 text-slate-800 flex items-center gap-2">
                        <Tv className="w-5 h-5 text-blue-600" />
                        {title}
                    </div>
                    <div className="text-sm text-slate-500 mb-6 leading-relaxed">
                        {description}
                    </div>
                    <div className="flex items-center w-full gap-2">
                        <div className="flex-1 bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 truncate shadow-sm">
                            {url}
                        </div>
                        <Button variant="default" onClick={handleCopy} size="sm" className="bg-blue-600 hover:bg-blue-700 shrink-0">
                            <Copy className="w-4 h-4 mr-2" /> 주소 복사
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center bg-white p-6 rounded-xl shadow-sm border border-slate-100 shrink-0">
                    <div ref={qrRef} className="mb-4">
                        <QRCode value={url} size={100} level="H" includeMargin={false} />
                    </div>
                    <Button variant="outline" onClick={handleDownload} size="sm" className="text-[11px] h-8 font-bold border-slate-200">
                        <Download className="w-3.5 h-3.5 mr-1.5" /> QR코드 다운로드
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default function AdminGalleryPage() {
    const [archives, setArchives] = useState<ArchiveSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}` : '';
    const mainGalleryUrl = `${baseUrl}/gallery`;

    useEffect(() => {
        if (!db) return;
        const listRef = ref(db, 'archives-list');
        const unsub = onValue(listRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: ArchiveSummary[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                list.sort((a, b) => (b.tournamentStartDate || '').localeCompare(a.tournamentStartDate || '') || b.id.localeCompare(a.id));
                setArchives(list);
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            alert("링크가 복사되었습니다!");
        } catch (err) {
            alert("복사 실패했습니다.");
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between border-b pb-4 mb-2">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">대회 갤러리 관리</h1>
                    <p className="text-slate-500 text-sm font-bold mt-1">대회 기록을 공유하고 관리합니다.</p>
                </div>
                <Button variant="outline" onClick={() => window.open('/gallery', '_blank')} className="font-bold border-slate-200">
                    <ExternalLink className="w-4 h-4 mr-2" /> 전체 갤러리 보기
                </Button>
            </div>

            <ShareCard
                title="전체 대회 갤러리"
                description="모든 기보관된 대회를 볼 수 있는 메인 페이지입니다. 이 주소를 공유하여 선수들이 역대 대회 기록을 찾아보게 할 수 있습니다."
                url={mainGalleryUrl}
            />

            <Card>
                <CardHeader className="border-b bg-slate-50/50 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-bold">대회별 결과 링크</CardTitle>
                            <CardDescription className="text-xs font-bold mt-0.5">분기별, 대회별 개별 결과 페이지 링크입니다.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400 font-bold">로딩 중...</div>
                    ) : archives.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 font-bold">보관된 대회가 없습니다.</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {archives.map((archive) => (
                                <div key={archive.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors gap-4">
                                    <div className="min-w-0">
                                        <h3
                                            className="font-black text-slate-800 truncate cursor-pointer hover:text-blue-600 hover:underline decoration-2 underline-offset-4 decoration-blue-200"
                                            onClick={() => window.open(`/gallery/${archive.id}`, '_blank')}
                                        >
                                            {archive.tournamentName || archive.name}
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-tight">
                                            <span>{archive.tournamentStartDate || archive.id.split('_')[1] || '-'}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                            <span>{archive.location || '장소 정보 없음'}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                            <span>{archive.playerCount || 0} PLAYERS</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-[12px] font-bold border-slate-200 text-slate-600 hover:text-blue-600"
                                            onClick={() => copyToClipboard(`${baseUrl}/gallery/${archive.id}`)}
                                        >
                                            <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
                                            링크 복사
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-900"
                                            onClick={() => window.open(`/gallery/${archive.id}`, '_blank')}
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
