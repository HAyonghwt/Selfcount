"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tv, Target, LogIn } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // This is a mocked authentication logic based on the user request.
    // A real application should use a secure authentication service like Firebase Auth.
    const domain = 'parkgolf.com'; // This would be configurable

    if (email === 'hayonghwy@gmail.com' && password === 'sniper#1404') {
      router.push('/super-admin');
    } else if (email === `admin@${domain}` && password === '123456') {
      router.push('/admin');
    } else if (email.startsWith('referee') && email.endsWith(`@${domain}`) && password === '123456') {
      const holeNumber = email.match(/referee(\d+)/)?.[1];
      if (holeNumber) {
        router.push(`/referee/${holeNumber}`);
      } else {
        setError('Invalid referee email format.');
      }
    } else {
      setError('잘못된 이메일 또는 비밀번호입니다.');
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
              />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-12 text-lg font-bold">
              <LogIn className="mr-2 h-5 w-5" />
              로그인
            </Button>
          </form>
        </CardContent>
      </Card>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} ParkScore. All rights reserved.</p>
      </footer>
    </div>
  );
}
