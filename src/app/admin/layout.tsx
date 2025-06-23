"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart2,
  Trophy,
  Users,
  ClipboardList,
  Tv,
  Settings,
  LogOut,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

const navItems = [
  { href: "/admin/dashboard", icon: BarChart2, label: "홈 전광판" },
  { href: "/admin/tournaments", icon: Trophy, label: "대회 및 코스 관리" },
  { href: "/admin/players", icon: Users, label: "선수 관리" },
  { href: "/admin/scores", icon: ClipboardList, label: "점수 관리" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isClient, setIsClient] = React.useState(false)

  React.useEffect(() => {
    setIsClient(true)
  }, [])

  // Render a skeleton layout on the server and during initial client render
  // to prevent hydration mismatch.
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
      <div className="flex h-screen bg-background">
        <Sidebar collapsible="icon" className="border-r">
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 text-primary rounded-lg">
                <svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
                  <path d="M20,135 C20,125 180,125 180,135 C180,145 20,145 20,145Z" fill="#e2e8f0" />
                  <path d="M175.7,83.9c-2.4-23-22.7-41.1-45.8-41.1c-16.1,0-30.2,7.5-38.9,18.9c-5.9,7.8-9.4,17.5-9.4,28.2 c0,23.3,17.9,42.2,40,42.2c16.1,0,30.2-7.5,38.9-18.9C166.4,105.4,173.3,95.7,175.7,83.9z M48,79.9 c0-21,17-38,38-38s38,17,38,38s-17,38-38,38S48,100.9,48,79.9z" fill="#4ade80" transform="translate(0, -10)" />
                  <ellipse cx="65" cy="110" rx="14" ry="5" fill="#1e293b"/>
                  <rect x="64" y="30" width="3" height="80" fill="#94a3b8" />
                  <polygon points="67,32 97,32 89,43 67,43" fill="currentColor"/>
                  <circle cx="115" cy="100" r="9" fill="#FFFFFF" />
                  <path d="M 110,95 A 7,7 0 0,0 120,105" fill="none" stroke="#e2e8f0" strokeWidth="2" />
                </svg>
              </div>
              <div className="group-data-[collapsible=icon]:hidden transition-opacity duration-200">
                <h1 className="text-xl font-bold font-headline">ParkScore</h1>
                <p className="text-xs text-muted-foreground">관리자 패널</p>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={{ children: item.label }}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
               <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={{ children: "외부 전광판" }}>
                     <Link href="/scoreboard" target="_blank" rel="noopener noreferrer">
                        <Tv className="h-5 w-5 text-primary" />
                        <span className="text-primary font-semibold">외부 전광판</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t">
              <SidebarMenu>
                 <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={{ children: "설정" }}>
                    <Link href="/super-admin">
                      <Settings className="h-5 w-5" />
                      <span>설정</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={{ children: "로그아웃" }}>
                    <Link href="/">
                      <LogOut className="h-5 w-5" />
                      <span>로그아웃</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <main className="flex-1 bg-secondary/40 overflow-y-auto">
           <div className="p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
