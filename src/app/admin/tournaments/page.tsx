"use client"
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Trash2, PlusCircle, Save, RotateCcw, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove } from 'firebase/database';

interface Course {
  id: number;
  name: string;
  pars: (number | null)[];
  isActive: boolean;
}

const defaultPars: number[] = Array(9).fill(3);
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const initialCourses: Course[] = [
  { id: 1, name: 'A코스', pars: [...defaultPars], isActive: true },
  { id: 2, name: 'B코스', pars: [...defaultPars], isActive: true },
];

export default function TournamentManagementPage() {
  const [tournamentName, setTournamentName] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const { toast } = useToast();
  const [maxCourses, setMaxCourses] = useState(10);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    const tournamentRef = ref(db, 'tournaments/current');
    const unsubscribe = onValue(tournamentRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTournamentName(data.name || '새로운 대회');
        setCourses(data.courses ? Object.values(data.courses) : []);
      } else {
        setTournamentName('제1회 전국 파크골프 대회');
        setCourses(initialCourses);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const configRef = ref(db, 'config');
    const unsubscribe = onValue(configRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.maxCourses) {
            setMaxCourses(data.maxCourses);
        }
        setConfigLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddCourse = () => {
    if (!configLoading && courses.length >= maxCourses) {
        toast({
            title: '코스 추가 제한',
            description: `최대 코스 수(${maxCourses}개)에 도달했습니다. 최고 관리자 설정에서 제한을 늘려주세요.`,
            variant: 'destructive',
        });
        return;
    }
    
    const nextCourseIndex = courses.length;
    const newCourseName = nextCourseIndex < alphabet.length
        ? `${alphabet[nextCourseIndex]}코스`
        : `코스 ${nextCourseIndex + 1}`;

    const newCourse: Course = {
      id: courses.length > 0 ? Math.max(...courses.map(c => c.id)) + 1 : 1,
      name: newCourseName,
      pars: [...defaultPars],
      isActive: true,
    };
    setCourses([...courses, newCourse]);
  };

  const handleRemoveCourse = (id: number) => {
    setCourses(courses.filter(course => course.id !== id));
  };
  
  const handleParChange = (courseId: number, holeIndex: number, value: string) => {
    setCourses(courses.map(course => {
        if (course.id === courseId) {
            const newPars = [...course.pars];
            if (value === '') {
                newPars[holeIndex] = null;
            } else {
                const parsed = parseInt(value, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    newPars[holeIndex] = parsed;
                }
            }
            return { ...course, pars: newPars };
        }
        return course;
    }));
  };
  
  const handleCourseNameChange = (courseId: number, name: string) => {
     setCourses(courses.map(c => c.id === courseId ? {...c, name} : c));
  }
  
  const handleActiveChange = (courseId: number, checked: boolean) => {
     setCourses(courses.map(c => c.id === courseId ? {...c, isActive: checked} : c));
  }

  const handleSaveChanges = () => {
    const tournamentRef = ref(db, 'tournaments/current');
    
    const coursesObject = courses.reduce((acc, course) => {
        acc[course.id] = {
            ...course,
            pars: course.pars.map(p => p === null ? 0 : p)
        };
        return acc;
    }, {} as Record<string, any>);

    set(tournamentRef, {
      name: tournamentName,
      courses: coursesObject
    }).then(() => {
      toast({
        title: "성공",
        description: "대회 및 코스 정보가 저장되었습니다.",
        className: "bg-green-500 text-white",
      });
    }).catch(err => {
        toast({ title: "오류", description: err.message, variant: "destructive"});
    });
  };
  
  const handleResetData = () => {
    remove(ref(db, 'tournaments/current')).then(() => {
      // The onValue listener will automatically update the state
      toast({
        title: "초기화 완료",
        description: "대회 코스 데이터가 초기화되었습니다.",
        variant: "destructive",
      });
    });
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold font-headline">대회명 설정</CardTitle>
          <CardDescription>대회의 공식 명칭을 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-lg space-y-2">
            <Label htmlFor="tournament-name">대회명</Label>
            <Input id="tournament-name" value={tournamentName} onChange={e => setTournamentName(e.target.value)} className="text-lg h-12" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold font-headline">코스 관리</CardTitle>
          <CardDescription>코스 이름, 홀별 Par 값을 설정하고, 전광판에 표시할 코스를 활성화/비활성화합니다. 현재 {courses.length} / {maxCourses}개 코스가 생성되었습니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {courses.map((course) => (
            <Card key={course.id} className="overflow-hidden">
              <CardHeader className="bg-muted/50 flex flex-row items-center justify-between py-3 px-4">
                <Input value={course.name} onChange={e => handleCourseNameChange(course.id, e.target.value)} className="text-lg font-bold w-auto border-0 shadow-none focus-visible:ring-1 bg-transparent" />
                <div className="flex items-center gap-4">
                   <div className="flex items-center space-x-2">
                        <Label htmlFor={`active-switch-${course.id}`}>전광판 표시</Label>
                        <Switch id={`active-switch-${course.id}`} checked={course.isActive} onCheckedChange={(checked) => handleActiveChange(course.id, checked)} />
                    </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveCourse(course.id)}>
                    <Trash2 className="h-5 w-5 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                 <p className="text-sm text-muted-foreground mb-4">홀별 기준 타수(Par)를 입력하세요. 총 Par: {course.pars.reduce((a, b) => a + (b || 0), 0)}</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-4">
                  {course.pars.map((par, index) => (
                    <div key={index} className="space-y-1">
                      <Label htmlFor={`par-${course.id}-${index}`} className="text-sm font-medium">
                        {index + 1}홀
                      </Label>
                      <Input
                        id={`par-${course.id}-${index}`}
                        type="number"
                        value={par === null ? '' : par}
                        onChange={(e) => handleParChange(course.id, index, e.target.value)}
                        className="text-center h-12 text-lg"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" onClick={handleAddCourse} disabled={configLoading || courses.length >= maxCourses}>
            <PlusCircle className="mr-2 h-4 w-4" />
            코스 추가
          </Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>설정 저장 및 초기화</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
           <Button size="lg" onClick={handleSaveChanges}>
                <Save className="mr-2 h-5 w-5" />
                변경사항 저장
            </Button>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="lg">
                        <RotateCcw className="mr-2 h-5 w-5" />
                        대회/코스 데이터 초기화
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/>정말 초기화하시겠습니까?</AlertDialogTitle>
                        <AlertDialogDescription>
                            이 작업은 되돌릴 수 없습니다. 모든 대회 이름과 코스 설정이 기본값으로 초기화됩니다. 선수 데이터는 영향을 받지 않습니다.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetData} className="bg-destructive hover:bg-destructive/90">초기화</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
