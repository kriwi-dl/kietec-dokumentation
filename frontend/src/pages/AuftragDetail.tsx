import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AuftragDetail() {
  const { id } = useParams();
  return (
    <div className="min-h-screen p-4 max-w-md mx-auto space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/">
          <ChevronLeft className="size-4" />
          Zurück
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Auftrag {id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Detail-Ansicht kommt in Phase 3. Hier werden Positionen, Fotos und Dokus angezeigt.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}