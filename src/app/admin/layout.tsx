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
import { get, ref, update } from "firebase/database"
import { db } from "@/lib/firebase"

const mainNavItems = [
  { href: "/admin/dashboard", icon: BarChart2, label: "홈 전광판" },
  { href: "/admin/tournaments", icon: Trophy, label: "대회 및 코스 관리" },
  { href: "/admin/players", icon: Users, label: "선수 관리" },
];

const secondaryNavItems = [
  { href: "/admin/suddendeath", icon: Flame, label: "서든데스 관리" },
  { href: "/admin/gift-event", icon: Trophy, label: "경품 행사" },
  { href: "/admin/archive", icon: Trophy, label: "기록 보관함" },
];
const refereeNavItem = { href: "/admin/referees", icon: ShieldCheck, label: "심판 관리" };
const selfScoringNavItem = { href: "/admin/self-scoring", icon: ShieldCheck, label: "자율 채점" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const [isClient, setIsClient] = React.useState(false);
  const [appName, setAppName] = React.useState('');

  React.useEffect(() => {
    setIsClient(true)
    if (db) {
      const configRef = ref(db, 'config');
      get(configRef).then((snapshot) => {
          if (snapshot.exists() && snapshot.val().appName) {
              setAppName(snapshot.val().appName);
          } else {
              setAppName('ParkScore');
          }
      }).catch(() => {
          setAppName('ParkScore');
      });
    } else {
        setAppName('ParkScore');
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
        children={children}
      />
    </SidebarProvider>
  );
}

import { useRouter } from "next/navigation";

function SidebarContentWithSidebarHooks({ isMobile, pathname, appName, children }: { isMobile: boolean, pathname: string, appName: string, children: React.ReactNode }) {
  const { setOpenMobile } = useSidebar();
  const router = useRouter();

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

            {mainNavItems.map((item) => (
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

            {secondaryNavItems.map((item) => (
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
