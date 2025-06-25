"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, Tv } from 'lucide-react';
import { auth, db, firebaseConfig } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface AppConfig {
  appName: string;
  userDomain: string;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const { toast } = useToast();
  const [year, setYear] = useState<number | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const isConfigMissing = !firebaseConfig.apiKey;

  useEffect(() => {
    setYear(new Date().getFullYear());

    if (isConfigMissing) {
        setError("Firebase 연결 설정이 필요합니다. .env.local 파일 또는 호스팅 서비스의 환경 변수 설정을 확인해주세요.");
        setConfig({ appName: 'ParkScore', userDomain: 'parkgolf.com' });
        setLoading(false);
        return;
    }

    const configRef = ref(db, 'config');
    get(configRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setConfig(data);
      } else {
        setConfig({ appName: 'ParkScore', userDomain: 'parkgolf.com' });
      }
    }).catch((err) => {
        console.error("Firebase config fetch error:", err);
        setError("Firebase 연결에 실패했습니다. 설정을 확인해주세요.");
        setConfig({ appName: 'ParkScore', userDomain: 'parkgolf.com' });
    }).finally(() => {
        setLoading(false);
    });
  }, [isConfigMissing]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!auth || !config) {
        setError("설정이 로드되지 않았거나 Firebase 인증이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      if (user) {
        const userEmail = user.email || '';
        const userDomain = config.userDomain.trim();

        if (userEmail === `admin@${userDomain}`) {
            router.push('/admin');
        } else if (userEmail.startsWith('referee') && userEmail.endsWith(`@${userDomain}`)) {
             const holeNumber = userEmail.match(/referee(\d+)/)?.[1];
             if (holeNumber) {
                router.push(`/referee/${holeNumber}`);
             } else {
                setError('심판 번호를 식별할 수 없습니다.');
                auth.signOut();
             }
        } else if (email === 'hayonghwy@gmail.com') {
            router.push('/super-admin');
        } else {
            setError(`'${userEmail}' 계정은 이 앱에 대한 접근 권한이 없습니다.`);
            auth.signOut();
        }
      }
    } catch (authError: any) {
      let errorMessage = '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      switch (authError.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = '잘못된 이메일 또는 비밀번호입니다.';
          break;
        case 'auth/user-disabled':
          errorMessage = '이 사용자 계정은 비활성화되었습니다.';
          break;
        case 'auth/invalid-email':
          errorMessage = '유효하지 않은 이메일 주소 형식입니다.';
          break;
        case 'auth/too-many-requests':
          errorMessage = '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';
          break;
      }
      setError(errorMessage);
      toast({
        title: "로그인 실패",
        description: errorMessage,
      });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <Button variant="secondary" className="w-full h-12 text-base font-bold mb-6" asChild>
              <Link href="/scoreboard" target="_blank" rel="noopener noreferrer">
                  <Tv className="mr-2 h-5 w-5" />
                  실시간 전광판
              </Link>
          </Button>

          <div className="mx-auto w-fit mb-4">
            <Image 
                src="/logo.png"
                alt={`${config?.appName || 'ParkScore'} 로고`}
                width={80}
                height={80}
                className="h-20 w-20"
            />
          </div>
          <CardTitle className="text-3xl font-bold font-headline">
            {loading && !config ? <Skeleton className="h-9 w-48 mx-auto" /> : (config?.appName || 'ParkScore')}
          </CardTitle>
          <CardDescription className="text-muted-foreground pt-2">
            {loading && !config ? <Skeleton className="h-5 w-40 mx-auto" /> : `관리자/심판으로 로그인 하세요.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <form onSubmit={handleLogin} className="space-y-4">
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
                disabled={loading || isConfigMissing}
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
                disabled={loading || isConfigMissing}
              />
            </div>
            {error && (
                <div className="text-center text-sm font-medium text-destructive bg-red-50 border border-red-200 p-3 rounded-lg">
                    <p>{error}</p>
                </div>
            )}
            <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={loading || isConfigMissing}>
              {loading && !isConfigMissing ? (
                '로그인 중...'
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  로그인
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {year} {config?.appName || 'ParkScore'}. All rights reserved.</p>
      </footer>
    </div>
  );
}
