"use client";
import React from 'react';
import ExternalScoreboardInfo from '@/components/ExternalScoreboardInfo';

export default function AdminMainPage() {
    // 외부 전광판 URL
    const externalScoreboardUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/scoreboard`
        : '/scoreboard';

    return (
        <div className="space-y-6">
            {/* 외부 전광판 주소 카드 */}
            <ExternalScoreboardInfo url={externalScoreboardUrl} />
        </div>
    );
}

