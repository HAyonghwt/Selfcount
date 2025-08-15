"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set, get, onValue } from "firebase/database";
import { useToast } from "@/hooks/use-toast";
import { logScoreChange, getPlayerScoreLogs, ScoreLog } from "@/lib/scoreLogs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import "./styles.css";

type CourseTab = { id: string; name: string; pars: number[] };
type PlayerDb = {
  id: string;
  type: "individual" | "team";
  name?: string;
  p1_name?: string;
  p2_name?: string;
  group: string;
  jo: number;
};

export default function SelfScoringPage() {
  const { toast } = useToast();

  // 세션 값
  const [captainData, setCaptainData] = useState<any>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedJo, setSelectedJo] = useState<string>("");

  // 코스/플레이어 이름
  const [courseTabs, setCourseTabs] = useState<CourseTab[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string>("");
  const [playerNames, setPlayerNames] = useState<string[]>(["이름1", "이름2", "이름3", "이름4"]);
  // 경기 방식
  const [gameMode, setGameMode] = useState<string>("");
  // 관전용 모드 (읽기 전용)
  const [isReadOnlyMode, setIsReadOnlyMode] = useState<boolean>(false);

  // DB 데이터
  const [playersInGroupJo, setPlayersInGroupJo] = useState<PlayerDb[]>([]);
  const nameToPlayerId = useMemo(() => {
    const list = playersInGroupJo.map((p) => ({
      playerId: p.id,
      displayName: p.type === "team" ? `${p.p1_name}/${p.p2_name}` : (p.name || ""),
      p1: p.p1_name,
      p2: p.p2_name,
      type: p.type,
    } as any));
    const map: Record<string, string> = {};
    for (const n of playerNames) {
      if (!n) continue;
      let found = list.find((x) => x.displayName === n);
      if (!found) {
        // 팀 모드에서 개인 이름이 넘어온 경우 팀 ID에 매핑
        found = list.find((x) => x.type === 'team' && (x.p1 === n || x.p2 === n));
      }
      if (found) map[n] = found.playerId;
    }
    return map;
  }, [playersInGroupJo, playerNames]);

  // 렌더링할 열 구성: 개인전은 4열, 2인1팀은 [0,1] / [2,3] 두 열
  const renderColumns: number[][] = useMemo(() => {
    return gameMode === 'team' ? [[0,1],[2,3]] : [[0],[1],[2],[3]];
  }, [gameMode]);
  const renderNames: string[] = useMemo(() => {
    return renderColumns.map(idxs => idxs.map(i => (playerNames[i] || '')).filter(Boolean).join('/'));
  }, [renderColumns, playerNames]);
  // 서명 표시 인덱스: 개인전은 4명, 팀전은 각 팀의 대표(각 묶음의 첫 인덱스)
  const signatureIndexes: number[] = useMemo(() => {
    return gameMode === 'team' ? renderColumns.map(arr => arr[0]) : [0,1,2,3];
  }, [gameMode, renderColumns]);

  // 점수 상태: courseId -> [4명][9홀]
  const [scoresByCourse, setScoresByCourse] = useState<Record<string, (number | null)[][]>>({});

  // 시작홀/현재홀 (자동 진행 없음, 9홀 제한 및 초기 활성에 사용)
  const [groupStartHole, setGroupStartHole] = useState<number | null>(null);
  const [groupCurrentHole, setGroupCurrentHole] = useState<number | null>(null);

  // 키패드 상태
  const [padOpen, setPadOpen] = useState(false);
  const [padPlayerIdx, setPadPlayerIdx] = useState<number | null>(null);
  const [padHoleIdx, setPadHoleIdx] = useState<number | null>(null);
  const [padTemp, setPadTemp] = useState<number | null>(null);
  const [padPosition, setPadPosition] = useState<"top" | "bottom">("bottom");
  // 툴팁 상태: 저장된 셀 탭 시 최근 수정 로그 표시
  const [openTooltip, setOpenTooltip] = useState<{ playerIdx: number; holeIdx: number; content: string } | null>(null);
  // 현재 편집 중인 셀 표시(강조 테두리)
  const [editingCell, setEditingCell] = useState<{ playerIdx: number; holeIdx: number } | null>(null);
  // 수정된 셀 기록(빨간색 표시용): courseId별 [4][9] boolean
  const [modifiedMap, setModifiedMap] = useState<Record<string, boolean[][]>>({});
  // 선수별 로그 캐시
  const [playerScoreLogs, setPlayerScoreLogs] = useState<Record<string, ScoreLog[]>>({});
  const [logsLoading, setLogsLoading] = useState(false);
  // 뒤로가기 확인
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const exitGuardRef = useRef(false);

  // 서명 상태/모달
  const [signatures, setSignatures] = useState<string[]>(['', '', '', '']);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signaturePlayerIdx, setSignaturePlayerIdx] = useState<number | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{x: number; y: number}>({ x: 0, y: 0 });
  // 서명 완료 후 연습 모드 잠금 (관리자 초기화 전까지 DB 반영 차단)
  const [postSignLock, setPostSignLock] = useState<boolean>(false);
  // 현재 코스의 DB 점수 존재 여부(관리자 초기화 감지)
  const [dbHasAnyScore, setDbHasAnyScore] = useState<boolean>(false);
  // 코스별 로컬 초기화 마스크(서명 후 이 페이지에서만 초기화한 코스는 UI에서만 빈 값으로 표시)
  const [localCleared, setLocalCleared] = useState<Record<string, boolean>>({});
  // 관리자 초기화 감지(이전 -> 현재) 비교용
  const prevDbHasAnyScoreRef = useRef<boolean | null>(null);
  // 저장 직후 하이라이트 표시용 맵 (코스별 [4][9])
  const [savedFlashMap, setSavedFlashMap] = useState<Record<string, boolean[][]>>({});

  // 그룹 선수 로그 미리 불러오기 (대시보드/전광판과 동일한 기준 적용을 위해)
  useEffect(() => {
    const loadLogs = async () => {
      const ids = playerNames.map((n) => nameToPlayerId[n]).filter(Boolean);
      if (ids.length === 0) return;
      setLogsLoading(true);
      try {
        const entries = await Promise.all(ids.map(async (pid: string) => {
          try { return [pid, await getPlayerScoreLogs(pid)] as const; } catch { return [pid, [] as ScoreLog[]] as const; }
        }));
        const map: Record<string, ScoreLog[]> = {};
        entries.forEach(([pid, logs]) => { map[pid] = logs; });
        setPlayerScoreLogs(map);
      } finally {
        setLogsLoading(false);
      }
    };
    loadLogs();
  }, [playerNames, nameToPlayerId]);

  // 브라우저 뒤로가기(popstate) 확인 (referee 페이지 방식 참조)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = (e: PopStateEvent) => {
      if (exitGuardRef.current) return;
      setShowLeaveConfirm(true);
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', onPopState);
    window.history.pushState(null, '', window.location.href);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // 로컬 초안(새로고침/재접속 복원용)
  const [draftScores, setDraftScores] = useState<(number | null)[][]>(
    Array.from({ length: 4 }, () => Array(9).fill(null))
  );
  // 초안 유무 계산이 필요하면 아래를 복구하세요
  // const hasDrafts = useMemo(() => draftScores.some(row => row.some(v => typeof v === 'number')), [draftScores]);

  // 초기 세션 로드
  useEffect(() => {
    // URL 쿼리 파라미터 확인 (관전용 모드)
    const urlParams = new URLSearchParams(window.location.search);
    const isReadOnlyMode = urlParams.get('mode') === 'readonly';
    const queryGroup = urlParams.get('group');
    const queryJo = urlParams.get('jo');

    const loggedInCaptain = sessionStorage.getItem("selfScoringCaptain");
    const savedGroup = sessionStorage.getItem("selfScoringGroup") || sessionStorage.getItem("selectedGroup");
    const savedJo = sessionStorage.getItem("selfScoringJo") || sessionStorage.getItem("selectedJo");
    const savedMode = sessionStorage.getItem("selfScoringGameMode");

    // 관전용 모드가 아니고 로그인되지 않은 경우에만 리다이렉트
    if (!isReadOnlyMode && !loggedInCaptain) {
      window.location.href = "/self-scoring";
      return;
    }

    // 관전용 모드에서는 쿼리 파라미터 사용, 일반 모드에서는 세션 스토리지 사용
    const groupToUse = isReadOnlyMode ? (queryGroup || "") : (savedGroup || "");
    const joToUse = isReadOnlyMode ? (queryJo || "") : (savedJo || "");
    
    if (loggedInCaptain && loggedInCaptain !== "관전자") {
      try {
        const captain = JSON.parse(loggedInCaptain);
        setCaptainData(captain);
      } catch (error) {
        console.error('조장 데이터 파싱 오류:', error);
        setCaptainData({ id: "알 수 없음" });
      }
    } else {
      setCaptainData({ id: "관전자" });
    }
    setSelectedGroup(groupToUse);
    setSelectedJo(joToUse);
    setGameMode(savedMode || "");
    setIsReadOnlyMode(isReadOnlyMode);

    // 코스/플레이어 이름 로드
    try {
      if (isReadOnlyMode) {
        // 관전 모드에서는 sessionStorage에서 로드하지 않고 DB에서 실시간 로드
        // (다음 useEffect에서 처리)
      } else {
        // 일반 모드에서는 sessionStorage에서 로드
        const namesData = sessionStorage.getItem("selfScoringNames");
        if (namesData) setPlayerNames(JSON.parse(namesData));

        const coursesData = sessionStorage.getItem("selfScoringCourses");
        if (coursesData) {
          const tabs = (JSON.parse(coursesData) as any[]).map((c) => ({
            id: String(c.id),
            name: String(c.name),
            pars: Array.isArray(c.pars) ? (c.pars as number[]) : [3, 4, 4, 4, 4, 3, 5, 3, 3],
          })) as CourseTab[];
          setCourseTabs(tabs);
          setActiveCourseId(String(sessionStorage.getItem("selfScoringActiveCourseId") || (tabs[0]?.id || "")));
        }
      }
    } catch {}
  }, []);

  // 플레이어/점수 DB 로딩 (읽기)
  useEffect(() => {
    if (!db || !selectedGroup || !selectedJo) return;
    const dbInstance = db as any;

    const unsubPlayers = onValue(ref(dbInstance, "players"), (snap) => {
      const data = snap.val() || {};
      const list: PlayerDb[] = Object.entries<any>(data)
        .map(([id, v]) => ({ id, ...v }))
        .filter((p) => p.group === selectedGroup && String(p.jo) === String(selectedJo));
      setPlayersInGroupJo(list as any);
      
      // 관전 모드에서는 플레이어 이름을 실시간으로 설정
      if (isReadOnlyMode && list.length > 0) {
        const names = list.map(p => {
          if (p.type === 'team') {
            return `${p.p1_name}/${p.p2_name}`;
          } else {
            return p.name || '';
          }
        });
        setPlayerNames(names);
      }
    });

    const unsubScores = onValue(ref(dbInstance, "scores"), (snap) => {
      const data = snap.val() || {};
      const courseIds = courseTabs.map((c) => c.id);
      let hasAnyForActive = false;
      setScoresByCourse((prev) => {
        const next: Record<string, (number | null)[][]> = { ...prev };
        for (const cid of courseIds) {
          const seed: (number | null)[][] = Array.from({ length: 4 }, () => Array(9).fill(null));
          playerNames.forEach((pn, pi) => {
            const pid = nameToPlayerId[pn];
            if (!pid) return;
            const perHole = data?.[pid]?.[cid] || {};
            for (let h = 1; h <= 9; h++) {
              const v = perHole[h];
              seed[pi][h - 1] = typeof v === "number" ? v : null;
              if (String(cid) === String(activeCourseId) && typeof v === 'number') {
                hasAnyForActive = true;
              }
            }
          });
          // 로컬 초기화 마스크가 켜진 코스는 기존 화면 값을 유지(연습 모드), 아니면 DB 반영
          next[cid] = localCleared[cid] ? (prev[cid] ?? seed) : seed;
        }
        return next;
      });
      setDbHasAnyScore(hasAnyForActive);
    });

    return () => {
      unsubPlayers();
      unsubScores();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, selectedGroup, selectedJo, courseTabs, playerNames, nameToPlayerId, localCleared]);

  // 대회 설정(tournaments/current)과 그룹-코스 연동을 읽어 탭/파/이름 동기화
  useEffect(() => {
    if (!db || !selectedGroup) return;
    const dbInstance = db as any;
    const unsubTournament = onValue(ref(dbInstance, 'tournaments/current'), (snap) => {
      const data = snap.val() || {};
      const coursesObj = data.courses || {};
      const groupsObj = data.groups || {};

      // 그룹에 배정된 코스 id 목록(true로 표시된 것만)
      const group = groupsObj[selectedGroup] || {};
      const assignedIds: string[] = group.courses
        ? Object.keys(group.courses).filter((cid: string) => group.courses[cid])
        : Object.keys(coursesObj);

      // 코스 탭 구성: id, name, pars
      const nextTabs: CourseTab[] = assignedIds
        .map((cid) => {
          const key = Object.keys(coursesObj).find((k) => String(k) === String(cid));
          const course = key ? coursesObj[key] : null;
          if (!course) return null;
          return {
            id: String(course.id ?? cid),
            name: String(course.name ?? cid),
            pars: Array.isArray(course.pars) ? course.pars : [3,4,4,4,4,3,5,3,3],
          } as CourseTab;
        })
        .filter(Boolean) as CourseTab[];

      if (nextTabs.length > 0) {
        setCourseTabs(nextTabs);
        // 현재 활성 코스가 목록에 없으면 첫 코스로 교체
        const exists = nextTabs.some((t) => String(t.id) === String(activeCourseId));
        if (!exists) {
          setActiveCourseId(String(nextTabs[0].id));
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('selfScoringActiveCourseId', String(nextTabs[0].id));
          }
        }
      }
      
      // 관전 모드에서는 게임 모드도 실시간으로 설정
      if (isReadOnlyMode && data.gameMode) {
        setGameMode(data.gameMode);
      }
    });

    return () => unsubTournament();
  }, [db, selectedGroup, activeCourseId]);

  // 현재 코스/파 데이터
  const activeCourse = useMemo(() => courseTabs.find((c) => String(c.id) === String(activeCourseId)) || null, [courseTabs, activeCourseId]);
  const activePars = activeCourse?.pars || [3, 4, 4, 4, 4, 3, 5, 3, 3];
  const rawTableScores = scoresByCourse[activeCourseId] || Array.from({ length: 4 }, () => Array(9).fill(null));
  // 표시용 점수 매트릭스: 팀 모드일 때는 같은 팀 구성원 중 첫 인덱스의 값을 사용(입력과 저장은 첫 인덱스에만 기록)
  const tableScores = useMemo(() => {
    if (gameMode !== 'team') return rawTableScores;
    const view: (number|null)[][] = Array.from({ length: renderColumns.length }, () => Array(9).fill(null));
    renderColumns.forEach((idxs, col) => {
      const primary = idxs[0];
      for (let h = 0; h < 9; h++) view[col][h] = rawTableScores[primary]?.[h] ?? null;
    });
    return view;
  }, [gameMode, rawTableScores, renderColumns]);

  // 로컬 초안/시작/현재홀 복원 (코스/그룹/조 변경 시)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = `selfScoringDraft_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        const ds: (number | null)[][] = Array.isArray(parsed?.draft)
          ? parsed.draft
          : Array.from({ length: 4 }, () => Array(9).fill(null));
        setDraftScores(ds);
        if (parsed?.start != null) setGroupStartHole(parsed.start);
        if (parsed?.current != null) setGroupCurrentHole(parsed.current);
             } else {
        setDraftScores(Array.from({ length: 4 }, () => Array(9).fill(null)));
        setGroupStartHole(null);
        setGroupCurrentHole(null);
      }
    } catch {
      setDraftScores(Array.from({ length: 4 }, () => Array(9).fill(null)));
      setGroupStartHole(null);
      setGroupCurrentHole(null);
    }
  }, [activeCourseId, selectedGroup, selectedJo]);

  // 대시보드 초기화 감지 및 홀 활성화 상태 초기화
  useEffect(() => {
    if (!scoresByCourse || !activeCourseId) return;
    
    const currentScores = scoresByCourse[activeCourseId];
    if (!currentScores) return;
    
    // 현재 코스의 모든 점수가 null이면 초기화된 것으로 판단
    const allScoresNull = currentScores.every(row => 
      row.every(score => score === null || score === undefined)
    );
    
    if (allScoresNull) {
      // 홀 활성화 상태 초기화
      setGroupStartHole(null);
      setGroupCurrentHole(null);
      
      // localStorage의 start, current도 초기화
      try {
        const key = `selfScoringDraft_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.start = null;
          parsed.current = null;
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } catch (error) {
        console.error('localStorage 홀 활성화 상태 초기화 실패:', error);
      }
      
      // 사인 데이터도 초기화
      try {
        // 개인 사인 삭제
        const signKey = `selfScoringSign_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
        localStorage.removeItem(signKey);
        
        // 팀 사인 삭제
        const teamSignKey = `selfScoringSignTeam_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
        localStorage.removeItem(teamSignKey);
        
        // 사인 후 잠금 상태 삭제
        const postSignLockKey = `selfScoringPostSignLock_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
        localStorage.removeItem(postSignLockKey);
        
        // 사인 상태 초기화
        setSignatures(['', '', '', '']);
        setPostSignLock(false);
      } catch (error) {
        console.error('사인 데이터 초기화 실패:', error);
      }
    }
  }, [scoresByCourse, activeCourseId, selectedGroup, selectedJo]);

  const handleOpenPad = (playerIndex: number, holeIndex: number) => {
    if (isReadOnlyMode) return; // 관전용 모드에서는 입력 불가
    // 활성 셀만 입력 허용
    const state = getCellState(playerIndex, holeIndex);
    if (state !== 'active') {
      // 저장된 셀(locked)이라면 최근 수정 로그 툴팁 토글
      const isLocked = tableScores[playerIndex]?.[holeIndex] != null;
      if (isLocked) {
        void showCellLogTooltip(playerIndex, holeIndex);
         }
         return;
    }
    setPadPosition(holeIndex >= 7 ? 'top' : 'bottom');
    setPadPlayerIdx(playerIndex);
    setPadHoleIdx(holeIndex);
    setPadTemp(tableScores[playerIndex]?.[holeIndex] ?? null);
    setPadOpen(true);
    // 처음 입력(미저장)인 경우에는 수정 안내를 띄우지 않음
    const alreadyCommitted = typeof tableScores[playerIndex]?.[holeIndex] === 'number';
    setEditingCell({ playerIdx: playerIndex, holeIdx: holeIndex });
    if (alreadyCommitted) {
      try {
        if (typeof window !== 'undefined') {
          const msg = '수정 준비 완료: 숫자를 선택하고 저장을 누르세요';
          setOpenTooltip({ playerIdx: playerIndex, holeIdx: holeIndex, content: msg });
          setTimeout(() => setOpenTooltip(null), 2000);
        }
      } catch {}
    }
  };

  // 저장된 셀(locked) 더블클릭 시에도 수정 가능하도록 별도 핸들러
  const handleOpenPadForEdit = (playerIndex: number, holeIndex: number) => {
    if (isReadOnlyMode) return; // 관전용 모드에서는 수정 불가
    setPadPosition(holeIndex >= 7 ? 'top' : 'bottom');
    setPadPlayerIdx(playerIndex);
    setPadHoleIdx(holeIndex);
    setPadTemp(tableScores[playerIndex]?.[holeIndex] ?? null);
    // 첫 수정 진입 시 시작/현재홀이 없으면 기준홀 설정 (활성 셀 계산을 위해)
    setGroupStartHole((prev) => (prev === null ? holeIndex : prev));
    setGroupCurrentHole((prev) => (prev === null ? holeIndex : prev));
    setPadOpen(true);
    setEditingCell({ playerIdx: playerIndex, holeIdx: holeIndex });
    try {
      if (typeof window !== 'undefined') {
        const msg = '수정 준비 완료: 숫자를 선택하고 저장을 누르세요';
        setOpenTooltip({ playerIdx: playerIndex, holeIdx: holeIndex, content: msg });
        setTimeout(() => setOpenTooltip(null), 2000);
      }
    } catch {}
  };

  // 최근 수정 로그 툴팁 표시
  const showCellLogTooltip = async (playerIndex: number, holeIndex: number) => {
    try {
      const playerName = playerNames[playerIndex];
      const playerId = nameToPlayerId[playerName];
      if (!playerId) return;
      const logs = playerScoreLogs[playerId] || await getPlayerScoreLogs(playerId);
      const courseId = String(activeCourse?.id || activeCourseId);
      const cellLog = logs.find(l => String(l.courseId) === courseId && Number(l.holeNumber) === holeIndex + 1);
      // 수정된 셀(빨간 표시 대상)만 안내: 변경 로그가 있고 oldValue != newValue & oldValue != 0 인 경우에만
      if (!cellLog || cellLog.oldValue === cellLog.newValue || cellLog.oldValue === 0) {
        setOpenTooltip(null);
    return;
  }
      const who = cellLog.modifiedByType === 'captain' ? (cellLog.modifiedBy || '조장') : (cellLog.modifiedByType === 'judge' ? '심판' : '관리자');
      const when = cellLog.modifiedAt ? new Date(cellLog.modifiedAt).toLocaleString('ko-KR') : '';
      const what = `${cellLog.oldValue} → ${cellLog.newValue}`;
      const msg = `수정자: ${who}\n일시: ${when}\n변경: ${what}`;
      setOpenTooltip(prev => (prev && prev.playerIdx === playerIndex && prev.holeIdx === holeIndex ? null : { playerIdx: playerIndex, holeIdx: holeIndex, content: msg }));
      // 자동 닫힘
      setTimeout(() => {
        setOpenTooltip(prev => (prev && prev.playerIdx === playerIndex && prev.holeIdx === holeIndex ? null : prev));
      }, 3000);
    } catch {}
  };

  const handleSetPadValue = (val: number) => {
    setPadTemp(val);
    // 로컬 초안 저장 및 즉시 표시
    if (padPlayerIdx !== null && padHoleIdx !== null) {
      try {
        if (typeof window !== 'undefined') {
          const key = `selfScoringDraft_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
          const saved = localStorage.getItem(key);
          const parsed = saved ? JSON.parse(saved) : { draft: Array.from({ length: 4 }, () => Array(9).fill(null)), start: groupStartHole, current: groupCurrentHole };
          // 팀 모드에서는 팀 열의 primary index에 기록
          let targetPlayer = padPlayerIdx;
          if (gameMode === 'team' && padPlayerIdx !== null) {
            targetPlayer = renderColumns[padPlayerIdx][0];
          }
          parsed.draft[targetPlayer!][padHoleIdx] = Number(val);
          parsed.start = parsed.start ?? groupStartHole;
          parsed.current = parsed.current ?? groupCurrentHole;
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } catch {}
      setDraftScores((prev) => {
        const next = prev.map((row) => [...row]);
        let targetPlayer = padPlayerIdx!;
        if (gameMode === 'team') targetPlayer = renderColumns[padPlayerIdx!][0];
        next[targetPlayer][padHoleIdx!] = Number(val);
        return next;
      });
    }
  };
  // 저장된 셀에 잠시 하이라이트를 주는 헬퍼
  const flashSavedCell = (playerIndex: number, holeIndex: number) => {
    setSavedFlashMap(prev => {
      const next = { ...prev } as Record<string, boolean[][]>;
      const mat = next[activeCourseId] ? next[activeCourseId].map(r => [...r]) : Array.from({ length: 4 }, () => Array(9).fill(false));
      mat[playerIndex][holeIndex] = true;
      next[activeCourseId] = mat;
      return next;
    });
    setTimeout(() => {
      setSavedFlashMap(prev => {
        const next = { ...prev } as Record<string, boolean[][]>;
        const mat = next[activeCourseId] ? next[activeCourseId].map(r => [...r]) : Array.from({ length: 4 }, () => Array(9).fill(false));
        mat[playerIndex][holeIndex] = false;
        next[activeCourseId] = mat;
        return next;
      });
    }, 800);
  };
  const handleCancelPad = () => {
    setPadOpen(false);
    setPadTemp(null);
    setPadPlayerIdx(null);
    setPadHoleIdx(null);
  };

  const saveToFirebase = async (playerIndex: number, holeIndex: number, score: number) => {
    if (!db) return;
    if (!activeCourse) return;
    // 서명 완료 이후에는 관리자 초기화 전까지 외부 DB 반영 차단
    if (postSignLock && dbHasAnyScore) {
      toast({ title: '저장 차단', description: '서명 완료 후에는 관리자 초기화 전까지 점수 수정이 제한됩니다.', variant: 'destructive' });
      return;
    }
    // 팀 모드면 팀 열의 primary index 기준으로 저장/로그 처리
    let displayName = playerNames[playerIndex];
    const targetRawIndex = (gameMode === 'team') ? (renderColumns[playerIndex]?.[0] ?? playerIndex) : playerIndex;
    if (gameMode === 'team') {
      displayName = playerNames[targetRawIndex];
    }
    const playerId = nameToPlayerId[displayName] || nameToPlayerId[(displayName||'').split('/')[0]];
    if (!playerId) {
      toast({ title: "선수 식별 실패", description: `${displayName || ''} 선수를 찾을 수 없습니다.`, variant: "destructive" });
    return;
  }
    try {
      const dbInstance = db as any;
      const holeNum = holeIndex + 1;
      const scoreRef = ref(dbInstance, `/scores/${playerId}/${activeCourse.id}/${holeNum}`);
      // 팀 모드에서는 원본 매트릭스에서 대표 인덱스의 기존 값을 사용해야 올바른 oldValue가 기록됨
      const prev = (rawTableScores?.[targetRawIndex]?.[holeIndex] ?? 0) as number;
                 await set(scoreRef, score);
                 await logScoreChange({
        matchId: "tournaments/current",
        playerId,
        scoreType: "holeScore",
        holeNumber: holeNum,
        oldValue: typeof prev === "number" ? prev : 0,
                   newValue: score,
                   modifiedBy: captainData?.id || `${selectedGroup || ''} 조장`,
        modifiedByType: "captain",
        comment: `자율 채점 - 코스: ${activeCourse.id}, 그룹: ${selectedGroup || ''}, 조: ${selectedJo || ''}`,
        courseId: String(activeCourse.id),
      });
      // 외부 전광판에 갱신 신호 전달 (선택 사항)
      try {
        if (typeof window !== 'undefined') {
          const evt = new CustomEvent('scoreUpdated', { detail: { playerId, courseId: String(activeCourse.id), hole: holeNum, by: 'captain' } });
          window.dispatchEvent(evt);
        }
      } catch {}
    } catch (e: any) {
      toast({ title: "저장 실패", description: e?.message || "점수 저장에 실패했습니다.", variant: "destructive" });
    }
  };

  const handleSavePad = async () => {
    // 같은 홀에서 여러 명을 한 번에 저장: 초안에 값이 있는 모든 셀을 커밋
    const targetHole = padHoleIdx;
    const targetPlayer = padPlayerIdx;
    const targetVal = padTemp;
    if (targetHole === null) { handleCancelPad(); return; }
    // 패드에 선택된 값이 있으면 우선 해당 셀을 초안에 반영(사용자가 숫자 누르고 저장만 누른 경우 보장)
    if (targetPlayer !== null && targetVal !== null) {
      setDraftScores(prev => {
        const next = prev.map(row => [...row]);
        next[targetPlayer][targetHole] = targetVal;
        return next;
      });
      try {
        if (typeof window !== 'undefined') {
          const key = `selfScoringDraft_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
          const saved = localStorage.getItem(key);
          const parsed = saved ? JSON.parse(saved) : { draft: Array.from({ length: 4 }, () => Array(9).fill(null)) };
          parsed.draft[targetPlayer][targetHole] = Number(targetVal);
          parsed.start = (parsed.start ?? groupStartHole);
          parsed.current = (parsed.current ?? groupCurrentHole);
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } catch {}
    }
    // 첫 저장이면 시작/현재홀 지정
    setGroupStartHole((prev) => (prev === null ? targetHole : prev));
    setGroupCurrentHole((prev) => (prev === null ? targetHole : prev));

    // 초안이 들어있는 모든 선수의 해당 홀 점수를 저장
    for (let pi = 0; pi < 4; pi++) {
      const val = draftScores?.[pi]?.[targetHole] ?? (pi === targetPlayer ? targetVal : null);
      if (typeof val === 'number') {
        // 수정 여부 판단을 위해 저장 전 뷰 값 보관
        const displayCol = (gameMode === 'team') ? (renderColumns.findIndex(a => a.includes(pi))) : pi;
        const prevVal = tableScores?.[displayCol]?.[targetHole];
        await saveToFirebase(pi, targetHole, val);
        if (typeof prevVal === 'number' && prevVal !== val) {
          setModifiedMap(prev => {
            const next: Record<string, boolean[][]> = { ...prev };
            const base = next[activeCourseId] ? next[activeCourseId].map(r => [...r]) : Array.from({ length: tableScores.length || 4 }, () => Array(9).fill(false));
            if (!base[displayCol]) base[displayCol] = Array(9).fill(false);
            base[displayCol][targetHole] = true;
            next[activeCourseId] = base;
            return next;
          });
        }
        flashSavedCell(pi, targetHole);
      }
    }

    // 화면 반영 및 초안 제거
    setScoresByCourse(prev => {
      const next = { ...prev } as Record<string, (number | null)[][]>;
      const mat = next[activeCourseId] ? next[activeCourseId].map(r => [...r]) : Array.from({ length: 4 }, () => Array(9).fill(null));
      for (let pi = 0; pi < 4; pi++) {
        const val = draftScores?.[pi]?.[targetHole] ?? (pi === targetPlayer ? targetVal : null);
        if (typeof val === 'number') mat[pi][targetHole] = val;
      }
      next[activeCourseId] = mat;
      return next;
    });
    try {
      if (typeof window !== 'undefined') {
        const key = `selfScoringDraft_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
        const saved = localStorage.getItem(key);
        const parsed = saved ? JSON.parse(saved) : { draft: Array.from({ length: 4 }, () => Array(9).fill(null)) };
        for (let pi = 0; pi < 4; pi++) parsed.draft[pi][targetHole] = null;
        parsed.start = (groupStartHole ?? targetHole);
        parsed.current = (groupCurrentHole ?? targetHole);
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch {}
    setDraftScores(prev => {
      const next = prev.map(row => [...row]);
      for (let pi = 0; pi < 4; pi++) next[pi][targetHole] = null;
      return next;
    });
    handleCancelPad();
    setEditingCell(null);
  };

  // (사용 안 함) 전체 저장 함수는 제거했습니다

  const playerTotals = useMemo(() => {
    return tableScores.map((row) => {
      let sum = 0;
      let parSum = 0;
  for (let i = 0; i < 9; i++) {
        const sc = row[i];
        const par = activePars[i] ?? null;
        if (typeof sc === "number" && typeof par === "number") {
          sum += sc;
          parSum += par;
        }
      }
      const pm = parSum > 0 ? sum - parSum : null;
      return { sum: sum || null, pm };
    });
  }, [tableScores, activePars]);

  // 입력 폼 상태 계산: 저장된 셀 잠금, 현재홀 기준 각 선수의 다음 미입력 홀 1곳만 활성 + 9홀 제한
  function getCellState(playerIndex: number, holeIndex: number): 'locked' | 'active' | 'disabled' {
    const committed = tableScores[playerIndex]?.[holeIndex];
    if (typeof committed === 'number') return 'locked';
    // 시작 전에는 전체 활성화
    if (groupCurrentHole === null) return 'active';
    const cur = groupCurrentHole;
    const row = tableScores[playerIndex] || [];
    // 9홀 제한: 시작홀 기준 9개 저장 완료 시 더 이상 활성화 안 함
    if (groupStartHole !== null) {
      const committedCount = row.filter((v) => typeof v === 'number').length;
      if (committedCount >= 9) return 'disabled';
    }
    // 현재홀부터 시계방향으로 비어있는 가장 앞 홀을 찾는다
    let candidate: number | null = null;
    for (let step = 0; step < 9; step++) {
      const idx = (cur + step) % 9;
      if (row[idx] == null) {
        candidate = idx;
      break;
    }
  }
    if (candidate === null) return 'disabled';
    return holeIndex === candidate ? 'active' : 'disabled';
  }

  // 순환 관련 유틸 사용 안 함 (간소화 모드)

  // 코스 테마 클래스: 0=red, 1=blue, 2=yellow, 3=white (순환)
  const themeClass = useMemo(() => {
    const idx = Math.max(0, courseTabs.findIndex((c) => String(c.id) === String(activeCourseId)));
    const cycle = ((idx === -1 ? 0 : idx) % 4);
    return cycle === 0 ? 'theme-red' : cycle === 1 ? 'theme-blue' : cycle === 2 ? 'theme-yellow' : 'theme-white';
  }, [courseTabs, activeCourseId]);

  // 서명 로컬스토리지 키
  const signatureKey = useMemo(() => `selfScoringSign_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`, [activeCourseId, selectedGroup, selectedJo]);
  const teamSignatureKey = useMemo(() => `selfScoringSignTeam_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`, [activeCourseId, selectedGroup, selectedJo]);
  const postSignLockKey = useMemo(() => `selfScoringPostSignLock_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`, [activeCourseId, selectedGroup, selectedJo]);
  const localClearedKey = useMemo(() => `selfScoringLocalCleared_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`, [activeCourseId, selectedGroup, selectedJo]);
  // 로그 초기화 기준 시각(대시보드 초기화 감지 후, 그 이전 수정 로그는 무시)
  const logsResetKey = useMemo(() => `selfScoringLogsReset_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`, [activeCourseId, selectedGroup, selectedJo]);
  const [logsResetAfter, setLogsResetAfter] = useState<number | null>(null);

  // 서명 복원 (팀전은 팀 전용 키 우선, 없으면 공용 키 사용)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!activeCourseId || !selectedGroup || !selectedJo) return;
    try {
      let arr: any = null;
      
      // 1. 팀 모드인 경우 팀 전용 키에서 먼저 찾기
      if (gameMode === 'team') {
        const savedTeam = localStorage.getItem(teamSignatureKey);
        if (savedTeam) {
          arr = JSON.parse(savedTeam);
        }
        // localStorage에 없으면 sessionStorage에서 찾기
        if (!arr) {
          const savedTeamSession = sessionStorage.getItem(teamSignatureKey);
          if (savedTeamSession) {
            arr = JSON.parse(savedTeamSession);
          }
        }
      }
      
      // 2. 팀 키에서 찾지 못했거나 개인전인 경우 공용 키에서 찾기
      if (!arr) {
        const saved = localStorage.getItem(signatureKey);
        if (saved) {
          arr = JSON.parse(saved);
        }
        // localStorage에 없으면 sessionStorage에서 찾기
        if (!arr) {
          const savedSession = sessionStorage.getItem(signatureKey);
          if (savedSession) {
            arr = JSON.parse(savedSession);
          }
        }
      }
      
      if (Array.isArray(arr) && arr.length === 4) {
        setSignatures(arr);
      } else {
        setSignatures(['', '', '', '']);
      }
    } catch (error) {
      console.error('서명 복원 실패:', error);
      setSignatures(['', '', '', '']);
    }
  }, [signatureKey, teamSignatureKey, gameMode, activeCourseId, selectedGroup, selectedJo]);

  // 잠금 상태 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = localStorage.getItem(postSignLockKey);
      setPostSignLock(v === '1');
    } catch {}
  }, [postSignLockKey]);

  // 페이지 로드 시 서명 데이터 강제 복원 (추가 안전장치)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!activeCourseId || !selectedGroup || !selectedJo) return;
    
    const restoreSignatures = () => {
      try {
        let arr: any = null;
        
        // localStorage에서 먼저 찾기
        if (gameMode === 'team') {
          const savedTeam = localStorage.getItem(teamSignatureKey);
          if (savedTeam) {
            arr = JSON.parse(savedTeam);
          }
        }
        if (!arr) {
          const saved = localStorage.getItem(signatureKey);
          if (saved) {
            arr = JSON.parse(saved);
          }
        }
        
        // sessionStorage에서 찾기
        if (!arr) {
          if (gameMode === 'team') {
            const savedTeamSession = sessionStorage.getItem(teamSignatureKey);
            if (savedTeamSession) {
              arr = JSON.parse(savedTeamSession);
            }
          }
          if (!arr) {
            const savedSession = sessionStorage.getItem(signatureKey);
            if (savedSession) {
              arr = JSON.parse(savedSession);
            }
          }
        }
        
        if (Array.isArray(arr) && arr.length === 4) {
          setSignatures(arr);
        }
      } catch (error) {
        console.error('서명 강제 복원 실패:', error);
      }
    };
    
    // 페이지 로드 시 즉시 복원
    restoreSignatures();
    
    // 추가로 1초 후에도 한 번 더 복원 시도
    const timer = setTimeout(restoreSignatures, 1000);
    
    return () => clearTimeout(timer);
  }, [activeCourseId, selectedGroup, selectedJo, gameMode, signatureKey, teamSignatureKey]);

  // 로컬 초기화 마스크 복원(활성 코스)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = localStorage.getItem(localClearedKey) === '1';
      setLocalCleared(prev => ({ ...prev, [activeCourseId]: v }));
    } catch {}
  }, [localClearedKey, activeCourseId]);

  // 로그 초기화 기준 시각 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const ts = localStorage.getItem(logsResetKey);
      setLogsResetAfter(ts ? Number(ts) : null);
    } catch {}
  }, [logsResetKey]);

  const persistSignatures = (next: string[]) => {
    try {
      localStorage.setItem(signatureKey, JSON.stringify(next));
      if (gameMode === 'team') {
        localStorage.setItem(teamSignatureKey, JSON.stringify(next));
      }
      // 추가로 sessionStorage에도 백업 저장
      sessionStorage.setItem(signatureKey, JSON.stringify(next));
      if (gameMode === 'team') {
        sessionStorage.setItem(teamSignatureKey, JSON.stringify(next));
      }
    } catch (error) {
      console.error('서명 저장 실패:', error);
    }
  };

  // 모든 서명 완료 여부에 따라 잠금 토글
  const allSigned = useMemo(() => signatures.every((s) => !!s), [signatures]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (allSigned && dbHasAnyScore) {
        localStorage.setItem(postSignLockKey, '1');
        setPostSignLock(true);
      }
      // 관리자 초기화가 되어 DB 점수가 '있던 상태에서' 사라진 경우에만 전체 초기화 처리
      const prev = prevDbHasAnyScoreRef.current;
      if (prev === true && dbHasAnyScore === false) {
        localStorage.setItem(postSignLockKey, '0');
        setPostSignLock(false);
        // 로컬 초기화 마스크 해제
        localStorage.setItem(localClearedKey, '0');
        setLocalCleared(prevMap => ({ ...prevMap, [activeCourseId]: false }));
        // 시작/현재홀 및 초안/상태 초기화
        setGroupStartHole(null);
        setGroupCurrentHole(null);
        setDraftScores(Array.from({ length: 4 }, () => Array(9).fill(null)));
        try {
          const draftKey = `selfScoringDraft_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
          localStorage.removeItem(draftKey);
          const now = Date.now();
          localStorage.setItem(logsResetKey, String(now));
          setLogsResetAfter(now);
          // 모든 코스 서명 초기화
          const ids = courseTabs.map(c => String(c.id));
          for (const cid of ids) {
            const sKey = `selfScoringSign_${cid}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
            localStorage.removeItem(sKey);
            const tKey = `selfScoringSignTeam_${cid}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
            localStorage.removeItem(tKey);
          }
          setSignatures(['', '', '', '']);
        } catch {}
      }
      prevDbHasAnyScoreRef.current = dbHasAnyScore;
    } catch {}
  }, [allSigned, dbHasAnyScore, postSignLockKey, localClearedKey, logsResetKey, activeCourseId, courseTabs, selectedGroup, selectedJo]);

  const openSignatureModal = (playerIdx: number) => {
    if (isReadOnlyMode) return; // 관전용 모드에서는 서명 불가
    setSignaturePlayerIdx(playerIdx);
    setSignatureOpen(true);
    setTimeout(() => {
      const canvas = signatureCanvasRef.current;
      if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
    }, 0);
  };

  const closeSignatureModal = () => {
    setSignatureOpen(false);
    setSignaturePlayerIdx(null);
    isDrawingRef.current = false;
  };

  const getCanvasPoint = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const handleCanvasPointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let point;
    if ('touches' in e) {
      const t = e.touches[0];
      point = getCanvasPoint(canvas, t.clientX, t.clientY);
  e.preventDefault();
    } else {
      point = getCanvasPoint(canvas, (e as React.MouseEvent).clientX, (e as React.MouseEvent).clientY);
    }
    isDrawingRef.current = true;
    lastPointRef.current = point;
  };

  const handleCanvasPointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let point;
    if ('touches' in e) {
      const t = e.touches[0];
      point = getCanvasPoint(canvas, t.clientX, t.clientY);
  e.preventDefault();
    } else {
      point = getCanvasPoint(canvas, (e as React.MouseEvent).clientX, (e as React.MouseEvent).clientY);
    }
    const { x: lastX, y: lastY } = lastPointRef.current;
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
    ctx.lineTo(point.x, point.y);
  ctx.stroke();
    lastPointRef.current = point;
  };

  const handleCanvasPointerUp = () => {
    isDrawingRef.current = false;
  };

  const handleSignatureClear = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleSignatureSave = () => {
    if (signaturePlayerIdx === null) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    // 원본 캔버스 크기
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    
    // 크롭할 영역 계산 (양 옆 30%씩 자르고 가운데 40%만)
    const cropWidth = originalWidth * 0.4; // 가운데 40%
    const cropX = originalWidth * 0.3; // 왼쪽 30% 지점부터 시작
    
    // 새로운 캔버스 생성하여 크롭된 이미지 생성
    const croppedCanvas = document.createElement('canvas');
    const croppedCtx = croppedCanvas.getContext('2d');
    
    if (croppedCtx) {
      croppedCanvas.width = cropWidth;
      croppedCanvas.height = originalHeight;
      
      // 원본 캔버스에서 크롭된 영역만 그리기
      croppedCtx.drawImage(
        canvas,
        cropX, 0, cropWidth, originalHeight, // 원본에서 가져올 영역
        0, 0, cropWidth, originalHeight // 새 캔버스에 그릴 영역
      );
      
      // 크롭된 이미지를 데이터 URL로 변환
      const croppedDataUrl = croppedCanvas.toDataURL('image/png');
      
      setSignatures((prev) => {
        const next = [...prev];
        next[signaturePlayerIdx] = croppedDataUrl;
        // 즉시 저장
        persistSignatures(next);
        return next;
      });
    } else {
      // 크롭 실패 시 원본 이미지 사용
      const dataUrl = canvas.toDataURL('image/png');
      setSignatures((prev) => {
        const next = [...prev];
        next[signaturePlayerIdx] = dataUrl;
        // 즉시 저장
        persistSignatures(next);
        return next;
      });
    }
    
    // 저장 완료 토스트 메시지
    toast({ title: '서명 저장됨', description: '서명이 저장되었습니다.' });
    
    closeSignatureModal();
  };

  return (
    <div className="scoring-page">
      <div className={`container ${themeClass}`} id="mainContainer">
        <div className="tabs">
          {courseTabs.map((c) => (
            <button
              key={c.id}
              className={`tab ${String(activeCourseId) === String(c.id) ? 'active' : ''}`}
              onClick={() => setActiveCourseId(String(c.id))}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* 표 상단 메타 정보 */}
        <div className="score-meta">
          <span>경기방식: <b>{gameMode === 'team' ? '2인1팀' : gameMode === 'individual' ? '개인전' : '-'}</b></span>
          <span>그룹: <b>{selectedGroup || '-'}</b></span>
          <span>조: <b>{selectedJo || '-'}</b></span>
          {isReadOnlyMode && <span style={{ color: '#666', fontStyle: 'italic' }}>보기전용모드</span>}
        </div>

        <div id="captureArea">
          <table className="score-table" id="scoreTable">
            <thead>
              <tr>
                <th>홀</th>
                <th className="par-header">파</th>
                {renderNames.map((n, i) => {
                  const trimmed = (n || '').trim();
                  const nameLen = trimmed.length;
                  const sizeClass = nameLen >= 5 ? 'name-xxs' : nameLen === 4 ? 'name-xs' : '';
                  return (
                    <th key={i} className={["name-header", sizeClass].filter(Boolean).join(' ')}>{n}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 9 }).map((_, hi) => (
                <tr key={hi}>
                  <td className="hole-number">{hi + 1}</td>
                  <td className="par">{activePars[hi] ?? "-"}</td>
                  {renderColumns.map((_, pi) => {
                    const isCurrentPadCell = padOpen && padPlayerIdx === pi && padHoleIdx === hi;
                    const committedVal = tableScores[pi]?.[hi];
                    // 로그 기준으로 수정 여부 판단(대시보드/전광판과 동일)
                    const displayName = renderNames[pi];
                    const playerIdForCell = nameToPlayerId[displayName] || nameToPlayerId[(displayName||'').split('/')[0]];
                    const logsForPlayer = playerScoreLogs[playerIdForCell] || [];
                    const courseIdForCell = String(activeCourse?.id || activeCourseId);
                    let logForCell = logsForPlayer.find(l => String(l.courseId) === courseIdForCell && Number(l.holeNumber) === hi + 1);
                    // 대시보드 초기화 이후의 로그만 수정표시 대상으로 인정
                    if (logForCell && logsResetAfter && Number(logForCell.modifiedAt || 0) <= logsResetAfter) {
                      logForCell = undefined as any;
                    }
                    // '처음 입력'은 oldValue가 0 또는 undefined/null인 경우가 대부분이므로 수정으로 보지 않음
                    const isModifiedLog = !!logForCell &&
                      (logForCell.oldValue !== logForCell.newValue) &&
                      (logForCell.oldValue !== 0);
                    const draftVal = draftScores?.[pi]?.[hi] ?? null;
                    const val = (isCurrentPadCell && padTemp !== null)
                      ? padTemp
                      : (typeof committedVal === 'number' ? committedVal : (typeof draftVal === 'number' ? draftVal : null));
                    const par = activePars[hi] ?? null;
                    const pm = typeof val === "number" && typeof par === "number" ? val - par : null;
                    const cellState = getCellState(pi, hi);
                    const isLocked = cellState === 'locked';
                    const isActive = cellState === 'active';
                    const isDisabled = cellState === 'disabled';
                    return (
                      <td key={pi} style={{ position: 'relative' }}>
                        <div
                          className={[
                            'score-input',
                            isLocked ? 'locked' : isDisabled ? 'disabled' : isActive ? 'active' : '',
                            (editingCell && editingCell.playerIdx === pi && editingCell.holeIdx === hi) ? 'editing' : '',
                        (isModifiedLog ? 'modified' : ((modifiedMap[activeCourseId]?.[pi]?.[hi]) ? 'modified' : '')),
                        (savedFlashMap[activeCourseId]?.[pi]?.[hi] ? 'saved-flash' : ''),
                        isReadOnlyMode ? 'readonly' : ''
                          ].filter(Boolean).join(' ')}
                          onClick={() => handleOpenPad(pi, hi)}
                          onDoubleClick={() => handleOpenPadForEdit(pi, hi)}
                          aria-disabled={!isActive}
                        >
                          {val ?? ''}
                        </div>
                        {(openTooltip && openTooltip.playerIdx === pi && openTooltip.holeIdx === hi) && (
                          <div className="cell-tooltip">{openTooltip.content}</div>
                        )}
                        <div className={`difference ${pm !== null ? (pm < 0 ? 'negative' : pm > 0 ? 'positive' : '') : ''}`}>
                          {pm === null ? '' : pm === 0 ? '(E)' : pm > 0 ? `(+${pm})` : `(${pm})`}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td colSpan={2} className="total-label">합계</td>
                {playerTotals.map((t, idx) => (
                  <td key={idx} className="total-score">
                    {t.sum ?? ''}
                  </td>
                ))}
              </tr>
              <tr>
                <td colSpan={2} className="total-label">서명</td>
                  {signatureIndexes.map((pi, idx) => (
                    <td key={idx} className={`signature-cell ${isReadOnlyMode ? 'readonly' : ''}`} onClick={() => openSignatureModal(pi)}>
                      {signatures[pi]
                        ? (<img src={signatures[pi]} alt="signature" className="signature-image" />)
                        : (<div className="signature-placeholder">{isReadOnlyMode ? '관전' : '싸인'}</div>)}
                    </td>
                  ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="action-buttons">
          <button className="action-button reset-button" onClick={async () => {
            // 서명 완료 후에는 초기화 차단
            console.log('초기화 시도 - postSignLock:', postSignLock, 'dbHasAnyScore:', dbHasAnyScore, 'allSigned:', allSigned);
            
            // 서명이 하나라도 있으면 초기화 차단 (DB 점수 여부와 관계없이)
            const hasAnySignature = signatures.some(sig => sig && sig.length > 0);
            if (hasAnySignature) {
              toast({ 
                title: '초기화 차단', 
                description: '서명이 있는 상태에서는 관리자 초기화 전까지 점수 초기화가 제한됩니다.', 
                variant: 'destructive' 
              });
              return;
            }
            
            if (!confirm(`${activeCourse?.name || '현재 코스'}의 점수가 초기화 됩니다. 초기화 하시겠습니까?`)) return;
            
            // 현재 코스의 점수만 초기화
            setScoresByCourse(prev => {
              const next = { ...prev };
              // 현재 코스만 null로 설정 (삭제하지 않음)
              next[activeCourseId] = Array.from({ length: 4 }, () => Array(9).fill(null));
              return next;
            });
            
            // 로컬 상태 초기화 (현재 코스만)
            // draftScores는 현재 코스의 초안이므로 초기화해도 다른 코스에 영향 없음
            setDraftScores(Array.from({ length: 4 }, () => Array(9).fill(null)));
            setGroupStartHole(null);
            setGroupCurrentHole(null);
            // 사인은 현재 코스의 사인만 초기화 (signatureKey가 코스별로 관리됨)
            setSignatures(['', '', '', '']);
            
            // 수정 기록 초기화 (현재 코스만)
            setModifiedMap(prev => {
              const next = { ...prev };
              delete next[activeCourseId];
              return next;
            });
            
            // localStorage 정리 (현재 코스의 초안 데이터만 제거)
            try {
              const draftKey = `selfScoringDraft_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
              localStorage.removeItem(draftKey);
              
              // 서명 데이터도 제거 (현재 코스만)
              const signatureKey = `selfScoringSign_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
              const teamSignatureKey = `selfScoringSignTeam_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
              localStorage.removeItem(signatureKey);
              localStorage.removeItem(teamSignatureKey);
              
              // sessionStorage에서도 제거
              sessionStorage.removeItem(signatureKey);
              sessionStorage.removeItem(teamSignatureKey);
            } catch {}
            
            // 수정 로그도 완전히 제거 (Firebase에서) - 현재 그룹/조의 현재 코스만
            try {
              if (!db) return;
              const dbInstance = db as any;
              
              // 현재 그룹/조의 모든 수정 로그를 찾아서 제거
              const logsRef = ref(dbInstance, 'scoreLogs');
              const snapshot = await get(logsRef);
              
              if (snapshot.exists()) {
                const deleteTasks: Promise<any>[] = [];
                
                snapshot.forEach((childSnapshot) => {
                  const logData = childSnapshot.val();
                  // 현재 그룹/조의 현재 코스 로그만 삭제
                  if (logData && 
                      logData.comment && 
                      logData.comment.includes(`그룹: ${selectedGroup}`) &&
                      logData.comment.includes(`조: ${selectedJo}`) &&
                      logData.courseId === activeCourseId) {
                    const logRef = ref(dbInstance, `scoreLogs/${childSnapshot.key}`);
                    deleteTasks.push(set(logRef, null));
                  }
                });
                
                if (deleteTasks.length > 0) {
                  await Promise.all(deleteTasks);
                }
              }
            } catch {}
            
            // Firebase DB에서 현재 코스의 점수만 제거
            try {
              if (!db) return;
              const dbInstance = db as any;
              const tasks: Promise<any>[] = [];
              
              // 모든 플레이어의 현재 코스 점수만 제거
              for (let pi = 0; pi < 4; pi++) {
                const playerName = playerNames[pi];
                const playerId = nameToPlayerId[playerName];
                if (!playerId) continue;
                
                // 현재 코스에 대해서만 점수 제거
                for (let h = 1; h <= 9; h++) {
                  const scoreRef = ref(dbInstance, `/scores/${playerId}/${activeCourseId}/${h}`);
                  tasks.push(set(scoreRef, null));
                }
              }
              await Promise.all(tasks);
            } catch {}
            
            toast({ title: '초기화 완료', description: `${activeCourse?.name || '현재 코스'}가 초기화되었습니다.` });
          }} disabled={isReadOnlyMode || signatures.some(sig => sig && sig.length > 0)}>초기화</button>
          <button className="action-button kakao-button" onClick={() => toast({ title: '공유', description: '공유 기능은 추후 제공됩니다.' })}>공유</button>
          <button className="action-button qr-button" onClick={() => {
            try {
              const params = new URLSearchParams({ group: selectedGroup || '', jo: String(selectedJo || ''), mode: 'readonly' });
              const url = `${window.location.origin}/self-scoring/scoring?${params.toString()}`;
              const modal = document.createElement('div');
              modal.style.position = 'fixed';
              modal.style.inset = '0';
              modal.style.background = 'rgba(0,0,0,0.5)';
              modal.style.zIndex = '10000';
              modal.style.display = 'flex';
              modal.style.alignItems = 'center';
              modal.style.justifyContent = 'center';
              modal.addEventListener('click', () => document.body.removeChild(modal));
              const box = document.createElement('div');
              box.style.background = '#fff';
              box.style.padding = '16px';
              box.style.borderRadius = '12px';
              box.style.textAlign = 'center';
              box.addEventListener('click', e => e.stopPropagation());
              const title = document.createElement('div');
              title.textContent = '조원 관전용 QR';
              title.style.fontWeight = '800';
              title.style.marginBottom = '8px';
              const urlDiv = document.createElement('div');
              urlDiv.textContent = url;
              urlDiv.style.fontSize = '12px';
              urlDiv.style.wordBreak = 'break-all';
              urlDiv.style.marginTop = '8px';
              const qr = document.createElement('div');
              qr.style.display = 'flex';
              qr.style.justifyContent = 'center';
              qr.style.alignItems = 'center';
              // 동적으로 qrcode.react를 import하여 렌더링
              // 간단히 이미지 API 사용 (data URL) 대신 라이브러리 구성: DOM에 리액트 마운트
                            // 간단한 QR 코드 생성 (외부 API 사용)
              const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
              const img = document.createElement('img');
              img.src = qrApiUrl;
              img.alt = 'QR';
              img.style.width = '180px';
              img.style.height = '180px';
              img.onerror = () => {
                qr.textContent = 'QR 생성 실패';
              };
              qr.appendChild(img);
              const copy = document.createElement('button');
              copy.textContent = '링크 복사';
              copy.style.marginTop = '8px';
              copy.style.padding = '8px 12px';
              copy.style.borderRadius = '8px';
              copy.style.border = '1px solid #e9ecef';
              copy.style.marginRight = '8px';
              copy.addEventListener('click', async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  copy.textContent = '복사됨';
                } catch {}
              });
              
              const close = document.createElement('button');
              close.textContent = '닫기';
              close.style.marginTop = '8px';
              close.style.padding = '8px 12px';
              close.style.borderRadius = '8px';
              close.style.border = '1px solid #e9ecef';
              close.style.backgroundColor = '#f8f9fa';
              close.addEventListener('click', () => {
                document.body.removeChild(modal);
              });
              
              const buttonContainer = document.createElement('div');
              buttonContainer.style.display = 'flex';
              buttonContainer.style.justifyContent = 'center';
              buttonContainer.style.gap = '8px';
              buttonContainer.appendChild(copy);
              buttonContainer.appendChild(close);
              
              box.appendChild(title);
              box.appendChild(qr);
              box.appendChild(urlDiv);
              box.appendChild(buttonContainer);
              modal.appendChild(box);
              document.body.appendChild(modal);
            } catch {}
          }}>QR</button>
        </div>
      </div>

      {/* 숫자패드 */}
      {padOpen && (
        <div className={`number-pad ${padHoleIdx !== null && padHoleIdx >= 7 ? 'top-fixed' : 'bottom-fixed'}`} role="dialog" aria-modal="true" style={{display:'grid'}}>
          {[1,2,3,4,5,6,7,8,9,10].map((n) => (
            <button key={n} className={`number-button ${padTemp === n ? 'control-button' : ''}`} onClick={() => handleSetPadValue(n)}>{n}</button>
          ))}
          <button className="number-button cancel-button" onClick={handleCancelPad}>취소</button>
          <button className="number-button save-button" onClick={handleSavePad} disabled={padHoleIdx === null}>저장</button>
        </div>
      )}
      {/* 서명 모달 */}
      {signatureOpen && (
        <div className="signature-modal" style={{ display: 'flex' }}>
          <div className="signature-content">
            <div className="signature-header">
              <h2 className="player-name">{signaturePlayerIdx !== null ? playerNames[signaturePlayerIdx] : ''}</h2>
              <h3 className="player-score">{signaturePlayerIdx !== null ? (playerTotals[signaturePlayerIdx]?.sum ?? 0) : ''}</h3>
            </div>
            <canvas
              ref={signatureCanvasRef}
              className="signature-canvas"
              onMouseDown={handleCanvasPointerDown}
              onMouseMove={handleCanvasPointerMove}
              onMouseUp={handleCanvasPointerUp}
              onMouseLeave={handleCanvasPointerUp}
              onTouchStart={handleCanvasPointerDown}
              onTouchMove={handleCanvasPointerMove}
              onTouchEnd={handleCanvasPointerUp}
            />
            <div className="signature-buttons">
              <button className="modal-button clear-button" onClick={handleSignatureClear}>다시하기</button>
              <button className="modal-button save-signature-button" onClick={handleSignatureSave}>저장</button>
              <button className="modal-button close-signature-button" onClick={closeSignatureModal}>닫기</button>
            </div>
          </div>
        </div>
      )}
      {/* 뒤로가기 확인 다이얼로그 */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={(open) => { if (!open) setShowLeaveConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 페이지에서 나가시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              점수 채점 중 잘못 누른 건 아닌지 확인합니다.<br />뒤로 가기는 확인을, 머무실거면 취소를 눌러주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowLeaveConfirm(false)}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              exitGuardRef.current = true;
              setShowLeaveConfirm(false);
              try {
                if (typeof window !== 'undefined') {
                  if (window.history.length > 2) {
                    // 최초 진입 시 pushState로 추가한 히스토리를 포함해 2단계 뒤로 이동
                    window.history.go(-2);
                  } else {
                    // 유의미한 뒤로가기가 없으면 목록 페이지로 이동
                    window.location.href = '/self-scoring';
                  }
                }
              } finally {
                setTimeout(() => { exitGuardRef.current = false; }, 800);
              }
            }}>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
