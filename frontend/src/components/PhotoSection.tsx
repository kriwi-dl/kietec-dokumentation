import { useRef, useState } from 'react';
import { Camera, Trash2, X } from 'lucide-react';
import { api, type Foto, type FotoKategorie } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthedImage } from './AuthedImage';
import { cn } from '@/lib/utils';

const KATEGORIEN: Array<{ value: FotoKategorie; label: string }> = [
  { value: 'VOR_BEGINN', label: 'Vor Beginn' },
  { value: 'FORTSCHRITT', label: 'Fortschritt' },
  { value: 'VERKABELUNG', label: 'Verkabelung' },
  { value: 'TYPENSCHILD', label: 'Typenschild' },
  { value: 'MAENGEL', label: 'Mängel' },
  { value: 'ENDABNAHME', label: 'Endabnahme' },
  { value: 'SONSTIGES', label: 'Sonstiges' },
];

interface Props {
  dokuId: string;
  fotos: Foto[];
  onChange: (fotos: Foto[]) => void;
}

export function PhotoSection({ dokuId, fotos, onChange }: Props) {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kategorie, setKategorie] = useState<FotoKategorie>('FORTSCHRITT');
  const [lightboxFoto, setLightboxFoto] = useState<Foto | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!token || !e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setUploading(true);
    setError(null);
    setUploadProgress({ current: 0, total: files.length });

    const newFotos: Foto[] = [];
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length });
      console.log('[handleFileSelect] kategorie state =', kategorie);
      try {
        const result = await api.uploadFoto(token, dokuId, files[i], { kategorie });
        newFotos.push(result.foto);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Upload fehlgeschlagen: ${files[i].name}`);
        break;
      }
    }
    onChange([...newFotos, ...fotos]);
    setUploading(false);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDelete(foto: Foto) {
    if (!token) return;
    if (!window.confirm('Foto wirklich löschen?')) return;
    try {
      await api.deleteFoto(token, foto.id);
      onChange(fotos.filter((f) => f.id !== foto.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Fotos ({fotos.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Kategorie-Chips */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            {KATEGORIEN.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKategorie(k.value)}
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors',
                  kategorie === k.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Foto schießen / hochladen */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full"
            size="lg"
          >
            <Camera className="size-5" />
            {uploading
              ? `Lädt hoch… ${uploadProgress?.current}/${uploadProgress?.total}`
              : 'Foto aufnehmen / auswählen'}
          </Button>

          {/* Grid */}
          {fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {fotos.map((foto) => (
                <div key={foto.id} className="relative aspect-square group">
                  <AuthedImage
                    fotoId={foto.id}
                    kind="thumbnail"
                    alt={foto.beschreibung ?? foto.kategorie}
                    className="w-full h-full object-cover rounded-md cursor-pointer"
                    onClick={() => setLightboxFoto(foto)}
                  />
                  <button
                    type="button"
                    onClick={() => handleDelete(foto)}
                    className="absolute top-1 right-1 size-7 rounded-full bg-black/60 text-white flex items-center justify-center active:bg-black/80"
                    aria-label="Foto löschen"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                  <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white rounded px-1.5 py-0.5">
                    {foto.kategorie}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox */}
      {lightboxFoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightboxFoto(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxFoto(null)}
            className="absolute top-4 right-4 size-10 rounded-full bg-white/10 text-white flex items-center justify-center"
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
          <AuthedImage
            fotoId={lightboxFoto.id}
            kind="file"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </>
  );
}