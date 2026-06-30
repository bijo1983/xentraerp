'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth-store';

export default function SettingsPage() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Settings</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name: </span>
            {user?.full_name}
          </p>
          <p>
            <span className="text-muted-foreground">Email: </span>
            {user?.email}
          </p>
          <p>
            <span className="text-muted-foreground">Roles: </span>
            {user?.roles?.join(', ')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
