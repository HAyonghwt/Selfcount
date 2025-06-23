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
              <Image 
                src="/logo.png" 
                alt="파크골프대회 로고"
                width={40}
                height={40}
                className="h-10 w-10"
              />
              <div className="group-data-[collapsible=icon]:hidden transition-opacity duration-200">
                <h1 className="text-xl font-bold font-headline">파크골프대회</h1>
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
