"use client";
import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { ref, onValue, remove } from "firebase/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface ProcessedPlayer {
  id: string;
  jo: number;
  name: string;
  affiliation: string;
  group: string;
  totalScore: number;
  rank: number | null;
  hasAnyScore: boolean;
  hasForfeited: boolean;
  coursesData: {
    [courseId: string]: {
      courseName: string;
      courseTotal: number;
      holeScores: (number | null)[];
    }
  };
  total: number;
  courseScores: { [courseId: string]: number };
  detailedScores: { [courseId: string]: { [holeNumber: string]: number } };
  assignedCourses: any[];
  totalPar: number;
  plusMinus: number | null;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  return dateStr.replace(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, "$1-$2-$3 $4:$5:$6");
}

const tieBreak = (a: any, b: any, sortedCourses: any[]) => {
  for (const course of sortedCourses) {
    const aScore = a.courseScores[course.id] || 0;
    const bScore = b.courseScores[course.id] || 0;
    if (aScore !== bScore) return bScore - aScore;
  }
  return 0;
};

function getTotalParForPlayer(courses: any, assignedCourses: any[]) {
  let total = 0;
  assignedCourses.forEach((course: any) => {
    const courseData = courses?.[course.id];
    if (courseData && Array.isArray(courseData.pars)) {
      total += courseData.pars.reduce((a: any, b: any) => a + (b || 0), 0);
    }
  });
  return total;
}

function getPlayerTotalAndPlusMinus(courses: any, player: any) {
  let total = 0;
  let totalPar = 0;
  player.assignedCourses.forEach((course: any) => {
    const courseData = courses?.[course.id];
    if (courseData && Array.isArray(courseData.pars)) {
      const courseTotal = player.courseScores[course.id] || 0;
      total += courseTotal;
      totalPar += courseData.pars.reduce((a: any, b: any) => a + (b || 0), 0);
    }
  });
  return { total, plusMinus: totalPar > 0 ? total - totalPar : null };
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
      arr.sort((a, b) => b.archiveId.localeCompare(a.archiveId));
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

const ArchiveDetail: React.FC<{ archive: ArchiveData }> = ({ archive }) => {
  const [filterGroup, setFilterGroup] = useState('all');
  const [finalDataByGroup, setFinalDataByGroup] = useState<{ [key: string]: ProcessedPlayer[] }>({});

  // 데이터 처리 (대시보드와 동일한 로직)
  useEffect(() => {
    const players = archive.players || {};
    const scores = archive.scores || {};
    const courses = archive.courses || {};
    const groups = archive.groups || {};

    const processedPlayers: ProcessedPlayer[] = Object.entries(players).map(([id, player]: [string, any]) => {
      const playerScores = scores[id] || {};
      const coursesData: any = {};
      const courseScores: { [courseId: string]: number } = {};
      const detailedScores: { [courseId: string]: { [holeNumber: string]: number } } = {};
      let hasAnyScore = false;
      let hasForfeited = false;

      // 코스별 점수 처리
      Object.keys(courses).forEach(courseId => {
        const courseScoresData = playerScores[courseId] || {};
        const holeScores: (number | null)[] = [];
        let courseTotal = 0;
        let courseHasScore = false;

        for (let h = 1; h <= 9; h++) {
          const score = courseScoresData[h];
          if (score !== undefined && score !== null && score !== '') {
            holeScores.push(Number(score));
            courseTotal += Number(score);
            courseHasScore = true;
            hasAnyScore = true;
          } else {
            holeScores.push(null);
          }
        }

        if (courseHasScore) {
          coursesData[courseId] = {
            courseName: courses[courseId]?.name || courseId,
            courseTotal,
            holeScores
          };
          courseScores[courseId] = courseTotal;
          detailedScores[courseId] = courseScoresData;
        }

        // 기권 체크
        if (holeScores.some(s => s === 0)) {
          hasForfeited = true;
        }
      });

      const assignedCourses = Object.keys(courses).filter(courseId => 
        groups[player.group]?.courses?.[courseId]
      ).map(courseId => ({ id: courseId, ...courses[courseId] }));

      const { total, plusMinus } = getPlayerTotalAndPlusMinus(courses, {
        assignedCourses,
        courseScores
      });

      return {
        id,
        jo: player.jo || 0,
        name: player.name || '',
        affiliation: player.affiliation || '',
        group: player.group || '',
        totalScore: total,
        rank: null, // 나중에 계산
        hasAnyScore,
        hasForfeited,
        coursesData,
        total,
        courseScores,
        detailedScores,
        assignedCourses,
        totalPar: getTotalParForPlayer(courses, assignedCourses),
        plusMinus
      };
    });

    // 그룹별로 분류하고 순위 계산
    const groupData: { [key: string]: ProcessedPlayer[] } = {};
    Object.keys(groups).forEach(groupName => {
      const groupPlayers = processedPlayers.filter(p => p.group === groupName);
      
      // 완료된 선수들만 순위 계산
      const completedPlayers = groupPlayers.filter(p => p.hasAnyScore && !p.hasForfeited);
      completedPlayers.sort((a, b) => {
        if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
        return tieBreak(a, b, Object.values(courses).sort((c1: any, c2: any) => c1.name.localeCompare(c2.name)));
      });

      // 순위 할당
      completedPlayers.forEach((player, index) => {
        player.rank = index + 1;
      });

      groupData[groupName] = groupPlayers;
    });

    setFinalDataByGroup(groupData);
  }, [archive]);

  const handleExportToExcel = async () => {
    const XLSX = await import('xlsx-js-style');
    const wb = XLSX.utils.book_new();
    
    const dataToExport = filterGroup === 'all' ? finalDataByGroup : { [filterGroup]: finalDataByGroup[filterGroup] };
    
    for (const groupName in dataToExport) {
      // 1위부터 순위대로 정렬 (rank 오름차순, null/기권/미출전은 맨 뒤)
      const groupPlayers = [...(dataToExport[groupName] || [])].sort((a, b) => {
        if (a.rank === null && b.rank === null) return 0;
        if (a.rank === null) return 1;
        if (b.rank === null) return -1;
        return a.rank - b.rank;
      });
      if (!groupPlayers || groupPlayers.length === 0) continue;

      const ws_data: { [key: string]: any } = {};
      const merges: any[] = [];
      let rowIndex = 0;

      // 헤더 스타일
      const headerStyle = {
        fill: { fgColor: { rgb: "4472C4" } },
        font: { color: { rgb: "FFFFFF" }, bold: true },
        alignment: { vertical: 'center', horizontal: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      };

      const cellStyle = {
        alignment: { vertical: 'center', horizontal: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      };

      // 헤더 설정
      const headers = ['순위', '조', '이름', '소속', '코스', '1', '2', '3', '4', '5', '6', '7', '8', '9', '코스 합계', '총타수', '±타수', '비고'];
      headers.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        ws_data[cellRef] = { v: header, t: 's', s: headerStyle };
      });
      rowIndex++;

      // 데이터 행
      groupPlayers.forEach((player) => {
        const assignedCourses = player.assignedCourses || [];
        const numCourses = assignedCourses.length > 0 ? assignedCourses.length : 1;

        assignedCourses.forEach((course, courseIndex) => {
          const courseData = player.coursesData[course.id];
          const holeScores = courseData?.holeScores || Array(9).fill(null);
          
          const row: any[] = [];
          
          if (courseIndex === 0) {
            row.push(player.rank !== null ? player.rank : (player.hasForfeited ? '기권' : ''));
            row.push(player.jo);
            row.push(player.name);
            row.push(player.affiliation);
          } else {
            row.push('', '', '', '');
          }
          
          row.push(courseData?.courseName || course.name);
          
          // 홀 점수들
          holeScores.forEach(score => row.push(score !== null ? score : '-'));
          
          // 코스 합계
          row.push(typeof courseData?.courseTotal === 'number' ? courseData.courseTotal : '');
          
          if (courseIndex === 0) {
            row.push(player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-'));
            row.push(player.hasForfeited ? '기권' : (player.plusMinus !== null ? (player.plusMinus === 0 ? 'E' : (player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus)) : ''));
            row.push(player.hasForfeited ? '기권' : (player.hasAnyScore ? '' : '미출전'));
          } else {
            row.push('', '', '');
          }

          // 셀 스타일 적용
          row.forEach((cell, colIndex) => {
            const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
            ws_data[cellRef] = {
              v: cell,
              t: typeof cell === 'number' ? 'n' : 's',
              s: cellStyle
            };
          });
          rowIndex++;
        });

        // 셀 병합 (여러 코스인 경우)
        if (numCourses > 1) {
          for (let col = 0; col <= 3; col++) {
            merges.push({ s: { r: rowIndex - numCourses, c: col }, e: { r: rowIndex - 1, c: col } });
          }
          for (let col = 14; col <= 16; col++) {
            merges.push({ s: { r: rowIndex - numCourses, c: col }, e: { r: rowIndex - 1, c: col } });
          }
        }
      });

      // 열 너비 자동 조정
      const colWidths = [6, 4, 15, 12, 12, 3, 3, 3, 3, 3, 3, 3, 3, 3, 10, 8, 8, 10];
      const ws: any = ws_data;
      ws['!merges'] = merges;
      ws['!cols'] = colWidths.map(width => ({ width }));
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIndex - 1, c: headers.length - 1 } });
      
      XLSX.utils.book_append_sheet(wb, ws, groupName);
    }
    
    XLSX.writeFile(wb, `archive_${archive.tournamentName || '대회'}.xlsx`);
  };

  const groupKeys = Object.keys(finalDataByGroup);

  return (
    <div className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {archive.tournamentName || "-"} <span className="text-sm text-gray-400 ml-2">({formatDate(archive.archiveId.split("_")[0])})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
            <div className="flex gap-2 items-center">
              <span>그룹 선택:</span>
              <Select value={filterGroup} onValueChange={setFilterGroup}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {groupKeys.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleExportToExcel}>
              엑셀로 저장
            </Button>
          </div>

          <div className="overflow-x-auto">
            {(filterGroup === 'all' ? groupKeys : [filterGroup]).map(groupName => {
              let groupPlayers = finalDataByGroup[groupName] || [];
              // 1위부터 순위대로 정렬 (rank 오름차순, null/기권/미출전은 맨 뒤)
              groupPlayers = [...groupPlayers].sort((a, b) => {
                if (a.rank === null && b.rank === null) return 0;
                if (a.rank === null) return 1;
                if (b.rank === null) return -1;
                return a.rank - b.rank;
              });
              if (!groupPlayers.length) return null;

              return (
                <div key={groupName} className="mb-8">
                  <div className="font-bold text-lg mb-2">{groupName}</div>
                  <table className="min-w-max w-full border text-center text-sm">
                    <thead>
                      <tr>
                        <th className="border px-2 py-1 bg-blue-600 text-white">순위</th>
                        <th className="border px-2 py-1 bg-blue-600 text-white">조</th>
                        <th className="border px-2 py-1 bg-blue-600 text-white">이름</th>
                        <th className="border px-2 py-1 bg-blue-600 text-white">소속</th>
                        <th className="border px-2 py-1 bg-blue-600 text-white">코스</th>
                        {[...Array(9)].map((_, i) => <th key={i} className="border px-2 py-1 bg-blue-600 text-white">{i+1}</th>)}
                        <th className="border px-2 py-1 bg-blue-600 text-white">코스 합계</th>
                        <th className="border px-2 py-1 bg-blue-600 text-white">총타수</th>
                        <th className="border px-2 py-1 bg-blue-600 text-white">±타수</th>
                        <th className="border px-2 py-1 bg-blue-600 text-white">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupPlayers.map((player) => {
                        const assignedCourses = player.assignedCourses || [];
                        const numCourses = assignedCourses.length > 0 ? assignedCourses.length : 1;

                        return assignedCourses.map((course, courseIndex) => {
                          const courseData = player.coursesData[course.id];
                          const holeScores = courseData?.holeScores || Array(9).fill(null);

                          return (
                            <tr key={course.id + '-' + player.id}>
                              {courseIndex === 0 && (
                                <>
                                  <td className="border px-2 py-1" rowSpan={numCourses}>
                                    {player.rank !== null ? player.rank : (player.hasForfeited ? '기권' : '')}
                                  </td>
                                  <td className="border px-2 py-1" rowSpan={numCourses}>{player.jo}</td>
                                  <td className="border px-2 py-1" rowSpan={numCourses}>{player.name}</td>
                                  <td className="border px-2 py-1" rowSpan={numCourses}>{player.affiliation}</td>
                                </>
                              )}
                              <td className="border px-2 py-1">{courseData?.courseName || course.name}</td>
                              {holeScores.map((score, i) => (
                                <td key={i} className="border px-2 py-1">
                                  {score !== null ? score : '-'}
                                </td>
                              ))}
                              <td className="border px-2 py-1">
                                {typeof courseData?.courseTotal === 'number' ? courseData.courseTotal : ''}
                              </td>
                              {courseIndex === 0 && (
                                <td className="border px-2 py-1" rowSpan={numCourses}>
                                  {player.hasForfeited ? '기권' : (player.hasAnyScore ? player.totalScore : '-')}
                                </td>
                              )}
                              {courseIndex === 0 && (
                                <td className="border px-2 py-1" rowSpan={numCourses}>
                                  {player.hasForfeited ? '기권' : (player.plusMinus !== null ? (player.plusMinus === 0 ? 'E' : (player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus)) : '')}
                                </td>
                              )}
                              {courseIndex === 0 && (
                                <td className="border px-2 py-1" rowSpan={numCourses}>
                                  {player.hasForfeited ? '기권' : (player.hasAnyScore ? '' : '미출전')}
                                </td>
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
