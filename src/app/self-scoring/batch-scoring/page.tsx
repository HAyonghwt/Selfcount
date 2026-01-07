"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, ensureAuthenticated } from "@/lib/firebase";
import { ref, set, get, onValue, query, orderByChild, equalTo } from "firebase/database";
import { useToast } from "@/hooks/use-toast";
import { logScoreChange, getPlayerScoreLogs, ScoreLog, invalidatePlayerLogCache } from "@/lib/scoreLogs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import html2canvas from "html2canvas";
import "./styles.css";

type CourseTab = { id: string; name: string; pars: number[]; originalOrder?: number };
type PlayerDb = {
  id: string;
  type: "individual" | "team";
  name?: string;
  p1_name?: string;
  p2_name?: string;
  group: string;
  jo: number;
  uploadOrder?: number;
};

// 일괄 입력 이력 타입
type BatchHistoryEntry = {
  modifiedBy: string;  // 조장 아이디
  modifiedAt: number;  // 타임스탬프
  action: 'reset' | 'save' | 'update';  // 액션 타입
  details?: string;    // 추가 설명
};

type LastInputInfo = {
  lastModifiedBy: string;
  lastModifiedAt: number;
  action: string;
};

export default function BatchScoringPage() {
  const { toast } = useToast();

  // 인앱 브라우저 리다이렉트 스크립트
  useEffect(() => {
    const inappdeny_exec_vanillajs = (callback: () => void) => {
      if (document.readyState !== 'loading') {
        callback();
      } else {
        document.addEventListener('DOMContentLoaded', callback);
      }
    };

    inappdeny_exec_vanillajs(() => {
      function copytoclipboard(val: string) {
        const t = document.createElement("textarea");
        document.body.appendChild(t);
        t.value = val;
        t.select();
        document.execCommand('copy');
        document.body.removeChild(t);
      }

      function inappbrowserout() {
        copytoclipboard(window.location.href);
        alert('URL주소가 복사되었습니다.\n\nSafari가 열리면 주소창을 길게 터치한 뒤, "붙여놓기 및 이동"를 누르면 정상적으로 이용하실 수 있습니다.');
        location.href = 'x-web-search://?';
      }

      const useragt = navigator.userAgent.toLowerCase();
      const target_url = location.href;

      if (useragt.match(/kakaotalk/i)) {
        //카카오톡 외부브라우저로 호출
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(target_url);
      } else if (useragt.match(/line/i)) {
        //라인 외부브라우저로 호출
        if (target_url.indexOf('?') !== -1) {
          location.href = target_url + '&openExternalBrowser=1';
        } else {
          location.href = target_url + '?openExternalBrowser=1';
        }
      } else if (useragt.match(/inapp|naver|snapchat|wirtschaftswoche|thunderbird|instagram|everytimeapp|whatsApp|electron|wadiz|aliapp|zumapp|iphone(.*)whale|android(.*)whale|kakaostory|band|twitter|DaumApps|DaumDevice\/mobile|FB_IAB|FB4A|FBAN|FBIOS|FBSS|SamsungBrowser\/[^1]/i)) {
        //그외 다른 인앱들
        if (useragt.match(/iphone|ipad|ipod/i)) {
          //아이폰은 강제로 사파리를 실행할 수 없다 ㅠㅠ
          //모바일대응뷰포트강제설정
          const mobile = document.createElement('meta');
          mobile.name = 'viewport';
          mobile.content = "width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=no, minimal-ui";
          document.getElementsByTagName('head')[0].appendChild(mobile);
          //노토산스폰트강제설정
          const fonts = document.createElement('link');
          fonts.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;500;700;900&display=swap';
          document.getElementsByTagName('head')[0].appendChild(fonts);
          document.body.innerHTML = "<style>body{margin:0;padding:0;font-family: 'Noto Sans KR', sans-serif;overflow: hidden;height: 100%;}</style><h2 style='padding-top:50px; text-align:center;font-family: 'Noto Sans KR', sans-serif;'>인앱브라우저 호환문제로 인해<br />Safari로 접속해야합니다.</h2><article style='text-align:center; font-size:17px; word-break:keep-all;color:#999;'>아래 버튼을 눌러 Safari를 실행해주세요<br />Safari가 열리면, 주소창을 길게 터치한 뒤,<br />'붙여놓기 및 이동'을 누르면<br />정상적으로 이용할 수 있습니다.<br /><br /><button onclick='inappbrowserout();' style='min-width:180px;margin-top:10px;height:54px;font-weight: 700;background-color:#31408E;color:#fff;border-radius: 4px;font-size:17px;border:0;'>Safari로 열기</button></article><img style='width:70%;margin:50px 15% 0 15%' src='https://tistory3.daumcdn.net/tistory/1893869/skin/images/inappbrowserout.jpeg' />";
        } else {
          //안드로이드는 Chrome이 설치되어있음으로 강제로 스킴실행한다.
          location.href = 'intent://' + target_url.replace(/https?:\/\//i, '') + '#Intent;scheme=http;package=com.android.chrome;end';
        }
      }
    });
  }, []);

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

  // 렌더링할 열 구성: 개인전은 4열, 2인1팀은 실제 데이터 위치에 맞게 설정
  const renderColumns: number[][] = useMemo(() => {
    return gameMode === 'team' ? [[0], [1]] : [[0], [1], [2], [3]];
  }, [gameMode]);
  const renderNames: string[] = useMemo(() => {
    if (gameMode === 'team') {
      // 팀전에서는 강제로 팀 이름 형식으로 표시
      return [
        playerNames[0] && playerNames[1] ? `${playerNames[0]}/${playerNames[1]}` : (playerNames[0] || playerNames[1] || ''),
        playerNames[2] && playerNames[3] ? `${playerNames[2]}/${playerNames[3]}` : (playerNames[2] || playerNames[3] || '')
      ].filter(name => name.length > 0);
    } else {
      // 개인전에서는 각 선수 이름을 개별적으로 표시 (빈 이름도 표시)
      return renderColumns.map(idxs => {
        const name = idxs.map(i => (playerNames[i] || '')).filter(Boolean).join('/');
        return name || `이름${idxs[0] + 1}`;
      });
    }
  }, [gameMode, renderColumns, playerNames]);
  // 서명 표시 인덱스: 개인전은 4명, 팀전은 각 팀의 대표(각 묶음의 첫 인덱스)
  const signatureIndexes: number[] = useMemo(() => {
    return gameMode === 'team' ? renderColumns.map(arr => arr[0]) : [0, 1, 2, 3];
  }, [gameMode, renderColumns]);

  // 점수 상태: courseId -> [4명][9홀]
  const [scoresByCourse, setScoresByCourse] = useState<Record<string, (number | null)[][]>>({});
  const [debouncedScores, setDebouncedScores] = useState<Record<string, (number | null)[][]>>({});
  const [cachedScores, setCachedScores] = useState<Record<string, any>>({});

  // 시작홀/현재홀 (자동 진행 없음, 9홀 제한 및 초기 활성에 사용) - 코스별로 관리
  const [groupStartHole, setGroupStartHole] = useState<number | null>(null);
  const [groupCurrentHole, setGroupCurrentHole] = useState<number | null>(null);
  const [courseStartHoles, setCourseStartHoles] = useState<Record<string, number | null>>({});
  const [courseCurrentHoles, setCourseCurrentHoles] = useState<Record<string, number | null>>({});

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
  const lastPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
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

  // 일괄 입력 이력 추적
  const [lastInputInfo, setLastInputInfo] = useState<LastInputInfo | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [actionHistory, setActionHistory] = useState<BatchHistoryEntry[]>([]);

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

  // 로그 데이터 lazy loading을 위한 함수 - 필요할 때만 로드
  const loadPlayerLogs = useCallback(async (playerId: string) => {
    if (playerScoreLogs[playerId]) return; // 이미 로드된 경우 스킵

    try {
      const logs = await getPlayerScoreLogs(playerId);
      setPlayerScoreLogs(prev => ({ ...prev, [playerId]: logs }));
    } catch (error) {
      console.error('로그 로딩 실패:', error);
    }
  }, [playerScoreLogs]);

  // 리스너 참조 관리를 위한 ref
  const listenersRef = useRef<{ players?: () => void; scores?: () => void; tournament?: () => void }>({});
  // 점수 리스너(선수별/코스별) 해제를 저장하기 위한 맵
  const scoreUnsubsRef = useRef<Record<string, () => void>>({});
  // 화면 가시성 상태 관리 (백그라운드 최적화)
  const [isPageVisible, setIsPageVisible] = useState(true);
  const wasVisibleRef = useRef(true);

  // Page Visibility API: 화면이 숨겨지면 리스너 해제, 다시 보이면 재연결
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);

      if (!visible && wasVisibleRef.current) {
        // 화면이 숨겨짐 - 리스너 해제하여 데이터 소비 감소
        if (listenersRef.current.scores) {
          listenersRef.current.scores();
          listenersRef.current.scores = undefined;
        }
        if (listenersRef.current.tournament) {
          listenersRef.current.tournament();
          listenersRef.current.tournament = undefined;
        }
        // 선수 리스너는 유지 (변경 빈도 낮음)
      }
      wasVisibleRef.current = visible;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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

  // 로컬 초안(새로고침/재접속 복원용) - 일괄 입력 모드에서는 모든 셀에 직접 입력 가능
  const [draftScores, setDraftScores] = useState<(number | null)[][]>(
    Array.from({ length: 4 }, () => Array(9).fill(null))
  );
  // 일괄 입력 모드용: 모든 셀에 직접 입력 가능하도록 활성화
  const [batchInputScores, setBatchInputScores] = useState<(number | null)[][]>(
    Array.from({ length: 4 }, () => Array(9).fill(null))
  );
  // 홀별 잠금 상태: [9홀] - 모든 선수의 점수가 입력되면 잠금
  const [holeLocks, setHoleLocks] = useState<boolean[]>(Array(9).fill(false));
  // 수동으로 해제된 홀 추적 (더블클릭으로 해제된 홀은 다시 잠그지 않음)
  const manuallyUnlockedHolesRef = useRef<Set<number>>(new Set());
  // 수정 중인 셀 추적 (자동 커서 이동 방지용)
  const editingCellsRef = useRef<Set<string>>(new Set());
  // 저장 중 상태 (중복 저장 방지)
  const [isSaving, setIsSaving] = useState<boolean>(false);
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
          // 초기 로드 시에는 activeCourseId를 설정하지 않음
          // 그룹별 순서로 정렬된 후 첫 번째 탭이 선택되도록 함
          // setActiveCourseId는 코스 탭이 그룹별 순서로 정렬될 때 설정됨
        }
      }
    } catch { }

    // Firebase 인증 수행 (관전/일반 공통)
    ensureAuthenticated().then(success => {
      if (!success) {
        console.warn('Firebase 인증 실패 - 점수 저장 시 재시도됩니다.');
      }
    });
  }, []);

  // 플레이어/점수 DB 로딩 (읽기) - 최적화된 버전
  useEffect(() => {
    if (!db || !selectedGroup || !selectedJo) return;
    const dbInstance = db as any;

    // 기존 리스너 정리
    if (listenersRef.current.players) {
      listenersRef.current.players();
    }
    // 최적화: 필요한 선수만 쿼리 - 그룹/조별로 필터링
    // Firebase 쿼리를 사용하여 필요한 데이터만 가져오기 (데이터 사용량 대폭 감소)
    const playersQuery = query(
      ref(dbInstance, "players"),
      orderByChild("group"),
      equalTo(selectedGroup)
    );

    const unsubPlayers = onValue(playersQuery, (snap) => {
      const data = snap.val() || {};
      const list: PlayerDb[] = Object.entries<any>(data)
        .map(([id, v]) => ({ id, ...v }))
        .filter((p) => String(p.jo) === String(selectedJo)); // 그룹은 이미 쿼리로 필터링됨

      // 수기 채점표와 동일한 순서로 정렬 (uploadOrder 우선 → 이름 순)
      list.sort((a, b) => {
        // uploadOrder가 있으면 그것으로 정렬
        if (a.uploadOrder !== undefined && b.uploadOrder !== undefined) {
          return (a.uploadOrder || 0) - (b.uploadOrder || 0);
        }
        // 없으면 이름으로 정렬
        const nameA = a.type === 'team' ? `${a.p1_name}/${a.p2_name}` : (a.name || '');
        const nameB = b.type === 'team' ? `${b.p1_name}/${b.p2_name}` : (b.name || '');
        return nameA.localeCompare(nameB);
      });

      setPlayersInGroupJo(list as any);

      // 관전 모드에서는 플레이어 이름을 실시간으로 설정
      if (isReadOnlyMode) {
        if (list.length > 0) {
          // 개인전과 팀전 구분하여 이름 설정
          const names: string[] = [];
          list.forEach(p => {
            if (p.type === 'team') {
              // 팀전: p1_name과 p2_name을 각각 names 배열에 추가
              if (p.p1_name) names.push(p.p1_name);
              if (p.p2_name) names.push(p.p2_name);
            } else {
              // 개인전: name을 names 배열에 추가
              if (p.name) names.push(p.name);
            }
          });

          // 항상 4개로 채우기 (부족한 부분은 빈 문자열로)
          const filledNames = [...names];
          while (filledNames.length < 4) {
            filledNames.push('');
          }

          setPlayerNames(filledNames.slice(0, 4));
        } else {
          // 선수가 없을 때는 기본값 유지
          setPlayerNames(["이름1", "이름2", "이름3", "이름4"]);
        }
      } else {
        // 일반 모드: playersInGroupJo 순서에 맞춰 playerNames 재정렬
        if (list.length > 0) {
          const sortedNames: string[] = [];
          list.forEach(p => {
            if (p.type === 'team') {
              // 팀전: p1_name과 p2_name을 각각 names 배열에 추가
              if (p.p1_name) sortedNames.push(p.p1_name);
              if (p.p2_name) sortedNames.push(p.p2_name);
            } else {
              // 개인전: name을 names 배열에 추가
              if (p.name) sortedNames.push(p.name);
            }
          });

          // 항상 4개로 채우기 (부족한 부분은 빈 문자열로)
          const filledNames = [...sortedNames];
          while (filledNames.length < 4) {
            filledNames.push('');
          }

          const newPlayerNames = filledNames.slice(0, 4);
          setPlayerNames(newPlayerNames);

          // sessionStorage 업데이트
          try {
            if (typeof window !== 'undefined') {
              sessionStorage.setItem("selfScoringNames", JSON.stringify(newPlayerNames));
            }
          } catch (error) {
            console.error('sessionStorage 업데이트 실패:', error);
          }

          // signatures 배열도 동일한 순서로 재정렬
          // 기존 signatures를 playerId 기반으로 매핑한 후 재정렬
          const currentSignatures = [...signatures];
          const reorderedSignatures: string[] = [];

          list.forEach((p, idx) => {
            if (p.type === 'team') {
              // 팀전: 각 선수별로 서명 처리
              if (p.p1_name && idx * 2 < currentSignatures.length) {
                reorderedSignatures.push(currentSignatures[idx * 2] || '');
              }
              if (p.p2_name && idx * 2 + 1 < currentSignatures.length) {
                reorderedSignatures.push(currentSignatures[idx * 2 + 1] || '');
              }
            } else {
              // 개인전: 인덱스 그대로 사용
              if (idx < currentSignatures.length) {
                reorderedSignatures.push(currentSignatures[idx] || '');
              } else {
                reorderedSignatures.push('');
              }
            }
          });

          // 항상 4개로 채우기
          while (reorderedSignatures.length < 4) {
            reorderedSignatures.push('');
          }

          setSignatures(reorderedSignatures.slice(0, 4));
        }
      }
    });

    // 리스너 참조 저장 및 정리
    listenersRef.current.players = unsubPlayers;

    return () => {
      unsubPlayers();
    };
    // 최적화된 의존성 배열 - 핵심 의존성만 포함
  }, [db, selectedGroup, selectedJo, isReadOnlyMode]);

  // 점수 DB 로딩 (읽기) - 선수별/코스별 분할 구독
  useEffect(() => {
    // 화면이 숨겨진 상태면 리스너 연결하지 않음 (백그라운드 최적화)
    if (!isPageVisible) return;

    if (!db || !activeCourseId) return;
    const hasPlayers = playersInGroupJo && playersInGroupJo.length > 0;
    if (!hasPlayers) {
      // 선수 없으면 기존 점수 리스너 전부 해제
      if (listenersRef.current.scores) listenersRef.current.scores();
      Object.values(scoreUnsubsRef.current).forEach(u => { try { u(); } catch { } });
      scoreUnsubsRef.current = {};
      return;
    }

    const dbInstance = db as any;

    // 기존 점수 리스너 정리
    if (listenersRef.current.scores) listenersRef.current.scores();
    Object.values(scoreUnsubsRef.current).forEach(u => { try { u(); } catch { } });
    scoreUnsubsRef.current = {};

    // pid -> index 매핑 생성 (원래 순서 유지)
    const pidToIndex = new Map<string, number>();
    playersInGroupJo.forEach((p, idx) => { if (p.id) pidToIndex.set(p.id, idx); });

    // 선수별 현재 코스 경로 구독
    playersInGroupJo.forEach((player) => {
      const pid = player.id;
      if (!pid) return;
      const key = `${pid}:${activeCourseId}`;
      const r = ref(dbInstance, `/scores/${pid}/${activeCourseId}`);
      const unsub = onValue(r, (snap) => {
        const perHole = (snap.val() || {}) as Record<string, any>;
        const pi = pidToIndex.get(pid);
        if (pi == null) return;
        setScoresByCourse((prev) => {
          const next = { ...prev } as Record<string, (number | null)[][]>;
          const base = (next[activeCourseId]
            ? next[activeCourseId].map(row => [...row])
            : Array.from({ length: 4 }, () => Array(9).fill(null)));
          for (let h = 1; h <= 9; h++) {
            const v = perHole[h];
            base[pi][h - 1] = typeof v === 'number' ? v : null;
          }
          // 로컬 초기화 마스크가 켜진 코스는 기존 화면 값을 유지(연습 모드)
          next[activeCourseId] = localCleared[activeCourseId] ? (prev[activeCourseId] ?? base) : base;
          return next;
        });
      });
      scoreUnsubsRef.current[key] = unsub;
    });

    // 일괄 해제 함수 보관
    listenersRef.current.scores = () => {
      Object.values(scoreUnsubsRef.current).forEach(u => { try { u(); } catch { } });
      scoreUnsubsRef.current = {};
    };

    return () => {
      if (listenersRef.current.scores) listenersRef.current.scores();
    };
  }, [db, playersInGroupJo, activeCourseId, localCleared, gameMode, isPageVisible]);

  // 현재 코스 점수 존재 여부 재계산
  useEffect(() => {
    const mat = scoresByCourse[activeCourseId];
    if (!mat) { setDbHasAnyScore(false); return; }
    let any = false;
    outer: for (let i = 0; i < mat.length; i++) {
      for (let j = 0; j < mat[i].length; j++) {
        if (typeof mat[i][j] === 'number') { any = true; break outer; }
      }
    }
    setDbHasAnyScore(any);
  }, [scoresByCourse, activeCourseId]);

  // 대회 설정(tournaments/current)과 그룹-코스 연동을 읽어 탭/파/이름 동기화
  useEffect(() => {
    // 화면이 숨겨진 상태면 리스너 연결하지 않음 (백그라운드 최적화)
    if (!isPageVisible) return;

    if (!db || !selectedGroup) return;
    const dbInstance = db as any;

    // 기존 리스너 정리
    if (listenersRef.current.tournament) {
      listenersRef.current.tournament();
    }

    // 최적화: 필요한 데이터만 쿼리 - 전체 대회 설정이 아닌 필요한 부분만
    const unsubTournament = onValue(ref(dbInstance, 'tournaments/current'), (snap) => {
      const data = snap.val() || {};
      const coursesObj = data.courses || {};
      const groupsObj = data.groups || {};

      // 그룹에 배정된 코스 id 목록 및 순서 정보 가져오기
      const group = groupsObj[selectedGroup] || {};
      const coursesOrder = group.courses || {};

      // 그룹에 배정된 코스 목록 (number 타입이고 0보다 큰 값만, 또는 boolean true)
      const assignedCourses: Array<{ cid: string; order: number }> = Object.entries(coursesOrder)
        .map(([cid, order]: [string, any]) => {
          // number 타입이고 0보다 큰 경우만
          if (typeof order === 'number' && order > 0) {
            return { cid, order };
          }
          // boolean true인 경우 (레거시 호환성)
          if (order === true) {
            return { cid, order: 1 }; // 기본값으로 1 설정
          }
          return null;
        })
        .filter((item): item is { cid: string; order: number } => item !== null);

      // 코스 순서대로 정렬 (작은 순서가 먼저 = 첫번째 코스가 위)
      assignedCourses.sort((a, b) => a.order - b.order);

      // 코스 탭 구성: id, name, pars - 그룹별 코스 순서대로 구성
      // 대회 및 코스 관리에서 설정된 코스 순서 정보도 함께 저장 (색상 테마용)
      const courseKeys = Object.keys(coursesObj);
      const nextTabs: CourseTab[] = assignedCourses
        .map(({ cid }) => {
          const key = courseKeys.find((k) => String(k) === String(cid));
          const course = key ? coursesObj[key] : null;
          if (!course) return null;

          // 코스의 원본 순서 정보 저장 (색상 테마용)
          // 1. course.order 필드가 있으면 그것을 사용
          // 2. 없으면 courses 객체의 키 순서를 사용 (대회 및 코스 관리에서 설정된 순서)
          let originalOrder: number;
          if (course.order !== undefined && typeof course.order === 'number') {
            originalOrder = course.order;
          } else {
            // courses 객체의 키 순서로 결정 (Firebase는 숫자 키의 경우 순서를 유지)
            const courseIndex = courseKeys.findIndex(k => String(k) === String(cid));
            originalOrder = courseIndex >= 0 ? courseIndex + 1 : 999;
          }

          return {
            id: String(course.id ?? cid),
            name: String(course.name ?? cid),
            pars: Array.isArray(course.pars) ? course.pars : [3, 4, 4, 4, 4, 3, 5, 3, 3],
            originalOrder,
          } as CourseTab;
        })
        .filter(Boolean) as CourseTab[];

      if (nextTabs.length > 0) {
        const prevTabsLength = courseTabs.length;
        setCourseTabs(nextTabs);

        // 코스 탭이 처음 로드되거나 완전히 바뀐 경우 (그룹 변경 등)
        // 또는 현재 활성 코스가 목록에 없는 경우 첫 번째 탭 선택
        const isInitialLoad = prevTabsLength === 0;
        const exists = nextTabs.some((t) => String(t.id) === String(activeCourseId));

        if (isInitialLoad || !exists || !activeCourseId) {
          // 처음 로드이거나 현재 활성 코스가 목록에 없으면 첫 번째 탭 선택
          setActiveCourseId(String(nextTabs[0].id));
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('selfScoringActiveCourseId', String(nextTabs[0].id));
          }
        } else {
          // 현재 활성 코스가 목록에 있으면 유지하고 sessionStorage도 업데이트
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('selfScoringActiveCourseId', String(activeCourseId));
          }
        }
      }

      // 관전 모드에서는 게임 모드도 실시간으로 설정 - 필요한 데이터만
      if (isReadOnlyMode && data.gameMode) {
        setGameMode(data.gameMode);
      }
    });

    // 리스너 참조 저장 및 정리
    listenersRef.current.tournament = unsubTournament;

    return () => unsubTournament();
  }, [db, selectedGroup, activeCourseId, isPageVisible]);

  // 일괄 입력 이력 로드 (현재 코스)
  useEffect(() => {
    if (!db || !selectedGroup || !selectedJo || !activeCourseId) {
      setLastInputInfo(null);
      setActionHistory([]);
      return;
    }

    const dbInstance = db as any;
    const historyPath = `batchScoringHistory/${selectedGroup}/${selectedJo}/${activeCourseId}`;
    const historyRef = ref(dbInstance, historyPath);

    const unsubHistory = onValue(historyRef, (snap) => {
      const data = snap.val();
      if (data) {
        // 최종 입력자 정보
        if (data.lastModifiedBy && data.lastModifiedAt) {
          setLastInputInfo({
            lastModifiedBy: data.lastModifiedBy,
            lastModifiedAt: data.lastModifiedAt,
            action: data.action || 'save'
          });
        } else {
          setLastInputInfo(null);
        }

        // 전체 이력 (배열 형태로 저장)
        if (Array.isArray(data.history)) {
          setActionHistory(data.history);
        } else {
          setActionHistory([]);
        }
      } else {
        setLastInputInfo(null);
        setActionHistory([]);
      }
    });

    return () => unsubHistory();
  }, [db, selectedGroup, selectedJo, activeCourseId]);

  // 디바운싱된 점수 업데이트 (과도한 리렌더링 방지)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedScores(scoresByCourse);
    }, 500); // 0.5초 대기

    return () => clearTimeout(timer);
  }, [scoresByCourse]);

  // 현재 코스/파 데이터
  const activeCourse = useMemo(() => courseTabs.find((c) => String(c.id) === String(activeCourseId)) || null, [courseTabs, activeCourseId]);
  const activePars = activeCourse?.pars || [3, 4, 4, 4, 4, 3, 5, 3, 3];
  const rawTableScores = debouncedScores[activeCourseId] || Array.from({ length: 4 }, () => Array(9).fill(null));
  // 표시용 점수 매트릭스: 팀 모드일 때는 같은 팀 구성원 중 첫 인덱스의 값을 사용(입력과 저장은 첫 인덱스에만 기록)
  const tableScores = useMemo(() => {
    if (gameMode !== 'team') return rawTableScores;
    const view: (number | null)[][] = Array.from({ length: renderColumns.length }, () => Array(9).fill(null));
    renderColumns.forEach((idxs, col) => {
      const primary = idxs[0];
      for (let h = 0; h < 9; h++) view[col][h] = rawTableScores[primary]?.[h] ?? null;
    });
    return view;
  }, [gameMode, rawTableScores, renderColumns]);

  // 일괄 입력 모드: 기존 점수를 batchInputScores에 초기값으로 설정 (코스 변경 시에만)
  const prevCourseIdRef = useRef<string>('');
  useEffect(() => {
    // 코스가 변경되었을 때만 초기화
    if (activeCourseId && activeCourseId !== prevCourseIdRef.current) {
      prevCourseIdRef.current = activeCourseId;
      if (tableScores && tableScores.length > 0) {
        setBatchInputScores(prev => {
          // 기존 점수가 있으면 그것을 사용
          const next = tableScores.map(row => [...row]);
          return next;
        });
      } else {
        // 점수가 없으면 빈 배열로 초기화
        setBatchInputScores(Array.from({ length: 4 }, () => Array(9).fill(null)));
      }
    }
  }, [activeCourseId]); // activeCourseId만 의존성으로 사용

  // 코스별 시작홀/현재홀 상태 복원 (코스 변경 시)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = `selfScoringDraft_${activeCourseId}_${selectedGroup || 'g'}_${selectedJo || 'j'}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        // 현재 코스의 시작홀과 현재홀을 코스별 상태에 저장
        setCourseStartHoles(prev => ({
          ...prev,
          [activeCourseId]: parsed?.start ?? null
        }));
        setCourseCurrentHoles(prev => ({
          ...prev,
          [activeCourseId]: parsed?.current ?? null
        }));
        // 기존 호환성을 위해 전역 상태도 업데이트
        if (parsed?.start != null) setGroupStartHole(parsed.start);
        if (parsed?.current != null) setGroupCurrentHole(parsed.current);
      } else {
        // 저장된 데이터가 없으면 코스별 상태에서 null로 설정
        setCourseStartHoles(prev => ({
          ...prev,
          [activeCourseId]: null
        }));
        setCourseCurrentHoles(prev => ({
          ...prev,
          [activeCourseId]: null
        }));
        setGroupStartHole(null);
        setGroupCurrentHole(null);
      }
    } catch {
      setCourseStartHoles(prev => ({
        ...prev,
        [activeCourseId]: null
      }));
      setCourseCurrentHoles(prev => ({
        ...prev,
        [activeCourseId]: null
      }));
      setGroupStartHole(null);
      setGroupCurrentHole(null);
    }
  }, [activeCourseId, selectedGroup, selectedJo]);

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
      } else {
        setDraftScores(Array.from({ length: 4 }, () => Array(9).fill(null)));
      }
    } catch {
      setDraftScores(Array.from({ length: 4 }, () => Array(9).fill(null)));
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
      // 홀 활성화 상태 초기화 (코스별로 관리)
      setGroupStartHole(null);
      setGroupCurrentHole(null);
      setCourseStartHoles(prev => ({
        ...prev,
        [activeCourseId]: null
      }));
      setCourseCurrentHoles(prev => ({
        ...prev,
        [activeCourseId]: null
      }));

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

  // 최근 수정 로그 툴팁 표시
  const showCellLogTooltip = useCallback(async (playerIndex: number, holeIndex: number) => {
    try {
      const playerName = playerNames[playerIndex];
      const playerId = nameToPlayerId[playerName];
      if (!playerId) return;

      // 로그 데이터가 없으면 lazy loading
      if (!playerScoreLogs[playerId]) {
        await loadPlayerLogs(playerId);
      }

      const logs = playerScoreLogs[playerId] || [];
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
    } catch { }
  }, [playerNames, nameToPlayerId, playerScoreLogs, loadPlayerLogs, activeCourse, activeCourseId]);

  const handleOpenPad = useCallback((playerIndex: number, holeIndex: number) => {
    if (isReadOnlyMode) return; // 관전용 모드에서는 입력 불가

    // 로그 데이터 lazy loading
    const playerName = playerNames[playerIndex];
    const playerId = nameToPlayerId[playerName];
    if (playerId && !playerScoreLogs[playerId]) {
      loadPlayerLogs(playerId);
    }

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
    // 현재 셀의 값 또는 초안 값을 우선으로 설정
    const currentVal = tableScores[playerIndex]?.[holeIndex];
    const draftVal = draftScores[playerIndex]?.[holeIndex];
    setPadTemp(typeof currentVal === 'number' ? currentVal : (typeof draftVal === 'number' ? draftVal : null));
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
      } catch { }
    }
  }, [isReadOnlyMode, playerNames, nameToPlayerId, playerScoreLogs, loadPlayerLogs, getCellState, tableScores, draftScores]);

  // 저장된 셀(locked) 더블클릭 시에도 수정 가능하도록 별도 핸들러
  const handleOpenPadForEdit = useCallback((playerIndex: number, holeIndex: number) => {
    if (isReadOnlyMode) return; // 관전용 모드에서는 수정 불가

    // 로그 데이터 lazy loading
    const playerName = playerNames[playerIndex];
    const playerId = nameToPlayerId[playerName];
    if (playerId && !playerScoreLogs[playerId]) {
      loadPlayerLogs(playerId);
    }

    setPadPosition(holeIndex >= 7 ? 'top' : 'bottom');
    setPadPlayerIdx(playerIndex);
    setPadHoleIdx(holeIndex);
    // 현재 셀의 값 또는 초안 값을 우선으로 설정
    const currentVal = tableScores[playerIndex]?.[holeIndex];
    const draftVal = draftScores[playerIndex]?.[holeIndex];
    setPadTemp(typeof currentVal === 'number' ? currentVal : (typeof draftVal === 'number' ? draftVal : null));
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
    } catch { }
  }, [isReadOnlyMode, playerNames, nameToPlayerId, playerScoreLogs, loadPlayerLogs, tableScores, draftScores]);



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
            // 팀전에서는 1팀(padPlayerIdx=0) → targetPlayer=0, 2팀(padPlayerIdx=1) → targetPlayer=1
            targetPlayer = padPlayerIdx === 0 ? 0 : 1;
          }
          parsed.draft[targetPlayer!][padHoleIdx] = Number(val);
          parsed.start = parsed.start ?? groupStartHole;
          parsed.current = parsed.current ?? groupCurrentHole;
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } catch { }
      setDraftScores((prev) => {
        const next = prev.map((row) => [...row]);
        let targetPlayer = padPlayerIdx!;
        if (gameMode === 'team') targetPlayer = padPlayerIdx === 0 ? 0 : 1;
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

    // Firebase 인증 확인 (재인증 시도 포함)
    let isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      // 재인증 시도 (최대 2회)
      for (let authRetry = 0; authRetry < 2; authRetry++) {
        console.log(`인증 재시도 중... (${authRetry + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (authRetry + 1))); // 1초, 2초 대기
        isAuthenticated = await ensureAuthenticated();
        if (isAuthenticated) break;
      }

      if (!isAuthenticated) {
        toast({
          title: "인증 실패",
          description: "Firebase 인증에 실패했습니다. 페이지를 새로고침하고 다시 시도해주세요.",
          variant: "destructive"
        });
        return;
      }
    }

    // 팀 모드에서 올바른 playerId 매핑
    let playerId: string | undefined;

    if (gameMode === 'team') {
      // 팀 모드에서는 renderColumns를 사용해서 올바른 팀의 playerId를 가져옴
      const teamColumnIndexes = renderColumns[playerIndex];
      if (teamColumnIndexes && teamColumnIndexes.length > 0) {
        const teamPrimaryIndex = teamColumnIndexes[0]; // 팀의 첫 번째 선수 인덱스
        const teamPrimaryName = playersInGroupJo[teamPrimaryIndex]?.id;
        playerId = teamPrimaryName;
      }
    } else {
      // 개인전에서는 기존 방식
      const displayName = playerNames[playerIndex];
      playerId = nameToPlayerId[displayName] || nameToPlayerId[(displayName || '').split('/')[0]];
    }

    if (!playerId) {
      toast({ title: "선수 식별 실패", description: `선수를 찾을 수 없습니다.`, variant: "destructive" });
      return;
    }

    // 모바일 환경 감지 및 Firebase 인증 재시도 로직
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const maxRetries = isMobile ? 5 : 3; // PC에서도 재시도 (3회)
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const dbInstance = db as any;
        const holeNum = holeIndex + 1;
        const scoreRef = ref(dbInstance, `/scores/${playerId}/${activeCourse.id}/${holeNum}`);

        // 팀 모드에서는 원본 매트릭스에서 대표 인덱스의 기존 값을 사용해야 올바른 oldValue가 기록됨
        const prev = (rawTableScores?.[playerIndex]?.[holeIndex] ?? 0) as number;

        // 재시도 시 대기 (모바일: 더 긴 대기, PC: 짧은 대기)
        if (attempt > 0) {
          const delay = isMobile ? 1500 * attempt : 1000 * attempt;
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        await set(scoreRef, score);
        await logScoreChange({
          matchId: "tournaments/current",
          playerId,
          scoreType: "holeScore",
          holeNumber: holeNum,
          oldValue: typeof prev === "number" ? prev : 0,
          newValue: score,
          modifiedBy: captainData?.id || `조장${captainData?.jo || ''}`,
          modifiedByType: "captain",
          comment: `자율 채점 - 코스: ${activeCourse.id}, 그룹: ${selectedGroup || ''}, 조: ${selectedJo || ''}`,
          courseId: String(activeCourse.id),
        });

        // 실시간 업데이트를 위한 로그 캐시 무효화
        invalidatePlayerLogCache(playerId);

        // 성공하면 루프 종료
        break;

      } catch (e: any) {
        attempt++;

        // Permission denied 오류이고 재시도 가능한 경우 (다양한 오류 형태 대응)
        const isPermissionError = e?.code === 'PERMISSION_DENIED' ||
          e?.message?.includes('permission_denied') ||
          e?.message?.includes('Permission denied') ||
          e?.message?.includes('auth') ||
          e?.message?.includes('authentication');

        if (isPermissionError && attempt < maxRetries) {
          // 인증 재시도
          console.log(`인증 오류 감지, 재인증 시도 중... (${attempt}/${maxRetries})`);
          const reAuthSuccess = await ensureAuthenticated(2, 500); // 최대 2회, 0.5초 간격

          if (reAuthSuccess) {
            // 재인증 성공 시 다시 저장 시도
            continue;
          }
        }

        // 네트워크 오류도 재시도
        const isNetworkError = e?.code === 'network-request-failed' ||
          e?.message?.includes('network') ||
          e?.message?.includes('timeout');

        if (isNetworkError && attempt < maxRetries) {
          continue;
        }

        // 최종 실패 또는 다른 오류
        const errorMsg = e?.code === 'PERMISSION_DENIED'
          ? '점수 저장 권한이 없습니다. 페이지를 새로고침하고 다시 로그인해주세요.'
          : (e?.message || "점수 저장에 실패했습니다.");

        toast({
          title: "저장 실패",
          description: errorMsg,
          variant: "destructive"
        });
        return;
      }
    }

    // 외부 전광판에 갱신 신호 전달 (선택 사항)
    try {
      if (typeof window !== 'undefined') {
        const holeNum = holeIndex + 1;
        const evt = new CustomEvent('scoreUpdated', { detail: { playerId, courseId: String(activeCourse.id), hole: holeNum, by: 'captain' } });
        window.dispatchEvent(evt);
      }
    } catch { }
  };

  // 일괄 저장 함수: 모든 입력된 점수를 한 번에 저장
  const handleBatchSave = async () => {
    // 중복 저장 방지
    if (isSaving) {
      toast({ title: '저장 중', description: '이미 저장 중입니다. 잠시만 기다려주세요.', variant: 'default' });
      return;
    }

    // 저장 시 수정 모드 셀 모두 제거
    editingCellsRef.current.clear();

    if (!db || !activeCourse) {
      toast({ title: '저장 실패', description: '코스를 선택해주세요.', variant: 'destructive' });
      return;
    }

    // Firebase 인증 확인 (재인증 시도 포함)
    let isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      // 재인증 시도 (최대 2회)
      for (let authRetry = 0; authRetry < 2; authRetry++) {
        console.log(`인증 재시도 중... (${authRetry + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (authRetry + 1)));
        isAuthenticated = await ensureAuthenticated();
        if (isAuthenticated) break;
      }

      if (!isAuthenticated) {
        toast({
          title: "인증 실패",
          description: "Firebase 인증에 실패했습니다. 페이지를 새로고침하고 다시 시도해주세요.",
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }
    }

    setIsSaving(true);
    toast({ title: '저장 중...', description: '점수를 저장하고 있습니다.', duration: 2000 });

    const maxPlayers = gameMode === 'team' ? 2 : 4;
    let savedCount = 0;
    let errorCount = 0;
    const savedCells: Array<{ pi: number; hi: number }> = [];
    // 변경된 점수 상세 정보 추적
    const changedScores: Array<{ playerName: string; hole: number; oldScore: number | null; newScore: number }> = [];


    try {
      // 모든 셀의 점수를 병렬로 저장 (빈 이름인 선수는 건너뛰기)
      const savePromises: Promise<void>[] = [];

      for (let pi = 0; pi < maxPlayers; pi++) {
        const playerName = renderNames[pi];
        // 빈 이름이면 건너뛰기
        if (!playerName || playerName.trim() === '' || playerName.startsWith('이름')) {
          continue;
        }

        for (let hi = 0; hi < 9; hi++) {
          const val = batchInputScores[pi]?.[hi] ?? draftScores[pi]?.[hi] ?? null;
          if (typeof val === 'number' && val > 0) {
            // 기존 점수 확인 (변경 여부 판단용)
            const oldScore = tableScores[pi]?.[hi] ?? null;
            const isChanged = oldScore !== val;

            savePromises.push(
              saveToFirebase(pi, hi, val)
                .then(() => {
                  savedCount++;
                  savedCells.push({ pi, hi });
                  // 저장 완료 시각적 피드백
                  flashSavedCell(pi, hi);

                  // 변경된 점수만 상세 정보에 추가
                  if (isChanged) {
                    changedScores.push({
                      playerName,
                      hole: hi + 1,
                      oldScore: typeof oldScore === 'number' ? oldScore : null,
                      newScore: val
                    });
                  }
                })
                .catch((error) => {
                  errorCount++;
                  console.error(`점수 저장 실패 (선수 ${pi}, 홀 ${hi + 1}):`, error);
                })
            );
          }
        }
      }

      // 모든 저장 작업을 병렬로 실행
      await Promise.all(savePromises);

      // 저장된 점수에 해당하는 batchInputScores를 초기화하여 저장된 점수로 표시되도록 함
      setBatchInputScores(prev => {
        const next = prev.map(row => [...row]);
        savedCells.forEach(({ pi, hi }) => {
          next[pi][hi] = null;
        });
        return next;
      });

      // 저장된 셀을 수정 모드에서 제거
      savedCells.forEach(({ pi, hi }) => {
        editingCellsRef.current.delete(`${pi}-${hi}`);
      });

      // 저장된 점수가 있는 홀은 자동으로 잠금
      const newLocks = [...holeLocks];
      const savedHoles = new Set(savedCells.map(({ hi }) => hi));

      // 저장된 셀이 있는 홀은 잠금 상태로 설정
      savedHoles.forEach(hi => {
        newLocks[hi] = true;
        // 수동 해제 목록에서도 제거하여 다시 자동 잠금이 유지되도록
        manuallyUnlockedHolesRef.current.delete(hi);
      });

      // 나머지 홀은 기존 로직대로 전체가 채워졌을 때만 잠금
      for (let hi = 0; hi < 9; hi++) {
        if (savedHoles.has(hi)) {
          continue; // 이미 처리된 홀은 건너뛰기
        }

        let allFilled = true;
        let hasAnyPlayer = false;

        for (let pi = 0; pi < maxPlayers; pi++) {
          const playerName = renderNames[pi];
          if (!playerName || playerName.trim() === '' || playerName.startsWith('이름')) {
            continue;
          }
          hasAnyPlayer = true;
          // 저장 후에는 tableScores를 확인
          const val = tableScores[pi]?.[hi];
          if (val === null || val === undefined) {
            allFilled = false;
            break;
          }
        }

        if (hasAnyPlayer && allFilled) {
          newLocks[hi] = true;
        }
      }
      setHoleLocks(newLocks);

      if (savedCount > 0) {
        toast({
          title: '저장 완료',
          description: `${savedCount}개의 점수가 저장되었습니다.${errorCount > 0 ? ` (${errorCount}개 실패)` : ''}`,
          duration: 1000
        });

        // 일괄 입력 이력 기록 (Firebase)
        try {
          const dbInstance = db as any;
          if (!selectedGroup || !selectedJo || !activeCourseId) {
            console.warn('이력 기록 중단: 필수 정보 부족', { selectedGroup, selectedJo, activeCourseId });
            return;
          }

          const historyPath = `batchScoringHistory/${selectedGroup}/${selectedJo}/${activeCourseId}`;
          const historyRef = ref(dbInstance, historyPath);

          const currentTimestamp = Date.now();
          const captainId = captainData?.id || `조장${selectedJo}`;

          // 기존 이력을 가져와서 새 이력 추가
          let snapshot;
          try {
            snapshot = await get(historyRef);
          } catch (readError: any) {
            console.error('이력 읽기 실패 (권한 문제일 수 있음):', readError);
            if (readError?.message?.includes('Permission denied')) {
              toast({
                title: '권한 오류',
                description: '이력을 기록할 권한이 없습니다. Firebase DB 규칙이 배포되었는지 확인해주세요.',
                variant: 'destructive'
              });
            }
            return;
          }

          const existingData = snapshot.val() || {};
          const existingHistory: BatchHistoryEntry[] = Array.isArray(existingData.history) ? existingData.history : [];

          // 새 이력 항목 결정 (기존 데이터가 있으면 'update', 없으면 'save')
          const actionType: 'save' | 'update' = existingData.lastModifiedBy ? 'update' : 'save';

          // 상세 정보 생성
          let detailsText = '';
          if (changedScores.length > 0) {
            // 변경된 점수가 있으면 상세히 표시
            const changeDetails = changedScores.map(c => {
              if (c.oldScore === null) {
                return `${c.playerName} ${c.hole}H: ${c.newScore}점 입력`;
              } else {
                return `${c.playerName} ${c.hole}H: ${c.oldScore}→${c.newScore}`;
              }
            }).join(', ');
            detailsText = changeDetails.length > 100 ? changeDetails.substring(0, 100) + '...' : changeDetails;
          } else {
            // 변경 없이 저장만 한 경우
            detailsText = `${savedCount}개 점수 저장`;
          }

          const newEntry: BatchHistoryEntry = {
            modifiedBy: captainId,
            modifiedAt: currentTimestamp,
            action: actionType,
            details: detailsText
          };

          // 이력 배열에 추가 (최신 순으로 정렬하기 위해 앞에 추가)
          const updatedHistory = [newEntry, ...existingHistory];

          // Firebase에 저장
          await set(historyRef, {
            lastModifiedBy: captainId,
            lastModifiedAt: currentTimestamp,
            action: actionType,
            history: updatedHistory
          });
        } catch (error) {
          console.error('이력 기록 실패:', error);
        }
      } else {
        toast({
          title: '저장할 점수 없음',
          description: '입력된 점수가 없습니다.',
          variant: 'destructive'
        });
      }
    } finally {
      setIsSaving(false);
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
          parsed.start = (parsed.start ?? courseStartHoles[activeCourseId] ?? groupStartHole);
          parsed.current = (parsed.current ?? courseCurrentHoles[activeCourseId] ?? groupCurrentHole);
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } catch { }
    }
    // 첫 저장이면 시작/현재홀 지정 (코스별로 관리)
    const newStartHole = groupStartHole === null ? targetHole : groupStartHole;
    const newCurrentHole = groupCurrentHole === null ? targetHole : groupCurrentHole;

    setGroupStartHole(newStartHole);
    setGroupCurrentHole(newCurrentHole);

    // 코스별 상태도 업데이트
    setCourseStartHoles(prev => ({
      ...prev,
      [activeCourseId]: newStartHole
    }));
    setCourseCurrentHoles(prev => ({
      ...prev,
      [activeCourseId]: newCurrentHole
    }));

    // 초안이 들어있는 모든 선수의 해당 홀 점수를 저장
    const maxPlayers = gameMode === 'team' ? 2 : 4; // 팀전은 2명, 개인전은 4명

    for (let pi = 0; pi < maxPlayers; pi++) {
      const val = draftScores?.[pi]?.[targetHole] ?? (pi === targetPlayer ? targetVal : null);

      if (typeof val === 'number') {
        // 팀전에서는 대표 선수(팀의 첫 번째 선수)에 대해서만 수정 여부 판단
        const displayCol = (gameMode === 'team') ? pi : pi; // 팀전에서는 pi가 그대로 displayCol
        const isTeamPrimary = true; // 실제 존재하는 선수들만 순회하므로 모두 primary

        await saveToFirebase(pi, targetHole, val);

        // 수정 표시 처리
        if (isTeamPrimary) {
          const prevVal = tableScores?.[displayCol]?.[targetHole];
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
        }
        flashSavedCell(pi, targetHole);
      }
    }

    // 화면 반영 및 초안 제거
    setScoresByCourse(prev => {
      const next = { ...prev } as Record<string, (number | null)[][]>;
      const mat = next[activeCourseId] ? next[activeCourseId].map(r => [...r]) : Array.from({ length: 4 }, () => Array(9).fill(null));
      for (let pi = 0; pi < maxPlayers; pi++) {
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
        for (let pi = 0; pi < maxPlayers; pi++) parsed.draft[pi][targetHole] = null;
        parsed.start = (courseStartHoles[activeCourseId] ?? groupStartHole ?? targetHole);
        parsed.current = (courseCurrentHoles[activeCourseId] ?? groupCurrentHole ?? targetHole);
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch { }
    setDraftScores(prev => {
      const next = prev.map(row => [...row]);
      for (let pi = 0; pi < maxPlayers; pi++) next[pi][targetHole] = null;
      return next;
    });
    handleCancelPad();
    setEditingCell(null);
  };

  // (사용 안 함) 전체 저장 함수는 제거했습니다

  // 일괄 입력 모드: batchInputScores를 기준으로 합계 계산 (수기채점표와 동일하게 검산 가능)
  const playerTotals = useMemo(() => {
    // batchInputScores를 우선 사용, 없으면 tableScores 사용
    const scoresToUse = batchInputScores.some(row => row.some(v => v !== null))
      ? batchInputScores
      : tableScores;

    return scoresToUse.map((row, playerIdx) => {
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
  }, [batchInputScores, tableScores, activePars]);

  // 홀별 잠금 상태 계산: 해당 홀의 모든 선수 점수가 입력되었는지 확인
  useEffect(() => {
    const newLocks = Array(9).fill(false);
    const maxPlayers = gameMode === 'team' ? 2 : 4;

    for (let hi = 0; hi < 9; hi++) {
      // 수동으로 해제된 홀은 다시 잠그지 않음
      if (manuallyUnlockedHolesRef.current.has(hi)) {
        newLocks[hi] = false;
        continue;
      }

      // 해당 홀의 모든 선수 점수가 입력되었는지 확인
      let allFilled = true;
      let hasAnyPlayer = false;

      for (let pi = 0; pi < maxPlayers; pi++) {
        const playerName = playerNames[pi];
        // 빈 이름이면 건너뛰기
        if (!playerName || playerName.trim() === '' || playerName.startsWith('이름')) {
          continue;
        }
        hasAnyPlayer = true;
        const val = batchInputScores[pi]?.[hi] ?? tableScores[pi]?.[hi];
        if (val === null || val === undefined) {
          allFilled = false;
          break;
        }
      }
      // 선수가 하나도 없으면 잠금하지 않음
      newLocks[hi] = hasAnyPlayer && allFilled;
    }

    // 이전 값과 비교하여 변경된 경우에만 업데이트
    setHoleLocks(prev => {
      const hasChanged = prev.some((lock, idx) => lock !== newLocks[idx]);
      return hasChanged ? newLocks : prev;
    });
  }, [batchInputScores, tableScores, playerNames, gameMode]);

  // 일괄 입력 모드: 홀별 잠금 상태 확인
  function getCellState(playerIndex: number, holeIndex: number): 'locked' | 'active' | 'disabled' {
    // 해당 홀이 잠겨있으면 잠금 상태
    if (holeLocks[holeIndex]) {
      return 'locked';
    }
    // 빈 이름이면 비활성화
    const playerName = renderNames[playerIndex];
    if (!playerName || playerName.trim() === '' || playerName.startsWith('이름')) {
      return 'disabled';
    }
    return 'active';
  }

  // 순환 관련 유틸 사용 안 함 (간소화 모드)

  // 코스 테마 클래스: 코스 이름에 포함된 A, B, C, D로 색상 결정
  // A코스=빨강, B코스=파랑, C코스=노랑, D코스=하양, E코스=빨강, F코스=파랑... (4개마다 반복)
  // 만약 코스 이름에 A, B, C, D가 없으면 대회 및 코스 관리의 순서로 fallback
  const themeClass = useMemo(() => {
    const activeCourse = courseTabs.find((c) => String(c.id) === String(activeCourseId));
    if (!activeCourse) return 'theme-red';

    // 코스 이름에서 A, B, C, D 등을 추출
    const courseName = activeCourse.name || '';
    // 알파벳 대문자 찾기 (A-Z)
    const alphabetMatch = courseName.match(/[A-Z]/);

    if (alphabetMatch) {
      // 알파벳을 숫자로 변환 (A=0, B=1, C=2, D=3, E=4, F=5...)
      const alphabetIndex = alphabetMatch[0].charCodeAt(0) - 'A'.charCodeAt(0);
      // 4개마다 반복 (A=0→빨강, B=1→파랑, C=2→노랑, D=3→하양, E=4→빨강...)
      const cycle = alphabetIndex % 4;
      return cycle === 0 ? 'theme-red' : cycle === 1 ? 'theme-blue' : cycle === 2 ? 'theme-yellow' : 'theme-white';
    } else {
      // 코스 이름에 A, B, C, D가 없으면 대회 및 코스 관리의 순서로 fallback
      const courseOrder = activeCourse.originalOrder ?? (courseTabs.findIndex((c) => String(c.id) === String(activeCourseId)) + 1);
      const cycle = ((courseOrder - 1) % 4);
      return cycle === 0 ? 'theme-red' : cycle === 1 ? 'theme-blue' : cycle === 2 ? 'theme-yellow' : 'theme-white';
    }
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
    } catch { }
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
    } catch { }
  }, [localClearedKey, activeCourseId]);

  // 로그 초기화 기준 시각 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const ts = localStorage.getItem(logsResetKey);
      setLogsResetAfter(ts ? Number(ts) : null);
    } catch { }
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
        } catch { }
      }
      prevDbHasAnyScoreRef.current = dbHasAnyScore;
    } catch { }
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

  // 일괄 입력 모드에서는 공유 기능 제거 (주석 처리)
  const handleShareScores = async () => {
    if (!navigator.share) {
      toast({
        title: '공유 불가',
        description: '이 브라우저에서는 공유 기능을 지원하지 않습니다.',
        variant: 'destructive'
      });
      return;
    }

    try {
      toast({ title: '공유 준비 중...', description: '점수표를 생성하고 있습니다.' });

      const shareImages: File[] = [];
      const currentDate = new Date().toLocaleDateString('ko-KR');
      const originalActiveCourse = activeCourseId;

      // 각 코스별로 캡처
      for (const course of courseTabs) {
        try {
          // 코스 전환
          setActiveCourseId(String(course.id));

          // 상태 변경이 완료될 때까지 대기
          await new Promise(resolve => setTimeout(resolve, 300));

          // 현재 코스의 점수 데이터 가져오기
          const currentScores = scoresByCourse[course.id] || Array.from({ length: 4 }, () => Array(9).fill(null));
          const coursePars = course.pars || [3, 4, 4, 4, 4, 3, 5, 3, 3];

          // 팀 모드 고려한 표시용 점수
          let displayScores = currentScores;
          let displayNames = playerNames;

          if (gameMode === 'team') {
            displayScores = renderColumns.map(idxs => {
              const primary = idxs[0];
              return currentScores[primary] || Array(9).fill(null);
            });
            displayNames = renderColumns.map(idxs =>
              idxs.map(i => playerNames[i] || '').filter(Boolean).join('/')
            );
          }

          // Canvas로 직접 점수표 그리기 (모바일 최적화)
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          // 모바일 화면을 가득 채우는 세로형 캔버스
          canvas.width = 600;
          canvas.height = 1200; // 더 길게 늘림

          // 배경 색상
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // 2025년 스타일 그라데이션 배경
          const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
          gradient.addColorStop(0, '#f8fafc');
          gradient.addColorStop(1, '#e2e8f0');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // 상단 헤더 영역 그라데이션 (더 크게)
          const headerGradient = ctx.createLinearGradient(0, 0, 0, 140);
          headerGradient.addColorStop(0, '#1e293b');
          headerGradient.addColorStop(1, '#334155');
          ctx.fillStyle = headerGradient;
          ctx.fillRect(0, 0, canvas.width, 140);

          // 제목 그리기 (훨씬 크게)
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 48px Arial, sans-serif';
          ctx.textAlign = 'center';
          const title = `${selectedGroup} ${course.name}`;
          ctx.fillText(title, canvas.width / 2, 65);

          // 날짜 그리기 (크게)
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '28px Arial, sans-serif';
          ctx.fillText(currentDate, canvas.width / 2, 110);

          // 테이블 시작 위치 (헤더 아래 여백)
          const tableStartY = 180;
          const baseCellWidth = Math.floor((canvas.width - 40) / (displayNames.length + 2));
          const holeCellWidth = Math.floor(baseCellWidth * 2 / 3); // 홀/파 칸 너비 (2/3로 축소)
          const playerCellWidth = Math.floor((canvas.width - 40 - holeCellWidth * 2) / displayNames.length); // 나머지 공간을 플레이어 칸이 나눠가짐
          const cellHeight = 84; // 점수칸 높이 증가
          const headerHeight = 76; // 헤더 높이 유지

          // 테이블 그림자 효과
          ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;

          const startX = 20;
          const tableWidth = holeCellWidth * 2 + playerCellWidth * displayNames.length;

          // 테이블 전체 배경 (둥근 모서리 효과)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(startX - 5, tableStartY - 5, tableWidth + 10, headerHeight + (9 * cellHeight) + cellHeight + 10);

          // 그림자 효과 제거
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          // 헤더 배경 - 홀/파는 기존 그라데이션
          const tableHeaderGradient = ctx.createLinearGradient(0, tableStartY, 0, tableStartY + headerHeight);
          tableHeaderGradient.addColorStop(0, '#3b82f6');
          tableHeaderGradient.addColorStop(1, '#1d4ed8');
          ctx.fillStyle = tableHeaderGradient;
          ctx.fillRect(startX, tableStartY, holeCellWidth * 2, headerHeight); // 홀/파 부분만

          // 플레이어별 점수 확인 후 헤더 배경 설정
          displayScores.forEach((playerScores, playerIdx) => {
            const x = startX + holeCellWidth * 2 + playerIdx * playerCellWidth;
            let hasAnyScore = playerScores.some(score => typeof score === 'number');

            if (hasAnyScore) {
              // 점수가 있는 플레이어는 블루 배경
              ctx.fillStyle = '#6387F2';
            } else {
              // 점수가 없는 플레이어는 회색 배경
              ctx.fillStyle = '#F2F2F2';
            }
            ctx.fillRect(x, tableStartY, playerCellWidth, headerHeight);
          });

          // 헤더 테두리 (통일된 색상)
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 2;
          ctx.strokeRect(startX, tableStartY, tableWidth, headerHeight);

          // 헤더 텍스트 (큰 글씨로)
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 26px Arial, sans-serif';
          ctx.textAlign = 'center';

          // "홀" 헤더
          ctx.fillText('홀', startX + holeCellWidth / 2, tableStartY + headerHeight / 2 + 10);
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.strokeRect(startX, tableStartY, holeCellWidth, headerHeight);

          // "파" 헤더
          ctx.fillText('파', startX + holeCellWidth + holeCellWidth / 2, tableStartY + headerHeight / 2 + 10);
          ctx.strokeRect(startX + holeCellWidth, tableStartY, holeCellWidth, headerHeight);

          // 플레이어 이름 헤더
          displayNames.forEach((name, i) => {
            const x = startX + holeCellWidth * 2 + i * playerCellWidth;
            const displayName = name.length > 10 ? name.substring(0, 8) + '..' : name; // 더 긴 이름 허용

            // 점수 유무에 따라 텍스트 색상 결정
            let hasAnyScore = displayScores[i].some(score => typeof score === 'number');

            if (hasAnyScore) {
              ctx.fillStyle = '#ffffff'; // 점수가 있으면 흰색 텍스트
            } else {
              ctx.fillStyle = '#0D0D0D'; // 점수가 없으면 검정 텍스트
            }

            ctx.font = 'bold 24px Arial, sans-serif'; // 이름 크기 조정
            ctx.fillText(displayName, x + playerCellWidth / 2, tableStartY + headerHeight / 2 + 10);
            ctx.strokeStyle = '#cbd5e1';
            ctx.strokeRect(x, tableStartY, playerCellWidth, headerHeight);
          });

          // 각 홀별 데이터 그리기
          for (let hole = 0; hole < 9; hole++) {
            const y = tableStartY + headerHeight + (hole * cellHeight);
            const isEvenRow = hole % 2 === 0;

            // 교대로 행 배경색 (zebra striping)
            if (isEvenRow) {
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(startX, y, tableWidth, cellHeight);
            }

            // 홀 번호 배경
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(startX, y, holeCellWidth, cellHeight);

            // 홀 번호 텍스트 (크게)
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 28px Arial, sans-serif';
            ctx.fillText(String(hole + 1), startX + holeCellWidth / 2, y + cellHeight / 2 + 10);
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1;
            ctx.strokeRect(startX, y, holeCellWidth, cellHeight);

            // 파 수 배경
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(startX + holeCellWidth, y, holeCellWidth, cellHeight);

            // 파 수 텍스트 (크게)
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 28px Arial, sans-serif';
            ctx.fillText(String(coursePars[hole]), startX + holeCellWidth + holeCellWidth / 2, y + cellHeight / 2 + 10);
            ctx.strokeRect(startX + holeCellWidth, y, holeCellWidth, cellHeight);

            // 각 플레이어 점수
            displayScores.forEach((playerScores, playerIdx) => {
              const x = startX + holeCellWidth * 2 + playerIdx * playerCellWidth;
              const score = playerScores[hole];

              if (typeof score === 'number') {
                const par = coursePars[hole];
                const diff = score - par;

                // 점수에 따른 배경색과 텍스트 색상
                if (diff < 0) {
                  // 버디 이하 - 흰색 배경
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(x + 1, y + 1, playerCellWidth - 2, cellHeight - 2);
                  ctx.fillStyle = '#1d4ed8'; // 블루 텍스트
                } else if (diff === 0) {
                  // 파 - 흰색 배경
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(x + 1, y + 1, playerCellWidth - 2, cellHeight - 2);
                  ctx.fillStyle = '#111827'; // 검정 텍스트
                } else {
                  // 보기 이상 - 흰색 배경
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(x + 1, y + 1, playerCellWidth - 2, cellHeight - 2);
                  ctx.fillStyle = '#dc2626'; // 빨강 텍스트
                }

                ctx.font = 'bold 38px Arial, sans-serif'; // 점수 글자 크기 증가
                ctx.fillText(String(score), x + playerCellWidth / 2, y + cellHeight / 2 + 14);
              } else {
                // 점수가 없는 경우 회색으로 빈 셀 표시
                ctx.fillStyle = '#f1f5f9';
                ctx.fillRect(x + 1, y + 1, playerCellWidth - 2, cellHeight - 2);
              }

              ctx.strokeStyle = '#cbd5e1';
              ctx.strokeRect(x, y, playerCellWidth, cellHeight);
            });
          }

          // 합계 행 - 깔끔한 단색 적용
          const totalY = tableStartY + headerHeight + (9 * cellHeight);
          const totalCellHeight = 86; // 합계 셀 높이 증가

          // 합계 라벨 배경 (빨강)
          ctx.fillStyle = '#F23054';
          ctx.fillRect(startX, totalY, holeCellWidth * 2, totalCellHeight);

          // 합계 라벨 텍스트 (크게)
          ctx.fillStyle = '#ffffff'; // 흰색
          ctx.font = 'bold 32px Arial, sans-serif';
          ctx.fillText('합계', startX + holeCellWidth, totalY + totalCellHeight / 2 + 12);

          // 합계 라벨 테두리 (통일된 색상)
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.strokeRect(startX, totalY, holeCellWidth * 2, totalCellHeight);

          // 각 플레이어 합계
          displayScores.forEach((playerScores, playerIdx) => {
            const x = startX + holeCellWidth * 2 + playerIdx * playerCellWidth;
            let total = 0;
            let validScores = 0;

            playerScores.forEach(score => {
              if (typeof score === 'number') {
                total += score;
                validScores++;
              }
            });

            if (validScores > 0) {
              // 합계 셀 배경 (연한 빨강으로 변경)
              ctx.fillStyle = '#fee2e2';
              ctx.fillRect(x + 1, totalY + 1, playerCellWidth - 2, totalCellHeight - 2);

              // 합계 텍스트 (가장 크게)
              ctx.fillStyle = '#0D0D0D'; // 진한 검정
              ctx.font = 'bold 42px Arial, sans-serif';
              ctx.fillText(String(total), x + playerCellWidth / 2, totalY + totalCellHeight / 2 + 16);
            } else {
              // 점수가 없는 경우 연한 회색 배경
              ctx.fillStyle = '#F2F2F2';
              ctx.fillRect(x + 1, totalY + 1, playerCellWidth - 2, totalCellHeight - 2);
            }

            // 합계 셀 테두리 (통일된 색상)
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, totalY, playerCellWidth, totalCellHeight);
          });

          // 점수 색상 설명 추가 (원래 배경에 바로 표시)
          const legendY = totalY + totalCellHeight + 40; // 합계 아래 40px 여백

          // 설명 내용 (배경 없이 바로 표시)
          ctx.font = 'bold 18px Arial, sans-serif';
          ctx.textAlign = 'left';

          const legendStartX = startX + 20;
          const legendTextY = legendY + 20; // 적절한 위치에 배치

          // 오버파 (빨간색)
          ctx.fillStyle = '#dc2626';
          ctx.fillText('오버파(+): 빨간색', legendStartX, legendTextY);

          // 이븐파 (검정색)
          ctx.fillStyle = '#111827';
          ctx.fillText('이븐파(E): 검정색', legendStartX + 180, legendTextY);

          // 언더파 (파란색)
          ctx.fillStyle = '#1d4ed8';
          ctx.fillText('언더파(-): 파란색', legendStartX + 360, legendTextY);

          // 캔버스를 Blob으로 변환
          await new Promise<void>((resolve) => {
            canvas.toBlob((blob) => {
              if (blob) {
                const file = new File([blob], `${selectedGroup}_${course.name}_${currentDate}.png`, {
                  type: 'image/png'
                });
                shareImages.push(file);
              }
              resolve();
            }, 'image/png', 0.9);
          });

        } catch (error) {
          console.error(`코스 ${course.name} 캡처 실패:`, error);
        }
      }

      // 원래 활성 코스로 복원
      setActiveCourseId(originalActiveCourse);

      if (shareImages.length === 0) {
        toast({
          title: '캡처 실패',
          description: '점수표 생성에 실패했습니다.',
          variant: 'destructive'
        });
        return;
      }

      // Web Share API로 공유
      await navigator.share({
        title: `${selectedGroup} 점수표`,
        text: `${selectedGroup} 점수표 - ${currentDate}`,
        files: shareImages
      });

      toast({ title: '공유 완료', description: '점수표가 공유되었습니다.' });

    } catch (error) {
      console.error('공유 오류:', error);
      toast({
        title: '공유 실패',
        description: '공유 중 오류가 발생했습니다.',
        variant: 'destructive'
      });
    }
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
              onClick={() => {
                setActiveCourseId(String(c.id));
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('selfScoringActiveCourseId', String(c.id));
                }
              }}
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
                    const committedVal = tableScores[pi]?.[hi];
                    const draftVal = draftScores?.[pi]?.[hi] ?? null;
                    const batchVal = batchInputScores[pi]?.[hi] ?? null;
                    // 수정 중인 셀인지 확인
                    const isEditing = editingCellsRef.current.has(`${pi}-${hi}`);
                    // 일괄 입력 모드: batchInputScores 우선, 없으면 draftScores
                    // 수정 중인 셀이면 committedVal을 무시하고 빈 값으로 표시
                    const val = isEditing && batchVal === null && draftVal === null
                      ? null
                      : (batchVal ?? (typeof draftVal === 'number' ? draftVal : (typeof committedVal === 'number' ? committedVal : null)));
                    const cellState = getCellState(pi, hi);
                    const isLocked = cellState === 'locked';
                    const isDisabled = cellState === 'disabled';
                    // 저장된 점수인지 확인 (committedVal이 있고 batchVal이 없을 때, 또는 locked 상태일 때)
                    const isSaved = (typeof committedVal === 'number' && batchVal === null && draftVal === null) ||
                      (typeof committedVal === 'number' && isLocked);
                    const playerName = renderNames[pi];
                    const isEmptyName = !playerName || playerName.trim() === '' || playerName.startsWith('이름');

                    const handleDoubleClickUnlock = (e: React.MouseEvent | React.TouchEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('더블클릭 감지', { pi, hi, isLocked, isSaved, isDisabled, isReadOnlyMode });
                      // 더블클릭 시 해당 셀만 잠금 해제하여 수정 가능하게 함
                      if (isReadOnlyMode) return; // 관전 모드에서는 수정 불가
                      if (isDisabled) return; // 비활성화된 셀은 수정 불가

                      if (isLocked && isSaved) {
                        console.log('잠금 해제 시작', { pi, hi });
                        // 해당 셀의 batchInputScores를 완전히 초기화하여 점수가 없는 상태로 만듦
                        setBatchInputScores(prev => {
                          const next = prev.map(row => [...row]);
                          next[pi][hi] = null;
                          return next;
                        });
                        // draftScores도 초기화하여 점수가 없는 상태로 만듦
                        setDraftScores(prev => {
                          const next = prev.map(row => [...row]);
                          next[pi][hi] = null;
                          return next;
                        });
                        // 해당 셀만 잠금 해제 (홀 전체가 아닌)
                        // 해당 셀의 잠금을 해제하기 위해 홀 잠금을 일시적으로 해제
                        setHoleLocks(prev => {
                          const next = [...prev];
                          next[hi] = false;
                          return next;
                        });
                        // 수동으로 해제된 홀로 표시하여 다시 자동 잠금되지 않도록
                        manuallyUnlockedHolesRef.current.add(hi);
                        // 수정 중인 셀로 표시하여 자동 커서 이동 방지
                        editingCellsRef.current.add(`${pi}-${hi}`);

                        // input 요소에 포커스를 주고 값을 선택하여 바로 입력 가능하게 함
                        setTimeout(() => {
                          const input = document.querySelector(
                            `input[data-player-index="${pi}"][data-hole-index="${hi}"]`
                          ) as HTMLInputElement;
                          if (input) {
                            input.focus();
                            input.select();
                            // input의 value를 강제로 빈 문자열로 설정
                            input.value = '';
                            // React state와 동기화를 위해 change 이벤트 발생
                            const event = new Event('input', { bubbles: true });
                            input.dispatchEvent(event);
                          }
                        }, 50);

                        console.log('잠금 해제 완료', { pi, hi });
                      }
                    };

                    return (
                      <td
                        key={pi}
                        style={{ position: 'relative', padding: '4px 8px', verticalAlign: 'middle', pointerEvents: 'auto', cursor: (isLocked && isSaved) ? 'pointer' : 'default' }}
                        onDoubleClick={(e) => {
                          console.log('td 더블클릭', { pi, hi, isLocked, isSaved });
                          handleDoubleClickUnlock(e);
                        }}
                        onClick={(e) => {
                          // 저장된 점수일 때는 클릭도 더블클릭처럼 동작하도록 (모바일 대응)
                          if (isLocked && isSaved && !isReadOnlyMode && !isDisabled) {
                            const now = Date.now();
                            const lastClick = (e.currentTarget as any).lastClick || 0;
                            const timeDiff = now - lastClick;
                            if (timeDiff < 500 && timeDiff > 0) {
                              // 더블클릭으로 간주
                              handleDoubleClickUnlock(e);
                            }
                            (e.currentTarget as any).lastClick = now;
                          }
                        }}
                      >
                        <div
                          className="score-input-container"
                          style={{ position: 'relative', pointerEvents: 'auto' }}
                          onDoubleClick={(e) => {
                            console.log('div 더블클릭', { pi, hi, isLocked, isSaved });
                            handleDoubleClickUnlock(e);
                          }}
                        >
                          {isSaved && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{
                                position: 'absolute',
                                right: '2px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: '#9ca3af',
                                zIndex: 2,
                                pointerEvents: 'none'
                              }}
                            >
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                          )}
                          <input
                            data-player-index={pi}
                            data-hole-index={hi}
                            type="number"
                            min="1"
                            max="20"
                            value={val ?? ''}
                            disabled={isReadOnlyMode || isDisabled}
                            readOnly={isLocked && isSaved && batchInputScores[pi]?.[hi] === null}
                            onDoubleClick={(e) => {
                              console.log('input 더블클릭', { pi, hi, isLocked, isSaved });
                              handleDoubleClickUnlock(e);
                            }}
                            className={[
                              'score-input',
                              isReadOnlyMode ? 'readonly' : '',
                              isLocked ? 'locked' : '',
                              isDisabled ? 'disabled' : '',
                              typeof val === 'number' ? 'has-value' : '',
                              isSaved ? 'saved' : '',
                              (savedFlashMap[activeCourseId]?.[pi]?.[hi] ? 'saved-flash' : '')
                            ].filter(Boolean).join(' ')}
                            data-saved={isSaved ? 'true' : 'false'}
                            style={{
                              fontSize: '32px',
                              fontWeight: '900',
                              padding: '0',
                              border: 'none',
                              background: 'transparent',
                              textAlign: 'center',
                              lineHeight: '1.1',
                              ...(isSaved ? {
                                color: '#a8aaac',
                                WebkitTextFillColor: '#a8aaac',
                                caretColor: 'transparent'
                              } : {
                                color: '#000000'
                              })
                            }}
                            onChange={(e) => {
                              const newVal = e.target.value === '' ? null : Number(e.target.value);
                              const cellKey = `${pi}-${hi}`;
                              const isEditing = editingCellsRef.current.has(cellKey);

                              setBatchInputScores(prev => {
                                const next = prev.map(row => [...row]);
                                next[pi][hi] = newVal;
                                return next;
                              });
                              // draftScores에도 동시에 반영
                              setDraftScores(prev => {
                                const next = prev.map(row => [...row]);
                                next[pi][hi] = newVal;
                                return next;
                              });

                              // 수정 중인 셀이면 자동 커서 이동하지 않음
                              if (isEditing) {
                                return;
                              }

                              // 유효한 점수 입력 시 자동으로 다음 칸으로 이동 (옆으로: 같은 홀의 다음 선수)
                              if (newVal !== null && newVal >= 1 && newVal <= 20) {
                                setTimeout(() => {
                                  // 다음 칸 찾기: 같은 홀의 다음 선수, 없으면 다음 홀의 첫 선수
                                  let nextPi = pi + 1;
                                  let nextHi = hi;

                                  // 빈 이름인 선수는 건너뛰기
                                  while (nextPi < renderColumns.length) {
                                    const nextPlayerName = renderNames[nextPi];
                                    if (nextPlayerName && nextPlayerName.trim() !== '' && !nextPlayerName.startsWith('이름')) {
                                      break;
                                    }
                                    nextPi++;
                                  }

                                  if (nextPi >= renderColumns.length) {
                                    // 현재 홀의 모든 선수 점수를 입력했으면 다음 홀의 첫 선수로
                                    nextHi = hi + 1;
                                    nextPi = 0;

                                    // 빈 이름인 선수는 건너뛰기
                                    while (nextPi < renderColumns.length) {
                                      const nextPlayerName = renderNames[nextPi];
                                      if (nextPlayerName && nextPlayerName.trim() !== '' && !nextPlayerName.startsWith('이름')) {
                                        break;
                                      }
                                      nextPi++;
                                    }

                                    if (nextHi >= 9) {
                                      // 모든 홀을 입력했으면 더 이상 이동하지 않음
                                      return;
                                    }
                                  }

                                  // 다음 input 필드로 포커스 이동
                                  if (nextPi < renderColumns.length && nextHi < 9) {
                                    const nextInput = document.querySelector(
                                      `input[data-player-index="${nextPi}"][data-hole-index="${nextHi}"]`
                                    ) as HTMLInputElement;
                                    if (nextInput && !nextInput.disabled) {
                                      nextInput.focus();
                                      nextInput.select();
                                    }
                                  }
                                }, 50);
                              }
                            }}
                          />
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
                    <div className="score-input-container">
                      <span>{t.sum ?? ''}</span>
                    </div>
                  </td>
                ))}
              </tr>
              {/* 일괄 입력 모드에서는 서명 행 제거 */}
            </tbody>
          </table>
        </div>

        {/* 일괄 입력 이력 표시 - 점수표 바로 아래로 이동 */}
        <div className="batch-history-container">
          {lastInputInfo && (
            <div className="last-input-info">
              <div className="last-input-main">
                <span className="input-label">최종 {lastInputInfo.action === 'reset' ? '초기화' : '입력'}:</span>
                <span className="input-captain">{lastInputInfo.lastModifiedBy}</span>
                <span className="input-time">
                  {new Date(lastInputInfo.lastModifiedAt).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              {actionHistory.length > 0 && (
                <button
                  className="history-expand-button"
                  onClick={() => setHistoryModalOpen(true)}
                >
                  상세 이력 {historyModalOpen ? '접기' : '보기'} ({actionHistory.length})
                </button>
              )}
            </div>
          )}

          {/* 최근 이력 3개 직접 표시 */}
          {actionHistory.length > 0 && (
            <div className="recent-history-list">
              {actionHistory.slice(0, 3).map((entry, index) => (
                <div key={index} className="recent-history-item">
                  <span className="recent-time">
                    {new Date(entry.modifiedAt).toLocaleString('ko-KR', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  <span className="recent-captain">{entry.modifiedBy}</span>
                  <span className={`recent-action ${entry.action}`}>
                    {entry.action === 'reset' ? '초기화' : entry.action === 'update' ? '수정' : '저장'}
                  </span>
                  <span className="recent-details">{entry.details}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="action-buttons">
          <button className="action-button reset-button" onClick={async () => {
            // 일괄 입력 모드에서는 서명 체크 제거
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
            // batchInputScores도 초기화
            setBatchInputScores(Array.from({ length: 4 }, () => Array(9).fill(null)));
            setGroupStartHole(null);
            setGroupCurrentHole(null);

            // 코스별 상태도 초기화
            setCourseStartHoles(prev => ({
              ...prev,
              [activeCourseId]: null
            }));
            setCourseCurrentHoles(prev => ({
              ...prev,
              [activeCourseId]: null
            }));
            // 일괄 입력 모드에서는 서명 초기화 제거

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

              // 일괄 입력 모드에서는 서명 데이터 제거 생략
            } catch { }

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
            } catch { }

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
            } catch { }

            toast({ title: '초기화 완료', description: `${activeCourse?.name || '현재 코스'}가 초기화되었습니다.` });

            // 일괄 입력 이력 삭제 (사용자 요청: 초기화 시 이력도 삭제)
            try {
              if (!db) return;
              const dbInstance = db as any;
              const historyPath = `batchScoringHistory/${selectedGroup}/${selectedJo}/${activeCourseId}`;
              const historyRef = ref(dbInstance, historyPath);
              await set(historyRef, null);
            } catch (error) {
              console.error('이력 삭제 실패:', error);
            }
          }} disabled={isReadOnlyMode}>초기화</button>
          <button className="action-button qr-button" onClick={handleBatchSave} disabled={isReadOnlyMode || isSaving}>
            {isSaving ? '저장 중...' : '일괄 저장'}
          </button>
        </div>

      </div>

      {/* 이력 모달 */}
      <AlertDialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <AlertDialogContent className="history-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {activeCourse?.name || '코스'} 입력 이력
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="history-list">
                {actionHistory.length === 0 ? (
                  <div className="history-empty">이력이 없습니다.</div>
                ) : (
                  actionHistory.map((entry, index) => (
                    <div key={index} className="history-item">
                      <div className="history-header">
                        <span className="history-action">
                          {entry.action === 'reset' ? '🔄 초기화' : entry.action === 'update' ? '✏️ 수정' : '💾 저장'}
                        </span>
                        <span className="history-time">
                          {new Date(entry.modifiedAt).toLocaleString('ko-KR', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <div className="history-details">
                        <span className="history-captain">{entry.modifiedBy}</span>
                        {entry.details && <span className="history-desc"> · {entry.details}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setHistoryModalOpen(false)}>
              닫기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 일괄 입력 모드에서는 숫자패드 및 서명 모달 제거 */}
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
                  // 새 창으로 열린 경우 창을 닫기 시도
                  // window.close()는 JavaScript에서 직접 열린 창만 닫을 수 있음
                  // 모바일 브라우저에서도 새 창으로 열린 경우 일반적으로 작동함
                  window.close();

                  // 창이 닫히지 않을 수 있는 경우를 대비해 fallback 로직
                  // (예: 직접 URL로 접근한 경우, 브라우저 보안 정책으로 인해 닫히지 않는 경우)
                  setTimeout(() => {
                    // 창이 아직 열려있으면 (window.close()가 실패한 경우) 기존 로직 실행
                    // document.hidden은 창이 숨겨졌는지 확인하는 속성
                    // 하지만 더 확실한 방법은 window 객체가 여전히 존재하는지 확인
                    try {
                      // window 객체에 접근할 수 있으면 창이 아직 열려있는 것
                      if (window && !window.closed) {
                        if (window.history.length > 2) {
                          window.history.go(-2);
                        } else {
                          window.location.href = '/self-scoring';
                        }
                      }
                    } catch (e) {
                      // window 객체에 접근할 수 없으면 창이 닫힌 것
                    }
                  }, 200);
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
