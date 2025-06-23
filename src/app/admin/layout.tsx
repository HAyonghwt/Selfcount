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
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
                  <path d="M 0,90 C 20,70 80,70 100,90 L 100,100 L 0,100 Z" fill="#4ade80" />
                  <rect x="49" y="20" width="2" height="70" fill="#a1a1aa" />
                  <polygon points="51,22 81,22 73,33 51,33" fill="currentColor"/>
                  <ellipse cx="50" cy="90" rx="7" ry="2.5" fill="#3f3f46"/>
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
