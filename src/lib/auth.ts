import { firestore, getFirestoreDb } from './firebase';
import { doc, getDoc, updateDoc, collection, addDoc, query, getDocs, where, deleteDoc } from 'firebase/firestore';

export interface CaptainAccount {
  id: string;
  password: string;
  group: string;
  jo: number;
  email: string;
  createdAt: any;
  lastLogin: any;
  isActive: boolean;
}

export interface RefereeAccount {
  id: string;
  password: string;
  hole: number;
  email: string;
  createdAt: any;
  lastLogin: any;
  isActive: boolean;
}

export interface HostAccount {
  id: string;
  password: string;
  email: string;
  createdAt: any;
  lastLogin: any;
  isActive: boolean;
}

/**
 * 한글 아이디로 조장 로그인
 */
export const loginWithKoreanId = async (koreanId: string, password: string): Promise<CaptainAccount> => {
  try {
    const fs = getFirestoreDb();
    const captainsRef = collection(fs, 'captains');
    const q = query(captainsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 계정입니다.');
    }
    
    const captainData = querySnapshot.docs[0].data() as CaptainAccount;
    
    if (!captainData.isActive) {
      throw new Error('비활성화된 계정입니다.');
    }
    
    if (captainData.password !== password) {
      throw new Error('비밀번호가 올바르지 않습니다.');
    }
    
    // 마지막 로그인 시간 업데이트 (보안 규칙 문제로 임시 비활성화)
    // const docRef = doc(firestore, 'captains', querySnapshot.docs[0].id);
    // await updateDoc(docRef, {
    //   lastLogin: new Date()
    // });
    
    return captainData;
  } catch (error) {
    throw error;
  }
};

/**
 * 조장 계정 생성 (슈퍼관리자용)
 */
export const createCaptainAccount = async (koreanId: string, password: string, group: string, jo: number): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const captainData = {
      id: koreanId,
      password: password,
      group: group,
      jo: jo,
      email: `captain${jo}@yongin.com`,
      createdAt: new Date(),
      lastLogin: null,
      isActive: true
    };
    
    await addDoc(collection(fs, 'captains'), captainData);
  } catch (error) {
    throw error;
  }
};

/**
 * 조장 계정 비밀번호 변경 (슈퍼관리자용)
 */
export const updateCaptainPassword = async (koreanId: string, newPassword: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const captainsRef = collection(fs, 'captains');
    const q = query(captainsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 조장 계정입니다.');
    }
    
    const docRef = doc(fs, 'captains', querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      password: newPassword
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 조장 계정 목록 조회 (슈퍼관리자용)
 */
export const getCaptainAccounts = async (): Promise<CaptainAccount[]> => {
  try {
    const fs = getFirestoreDb();
    const captainsRef = collection(fs, 'captains');
    const querySnapshot = await getDocs(captainsRef);
    
    const captains: CaptainAccount[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as CaptainAccount;
      // 실제 id 필드를 사용
      captains.push({ 
        ...data, 
        id: data.id || doc.id // id 필드가 없으면 문서 ID 사용
      });
    });
    
    return captains.sort((a, b) => a.jo - b.jo);
  } catch (error) {
    throw error;
  }
};

/**
 * 조장 계정 비활성화 (슈퍼관리자용)
 */
export const deactivateCaptainAccount = async (koreanId: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const captainsRef = collection(fs, 'captains');
    const q = query(captainsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 조장 계정입니다.');
    }
    
    const docRef = doc(fs, 'captains', querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      isActive: false
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 조장 계정 활성화 (슈퍼관리자용)
 */
export const activateCaptainAccount = async (koreanId: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const captainsRef = collection(fs, 'captains');
    const q = query(captainsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 조장 계정입니다.');
    }
    
    const docRef = doc(fs, 'captains', querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      isActive: true
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 조장 계정 비밀번호 변경
 */
export const changeCaptainPassword = async (koreanId: string, newPassword: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const captainRef = doc(fs, 'captains', koreanId);
    await updateDoc(captainRef, {
      password: newPassword
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 100명 조장 계정 일괄 생성 (초기 설정용)
 */
export const createBulkCaptainAccounts = async (replaceExisting: boolean = false, addMore: boolean = false): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const captainsRef = collection(fs, 'captains');
    
    // 기존 계정 삭제 옵션이 체크된 경우
    if (replaceExisting) {
      const existingDocs = await getDocs(captainsRef);
      const totalDocs = existingDocs.docs.length;
      
      // Firestore 배치 제한(500개) 고려하여 분할 처리
      const batchSize = 500;
      for (let i = 0; i < totalDocs; i += batchSize) {
        const batch = existingDocs.docs.slice(i, i + batchSize);
        const deletePromises = batch.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      }
    }
    
    // 추가 생성이 아닌 경우, 기존 계정이 있는지 확인
    if (!replaceExisting && !addMore) {
      const existingDocs = await getDocs(captainsRef);
      if (!existingDocs.empty) {
        throw new Error('이미 조장 계정이 존재합니다. "기존 계정 삭제 후 새로 생성" 또는 "추가로 생성" 옵션을 선택해주세요.');
      }
    }
    
    // 시작 번호 결정
    let startNumber = 1;
    if (addMore && !replaceExisting) {
      const existingDocs = await getDocs(captainsRef);
      const existingIds = existingDocs.docs.map(doc => doc.data().id);
      const maxNumber = Math.max(...existingIds.map(id => parseInt(id.replace('조장', ''))), 0);
      startNumber = maxNumber + 1;
    }
    
    for (let i = startNumber; i <= startNumber + 99; i++) {
      const groupNumber = Math.ceil(i / 10); // 10명씩 그룹 분할
      const captainData = {
        id: `조장${i}`,
        password: `123456`, // 기본 비밀번호
        group: `그룹${groupNumber}`,
        jo: i,
        email: `captain${i}@yongin.com`,
        createdAt: new Date(),
        lastLogin: null,
        isActive: true
      };
      
      await addDoc(captainsRef, captainData);
    }
  } catch (error) {
    throw error;
  }
};

/**
 * 한글 아이디로 심판 로그인
 */
export const loginRefereeWithKoreanId = async (koreanId: string, password: string): Promise<RefereeAccount> => {
  try {
    const fs = getFirestoreDb();
    const refereesRef = collection(fs, 'referees');
    const q = query(refereesRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 심판 계정입니다.');
    }
    
    const refereeData = querySnapshot.docs[0].data() as RefereeAccount;
    
    if (!refereeData.isActive) {
      throw new Error('비활성화된 심판 계정입니다.');
    }
    
    if (refereeData.password !== password) {
      throw new Error('비밀번호가 올바르지 않습니다.');
    }
    
    // 마지막 로그인 시간 업데이트 (보안 규칙 문제로 임시 비활성화)
    // const docRef = doc(firestore, 'referees', querySnapshot.docs[0].id);
    // await updateDoc(docRef, {
    //   lastLogin: new Date()
    // });
    
    return refereeData;
  } catch (error: any) {
    // Firestore 권한 오류를 명확하게 처리
    if (error.code === 'permission-denied' || 
        error.message?.includes('Missing or insufficient permissions') ||
        error.message?.includes('permission denied')) {
      throw new Error('Firestore 접근 권한이 없습니다. 관리자에게 문의하세요.');
    }
    
    // 기존 오류 메시지가 있으면 그대로 사용
    if (error.message) {
    throw error;
    }
    
    // 알 수 없는 오류
    throw new Error('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
};

/**
 * 심판 계정 생성 (슈퍼관리자용)
 */
export const createRefereeAccount = async (koreanId: string, password: string, hole: number): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const refereeData = {
      id: koreanId,
      password: password,
      hole: hole,
      email: `referee${hole}@yongin.com`,
      createdAt: new Date(),
      lastLogin: null,
      isActive: true
    };
    
    await addDoc(collection(fs, 'referees'), refereeData);
  } catch (error) {
    throw error;
  }
};

/**
 * 심판 계정 목록 조회 (슈퍼관리자용)
 */
export const getRefereeAccounts = async (): Promise<RefereeAccount[]> => {
  try {
    const fs = getFirestoreDb();
    const refereesRef = collection(fs, 'referees');
    // 모든 계정을 가져오도록 필터 제거 (관리자가 모든 계정을 볼 수 있도록)
    const querySnapshot = await getDocs(refereesRef);
    
    const referees: RefereeAccount[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as any;
      // isActive 값을 명시적으로 boolean으로 변환
      let isActiveValue: boolean;
      if (data.isActive === undefined || data.isActive === null) {
        isActiveValue = true; // 기본값
      } else if (typeof data.isActive === 'boolean') {
        isActiveValue = data.isActive;
      } else if (typeof data.isActive === 'string') {
        isActiveValue = data.isActive === 'true' || data.isActive === '1';
      } else {
        isActiveValue = Boolean(data.isActive);
      }
      
      const referee: RefereeAccount = { 
        ...data, 
        id: data.id || doc.id, // id 필드가 없으면 문서 ID 사용
        isActive: isActiveValue // 명시적으로 boolean으로 변환된 값 사용
      };
      referees.push(referee);
    });
    
    return referees.sort((a, b) => a.hole - b.hole);
  } catch (error) {
    throw error;
  }
};

/**
 * 심판 계정 비활성화 (슈퍼관리자용)
 */
export const deactivateRefereeAccount = async (koreanId: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const refereesRef = collection(fs, 'referees');
    const q = query(refereesRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 심판 계정입니다.');
    }
    
    const docRef = doc(fs, 'referees', querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      isActive: false
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 심판 계정 활성화 (슈퍼관리자용)
 */
export const activateRefereeAccount = async (koreanId: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const refereesRef = collection(fs, 'referees');
    const q = query(refereesRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 심판 계정입니다.');
    }
    
    const docRef = doc(fs, 'referees', querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      isActive: true
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 심판 계정 비밀번호 변경 (슈퍼관리자용)
 */
export const updateRefereePassword = async (koreanId: string, newPassword: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const refereesRef = collection(fs, 'referees');
    const q = query(refereesRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 심판 계정입니다.');
    }
    
    const docRef = doc(fs, 'referees', querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      password: newPassword
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 9명 심판 계정 일괄 생성 (초기 설정용)
 */
export const createBulkRefereeAccounts = async (replaceExisting: boolean = false, addMore: boolean = false): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const refereesRef = collection(fs, 'referees');
    
    // 기존 계정 삭제 옵션이 체크된 경우
    if (replaceExisting) {
      const existingDocs = await getDocs(refereesRef);
      const totalDocs = existingDocs.docs.length;
      
      // Firestore 배치 제한(500개) 고려하여 분할 처리
      const batchSize = 500;
      for (let i = 0; i < totalDocs; i += batchSize) {
        const batch = existingDocs.docs.slice(i, i + batchSize);
        const deletePromises = batch.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      }
    }
    
    // 추가 생성이 아닌 경우, 기존 계정이 있는지 확인
    if (!replaceExisting && !addMore) {
      const existingDocs = await getDocs(refereesRef);
      if (!existingDocs.empty) {
        throw new Error('이미 심판 계정이 존재합니다. "기존 계정 삭제 후 새로 생성" 또는 "추가로 생성" 옵션을 선택해주세요.');
      }
    }
    
    // 번호 부여 로직 개선
    let suffixNumber = 0;
    if (addMore && !replaceExisting) {
      const existingDocs = await getDocs(refereesRef);
      const existingIds = existingDocs.docs.map(doc => doc.data().id);
      
      // 기존 계정에서 번호 패턴 추출 (예: "1번홀심판", "1번홀심판1", "1번홀심판2")
      const numberPatterns = existingIds.map(id => {
        const match = id.match(/(\d+)번홀심판(\d*)/);
        return match ? parseInt(match[2] || '0') : 0;
      });
      
      // 가장 큰 번호 + 1을 다음 번호로 설정
      suffixNumber = Math.max(...numberPatterns, 0) + 1;
    }
    
    for (let i = 1; i <= 9; i++) {
      const refereeId = suffixNumber > 0 ? `${i}번홀심판${suffixNumber}` : `${i}번홀심판`;
      const emailSuffix = suffixNumber > 0 ? `_${suffixNumber}` : '';
      const refereeData = {
        id: refereeId,
        password: `123456`, // 기본 비밀번호
        hole: i,
        email: `referee${i}${emailSuffix}@yongin.com`,
        createdAt: new Date(),
        lastLogin: null,
        isActive: true
      };
      
      await addDoc(refereesRef, refereeData);
    }
  } catch (error) {
    throw error;
  }
};

/**
 * 한글 아이디로 사회자 로그인
 */
export const loginHostWithKoreanId = async (koreanId: string, password: string): Promise<HostAccount> => {
  try {
    const fs = getFirestoreDb();
    const hostsRef = collection(fs, 'hosts');
    const q = query(hostsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 사회자 계정입니다.');
    }
    
    const hostData = querySnapshot.docs[0].data() as HostAccount;
    
    if (!hostData.isActive) {
      throw new Error('비활성화된 사회자 계정입니다.');
    }
    
    if (hostData.password !== password) {
      throw new Error('비밀번호가 올바르지 않습니다.');
    }
    
    return hostData;
  } catch (error: any) {
    if (error.code === 'permission-denied' || 
        error.message?.includes('Missing or insufficient permissions') ||
        error.message?.includes('permission denied')) {
      throw new Error('Firestore 접근 권한이 없습니다. 관리자에게 문의하세요.');
    }
    
    if (error.message) {
      throw error;
    }
    
    throw new Error('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
};

/**
 * 사회자 계정 생성 (슈퍼관리자용)
 */
export const createHostAccount = async (koreanId: string, password: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    
    // 기존 계정이 있는지 확인
    const hostsRef = collection(fs, 'hosts');
    const existingQuery = query(hostsRef, where('id', '==', koreanId));
    const existingSnapshot = await getDocs(existingQuery);
    
    if (!existingSnapshot.empty) {
      throw new Error('이미 존재하는 사회자 계정입니다.');
    }
    
    const hostData = {
      id: koreanId,
      password: password,
      email: 'host@yongin.com',
      createdAt: new Date(),
      lastLogin: null,
      isActive: true
    };
    
    await addDoc(hostsRef, hostData);
  } catch (error) {
    throw error;
  }
};

/**
 * 사회자 계정 조회 (슈퍼관리자용)
 */
export const getHostAccount = async (): Promise<HostAccount | null> => {
  try {
    const fs = getFirestoreDb();
    const hostsRef = collection(fs, 'hosts');
    const querySnapshot = await getDocs(hostsRef);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const hostData = querySnapshot.docs[0].data() as HostAccount;
    return {
      ...hostData,
      id: hostData.id || querySnapshot.docs[0].id
    };
  } catch (error) {
    throw error;
  }
};

/**
 * 사회자 계정 비밀번호 변경 (슈퍼관리자용)
 */
export const updateHostPassword = async (koreanId: string, newPassword: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const hostsRef = collection(fs, 'hosts');
    const q = query(hostsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 사회자 계정입니다.');
    }
    
    const docRef = doc(fs, 'hosts', querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      password: newPassword
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 사회자 계정 비활성화 (슈퍼관리자용)
 */
export const deactivateHostAccount = async (koreanId: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const hostsRef = collection(fs, 'hosts');
    const q = query(hostsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 사회자 계정입니다.');
    }
    
    const docRef = doc(fs, 'hosts', querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      isActive: false
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 사회자 계정 활성화 (슈퍼관리자용)
 */
export const activateHostAccount = async (koreanId: string): Promise<void> => {
  try {
    const fs = getFirestoreDb();
    const hostsRef = collection(fs, 'hosts');
    const q = query(hostsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 사회자 계정입니다.');
    }
    
    const docRef = doc(fs, 'hosts', querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      isActive: true
    });
  } catch (error) {
    throw error;
  }
};
