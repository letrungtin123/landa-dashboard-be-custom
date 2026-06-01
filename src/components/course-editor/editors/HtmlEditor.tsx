import React, { useRef } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { uploadCourseAsset } from '@/api/custom-course-authoring';
import RichTextEditor from '../RichTextEditor';
import { Field } from './VideoEditor';

interface HtmlEditorProps {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  htmlContent: string;
  onHtmlChange: (v: string) => void;
  courseId: string;
}

export default function HtmlEditor({ displayName, onDisplayNameChange, htmlContent, onHtmlChange, courseId }: HtmlEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [editorRef, setEditorRef] = React.useState<any>(null);

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadCourseAsset(courseId, file);
      const assetUrl = result?.url || '';
      if (assetUrl && editorRef) {
        editorRef.chain().focus().setImage({ src: assetUrl, alt: file.name }).run();
        toast.success('Đã upload ảnh thành công');
      } else if (assetUrl) {
        // Inject vào cuối HTML
        onHtmlChange(htmlContent + `<img src="${assetUrl}" alt="${file.name}" />`);
        toast.success('Đã upload ảnh');
      }
    } catch (err: any) {
      toast.error('Upload ảnh thất bại: ' + (err?.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Field label="Tên hiển thị">
        <input
          className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm font-medium shadow-sm transition-all duration-200 hover:bg-background focus:border-primary focus:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </Field>

      <Field label="Nội dung bài học (Rich Text + Ảnh)">
        <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-muted/40 border border-border">
          <Button
            variant="default"
            size="sm"
            className="gap-2 h-9 rounded-lg px-4 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Upload ảnh
          </Button>
          <span className="text-xs text-muted-foreground/80 font-medium">
            Ảnh sẽ được tự động lưu lên server CMS và chèn vào nội dung.
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = '';
            }}
          />
        </div>
        <div className="rounded-xl overflow-hidden border border-input bg-background shadow-sm focus-within:ring-4 focus-within:ring-primary/10 focus-within:border-primary transition-all duration-200">
          <RichTextEditorWithRef
            content={htmlContent}
            onChange={onHtmlChange}
            onEditorReady={setEditorRef}
          />
        </div>
      </Field>
    </div>
  );
}

// Wrapper để lấy editor ref từ RichTextEditor
function RichTextEditorWithRef({
  content, onChange, onEditorReady,
}: {
  content: string;
  onChange: (v: string) => void;
  onEditorReady: (editor: any) => void;
}) {
  return (
    <RichTextEditor
      content={content}
      onChange={onChange}
      onEditorReady={onEditorReady}
    />
  );
}
