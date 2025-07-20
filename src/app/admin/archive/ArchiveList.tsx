"use client";
import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { ref, onValue, remove } from "firebase/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface ArchiveData {
  archiveId: string;
  tournamentName: string;
  date: string;
  playerCount: number;
  players: any;
  scores: any;
  courses: any;
  groups: any;
  processedByGroup: any;
}

function formatDate(dateStr: string) {
  // yyyyMMdd_HHmmss -> yyyy-MM-dd HH:mm:ss
  if (!dateStr) return "-";
  return dateStr.replace(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, "$1-$2-$3 $4:$5:$6");
}

const ArchiveList: React.FC = () => {
  const [archives, setArchives] = useState<ArchiveData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ArchiveData|null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const archivesRef = ref(db, "archives");
    const unsub = onValue(archivesRef, snap => {
      const val = snap.val() || {};
      const arr: ArchiveData[] = Object.entries(val).map(([id, v]: any) => ({ archiveId: id, ...v }));
      arr.sort((a, b) => b.archiveId.localeCompare(a.archiveId)); // 최신순
      setArchives(arr);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleDeleteAll = async () => {
    if (!window.confirm("정말 모든 기록을 삭제하시겠습니까?")) return;
    try {
      await remove(ref(db, "archives"));
      toast({ title: "전체 삭제 완료", description: "모든 기록이 삭제되었습니다." });
    } catch (e) {
      toast({ title: "오류", description: "삭제 중 오류가 발생했습니다.", variant: "destructive" });
    }
  };

  if (loading) return <div className="text-center py-20">불러오는 중...</div>;

  if (selected) {
    // 상세보기: 기존 점수표 UI 재사용(점수초기화 버튼 제외)
    return (
      <div>
        <Button variant="outline" className="mb-4" onClick={() => setSelected(null)}>
          ← 기록보관 목록으로
        </Button>
        <ArchiveDetail archive={selected} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>기록보관 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>대회명</TableHead>
                <TableHead>날짜</TableHead>
                <TableHead>참가자수</TableHead>
                <TableHead>자료보기</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archives.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">보관된 기록이 없습니다.</TableCell>
                </TableRow>
              ) : (
                archives.map(a => (
                  <TableRow key={a.archiveId}>
                    <TableCell>
                      <button className="text-blue-700 underline" onClick={() => setSelected(a)}>{a.tournamentName || "-"}</button>
                    </TableCell>
                    <TableCell>{formatDate(a.archiveId.split("_")[0])}</TableCell>
                    <TableCell>{a.playerCount || (a.players ? Object.keys(a.players).length : "-")}</TableCell>
                    <TableCell>
                      <div className="flex gap-2 items-center">
                        <Button variant="outline" onClick={() => setSelected(a)} className="text-blue-700 border-blue-400 hover:bg-blue-50">자료보기</Button>
                        <Button variant="destructive" size="sm" onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm('정말 이 기록을 삭제하시겠습니까?')) {
                            try {
                              await remove(ref(db, `archives/${a.archiveId}`));
                              toast({ title: '삭제 완료', description: '기록이 삭제되었습니다.' });
                            } catch (e) {
                              toast({ title: '오류', description: '삭제 중 오류가 발생했습니다.', variant: 'destructive' });
                            }
                          }
                        }}>삭제</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex justify-end mt-6">
            <Button variant="destructive" onClick={handleDeleteAll}>전체 기록 삭제하기</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// 상세보기: 기존 점수표 UI 재사용(점수초기화 버튼 제외)
const ArchiveDetail: React.FC<{ archive: ArchiveData }> = ({ archive }) => {
  // 그룹 목록
  const groupKeys = archive.groups ? Object.keys(archive.groups) : [];
  const dataByGroup = archive.processedByGroup || {};
  const [filterGroup, setFilterGroup] = React.useState('all');

  // 엑셀 다운로드 핸들러 (dashboard와 동일)
  const handleExportToExcel = async () => {
    const XLSX = await import('xlsx-js-style');
    const wb = XLSX.utils.book_new();
    const dataToExport = (filterGroup === 'all') ? dataByGroup : { [filterGroup]: dataByGroup[filterGroup] };
    for (const groupName in dataToExport) {
      const groupPlayers = dataToExport[groupName];
      if (!groupPlayers || groupPlayers.length === 0) continue;
      const ws_data: { [key: string]: any } = {};
      const merges: any[] = [];
      let rowIndex = 0;
      const headers = [
        '순위', '조', '이름', '소속', '코스',
        '1','2','3','4','5','6','7','8','9',
        '코스 합계', '총타수', '비고'
      ];
      const centerAlign = {
        alignment: { vertical: 'center', horizontal: 'center' },
      };
      const borderStyle = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } },
      };
      headers.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        ws_data[cellRef] = { v: header, t: 's', s: { ...centerAlign, border: borderStyle } };
      });
      rowIndex++;
      groupPlayers.forEach((player: any) => {
        const assignedCourses = player.assignedCourses || [];
        const numCourses = assignedCourses.length > 0 ? assignedCourses.length : 1;
        let totalScore = 0;
        assignedCourses.forEach((course: any) => {
          const courseData = player.coursesData?.[course.id];
          if (courseData && typeof courseData.courseTotal === 'number') {
            totalScore += courseData.courseTotal;
          }
        });
        assignedCourses.forEach((course: any, courseIndex: number) => {
          const courseData = player.coursesData?.[course.id];
          const holeScores = courseData?.holeScores || Array(9).fill('-');
          const row: any[] = [];
          if (courseIndex === 0) {
            row.push(player.rank !== null ? player.rank : (player.hasForfeited ? '기권' : ''));
            row.push(player.jo ?? '');
            row.push(player.name ?? '');
            row.push(player.affiliation ?? '');
          } else {
            row.push('','','','');
          }
          row.push(courseData?.courseName || course.name);
          holeScores.forEach((score: any) => row.push(score ?? '-'));
          row.push(typeof courseData?.courseTotal === 'number' ? courseData.courseTotal : '');
          if (courseIndex === 0) {
            row.push(player.hasForfeited ? '기권' : (player.hasAnyScore ? totalScore : '-'));
            row.push(player.hasForfeited ? '기권' : (player.hasAnyScore ? '' : '미출전'));
          } else {
            row.push('','');
          }
          row.forEach((cell, i) => {
            ws_data[XLSX.utils.encode_cell({ r: rowIndex, c: i })] = {
              v: cell,
              t: typeof cell === 'number' ? 'n' : 's',
              s: { ...centerAlign, border: borderStyle },
            };
          });
          rowIndex++;
        });
        if (numCourses > 1) {
          // 0:순위, 1:조, 2:이름, 3:소속, 4:코스명만 병합. 5~13(홀, 합계, 총타수, 비고)는 병합 금지
          for (let col = 0; col <= 4; col++) {
            merges.push({ s: { r: rowIndex - numCourses, c: col }, e: { r: rowIndex - 1, c: col } });
          }
        }
      });
      const ws: any = ws_data;
      ws['!merges'] = merges;
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIndex - 1, c: headers.length - 1 } });
      XLSX.utils.book_append_sheet(wb, ws, groupName);
    }
    XLSX.writeFile(wb, `archive_${archive.tournamentName || '대회'}.xlsx`);
  };

  return (
    <div className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {archive.tournamentName || "-"} <span className="text-sm text-gray-400 ml-2">({formatDate(archive.archiveId.split("_")[0])})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* 그룹 선택 & 엑셀 저장 버튼 */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
            <div className="flex gap-2 items-center">
              <span>그룹 선택:</span>
              <select
                className="border rounded px-2 py-1 text-sm"
                value={filterGroup}
                onChange={e => setFilterGroup(e.target.value)}
              >
                <option value="all">전체</option>
                {groupKeys.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <Button variant="outline" onClick={handleExportToExcel}>
              엑셀로 저장
            </Button>
          </div>
          {/* 점수표 (dashboard와 100% 동일, 셀 병합/구조/비고/총타수 등 완벽 재현) */}
          <div className="overflow-x-auto">
            {(filterGroup === 'all' ? groupKeys : [filterGroup]).map(groupName => {
              const groupPlayers = dataByGroup[groupName] || [];
              if (!groupPlayers.length) return null;
              return (
                <div key={groupName} className="mb-8">
                  <div className="font-bold text-lg mb-2">{groupName}</div>
                  <table className="min-w-max w-full border text-center text-sm">
                    <thead>
                      <tr>
                        <th className="border px-2 py-1">순위</th>
                        <th className="border px-2 py-1">조</th>
                        <th className="border px-2 py-1">이름</th>
                        <th className="border px-2 py-1">소속</th>
                        <th className="border px-2 py-1">코스</th>
                        {[...Array(9)].map((_, i) => <th key={i} className="border px-2 py-1">{i+1}</th>)}
                        <th className="border px-2 py-1">코스 합계</th>
                        <th className="border px-2 py-1">총타수</th>
                        <th className="border px-2 py-1">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupPlayers.map((player: any) => {
                        const assignedCourses = player.assignedCourses || [];
                        const numCourses = assignedCourses.length > 0 ? assignedCourses.length : 1;
                        let totalScore = 0;
                        assignedCourses.forEach((course: any) => {
                          const courseData = player.coursesData?.[course.id];
                          if (courseData && typeof courseData.courseTotal === 'number') {
                            totalScore += courseData.courseTotal;
                          }
                        });
                        return assignedCourses.map((course: any, courseIndex: number) => {
                          const courseData = player.coursesData?.[course.id];
                          const holeScores = courseData?.holeScores || Array(9).fill('-');
                          return (
                            <tr key={course.id + '-' + player.id}>
                              {courseIndex === 0 && (
                                <>
                                  <td className="border px-2 py-1" rowSpan={numCourses}>{player.rank !== null ? player.rank : (player.hasForfeited ? '기권' : '')}</td>
                                  <td className="border px-2 py-1" rowSpan={numCourses}>{player.jo ?? ''}</td>
                                  <td className="border px-2 py-1" rowSpan={numCourses}>{player.name ?? ''}</td>
                                  <td className="border px-2 py-1" rowSpan={numCourses}>{player.affiliation ?? ''}</td>
                                </>
                              )}
                              <td className="border px-2 py-1">{courseData?.courseName || course.name}</td>
                              {holeScores.map((score: any, i: number) => <td key={i} className="border px-2 py-1">{score ?? '-'}</td>)}
                              <td className="border px-2 py-1">{typeof courseData?.courseTotal === 'number' ? courseData.courseTotal : ''}</td>
                              {courseIndex === 0 && (
                                <td className="border px-2 py-1" rowSpan={numCourses}>{player.hasForfeited ? '기권' : (player.hasAnyScore ? totalScore : '-')}</td>
                              )}
                              {courseIndex === 0 && (
                                <td className="border px-2 py-1" rowSpan={numCourses}>{player.hasForfeited ? '기권' : (player.hasAnyScore ? '' : '미출전')}</td>
                              )}
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ArchiveList;
