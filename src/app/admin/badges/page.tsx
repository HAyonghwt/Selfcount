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
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import { Download, Settings } from "lucide-react";
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
];

// 배경 이미지별 기본 이름 색상
const BACKGROUND_COLORS: { [key: string]: string } = {
  '/badges/001.jpg': '#1b7eff',
  '/badges/002.jpg': '#1b9acf',
  '/badges/003.jpg': '#a6ce39',
  '/badges/004.jpg': '#fd6f23',
  '/badges/005.jpg': '#fc522f',
  '/badges/006.jpg': '#ef59a1',
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
  
  // 미리보기용 캔버스 ref
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const badgeContainerRef = useRef<HTMLDivElement>(null);

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

  // 선택된 그룹의 선수 목록 필터링
  const filteredPlayers = allPlayers.filter(player => {
    if (!selectedGroup) return false;
    if (player.type !== selectedType) return false;
    if (player.group !== selectedGroup) return false;
    return true;
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
    height: number
  ) => {
    // 배경 이미지 로드
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = selectedBackground;
    });
    
    // 배경 이미지 그리기
    ctx.drawImage(img, 0, 0, width, height);
    
    // 픽셀 단위로 변환 (mm to px, 96 DPI 기준)
    const mmToPx = (mm: number) => (mm * 96) / 25.4;
    const pxWidth = mmToPx(width);
    const pxHeight = mmToPx(height);
    
    // Canvas 크기 설정
    ctx.canvas.width = pxWidth;
    ctx.canvas.height = pxHeight;
    
    // 배경 이미지 다시 그리기 (새로운 크기에 맞춰)
    ctx.drawImage(img, 0, 0, pxWidth, pxHeight);
    
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
      const nameParts = nameWithoutHyphen.split(/\s+/).filter(part => part.length > 0);
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
        description: "명찰 PDF를 생성하고 있습니다...",
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
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

          await drawBadge(ctx, player, selectedGroup, tournament.name || '대회명', badgeWidth, badgeHeight);

          // Canvas를 이미지로 변환하여 PDF에 추가
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', x, y, badgeWidth, badgeHeight);

          badgeIndex++;
        }
      }

      // PDF 다운로드
      pdf.save(`명찰_${selectedGroup}_${new Date().getTime()}.pdf`);

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

  // 미리보기 업데이트
  useEffect(() => {
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
    drawBadge(ctx, firstPlayer, selectedGroup, tournament.name || '대회명', badgeWidth, badgeHeight).catch(console.error);
  }, [selectedBackground, badgeWidth, badgeHeight, selectedGroup, filteredPlayers, fontSizes, textColors, tournament.name]);

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
            <Select value={selectedBackground} onValueChange={setSelectedBackground}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BACKGROUND_IMAGES.map((img, index) => (
                  <SelectItem key={img} value={img}>
                    배경 {index + 1} ({img.split('/').pop()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  <Button
                    onClick={generatePDF}
                    className="w-full"
                    size="lg"
                    disabled={!selectedGroup || filteredPlayers.length === 0}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    PDF 다운로드
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

