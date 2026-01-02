"use client";
import React, { useEffect, useState, useRef } from "react";
import { db } from "@/lib/firebase";
import { ref, onValue, get, set, remove } from "firebase/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Database, Save, RotateCcw, Trash2, Loader2, Download, Upload } from "lucide-react";

interface SystemBackup {
  backupId: string;
  savedAt: string;
  tournamentName: string;
  tournamentData: any;
  players: any;
  scores: any;
  scoreLogs?: any;
}

function formatBackupId(backupId: string): string {
  // YYYYMMDD_HHMMSS 형식을 YYYY-MM-DD HH:MM:SS로 변환
  if (backupId.match(/^\d{8}_\d{6}$/)) {
    return backupId.replace(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, "$1-$2-$3 $4:$5:$6");
  }
  return backupId;
}

const BackupList: React.FC = () => {
  const [backups, setBackups] = useState<SystemBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<SystemBackup | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!db) return;
    const backupsRef = ref(db, "systemBackups");
    const unsub = onValue(backupsRef, (snap) => {
      const val = snap.val() || {};
      const arr: SystemBackup[] = Object.entries(val).map(([id, v]: any) => ({
        backupId: id,
        ...v,
      }));
      // 최신순 정렬
      arr.sort((a, b) => b.backupId.localeCompare(a.backupId));
      setBackups(arr);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 백업 생성
  const handleCreateBackup = async () => {
    if (!db) {
      toast({
        title: "오류",
        description: "데이터베이스 연결이 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      // 1. 현재 데이터 읽기
      const tournamentRef = ref(db, "tournaments/current");
      const playersRef = ref(db, "players");
      const scoresRef = ref(db, "scores");
      const scoreLogsRef = ref(db, "scoreLogs");

      const [tournamentSnap, playersSnap, scoresSnap, scoreLogsSnap] = await Promise.all([
        get(tournamentRef),
        get(playersRef),
        get(scoresRef),
        get(scoreLogsRef),
      ]);

      const tournamentData = tournamentSnap.val() || {};
      const playersData = playersSnap.val() || {};
      const scoresData = scoresSnap.val() || {};
      const scoreLogsData = scoreLogsSnap.val() || {};

      // 2. 백업 ID 생성 (YYYYMMDD_HHMMSS)
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const backupId = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      // 3. 백업 데이터 저장
      const backupData: SystemBackup = {
        backupId,
        savedAt: now.toISOString(),
        tournamentName: tournamentData.name || "대회",
        tournamentData,
        players: playersData,
        scores: scoresData,
        scoreLogs: scoreLogsData,
      };

      await set(ref(db, `systemBackups/${backupId}`), backupData);

      toast({
        title: "백업 완료",
        description: `백업이 성공적으로 생성되었습니다. (${formatBackupId(backupId)})`,
      });
    } catch (e: any) {
      console.error("백업 생성 실패:", e);
      toast({
        title: "백업 실패",
        description: e?.message || "백업 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // 복원 확인 다이얼로그 열기
  const handleRestoreClick = (backup: SystemBackup) => {
    setSelectedBackup(backup);
    setRestoreConfirmOpen(true);
  };

  // 백업 복원
  const handleRestoreBackup = async () => {
    if (!db || !selectedBackup) {
      toast({
        title: "오류",
        description: "데이터베이스 연결이 없거나 백업 데이터가 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setRestoreConfirmOpen(false);
    setRestoring(selectedBackup.backupId);

    try {
      // 1. 현재 데이터 삭제
      await Promise.all([
        set(ref(db, "tournaments/current"), null),
        set(ref(db, "players"), null),
        set(ref(db, "scores"), null),
        set(ref(db, "scoreLogs"), null),
      ]);

      // 2. 백업 데이터 복원
      await Promise.all([
        set(ref(db, "tournaments/current"), selectedBackup.tournamentData || {}),
        set(ref(db, "players"), selectedBackup.players || {}),
        set(ref(db, "scores"), selectedBackup.scores || {}),
        set(ref(db, "scoreLogs"), selectedBackup.scoreLogs || {}),
      ]);

      toast({
        title: "복원 완료",
        description: `백업 데이터가 성공적으로 복원되었습니다. (${formatBackupId(selectedBackup.backupId)})`,
      });

      // 페이지 새로고침 (데이터 반영)
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (e: any) {
      console.error("복원 실패:", e);
      toast({
        title: "복원 실패",
        description: e?.message || "복원 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setRestoring(null);
      setSelectedBackup(null);
    }
  };

  // 삭제 확인 다이얼로그 열기
  const handleDeleteClick = (backup: SystemBackup) => {
    setSelectedBackup(backup);
    setDeleteConfirmOpen(true);
  };

  // 백업 삭제
  const handleDeleteBackup = async () => {
    if (!db || !selectedBackup) {
      toast({
        title: "오류",
        description: "데이터베이스 연결이 없거나 백업 데이터가 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setDeleteConfirmOpen(false);
    setDeleting(selectedBackup.backupId);

    try {
      await remove(ref(db, `systemBackups/${selectedBackup.backupId}`));

      toast({
        title: "삭제 완료",
        description: `백업이 성공적으로 삭제되었습니다. (${formatBackupId(selectedBackup.backupId)})`,
      });
    } catch (e: any) {
      console.error("삭제 실패:", e);
      toast({
        title: "삭제 실패",
        description: e?.message || "삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
      setSelectedBackup(null);
    }
  };

  // 백업 파일 다운로드
  const handleDownloadBackup = (backup: SystemBackup) => {
    const backupJson = JSON.stringify(backup, null, 2);
    const blob = new Blob([backupJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup_${backup.backupId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 백업 파일 업로드 버튼 클릭
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 백업 파일 선택 및 처리
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 초기화하여 같은 파일을 다시 선택할 수 있게 함
    event.target.value = "";

    setUploading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);

        // 유효성 검사: 기본적인 필수 키 확인
        if (!json.tournamentData && !json.players && !json.scores) {
          throw new Error("유효하지 않은 백업 파일 형식입니다. (필수 데이터 누락)");
        }

        // 새로운 백업 ID 생성 (현재 시간 기준)
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, "0");
        const newBackupId = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

        // 업로드할 데이터 구성
        const newBackupData: SystemBackup = {
          ...json,
          backupId: newBackupId, // ID는 새로 생성
          savedAt: now.toISOString(), // 저장 시간은 현재 시간으로 갱신
          tournamentName: `${json.tournamentName || "가져온 백업"} (가져옴)`,
        };

        // systemBackups 경로에 저장
        await set(ref(db, `systemBackups/${newBackupId}`), newBackupData);

        toast({
          title: "백업 가져오기 성공",
          description: `백업 파일이 목록에 추가되었습니다. (${formatBackupId(newBackupId)})`,
        });
      } catch (error: any) {
        console.error("백업 가져오기 실패:", error);
        toast({
          title: "백업 가져오기 실패",
          description: error.message || "파일을 처리하는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    };

    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            시스템 백업 관리
          </CardTitle>
          <CardDescription>
            현재 상태의 모든 데이터를 백업하고 복원할 수 있습니다. 백업 데이터는 안전하게 보관되며, 필요시 복원할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-4">
            <Button
              onClick={handleCreateBackup}
              disabled={creating}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  백업 중...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  백업 생성
                </>
              )}
            </Button>
            <Button
              onClick={handleUploadClick}
              disabled={creating || uploading}
              variant="outline"
              className="ml-2 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  업로드 중...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  백업 파일 가져오기
                </>
              )}
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
          </div>

          {backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              백업된 데이터가 없습니다. "백업 생성" 버튼을 눌러 현재 상태를 백업하세요.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">백업 일시</TableHead>
                    <TableHead>대회명</TableHead>
                    <TableHead className="w-[100px]">선수 수</TableHead>
                    <TableHead className="w-[300px] text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => {
                    const playerCount = backup.players ? Object.keys(backup.players).length : 0;
                    const isRestoring = restoring === backup.backupId;
                    const isDeleting = deleting === backup.backupId;

                    return (
                      <TableRow key={backup.backupId}>
                        <TableCell className="font-medium">
                          {formatBackupId(backup.backupId)}
                        </TableCell>
                        <TableCell>{backup.tournamentName || "대회"}</TableCell>
                        <TableCell>{playerCount}명</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              onClick={() => handleDownloadBackup(backup)}
                              disabled={isRestoring || isDeleting}
                              variant="outline"
                              size="sm"
                              className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                            >
                              <Download className="mr-2 h-3 w-3" />
                              다운로드
                            </Button>
                            <Button
                              onClick={() => handleRestoreClick(backup)}
                              disabled={isRestoring || isDeleting}
                              variant="outline"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              {isRestoring ? (
                                <>
                                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                  복원 중...
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="mr-2 h-3 w-3" />
                                  복원
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={() => handleDeleteClick(backup)}
                              disabled={isRestoring || isDeleting}
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {isDeleting ? (
                                <>
                                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                  삭제 중...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="mr-2 h-3 w-3" />
                                  삭제
                                </>
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 복원 확인 다이얼로그 */}
      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>백업 복원 확인</AlertDialogTitle>
            <AlertDialogDescription>
              현재 모든 데이터가 삭제되고 백업 데이터로 복원됩니다.
              <br />
              <br />
              <strong>백업 일시:</strong> {selectedBackup ? formatBackupId(selectedBackup.backupId) : ""}
              <br />
              <strong>대회명:</strong> {selectedBackup?.tournamentName || "대회"}
              <br />
              <br />
              이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreBackup}
              className="bg-blue-600 hover:bg-blue-700"
            >
              복원
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>백업 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              백업 데이터를 삭제하시겠습니까?
              <br />
              <br />
              <strong>백업 일시:</strong> {selectedBackup ? formatBackupId(selectedBackup.backupId) : ""}
              <br />
              <strong>대회명:</strong> {selectedBackup?.tournamentName || "대회"}
              <br />
              <br />
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBackup}
              className="bg-red-600 hover:bg-red-700"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BackupList;

