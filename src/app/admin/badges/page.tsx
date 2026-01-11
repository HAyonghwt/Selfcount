"use client"

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { db, ensureAuthenticated } from "@/lib/firebase";
import { ref, onValue, get, set, remove, update } from "firebase/database";
import { Download, Settings, Upload, Trash2, X } from "lucide-react";
import jsPDF from "jspdf";

// 그룹명 영어 번역 매핑
const getGroupNameEn = (groupName: string): string => {
  const mapping: { [key: string]: string } = {
    '남자부': "Men's Division",
    '여자부': "Women's Division",
    '남시니어': "Men's Senior",
    '여시니어': "Women's Senior",
    '남자일반': "Men's General",
    '여자일반': "Women's General",
  };
  return mapping[groupName] || groupName;
};

// 배경 이미지 목록 (public/badges/ 폴더)
const BACKGROUND_IMAGES = [
  '/badges/001.jpg',
  '/badges/002.jpg',
  '/badges/003.jpg',
  '/badges/004.jpg',
  '/badges/005.jpg',
  '/badges/006.jpg',
  '/badges/007.jpg',
  '/badges/008.jpg',
  '/badges/009.jpg',
  '/badges/010.jpg',
  '/badges/011.jpg',
  '/badges/012.jpg',
];

// 배경 이미지별 기본 이름 색상
const BACKGROUND_COLORS: { [key: string]: string } = {
  '/badges/001.jpg': '#1b7eff',
  '/badges/002.jpg': '#1b9acf',
  '/badges/003.jpg': '#a6ce39',
  '/badges/004.jpg': '#fd6f23',
  '/badges/005.jpg': '#fc522f',
  '/badges/006.jpg': '#ef59a1',
  '/badges/007.jpg': '#960331',
  '/badges/008.jpg': '#1009C0',
  '/badges/009.jpg': '#6301A4',
  '/badges/010.jpg': '#005D40',
  '/badges/011.jpg': '#EDB901',
  '/badges/012.jpg': '#fd8443',
};

export default function BadgePage() {
  const { toast } = useToast();

  // Firebase 데이터
  const [tournament, setTournament] = useState<any>({});
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [groupsData, setGroupsData] = useState<any>({});

  // 설정 상태
  const [selectedBackground, setSelectedBackground] = useState<string>(BACKGROUND_IMAGES[0]);
  const [badgeWidth, setBadgeWidth] = useState<number>(88); // mm
  const [badgeHeight, setBadgeHeight] = useState<number>(58); // mm
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'individual' | 'team'>('individual');

  // 텍스트 크기 설정
  const [fontSizes, setFontSizes] = useState({
    tournamentName: 12, // 작은 글자
    joName: 50, // 아주 큰 글자
    groupName: 18, // 중간 크기
    playerName: 86, // 아주 큰 글자
  });

  // 텍스트 색상 설정
  const [textColors, setTextColors] = useState({
    tournamentName: '#FFFFFF', // 흰색
    joName: '#FFFFFF', // 흰색
    groupName: '#666666', // 회색
    playerName: '#0066CC', // 배경테마색 (기본 파란색)
  });

  // 로고 설정
  const [logoSettings, setLogoSettings] = useState({
    size: 0.8, // 명찰 크기 대비 비율 (0.1 ~ 1.0)
    offsetX: 0, // 가로 오프셋 (픽셀, -200 ~ 200)
    offsetY: 0, // 세로 오프셋 (픽셀, -200 ~ 200)
    opacity: 0.10, // 투명도 (0.0 ~ 1.0)
    showLogo: true, // 로고 표시 여부
  });

  // 로고 설정 업데이트 함수
  const updateLogoSettings = async (newSettings: Partial<typeof logoSettings>) => {
    if (!db) return;

    try {
      const updatedSettings = {
        ...logoSettings,
        ...newSettings
      };

      setLogoSettings(updatedSettings);
      await set(ref(db, 'badges/settings'), updatedSettings);
    } catch (error) {
      console.error('로고 설정 저장 실패:', error);
    }
  };

  // 미리보기용 캔버스 ref
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const badgeContainerRef = useRef<HTMLDivElement>(null);

  // 로고 관리 상태
  const [uploadedLogos, setUploadedLogos] = useState<Array<{ name: string; url: string; thumbnail?: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isBackupPrinting, setIsBackupPrinting] = useState(false);

  // Firebase 데이터 로드
  useEffect(() => {
    if (!db) return;

    const tournamentRef = ref(db, 'tournaments/current');
    const playersRef = ref(db, 'players');

    const unsubTournament = onValue(tournamentRef, (snapshot) => {
      const data = snapshot.val() || {};
      setTournament(data);
      setGroupsData(data.groups || {});
    });

    const unsubPlayers = onValue(playersRef, (snapshot) => {
      const data = snapshot.val();
      setAllPlayers(data ? Object.entries(data).map(([id, player]) => ({ id, ...player as object })) : []);
    });

    return () => {
      unsubTournament();
      unsubPlayers();
    };
  }, []);

  // 로고 목록 및 설정 불러오기
  useEffect(() => {
    const loadLogos = async () => {
      if (!db) return;

      try {
        await ensureAuthenticated();
        const logosRef = ref(db, 'logos');
        const snapshot = await get(logosRef);

        if (snapshot.exists()) {
          const logosData = snapshot.val();
          const logos = Object.entries(logosData).map(([name, data]: [string, any]) => ({
            name,
            url: data.url || data.base64,
            thumbnail: data.url || data.base64 // 썸네일도 같은 URL 사용
          }));
          setUploadedLogos(logos);
        }
      } catch (error) {
        console.error('로고 목록 불러오기 실패:', error);
      }
    };

    const loadSettings = async () => {
      if (!db) return;

      try {
        await ensureAuthenticated();
        const settingsSnapshot = await get(ref(db, 'badges/settings'));
        if (settingsSnapshot.exists()) {
          const settings = settingsSnapshot.val();
          setLogoSettings({
            size: settings.size ?? 0.8,
            offsetX: settings.offsetX ?? 0,
            offsetY: settings.offsetY ?? 0,
            opacity: settings.opacity ?? 0.10,
            showLogo: settings.showLogo ?? true
          });
        }
      } catch (error) {
        console.error('로고 설정 불러오기 실패:', error);
      }
    };

    loadLogos();
    loadSettings();

    // 실시간 구독으로 설정 변경 감지
    let unsubSettings = () => { };
    if (db) {
      unsubSettings = onValue(ref(db, 'badges/settings'), (snapshot) => {
        if (snapshot.exists()) {
          const settings = snapshot.val();
          setLogoSettings({
            size: settings.size ?? 0.8,
            offsetX: settings.offsetX ?? 0,
            offsetY: settings.offsetY ?? 0,
            opacity: settings.opacity ?? 0.10,
            showLogo: settings.showLogo ?? true
          });
        }
      });
    }

    return () => {
      unsubSettings();
    };
  }, []);

  // 로고 업로드 함수
  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 이미지 파일만 허용
    if (!file.type.startsWith('image/')) {
      toast({
        title: "오류",
        description: "이미지 파일만 업로드할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    // 파일 크기 제한 (2MB - base64는 원본보다 약 33% 크므로)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "오류",
        description: "파일 크기는 2MB 이하여야 합니다.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      if (!db) {
        throw new Error('Firebase Database가 초기화되지 않았습니다.');
      }

      // 파일을 base64로 변환
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const timestamp = Date.now();
      // Firebase Realtime Database 경로에는 . # $ [ ] 문자가 허용되지 않음
      // 파일명에서 확장자를 제거하고 안전한 키 생성
      const fileExtension = file.name.split('.').pop() || 'png';
      const baseFileName = file.name
        .replace(/\.[^/.]+$/, '') // 확장자 제거
        .replace(/[^a-zA-Z0-9_-]/g, '_') // 특수문자 제거 (. # $ [ ] 포함)
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '') || 'logo';

      // 경로 키는 확장자 없이 생성 (특수문자 제거)
      const logoKey = `logo_${timestamp}_${baseFileName}`;

      // Firebase Realtime Database에 저장
      const logoRef = ref(db, `logos/${logoKey}`);
      await set(logoRef, {
        url: base64,
        fileName: `${baseFileName}.${fileExtension}`, // 원본 파일명 (확장자 포함)
        uploadedAt: timestamp,
        fileSize: file.size,
        fileType: file.type
      });

      console.log('로고 업로드 완료:', logoKey);

      setUploadedLogos(prev => [...prev, { name: logoKey, url: base64, thumbnail: base64 }]);

      toast({
        title: "성공",
        description: "로고가 업로드되었습니다.",
      });
    } catch (error: any) {
      console.error('로고 업로드 실패:', error);

      let errorMessage = "로고 업로드에 실패했습니다.";
      if (error?.message) {
        errorMessage = error.message;
      }

      toast({
        title: "오류",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // 파일 입력 초기화
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  // 로고 삭제 함수
  const handleLogoDelete = async (logoName: string) => {
    if (!confirm('이 로고를 삭제하시겠습니까?')) return;

    try {
      if (!db) {
        throw new Error('Firebase Database가 초기화되지 않았습니다.');
      }

      const logoRef = ref(db, `logos/${logoName}`);
      await remove(logoRef);

      setUploadedLogos(prev => prev.filter(logo => logo.name !== logoName));

      toast({
        title: "성공",
        description: "로고가 삭제되었습니다.",
      });
    } catch (error: any) {
      console.error('로고 삭제 실패:', error);
      toast({
        title: "오류",
        description: error.message || "로고 삭제에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  // 배경 이미지 변경 시 이름 색상 자동 설정
  useEffect(() => {
    const defaultColor = BACKGROUND_COLORS[selectedBackground];
    if (defaultColor) {
      setTextColors(prev => ({
        ...prev,
        playerName: defaultColor,
      }));
    }
  }, [selectedBackground]);

  // 선택된 그룹의 선수 목록 필터링 및 정렬 (엑셀 순서 반영)
  const filteredPlayers = allPlayers.filter(player => {
    if (!selectedGroup) return false;
    if (player.type !== selectedType) return false;
    if (player.group !== selectedGroup) return false;
    return true;
  }).sort((a, b) => {
    // 1. 조 번호로 먼저 정렬
    const joA = String(a.jo || '');
    const joB = String(b.jo || '');
    const numA = parseInt(joA);
    const numB = parseInt(joB);

    if (joA !== joB) {
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return joA.localeCompare(joB);
    }

    // 2. 같은 조 내에서는 엑셀 업로드 순서(uploadOrder)로 정렬
    // uploadOrder가 없는 경우(기존 데이터)는 맨 뒤로 가거나 이름순 정렬
    const orderA = a.uploadOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.uploadOrder ?? Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // 3. 순서 정보가 모두 없으면 이름으로 정렬 (Fallback)
    const nameA = a.name || a.p1_name || '';
    const nameB = b.name || b.p1_name || '';
    return nameA.localeCompare(nameB);
  });

  // 조별로 그룹화
  const playersByJo = filteredPlayers.reduce((acc: { [jo: string]: any[] }, player) => {
    const jo = player.jo?.toString() || '0';
    if (!acc[jo]) acc[jo] = [];
    acc[jo].push(player);
    return acc;
  }, {});

  // 그룹 목록 (타입별)
  const availableGroups = Object.keys(groupsData).filter(groupName => {
    const group = groupsData[groupName];
    return group?.type === selectedType;
  });

  // 명찰 하나 렌더링 (Canvas에 그리기)
  const drawBadge = async (
    ctx: CanvasRenderingContext2D,
    player: any,
    groupName: string,
    tournamentName: string,
    width: number,
    height: number,
    logoUrl?: string,
    logoSize?: number,
    logoOffsetX?: number,
    logoOffsetY?: number,
    logoOpacity?: number,
    preloadedBgImage?: HTMLImageElement,
    preloadedLogoImage?: HTMLImageElement
  ) => {
    const TARGET_DPI = 300;
    const BASE_DPI = 96;

    // 픽셀 단위로 변환 (96 DPI 기준 - 기존 디자인 및 위치 계산용) - 소수점 정밀도 유지 (반올림 제거)
    const mmToPx = (mm: number) => (mm * BASE_DPI) / 25.4;
    const pxWidth = mmToPx(width);
    const pxHeight = mmToPx(height);

    // Canvas 실제 해상도는 300 DPI로 고해상도 설정 - 캔버스 버퍼 크기는 정수여야 함
    const targetWidth = Math.round((width * TARGET_DPI) / 25.4);
    const targetHeight = Math.round((height * TARGET_DPI) / 25.4);

    ctx.canvas.width = targetWidth;
    ctx.canvas.height = targetHeight;

    // 실제 캔버스 크기(정수)와 로직상 픽셀 크기(실수)의 비율을 정확하게 계산하여 스케일링
    const ratioX = targetWidth / pxWidth;
    const ratioY = targetHeight / pxHeight;

    // 모든 좌표와 글자 크기를 96 DPI 기준으로 작성하면 
    // 내부적으로 300 DPI 해상도에 맞춰 자동으로 확대되도록 설정
    // 모든 좌표와 글자 크기를 96 DPI 기준으로 작성하면 
    // 내부적으로 300 DPI 해상도에 맞춰 자동으로 확대되도록 설정
    ctx.scale(ratioX, ratioY);

    // 배경 이미지 그리기
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 픽셀 단위 직접 제어를 위해 변환 초기화
    // targetWidth, targetHeight는 이미 정수(Integer)로 계산되어 있음
    if (preloadedBgImage) {
      ctx.drawImage(preloadedBgImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
    } else {
      // 배경 이미지 로드 (fallback)
      const img = new Image();
      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = selectedBackground;
        });
        ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
      } catch (e) {
        console.error("배경 로드 실패", e);
      }
    }
    ctx.restore();

    // 로고 그리기
    if (logoUrl) {
      try {
        let logoImg = preloadedLogoImage;

        if (!logoImg) {
          logoImg = new Image();
          logoImg.crossOrigin = 'anonymous';
          await new Promise((resolve, reject) => {
            if (!logoImg) return reject("Image creation failed");
            logoImg.onload = resolve;
            logoImg.onerror = reject;
            logoImg.src = logoUrl!;
          });
        }

        if (logoImg) {
          // 로고 원본 비율 계산
          const logoAspectRatio = logoImg.width / logoImg.height;
          const badgeAspectRatio = pxWidth / pxHeight;

          // 로고 크기 설정 (기본값 0.8, 파라미터로 받은 값 사용)
          const sizeRatio = logoSize !== undefined ? logoSize : 0.8;

          // 로고를 배경과 동일하게 절대 픽셀 좌표로 그리기 위해 좌표 변환 재설정
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0); // 배경과 동일하게 절대 좌표 사용

          // 로고가 들어갈 최대 영역 정의 (명찰 크기의 sizeRatio 비율)
          // 절대 픽셀 크기(targetWidth, targetHeight) 기준으로 계산
          const maxLogoWidth = targetWidth * sizeRatio;
          const maxLogoHeight = targetHeight * sizeRatio;
          const maxAreaAspectRatio = maxLogoWidth / maxLogoHeight;

          // 명찰 크기의 설정된 비율을 기준으로 하되, 원본 비율 유지
          let logoWidth: number;
          let logoHeight: number;

          // 로고를 최대 영역 내에 맞추되 비율 유지 (contain 방식)
          if (logoAspectRatio > maxAreaAspectRatio) {
            // 로고가 허용 영역보다 가로로 길면 → 가로를 기준으로 축소
            logoWidth = maxLogoWidth;
            logoHeight = logoWidth / logoAspectRatio;
          } else {
            // 로고가 허용 영역보다 세로로 길거나 비슷하면 → 세로를 기준으로 축소
            logoHeight = maxLogoHeight;
            logoWidth = logoHeight * logoAspectRatio;
          }

          // 위치 오프셋 적용 (기본값 0, 파라미터로 받은 값 사용)
          // 오프셋도 절대 픽셀 단위로 변환
          const absoluteOffsetX = (logoOffsetX !== undefined ? logoOffsetX : 0) * ratioX;
          const absoluteOffsetY = (logoOffsetY !== undefined ? logoOffsetY : 0) * ratioY;

          const logoX = (targetWidth - logoWidth) / 2 + absoluteOffsetX; // 가로 중앙 + 오프셋
          const logoY = (targetHeight - logoHeight) / 2 + absoluteOffsetY; // 세로 중앙 + 오프셋

          // 로고 투명도 설정
          const opacity = logoOpacity !== undefined ? logoOpacity : 0.10;
          ctx.globalAlpha = opacity;

          ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
          ctx.restore();
        }
      } catch (error) {
        console.error('로고 로드 실패:', error);
      }
    }

    // 기준 크기 (88mm x 58mm)와 현재 크기의 비율 계산
    const BASE_WIDTH = 88;
    const BASE_HEIGHT = 58;
    const scaleX = width / BASE_WIDTH;
    const scaleY = height / BASE_HEIGHT;
    // 가로/세로 비율의 평균을 사용하여 균등하게 스케일링
    const scale = (scaleX + scaleY) / 2;

    // 텍스트 그리기
    const playerName = player.type === 'team' ? (player.p1_name || '') : (player.name || '');
    const jo = player.jo?.toString() || '';
    const joDisplay = jo; // 실제 조 이름만 표시
    const groupNameEn = getGroupNameEn(groupName);

    // 영어 이름인지 판단 (한글이 없고 영문자, 공백, 하이픈만 포함된 경우)
    const isEnglishName = /^[a-zA-Z\s-]+$/.test(playerName) && playerName.trim().length > 0;

    // 대회명 (왼쪽 위, 작은 글자) - 비율 적용
    ctx.fillStyle = textColors.tournamentName;
    ctx.font = `bold ${fontSizes.tournamentName * scale}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tournamentName, mmToPx(5) * scaleX + 15 * scale, mmToPx(5) * scaleY - 8 * scale);

    // 조 이름 (가운데, 아주 큰 글자) - 비율 적용
    ctx.fillStyle = textColors.joName;
    ctx.font = `bold ${fontSizes.joName * scale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(joDisplay, pxWidth / 2, pxHeight * 0.3 - 5 * scale);

    // 그룹명 + 영어 (이름 위, 중간 크기) - 비율 적용
    ctx.fillStyle = textColors.groupName;
    ctx.font = `300 ${fontSizes.groupName * scale}px Arial`; // 얇은 체
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const groupText = `${groupName} ${groupNameEn}`;
    ctx.fillText(groupText, pxWidth / 2, pxHeight * 0.7 - 33 * scale);

    // 이름 (맨 아래, 아주 큰 글자) - 비율 적용
    ctx.fillStyle = textColors.playerName;
    ctx.textAlign = 'center';

    // 한글 이름 기본 위치 (하단 기준)
    const koreanNameY = pxHeight - mmToPx(8) * scaleY + 29 * scale;

    if (isEnglishName) {
      // 영어 이름: 40px 크기로 2줄 표시 (성과 이름) - 비율 적용
      // 하이픈을 공백으로 변환하여 처리
      const nameWithoutHyphen = playerName.trim().replace(/-/g, ' ');
      const nameParts = nameWithoutHyphen.split(/\s+/).filter((part: string) => part.length > 0);
      if (nameParts.length >= 2) {
        // 성과 이름이 모두 있는 경우
        const lastName = nameParts[nameParts.length - 1]; // 마지막 단어가 성
        const firstName = nameParts.slice(0, -1).join(' '); // 나머지가 이름

        const englishNameSize = 40 * scale;
        ctx.font = `900 ${englishNameSize}px Arial`; // 매우 굵은 체
        ctx.textBaseline = 'bottom';

        // 영어 이름 위치: 한글 이름보다 위로 올려서 2줄 전체가 보이도록 조정
        // 아래쪽 줄이 한글 이름 위치보다 3px 위에 오도록, 위쪽 줄은 그 위에 배치
        const englishNameBottomY = koreanNameY - (3 * scale); // 아래쪽 줄이 한글 이름 위치보다 3px 위
        const englishNameTopY = englishNameBottomY - (englishNameSize + 5 * scale); // 위쪽 줄 위치 (크기 + 간격)

        // 성 (위쪽 줄)
        ctx.fillText(lastName, pxWidth / 2, englishNameTopY);

        // 이름 (아래쪽 줄)
        ctx.fillText(firstName, pxWidth / 2, englishNameBottomY);
      } else {
        // 단어가 하나만 있는 경우: 한글 이름과 동일한 위치 사용
        ctx.font = `900 ${fontSizes.playerName * scale}px Arial`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(playerName, pxWidth / 2, koreanNameY);
      }
    } else {
      // 한글 이름: 기존 위치 유지 - 비율 적용
      ctx.font = `900 ${fontSizes.playerName * scale}px Arial`; // 매우 굵은 체
      ctx.textBaseline = 'bottom';
      ctx.fillText(playerName, pxWidth / 2, koreanNameY);
    }
  };

  // PDF 생성
  const generatePDF = async () => {
    if (!selectedGroup || filteredPlayers.length === 0) {
      toast({
        title: "오류",
        description: "그룹을 선택하고 선수가 있어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "PDF 생성 중",
        description: "명찰 PDF를 위해 이미지를 준비하고 있습니다...",
      });

      // 1. 이미지 미리 로딩 (일관성 및 속도 향상)
      const bgImage = new Image();
      await new Promise((resolve, reject) => {
        bgImage.onload = resolve;
        bgImage.onerror = reject;
        bgImage.src = selectedBackground;
      });

      let logoImage: HTMLImageElement | undefined = undefined;
      const logoUrl = uploadedLogos.length > 0 ? uploadedLogos[0].url : undefined;
      if (logoUrl) {
        logoImage = new Image();
        logoImage.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          if (!logoImage) return reject();
          logoImage.onload = resolve;
          logoImage.onerror = reject;
          logoImage.src = logoUrl;
        });
      }

      toast({
        title: "PDF 생성 중",
        description: "명찰 페이지를 구성하고 있습니다...",
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // 인쇄 시 '실제 크기'로 인쇄되도록 설정 (Fit to page 방지)
      pdf.viewerPreferences({
        'PrintScaling': 'None'
      });

      const A4_WIDTH = 210;
      const A4_HEIGHT = 297;
      const MARGIN = 5; // 여백
      const SPACING = 5; // 명찰 간 간격

      // 한 페이지에 들어갈 수 있는 명찰 개수 계산
      const badgesPerRow = Math.floor((A4_WIDTH - MARGIN * 2) / (badgeWidth + SPACING));
      const badgesPerCol = Math.floor((A4_HEIGHT - MARGIN * 2) / (badgeHeight + SPACING));
      const badgesPerPage = badgesPerRow * badgesPerCol;

      let currentPage = 0;
      let badgeIndex = 0;

      // 조별로 처리
      const sortedJos = Object.keys(playersByJo).sort((a, b) => parseInt(a) - parseInt(b));

      for (const jo of sortedJos) {
        const players = playersByJo[jo];

        for (const player of players) {
          if (badgeIndex % badgesPerPage === 0) {
            if (currentPage > 0) {
              pdf.addPage();
            }
            currentPage++;
          }

          const pageIndex = badgeIndex % badgesPerPage;
          const row = Math.floor(pageIndex / badgesPerRow);
          const col = pageIndex % badgesPerRow;

          const x = MARGIN + col * (badgeWidth + SPACING);
          const y = MARGIN + row * (badgeHeight + SPACING);

          // 임시 캔버스에 명찰 그리기
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          // 미리 로딩된 이미지 전달
          await drawBadge(
            ctx,
            player,
            selectedGroup,
            tournament.name || '대회명',
            badgeWidth,
            badgeHeight,
            logoSettings.showLogo ? logoUrl : undefined,
            logoSettings.size,
            logoSettings.offsetX,
            logoSettings.offsetY,
            logoSettings.opacity,
            bgImage,      // Preloaded Background
            logoImage     // Preloaded Logo
          );

          // Canvas를 이미지로 변환하여 PDF에 추가
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', x, y, badgeWidth, badgeHeight);

          badgeIndex++;
        }
      }

      // PDF 다운로드 (Blob 방식 사용 - 모바일 호환성 개선)
      const blob = pdf.output('blob');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // 파일명 안전하게 처리
      const safeGroupName = selectedGroup.replace(/[<>:"/\\|?*]/g, '_');
      link.download = `명찰_${safeGroupName}_${new Date().getTime()}.pdf`;

      document.body.appendChild(link);
      link.click();

      // 메모리 정리
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);

      toast({
        title: "성공",
        description: "PDF가 생성되었습니다.",
      });
    } catch (error: any) {
      console.error('PDF 생성 오류:', error);
      toast({
        title: "오류",
        description: `PDF 생성 실패: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  // 백업용 PDF 다운로드 (브라우저 인쇄 엔진 사용)
  const handlePrintBackup = async () => {
    if (!selectedGroup || filteredPlayers.length === 0) {
      toast({
        title: "오류",
        description: "그룹을 선택하고 선수가 있어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsBackupPrinting(true);
      toast({
        title: "인쇄용 데이터 생성 중",
        description: "안전 모드로 명찰을 준비하고 있습니다...",
      });

      // 1. 이미지 미리 로딩
      const bgImage = new Image();
      await new Promise((resolve, reject) => {
        bgImage.onload = resolve;
        bgImage.onerror = reject;
        bgImage.src = selectedBackground;
      });

      let logoImage: HTMLImageElement | undefined = undefined;
      const logoUrl = uploadedLogos.length > 0 ? uploadedLogos[0].url : undefined;
      if (logoUrl) {
        logoImage = new Image();
        logoImage.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          if (!logoImage) return reject();
          logoImage.onload = resolve;
          logoImage.onerror = reject;
          logoImage.src = logoUrl;
        });
      }

      // 2. 인쇄용 컨테이너 생성 (기존 컨테이너가 있으면 제거 후 새로 생성)
      const existingContainer = document.getElementById('badge-print-backup-container');
      if (existingContainer) {
        document.body.removeChild(existingContainer);
      }

      const printContainer = document.createElement('div');
      printContainer.id = 'badge-print-backup-container';
      document.body.appendChild(printContainer);

      // 3. 인쇄 전용 스타일 주입
      const style = document.createElement('style');
      style.innerHTML = `
        /* 화면에서는 숨김 (공간도 차지하지 않도록) */
        @media screen {
            #badge-print-backup-container {
                position: fixed;
                left: -9999px;
                top: 0;
                width: 1px;
                height: 1px;
                overflow: hidden;
                opacity: 0;
                z-index: -9999;
            }
        }

        /* 인쇄 시에는 보이게 설정 */
        @media print {
            body * {
                visibility: hidden; 
            }
            #badge-print-backup-container, #badge-print-backup-container * {
                visibility: visible;
            }
            #badge-print-backup-container {
                position: absolute;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                height: auto !important;
                overflow: visible !important;
                opacity: 1 !important;
                z-index: 9999;
            }
            .badge-page {
                width: 210mm;
                height: 297mm;
                page-break-after: always;
                position: relative;
                background-color: white;
                margin: 0;
                padding: 0;
            }
            .badge-item {
                position: absolute;
            }
        }
      `;
      printContainer.appendChild(style);

      // 4. 명찰 데이터 생성
      const A4_WIDTH = 210;
      const A4_HEIGHT = 297;
      const MARGIN = 5;
      const SPACING = 5;
      const badgesPerRow = Math.floor((A4_WIDTH - MARGIN * 2) / (badgeWidth + SPACING));
      const badgesPerCol = Math.floor((A4_HEIGHT - MARGIN * 2) / (badgeHeight + SPACING));
      const badgesPerPage = badgesPerRow * badgesPerCol;

      let currentPageDiv: HTMLDivElement | null = null;
      let badgeIndex = 0;

      const sortedJos = Object.keys(playersByJo).sort((a, b) => parseInt(a) - parseInt(b));

      for (const jo of sortedJos) {
        const players = playersByJo[jo];
        for (const player of players) {
          // 새 페이지 시작 필요 여부 확인
          if (badgeIndex % badgesPerPage === 0) {
            currentPageDiv = document.createElement('div');
            currentPageDiv.className = 'badge-page';
            printContainer.appendChild(currentPageDiv);
          }

          if (!currentPageDiv) continue;

          const pageIndex = badgeIndex % badgesPerPage;
          const row = Math.floor(pageIndex / badgesPerRow);
          const col = pageIndex % badgesPerRow;

          // 위치 계산 (mm)
          const xMM = MARGIN + col * (badgeWidth + SPACING);
          const yMM = MARGIN + row * (badgeHeight + SPACING);

          // 캔버스 생성 및 그리기
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await drawBadge(
              ctx,
              player,
              selectedGroup,
              tournament.name || '대회명',
              badgeWidth,
              badgeHeight,
              logoSettings.showLogo ? logoUrl : undefined,
              logoSettings.size,
              logoSettings.offsetX,
              logoSettings.offsetY,
              logoSettings.opacity,
              bgImage,
              logoImage
            );

            // 캔버스를 이미지로 변환하여 페이지에 추가
            const img = document.createElement('img');
            img.src = canvas.toDataURL('image/png');
            img.className = 'badge-item';
            img.style.left = `${xMM}mm`;
            img.style.top = `${yMM}mm`;
            img.style.width = `${badgeWidth}mm`;
            img.style.height = `${badgeHeight}mm`;

            currentPageDiv.appendChild(img);
          }

          badgeIndex++;
        }
      }

      // 5. 인쇄 실행
      // 이미지 렌더링을 위해 약간 대기
      await new Promise(resolve => setTimeout(resolve, 500));
      window.print();

      // 인쇄 대화상자가 닫힌 후라고 가정하고(정확히는 알 수 없지만) 컨테이너 제거
      // 대화상자가 떠있는 동안 DOM을 제거하면 하얗게 나올 수 있으므로, 충분히 늦게 제거하거나 
      // 사용자가 직접 닫았을 때 제거되어야 함. 
      // 여기서는 타임아웃을 길게 주어 처리 (1초 후는 너무 빠를 수 있음. window.print는 블로킹일 수도 아닐 수도 브라우저마다 다름)
      // *중요*: 모바일/일부 브라우저에서 window.print는 비동기일 수 있음.
      // 안전을 위해 컨테이너는 남겨두되 숨김 처리하거나, 다음 인쇄 시 제거하도록 로직 구성 (위 2번에서 처리됨)

    } catch (error) {
      console.error('백업 인쇄 실패:', error);
      toast({
        title: "오류",
        description: "인쇄 준비 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsBackupPrinting(false);
    }
  };

  // 미리보기 업데이트
  useEffect(() => {
    let isMounted = true;

    const renderPreview = async () => {
      if (!previewCanvasRef.current) return;

      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 그룹과 선수가 없으면 캔버스 초기화만
      if (!selectedGroup || filteredPlayers.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const firstPlayer = filteredPlayers[0];
      const logoUrl = uploadedLogos.length > 0 ? uploadedLogos[0].url : undefined;

      try {
        // 1. 배경 이미지 미리 로딩
        const bgImage = new Image();
        await new Promise((resolve, reject) => {
          bgImage.onload = resolve;
          bgImage.onerror = reject;
          bgImage.src = selectedBackground;
        });

        // 2. 로고 이미지 미리 로딩
        let logoImage: HTMLImageElement | undefined = undefined;
        if (logoUrl) {
          logoImage = new Image();
          logoImage.crossOrigin = 'anonymous';
          await new Promise((resolve, reject) => {
            if (!logoImage) return reject();
            logoImage.onload = resolve;
            logoImage.onerror = reject;
            logoImage.src = logoUrl;
          });
        }

        if (!isMounted) return;

        // 3. 미리 로딩된 이미지로 그리기
        await drawBadge(
          ctx,
          firstPlayer,
          selectedGroup,
          tournament.name || '대회명',
          badgeWidth,
          badgeHeight,
          logoSettings.showLogo ? logoUrl : undefined,
          logoSettings.size,
          logoSettings.offsetX,
          logoSettings.offsetY,
          logoSettings.opacity,
          bgImage,
          logoImage
        );
      } catch (error) {
        console.error("미리보기 렌더링 실패:", error);
      }
    };

    renderPreview();

    return () => {
      isMounted = false;
    };
  }, [selectedBackground, badgeWidth, badgeHeight, selectedGroup, filteredPlayers, fontSizes, textColors, tournament.name, uploadedLogos, logoSettings]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>명찰 제작</CardTitle>
          <CardDescription>
            배경 이미지와 설정을 선택하여 선수 명찰을 제작하고 PDF로 다운로드하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 배경 이미지 선택 */}
          <div className="space-y-2">
            <Label>배경 이미지 선택</Label>
            {/* 색상 샘플 표 */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-xs text-muted-foreground mb-2">배경별 기본 색상 (클릭하여 선택)</div>
              <div className="grid grid-cols-11 gap-2">
                {BACKGROUND_IMAGES.map((img, index) => {
                  const color = BACKGROUND_COLORS[img] || '#000000';
                  const isSelected = selectedBackground === img;
                  return (
                    <div
                      key={img}
                      className={`flex flex-col items-center gap-1 p-2 rounded border-2 transition-all cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        }`}
                      onClick={() => setSelectedBackground(img)}
                      title={`배경 ${index + 1} - ${color}`}
                    >
                      <div
                        className="w-full h-12 rounded"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium">배경 {index + 1}</span>
                      <span className="text-xs text-muted-foreground">{color}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 명찰 크기 설정 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>명찰 가로 크기 (mm)</Label>
              <Input
                type="number"
                value={badgeWidth}
                onChange={(e) => setBadgeWidth(Number(e.target.value))}
                min={10}
                max={200}
              />
            </div>
            <div className="space-y-2">
              <Label>명찰 세로 크기 (mm)</Label>
              <Input
                type="number"
                value={badgeHeight}
                onChange={(e) => setBadgeHeight(Number(e.target.value))}
                min={10}
                max={200}
              />
            </div>
          </div>

          {/* 타입 및 그룹 선택 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>대회 타입</Label>
              <Select value={selectedType} onValueChange={(v: 'individual' | 'team') => setSelectedType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">개인전</SelectItem>
                  <SelectItem value="team">팀전</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>그룹 선택</Label>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger>
                  <SelectValue placeholder="그룹을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {availableGroups.map((groupName) => (
                    <SelectItem key={groupName} value={groupName}>
                      {groupName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 텍스트 크기 설정 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">텍스트 크기 설정</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>대회명 크기</Label>
                <Input
                  type="number"
                  value={fontSizes.tournamentName}
                  onChange={(e) => setFontSizes({ ...fontSizes, tournamentName: Number(e.target.value) })}
                  min={4}
                  max={20}
                />
              </div>
              <div className="space-y-2">
                <Label>조 이름 크기</Label>
                <Input
                  type="number"
                  value={fontSizes.joName}
                  onChange={(e) => setFontSizes({ ...fontSizes, joName: Number(e.target.value) })}
                  min={10}
                  max={50}
                />
              </div>
              <div className="space-y-2">
                <Label>그룹명 크기</Label>
                <Input
                  type="number"
                  value={fontSizes.groupName}
                  onChange={(e) => setFontSizes({ ...fontSizes, groupName: Number(e.target.value) })}
                  min={6}
                  max={30}
                />
              </div>
              <div className="space-y-2">
                <Label>이름 크기</Label>
                <Input
                  type="number"
                  value={fontSizes.playerName}
                  onChange={(e) => setFontSizes({ ...fontSizes, playerName: Number(e.target.value) })}
                  min={10}
                  max={60}
                />
              </div>
            </CardContent>
          </Card>

          {/* 텍스트 색상 설정 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">텍스트 색상 설정</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>대회명 색상</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={textColors.tournamentName}
                    onChange={(e) => setTextColors({ ...textColors, tournamentName: e.target.value })}
                    className="w-20"
                  />
                  <Input
                    type="text"
                    value={textColors.tournamentName}
                    onChange={(e) => setTextColors({ ...textColors, tournamentName: e.target.value })}
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>조 이름 색상</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={textColors.joName}
                    onChange={(e) => setTextColors({ ...textColors, joName: e.target.value })}
                    className="w-20"
                  />
                  <Input
                    type="text"
                    value={textColors.joName}
                    onChange={(e) => setTextColors({ ...textColors, joName: e.target.value })}
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>그룹명 색상</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={textColors.groupName}
                    onChange={(e) => setTextColors({ ...textColors, groupName: e.target.value })}
                    className="w-20"
                  />
                  <Input
                    type="text"
                    value={textColors.groupName}
                    onChange={(e) => setTextColors({ ...textColors, groupName: e.target.value })}
                    placeholder="#666666"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>이름 색상</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={textColors.playerName}
                    onChange={(e) => setTextColors({ ...textColors, playerName: e.target.value })}
                    className="w-20"
                  />
                  <Input
                    type="text"
                    value={textColors.playerName}
                    onChange={(e) => setTextColors({ ...textColors, playerName: e.target.value })}
                    placeholder="#0066CC"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 로고 설정 */}
          <Card>
            <CardHeader>

              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">로고 설정</CardTitle>
                  <CardDescription>배경 로고의 크기, 위치, 진하기를 조정할 수 있습니다</CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-logo"
                    checked={logoSettings.showLogo}
                    onCheckedChange={(checked) => updateLogoSettings({ showLogo: checked })}
                  />
                  <Label htmlFor="show-logo">로고 켜기/끄기</Label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>로고 크기 ({Math.round(logoSettings.size * 100)}%)</Label>
                <Input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={logoSettings.size}
                  onChange={(e) => updateLogoSettings({ size: Number(e.target.value) })}
                  className="w-full"
                />
                <Input
                  type="number"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={logoSettings.size}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 0.1 && val <= 1.0) {
                      updateLogoSettings({ size: val });
                    }
                  }}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>로고 진하기 ({Math.round(logoSettings.opacity * 100)}%)</Label>
                <Input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.01"
                  value={logoSettings.opacity}
                  onChange={(e) => updateLogoSettings({ opacity: Number(e.target.value) })}
                  className="w-full"
                />
                <Input
                  type="number"
                  min="0.0"
                  max="1.0"
                  step="0.01"
                  value={logoSettings.opacity}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 0.0 && val <= 1.0) {
                      updateLogoSettings({ opacity: val });
                    }
                  }}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>가로 위치 (X: {logoSettings.offsetX}px)</Label>
                <Input
                  type="range"
                  min="-200"
                  max="200"
                  step="1"
                  value={logoSettings.offsetX}
                  onChange={(e) => updateLogoSettings({ offsetX: Number(e.target.value) })}
                  className="w-full"
                />
                <Input
                  type="number"
                  min="-200"
                  max="200"
                  step="1"
                  value={logoSettings.offsetX}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= -200 && val <= 200) {
                      updateLogoSettings({ offsetX: val });
                    }
                  }}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>세로 위치 (Y: {logoSettings.offsetY}px)</Label>
                <Input
                  type="range"
                  min="-200"
                  max="200"
                  step="1"
                  value={logoSettings.offsetY}
                  onChange={(e) => updateLogoSettings({ offsetY: Number(e.target.value) })}
                  className="w-full"
                />
                <Input
                  type="number"
                  min="-200"
                  max="200"
                  step="1"
                  value={logoSettings.offsetY}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= -200 && val <= 200) {
                      updateLogoSettings({ offsetY: val });
                    }
                  }}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>

          {/* 미리보기 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">미리보기</CardTitle>
              <CardDescription>
                {selectedGroup && filteredPlayers.length > 0
                  ? "첫 번째 선수의 명찰 미리보기 (실제 크기와 다를 수 있습니다)"
                  : "그룹을 선택하면 미리보기가 표시됩니다"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <canvas
                  ref={previewCanvasRef}
                  className="border border-gray-300"
                  style={{
                    width: `${badgeWidth * 3.779527559}px`, // mm to px (96 DPI)
                    height: `${badgeHeight * 3.779527559}px`,
                    maxWidth: '100%',
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* 통계 및 생성 버튼 */}
          {selectedGroup && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    선택된 그룹: <span className="font-semibold">{selectedGroup}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    총 선수 수: <span className="font-semibold">{filteredPlayers.length}명</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    조 수: <span className="font-semibold">{Object.keys(playersByJo).length}개</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={generatePDF}
                      className="flex-1"
                      size="lg"
                      disabled={!selectedGroup || filteredPlayers.length === 0}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      PDF 다운로드
                    </Button>
                    <Button
                      onClick={handlePrintBackup}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                      size="lg"
                      disabled={!selectedGroup || filteredPlayers.length === 0 || isBackupPrinting}
                    >
                      {isBackupPrinting ? (
                        <Settings className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      PDF 다운로드 2 (백업용)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 로고 관리 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">로고 관리</CardTitle>
              <CardDescription>
                배경 로고를 업로드하고 관리하세요. 업로드한 로고는 명찰, 수기 채점표, 점수표, 조 편성표의 배경에 사용됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 로고 업로드 */}
              <div className="space-y-2">
                <Label>로고 업로드</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={isUploading}
                    className="flex-1"
                  />
                  {isUploading && (
                    <span className="text-sm text-muted-foreground">업로드 중...</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  이미지 파일만 업로드 가능합니다. (최대 2MB)
                </p>
              </div>

              {/* 업로드된 로고 목록 */}
              {uploadedLogos.length > 0 && (
                <div className="space-y-2">
                  <Label>업로드된 로고</Label>
                  <div className="grid grid-cols-3 gap-4">
                    {uploadedLogos.map((logo) => (
                      <div
                        key={logo.name}
                        className="relative border rounded-lg p-2 hover:bg-gray-50 transition-colors"
                      >
                        <div className="aspect-square relative mb-2">
                          <img
                            src={logo.thumbnail || logo.url}
                            alt={logo.name}
                            className="w-full h-full object-contain rounded"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground truncate flex-1">
                            {logo.name.replace(/^logo_\d+_/, '')}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLogoDelete(logo.name)}
                            className="h-6 w-6 p-0"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadedLogos.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Upload className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">업로드된 로고가 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

