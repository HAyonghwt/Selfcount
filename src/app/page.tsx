
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
import { auth, db, firestore, firebaseConfig, ensureAuthenticated } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { loginWithKoreanId, loginRefereeWithKoreanId } from '@/lib/auth';
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

    const load = async () => {
      try {
        // 규칙 강화에 따라 읽기 전에도 인증 필요
        await ensureAuthenticated();
        if (!db) {
          throw new Error('Firebase DB가 초기화되지 않았습니다.');
        }
        const configRef = ref(db as any, 'config');
        const snapshot = await get(configRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          setConfig(data);
        } else {
          setConfig({ appName: 'ParkScore', userDomain: 'parkgolf.com' });
        }
      } catch (err) {
        console.error("Firebase config fetch error:", err);
        setError("Firebase 연결에 실패했습니다. 설정을 확인해주세요.");
        setConfig({ appName: 'ParkScore', userDomain: 'parkgolf.com' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isConfigMissing]);

  // 카카오톡 브라우저 리다이렉트 처리
  useEffect(() => {
    const handleBrowserRedirect = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const targetUrl = window.location.href;

      const copyToClipboard = (text: string) => {
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        textarea.value = text;
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      };

      const inAppBrowserOut = () => {
        copyToClipboard(window.location.href);
        alert('URL주소가 복사되었습니다.\n\nSafari가 열리면 주소창을 길게 터치한 뒤, "붙여놓기 및 이동"을 누르면 정상적으로 이용하실 수 있습니다.');
        window.location.href = 'x-web-search://?';
      };

      if (userAgent.includes('kakaotalk')) {
        // 카카오톡 외부브라우저로 호출
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(targetUrl)}`;
      } else if (userAgent.includes('line')) {
        // 라인 외부브라우저로 호출
        const separator = targetUrl.includes('?') ? '&' : '?';
        window.location.href = `${targetUrl}${separator}openExternalBrowser=1`;
      } else if (userAgent.match(/inapp|naver|snapchat|wirtschaftswoche|thunderbird|instagram|everytimeapp|whatsapp|electron|wadiz|aliapp|zumapp|iphone(.*)whale|android(.*)whale|kakaostory|band|twitter|daumapps|daumdevice\/mobile|fb_iab|fb4a|fban|fbios|fbss|samsungbrowser\/[^1]/i)) {
        // 그외 다른 인앱들
        if (userAgent.match(/iphone|ipad|ipod/i)) {
          // 아이폰은 강제로 사파리를 실행할 수 없다
          // 모바일 대응 뷰포트 강제 설정
          const viewport = document.createElement('meta');
          viewport.name = 'viewport';
          viewport.content = 'width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=no, minimal-ui';
          document.getElementsByTagName('head')[0].appendChild(viewport);

          // 노토산스 폰트 강제 설정
          const fonts = document.createElement('link');
          fonts.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;500;700;900&display=swap';
          fonts.rel = 'stylesheet';
          document.getElementsByTagName('head')[0].appendChild(fonts);

          document.body.innerHTML = `
            <style>body{margin:0;padding:0;font-family: 'Noto Sans KR', sans-serif;overflow: hidden;height: 100%;}</style>
            <h2 style='padding-top:50px; text-align:center;font-family: "Noto Sans KR", sans-serif;'>인앱브라우저 호환문제로 인해<br />Safari로 접속해야합니다.</h2>
            <article style='text-align:center; font-size:17px; word-break:keep-all;color:#999;'>
              아래 버튼을 눌러 Safari를 실행해주세요<br />
              Safari가 열리면, 주소창을 길게 터치한 뒤,<br />
              '붙여놓기 및 이동'을 누르면<br />
              정상적으로 이용할 수 있습니다.<br /><br />
              <button onclick='${inAppBrowserOut.toString()}; inAppBrowserOut();' style='min-width:180px;margin-top:10px;height:54px;font-weight: 700;background-color:#31408E;color:#fff;border-radius: 4px;font-size:17px;border:0;'>Safari로 열기</button>
            </article>
            <img style='width:70%;margin:50px 15% 0 15%' src='https://tistory3.daumcdn.net/tistory/1893869/skin/images/inappbrowserout.jpeg' />
          `;
        } else {
          // 안드로이드는 Chrome이 설치되어있으므로 강제로 스킴 실행
          const chromeUrl = targetUrl.replace(/https?:\/\//i, '');
          window.location.href = `intent://${chromeUrl}#Intent;scheme=http;package=com.android.chrome;end`;
        }
      }
    };

    handleBrowserRedirect();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!auth || !config || !firestore) {
        setError("설정이 로드되지 않았거나 Firebase 인증이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return;
    }

    setLoading(true);

    try {
      // 한글 아이디로 로그인 시도 (조장)
      if (email.match(/^조장\d+$/)) {
        try {
          // Firestore 초기화 대기
          await new Promise(resolve => setTimeout(resolve, 100));
          const captainData = await loginWithKoreanId(email, password);
          sessionStorage.setItem('selfScoringCaptain', JSON.stringify(captainData));
          router.push('/self-scoring/game');
          return;
        } catch (error: any) {
          setError(error.message);
          toast({
            title: "로그인 실패",
            description: error.message,
          });
          setLoading(false);
          return;
        }
      }

      // 한글 아이디로 로그인 시도 (심판)
      if (email.match(/^\d+번홀심판$/)) {
        try {
          // Firestore 초기화 대기
          await new Promise(resolve => setTimeout(resolve, 100));
          const refereeData = await loginRefereeWithKoreanId(email, password);
          sessionStorage.setItem('refereeData', JSON.stringify(refereeData));
          router.push(`/referee/${refereeData.hole}`);
          return;
        } catch (error: any) {
          setError(error.message);
          toast({
            title: "로그인 실패",
            description: error.message,
          });
          setLoading(false);
          return;
        }
      }

      // 이메일 형식 검증
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('유효하지 않은 이메일 주소 형식입니다.');
        toast({
          title: "로그인 실패",
          description: '유효하지 않은 이메일 주소 형식입니다.',
        });
        setLoading(false);
        return;
      }

      // 기존 이메일 로그인
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
        } else if (userEmail.startsWith('player') && userEmail.endsWith('@yongin.com')) {
            router.push('/self-scoring');
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-blue-50 p-4">
      <Card className="w-full max-w-md shadow-2xl border-blue-200">
        <CardHeader className="text-center">
          <Button variant="secondary" className="w-full h-12 text-base font-bold mb-6 bg-blue-100 text-blue-700 hover:bg-blue-200 border-none" asChild>
              <Link href="/scoreboard" target="_blank" rel="noopener noreferrer">
                  <Tv className="mr-2 h-5 w-5 text-blue-600" />
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
                priority
            />
          </div>
          <CardTitle className="text-3xl font-bold font-headline text-blue-800">
            {loading && !config ? <Skeleton className="h-9 w-48 mx-auto" /> : (config?.appName || 'ParkScore')}
          </CardTitle>
          <CardDescription className="text-blue-500 pt-2">
            {loading && !config ? <Skeleton className="h-5 w-40 mx-auto" /> : `관리자/심판/조장으로 로그인 하세요.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-blue-800">아이디</Label>
              <Input
                id="email"
                type="text"
                placeholder="이메일 또는 한글 아이디 (예: admin@parkgolf.com, 1번홀심판, 조장1)"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 text-base border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-300"
                disabled={loading || isConfigMissing}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-blue-800">비밀번호</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-300"
                disabled={loading || isConfigMissing}
                autoComplete="off"
              />
            </div>
            {error && (
                <div className="text-center text-sm font-medium text-destructive bg-red-50 border border-red-200 p-3 rounded-lg">
                    <p>{error}</p>
                </div>
            )}
            <Button type="submit" className="w-full h-12 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200" disabled={loading || isConfigMissing}>
              {loading && !isConfigMissing ? (
                '로그인 중...'
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5 text-white" />
                  로그인
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      <footer className="mt-8 text-center text-sm text-blue-500">
        <p>&copy; {year} {config?.appName || 'ParkScore'}. All rights reserved.</p>
      </footer>
    </div>
  );
}
