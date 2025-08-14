import { firestore } from './firebase';
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

/**
 * 한글 아이디로 조장 로그인
 */
export const loginWithKoreanId = async (koreanId: string, password: string): Promise<CaptainAccount> => {
  try {
    const captainsRef = collection(firestore, 'captains');
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
    
    await addDoc(collection(firestore, 'captains'), captainData);
  } catch (error) {
    throw error;
  }
};

/**
 * 조장 계정 비밀번호 변경 (슈퍼관리자용)
 */
export const updateCaptainPassword = async (koreanId: string, newPassword: string): Promise<void> => {
  try {
    const captainsRef = collection(firestore, 'captains');
    const q = query(captainsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 조장 계정입니다.');
    }
    
    const docRef = doc(firestore, 'captains', querySnapshot.docs[0].id);
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
    const captainsRef = collection(firestore, 'captains');
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
    const captainsRef = collection(firestore, 'captains');
    const q = query(captainsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 조장 계정입니다.');
    }
    
    const docRef = doc(firestore, 'captains', querySnapshot.docs[0].id);
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
    const captainsRef = collection(firestore, 'captains');
    const q = query(captainsRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 조장 계정입니다.');
    }
    
    const docRef = doc(firestore, 'captains', querySnapshot.docs[0].id);
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
    const captainRef = doc(firestore, 'captains', koreanId);
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
    const captainsRef = collection(firestore, 'captains');
    
    // 기존 계정 삭제 옵션이 체크된 경우
    if (replaceExisting) {
      const existingDocs = await getDocs(captainsRef);
      const deletePromises = existingDocs.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
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
    const refereesRef = collection(firestore, 'referees');
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
  } catch (error) {
    throw error;
  }
};

/**
 * 심판 계정 생성 (슈퍼관리자용)
 */
export const createRefereeAccount = async (koreanId: string, password: string, hole: number): Promise<void> => {
  try {
    const refereeData = {
      id: koreanId,
      password: password,
      hole: hole,
      email: `referee${hole}@yongin.com`,
      createdAt: new Date(),
      lastLogin: null,
      isActive: true
    };
    
    await addDoc(collection(firestore, 'referees'), refereeData);
  } catch (error) {
    throw error;
  }
};

/**
 * 심판 계정 목록 조회 (슈퍼관리자용)
 */
export const getRefereeAccounts = async (): Promise<RefereeAccount[]> => {
  try {
    const refereesRef = collection(firestore, 'referees');
    // 모든 계정을 가져오도록 필터 제거 (관리자가 모든 계정을 볼 수 있도록)
    const querySnapshot = await getDocs(refereesRef);
    
    const referees: RefereeAccount[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as RefereeAccount;
      // 실제 id 필드를 사용
      referees.push({ 
        ...data, 
        id: data.id || doc.id // id 필드가 없으면 문서 ID 사용
      });
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
    const refereeRef = doc(firestore, 'referees', koreanId);
    await updateDoc(refereeRef, {
      isActive: false
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
    const refereesRef = collection(firestore, 'referees');
    const q = query(refereesRef, where('id', '==', koreanId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error('존재하지 않는 심판 계정입니다.');
    }
    
    const docRef = doc(firestore, 'referees', querySnapshot.docs[0].id);
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
    const refereesRef = collection(firestore, 'referees');
    
    // 기존 계정 삭제 옵션이 체크된 경우
    if (replaceExisting) {
      const existingDocs = await getDocs(refereesRef);
      const deletePromises = existingDocs.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
    }
    
    // 추가 생성이 아닌 경우, 기존 계정이 있는지 확인
    if (!replaceExisting && !addMore) {
      const existingDocs = await getDocs(refereesRef);
      if (!existingDocs.empty) {
        throw new Error('이미 심판 계정이 존재합니다. "기존 계정 삭제 후 새로 생성" 또는 "추가로 생성" 옵션을 선택해주세요.');
      }
    }
    
    // 시작 번호 결정
    let startNumber = 1;
    if (addMore && !replaceExisting) {
      const existingDocs = await getDocs(refereesRef);
      const existingIds = existingDocs.docs.map(doc => doc.data().id);
      const maxNumber = Math.max(...existingIds.map(id => parseInt(id.replace('번홀심판', ''))), 0);
      startNumber = maxNumber + 1;
    }
    
    for (let i = startNumber; i <= startNumber + 8; i++) {
      const refereeData = {
        id: `${i}번홀심판`,
        password: `123456`, // 기본 비밀번호
        hole: i,
        email: `referee${i}@yongin.com`,
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
