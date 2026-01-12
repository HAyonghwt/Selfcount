import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';

interface ArchiveModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tournamentName: string;
    initialDate: string;
    onConfirm: (location: string, date: string) => Promise<void>;
}

const ArchiveModal = React.memo(({
    open,
    onOpenChange,
    tournamentName,
    initialDate,
    onConfirm
}: ArchiveModalProps) => {
    const [location, setLocation] = useState('');
    const [date, setDate] = useState(initialDate);

    useEffect(() => {
        if (open) {
            setDate(initialDate);
            setLocation('');
        }
    }, [open, initialDate]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>대회 기록 보관</DialogTitle>
                    <DialogDescription>
                        현재 대회의 모든 데이터를 보관함에 저장합니다.<br />
                        보관된 데이터는 갤러리에서 확인할 수 있습니다.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="name" className="text-right text-sm font-bold">
                            대회명
                        </label>
                        <input
                            id="name"
                            value={tournamentName}
                            disabled
                            className="col-span-3 flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="location" className="text-right text-sm font-bold text-blue-600">
                            장소
                        </label>
                        <input
                            id="location"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="예: 잠실 파크골프장 A/B 코스"
                            className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="date" className="text-right text-sm font-bold text-blue-600">
                            날짜
                        </label>
                        <div className="col-span-3 flex gap-2 relative">
                            <input
                                id="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                placeholder="예: 2024.10.25 (또는 기간/회차)"
                                className="flex-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                            <div className="relative group">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-10 w-10 shrink-0 border-slate-200 group-hover:border-blue-400 group-hover:bg-blue-50 transition-colors"
                                >
                                    <CalendarIcon className="h-4 w-4 text-slate-500 group-hover:text-blue-600" />
                                </Button>
                                <input
                                    type="date"
                                    id="native-date-picker"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    onChange={(e) => {
                                        const selectedDate = e.target.value; // YYYY-MM-DD
                                        if (selectedDate) {
                                            // YYYY-MM-DD -> YYYY.MM.DD 변환 (선택 사항이나 가독성 위해)
                                            const formatted = selectedDate.replace(/-/g, '.');
                                            const existingSuffix = date.includes(' ') ? date.substring(date.indexOf(' ')) : '';
                                            setDate(formatted + existingSuffix);
                                        }
                                    }}
                                    onClick={(e) => {
                                        // 일부 브라우저에서 showPicker 지원 확인
                                        if ('showPicker' in e.currentTarget) {
                                            try {
                                                (e.currentTarget as any).showPicker();
                                            } catch (err) {
                                                console.error('showPicker error:', err);
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
                    <Button onClick={() => onConfirm(location, date)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">보관하기</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

ArchiveModal.displayName = 'ArchiveModal';

export default ArchiveModal;
