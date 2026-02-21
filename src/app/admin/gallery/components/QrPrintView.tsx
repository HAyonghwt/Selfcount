"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
// @ts-ignore
import QRCode from 'qrcode.react';

interface QrPrintViewProps {
    isOpen: boolean;
    onClose: () => void;
    tournamentName: string;
    galleryUrl: string;
    scoreboardUrl: string;
}

export default function QrPrintView({ isOpen, onClose, tournamentName, galleryUrl, scoreboardUrl }: QrPrintViewProps) {
    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-[calc(100vw-2rem)] md:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl print:hidden">
                    <DialogHeader className="p-6 border-b shrink-0 bg-white">
                        <DialogTitle className="text-xl font-black flex items-center gap-2 text-slate-900">
                            <Printer className="w-6 h-6 text-blue-600" />
                            QR코드 인쇄하기
                        </DialogTitle>
                        <DialogDescription className="font-bold text-slate-500">
                            화면의 디자인이 A4 용지 한 장에 그대로 출력됩니다. 인쇄 미리보기가 나오지 않으면 다시 시도해 주세요.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto bg-slate-200 p-4 md:p-8 flex justify-center">
                        {/* A4 Preview Container (Visible on screen) */}
                        <div className="bg-white shadow-xl w-[210mm] min-h-[297mm] p-[15mm] flex flex-col items-center text-center text-black border border-slate-300 shrink-0">
                            <div className="w-full h-full flex flex-col items-center justify-between py-4">
                                <header className="border-b-[5px] border-slate-900 w-full pb-4">
                                    <h1 className="text-3xl font-black mb-2 break-keep tracking-tight text-slate-900 leading-tight">
                                        {tournamentName} 점수표
                                    </h1>
                                    <div className="bg-slate-900 text-white inline-block px-10 py-0.5 rounded-full text-sm font-black tracking-widest uppercase">
                                        OFFICIAL SCOREBOARD
                                    </div>
                                </header>

                                <div className="flex-1 flex flex-col items-center justify-center w-full gap-6 py-4">
                                    <section className="flex flex-col items-center w-full">
                                        <h3 className="text-lg font-black mb-3 flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
                                            성적순위 갤러리 형식으로 보기
                                        </h3>
                                        <div className="bg-white p-4 border-[3px] border-slate-900 rounded-[1.25rem] shadow-sm mb-3">
                                            <QRCode value={galleryUrl} size={280} level="H" includeMargin={true} renderAs="svg" />
                                        </div>
                                        <p className="text-base font-black text-slate-900">
                                            스마트폰 카메라로 스캔하여 성적을 확인하세요
                                        </p>
                                    </section>

                                    <div className="w-[50%] h-px bg-slate-200" />

                                    <section className="flex flex-col items-center w-full">
                                        <h3 className="text-lg font-black mb-3 flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-slate-400 rounded-full"></span>
                                            성적순위 전광판 형식으로 보기
                                        </h3>
                                        <div className="bg-white p-2.5 border-[2px] border-slate-300 rounded-lg mb-3">
                                            <QRCode value={scoreboardUrl} size={150} level="H" includeMargin={true} renderAs="svg" />
                                        </div>
                                        <p className="text-sm font-black text-slate-500">
                                            외부 전광판 / Scoreboard 링크
                                        </p>
                                    </section>
                                </div>

                                <footer className="mt-2 pt-4 border-t-[2px] border-slate-100 w-full flex justify-between items-center text-slate-400 text-[11px] font-black italic">
                                    <div className="flex items-center gap-2">
                                        <span className="text-blue-600">SELFCOUNT</span>
                                        <span>SYSTEM</span>
                                    </div>
                                    <span>인쇄일: {new Date().toLocaleDateString()}</span>
                                </footer>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-4 border-t bg-slate-50 gap-2 shrink-0">
                        <Button variant="outline" onClick={onClose} className="font-black border-slate-300">
                            <X className="w-4 h-4 mr-2" /> 닫기
                        </Button>
                        <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 font-black px-10 scale-105 transition-transform">
                            <Printer className="w-4 h-4 mr-2" /> 인쇄하기 / PDF 다운로드
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Print Layout (Only visible when printing) */}
            <div className="hidden print:block fixed inset-0 bg-white z-[999999] print-only-container">
                <div className="w-[210mm] h-[297mm] p-[15mm] flex flex-col items-center text-center text-black">
                    <div className="w-full h-full flex flex-col items-center justify-between py-4">
                        <header className="border-b-[5px] border-slate-900 w-full pb-4">
                            <h1 className="text-3xl font-black mb-2 break-keep tracking-tight text-slate-900 leading-tight">
                                {tournamentName} 점수표
                            </h1>
                            <div className="bg-slate-900 text-white inline-block px-10 py-0.5 rounded-full text-sm font-black tracking-widest uppercase">
                                OFFICIAL SCOREBOARD
                            </div>
                        </header>

                        <div className="flex-1 flex flex-col items-center justify-center w-full gap-6 py-4">
                            <section className="flex flex-col items-center w-full">
                                <h3 className="text-lg font-black mb-3 flex items-center gap-2">
                                    <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
                                    성적순위 갤러리 형식으로 보기
                                </h3>
                                <div className="bg-white p-4 border-[3px] border-slate-900 rounded-[1.25rem] mb-3">
                                    <QRCode value={galleryUrl} size={280} level="H" includeMargin={true} renderAs="svg" />
                                </div>
                                <p className="text-base font-black text-slate-900">
                                    스마트폰 카메라로 스캔하여 성적을 확인하세요
                                </p>
                            </section>

                            <div className="w-[50%] h-px bg-slate-200" />

                            <section className="flex flex-col items-center w-full">
                                <h3 className="text-lg font-black mb-3 flex items-center gap-2">
                                    <span className="w-1.5 h-6 bg-slate-400 rounded-full"></span>
                                    성적순위 전광판 형식으로 보기
                                </h3>
                                <div className="bg-white p-2.5 border-[2px] border-slate-300 rounded-lg mb-3">
                                    <QRCode value={scoreboardUrl} size={150} level="H" includeMargin={true} renderAs="svg" />
                                </div>
                                <p className="text-sm font-black text-slate-500">
                                    외부 전광판 / Scoreboard 링크
                                </p>
                            </section>
                        </div>

                        <footer className="mt-2 pt-4 border-t-[2px] border-slate-100 w-full flex justify-between items-center text-slate-400 text-[11px] font-black italic">
                            <div className="flex items-center gap-2">
                                <span className="text-blue-600">SELFCOUNT</span>
                                <span>SYSTEM</span>
                            </div>
                            <span>인쇄일: {new Date().toLocaleDateString()}</span>
                        </footer>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }
                    html, body {
                        width: 210mm !important;
                        height: 297mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    
                    /* Hide everything except the print container and portals */
                    #__next, #root, .__next-root {
                        display: none !important;
                    }
                    
                    .print-only-container {
                        display: block !important;
                        visibility: visible !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        background: white !important;
                        z-index: 999999 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    .print-only-container * {
                        visibility: visible !important;
                    }
                }
            ` }} />
        </>
    );
}
