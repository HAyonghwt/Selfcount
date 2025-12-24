"use client";
import React from 'react';
import ExternalScoreboardInfo from '@/components/ExternalScoreboardInfo';
import AutoScoreSimulation from '@/components/AutoScoreSimulation';

export default function AdminMainPage() {
    // 외부 전광판 URL
    const externalScoreboardUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/scoreboard`
        : '/scoreboard';

    return (
        <div className="space-y-6">
            {/* 외부 전광판 주소 카드 */}
            <ExternalScoreboardInfo url={externalScoreboardUrl} />
            
            {/* 자동 점수 입력 시뮬레이션 도구 - 완전히 독립된 컴포넌트 */}
            <AutoScoreSimulation />
        </div>
    );
}

