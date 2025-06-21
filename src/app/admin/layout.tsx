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
  ChevronLeft,
  Settings,
  LogOut,
  Target
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
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"

const navItems = [
  { href: "/admin/dashboard", icon: BarChart2, label: "홈 전광판" },
  { href: "/admin/tournaments", icon: Trophy, label: "대회·코스 관리" },
  { href: "/admin/players", icon: Users, label: "선수 관리" },
  { href: "/admin/scores", icon: ClipboardList, label: "점수 관리" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background">
        <Sidebar collapsible="icon" className="border-r">
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 text-primary rounded-lg">
                <Target className="w-8 h-8"/>
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
                     <a href="/scoreboard" target="_blank" rel="noopener noreferrer">
                        <Tv className="h-5 w-5 text-accent" />
                        <span className="text-accent">외부 전광판</span>
                    </a>
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
        <SidebarInset className="bg-secondary/40">
           <div className="p-4 sm:p-6 lg:p-8 h-full overflow-y-auto">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
