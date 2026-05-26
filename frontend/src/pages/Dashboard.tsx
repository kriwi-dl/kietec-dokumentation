import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import logoUrl from '@/assets/logo.png';

export function Dashboard() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen p-4 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between py-2">
        <img src={logoUrl} alt="KieTec" className="h-10 object-contain" />
        <Button variant="outline" size="sm" onClick={logout}>Abmelden</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Willkommen, {user?.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Eingeloggt als <strong>{user?.email}</strong>
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Rolle: <strong>{user?.role}</strong>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phase 1 ✓</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Auth-Flow steht. Phase 2 baut die Auftragsliste hier rein.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}