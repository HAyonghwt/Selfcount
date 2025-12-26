"use client";
import React from "react";
import { Trophy, Sparkles, Crown, Star } from "lucide-react";

export default function GiftEventStandby() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center overflow-hidden">
      <div className="text-center relative z-10 w-full max-w-7xl mx-auto px-4">
        <div className="mb-12">
          <Trophy className="w-32 h-32 md:w-48 md:h-48 text-yellow-400 mx-auto mb-10 animate-bounce drop-shadow-[0_0_30px_rgba(250,204,21,0.5)]" />
          <h1 className="text-6xl md:text-[8rem] font-black text-white mb-6 tracking-tighter drop-shadow-2xl">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-yellow-100 to-yellow-500">
              경품 추첨 대기 중
            </span>
          </h1>
          <p className="text-2xl md:text-5xl text-yellow-200 font-bold tracking-[0.2em] mb-4">
            RAFFLE WAITING
          </p>
          <p className="text-xl md:text-2xl text-white/60 font-medium animate-pulse">
            잠시 후 경품 추첨이 시작됩니다
          </p>
        </div>

        {/* 배경 장식 요소 */}
        <div className="flex justify-center gap-12">
          <Sparkles className="w-16 h-16 text-yellow-300 animate-spin-slow" />
          <Crown className="w-16 h-16 text-yellow-300 animate-bounce" />
          <Star className="w-16 h-16 text-yellow-300 animate-pulse" />
        </div>
      </div>

      {/* 배경 효과 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-indigo-500/20 animate-pulse"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-ping"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 10s linear infinite;
        }
      `}</style>
    </div>
  );
}
