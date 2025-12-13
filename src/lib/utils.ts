import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// sessionStorage 안전 접근 헬퍼 함수들
export function safeSessionStorageGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }
    return window.sessionStorage.getItem(key);
  } catch (error) {
    // 권한 거부 또는 접근 불가 시 조용히 처리
    console.warn(`sessionStorage 접근 실패 (${key}):`, error);
    return null;
  }
}

export function safeSessionStorageSetItem(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    window.sessionStorage.setItem(key, value);
    return true;
  } catch (error) {
    // 권한 거부 또는 접근 불가 시 조용히 처리
    console.warn(`sessionStorage 저장 실패 (${key}):`, error);
    return false;
  }
}

export function safeSessionStorageRemoveItem(key: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    window.sessionStorage.removeItem(key);
    return true;
  } catch (error) {
    // 권한 거부 또는 접근 불가 시 조용히 처리
    console.warn(`sessionStorage 삭제 실패 (${key}):`, error);
    return false;
  }
}

export function safeSessionStorageClear(): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    window.sessionStorage.clear();
    return true;
  } catch (error) {
    // 권한 거부 또는 접근 불가 시 조용히 처리
    console.warn('sessionStorage 초기화 실패:', error);
    return false;
  }
}

// localStorage 안전 접근 헬퍼 함수들
export function safeLocalStorageGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage.getItem(key);
  } catch (error) {
    // 권한 거부 또는 접근 불가 시 조용히 처리
    console.warn(`localStorage 접근 실패 (${key}):`, error);
    return null;
  }
}

export function safeLocalStorageSetItem(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    // 권한 거부 또는 접근 불가 시 조용히 처리
    console.warn(`localStorage 저장 실패 (${key}):`, error);
    return false;
  }
}

export function safeLocalStorageRemoveItem(key: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    // 권한 거부 또는 접근 불가 시 조용히 처리
    console.warn(`localStorage 삭제 실패 (${key}):`, error);
    return false;
  }
}

export function safeLocalStorageClear(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    window.localStorage.clear();
    return true;
  } catch (error) {
    // 권한 거부 또는 접근 불가 시 조용히 처리
    console.warn('localStorage 초기화 실패:', error);
    return false;
  }
}
