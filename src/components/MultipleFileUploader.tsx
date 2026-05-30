import React, { useState } from 'react';
import { Upload, X, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FileInfo {
  name: string;
  url: string;
  size?: number;
  uploadedAt?: string;
}

interface MultipleFileUploaderProps {
  files: FileInfo[];
  onFilesChange: (files: FileInfo[]) => void;
  bucketName: string;
  label: string;
  acceptedTypes?: string;
  maxFiles?: number;
}

const MultipleFileUploader: React.FC<MultipleFileUploaderProps> = ({
  files,
  onFilesChange,
  bucketName,
  label,
  acceptedTypes = ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png",
  maxFiles = 10
}) => {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    if (files.length + selectedFiles.length > maxFiles) {
      toast.error(`最多只能上传 ${maxFiles} 个文件`);
      return;
    }

    setIsUploading(true);
    const uploadedFiles: FileInfo[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(fileName, file);

        if (error) {
          console.error('Error uploading file:', error);
          toast.error(`上传文件 ${file.name} 失败`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(data.path);

        uploadedFiles.push({
          name: file.name,
          url: urlData.publicUrl,
          size: file.size,
          uploadedAt: new Date().toISOString()
        });
      }

      if (uploadedFiles.length > 0) {
        const newFiles = [...files, ...uploadedFiles];
        onFilesChange(newFiles);
        toast.success(`成功上传 ${uploadedFiles.length} 个文件`);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error('文件上传失败');
    } finally {
      setIsUploading(false);
      // Reset the input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    onFilesChange(newFiles);
    toast.success('文件已删除');
  };

  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium text-gray-700">{label}</Label>
        <div className="mt-1">
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-4 text-gray-500" />
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">点击上传文件</span>
                </p>
                <p className="text-xs text-gray-500">
                  支持格式: {acceptedTypes.replace(/\./g, '').toUpperCase()}
                </p>
                <p className="text-xs text-gray-500">
                  最多 {maxFiles} 个文件
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                accept={acceptedTypes}
                multiple
                onChange={handleFileUpload}
                disabled={isUploading || files.length >= maxFiles}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 已上传文件列表 */}
      {files.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">已上传文件 ({files.length})</Label>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </p>
                    {file.size && (
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)}
                        {file.uploadedAt && (
                          <span className="ml-2">
                            {new Date(file.uploadedAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(file.url, '_blank')}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveFile(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isUploading && (
        <div className="text-center py-2">
          <div className="inline-flex items-center text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            正在上传文件...
          </div>
        </div>
      )}
    </div>
  );
};

export default MultipleFileUploader;