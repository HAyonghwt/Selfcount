#!/usr/bin/env node

/**
 * 🚀 초간단 Firebase Realtime Database 마이그레이션
 * 
 * 사용법:
 * 1. 원본 프로젝트에서 JSON 다운로드
 * 2. 새 프로젝트에 JSON 업로드
 * 
 * node simple-migration.js --download    # 원본에서 다운로드
 * node simple-migration.js --upload      # 새 프로젝트에 업로드
 */

const admin = require('firebase-admin');
const fs = require('fs');

// 🔧 설정 (여기만 수정하면 됨)
const CONFIG = {
    // 원본 프로젝트 설정
    source: {
        projectId: 'your-source-project-id',
        databaseURL: 'https://your-source-project-default-rtdb.firebaseio.com/',
        serviceAccountPath: './source-key.json'
    },
    
    // 대상 프로젝트 설정  
    target: {
        projectId: 'your-target-project-id',
        databaseURL: 'https://your-target-project-default-rtdb.firebaseio.com/',
        serviceAccountPath: './target-key.json'
    },
    
    // 다운로드할 데이터 경로 (필요한 것만 선택)
    dataPaths: [
        'config',
        'players',
        'scores', 
        'scoreLogs',
        'tournaments'
    ]
};

class SimpleMigration {
    async downloadData() {
        console.log('📥 Realtime Database 데이터 다운로드 시작...');
        
        try {
            // 원본 프로젝트 연결
            const sourceApp = admin.initializeApp({
                credential: admin.credential.cert(require(CONFIG.source.serviceAccountPath)),
                databaseURL: CONFIG.source.databaseURL
            }, 'source');

            const sourceDb = sourceApp.database();
            const allData = {};

            // 각 경로별로 데이터 다운로드
            for (const path of CONFIG.dataPaths) {
                console.log(`📦 ${path} 다운로드 중...`);
                
                const snapshot = await sourceDb.ref(path).once('value');
                const data = snapshot.val();
                
                if (data) {
                    allData[path] = data;
                    const count = typeof data === 'object' ? Object.keys(data).length : 1;
                    console.log(`✅ ${path}: ${count} 항목`);
                } else {
                    console.log(`⚠️ ${path}: 데이터 없음`);
                }
            }

            // JSON 파일로 저장
            const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const filename = `firebase-data-${timestamp}.json`;
            
            fs.writeFileSync(filename, JSON.stringify(allData, null, 2));
            console.log(`💾 저장 완료: ${filename}`);
            
            // 요약 정보
            const summary = {
                downloadDate: new Date().toISOString(),
                sourceProject: CONFIG.source.projectId,
                totalPaths: CONFIG.dataPaths.length,
                dataSize: JSON.stringify(allData).length,
                paths: CONFIG.dataPaths.map(path => ({
                    path,
                    hasData: !!allData[path],
                    itemCount: allData[path] ? Object.keys(allData[path]).length : 0
                }))
            };
            
            fs.writeFileSync(`summary-${timestamp}.json`, JSON.stringify(summary, null, 2));
            console.log(`📊 요약 저장: summary-${timestamp}.json`);

            await sourceApp.delete();
            return filename;

        } catch (error) {
            console.error('❌ 다운로드 실패:', error.message);
            throw error;
        }
    }

    async uploadData(filename) {
        console.log(`📤 ${filename} 업로드 시작...`);
        
        try {
            // 파일 존재 확인
            if (!fs.existsSync(filename)) {
                throw new Error(`파일을 찾을 수 없습니다: ${filename}`);
            }

            // 데이터 로드
            const allData = JSON.parse(fs.readFileSync(filename, 'utf8'));
            
            // 대상 프로젝트 연결
            const targetApp = admin.initializeApp({
                credential: admin.credential.cert(require(CONFIG.target.serviceAccountPath)),
                databaseURL: CONFIG.target.databaseURL
            }, 'target');

            const targetDb = targetApp.database();

            // 각 경로별로 데이터 업로드
            for (const [path, data] of Object.entries(allData)) {
                if (!data) {
                    console.log(`⏭️ ${path}: 데이터 없음, 스킵`);
                    continue;
                }

                console.log(`📤 ${path} 업로드 중...`);
                
                await targetDb.ref(path).set(data);
                
                const count = typeof data === 'object' ? Object.keys(data).length : 1;
                console.log(`✅ ${path}: ${count} 항목 업로드 완료`);
            }

            console.log('🎉 모든 데이터 업로드 완료!');
            await targetApp.delete();

        } catch (error) {
            console.error('❌ 업로드 실패:', error.message);
            throw error;
        }
    }

    async verifyData(filename) {
        console.log('🔍 데이터 검증 시작...');
        
        try {
            // 원본 데이터 로드
            const originalData = JSON.parse(fs.readFileSync(filename, 'utf8'));
            
            // 대상 프로젝트에서 데이터 읽기
            const targetApp = admin.initializeApp({
                credential: admin.credential.cert(require(CONFIG.target.serviceAccountPath)),
                databaseURL: CONFIG.target.databaseURL
            }, 'verify');

            const targetDb = targetApp.database();
            let allMatch = true;

            for (const [path, originalPathData] of Object.entries(originalData)) {
                if (!originalPathData) continue;

                console.log(`🔎 ${path} 검증 중...`);
                
                const snapshot = await targetDb.ref(path).once('value');
                const uploadedData = snapshot.val();
                
                const isMatch = JSON.stringify(originalPathData) === JSON.stringify(uploadedData);
                
                if (isMatch) {
                    const count = Object.keys(originalPathData).length;
                    console.log(`✅ ${path}: 검증 성공 (${count} 항목)`);
                } else {
                    console.log(`❌ ${path}: 검증 실패`);
                    allMatch = false;
                }
            }

            if (allMatch) {
                console.log('🎉 모든 데이터 검증 성공!');
            } else {
                console.log('⚠️ 일부 데이터 검증 실패');
            }

            await targetApp.delete();
            return allMatch;

        } catch (error) {
            console.error('❌ 검증 실패:', error.message);
            throw error;
        }
    }
}

// CLI 실행
async function main() {
    const args = process.argv.slice(2);
    const mode = args.find(arg => arg.startsWith('--'))?.substring(2) || 'help';
    
    if (mode === 'help') {
        console.log(`
🚀 초간단 Firebase Realtime Database 마이그레이션

사용법:
  node simple-migration.js --download     # 원본에서 JSON 다운로드
  node simple-migration.js --upload      # 새 프로젝트에 JSON 업로드  
  node simple-migration.js --verify      # 업로드 결과 검증

준비사항:
  1. CONFIG 섹션에서 프로젝트 정보 수정
  2. source-key.json (원본 프로젝트 서비스 계정)
  3. target-key.json (대상 프로젝트 서비스 계정)
        `);
        return;
    }

    const migration = new SimpleMigration();
    
    try {
        switch (mode) {
            case 'download':
                const filename = await migration.downloadData();
                console.log(`\n✅ 다운로드 완료! 다음 명령어로 업로드하세요:`);
                console.log(`node simple-migration.js --upload`);
                break;
                
            case 'upload':
                // 가장 최근 파일 찾기
                const files = fs.readdirSync('.').filter(f => f.startsWith('firebase-data-') && f.endsWith('.json'));
                if (files.length === 0) {
                    throw new Error('업로드할 데이터 파일이 없습니다. --download를 먼저 실행하세요.');
                }
                const latestFile = files.sort().pop();
                await migration.uploadData(latestFile);
                console.log(`\n✅ 업로드 완료! 다음 명령어로 검증하세요:`);
                console.log(`node simple-migration.js --verify`);
                break;
                
            case 'verify':
                const verifyFiles = fs.readdirSync('.').filter(f => f.startsWith('firebase-data-') && f.endsWith('.json'));
                if (verifyFiles.length === 0) {
                    throw new Error('검증할 데이터 파일이 없습니다.');
                }
                const verifyFile = verifyFiles.sort().pop();
                await migration.verifyData(verifyFile);
                break;
                
            default:
                console.error('❌ 알 수 없는 모드:', mode);
                process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ 작업 실패:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = SimpleMigration;
