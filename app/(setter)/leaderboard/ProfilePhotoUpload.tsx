'use client';
import { useRef, useState, useTransition } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { Avatar } from '@/components/Avatar';

type Props = {
  userId: string;
  initials: string;
  currentAvatarUrl: string | null;
};

export function ProfilePhotoUpload({ userId, initials, currentAvatarUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    inputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be under 5 MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPEG, PNG, WebP).');
      return;
    }

    setError(null);
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    startTransition(async () => {
      try {
        const supabase = getBrowserSupabase();
        const ext = file.name.split('.').pop() ?? 'jpg';
        // Include timestamp so URL changes on replace (cache-busting)
        const path = `${userId}/${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('setter-avatars')
          .upload(path, file, { upsert: false, contentType: file.type });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('setter-avatars')
          .getPublicUrl(path);

        const publicUrl = urlData.publicUrl;

        // Use the SECURITY DEFINER RPC so we only update avatar_url, not any other column
        const { error: rpcErr } = await supabase.rpc('update_own_avatar', { new_url: publicUrl });
        if (rpcErr) throw rpcErr;

        // Replace local blob URL with the permanent CDN URL
        setPreview(publicUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
        setPreview(currentAvatarUrl);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative group cursor-pointer" onClick={handleClick}>
        <Avatar
          avatarUrl={preview}
          initials={initials}
          sizeCls="w-16 h-16 text-xl"
          ring={null}
          rankFirst={false}
        />
        {/* Camera overlay */}
        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center
          opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-xl">📷</span>
        </div>
        {isPending && (
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="text-xs text-amber hover:underline disabled:opacity-50"
      >
        {preview ? 'Change photo' : 'Add photo'}
      </button>
      {error && <p className="text-xs text-bad">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
