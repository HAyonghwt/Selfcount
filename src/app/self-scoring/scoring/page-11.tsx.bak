"use client"

import React, { useState, useEffect, useRef } from 'react';
import './styles.css';
import { db } from '@/lib/firebase';
import { ref, onValue, set, get } from 'firebase/database';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface Player {
  id: string;
    name: string;
    affiliation: string;
  jo: number;
}

interface Course {
    id: string;
    name: string;
    pars: number[];
}

export default function SelfScoringPage() {
  const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [players, setPlayers] = useState<Player[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [scores, setScores] = useState<any>({});
    const [firebaseScores, setFirebaseScores] = useState<any>({});
    const [currentCourse, setCurrentCourse] = useState<string>('');
    const [captainEmail, setCaptainEmail] = useState('');
    const [gameMode, setGameMode] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [selectedJo, setSelectedJo] = useState('');
    const [firstInputHole, setFirstInputHole] = useState<number | null>(null);
    const [playerStates, setPlayerStates] = useState<(number | null)[]>([]);
    const [selectedInput, setSelectedInput] = useState<HTMLInputElement | null>(null);
    const [showNumberPad, setShowNumberPad] = useState(false);
    const [numberPadPosition, setNumberPadPosition] = useState<'top' | 'bottom'>('bottom');
    const [scoreLogs, setScoreLogs] = useState<any>({});
    const [playerNames, setPlayerNames] = useState<string[]>(['이름1', '이름2', '이름3', '이름4']);
    
    // 싸인 모달 관련 상태
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [currentSignaturePlayer, setCurrentSignaturePlayer] = useState<number>(-1);
    const [signatures, setSignatures] = useState<string[]>(['', '', '', '']);
    const signatureCanvasRef = useRef<HTMLCanvasElement>(null);

    // 테마 색상 배열 (빨강, 파랑, 노랑, 아이보리)
    const themeColors = ['#dc2626', '#2563eb', '#fbbf24', '#f5f5dc'];

    useEffect(() => {
        // 로그인 상태 확인
        const loggedInCaptain = sessionStorage.getItem('selfScoringCaptain');
        const gameMode = sessionStorage.getItem('selfScoringGameMode');
        const group = sessionStorage.getItem('selfScoringGroup');
        const jo = sessionStorage.getItem('selfScoringJo');

        if (!loggedInCaptain || !gameMode || !group || !jo) {
            router.push('/self-scoring');
            return;
        }

        setCaptainEmail(loggedInCaptain);
        setGameMode(gameMode);
        setSelectedGroup(group);
        setSelectedJo(jo);

        if (!db) return;

        // 대회 데이터 로드
        const tournamentRef = ref(db, 'tournaments/current');
        const scoresRef = ref(db, 'scores');

        const unsubTournament = onValue(tournamentRef, (snapshot) => {
            const data = snapshot.val() || {};
            const allCourses = Object.entries(data.courses || {}).map(([id, course]: [string, any]) => ({
                id,
                name: course.name,
                pars: course.pars || Array(9).fill(3)
            }));
            setCourses(allCourses);
            // 첫 번째 코스를 기본으로 설정
            setCurrentCourse(allCourses[0]?.id || '');
            setLoading(false);
        });

        const unsubScores = onValue(scoresRef, (snapshot) => {
            const newFirebaseScores = snapshot.val() || {};
            setFirebaseScores(newFirebaseScores);
            
            // Firebase에서 점수가 완전히 삭제되었는지 확인
            const hasAnyScores = Object.keys(newFirebaseScores).some(playerId => {
                const playerScores = newFirebaseScores[playerId];
                return playerScores && Object.keys(playerScores).some(courseId => {
                    const courseScores = playerScores[courseId];
                    return courseScores && Object.keys(courseScores).some(holeNumber => {
                        return courseScores[holeNumber] !== null && courseScores[holeNumber] !== undefined;
                    });
                });
            });
            
            // Firebase에 점수가 없으면 sessionStorage도 삭제
            if (!hasAnyScores) {
                sessionStorage.removeItem('selfScoringTempData');
            }
            
            // 초기 로드 시에만 Firebase 데이터를 scores에 설정
            setScores((prevScores: any) => {
                // 로컬에 점수가 있는지 확인
                const hasLocalScores = Object.keys(prevScores).some(playerId => {
                    const playerScores = prevScores[playerId];
                    return playerScores && Object.keys(playerScores).some(courseId => {
                        const courseScores = playerScores[courseId];
                        return courseScores && Object.keys(courseScores).some(holeNumber => {
                            return courseScores[holeNumber] !== null && courseScores[holeNumber] !== undefined;
                        });
                    });
                });
                
                // 로컬에 점수가 있으면 기존 상태 유지
                if (hasLocalScores) {
                    return prevScores;
                }
                
                // 로컬에 점수가 없으면 Firebase 데이터 사용
                return newFirebaseScores;
            });
            
            // Firebase 데이터 로드 후 임시 저장된 데이터 확인
            setTimeout(() => {
                loadScoresFromSession();
            }, 100);
        });

        // 점수 로그 로드
        const loadScoreLogs = async () => {
            try {
                const { getPlayerScoreLogs } = await import('@/lib/scoreLogs');
                const allPlayers = Object.keys(firebaseScores);
                const logsMap: any = {};
                
                for (const playerId of allPlayers) {
                    try {
                        const logs = await getPlayerScoreLogs(playerId);
                        logsMap[playerId] = logs;
                    } catch (error) {
                        logsMap[playerId] = [];
                    }
                }
                
                setScoreLogs(logsMap);
            } catch (error) {
                console.error('점수 로그 로드 실패:', error);
            }
        };

        // Firebase 데이터가 로드된 후 점수 로그 로드
        setTimeout(() => {
            loadScoreLogs();
        }, 200);

    return () => {
            unsubTournament();
      unsubScores();
    };
    }, [router]);

  useEffect(() => {
        if (!selectedGroup || !selectedJo || !db) return;

        console.log('선수 로드 시작:', { selectedGroup, selectedJo });

        // 선택된 그룹과 조의 선수들 로드
        const playersRef = ref(db, 'players');
        get(playersRef).then((snapshot) => {
            const allPlayers = snapshot.val() || {};
            const joNumber = parseInt(selectedJo);
            
            console.log('전체 선수 데이터:', allPlayers);
            console.log('필터링 조건:', { selectedGroup, joNumber });
            
            const groupPlayers = Object.entries(allPlayers)
                .filter(([_, player]: [string, any]) => {
                    // 문자열 비교로 수정 (joNumber를 문자열로 변환)
                    const matches = player.group === selectedGroup && player.jo === selectedJo;
                    console.log('선수 필터링:', { 
                        playerId: player.id, 
                        playerGroup: player.group, 
                        playerJo: player.jo, 
                        selectedJo: selectedJo,
                        matches 
                    });
                    return matches;
                })
                .map(([id, player]: [string, any]) => ({
                    id,
                    name: player.type === 'team' ? `${player.p1_name} / ${player.p2_name}` : player.name,
                    affiliation: player.type === 'team' ? player.p1_affiliation : player.affiliation,
                    jo: player.jo
                }))
                .sort((a, b) => a.jo - b.jo);

            console.log('필터링된 선수들:', groupPlayers);

            setPlayers(groupPlayers);
            setPlayerStates(Array(groupPlayers.length).fill(null));
            
            // 선수 이름 설정 (최대 4명)
            const names = groupPlayers.slice(0, 4).map(p => p.name);
            console.log('설정될 선수 이름들:', names);
            setPlayerNames([...names, ...Array(4 - names.length).fill('이름' + (names.length + 1))]);
        });
    }, [selectedGroup, selectedJo]);

    const getNextHole = (currentHole: number) => {
        return currentHole === 9 ? 1 : currentHole + 1;
    };

    // 9번 홀 다음에 1번 홀로 가는 로직을 위한 헬퍼 함수
    const getNextHoleForPlayer = (currentHole: number) => {
        if (currentHole === 9) return 1;
        return currentHole + 1;
    };

    const updateHoleStates = (inputHole: number, playerIndex: number) => {
        const newPlayerStates = [...playerStates];
        
        // 해당 플레이어의 첫 입력인 경우
        if (newPlayerStates[playerIndex] === null) {
            newPlayerStates[playerIndex] = inputHole;
        }
        
        // 전체 게임의 첫 입력인 경우
        if (firstInputHole === null) {
            setFirstInputHole(inputHole);
        }
        
        setPlayerStates(newPlayerStates);
        
        // 임시 저장 (샘플 페이지처럼)
        saveScoresToSession();
    };

    const handleScoreInput = (playerId: string, courseId: string, holeNumber: number, score: number, playerIndex: number, isModification: boolean = false) => {
        if (!db) return;

        // 기존 점수 확인
        const currentScore = getCurrentScore(playerId, courseId, holeNumber);
        
        // 즉시 화면 업데이트를 위해 로컬 상태 먼저 업데이트
        setScores((prevScores: any) => {
            const newScores = { ...prevScores };
            if (!newScores[playerId]) newScores[playerId] = {};
            if (!newScores[playerId][courseId]) newScores[playerId][courseId] = {};
            newScores[playerId][courseId][holeNumber] = score;
            return newScores;
        });
        
        // 즉시 임시 저장
      setTimeout(() => {
            saveScoresToSession();
        }, 0);
        
        // 홀 상태 업데이트 (새로운 입력인 경우에만)
        if (!isModification) {
            // 즉시 홀 상태 업데이트
            const newPlayerStates = [...playerStates];
            
            // 해당 플레이어의 첫 입력인 경우
            if (newPlayerStates[playerIndex] === null) {
                newPlayerStates[playerIndex] = holeNumber;
            }
            
            // 전체 게임의 첫 입력인 경우
            if (firstInputHole === null) {
                setFirstInputHole(holeNumber);
            }
            
            setPlayerStates(newPlayerStates);
            
            // 임시 저장
            setTimeout(() => {
                saveScoresToSession();
            }, 0);
        }
        
        // 점수 저장
        set(ref(db, `scores/${playerId}/${courseId}/${holeNumber}`), score).then(async () => {
            // 점수 변경 로그 기록 (수정인 경우에만)
            if (isModification && currentScore !== '') {
                try {
                    const { logScoreChange } = await import('@/lib/scoreLogs');
                 await logScoreChange({
                        matchId: 'tournaments/current',
        playerId,
                        scoreType: 'holeScore',
                        holeNumber,
                        oldValue: parseInt(currentScore) || 0,
                   newValue: score,
                        modifiedBy: captainEmail,
                        modifiedByType: 'judge',
                        comment: `자율채점 조장 수정 - 코스: ${courseId}`,
                        courseId: courseId
                    });
                } catch (error) {
                    console.error('로그 기록 실패:', error);
                }
            }

            toast({
                title: isModification ? '점수 수정 완료' : '점수 저장 완료',
                description: `${holeNumber}번 홀 점수가 ${isModification ? '수정' : '저장'}되었습니다.`,
            });

            // 수정인 경우 로그 다시 로드
            if (isModification) {
                try {
                    const { getPlayerScoreLogs } = await import('@/lib/scoreLogs');
                    const logs = await getPlayerScoreLogs(playerId);
                    setScoreLogs((prev: any) => ({
                        ...prev,
                        [playerId]: logs
                    }));
                } catch (error) {
                    console.error('로그 재로드 실패:', error);
                }
            }
        }).catch((error) => {
            // 저장 실패 시 로컬 상태 되돌리기
            setScores((prevScores: any) => {
                const newScores = { ...prevScores };
                if (newScores[playerId]?.[courseId]?.[holeNumber] !== undefined) {
                    delete newScores[playerId][courseId][holeNumber];
                }
                return newScores;
            });
            
            toast({
                title: '점수 저장 실패',
                description: '점수 저장 중 오류가 발생했습니다.',
                variant: 'destructive',
            });
        });
    };

    const handleInputClick = (input: HTMLInputElement, holeNumber: number, playerIndex: number) => {
        // 첫 입력이거나 해당 플레이어의 첫 입력인 경우 모든 홀 허용
        if (firstInputHole === null || playerStates[playerIndex] === null) {
            // 모든 홀 허용
        } else {
            // 해당 플레이어의 다음 홀만 허용
            const playerState = playerStates[playerIndex];
            const nextHole = getNextHoleForPlayer(playerState);
            
            // 9번 홀 다음에 1번 홀로 가는 로직
            if (nextHole === 1 && holeNumber !== 1) {
                toast({
                    title: '입력 불가',
                    description: '순서대로 점수를 입력해주세요.',
                    variant: 'destructive',
                });
         return;
    }
            
            if (holeNumber !== nextHole) {
                toast({
                    title: '입력 불가',
                    description: '순서대로 점수를 입력해주세요.',
                    variant: 'destructive',
                });
                return;
            }
        }

        setSelectedInput(input);
        
        // 숫자패드 위치 결정
        if (holeNumber >= 8) {
            setNumberPadPosition('top');
        } else {
            setNumberPadPosition('bottom');
        }
        
        setShowNumberPad(true);
    };

    const handleInputDoubleClick = (input: HTMLInputElement, holeNumber: number, playerIndex: number) => {
        // 더블클릭으로 점수 수정 (조장은 비밀번호 없이 수정 가능)
        if (confirm('점수를 수정하시겠습니까?')) {
            setSelectedInput(input);
            
            // 숫자패드 위치 결정
            if (holeNumber >= 8) {
                setNumberPadPosition('top');
            } else {
                setNumberPadPosition('bottom');
            }
            
            setShowNumberPad(true);
        }
    };

    const handleNumberPadInput = (number: string) => {
        if (!selectedInput) return;

        const score = parseInt(number);
        if (isNaN(score) || score < 0 || score > 20) {
            toast({
                title: '잘못된 점수',
                description: '0-20 사이의 점수를 입력해주세요.',
                variant: 'destructive',
            });
            return;
        }

        // 입력 필드에서 정보 추출
        const [playerId, courseId, holeNumber, playerIndex] = selectedInput.dataset.info?.split(',') || [];
        
        if (playerId && courseId && holeNumber && playerIndex !== undefined) {
            const currentScore = getCurrentScore(playerId, courseId, parseInt(holeNumber));
            const isModification = currentScore !== '';
            handleScoreInput(playerId, courseId, parseInt(holeNumber), score, parseInt(playerIndex), isModification);
        }

        // DOM 직접 조작 제거 - React 상태로만 관리
        setShowNumberPad(false);
        setSelectedInput(null);
    };

    const calculateTotal = (playerId: string, courseId: string) => {
        let total = 0;
        
        // 9개 홀에 대해 점수 계산
        for (let holeNumber = 1; holeNumber <= 9; holeNumber++) {
            const score = getCurrentScore(playerId, courseId, holeNumber);
            if (score !== '' && !isNaN(parseInt(score))) {
                total += parseInt(score);
            }
        }
        
        return total;
    };

    const getCurrentScore = (playerId: string, courseId: string, holeNumber: number) => {
        // 로컬 상태에서 먼저 확인
        const localScore = scores[playerId]?.[courseId]?.[holeNumber];
        if (localScore !== undefined && localScore !== null && localScore !== '') {
            return localScore;
        }
        
        // 로컬에 없으면 Firebase에서 확인
        const firebaseScore = firebaseScores[playerId]?.[courseId]?.[holeNumber];
        return firebaseScore !== undefined && firebaseScore !== null ? firebaseScore : '';
    };

    const isScoreModified = (playerId: string, courseId: string, holeNumber: number) => {
        const logs = scoreLogs[playerId] || [];
        return logs.some((log: any) => 
            log.courseId === courseId && 
            log.holeNumber === holeNumber && 
            log.modifiedByType === 'captain'
        );
    };

    const isInputEnabled = (holeNumber: number, playerIndex: number) => {
        // 첫 입력인 경우: 모든 홀이 활성화
        if (firstInputHole === null) {
            return true;
        }
        
        const playerState = playerStates[playerIndex];
        // 해당 플레이어의 첫 입력인 경우: 모든 홀이 활성화
        if (playerState === null) {
            return true;
        }
        
        // 해당 플레이어의 다음 홀만 활성화
        const nextHole = getNextHoleForPlayer(playerState);
        
        // 9번 홀 다음에 1번 홀로 가는 로직
        if (nextHole === 1 && holeNumber === 1) {
            return true;
        }
        if (nextHole === 1 && holeNumber !== 1) {
            return false;
        }
        
        return holeNumber === nextHole;
    };

    const getCurrentCourse = () => {
        return courses.find(c => c.id === currentCourse);
    };

    // 싸인 모달 관련 함수들
    const openSignatureModal = (playerIndex: number) => {
        setCurrentSignaturePlayer(playerIndex);
        setShowSignatureModal(true);
        
        // 캔버스 초기화를 위해 다음 프레임에서 실행
    setTimeout(() => {
            initializeCanvas();
        }, 100);
    };

    const initializeCanvas = () => {
      const canvas = signatureCanvasRef.current;
      if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 캔버스 크기 설정
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

        // 캔버스 초기화
        ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
    };

    const clearSignature = () => {
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'black';
    };

    const saveSignature = () => {
        const canvas = signatureCanvasRef.current;
        if (!canvas || currentSignaturePlayer === -1) return;

        const signatureImage = canvas.toDataURL('image/png');
        const newSignatures = [...signatures];
        newSignatures[currentSignaturePlayer] = signatureImage;
        setSignatures(newSignatures);
        
        setShowSignatureModal(false);
        setCurrentSignaturePlayer(-1);
  };

  const closeSignatureModal = () => {
        setShowSignatureModal(false);
        setCurrentSignaturePlayer(-1);
    };

    // 캔버스 드로잉 관련 상태
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastX, setLastX] = useState(0);
    const [lastY, setLastY] = useState(0);

    // 마우스 이벤트 핸들러
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
        
        setLastX((e.clientX - rect.left) * scaleX);
        setLastY((e.clientY - rect.top) * scaleY);
  };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        setLastX(x);
        setLastY(y);
    };

    const handleMouseUp = () => {
        setIsDrawing(false);
    };

    // 터치 이벤트 핸들러
    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
  e.preventDefault();
        const touch = e.touches[0];
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        setLastX((touch.clientX - rect.left) * scaleX);
        setLastY((touch.clientY - rect.top) * scaleY);
        setIsDrawing(true);
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (!isDrawing) return;
        
        const touch = e.touches[0];
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;
        
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
  ctx.stroke();
        
        setLastX(x);
        setLastY(y);
    };

    const handleTouchEnd = () => {
        setIsDrawing(false);
    };

    // 임시 저장 함수 (샘플 페이지처럼)
    const saveScoresToSession = () => {
        const scoreData = {
            scores,
            firstInputHole,
            playerStates,
            playerNames,
            currentCourse,
            signatures,
            timestamp: Date.now()
        };
        sessionStorage.setItem('selfScoringTempData', JSON.stringify(scoreData));
        
        // localStorage에도 저장 (샘플 페이지와 동일하게)
        const localStorageData = {
            date: new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}),
            scores: Object.keys(scores).map(playerId => 
                Object.keys(scores[playerId] || {}).map(courseId => 
                    Object.keys(scores[playerId][courseId] || {}).map(holeNumber => 
                        scores[playerId][courseId][holeNumber]
                    )
                ).flat().flat()
            ),
            firstInputHole,
            playerStates,
            playerNames,
            currentCourse,
            signatures
        };
        localStorage.setItem('golfScores', JSON.stringify(localStorageData));
    };

    // 임시 저장된 데이터 로드
    const loadScoresFromSession = () => {
        // sessionStorage에서 먼저 확인
        const savedData = sessionStorage.getItem('selfScoringTempData');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                // 30분 이내의 데이터만 로드
                if (Date.now() - data.timestamp < 30 * 60 * 1000) {
                    // 현재 로컬 상태에 점수가 없으면 sessionStorage 데이터 로드
                    const hasLocalScores = Object.keys(scores).some(playerId => {
                        const playerScores = scores[playerId];
                        return playerScores && Object.keys(playerScores).some(courseId => {
                            const courseScores = playerScores[courseId];
                            return courseScores && Object.keys(courseScores).some(holeNumber => {
                                return courseScores[holeNumber] !== null && courseScores[holeNumber] !== undefined;
                            });
                        });
                    });
                    
                                         if (!hasLocalScores) {
                         setScores(data.scores || {});
                         setFirstInputHole(data.firstInputHole);
                         setPlayerStates(data.playerStates || []);
                         setPlayerNames(data.playerNames || ['이름1', '이름2', '이름3', '이름4']);
                         setSignatures(data.signatures || ['', '', '', '']);
                         if (data.currentCourse) {
                             setCurrentCourse(data.currentCourse);
                         }
                     }
                } else {
                    // 30분 지난 데이터는 삭제
                    sessionStorage.removeItem('selfScoringTempData');
                }
            } catch (error) {
                console.error('임시 데이터 로드 실패:', error);
                sessionStorage.removeItem('selfScoringTempData');
            }
        }
        
        // localStorage에서도 확인 (샘플 페이지와 동일하게)
        const localStorageData = localStorage.getItem('golfScores');
        if (localStorageData) {
            try {
                const data = JSON.parse(localStorageData);
                
                // 현재 로컬 상태에 점수가 없으면 localStorage 데이터 로드
                const hasLocalScores = Object.keys(scores).some(playerId => {
                    const playerScores = scores[playerId];
                    return playerScores && Object.keys(playerScores).some(courseId => {
                        const courseScores = playerScores[courseId];
                        return courseScores && Object.keys(courseScores).some(holeNumber => {
                            return courseScores[holeNumber] !== null && courseScores[holeNumber] !== undefined;
                        });
                    });
                });
                
                if (!hasLocalScores) {
                    // localStorage 데이터를 scores 형태로 변환
                    const convertedScores: any = {};
                    if (data.scores && Array.isArray(data.scores)) {
                        // 간단한 형태의 점수 배열을 복잡한 형태로 변환
                        // 이 부분은 실제 데이터 구조에 맞게 조정 필요
                        console.log('localStorage 데이터 로드:', data);
                    }
                    
                                         setFirstInputHole(data.firstInputHole);
                     setPlayerStates(data.playerStates || []);
                     setPlayerNames(data.playerNames || ['이름1', '이름2', '이름3', '이름4']);
                     setSignatures(data.signatures || ['', '', '', '']);
                     if (data.currentCourse) {
                         setCurrentCourse(data.currentCourse);
                     }
                }
            } catch (error) {
                console.error('localStorage 데이터 로드 실패:', error);
            }
        }
    };

    if (loading) {
  return (
            <div className="min-h-screen bg-slate-100 p-4">
                <div className="max-w-6xl mx-auto">
                    <div className="bg-white rounded-3xl shadow-lg p-8">
                        <div className="animate-pulse">
                            <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
                            <div className="h-96 bg-gray-200 rounded"></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const currentCourseData = getCurrentCourse();

    return (
        <div className="scoring-page min-h-screen">
            <div className="container max-w-6xl mx-auto">
                    {/* 탭 */}
        <div className="tabs">
                        {courses.map((course, index) => (
            <button
                                key={course.id}
                                className={`tab ${currentCourse === course.id ? 'active' : ''}`}
                                                                 style={{
                                     backgroundColor: currentCourse === course.id 
                                         ? themeColors[index % themeColors.length] 
                                         : 'transparent',
                                     color: currentCourse === course.id && (themeColors[index % themeColors.length] === '#f5f5dc' || themeColors[index % themeColors.length] === '#fbbf24')
                                         ? '#000000'
                                         : currentCourse === course.id ? '#ffffff' : '#495057'
                                 }}
                                onClick={() => setCurrentCourse(course.id)}
                            >
                                {course.name}
            </button>
          ))}
        </div>

                    {/* 점수표 */}
                    <div className="overflow-x-auto">
                        <table className="score-table">
            <thead>
              <tr>
                                                                                                              <th className="border border-gray-300 p-4 text-center font-semibold uppercase tracking-wide"
                                          style={{ 
                                              backgroundColor: themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length],
                                              color: themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length] === '#f5f5dc' || themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length] === '#fbbf24' ? '#000000' : '#ffffff'
                                          }}>
                                          홀
                                      </th>
                                                                           <th className="border border-gray-300 p-4 text-center font-semibold uppercase tracking-wide"
                                          style={{ 
                                              backgroundColor: themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length],
                                              color: themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length] === '#f5f5dc' || themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length] === '#fbbf24' ? '#000000' : '#ffffff'
                                          }}>
                                          Par
                                      </th>
                                                                         {playerNames.map((name, index) => (
                                                                                  <th key={index} className="border border-gray-300 p-4 text-center font-semibold uppercase tracking-wide cursor-pointer"
                                              style={{ 
                                                  backgroundColor: themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length],
                                                  color: themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length] === '#f5f5dc' || themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length] === '#fbbf24' ? '#000000' : '#ffffff'
                                              }}
                                            onClick={() => {
                                                // 이름 변경 모달 (점수표샘플.html과 동일한 기능)
                                                const newName = prompt(`${index + 1}번 선수 이름을 입력하세요:`, name);
                                                if (newName !== null) {
                                                    const newNames = [...playerNames];
                                                    newNames[index] = newName;
                                                    setPlayerNames(newNames);
                                                }
                                            }}>
                                            {name}
                                        </th>
                                    ))}
              </tr>
            </thead>
            <tbody>
                                {Array.from({ length: 9 }, (_, i) => i + 1).map((holeNumber) => (
                                    <tr key={holeNumber}>
                                                                                                                          <td className="border border-gray-300 p-4 text-center font-bold"
                                              style={{ 
                                                  backgroundColor: themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length],
                                                  color: themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length] === '#f5f5dc' || themeColors[courses.findIndex(c => c.id === currentCourse) % themeColors.length] === '#fbbf24' ? '#000000' : '#ffffff'
                                              }}>
                                              {holeNumber}
                                          </td>
                                        <td className="border border-gray-300 p-4 text-center font-normal">
                                            {currentCourseData?.pars[holeNumber - 1] || 3}
                                        </td>
                                        {playerNames.map((_, playerIndex) => {
                                            const player = players[playerIndex];
                                            const playerId = player?.id || `player${playerIndex}`;
                                            const currentScore = getCurrentScore(playerId, currentCourse, holeNumber);
                                            const isModified = isScoreModified(playerId, currentCourse, holeNumber);
                                            const isEnabled = isInputEnabled(holeNumber, playerIndex);
                                            
                    return (
                                                <td key={playerIndex} className="border border-gray-300 p-2">
                                                    <input
                                                        type="text"
                                                        className={`score-input ${
                                                            !isEnabled ? 'disabled' : ''
                                                        } ${
                                                            currentScore ? 'locked' : ''
                                                        } ${
                                                            isModified ? 'modified' : ''
                                                        }`}
                                                        value={currentScore}
                                                        readOnly
                                                        onClick={(e) => handleInputClick(e.target as HTMLInputElement, holeNumber, playerIndex)}
                                                        onDoubleClick={(e) => handleInputDoubleClick(e.target as HTMLInputElement, holeNumber, playerIndex)}
                                                        data-info={`${playerId},${currentCourse},${holeNumber},${playerIndex}`}
                                                        disabled={!isEnabled}
                                                        title={
                                                            isModified
                                                                ? '자율채점 조장이 수정한 점수입니다'
                                                                : isEnabled ? '클릭하여 점수 입력' : '순서대로 입력해주세요'
                                                        }
                                                    />
                                                                                                         <div className="difference">
                                                         {currentScore && currentCourseData ? 
                                                             (() => {
                                                                 const diff = parseInt(currentScore) - currentCourseData.pars[holeNumber - 1];
                                                                 if (diff === 0) {
                                                                     return <span>(E)</span>;
                                                                 } else if (diff > 0) {
                                                                     return <span className="positive">(+{diff})</span>;
                                                                 } else {
                                                                     return <span className="negative">({diff})</span>;
                                                                 }
                                                             })()
                                                             : ''
                                                         }
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
                                {/* 합계 행 */}
                                <tr className="bg-gray-100">
                                    <td colSpan={2} className="border border-gray-300 p-4 text-center font-bold text-lg">
                                        합계
                  </td>
                                    {playerNames.map((_, playerIndex) => {
                                        const player = players[playerIndex];
                                        const playerId = player?.id || `player${playerIndex}`;
                                        const total = calculateTotal(playerId, currentCourse);
                                        
                                        return (
                                            <td key={playerIndex} className="border border-gray-300 p-4 text-center font-bold text-2xl">
                                                {total || ''}
                                            </td>
                                        );
                                    })}
              </tr>
                                                                 {/* 서명 행 */}
                                 <tr>
                                     <td colSpan={2} className="border border-gray-300 p-4 text-center font-bold text-lg">
                                         서명
                                     </td>
                                     {playerNames.map((_, playerIndex) => (
                                         <td key={playerIndex} className="border border-gray-300 p-2">
                                             <div 
                                                 className={`h-10 border-2 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                                                     signatures[playerIndex] 
                                                         ? 'border-green-500 bg-green-50' 
                                                         : 'border-gray-300 hover:bg-gray-50'
                                                 }`}
                                                 onClick={() => openSignatureModal(playerIndex)}
                                             >
                                                 {signatures[playerIndex] ? (
                                                     <img 
                                                         src={signatures[playerIndex]} 
                                                         alt="서명" 
                                                         className="max-h-8 max-w-full object-contain"
                                                     />
                                                 ) : (
                                                     <span className="text-sm text-gray-500">싸인</span>
                                                 )}
                                             </div>
                    </td>
                  ))}
              </tr>
            </tbody>
          </table>
        </div>

                                                              {/* 하단 버튼들 */}
        <div className="action-buttons">
                                                       <button className="action-button" style={{background: 'linear-gradient(135deg, #dc3545, #c82333)'}}
                                    onClick={() => {
                                        if (confirm('정말로 모든 점수를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
                                                                                         // 모든 점수 초기화
                                             setScores({});
                                             setFirstInputHole(null);
                                             setPlayerStates(Array(players.length).fill(null));
                                             setSignatures(['', '', '', '']);
                                            
                                            // Firebase에서도 점수 삭제
                                            if (db) {
                                                const scoresRef = ref(db, 'scores');
                                                set(scoresRef, null).then(() => {
                                                    toast({
                                                        title: '초기화 완료',
                                                        description: '모든 점수가 초기화되었습니다.',
                                                    });
                                                }).catch((error) => {
                                                    console.error('Firebase 초기화 실패:', error);
                                                    toast({
                                                        title: '초기화 실패',
                                                        description: '점수 초기화 중 오류가 발생했습니다.',
                                                        variant: 'destructive',
                                                    });
                                                });
                                            }
                                            
                                            // sessionStorage와 localStorage도 삭제
                                            sessionStorage.removeItem('selfScoringTempData');
                                            localStorage.removeItem('golfScores');
                                        }
                                    }}>
                                초기화
                            </button>
                           <button className="action-button" style={{background: '#FEE500', color: '#000000'}}
                                   onClick={() => {
                                       toast({
                                           title: '점수 공유',
                                           description: '점수 공유 기능은 준비 중입니다.',
                                       });
                                   }}>
                               점수공유
                           </button>
                           <button className="action-button" style={{background: 'linear-gradient(135deg, #6c757d, #5a6268)'}}
                                   onClick={() => router.push('/self-scoring/game')}>
                               뒤로가기
                           </button>
        </div>

                                         {/* 싸인 모달 */}
                     {showSignatureModal && (
                         <div className="signature-modal">
          <div className="signature-content">
            <div className="signature-header">
                                     <h2 className="player-name">
                                         {playerNames[currentSignaturePlayer]}
                                     </h2>
                                     <h3 className="player-score">
                                         Score: {calculateTotal(players[currentSignaturePlayer]?.id || `player${currentSignaturePlayer}`, currentCourse)}
                                     </h3>
            </div>
                                 
            <canvas
              ref={signatureCanvasRef}
              className="signature-canvas"
                                     style={{ touchAction: 'none' }}
                                     onMouseDown={handleMouseDown}
                                     onMouseMove={handleMouseMove}
                                     onMouseUp={handleMouseUp}
                                     onMouseLeave={handleMouseUp}
                                     onTouchStart={handleTouchStart}
                                     onTouchMove={handleTouchMove}
                                     onTouchEnd={handleTouchEnd}
                                 />
                                 
            <div className="signature-buttons">
                                     <button
                                         className="modal-button clear-button"
                                         onClick={clearSignature}
                                     >
                                         다시하기
                                     </button>
                                     <button
                                         className="modal-button save-signature-button"
                                         onClick={saveSignature}
                                     >
                                         저장
                                     </button>
                                     <button
                                         className="modal-button close-signature-button"
                                         onClick={closeSignatureModal}
                                     >
                                         닫기
                                     </button>
            </div>
          </div>
        </div>
      )}

                     {/* 숫자패드 */}
                     {showNumberPad && (
                         <div 
                             className={`number-pad ${numberPadPosition === 'top' ? 'top-fixed' : 'bottom-fixed'}`}
                             style={{ display: 'grid' }}
                         >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                <button
                                    key={num}
                                    className="number-button"
                                    onClick={() => handleNumberPadInput(num.toString())}
                                >
                                    {num}
                                </button>
                            ))}
                            <button
                                className="number-button cancel-button"
                                onClick={() => setShowNumberPad(false)}
                            >
                                취소
                            </button>
                            <button
                                className="number-button"
                                onClick={() => handleNumberPadInput('0')}
                            >
                                0
                            </button>
                            <button
                                className="number-button save-button"
                                onClick={() => {
                                    if (selectedInput) {
                                        handleNumberPadInput(selectedInput.value);
                                    }
                                }}
                            >
                                저장
                            </button>
                        </div>
                    )}

                    <div className="text-right text-xs text-gray-500 mt-4 pr-1">
                        Made by 하용휘
                    </div>
                </div>
            </div>
        </div>
    );
}
