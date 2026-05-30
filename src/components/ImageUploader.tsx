import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, X, Link, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ImageUploaderProps {
  imageUrl?: string;
  onImageChange: (imageUrl: string) => void;
  equipmentModel?: string;
  manufacturer?: string;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  imageUrl,
  onImageChange,
  equipmentModel,
  manufacturer
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        onImageChange(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onImageChange(urlInput.trim());
      setUrlInput('');
    }
  };

  const searchOnlineImage = () => {
    if (!equipmentModel && !manufacturer) return;
    
    // 构建搜索查询
    const searchQuery = `${manufacturer || ''} ${equipmentModel || ''} laboratory equipment`.trim();
    
    // 打开Google图片搜索
    const googleSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`;
    window.open(googleSearchUrl, '_blank');
  };

  const removeImage = () => {
    onImageChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">设备图片</Label>
      
      {/* 图片预览 */}
      {imageUrl ? (
        <div className="relative">
          <img 
            src={imageUrl} 
            alt="设备图片" 
            className="w-full h-48 object-cover rounded-lg border border-border"
            onError={(e) => {
              e.currentTarget.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=300&fit=crop';
            }}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2"
            onClick={removeImage}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="w-full h-48 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50">
          <div className="text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">暂无图片</p>
          </div>
        </div>
      )}

      {/* 上传选项 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* 文件上传 */}
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          本地上传
        </Button>
        
        {/* 在线搜索 */}
        <Button
          type="button"
          variant="outline"
          onClick={searchOnlineImage}
          disabled={isSearching || (!equipmentModel && !manufacturer)}
          className="flex items-center gap-2"
        >
          <Search className="h-4 w-4" />
          {isSearching ? '搜索中...' : '在线搜索'}
        </Button>

        {/* URL输入 */}
        <div className="flex gap-1">
          <Input
            placeholder="图片URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleUrlSubmit()}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUrlSubmit}
          >
            <Link className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
};

export default ImageUploader;