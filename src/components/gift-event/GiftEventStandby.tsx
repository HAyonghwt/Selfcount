"use client";
import React from "react";
import { Gift } from "lucide-react";

export default function GiftEventStandby() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300">
      <div className="text-6xl font-extrabold text-yellow-600 mb-8 text-center animate-bounce">
        경품 추첨 대기 중
      </div>
      <div className="text-4xl font-semibold text-gray-700 text-center animate-pulse">
        잠시 후 경품 추첨이 있겠습니다
      </div>
    </div>
  );
}
