"use client";
import React from "react";
export default function GiftWinnersList({ winners }: { winners: any[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-4">
      <div className="text-lg font-bold mb-2 text-gray-700">당첨자 명단</div>
      <ul className="space-y-2">
        {winners.length === 0 && <li className="text-gray-400">아직 당첨자가 없습니다.</li>}
        {winners.map((w, i) => (
          <li key={`${w.id}_${i}`} className="flex items-center gap-2">
            <span className="font-semibold text-yellow-600">{w.club}</span>
            <span className="font-bold text-pink-700">{w.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
