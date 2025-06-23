import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { get } from 'firebase/database';
import { ref as dbRef } from 'firebase/database';
import { db } from '@/lib/firebase';

export async function generateMetadata(): Promise<Metadata> {
  let appName = '파크골프대회'; // Default name
  try {
    const configRef = dbRef(db, 'config');
    const snapshot = await get(configRef);
    if (snapshot.exists() && snapshot.val().appName) {
      appName = snapshot.val().appName;
    }
  } catch (error) {
    // In case of error, the default name will be used.
    // This can happen during first setup or if firebase is down.
    console.error("Failed to fetch appName for metadata:", error);
  }

  return {
    title: appName,
    description: `${appName} 점수 관리 시스템`,
  };
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" translate="no" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
