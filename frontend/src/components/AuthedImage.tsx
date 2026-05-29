import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface Props {
  fotoId: string;
  kind?: 'thumbnail' | 'file';
  alt?: string;
  className?: string;
  onClick?: () => void;
}

export function AuthedImage({ fotoId, kind = 'thumbnail', alt, className, onClick }: Props) {
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let blobUrl: string | null = null;
    let cancelled = false;

    api.fetchFotoBlob(token, fotoId, kind)
      .then((blob) => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setUrl(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [token, fotoId, kind]);

  if (error) {
    return (
      <div className={`${className} bg-muted flex items-center justify-center text-xs text-muted-foreground`}>
        Bild-Fehler
      </div>
    );
  }
  if (!url) {
    return <div className={`${className} bg-muted animate-pulse`} />;
  }
  return <img src={url} alt={alt ?? ''} className={className} onClick={onClick} />;
}