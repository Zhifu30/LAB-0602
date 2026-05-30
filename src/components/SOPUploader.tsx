import React, { useState, useRef } from 'react';
import { Upload, FileText, X, Link, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SOPUploaderProps {
  sopFileUrl?: string;
  sopFileName?: string;
  onSOPChange: (fileUrl: string, fileName: string) => void;
}

const SOPUploader: React.FC<SOPUploaderProps> = ({
  sopFileUrl,
  sopFileName,
  onSOPChange
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        onSOPChange(result, file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim() && nameInput.trim()) {
      onSOPChange(urlInput.trim(), nameInput.trim());
      setUrlInput('');
      setNameInput('');
    }
  };

  const removeSOP = () => {
    onSOPChange('', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadSOP = () => {
    if (sopFileUrl) {
      const link = document.createElement('a');
      link.href = sopFileUrl;
      link.download = sopFileName || 'SOP文件';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">标准操作程序 (SOP)</Label>
      
      {/* SOP文件显示 */}
      {sopFileUrl ? (
        <div className="p-4 border border-border rounded-lg bg-muted/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-sm">{sopFileName || 'SOP文件'}</p>
                <p className="text-xs text-muted-foreground">点击下载查看</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadSOP}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={removeSOP}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50">
          <div className="text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
            <p className="text-sm text-muted-foreground">暂无SOP文件</p>
          </div>
        </div>
      )}

      {/* 上传选项 */}
      <div className="space-y-3">
        {/* 文件上传 */}
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          上传SOP文件
        </Button>
        
        {/* URL输入 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input
            placeholder="SOP文件URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <Input
            placeholder="文件名称"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleUrlSubmit}
          disabled={!urlInput.trim() || !nameInput.trim()}
          className="w-full flex items-center gap-2"
        >
          <Link className="h-4 w-4" />
          添加链接文件
        </Button>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
};

export default SOPUploader;