"use client"

import { useEffect, useState } from "react"
import { ref, onValue, update } from "firebase/database"
import { db } from "@/lib/firebase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { MultiSelect } from "@/components/ui/multi-select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Save } from "lucide-react"

interface GroupData {
    id: string
    name: string
    // other fields ignored
}

interface RotationSettings {
    isActive: boolean
    intervalMinutes: number
    selectedGroups: string[]
}

export default function AdminScoreboardControlPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [groups, setGroups] = useState<{ value: string, label: string }[]>([])
    const [settings, setSettings] = useState<RotationSettings>({
        isActive: false,
        intervalMinutes: 1,
        selectedGroups: []
    })
    const { toast } = useToast()

    useEffect(() => {
        if (!db) return

        const groupsRef = ref(db, 'tournaments/current/groups')
        const settingsRef = ref(db, 'tournaments/current/scoreboardRotation')

        const unsubGroups = onValue(groupsRef, (snapshot) => {
            const data = snapshot.val()
            if (data) {
                const groupOptions = Object.keys(data).sort().map(key => ({
                    value: key,
                    label: key
                }))
                setGroups(groupOptions)
            } else {
                setGroups([])
            }
        })

        const unsubSettings = onValue(settingsRef, (snapshot) => {
            const data = snapshot.val()
            if (data) {
                setSettings({
                    isActive: data.isActive || false,
                    intervalMinutes: data.intervalMinutes || 1,
                    selectedGroups: data.selectedGroups || []
                })
            }
            setLoading(false)
        })

        return () => {
            unsubGroups()
            unsubSettings()
        }
    }, [])

    const handleSave = async () => {
        if (!db) return
        setSaving(true)
        try {
            const settingsRef = ref(db, 'tournaments/current/scoreboardRotation')
            await update(settingsRef, settings)
            toast({
                title: "설정 저장 완료",
                description: "전광판 순환 설정이 저장되었습니다.",
            })
        } catch (error) {
            console.error("Failed to save settings:", error)
            toast({
                title: "저장 실패",
                description: "설정을 저장하는 중 오류가 발생했습니다.",
                variant: "destructive"
            })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">외부전광판 관리</h2>
                <p className="text-muted-foreground">외부 전광판의 자동 순환 디스플레이 설정을 관리합니다.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>자동순환 디스플레이 모드</CardTitle>
                    <CardDescription>
                        여러 그룹의 점수판을 일정 시간 간격으로 자동으로 전환하여 보여줍니다.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="rotation-active" className="flex flex-col space-y-1">
                            <span>기능 활성화</span>
                            <span className="font-normal text-xs text-muted-foreground">자동 순환 기능을 켜거나 끕니다.</span>
                        </Label>
                        <Switch
                            id="rotation-active"
                            checked={settings.isActive}
                            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, isActive: checked }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>순환 시간 (분)</Label>
                        <Select
                            value={settings.intervalMinutes.toString()}
                            onValueChange={(value) => setSettings(prev => ({ ...prev, intervalMinutes: parseFloat(value) }))}
                            disabled={!settings.isActive}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="시간 선택" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0.5">30초</SelectItem>
                                {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                                    <SelectItem key={num} value={num.toString()}>
                                        {num}분
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">각 그룹이 화면에 표시되는 시간입니다.</p>
                    </div>

                    <div className="space-y-2">
                        <Label>순환할 그룹 선택</Label>
                        <MultiSelect
                            options={groups}
                            selected={settings.selectedGroups}
                            onChange={(selected) => setSettings(prev => ({ ...prev, selectedGroups: selected }))}
                            placeholder="그룹을 선택하세요"
                            disabled={!settings.isActive}
                        />
                        <p className="text-xs text-muted-foreground">순환하며 보여줄 그룹들을 선택하세요.</p>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            설정 저장
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
