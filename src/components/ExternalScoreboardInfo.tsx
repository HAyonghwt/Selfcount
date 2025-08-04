import React, { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Copy } from "lucide-react";
// @ts-ignore
import QRCode from 'qrcode.react';



interface ExternalScoreboardInfoProps {
  url: string;
}

const ExternalScoreboardInfo: React.FC<ExternalScoreboardInfoProps> = ({ url }) => {
  const qrRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    try {
      // 모바일에서도 작동하는 복사 방법
      if (navigator.clipboard && window.isSecureContext) {
        // HTTPS 환경에서는 clipboard API 사용
        await navigator.clipboard.writeText(url);
        alert("주소가 복사되었습니다!");
      } else {
        // HTTP 환경이나 모바일에서는 fallback 방법 사용
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          alert("주소가 복사되었습니다!");
        } catch (err) {
          // execCommand도 실패하면 수동 복사 안내
          alert("복사에 실패했습니다. 주소를 수동으로 복사해 주세요.");
        }
        
        document.body.removeChild(textArea);
      }
    } catch (err) {
      // 모든 방법이 실패했을 때
      alert("복사에 실패했습니다. 주소를 수동으로 복사해 주세요.");
    }
  };

  const handleDownload = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (canvas) {
      const urlImg = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = urlImg;
      a.download = "scoreboard-qr.png";
      a.click();
    }
  };

  return (
    <Card className="external-scoreboard-card flex flex-col md:flex-row items-center justify-between p-4 mb-4">
      <CardContent className="external-scoreboard-content flex flex-col md:flex-row justify-between items-center p-6">
        {/* 왼쪽: 안내문구 + 주소폼 */}
        <div className="flex-1 flex flex-col justify-center" style={{ minWidth: 320, maxWidth: 480, width: '100%' }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, color: '#222' }}>
            외부 전광판 주소
          </div>
          <div style={{ color: '#666', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
            아래 주소를 선수들에게 알려주세요. 접속하면 종합 점수표를 직접볼 수 있습니다.<br/>
            오른쪽 QR코드를 복사하여 선수 휴게실에 부착하면 폰 카메라로 쉽게 접속이 가능합니다.
          </div>
          <div className="flex items-center" style={{ width: '100%' }}>
            <input
              type="text"
              value={url}
              readOnly
              className="border rounded px-2 py-1 mr-2 bg-gray-50 text-sm"
              style={{ minWidth: 0, width: '100%', fontSize: 15 }}
            />
            <Button variant="outline" onClick={handleCopy} className="ml-2" size="sm">
              <Copy className="w-4 h-4 mr-1" /> 주소 복사
            </Button>
          </div>
        </div>
        {/* 오른쪽: QR코드 및 다운로드 */}
        <div className="flex flex-col items-center justify-center ml-0 md:ml-8 mt-6 md:mt-0" style={{ minWidth: 160 }}>
          <div ref={qrRef} className="bg-white p-2 rounded shadow mb-2">
            {QRCode ? (
              <QRCode value={url} size={90} level="H" includeMargin={false} />
            ) : (
              <div style={{color: 'red', fontSize: 12}}>QR코드 라이브러리 로드 실패</div>
            )}
          </div>
          <Button variant="outline" onClick={handleDownload} size="sm" style={{ width: 140 }}>
            <Download className="w-4 h-4 mr-1" /> QR코드 다운로드
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExternalScoreboardInfo;
