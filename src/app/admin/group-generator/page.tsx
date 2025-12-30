"use client"

import React, { useState, useMemo, useEffect } from 'react'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Plus,
    Minus,
    Copy,
    Trash2,
    Settings2,
    LayoutGrid,
    CheckCircle2,
    AlertCircle,
    RotateCcw
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { cn, safeLocalStorageGetItem, safeLocalStorageSetItem, safeLocalStorageRemoveItem } from "@/lib/utils"

interface GroupItem {
    id: string;
    suffix: string; // empty string for base, "-1", "-2" etc.
    players: number;
}

interface HoleItem {
    number: number;
    groups: GroupItem[];
}

interface CourseItem {
    id: string; // A, B, C, D
    name: string;
    holes: HoleItem[];
}

const STORAGE_KEY = 'shotgun_group_generator_data';

export default function GroupGeneratorPage() {
    const { toast } = useToast()
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(['A', 'B'])
    const [defaultPlayers, setDefaultPlayers] = useState<number>(4)
    const [defaultGroupsPerHole, setDefaultGroupsPerHole] = useState<number>(2)
    const [courses, setCourses] = useState<CourseItem[]>([])
    const [copied, setCopied] = useState(false)
    const [isInitialized, setIsInitialized] = useState(false)

    // 초기 데이터 로드 (localStorage 우선)
    useEffect(() => {
        const savedData = safeLocalStorageGetItem(STORAGE_KEY);
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                setSelectedCourseIds(parsed.selectedCourseIds || ['A', 'B']);
                setDefaultPlayers(parsed.defaultPlayers || 4);
                setDefaultGroupsPerHole(parsed.defaultGroupsPerHole || 2);
                setCourses(parsed.courses || []);
                setIsInitialized(true);
                return;
            } catch (e) {
                console.error('Failed to load saved group generator data', e);
            }
        }

        // 저장된 데이터가 없으면 기본 데이터 생성
        const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        const newCourses: CourseItem[] = alphabet.map(id => ({
            id,
            name: `${id} 코스`,
            holes: Array.from({ length: 9 }, (_, i) => ({
                number: i + 1,
                groups: Array.from({ length: 2 }, (_, j) => ({
                    id: `${id}-${i + 1}-${j}`,
                    suffix: j === 0 ? '' : `-${j}`,
                    players: 4
                }))
            }))
        }))
        setCourses(newCourses)
        setIsInitialized(true)
    }, [])

    // 데이터 자동 저장
    useEffect(() => {
        if (!isInitialized) return;

        const dataToSave = {
            selectedCourseIds,
            defaultPlayers,
            defaultGroupsPerHole,
            courses
        };
        safeLocalStorageSetItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }, [selectedCourseIds, defaultPlayers, defaultGroupsPerHole, courses, isInitialized]);

    // 전체 초기화
    const handleReset = () => {
        if (!window.confirm("모든 설정과 생성된 조 데이터를 초기화하시겠습니까? (저장된 데이터가 삭제됩니다)")) return;

        safeLocalStorageRemoveItem(STORAGE_KEY);

        const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        const newCourses: CourseItem[] = alphabet.map(id => ({
            id,
            name: `${id} 코스`,
            holes: Array.from({ length: 9 }, (_, i) => ({
                number: i + 1,
                groups: Array.from({ length: 2 }, (_, j) => ({
                    id: `${id}-${i + 1}-${j}`,
                    suffix: j === 0 ? '' : `-${j}`,
                    players: 4
                }))
            }))
        }))

        setSelectedCourseIds(['A', 'B']);
        setDefaultPlayers(4);
        setDefaultGroupsPerHole(2);
        setCourses(newCourses);

        toast({
            title: "초기화 완료",
            description: "모든 데이터가 기본값으로 복구되었습니다."
        })
    }

    // 기본 설정 변경 시 반영 (기존 데이터 초기화 주의 - 사용자 확인 없이 자동 반영은 위험할 수 있으나 여기서는 편의상 적용)
    const handleApplyDefaults = () => {
        const newCourses = courses.map(course => ({
            ...course,
            holes: course.holes.map(hole => ({
                ...hole,
                groups: Array.from({ length: defaultGroupsPerHole }, (_, j) => ({
                    id: `${course.id}-${hole.number}-${j}`,
                    suffix: j === 0 ? '' : `-${j}`,
                    players: defaultPlayers
                }))
            }))
        }))
        setCourses(newCourses)
        toast({
            title: "기본 설정 적용 완료",
            description: `모든 홀이 ${defaultGroupsPerHole}개 조, 조당 ${defaultPlayers}명으로 초기화되었습니다.`
        })
    }

    // 조 추가
    const addGroup = (courseId: string, holeNumber: number) => {
        setCourses(prev => prev.map(c => {
            if (c.id !== courseId) return c;
            return {
                ...c,
                holes: c.holes.map(h => {
                    if (h.number !== holeNumber) return h;
                    const nextIndex = h.groups.length;
                    return {
                        ...h,
                        groups: [...h.groups, {
                            id: `${courseId}-${holeNumber}-${Date.now()}`,
                            suffix: `-${nextIndex}`,
                            players: defaultPlayers
                        }]
                    }
                })
            }
        }))
    }

    // 조 삭제
    const removeGroup = (courseId: string, holeNumber: number, groupId: string) => {
        setCourses(prev => prev.map(c => {
            if (c.id !== courseId) return c;
            return {
                ...c,
                holes: c.holes.map(h => {
                    if (h.number !== holeNumber) return h;
                    if (h.groups.length <= 1) return h; // 최소 1개 조 유지
                    const newGroups = h.groups.filter(g => g.id !== groupId)
                        // 인덱스 재정렬
                        .map((g, idx) => ({
                            ...g,
                            suffix: idx === 0 ? '' : `-${idx}`
                        }));
                    return {
                        ...h,
                        groups: newGroups
                    }
                })
            }
        }))
    }

    // 인원 수정
    const updatePlayers = (courseId: string, holeNumber: number, groupId: string, delta: number) => {
        setCourses(prev => prev.map(c => {
            if (c.id !== courseId) return c;
            return {
                ...c,
                holes: c.holes.map(h => {
                    if (h.number !== holeNumber) return h;
                    return {
                        ...h,
                        groups: h.groups.map(g => {
                            if (g.id !== groupId) return g;
                            const newVal = Math.max(1, Math.min(10, g.players + delta));
                            return { ...g, players: newVal };
                        })
                    }
                })
            }
        }))
    }

    // 최종 생성 데이터 (복사용 리스트)
    const generatedList = useMemo(() => {
        const list: string[] = [];
        courses
            .filter(c => selectedCourseIds.includes(c.id))
            .forEach(course => {
                course.holes.forEach(hole => {
                    hole.groups.forEach(group => {
                        const groupName = `${course.id}${hole.number}${group.suffix}`;
                        for (let i = 0; i < group.players; i++) {
                            list.push(groupName);
                        }
                    });
                });
            });
        return list;
    }, [courses, selectedCourseIds]);

    const copyToClipboard = () => {
        const text = generatedList.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            toast({
                title: "복사 완료",
                description: "엑셀 '조' 열에 붙여넣기 하세요."
            });
            setTimeout(() => setCopied(false), 2000);
        });
    }

    const toggleCourse = (id: string) => {
        setSelectedCourseIds(prev =>
            prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
        );
    }

    return (
        <div className="flex flex-col gap-6 max-w-[1800px] mx-auto pb-20 px-4 md:px-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">샷건 조 번호 생성기</h1>
                    <p className="text-muted-foreground mt-1 text-sm md:text-base">
                        파크골프 대회 샷건 방식 조 편성을 위한 조 번호를 생성하고 엑셀용 데이터를 복사합니다.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={handleReset}
                        className="gap-2 text-destructive hover:bg-destructive/10 border-destructive/20 h-12 px-6"
                    >
                        <RotateCcw className="h-5 w-5" />
                        초기화
                    </Button>
                    <Button
                        size="lg"
                        onClick={copyToClipboard}
                        className="gap-2 shadow-lg hover:shadow-xl transition-all h-12 px-8 bg-black hover:bg-gray-800 text-white font-bold"
                        disabled={generatedList.length === 0}
                    >
                        {copied ? <CheckCircle2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                        {generatedList.length.toLocaleString()}개 행 복사하기
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* 설정 패널 */}
                <div className="lg:col-span-3 space-y-8">
                    <Card className="border-primary/20 shadow-lg overflow-hidden">
                        <CardHeader className="bg-primary/5 pb-4 border-b">
                            <CardTitle className="text-xl flex items-center gap-2">
                                <Settings2 className="h-6 w-6 text-primary" />
                                🛠️ 기본 설정
                            </CardTitle>
                            <CardDescription>모든 홀에 일괄 적용될 기준입니다.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="space-y-3">
                                <Label className="text-sm font-bold text-gray-700">사용 코스 선택</Label>
                                <div className="grid grid-cols-4 gap-2.5 p-4 bg-secondary/20 rounded-xl border border-dashed border-gray-300">
                                    {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(id => (
                                        <div key={id} className={cn(
                                            "flex flex-col items-center justify-center p-2 rounded-lg border transition-all cursor-pointer select-none gap-2",
                                            selectedCourseIds.includes(id)
                                                ? "bg-primary/10 border-primary shadow-sm"
                                                : "bg-white border-gray-200 opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                                        )}
                                            onClick={() => toggleCourse(id)}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <Checkbox
                                                    id={`course-${id}`}
                                                    checked={selectedCourseIds.includes(id)}
                                                    onCheckedChange={() => toggleCourse(id)}
                                                    className="h-4 w-4"
                                                />
                                                <span className="font-black text-sm">{id}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-gray-500 uppercase">조당 기본 인원</Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={defaultPlayers}
                                            onChange={e => setDefaultPlayers(parseInt(e.target.value) || 0)}
                                            min={1}
                                            max={10}
                                            className="h-12 pl-4 text-lg font-bold"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">명</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-gray-500 uppercase">홀당 기본 조 수</Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={defaultGroupsPerHole}
                                            onChange={e => setDefaultGroupsPerHole(parseInt(e.target.value) || 0)}
                                            min={1}
                                            max={5}
                                            className="h-12 pl-4 text-lg font-bold"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">조</span>
                                    </div>
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full h-12 border-primary/30 hover:bg-primary/5 font-bold transition-all border-2"
                                onClick={handleApplyDefaults}
                            >
                                전체 초기화 및 설정 적용
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-[#1a1a1a] text-white overflow-hidden border-none shadow-2xl">
                        <CardHeader className="pb-2 border-b border-white/10 bg-white/5">
                            <CardTitle className="text-lg flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <LayoutGrid className="h-5 w-5 text-yellow-400" />
                                    복사 미리보기
                                </div>
                                <span className="text-xs font-normal text-gray-400">총 {generatedList.length}행</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="p-4 bg-transparent font-mono text-sm h-[500px] overflow-y-auto custom-scrollbar-dark list-container">
                                {generatedList.length > 0 ? (
                                    generatedList.map((item, idx) => (
                                        <div key={idx} className="flex gap-4 opacity-70 hover:opacity-100 py-1 border-b border-white/5 last:border-none transition-opacity">
                                            <span className="text-gray-500 w-10 text-right shrink-0">{idx + 1}</span>
                                            <span className="text-yellow-100">{item}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 py-20">
                                        <AlertCircle className="h-12 w-12 opacity-20" />
                                        <p className="text-center font-bold opacity-40">코스를 선택해 주세요.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* 세부 조정 그리드 */}
                <div className="lg:col-span-9 space-y-8">
                    {courses.filter(c => selectedCourseIds.includes(c.id)).map(course => (
                        <Card key={course.id} className="shadow-md">
                            <CardHeader className="bg-primary/5 py-4 border-b">
                                <CardTitle className="text-xl font-bold text-primary">{course.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-border">
                                    {course.holes.map(hole => (
                                        <div key={hole.number} className="flex flex-col md:flex-row items-center p-4 gap-4 hover:bg-secondary/10 transition-colors">
                                            <div className="bg-primary text-white w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                                                {hole.number}
                                            </div>

                                            <div className="flex-1 flex flex-wrap gap-3 items-center">
                                                {hole.groups.map((group, gIdx) => (
                                                    <div key={group.id} className="flex flex-col bg-white border rounded-lg overflow-hidden shadow-sm group">
                                                        <div className="bg-secondary p-1 text-[10px] font-bold text-center uppercase tracking-wider">
                                                            {course.id}{hole.number}{group.suffix || '(Base)'}
                                                        </div>
                                                        <div className="flex items-center p-2 gap-2">
                                                            <div className="flex items-center border rounded">
                                                                <button
                                                                    onClick={() => updatePlayers(course.id, hole.number, group.id, -1)}
                                                                    className="p-1 hover:bg-secondary transition-colors"
                                                                >
                                                                    <Minus className="h-3 w-3" />
                                                                </button>
                                                                <span className="w-8 text-center font-bold text-sm">{group.players}</span>
                                                                <button
                                                                    onClick={() => updatePlayers(course.id, hole.number, group.id, 1)}
                                                                    className="p-1 hover:bg-secondary transition-colors"
                                                                >
                                                                    <Plus className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                            <button
                                                                onClick={() => removeGroup(course.id, hole.number, group.id)}
                                                                className="text-destructive hover:bg-destructive/10 p-1 rounded transition-colors"
                                                                title="조 삭제"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                        <div className="text-[10px] text-center pb-1 text-muted-foreground">
                                                            {group.players}명 반복
                                                        </div>
                                                    </div>
                                                ))}

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="border-dashed border-2 h-16 w-16 rounded-lg flex flex-col gap-1 text-xs text-muted-foreground hover:text-primary hover:border-primary"
                                                    onClick={() => addGroup(course.id, hole.number)}
                                                >
                                                    <Plus className="h-4 w-4" />
                                                    조 추가
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
