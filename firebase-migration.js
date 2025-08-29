#!/usr/bin/env node

/**
 * Firebase Realtime Database 마이그레이션 도구
 * 현재 Firebase 프로젝트에서 새 Firebase 프로젝트로 모든 데이터를 안전하게 이동
 * 
 * 사용법:
 * node firebase-migration.js --mode=backup    (백업만 실행)
 * node firebase-migration.js --mode=migrate   (마이그레이션 실행)
 * node firebase-migration.js --mode=verify    (마이그레이션 검증)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 설정 파일들
const SOURCE_SERVICE_ACCOUNT = './source-firebase-key.json';  // 원본 프로젝트 서비스 계정
const TARGET_SERVICE_ACCOUNT = './target-firebase-key.json';  // 대상 프로젝트 서비스 계정
const BACKUP_DIR = './firebase-backup';

// 마이그레이션할 데이터 경로들
const DATA_PATHS = [
    'config',
    'players', 
    'scores',
    'scoreLogs',
    'tournaments'
];

class FirebaseMigration {
    constructor() {
        this.sourceApp = null;
        this.targetApp = null;
        this.sourceDb = null;
        this.targetDb = null;
        this.migrationLog = [];
    }

    /**
     * Firebase 앱 초기화
     */
    async initializeApps() {
        try {
            console.log('🔥 Firebase 앱 초기화 중...');

            // 원본 프로젝트 초기화
            if (!fs.existsSync(SOURCE_SERVICE_ACCOUNT)) {
                throw new Error(`원본 서비스 계정 파일이 없습니다: ${SOURCE_SERVICE_ACCOUNT}`);
            }

            const sourceServiceAccount = require(path.resolve(SOURCE_SERVICE_ACCOUNT));
            this.sourceApp = admin.initializeApp({
                credential: admin.credential.cert(sourceServiceAccount),
                databaseURL: sourceServiceAccount.database_url || `https://${sourceServiceAccount.project_id}-default-rtdb.firebaseio.com/`
            }, 'source');

            this.sourceDb = this.sourceApp.database();
            console.log('✅ 원본 Firebase 프로젝트 연결 완료');

            // 대상 프로젝트 초기화
            if (!fs.existsSync(TARGET_SERVICE_ACCOUNT)) {
                throw new Error(`대상 서비스 계정 파일이 없습니다: ${TARGET_SERVICE_ACCOUNT}`);
            }

            const targetServiceAccount = require(path.resolve(TARGET_SERVICE_ACCOUNT));
            this.targetApp = admin.initializeApp({
                credential: admin.credential.cert(targetServiceAccount),
                databaseURL: targetServiceAccount.database_url || `https://${targetServiceAccount.project_id}-default-rtdb.firebaseio.com/`
            }, 'target');

            this.targetDb = this.targetApp.database();
            console.log('✅ 대상 Firebase 프로젝트 연결 완료');

        } catch (error) {
            console.error('❌ Firebase 초기화 실패:', error.message);
            process.exit(1);
        }
    }

    /**
     * 데이터 백업
     */
    async backupData() {
        try {
            console.log('💾 데이터 백업 시작...');
            
            // 백업 디렉토리 생성
            if (!fs.existsSync(BACKUP_DIR)) {
                fs.mkdirSync(BACKUP_DIR, { recursive: true });
            }

            const backupData = {};
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            for (const path of DATA_PATHS) {
                console.log(`📦 ${path} 백업 중...`);
                
                const snapshot = await this.sourceDb.ref(path).once('value');
                const data = snapshot.val();
                
                if (data) {
                    backupData[path] = data;
                    console.log(`✅ ${path}: ${Object.keys(data).length} 항목 백업 완료`);
                } else {
                    console.log(`⚠️ ${path}: 데이터 없음`);
                    backupData[path] = null;
                }
            }

            // 백업 파일 저장
            const backupFile = path.join(BACKUP_DIR, `firebase-backup-${timestamp}.json`);
            fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
            
            console.log(`✅ 백업 완료: ${backupFile}`);
            
            // 백업 요약 저장
            const summary = {
                timestamp,
                totalPaths: DATA_PATHS.length,
                pathSummary: DATA_PATHS.map(p => ({
                    path: p,
                    hasData: backupData[p] !== null,
                    itemCount: backupData[p] ? Object.keys(backupData[p]).length : 0
                }))
            };
            
            fs.writeFileSync(
                path.join(BACKUP_DIR, `backup-summary-${timestamp}.json`), 
                JSON.stringify(summary, null, 2)
            );

            return backupFile;

        } catch (error) {
            console.error('❌ 백업 실패:', error.message);
            throw error;
        }
    }

    /**
     * 데이터 마이그레이션
     */
    async migrateData() {
        try {
            console.log('🚀 데이터 마이그레이션 시작...');
            
            const migrationResults = {};

            for (const path of DATA_PATHS) {
                console.log(`🔄 ${path} 마이그레이션 중...`);
                
                try {
                    // 원본에서 데이터 읽기
                    const snapshot = await this.sourceDb.ref(path).once('value');
                    const data = snapshot.val();
                    
                    if (!data) {
                        console.log(`⏭️ ${path}: 데이터 없음, 스킵`);
                        migrationResults[path] = { success: true, items: 0, skipped: true };
                        continue;
                    }

                    // 대상으로 데이터 쓰기
                    await this.targetDb.ref(path).set(data);
                    
                    const itemCount = typeof data === 'object' ? Object.keys(data).length : 1;
                    console.log(`✅ ${path}: ${itemCount} 항목 마이그레이션 완료`);
                    
                    migrationResults[path] = { success: true, items: itemCount, skipped: false };
                    
                    // 진행률 표시
                    const progress = ((DATA_PATHS.indexOf(path) + 1) / DATA_PATHS.length * 100).toFixed(1);
                    console.log(`📊 진행률: ${progress}%`);
                    
                } catch (error) {
                    console.error(`❌ ${path} 마이그레이션 실패:`, error.message);
                    migrationResults[path] = { success: false, error: error.message };
                }
            }

            // 마이그레이션 결과 저장
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const resultFile = path.join(BACKUP_DIR, `migration-result-${timestamp}.json`);
            fs.writeFileSync(resultFile, JSON.stringify(migrationResults, null, 2));
            
            console.log(`📋 마이그레이션 결과 저장: ${resultFile}`);
            
            return migrationResults;

        } catch (error) {
            console.error('❌ 마이그레이션 실패:', error.message);
            throw error;
        }
    }

    /**
     * 마이그레이션 검증
     */
    async verifyMigration() {
        try {
            console.log('🔍 마이그레이션 검증 시작...');
            
            const verificationResults = {};

            for (const path of DATA_PATHS) {
                console.log(`🔎 ${path} 검증 중...`);
                
                try {
                    // 원본과 대상에서 데이터 읽기
                    const sourceSnapshot = await this.sourceDb.ref(path).once('value');
                    const targetSnapshot = await this.targetDb.ref(path).once('value');
                    
                    const sourceData = sourceSnapshot.val();
                    const targetData = targetSnapshot.val();
                    
                    // 데이터 비교
                    const sourceStr = JSON.stringify(sourceData);
                    const targetStr = JSON.stringify(targetData);
                    const isIdentical = sourceStr === targetStr;
                    
                    const sourceCount = sourceData ? Object.keys(sourceData).length : 0;
                    const targetCount = targetData ? Object.keys(targetData).length : 0;
                    
                    verificationResults[path] = {
                        identical: isIdentical,
                        sourceCount,
                        targetCount,
                        success: isIdentical && sourceCount === targetCount
                    };
                    
                    if (isIdentical) {
                        console.log(`✅ ${path}: 검증 성공 (${sourceCount} 항목)`);
                    } else {
                        console.log(`❌ ${path}: 검증 실패 - 원본: ${sourceCount}, 대상: ${targetCount}`);
                    }
                    
                } catch (error) {
                    console.error(`❌ ${path} 검증 오류:`, error.message);
                    verificationResults[path] = { success: false, error: error.message };
                }
            }

            // 검증 결과 저장
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const verifyFile = path.join(BACKUP_DIR, `verification-${timestamp}.json`);
            fs.writeFileSync(verifyFile, JSON.stringify(verificationResults, null, 2));
            
            console.log(`📋 검증 결과 저장: ${verifyFile}`);
            
            // 전체 검증 결과
            const allSuccess = Object.values(verificationResults).every(r => r.success);
            if (allSuccess) {
                console.log('🎉 모든 데이터 검증 성공!');
            } else {
                console.log('⚠️ 일부 데이터 검증 실패');
            }
            
            return verificationResults;

        } catch (error) {
            console.error('❌ 검증 실패:', error.message);
            throw error;
        }
    }

    /**
     * 앱 정리
     */
    cleanup() {
        if (this.sourceApp) {
            this.sourceApp.delete();
        }
        if (this.targetApp) {
            this.targetApp.delete();
        }
    }
}

// CLI 실행 부분
async function main() {
    const args = process.argv.slice(2);
    const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'help';
    
    if (mode === 'help') {
        console.log(`
🔥 Firebase 마이그레이션 도구

사용법:
  node firebase-migration.js --mode=backup    # 백업만 실행
  node firebase-migration.js --mode=migrate   # 마이그레이션 실행
  node firebase-migration.js --mode=verify    # 마이그레이션 검증
  node firebase-migration.js --mode=full      # 백업 + 마이그레이션 + 검증

준비사항:
  1. source-firebase-key.json (원본 프로젝트 서비스 계정)
  2. target-firebase-key.json (대상 프로젝트 서비스 계정)
        `);
        return;
    }

    const migration = new FirebaseMigration();
    
    try {
        await migration.initializeApps();
        
        switch (mode) {
            case 'backup':
                await migration.backupData();
                break;
                
            case 'migrate':
                await migration.backupData();
                await migration.migrateData();
                break;
                
            case 'verify':
                await migration.verifyMigration();
                break;
                
            case 'full':
                await migration.backupData();
                await migration.migrateData();
                await migration.verifyMigration();
                break;
                
            default:
                console.error('❌ 알 수 없는 모드:', mode);
                process.exit(1);
        }
        
        console.log('🎉 작업 완료!');
        
    } catch (error) {
        console.error('❌ 작업 실패:', error.message);
        process.exit(1);
    } finally {
        migration.cleanup();
    }
}

// 스크립트 실행
if (require.main === module) {
    main();
}

module.exports = FirebaseMigration;
