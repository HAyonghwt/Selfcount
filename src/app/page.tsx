"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tv, Target, LogIn } from 'lucide-react';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const { toast } = useToast();
  const [year, setYear] = useState<number | null>(null);
  const [config, setConfig] = useState({ userDomain: 'parkgolf.com' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setYear(new Date().getFullYear());
    const configRef = ref(db, 'config');
    get(configRef).then((snapshot) => {
      if (snapshot.exists()) {
        setConfig(snapshot.val());
      }
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Super admin backdoor
    if (email === 'hayonghwy@gmail.com' && password === 'sniper#1404') {
      router.push('/super-admin');
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      if (user) {
        const userEmail = user.email || '';
        if (userEmail === `admin@${config.userDomain}`) {
            router.push('/admin');
        } else if (userEmail.startsWith('referee') && userEmail.endsWith(`@${config.userDomain}`)) {
             const holeNumber = userEmail.match(/referee(\d+)/)?.[1];
             if (holeNumber) {
                router.push(`/referee/${holeNumber}`);
             } else {
                setError('심판 번호를 식별할 수 없습니다.');
             }
        } else {
            // Logged in but not a recognized role
            setError('이 앱에 대한 접근 권한이 없습니다.');
            auth.signOut();
        }
      }
    } catch (authError: any) {
      switch (authError.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('잘못된 이메일 또는 비밀번호입니다.');
          break;
        default:
          setError('로그인 중 오류가 발생했습니다.');
          break;
      }
      toast({
        title: "로그인 실패",
        description: "이메일 또는 비밀번호를 확인해주세요.",
        variant: "destructive",
      });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <Button variant="outline" size="lg" asChild>
          <Link href="/scoreboard" target="_blank">
            <Tv className="mr-2 h-5 w-5" />
            외부 전광판
          </Link>
        </Button>
      </div>
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/20 text-primary rounded-full p-3 w-fit mb-4">
            <Target className="h-12 w-12" />
          </div>
          <CardTitle className="text-3xl font-bold font-headline">ParkScore</CardTitle>
          <CardDescription className="text-muted-foreground pt-2">
            파크골프 대회의 관리자 또는 심판으로 로그인 하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 text-base"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base"
                disabled={loading}
              />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={loading}>
              {loading ? '로그인 중...' : (<><LogIn className="mr-2 h-5 w-5" />로그인</>)}
            </Button>
          </form>
        </CardContent>
      </Card>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {year} ParkScore. All rights reserved.</p>
      </footer>
    </div>
  );
}
