'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  isImage?: boolean;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

// Uploads via Frappe's own upload_file whitelisted method (the same one
// Frappe Desk's attach control calls) and stores the returned file_url in
// the field. Public (is_private: '0') so the resulting URL can be shown
// directly with a plain <img>/<a> — private files would need every viewer
// request to also carry the session cookie, which a same-origin <img> does
// send, but public keeps this simple and matches how most master-data
// images (item/asset pictures, logos) are actually used.
export function AttachField({ value, onChange, disabled, isImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showImage = !!value && (isImage || IMAGE_EXT_RE.test(value));

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('is_private', '0');
      const res = await fetch('/api/method/upload_file', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.exception || data?.message || res.statusText);
      const fileUrl = data?.message?.file_url as string | undefined;
      if (!fileUrl) throw new Error('Upload succeeded but no file URL was returned');
      onChange(fileUrl);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      {value && (
        <div className="flex items-center gap-2">
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic, arbitrary-origin-free proxied path; next/image adds nothing here
            <img src={value} alt="" className="h-14 w-14 rounded border object-cover" />
          ) : (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline truncate max-w-[200px]"
            >
              {value.split('/').pop()}
            </a>
          )}
          {!disabled && (
            <button type="button" onClick={() => onChange('')} className="text-xs text-destructive hover:underline">
              Remove
            </button>
          )}
        </div>
      )}
      {!disabled && (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : value ? 'Replace file' : 'Upload file'}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
