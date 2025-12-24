"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  BarChart2,
  Trophy,
  Users,
  ClipboardList,
  Tv,
  LogOut,
  Flame,
  ShieldCheck,
  FileText,
  Database,
  CreditCard,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { get, ref, update, onValue } from "firebase/database"
import { db } from "@/lib/firebase"
import { safeSessionStorageGetItem } from "@/lib/utils"

const mainNavItems = [
  { href: "/admin/main", icon: ClipboardList, label: "메인" },
  { href: "/admin/dashboard", icon: BarChart2, label: "홈 전광판" },
  { href: "/admin/tournaments", icon: Trophy, label: "대회 및 코스 관리" },
  { href: "/admin/players", icon: Users, label: "그룹 및 선수관리" },
];

const secondaryNavItems = [
  { href: "/admin/suddendeath", icon: Flame, label: "플레이오프 관리" },
  { href: "/admin/gift-event", icon: Trophy, label: "경품 행사" },
  { href: "/admin/archive", icon: Trophy, label: "기록 보관함" },
  { href: "/admin/backup", icon: Database, label: "시스템 백업" },
];
const refereeNavItem = { href: "/admin/referees", icon: ShieldCheck, label: "심판 관리" };
const selfScoringNavItem = { href: "/admin/self-scoring", icon: ShieldCheck, label: "자율 채점" };
const manualScorecardNavItem = { href: "/admin/manual-scorecard", icon: FileText, label: "수기 채점표" };
const badgeNavItem = { href: "/admin/badges", icon: CreditCard, label: "명찰 제작" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const [isClient, setIsClient] = React.useState(false);
  const [appName, setAppName] = React.useState('');
  const [selfScoringEnabled, setSelfScoringEnabled] = React.useState(true);
  const [manualScorecardEnabled, setManualScorecardEnabled] = React.useState(true);

  React.useEffect(() => {
    setIsClient(true)

    // 🟢 기본값 설정 (Firebase 접근 실패 시에도 앱이 동작하도록)
    setAppName('ParkScore');
    setSelfScoringEnabled(true);
    setManualScorecardEnabled(true);

    if (db) {
      // 🟢 딜레이를 두고 config 접근 (인증 완료 대기)
      const timer = setTimeout(() => {
        try {
          if (!db) return;
          const configRef = ref(db, 'config');
          // 실시간으로 설정 변경 감지
          const unsubscribe = onValue(configRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.val();
              if (data.appName) {
                setAppName(data.appName);
              }
              // 자율 채점 활성화 설정 읽기 (기본값: true)
              const enabled = data.selfScoringEnabled !== false;
              setSelfScoringEnabled(enabled);
              // 수기 채점표 활성화 설정 읽기 (기본값: true)
              const manualEnabled = data.manualScorecardEnabled !== false;
              setManualScorecardEnabled(manualEnabled);
            }
          }, (error) => {
            console.warn('설정 로드 실패 (기본값 사용):', error);
            // 🟢 오류 발생해도 기본값으로 계속 동작
          });

          return () => unsubscribe();
        } catch (error) {
          console.warn('Config 접근 실패 (기본값 사용):', error);
        }
      }, 1000); // 1초 딜레이

      return () => clearTimeout(timer);
    }
  }, [])

  if (!isClient) {
    return (
      <div className="flex h-screen bg-background">
        <div className="w-16 md:w-64 border-r p-4 hidden md:flex flex-col gap-2">
          <div className="p-2">
            <Skeleton className="w-full h-10 mb-4" />
          </div>
          <div className="flex flex-col gap-1 p-2">
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
          </div>
        </div>
        <main className="flex-1 p-6 bg-secondary/40">
          <Skeleton className="w-full h-full" />
        </main>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <SidebarContentWithSidebarHooks
        isMobile={isMobile}
        pathname={pathname}
        appName={appName}
        selfScoringEnabled={selfScoringEnabled}
        manualScorecardEnabled={manualScorecardEnabled}
        children={children}
      />
    </SidebarProvider>
  );
}

import { useRouter } from "next/navigation";

function SidebarContentWithSidebarHooks({ isMobile, pathname, appName, selfScoringEnabled, manualScorecardEnabled, children }: { isMobile: boolean, pathname: string, appName: string, selfScoringEnabled: boolean, manualScorecardEnabled: boolean, children: React.ReactNode }) {
  const { setOpenMobile } = useSidebar();
  const router = useRouter();
  const [isHost, setIsHost] = React.useState(false);

  // 사회자 권한 체크
  React.useEffect(() => {
    try {
      const hostData = safeSessionStorageGetItem('hostData');
      if (hostData) {
        const parsed = JSON.parse(hostData);
        if (parsed && parsed.id === '사회자') {
          setIsHost(true);
        }
      }
    } catch (error) {
      // sessionStorage 읽기 실패 시 무시
    }
  }, []);

  const handleMenuClick = (href: string) => (e: React.MouseEvent) => {
    if (isMobile) {
      e.preventDefault();
      setOpenMobile(false);
      setTimeout(() => {
        router.push(href);
      }, 200); // Sheet 닫힘 애니메이션 후 이동
    }
    // 데스크탑은 Link 기본 동작
  }

  // 사회자인 경우 경품 행사만 필터링
  const filteredMainNavItems = isHost ? [] : mainNavItems;
  const filteredSecondaryNavItems = isHost 
    ? secondaryNavItems.filter(item => item.href === '/admin/gift-event')
    : secondaryNavItems;

  return (
    <div className="flex h-screen bg-background">
      {/* 모바일에서만 항상 보이는 햄버거 버튼 */}
      <div className="md:hidden">
        <SidebarTrigger className="z-50 fixed top-4 left-4" />
      </div>

      <Sidebar collapsible={isMobile ? "offcanvas" : "icon"} className="border-r">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt={`${appName} 로고`}
              width={40}
              height={40}
              className="h-10 w-10"
            />
            <div className="group-data-[collapsible=icon]:hidden transition-opacity duration-200">
              <h1 className="text-xl font-bold font-headline">{appName || <Skeleton className="h-6 w-32" />}</h1>
              <p className="text-xs text-muted-foreground">관리자 패널</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={{ children: "외부 전광판" }}>
                <Link href="/scoreboard" target="_blank" rel="noopener noreferrer" className="text-black" onClick={handleMenuClick("/scoreboard")}>
                  <Tv className="h-5 w-5 text-primary" />
                  <span className="text-primary font-semibold">외부 전광판</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>


            <SidebarSeparator className="my-2" />

            {filteredMainNavItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={{ children: item.label }}
                >
                  <Link href={item.href} className="text-black" onClick={handleMenuClick(item.href)}>
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            <SidebarSeparator className="my-2" />

            {filteredSecondaryNavItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={{ children: item.label }}
                >
                  <Link href={item.href} className="text-black" onClick={handleMenuClick(item.href)}>
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {!isHost && (
              <>
                <SidebarSeparator className="my-2" />
                <SidebarMenuItem key={refereeNavItem.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === refereeNavItem.href}
                    tooltip={{ children: refereeNavItem.label }}
                  >
                    <Link href={refereeNavItem.href} className="text-black" onClick={handleMenuClick(refereeNavItem.href)}>
                      <refereeNavItem.icon className="h-5 w-5" />
                      <span>{refereeNavItem.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {selfScoringEnabled && (
                  <SidebarMenuItem key={selfScoringNavItem.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === selfScoringNavItem.href}
                      tooltip={{ children: selfScoringNavItem.label }}
                    >
                      <Link href={selfScoringNavItem.href} className="text-black" onClick={handleMenuClick(selfScoringNavItem.href)}>
                        <selfScoringNavItem.icon className="h-5 w-5" />
                        <span>{selfScoringNavItem.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {manualScorecardEnabled && (
                  <SidebarMenuItem key={manualScorecardNavItem.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === manualScorecardNavItem.href}
                      tooltip={{ children: manualScorecardNavItem.label }}
                    >
                      <Link href={manualScorecardNavItem.href} className="text-black" onClick={handleMenuClick(manualScorecardNavItem.href)}>
                        <manualScorecardNavItem.icon className="h-5 w-5" />
                        <span>{manualScorecardNavItem.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem key={badgeNavItem.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === badgeNavItem.href}
                    tooltip={{ children: badgeNavItem.label }}
                  >
                    <Link href={badgeNavItem.href} className="text-black" onClick={handleMenuClick(badgeNavItem.href)}>
                      <badgeNavItem.icon className="h-5 w-5" />
                      <span>{badgeNavItem.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}

          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4 border-t">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={{ children: "로그아웃" }}>
                <Link href="/" className="text-black">
                  <LogOut className="h-5 w-5" />
                  <span>로그아웃</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <main className="flex-1 bg-secondary/40">
        <div className="p-4 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
